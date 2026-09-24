-- CrewCatch AI — runtime RLS isolation tests (pgTAP)
--
-- WHY THIS EXISTS
-- `npm run check:rls` proves the POLICIES EXIST. It cannot prove they BEHAVE.
-- A policy with an inverted condition still exists, still passes a structural
-- check, and silently leaks every tenant's leads. These tests execute the
-- policies as different authenticated users and assert both the allow and
-- the deny case.
--
-- The third identity — a NON-MEMBER — is the one that matters. Owner and
-- member rows are supposed to be visible; a stranger's are not. A test suite
-- that only checks the happy path proves nothing about isolation.
--
-- RUN:  supabase test db
--       (cannot execute in this environment: no Postgres/Docker available)

begin;

select plan(27);

-- ---------------------------------------------------------------- fixtures
-- Three identities: two contractors who must not see each other, and a
-- signed-out client. Each gets a contractor row and a private lead.
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'owner-b@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'stranger@example.com');

insert into public.contractors (id, name, slug, primary_trade, tier)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Alpha HVAC', 'alpha-hvac', 'hvac', 'emergency'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Beta Plumbing', 'beta-plumbing', 'plumbing', 'emergency');

insert into public.contractor_users (contractor_id, user_id, role)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'owner');

insert into public.calls (id, contractor_id, external_call_id, started_at, ended_at)
values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'ext-a1', now(), now()),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'ext-b1', now(), now());

insert into public.leads (id, contractor_id, call_id, name, phone, intent, urgency, issue)
values
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000001', 'Alpha Caller', '5550000001', 'emergency', 'critical', 'No heat'),
  ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'cccccccc-0000-4000-8000-000000000002', 'Beta Caller', '5550000002', 'emergency', 'critical', 'Burst pipe');

-- ------------------------------------------------------------------ helpers
-- Act as a specific signed-in user. The role + claim pair is what PostgREST
-- sends, so policies evaluate against the same state the API would produce.
create or replace function tests.act_as(uid uuid)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('role', 'authenticated', true);
$$;

create or replace function tests.act_as_anon()
returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true),
         set_config('role', 'anon', true);
$$;

-- =================================================== 1. own-rows visibility
select tests.act_as('11111111-1111-4111-8111-111111111111');

select is(
  (select count(*) from public.leads)::int, 1,
  'owner sees exactly their own lead'
);

select is(
  (select name from public.leads)::text, 'Alpha Caller',
  'owner sees their own lead content'
);

select is(
  (select count(*) from public.contractors)::int, 1,
  'owner sees exactly their own contractor'
);

-- ================================================= 2. cross-tenant isolation
-- The assertion that matters. A failure here means one contractor can read
-- another contractor''s customers.
select is(
  (select count(*) from public.leads where name = 'Beta Caller')::int, 0,
  'owner CANNOT see another contractor''s lead'
);

select is(
  (select count(*) from public.calls where external_call_id = 'ext-b1')::int, 0,
  'owner CANNOT see another contractor''s call'
);

select is(
  (select count(*) from public.contractors where name = 'Beta Plumbing')::int, 0,
  'owner CANNOT see another contractor entity'
);

-- A write to another tenant's row must be refused.
select throws_ok(
  $$update public.leads set name = 'hijacked'
     where id = 'dddddddd-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'owner cannot UPDATE another contractor''s lead'
);

select throws_ok(
  $$delete from public.leads where id = 'dddddddd-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'owner cannot DELETE another contractor''s lead'
);

select throws_ok(
  $$insert into public.leads (contractor_id, name, phone, intent, urgency, issue)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'injected', '5559999999', 'estimate', 'low', 'spoofed')$$,
  '42501',
  null,
  'owner cannot INSERT into another contractor namespace'
);

-- The row must be intact after the refused writes.
select is(
  (select name from public.leads where id = 'dddddddd-0000-4000-8000-000000000002')::text,
  'Beta Caller',
  'victim lead unchanged after refused writes'
);

-- ========================================================= 3. signed out
select tests.act_as_anon();

select is(
  (select count(*) from public.leads)::int, 0,
  'anonymous client sees no leads'
);

select is(
  (select count(*) from public.contractors)::int, 0,
  'anonymous client sees no contractors'
);

-- ================================================ 4. non-member user
-- Distinct from anonymous: an AUTHENTICATED stranger is the more realistic
-- threat, and owner-only tests do not cover it.
select tests.act_as('33333333-3333-4333-8333-333333333333');

select is(
  (select count(*) from public.leads)::int, 0,
  'authenticated non-member sees no leads'
);

select is(
  (select count(*) from public.calls)::int, 0,
  'authenticated non-member sees no calls'
);

select is(
  (select count(*) from public.contractors)::int, 0,
  'authenticated non-member sees no contractors'
);

select throws_ok(
  $$update public.contractors set name = 'stolen'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'non-member cannot UPDATE a contractor entity'
);

-- ================================================ 5. own-writes succeed
select tests.act_as('11111111-1111-4111-8111-111111111111');

-- `returning` matters here: lives_ok also passes when zero rows matched, so it
-- cannot distinguish "wrote the row" from "silently did nothing".
select lives_ok(
  $$insert into public.leads (contractor_id, name, phone, intent, urgency, issue)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'New Caller', '5550000003', 'estimate', 'normal', 'Quote')
    returning id$$,
  'owner can INSERT into their own tenant'
);

select is(
  (select count(*) from public.leads where name = 'New Caller')::int, 1,
  'the inserted row is actually visible to its owner'
);

select lives_ok(
  $$update public.leads set urgency = 'high' where name = 'New Caller'
    returning id$$,
  'owner can UPDATE their own lead'
);

select is(
  (select urgency::text from public.leads where name = 'New Caller')::text, 'high',
  'the update actually took effect'
);

-- ================================================ 6. multi-membership
-- A user belonging to two contractors must see only what they selected, and
-- an unselected user must see nothing rather than the first row by accident.
insert into public.contractor_users (contractor_id, user_id, role)
values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'owner');

select tests.act_as('11111111-1111-4111-8111-111111111111');

-- Two memberships and no x-contractor-id header: fail closed.
select is(
  (select count(*) from public.leads)::int, 0,
  'ambiguous membership sees zero rows rather than an arbitrary tenant'
);

-- With an explicit selection, that tenant resolves.
select set_config('request.headers', '{"x-contractor-id":"aaaaaaaa-0000-4000-8000-000000000002"}', true);

select is(
  (select count(*) from public.leads)::int, 1,
  'explicit contractor selection resolves to that tenant'
);

select is(
  (select name from public.leads)::text, 'Beta Caller',
  'selected tenant returns its own data'
);

-- A forged selection for a contractor the user does NOT belong to.
select set_config('request.headers', '{"x-contractor-id":"aaaaaaaa-0000-4000-8000-000000000003"}', true);

select is(
  (select count(*) from public.leads)::int, 0,
  'forged contractor id does not grant access'
);

-- ================================================ 7. RLS is actually forced
select is(
  (select relrowsecurity from pg_class where oid = 'public.leads'::regclass),
  true, 'leads has RLS enabled'
);

select is(
  (select relforcerowsecurity from pg_class where oid = 'public.leads'::regclass),
  true, 'leads has RLS forced (owner cannot bypass)'
);

select is(
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'leads')::int,
  4, 'leads carries all four operation policies'
);

select * from finish();
rollback;
