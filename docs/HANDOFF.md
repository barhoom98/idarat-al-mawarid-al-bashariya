# Handoff — what happened before Claude Code

Millennium HR was built in one long claude.ai conversation (27 Oct – 12 Nov 2026). The owner is moving the work to Claude Code. This file carries that conversation's history, the state of the live system as of 12 Nov 2026, and the open threads. `CLAUDE.md` holds the technical rules. **Check live facts in Supabase before acting on them; they may have changed since.**

This repository is public, so keep salaries, personal details and keys out of it. They live in Supabase.

## Working with the owner

- He writes in Jordanian Arabic. Answer in Arabic: short, plain, with numbered steps and the exact button or menu names. He often sends phone photos of a screen; read them carefully and tell him exactly what to press next.
- **After every change, end the reply with the live link** (see `CLAUDE.md`). Also tell him the new version number (`APP_VERSION`) and to close and reopen the app.
- He prefers that Claude does the work rather than explaining how ("اعملها انتا"). Ask only when the choice is really his.
- He cares about not breaking anything on the office PC or the fingerprint device. Keep the bridge read-only, explain what a step does before he runs it, and always give a way back (`stop_bridge.bat`, `remove_bridge.bat`).
- He uses the app as an installed PWA on his phone and on a desktop. He signs in with the username `ALABED`.

## What was built, in order

The order follows `git log`:

1. A standalone PWA on GitHub Pages and Supabase. It covers attendance, leaves, payroll, clients, tasks and settings, with RLS for admins only.
2. **Clients:** 118 clients imported from the owner's Excel sheet, grouped by the responsible accountant. Each has an even or odd sales-tax cycle (`gst_cycle`), a directorate and a document status. Ids are `cl-<taxno>`.
3. **Exports:** every export uses the same official Excel layout. That means the letterhead with logo, company name, report title, period and RTL. The attendance report is in date order, with one red row for a day off («يوم جمعة»).
4. **Leaves:**
   - The balance carried over is entered "as of" a date (`leave_open_balance`, `leave_open_date`). Annual days ÷ 12 accrue at each month end after that date.
   - The owner's table gave opening balances as of 2026-10-31 for emp-02 to emp-06 and emp-08.
   - A printable A4 leave form on the letterhead offers print or PDF/share. It can open automatically after a leave is added.
5. **Print reliability:** documents open in a preview dialog. The service worker is network-first and the page reloads itself on an update, so installed apps get new versions at once.
6. **Sign-in:** username instead of email (see `CLAUDE.md` → Adding a user).
7. **Client field:** a searchable client picker (`clientPicker`) in the task form and the task filter.
8. **Fingerprint bridge** installed at the office (details below).
9. **Standing field work:** a per-employee field-work period (`field_from` and `field_to`). emp-07 has 2026-10-28 → 2026-12-31.
10. **Several device numbers per employee** (`fp_id` "11, 1"). Presses within 10 minutes count as one.
11. **Settings autosave:** settings save on every change. A ticked box used to be lost unless the button at the bottom was pressed. The SSC cap was set to 2026's JD 3,733.
12. **Bridge:** one long connection; `quiet()` reconnects; back-off on failed connects; an offline queue; status reported to `public.bridge.status`.
13. **Payslips in the print preview** (12 Nov, first Claude Code session, `APP_VERSION` 2026.11.12): «طباعة / PDF» in a payslip and «كشوف الموظفين للطباعة» open the same preview as the leave form instead of downloading an HTML file; all payslips print or save as one PDF, one page per employee. The same change fixed Arabic text in every saved PDF (words had run together, and «:» and brackets sat on the wrong side).

14. **Phone interface, voice tasks, WhatsApp notices** (14 Nov, `APP_VERSION` 2026.11.14). The owner asked for a phone layout with no sideways scrolling and navigation by icons, for dictating tasks (task, employee, date, years), and for a WhatsApp notice to the employee in charge.
    - Phone: icon tab bar at the bottom with the mic in the middle, home tiles with each section's numbers, cards instead of tables on every page, bottom-sheet dialogs. The desktop layout is unchanged apart from icons in the rail and the wider task list.
    - Tasks: new fields `time` and `years`; status and priority change in one press from the card (or two selects on the desktop); the counters above the list are filters.
    - Voice: speech becomes text in the browser, then `parseTaskSpeech()` fills the form for review. Not yet tried on the owner's own phone: ask how the recognition went, and whether his installed app (iPhone or Android) allows the microphone.
    - WhatsApp: opens a ready message to the employee's number; the owner presses send. He was told that fully automatic sending needs the WhatsApp Business API and did not ask for it.

