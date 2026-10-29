// Receives fingerprint punches from the office bridge program (bridge/millennium_bridge.py).
// Auth: header x-bridge-key must equal public.bridge.key (shown and regenerated in the app's settings).
// Body: { device: string, punches: [{ fp_id: "3", ts: "2026-10-27 08:31:22" }], status?: {...} } — an empty list is a heartbeat;
// status (version, connects_today, last_error…) is stored in public.bridge.status for troubleshooting.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-bridge-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const key = req.headers.get("x-bridge-key") ?? "";
  const { data: cfg, error: cfgErr } = await sb.from("bridge").select("key").eq("id", "main").maybeSingle();
  if (cfgErr) return json({ error: "config_unavailable" }, 500);
  if (!cfg || !key || key !== cfg.key) return json({ error: "unauthorized" }, 401);

  let body: { device?: unknown; punches?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const device = String(body?.device ?? "").slice(0, 64);
  const rawStatus = (body as { status?: unknown } | null)?.status;
  const status = rawStatus && typeof rawStatus === "object" && JSON.stringify(rawStatus).length <= 2000 ? rawStatus : null;
  const list = Array.isArray(body?.punches) ? (body!.punches as unknown[]).slice(0, 5000) : [];

  const seen = new Set<string>();
  const rows: { fp_id: string; punched_at: string; source: string; device: string }[] = [];
  for (const raw of list) {
    const p = raw as { fp_id?: unknown; ts?: unknown };
    const fp = String(p?.fp_id ?? "").trim().replace(/^0+(?=\d)/, "");
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(p?.ts ?? ""));
    if (!/^\d{1,12}$/.test(fp) || !m) continue;
    const at = `${m[1]} ${m[2]}:00`;
    if (seen.has(fp + at)) continue;
    seen.add(fp + at);
    rows.push({ fp_id: fp, punched_at: at, source: "device", device });
  }

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await sb
      .from("punches")
      .upsert(rows, { onConflict: "fp_id,punched_at", ignoreDuplicates: true })
      .select("id");
    if (error) return json({ error: error.message }, 500);
    inserted = data?.length ?? 0;
  }
  await sb.from("bridge").update({ last_seen: new Date().toISOString(), device, ...(status ? { status } : {}) }).eq("id", "main");
  return json({ received: rows.length, inserted });
});
