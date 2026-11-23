-- Applied to project millennium-hr on 2026-11-23 (migration "task_reminders").
-- Task reminders: a push notification to the manager's devices the day before a task is due
-- (edge function task-reminders, run hourly by pg_cron), and a calendar link for the employee (edge function task-cal).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- One row. The VAPID key pair is generated inside the edge function on first use, so the private key
-- never leaves the database and the function; cron_key lets only the scheduled job start a reminder run.
create table if not exists private.push_config (
  id text primary key default 'main' check (id = 'main'),
  vapid_public text,
  vapid_private jsonb,
  cron_key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);
insert into private.push_config (id) values ('main') on conflict do nothing;

-- One row per device that turned reminders on (Settings → «تنبيهات المهام على هذا الجهاز»).
create table if not exists public.push_subs (
  endpoint text primary key,
  data jsonb not null,            -- PushSubscription.toJSON(): { endpoint, keys: { p256dh, auth } }
  device text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  last_ok timestamptz,
  last_error text
);
alter table public.push_subs enable row level security;
create policy push_subs_admins_all on public.push_subs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Read and fill the config from the edge function (service role only; the private schema is not exposed).
create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('vapid_public', c.vapid_public, 'vapid_private', c.vapid_private, 'cron_key', c.cron_key)
  from private.push_config c where c.id = 'main';
$$;
create or replace function public.push_config_set_vapid(pub text, priv jsonb)
returns void language sql security definer set search_path = '' as $$
  update private.push_config set vapid_public = pub, vapid_private = priv, updated_at = now()
  where id = 'main' and vapid_public is null;   -- never replaced: devices are subscribed against this key
$$;
-- Stamp a task as reminded for its current due date, without touching anything else in it.
create or replace function public.task_mark_reminded(tid text, due text)
returns void language sql security definer set search_path = '' as $$
  update public.tasks set data = jsonb_set(data, '{reminded}', to_jsonb(due)), updated_at = now()
  where id = tid and data ->> 'due' = due;
$$;
revoke all on function public.push_config() from public, anon, authenticated;
revoke all on function public.push_config_set_vapid(text, jsonb) from public, anon, authenticated;
revoke all on function public.task_mark_reminded(text, text) from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.push_config_set_vapid(text, jsonb) to service_role;
grant execute on function public.task_mark_reminded(text, text) to service_role;

-- Every hour from 08:05 to 21:05 Amman time (UTC+3); the function sends at the hour set in the app (default 9).
select cron.schedule('task-reminders', '5 5-18 * * *', $cron$
  select net.http_post(
    url := 'https://nxhlxwpwpyicyprnsdfp.supabase.co/functions/v1/task-reminders',
    headers := jsonb_build_object('content-type', 'application/json',
                                  'x-cron-key', (select cron_key from private.push_config where id = 'main')),
    body := '{"mode":"run"}'::jsonb,
    timeout_milliseconds := 30000);
$cron$);
