// Push reminders to the manager's devices the day before a task is due.
// Called hourly by pg_cron (migration 20261123000000_task_reminders, header x-cron-key) and by the app (signed-in admin).
// Body { mode }: "key"  → the VAPID public key the app subscribes with (the key pair is made here on first use);
//                "test" → a test notification to { endpoint } (this device);
//                "run"  → send the reminder for tasks due tomorrow (from the hour in settings.remind_hour, default 9, Amman time).
//                         { dry: true } lists the tasks without sending; { now: true } ignores the hour.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { newVapidKeys, sendPush, type Subscription, type Vapid } from "./webpush.ts";
import { ammanNow, dueReminders, reminderMessage, type Doc } from "./remind.ts";

const SUBJECT = "https://hr.alabed-jo.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type Cfg = { vapid_public: string | null; vapid_private: JsonWebKey | null; cron_key: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: cfg0, error: cfgErr } = await sb.rpc("push_config");
  if (cfgErr || !cfg0) return json({ error: "config_unavailable" }, 500);
  let cfg = cfg0 as Cfg;

  // Who is calling: the scheduled job (its key), or a signed-in user listed in app_admins.
  const cronKey = req.headers.get("x-cron-key") ?? "";
  let allowed = !!cronKey && cronKey === cfg.cron_key;
  if (!allowed) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = token ? await sb.auth.getUser(token) : { data: null };
    const email = String(u?.user?.email ?? "").toLowerCase();
    if (email) {
      const { data: adm } = await sb.from("app_admins").select("email").eq("email", email).maybeSingle();
      allowed = !!adm;
    }
  }
  if (!allowed) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode = String(body.mode ?? "");

  async function vapid(): Promise<Vapid> {
    if (!cfg.vapid_public || !cfg.vapid_private) {
      const k = await newVapidKeys();
      await sb.rpc("push_config_set_vapid", { pub: k.publicKey, priv: k.privateJwk });
      const again = await sb.rpc("push_config");   // another call may have made the pair first; use the stored one
      cfg = again.data as Cfg;
    }
    return { publicKey: cfg.vapid_public!, privateJwk: cfg.vapid_private!, subject: SUBJECT };
  }

  // Send one notification to the given devices; forget devices the push service no longer knows.
  async function deliver(subs: { endpoint: string; data: Subscription }[], msg: unknown) {
    const v = await vapid();
    return await Promise.all(subs.map(async (row) => {
      let r: { status: number; text: string };
      try { r = await sendPush(row.data, msg, v); } catch (e) { r = { status: 0, text: String(e) }; }
      const ok = r.status >= 200 && r.status < 300;
      if (r.status === 404 || r.status === 410) await sb.from("push_subs").delete().eq("endpoint", row.endpoint);
      else await sb.from("push_subs").update(ok ? { last_ok: new Date().toISOString(), last_error: null } : { last_error: `${r.status} ${r.text}`.slice(0, 300) }).eq("endpoint", row.endpoint);
      return { host: new URL(row.endpoint).host, status: r.status, ok };
    }));
  }

  if (mode === "key") return json({ key: (await vapid()).publicKey });

  if (mode === "test") {
    const endpoint = String(body.endpoint ?? "");
    const { data: subs } = await sb.from("push_subs").select("endpoint,data").eq("endpoint", endpoint);
    if (!subs?.length) return json({ error: "not_subscribed" }, 404);
    const res = await deliver(subs, { title: "تجربة تنبيه المهام", body: "هكذا يصلك التذكير قبل موعد المهمة بيوم.", tag: "test", url: "./#config" });
    return json({ results: res, ok: res.some((r) => r.ok) });
  }

  if (mode === "run") {
    const now = ammanNow();
    const { data: st } = await sb.from("settings").select("data").eq("id", "main").maybeSingle();
    const hour = Number((st?.data as Record<string, unknown> | undefined)?.remind_hour ?? 9);
    if (now.hour < hour && !body.now) return json({ skipped: "before_hour", hour, now });

    const tomorrow = new Date(Date.parse(now.date + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
    const { data: rows, error } = await sb.from("tasks").select("id,data").in("data->>due", [now.date, tomorrow]);
    if (error) return json({ error: "tasks_unavailable" }, 500);
    const list = dueReminders((rows ?? []).map((r) => ({ id: r.id, ...(r.data as Record<string, unknown>) }) as Doc), now.date);
    if (!list.length) return json({ tasks: 0, now });

    const ids = (k: string) => [...new Set(list.map((x) => String(x[k] ?? "")).filter(Boolean))];
    const [emps, cls] = await Promise.all([
      sb.from("employees").select("id,data").in("id", ids("employee_id").length ? ids("employee_id") : ["-"]),
      sb.from("clients").select("id,data").in("id", ids("client_id").length ? ids("client_id") : ["-"]),
    ]);
    const byId = (r: { data: { id: string; data: unknown }[] | null }) => Object.fromEntries((r.data ?? []).map((x) => [x.id, x.data]));
    const msg = reminderMessage(list, now.date, { employees: byId(emps), clients: byId(cls) });
    if (body.dry) return json({ tasks: list.length, ids: list.map((x) => x.id), msg, now });

    const { data: subs } = await sb.from("push_subs").select("endpoint,data");
    if (!subs?.length) return json({ tasks: list.length, devices: 0 });  // not stamped: sent once a device turns reminders on
    const res = await deliver(subs, msg);
    if (res.some((r) => r.ok)) await Promise.all(list.map((x) => sb.rpc("task_mark_reminded", { tid: x.id, due: String(x.due) })));
    return json({ tasks: list.length, devices: subs.length, results: res });
  }

  return json({ error: "bad_mode" }, 400);
});
