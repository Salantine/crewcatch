-- CrewCatch AI — 0002: decouple contractor identity from auth user
--
-- WHY
-- 0001 declared `contractors.id references auth.users(id)`, which makes a
-- contractor and a login the same row: one user can own exactly one
-- contractor, ever. But the schema also ships `contractor_users` as a
-- many-to-many membership table, and `current_contractor_id()` resolved the
-- caller's contractor with `ORDER BY created_at LIMIT 1` — picking an
-- arbitrary contractor when a user holds several.
--
-- That combination is a real leak, not just untidy modelling: a user who
-- belongs to two entities could be silently shown the wrong one's leads,
-- with no error anywhere. The MVP explicitly anticipates the multi-entity
-- case ("an owner running two businesses"), so the 1:1 constraint has to go
-- before any stage writes tenant data.
--
-- After this migration:
--   * contractors owns its identity (gen_random_uuid)
--   * contractor_users is the real membership table
--   * a user with one membership  -> that contractor, automatically
--   * a user with several         -> must select, and an unselected or
--                                    unverifiable selection returns NULL,
--                                    which RLS turns into zero visible rows
--                                    (fail closed, never fail open)

begin;

-- ---------------------------------------------------------------- 1. backfill
-- Membership rows must exist BEFORE ids are reassigned, because the old id IS
-- the auth user's id — that is the mapping from login to contractor.

insert into public.contractor_users (contractor_id, user_id, role)
select c.id, c.id, 'owner'
from public.contractors c
on conflict do nothing;

-- The membership table could contain duplicates if this migration is re-run.
create unique index if not exists contractor_users_contractor_user_uniq
  on public.contractor_users (contractor_id, user_id);

-- ---------------------------------------------------------------- 2. free ids
-- ON UPDATE CASCADE lets the id change propagate to every tenant table in one
-- statement instead of six separate UPDATEs that can half-apply.

do $$
declare
  fk record;
begin
  for fk in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.contractors'::regclass
  loop
    execute format(
      'alter table %s drop constraint %I', fk.tbl, fk.conname
    );
    execute format(
      'alter table %s add constraint %I foreign key (contractor_id)
         references public.contractors(id) on delete cascade on update cascade',
      fk.tbl, fk.conname
    );
  end loop;
end $$;

-- Drop the auth.users foreign key. The login link now lives in
-- contractor_users, which is the only place it should be.

alter table public.contractors drop constraint if exists contractors_id_fkey;

-- Give every existing contractor a fresh identity. ON UPDATE CASCADE above
-- moves every child row to follow it, so no tenant data is orphaned.

update public.contractors set id = gen_random_uuid();

alter table public.contractors
  alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------- 3. slug
-- A stable, human-readable handle for the admin surface and for routing,
-- without leaking a UUID into a URL.

alter table public.contractors add column if not exists slug text;

update public.contractors
set slug = lower(
  trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
)
where slug is null;

-- Empty slugs (a name of only punctuation) get a generated fallback.
update public.contractors
set slug = 'contractor-' || substr(id::text, 1, 8)
where slug is null or slug = '';

create unique index if not exists contractors_slug_uniq on public.contractors (slug);

-- ---------------------------------------------------------------- 4. resolution
-- Replaces the ordering-and-single-row version. Returns NULL — never an
-- arbitrary row — when the caller's membership is ambiguous.

create or replace function public.current_contractor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_single uuid;
  v_requested uuid;
  v_headers json;
begin
  select count(*), min(cu.contractor_id)
    into v_count, v_single
  from public.contractor_users cu
   where cu.user_id = auth.uid();

  -- Not signed in, or no membership: nothing is visible.
  if v_count is null or v_count = 0 then
    return null;
  end if;

  -- Unambiguous: the common case, and it needs no client cooperation.
  if v_count = 1 then
    return v_single;
  end if;

  -- Ambiguous: accept an explicit selection, but ONLY after verifying the
  -- caller actually belongs to it. A forged x-contractor-id header resolves
  -- to another user's rows here; it does not, because the exists() check
  -- below runs against contractor_users for auth.uid().
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    begin
      v_requested := nullif(v_headers ->> 'x-contractor-id', '')::uuid;
    exception when others then
      v_requested := null;
    end;

    if v_requested is not null and exists (
      select 1 from public.contractor_users cu
       where cu.user_id = auth.uid() and cu.contractor_id = v_requested
    ) then
      return v_requested;
    end if;
  end if;

  -- Ambiguous and unselected. Returning NULL makes every
  -- `contractor_id = current_contractor_id()` policy evaluate to NULL, which
  -- is not true, which means zero rows. The portal detects the ambiguity and
  -- shows a switcher; it never renders another entity's data by accident.
  return null;
end;
$$;

-- Membership count, so the app can tell "no rows" apart from "pick one".
create or replace function public.contractor_memberships()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cu.contractor_id
  from public.contractor_users cu
  where cu.user_id = auth.uid()
  order by cu.created_at
$$;

-- ---------------------------------------------------------------- 5. policies

drop policy if exists contractors_select on public.contractors;
drop policy if exists contractors_update on public.contractors;

-- Identity check is gone; membership is the only relationship.
create policy contractors_select on public.contractors
  for select using (id = public.current_contractor_id() or is_contractor_member(id));

-- A member may edit their own entity. `is_contractor_member` is the same
-- predicate the select policy uses, so a user can never update a row they
-- cannot see.
create policy contractors_update on public.contractors
  for update using (is_contractor_member(id))
  with check (is_contractor_member(id));

-- --------------------------------------------------------- 6. SLA telemetry
-- The 30-second dispatch promise is a headline claim. Measuring it requires
-- a timestamp of when the alert actually left, not just when it was queued.

alter table public.dispatch_events
  add column if not exists dispatched_at timestamptz;

-- Hot path: "show me dispatches for this lead, newest first".
create index if not exists idx_dispatch_lead_created
  on public.dispatch_events (lead_id, created_at desc);

-- Overage billing reads by (contractor, period); the unique constraint already
-- indexes the pair, but the partial index keeps period scans off other rows.
create index if not exists idx_usage_contractor_period
  on public.usage_records (contractor_id, period_start desc);

commit;
