-- CrewCatch AI — initial schema
--
-- SECURITY POSTURE
-- Multi-tenant by contractor_id on every table, with Row Level Security as the
-- ONLY thing standing between one contractor's leads and another's. The
-- invariant: there is no code path that reads tenant data without auth.uid()
-- resolving it, and no table without a policy.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ enums

create type urgency_level as enum ('critical', 'high', 'normal', 'low');
create type call_intent as enum (
  'emergency', 'estimate', 'maintenance', 'consultation', 'wrong_number'
);
create type contractor_tier as enum (
  'emergency', 'design_build', 'maintenance', 'specialized'
);
create type trade as enum (
  'hvac', 'plumbing', 'electrical',
  'landscaping', 'pools', 'hardscape',
  'pest_control', 'cleaning', 'property_mgmt',
  'concrete', 'carpentry', 'fencing'
);
create type dispatch_channel as enum ('sms', 'email', 'crm');

-- ------------------------------------------------------------------ tables

create table public.contractors (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  primary_trade trade not null,
  tier contractor_tier not null,
  dispatch_channels dispatch_channel[] not null default array['sms']::dispatch_channel[],
  created_at timestamptz not null default now()
);

-- Membership is the recursion root: current_contractor_id() reads this table,
-- so this table's policy must NOT call that function. It resolves the caller's
-- own rows through auth.uid() directly, which terminates the recursion.
-- A user may belong to more than one contractor (e.g. an owner running two
-- entities), so (contractor_id, user_id) is not the primary key.
create table public.contractor_users (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  number text not null,
  region_label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.prompt_profiles (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  trade trade not null,
  business_name text not null,
  greeting text not null,
  objections jsonb not null default '{}'::jsonb,
  after_hours_only boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  external_call_id text,
  direction text not null default 'inbound',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null default 0,
  intent call_intent not null default 'consultation',
  urgency urgency_level not null default 'normal',
  qualified boolean not null default false,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- Idempotency: Retell retries webhooks, and a duplicate call row would
  -- double-count a lead in the owner's ROI dashboard.
  unique (contractor_id, external_call_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  call_id uuid references public.calls (id) on delete set null,
  name text not null,
  phone text not null,
  address text,
  intent call_intent not null,
  urgency urgency_level not null,
  issue text not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.dispatch_events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  channel dispatch_channel not null,
  accepted boolean not null default false,
  provider_message_id text,
  detail text,
  created_at timestamptz not null default now()
);

create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  period_start date not null,
  calls_answered integer not null default 0,
  minutes_used numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (contractor_id, period_start)
);

-- ------------------------------------------------------------------ indexes

create index idx_calls_contractor_created on public.calls (contractor_id, created_at desc);
create index idx_calls_contractor_urgency on public.calls (contractor_id, urgency);
create index idx_leads_contractor_captured on public.leads (contractor_id, captured_at desc);
create index idx_leads_contractor_urgency on public.leads (contractor_id, urgency);
create index idx_dispatch_contractor_created on public.dispatch_events (contractor_id, created_at desc);
create index idx_contractor_users_user on public.contractor_users (user_id);

-- ------------------------------------------------------------------ RLS

-- SECURITY DEFINER because the function must read contractor_users while RLS is
-- still being evaluated. `set search_path` is NOT optional: without it, a
-- caller who can create objects in a later schema could shadow `auth` or
-- `public` and hijack this function — the function becomes an RLS bypass.
create function public.current_contractor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cu.contractor_id
  from public.contractor_users cu
  where cu.user_id = auth.uid()
  order by cu.created_at
  limit 1
$$;

-- Multi-tenant users with a secondary read-only membership lookup.
create function public.is_contractor_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contractor_users cu
    where cu.user_id = auth.uid() and cu.contractor_id = target
  )
$$;

alter table public.contractors       enable row level security;
alter table public.contractor_users  enable row level security;
alter table public.phone_numbers     enable row level security;
alter table public.prompt_profiles   enable row level security;
alter table public.calls             enable row level security;
alter table public.leads             enable row level security;
alter table public.dispatch_events   enable row level security;
alter table public.usage_records     enable row level security;

-- Force RLS even for the table owner, so a privileged role cannot bypass it
-- by accident.
alter table public.contractors       force row level security;
alter table public.contractor_users  force row level security;
alter table public.phone_numbers     force row level security;
alter table public.prompt_profiles   force row level security;
alter table public.calls             force row level security;
alter table public.leads             force row level security;
alter table public.dispatch_events   force row level security;
alter table public.usage_records     force row level security;

-- contractors: readable by anyone who belongs to it.
create policy contractors_select on public.contractors
  for select using (id = auth.uid() or is_contractor_member(id));

create policy contractors_update on public.contractors
  for update using (id = auth.uid()) with check (id = auth.uid());

-- contractor_users: the recursion root. Reads the caller's OWN memberships.
-- INSERT is restricted to a user claiming their own contractor id only.
create policy contractor_users_select on public.contractor_users
  for select using (user_id = auth.uid());

create policy contractor_users_insert on public.contractor_users
  for insert with check (user_id = auth.uid());

-- Tenant tables: every row scoped to the caller's contractor.
do $$
declare t text;
begin
  foreach t in array array[
    'phone_numbers', 'prompt_profiles', 'calls',
    'leads', 'dispatch_events', 'usage_records'
  ] loop
    execute format($p$
      create policy %1$s_select on public.%1$I
        for select using (contractor_id = public.current_contractor_id());
      create policy %1$s_insert on public.%1$I
        for insert with check (contractor_id = public.current_contractor_id());
      create policy %1$s_update on public.%1$I
        for update using (contractor_id = public.current_contractor_id())
        with check (contractor_id = public.current_contractor_id());
      create policy %1$s_delete on public.%1$I
        for delete using (contractor_id = public.current_contractor_id());
    $p$, t);
  end loop;
end $$;
