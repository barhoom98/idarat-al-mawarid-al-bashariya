-- Applied to project millennium-hr on 2026-10-27 (migration "hr_core_schema").
create table public.app_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

create table public.settings        (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.employees       (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.leaves          (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.clients         (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.tasks           (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.payroll         (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.attendance_days (date date primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());

create table public.punches (
  id bigint generated always as identity primary key,
  fp_id text not null,
  punched_at timestamp not null,
  source text not null default 'import' check (source in ('import', 'device', 'manual')),
  device text,
  created_at timestamptz not null default now(),
  unique (fp_id, punched_at)
);
create index punches_punched_at_idx on public.punches (punched_at);

create table public.bridge (
  id text primary key default 'main',
  key text not null,
  last_seen timestamptz,
  device text,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['settings','employees','leaves','clients','tasks','payroll','attendance_days','bridge'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['settings','employees','leaves','clients','tasks','payroll','attendance_days','punches','bridge','app_admins'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['settings','employees','leaves','clients','tasks','payroll','attendance_days','punches','bridge'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admins_all', t);
  end loop;
end $$;

create policy app_admins_read on public.app_admins for select to authenticated using ((select public.is_admin()));

alter publication supabase_realtime add table public.punches, public.employees, public.leaves, public.clients, public.tasks, public.payroll, public.settings, public.attendance_days, public.bridge;

insert into public.bridge (id, key) values ('main', encode(extensions.gen_random_bytes(18), 'hex'));

-- Follow-up migration "move_is_admin_to_private_schema": keep the helper out of the public API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_admin() set schema private;
