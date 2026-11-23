// Which tasks to remind about, and the notification text. No imports, so tests/functions.test.mjs runs it under Node.
export type Doc = Record<string, unknown> & { id: string };
type Rec = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v));

/** Date (YYYY-MM-DD) and hour in Amman for an instant. */
export function ammanNow(at: Date | string | number = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
export const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Open tasks due tomorrow that were not reminded for this due date yet; plus tasks due today
 *  whose reminder was missed (they were added late the evening before). Tasks added today for today are skipped. */
export function dueReminders(tasks: Doc[], today: string): Doc[] {
  const tomorrow = addDays(today, 1);
  return tasks.filter((x) => {
    const due = s(x.due);
    if (!due || x.status === "done" || s(x.reminded) === due) return false;
    if (due === tomorrow) return true;
    return due === today && !!x.created && ammanNow(s(x.created)).date < today;
  }).sort((a, b) => s(a.due).localeCompare(s(b.due)) || (s(a.time) || "99").localeCompare(s(b.time) || "99"));
}

export const t12 = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
};
const first = (name: unknown) => s(name).trim().split(/\s+/)[0] || "";
const count = (n: number) => (n === 2 ? "مهمتان" : n <= 10 ? `${n} مهام` : `${n} مهمة`);

/** One notification for the whole run. */
export function reminderMessage(list: Doc[], today: string, people: { employees: Rec; clients: Rec }) {
  const when = (x: Doc) => (s(x.due) === today ? "اليوم" : "غداً");
  const line = (x: Doc) => {
    const c = people.clients[s(x.client_id)] as Rec | undefined, e = people.employees[s(x.employee_id)] as Rec | undefined;
    return [s(x.title), c ? s(c.name) : "", e ? first(e.name) : "", x.time ? "الساعة " + t12(s(x.time)) : ""].filter(Boolean).join(" · ");
  };
  const allSame = list.every((x) => when(x) === when(list[0]));
  let title: string, body: string;
  if (list.length === 1) {
    const x = list[0];
    title = `تذكير: مهمة موعدها ${when(x)}`;
    const c = people.clients[s(x.client_id)] as Rec | undefined, e = people.employees[s(x.employee_id)] as Rec | undefined;
    body = [s(x.title), c ? "العميل: " + s(c.name) : "", e ? "المسؤول: " + s(e.name) : "", x.time ? "الساعة " + t12(s(x.time)) : "", x.years ? "السنوات: " + s(x.years) : ""]
      .filter(Boolean).join("\n");
  } else {
    title = `تذكير: ${count(list.length)} ${allSame ? "موعدها " + when(list[0]) : "تقترب مواعيدها"}`;
    const shown = list.slice(0, 6).map((x) => "• " + (allSame ? "" : when(x) + ": ") + line(x));
    if (list.length > 6) shown.push(`و${list.length - 6} أخرى في صفحة المهام`);
    body = shown.join("\n");
  }
  if (body.length > 1500) body = body.slice(0, 1497) + "…";
  return { title, body, tag: "tasks-" + today, url: "./#tasks" };
}