15. **Missing punches filled** (14 Nov, `APP_VERSION` 2026.11.14-2). The owner asked that a missing morning punch count as 8:30 and a missing exit as 5:30, because staff go to clients and don't come back. See `fill_missing` in `CLAUDE.md`. He had been typing these exits in by hand. Nine past days changed from «بصمة ناقصة» to complete; no salary changed (missing days already counted as present, and late deduction is off).

16. **Own address** (18 Nov). The app moved to https://hr.alabed-jo.com/ at the owner's request («alabed» instead of «barhoom98» in the link). The domain and the staff mailboxes (Microsoft 365 Email Plus) are with GoDaddy. Each person had to sign in again at the new address and re-add the home-screen icon.

17. **Income-tax clients and better voice reading** (22 Nov, `APP_VERSION` 2026.11.22). The owner sent «كشف تسليم كشوف التقدير الذاتي للسنة المالية 2025» (18 directorates, 571 rows) and asked for every company, establishment and person not yet in the system, with name and tax number only, so tasks can name them.
    - 454 added (`source` «ملف ضريبة الدخل 2025», no accountant, not sales); the 116 already present as sales clients were left untouched; 572 clients in all.
    - In the sheet, one tax number is given for two different people: both were added, the second with an id ending in `-2`. 9 rows have no tax number (ids `cl-x…`), and one more without a number was skipped as most likely an existing client. The owner was told which (names stay out of this public repo).
    - Voice: the manager opens with «صباح الخير / مساء الخير», which matched «شركة تل الخير». See `VOICE_GREET` and the client rules in `CLAUDE.md`.

18. **Voice: pick, don't suggest** (23 Nov, `APP_VERSION` 2026.11.23). The owner said «شركة خيري وحمادة» and got an extra suggestion of a person sharing one of the names. Now a clear client is picked with no suggestions, and only real look-alikes are offered.

19. **Task reminders** (23 Nov, `APP_VERSION` 2026.11.23-2). The owner asked for a reminder on the phone, with sound, one day before a task is due, and chose both parts offered: a push notification to the manager's devices (Settings → «تذكير المهام», daily at 9:00 by default) and, for the employee in charge, a calendar link in the WhatsApp notice that puts the task in the phone's calendar with an alarm the day before. See «Task reminders» in `CLAUDE.md`. Each device has to be turned on once from Settings; on an iPhone only from the home-screen app. The owner could not find the switch at the bottom of Settings («ما عرفت كيف»), so `2026.11.23-3` added a yellow bar with «تفعيل» on the home and tasks pages and moved the card to the top of Settings. Devices that have it on: `select device, created_at, last_ok, last_error from push_subs;`. To check a run: `select status_code, content from net._http_response order by id desc limit 5;` and `select * from cron.job_run_details order by start_time desc limit 5;`.

