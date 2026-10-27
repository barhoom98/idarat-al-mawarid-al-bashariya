# Millennium HR — notes for Claude Code

Internal HR web app for شركة الألفية للخدمات الضريبية والمحاسبية (Amman, Jordan). Arabic, RTL. The owner asks for changes in Arabic; answer in Arabic.

**Owner's standing request:** after every change, end the reply with the live link on its own line: https://barhoom98.github.io/idarat-al-mawarid-al-bashariya/ (the URL never changes; pushing to `main` updates it).

## Stack
- Static single-page app, no build step: `index.html` (all CSS + JS inline), `config.js`, `sw.js`, `manifest.webmanifest`, `icons/`.
- Hosted on GitHub Pages from `main` (root): https://barhoom98.github.io/idarat-al-mawarid-al-bashariya/ — pushing to `main` deploys.
- Backend: Supabase project `millennium-hr` (ref `nxhlxwpwpyicyprnsdfp`, eu-central-1). Client: supabase-js 2.49.4 UMD from jsDelivr (fallbacks in `index.html`).
- After changing `index.html` or other shell files, bump `CACHE` in `sw.js` so installed phones pick up the new version.

## Data model (Supabase, schema public)
- Document tables `(id text pk, data jsonb, updated_at)`: `settings` (row `main`), `employees`, `leaves`, `clients`, `tasks`, `payroll` (id = `YYYY-MM`; `locked`, `rows` snapshot, `adj` per employee).
- `attendance_days (date pk, data jsonb)`: manual corrections only — `data.rec[employeeId] = {in, out, mark: 'field'|'' , note}`.
- `punches (fp_id, punched_at timestamp local Amman time, source import|device|manual, unique(fp_id, punched_at))`: raw fingerprint events. Employees map via `employees.data.fp_id`.
- `bridge (id 'main', key, last_seen, device)`: office bridge key + heartbeat.
- `app_admins (email)`: who may use the app. RLS on every table: `private.is_admin()` (JWT email in app_admins).
- Realtime publication includes all of the above; the app subscribes to `postgres_changes` on schema public.

## Adding a user
1. Create the auth user (Supabase dashboard → Authentication → Add user, with "Auto confirm"), or SQL insert into `auth.users` + `auth.identities` with empty-string token columns.
2. `insert into public.app_admins (email) values ('lowercase@email');`

## Fingerprint
- Edge function `punch-ingest` (`supabase/functions/punch-ingest`, verify_jwt=false): checks header `x-bridge-key` against `bridge.key`, upserts punches, updates heartbeat.
- `bridge/millennium_bridge.py`: Windows office PC, pyzk (ZKTeco, port 4370), live_capture + 30-min full re-sync, heartbeat every 5 min.
- Files can also be imported in the app (attlog.dat / TXT / CSV / Excel).

## Calculation rules (in the `/*PURE-START*/` block of index.html)
- Work schedule per weekday in settings (JS getUTCDay: 0=Sun … 6=Sat). Default Sat–Wed 08:30–17:30, Thu 08:30–14:30, Fri off.
- Late = minutes after start when beyond `grace` (15). Overtime = minutes after end ≥ `ot_min`, paid at `ot_rate` 1.25; any work on an off day/holiday paid at `ot_rate_off` 1.5 (Jordan Labour Law art. 59).
- Hourly wage = basic ÷ `day_divisor` (30) ÷ `hour_divisor` (8). SSC 7.5% employee / 14.25% employer on (basic + allowances) capped at `ssc_cap`.
- Days before `settings.start_date` or an employee's `hire_date` are not evaluated.
- Money is JOD with 3 decimals (fils).

## Never commit
`bridge/config.ini`, `bridge/state.json`, `bridge/bridge.log`, any service-role key, or the bridge key.
