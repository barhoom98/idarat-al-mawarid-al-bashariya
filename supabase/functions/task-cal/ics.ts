// Calendar file (RFC 5545) for one task, with an alarm the day before. No imports, so tests/functions.test.mjs runs it under Node.
export type CalTask = { id: string; title: string; client?: string; due: string; time?: string; years?: string; notes?: string; employee?: string; company?: string; url?: string };

/** The UTC instant of a wall-clock time in Amman (follows any offset change Intl knows about). */
export function ammanToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  return new Date(naive - offset(naive - offset(naive)));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (s: string) => s.replace(/-/g, "");
const nextDay = (s: string) => new Date(Date.parse(s + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
const text = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space, never inside a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder(), out: string[] = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function taskIcs(t: CalTask, now = new Date()): string {
  const summary = t.title + (t.client ? " — " + t.client : "");
  const desc = [t.client ? "العميل: " + t.client : "", t.years ? "السنوات المطلوبة: " + t.years : "", t.employee ? "المسؤول: " + t.employee : "", t.notes ? "ملاحظات: " + t.notes : "", t.company || ""]
    .filter(Boolean).join("\n");
  const when = t.time
    ? (() => { const a = ammanToUtc(t.due, t.time!); return ["DTSTART:" + stamp(a), "DTEND:" + stamp(new Date(+a + 36e5))]; })()
    : ["DTSTART;VALUE=DATE:" + day(t.due), "DTEND;VALUE=DATE:" + day(nextDay(t.due))];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Millennium HR//Tasks//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + t.id + "@hr.alabed-jo.com",
    "DTSTAMP:" + stamp(now),
    ...when,
    "SUMMARY:" + text(summary),
    desc ? "DESCRIPTION:" + text(desc) : "",
    t.url ? "URL:" + t.url : "",
    // Timed task: the same hour one day earlier. All-day task: 9:00 the day before (its day starts at 00:00).
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + text("تذكير: " + t.title + " — غداً"), "TRIGGER:" + (t.time ? "-P1D" : "-PT15H"), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}
