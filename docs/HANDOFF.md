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
   - the payslip using the same print/PDF preview as the leave form;
   - moving `start_date` earlier to report on older punches.

## How to work on it

- **Database:** the Supabase connector from claude.ai (project `nxhlxwpwpyicyprnsdfp`). Read with SQL before writing. The owner confirms destructive statements.
- **Deploy:** commit and push to `main`. GitHub Pages publishes in about a minute; check with `gh run list`. Bump `APP_VERSION` and `CACHE` for every change to the app's files.
- **Edge function:** `supabase/functions/punch-ingest`, deployed with `verify_jwt=false`. Keep the repo copy identical to what is deployed.
- **Tests before pushing:** `node tests/calc.test.js` (calculations) and `node tests/smoke.js` (every page on desktop and phone, with a stand-in for Supabase). See `tests/README.md`.
