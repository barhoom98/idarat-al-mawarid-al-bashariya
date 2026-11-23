// One task for the employee in charge: the link in the WhatsApp notice opens cal.html on the company site,
// which reads ?f=json from here and offers ?f=ics to the phone's calendar (alarm the day before).
// GET ?k=<task id>&t=<data.cal_token>&f=json|ics. The token is made by the app when the WhatsApp notice is prepared;
// without it nothing is returned. Only what the WhatsApp message already shows the employee is returned.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { taskIcs } from "./ics.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
const s = (v: unknown) => (v == null ? "" : String(v));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const q = new URL(req.url).searchParams, k = s(q.get("k")), t = s(q.get("t"));
  if (!k || t.length < 16) return json({ error: "not_found" }, 404);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: row } = await sb.from("tasks").select("id,data").eq("id", k).maybeSingle();
  const x = (row?.data ?? {}) as Record<string, unknown>;
  if (!row || s(x.cal_token) !== t || !x.due) return json({ error: "not_found" }, 404);

  const [c, e, st] = await Promise.all([
    x.client_id ? sb.from("clients").select("data").eq("id", s(x.client_id)).maybeSingle() : Promise.resolve({ data: null }),
    x.employee_id ? sb.from("employees").select("data").eq("id", s(x.employee_id)).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("settings").select("data").eq("id", "main").maybeSingle(),
  ]);
  const cd = (c.data?.data ?? {}) as Record<string, unknown>, ed = (e.data?.data ?? {}) as Record<string, unknown>, sd = (st.data?.data ?? {}) as Record<string, unknown>;
  const task = {
    id: k, title: s(x.title), client: s(cd.name), tax_no: s(cd.tax_no), due: s(x.due), time: s(x.time), years: s(x.years), notes: s(x.notes),
    priority: s(x.priority) || "normal", done: x.status === "done", employee: s(ed.name), company: s(sd.company_ar),
  };

  if (q.get("f") === "ics") {
    return new Response(taskIcs({ ...task, url: "https://hr.alabed-jo.com/cal.html?k=" + encodeURIComponent(k) + "&t=" + encodeURIComponent(t) }), {
      headers: { ...cors, "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="task.ics"', "cache-control": "no-store" },
    });
  }
  return json(task);
});
