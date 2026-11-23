# Tests

Run them before pushing a change to `index.html` or `supabase/functions`:

```bash
node tests/calc.test.js      # attendance, overtime, field work, fingerprint numbers, and spoken-task sentences (no dependencies)
node tests/functions.test.mjs # edge functions: Web Push encryption and VAPID signature, which tasks get a reminder, the calendar file
node tests/smoke.js [shots]  # every page on a desktop and a phone screen; fails on any JavaScript error,
                             # on a phone page that scrolls sideways, if a voice task does not end in a WhatsApp link
                             # with a calendar link, or if the calendar page (cal.html) does not open
```

`calc.test.js` runs the `/*PURE-START*/ … /*PURE-END*/` block of `index.html` directly. Add a case to it when a calculation rule changes.

`smoke.js` needs Node and Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`). It serves the app from this folder and replaces supabase-js with an in-memory stand-in that holds generic test data, so it never touches the live database. Other CDN requests are blocked during the test, so the exports' real libraries (ExcelJS, html2pdf) are not exercised. Pass a folder name to save a screenshot of every page. Speech recognition is replaced by a stand-in the test feeds sentences into, and the WhatsApp link is checked but never opened.

Use invented names and numbers in tests: the repository is public.