20. **Payslip wording** (25 Nov, `APP_VERSION` 2026.11.25). The owner asked for the title «كشف صرف راتب», no «أيام العمل / أيام الحضور» row, and the net salary in figures and in words in Jordanian dinars. Same day the owner asked why emp-02 had overtime (answer: the manual 17:30 exit on Thursday 2026-11-05, open thread 0) and why a bonus (a small amount typed in November's payslip on 8 Nov, no note); neither was changed, awaiting the owner.

21. **Board membership statement** (25 Nov, `APP_VERSION` 2026.11.25-2). The owner asked for a separate statement for the general manager (emp-01), titled «كشف صرف عضوية مجلس إدارة», without hourly wage, with the amount shown as board membership and income tax deducted. The figures the owner gave are in `employees.data.board` (Supabase only). The owner's stated net did not equal amount minus tax; asked which figure is right, awaiting the answer.

## Live system facts (12 Nov 2026)

**Employees** (`emp-01` … `emp-08`):

| Employee | Notes |
|---|---|
| emp-01 | General manager. `active: false`, no `fp_id`. |
| emp-07 | On standing field work until 2026-12-31. |
| emp-08 | `fp_id` "11, 1". |

Other device numbers:

- emp-02 → 2, emp-03 → 3, emp-04 → 5, emp-05 → 7, emp-06 → 10, emp-07 → 4.
- Device users 6, 8, 9, 12 and 13 are former staff whose fingerprints are still on the device. They are not mapped, by design.

**Phones:** WhatsApp numbers are in `employees.data.phone` for emp-02 to emp-08 (emp-07's added on 19 Nov). emp-01 has none (the app asks for the number the first time a notice goes to him).

**Settings:**

- `start_date` is 2026-10-27, so days before it are not evaluated. Punches are stored from 2026-08-29.
- `ded_absence` is on. `ded_late` is currently **off**: the owner had it turned on on 28 Oct, then turned it off himself.
- `ssc_cap` is 3733.
- Holidays: 2026-12-25 and 2027-01-01.

**Payroll:** draft months 2026-10 and 2026-11 exist, and none is locked.

## Office fingerprint setup

**Device**
- ZKTeco "HQ" at `192.168.8.3:4370`, with no comm key.
- 13 users on the device, and its clock is correct.
- The ZKTeco desktop program is installed on the same PC.

**Bridge PC**
- The office laptop that runs the ZKTeco program. It can be switched off or asleep: punches then arrive when it is back, through the full re-sync.
- Folder: `C:\millennium-bridge\millennium-bridge` (nested on purpose; it works).
- Python 3.14.10 from the python.org installer.
- A startup shortcut «Millennium HR Bridge.lnk» sits in the user's Startup folder. `bridge_python.cmd` stores the Python path.

**Installed bridge version:** `2026.10.29` (the `VERSION` constant).

**To update the bridge**
1. Send the owner the new `millennium_bridge.py`.
2. He runs `stop_bridge.bat`.
3. He replaces the file.
4. He runs `start_bridge.bat`.

**For a fresh install**
1. Zip the `bridge/` files together with a `config.ini` (ip 192.168.8.3, key read from `public.bridge.key`) and a `START-HERE.txt`.
2. Send the zip to the owner. Never commit `config.ini` or the key.

**Diagnosing**

The bridge writes its status to `public.bridge.status`:

| Field | What it holds |
|---|---|
| `version` | Bridge version running at the office |
| `connects_today` | 1 is normal |
| `connected_at` | When the current device connection started |
| `last_error`, `last_error_at` | Last device or server error and when it happened |

Edge function logs (`function_edge_logs`, request `content_length`) tell you what each call was:

| `content_length` | Meaning |
|---|---|
| 31 | Heartbeat, every 5 minutes |
| about 74 | A single live punch |
| over 1000 | A full sync, which means a (re)connect |

**Beep history**
- The device beeps whenever its fingerprint reader is reset, as happens on a new connection.
- Reconnecting every 30 minutes was the first cause; it was fixed on 28 Oct.
- On 29 Oct several midday disconnects still beeped. Their cause is unknown; possibly someone opened the ZKTeco program.
- That is why `quiet()` was added. On 12 Nov: 1 connect, no errors.

**Device quirk:** the device sometimes identifies emp-08's finger as device user 1. Every user-1 punch in two months was hers, which is why emp-08 has "11, 1".

## Open threads

0. **Raised with the owner on 14 Nov, no answer yet:**
   - emp-02 on Thursday 2026-11-05 has a manual exit at 17:30, while Thursdays end at 14:30. That pays 3 hours of overtime in November. Is it right?
   - emp-03 on 2026-11-05 has no punch at all, so it counts as an absence and a day is deducted. If he was at a client, mark the day «عمل خارجي».
1. **emp-08's fingerprints, on the device.** The owner was given the steps on 28 Oct but had not confirmed doing them:
   - delete user 1's and user 11's fingerprints only, not the users;
   - re-enroll emp-08 with two fingers;
   - do not "upload users/FP" from the ZKTeco program afterwards.

   Once that's done: if the manager will punch again, set emp-01 `fp_id` back to "1" and emp-08 to "11".
2. **Late-deduction rule.** Today, once lateness passes the 15-minute grace, every minute from the start of the day counts. The owner was offered "only the minutes beyond the grace period" and has not answered.
3. **Offered but not asked for:**
   - a separate SSC-registered wage per employee;
   - leave balances for emp-01 and emp-07;
   - whether emergency leave counts against annual leave;
   - moving `start_date` earlier to report on older punches.

## How to work on it

- **Database:** the Supabase connector from claude.ai (project `nxhlxwpwpyicyprnsdfp`). Read with SQL before writing. The owner confirms destructive statements.
- **Deploy:** commit and push to `main`. GitHub Pages publishes in about a minute; check with `gh run list`. Bump `APP_VERSION` and `CACHE` for every change to the app's files.
- **Edge function:** `supabase/functions/punch-ingest`, deployed with `verify_jwt=false`. Keep the repo copy identical to what is deployed.
- **Tests before pushing:** `node tests/calc.test.js` (calculations) and `node tests/smoke.js` (every page on desktop and phone, with a stand-in for Supabase). See `tests/README.md`.
