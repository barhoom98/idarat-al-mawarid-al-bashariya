// Browser smoke test: loads the app against an in-memory stand-in for Supabase (no network, generic test data),
// opens every page on a desktop and a phone screen, and fails on any JavaScript error.
// Run: node tests/smoke.js [screenshots-folder]      Needs Node and Playwright with Chromium (npm i -D playwright; npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), outDir = process.argv[2] || '';
const stub = `(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const T = { app_admins: [{ email: 'alabed@users.millennium-hr.invalid' }], settings: [{ id: 'main', data: { start_date: '2026-10-01', holidays: [{ date: '2026-10-21', name: 'عطلة تجريبية' }] } }],
    employees: [], leaves: [{ id: 'l1', data: { employee_id: 'emp-05', type: 'annual', status: 'pending', start: '2026-11-08', end: '2026-11-10', days: 3, note: '' } }],
    clients: [{ id: 'c1', data: { name: 'مؤسسة تجريبية للتجارة', kind: 'est', tax_no: '12345678', employee_id: 'emp-02', sales_tax: true, fee: 150 } }],
    tasks: [{ id: 't1', data: { title: 'إقرار ضريبة المبيعات لشهري 9–10', client_id: 'c1', employee_id: 'emp-02', category: 'إقرار ضريبة المبيعات', due: '2026-10-25', priority: 'high', status: 'progress', recur: 'bimonthly' } }],
    payroll: [], attendance_days: [{ date: '2026-10-26', data: { rec: { 'emp-03': { mark: 'field', note: 'مهمة خارجية' } } } }], punches: [], bridge: [{ id: 'main', key: 'abc123', last_seen: new Date(Date.now() - 120000).toISOString(), device: 'office' }] };
  const names = ['المدير العام','موظف أول','موظف ثانٍ','موظف ثالث','موظفة رابعة','موظفة خامسة','موظفة سادسة'];
  names.forEach((n, i) => T.employees.push({ id: 'emp-0' + (i + 1), data: { annual_days: i === 1 ? 21 : 14, leave_open_balance: i === 1 ? 27 : 0, leave_open_date: '2026-10-31', name: n, title: i ? 'محاسب' : 'المدير العام', phone: i === 6 ? '' : '+962 7 9000 000' + (i + 1), fp_id: String(i + 1), basic_salary: [1000,600,600,600,500,500,500][i], allowances: 30, ssc: true, track: true, active: true, order: i + 1, hire_date: '2022-03-01' } }));
  T.employees[6].data.field_from = '2026-10-28'; T.employees[6].data.field_to = '2026-12-31';
  let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let d = 1; d <= 27; d++) { const ds = '2026-10-' + pad(d); const dw = new Date(ds + 'T00:00:00Z').getUTCDay(); if (dw === 5 && d !== 23) continue;
    for (let i = 1; i <= 7; i++) { if (rnd() < 0.05) continue; const a = 8 * 60 + 15 + Math.floor(rnd() * 32); const end = dw === 4 ? 870 : 1050; const b = end + Math.floor(rnd() * 70) - 10;
      T.punches.push({ fp_id: String(i), punched_at: ds + ' ' + pad(Math.floor(a / 60)) + ':' + pad(a % 60) + ':00', source: 'device' });
      if (d < 27) T.punches.push({ fp_id: String(i), punched_at: ds + ' ' + pad(Math.floor(b / 60)) + ':' + pad(b % 60) + ':00', source: 'device' }); } }
  function Q(table) { this.t = table; this.f = []; this.r = null; this.single = false; this.op = 'select'; }
  Q.prototype.select = function () { return this; };
  Q.prototype.eq = function (k, v) { this.f.push((x) => (x[k] ?? (x.data && x.data[k])) === v); return this; };
  Q.prototype.gte = function (k, v) { this.f.push((x) => String(x[k]) >= v); return this; };
  Q.prototype.lte = function (k, v) { this.f.push((x) => String(x[k]) <= v); return this; };
  Q.prototype.order = function () { return this; };
  Q.prototype.range = function (a, b) { this.r = [a, b]; return this; };
  Q.prototype.maybeSingle = function () { this.single = true; return this; };
  Q.prototype.upsert = function (rows) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; };
  Q.prototype.update = function (v) { this.op = 'update'; this.val = v; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.then = function (res, rej) {
    const tb = (T[this.t] = T[this.t] || []);
    let out;
    if (this.op === 'upsert') { this.rows.forEach((r) => { const k = r.id ?? r.date; const i = tb.findIndex((x) => (x.id ?? x.date) === k && k != null); if (i >= 0) tb[i] = r; else tb.push(r); }); out = { data: this.rows, error: null }; }
    else if (this.op === 'update') { tb.filter((x) => this.f.every((f) => f(x))).forEach((x) => Object.assign(x, this.val)); out = { data: null, error: null }; }
    else if (this.op === 'delete') { T[this.t] = tb.filter((x) => !this.f.every((f) => f(x))); out = { data: null, error: null }; }
    else { let d = tb.filter((x) => this.f.every((f) => f(x))); if (this.r) d = d.slice(this.r[0], this.r[1] + 1); out = { data: this.single ? d[0] || null : d, error: null }; }
    return Promise.resolve(JSON.parse(JSON.stringify(out))).then(res, rej);
  };
  const session = { user: { id: 'u1', email: window.__oldEmail ? 'old@example.com' : 'alabed@users.millennium-hr.invalid' } }; const fresh = { user: { id: 'u1', email: 'alabed@users.millennium-hr.invalid' } };
  const client = { from: (t) => new Q(t), channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    auth: { getSession: async () => ({ data: { session: window.__loggedOut ? null : session } }), refreshSession: async () => { window.__refreshed = true; return { data: { session: fresh }, error: null }; }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: async (c) => { window.__signedWith = c.email; return { data: { session: fresh }, error: null }; }, signOut: async () => ({}), updateUser: async () => ({ error: null }) } };

  window.__xl = { merges: [], rows: {} };
  function Cell(sh, r, c) { this.sh = sh; this.r = r; this.c = c; }
  Object.defineProperty(Cell.prototype, 'value', { get() { return (this.sh.data[this.r] || {})[this.c]; }, set(v) { (this.sh.data[this.r] = this.sh.data[this.r] || {})[this.c] = v; } });
  function Sheet(name) { this.name = name; this.data = {}; this.merges = []; this.columns = []; this.pageSetup = {}; this.headerFooter = {}; window.__xl.rows[name] = this.data; }
  Sheet.prototype.addImage = function () { window.__xl.images = (window.__xl.images || 0) + 1; };
  Sheet.prototype.mergeCells = function (a, b, c, d) { if (c < a || d < b) throw new Error('bad merge'); this.merges.push([a, b, c, d]); window.__xl.merges.push([this.name, a, b, c, d]); };
  Sheet.prototype.getCell = function (r, c) { return new Cell(this, r, c); };
  Sheet.prototype.getRow = function (r) { const sh = this; return { height: 0, getCell: (c) => new Cell(sh, r, c) }; };
  window.ExcelJS = { Workbook: function () { this.calcProperties = {}; this.sheets = []; this.addImage = () => 1; this.addWorksheet = (n) => { const s = new Sheet(n); this.sheets.push(s); return s; }; this.xlsx = { writeBuffer: async () => new ArrayBuffer(8) }; } };
  window.__blobs = []; URL.createObjectURL = (b) => { window.__blobs.push(b); return 'blob:x'; }; window.__dl = [];
  const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); else oc.call(this); };
  window.__T = T;
  // speech stand-in: the test feeds results into the recogniser the app created
  window.SpeechRecognition = function () { window.__sr = this; };
  window.SpeechRecognition.prototype = { start() {}, stop() { if (this.onend) this.onend(); }, abort() {} };
  window.supabase = { createClient: () => client };
})();`;

(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [label, vp] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message));
    await p.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.host === 'app.local') { const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : undefined }) : r.fulfill({ status: 404 }); }
      if (/supabase-js/.test(u.pathname)) return r.fulfill({ body: stub, contentType: 'text/javascript' });
      return r.abort(); // everything else (CDNs, fonts) is offline in the test
    });
    await p.goto('http://app.local/'); await p.waitForTimeout(1200);
    const sideways = async (where) => {
      const bad = await p.evaluate(() => {
        const out = document.documentElement.scrollWidth > innerWidth + 1 ? ['the page'] : [];
        document.querySelectorAll('#view *').forEach((el) => { if (el.clientWidth && (el.classList.contains('tbl-wrap') || (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)))) out.push(el.className || el.tagName); });
        return out;
      });
      if (bad.length) errs.push('phone ' + where + ': scrolls sideways or shows a table: ' + bad.join(', '));
    };
    for (const h of ['home', 'attendance', 'leaves', 'payroll', 'employees', 'tasks', 'clients', 'config']) {
      await p.goto('http://app.local/#' + h); await p.waitForTimeout(500);
      if (outDir) { fs.mkdirSync(outDir, { recursive: true }); await p.screenshot({ path: path.join(outDir, label + '-' + h + '.png'), fullPage: true }); }
      if (label === 'phone') await sideways(h);
    }
    // phone: icon tab bar, no table and nothing that scrolls sideways on any page or attendance tab; desktop keeps its tables
    const bar = await p.evaluate(() => ({ shown: getComputedStyle(document.getElementById('tabbar')).display !== 'none', items: document.querySelectorAll('#tabbar > *').length }));
    if (bar.shown !== (label === 'phone') || bar.items !== 5) errs.push(label + ': tab bar ' + JSON.stringify(bar));
    if (label === 'phone') {
      await p.goto('http://app.local/#attendance'); await p.waitForTimeout(300);
      for (const tab of ['month', 'import', 'day']) { await p.evaluate((v) => document.querySelector('[data-act="att-tab"][data-v="' + v + '"]').click(), tab); await p.waitForTimeout(250); await sideways('attendance/' + tab); }
      await p.evaluate(() => document.querySelector('[data-act="att-tab"][data-v="month"]').click()); await p.waitForTimeout(200);
      await p.evaluate(() => document.querySelector('[data-act="att-emp"]').click()); await p.waitForTimeout(250); await sideways('attendance/month of one employee');
      await p.evaluate(() => document.querySelector('#tabbar [data-act="more"]').click()); await p.waitForTimeout(200);
      await p.evaluate(() => document.querySelector('.modal a.app-tile[href="#clients"]').click()); await p.waitForTimeout(400);
      const went = await p.evaluate(() => location.hash === '#clients' && !document.querySelector('.modal') && document.querySelector('#tabbar [data-act="more"]').getAttribute('aria-current') === 'page');
      if (!went) errs.push('phone: «المزيد» did not open the clients page');
    }
    // voice task: speech → form fields → saved task → WhatsApp link to the employee in charge → one-press status
    await p.goto('http://app.local/#tasks'); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector(matchMedia('(max-width: 860px)').matches ? '#tabbar [data-act="task-voice"]' : '#view [data-act="task-voice"]').click());
    await p.waitForTimeout(200);
    const said = await p.evaluate(() => {
      const say = (...parts) => window.__sr.onresult({ results: parts.map((t) => [{ transcript: t }]) });
      const a = 'إقرار ضريبة الدخل', b = a + ' لمؤسسة تجريبية عن سنة 2023 و2024', c = b + ' المسؤول موظف أول بكرة الساعة عشرة مستعجل';
      say(a); say(a, b); say(a, b, c); // Android Chrome repeats what it already heard
      window.__sr.stop();
      const f = document.getElementById('mform').elements, d = new Date(); d.setDate(d.getDate() + 1);
      const tomorrow = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { title: f.title.value, emp: f.employee_id.value, client: f.client_id.value, due: f.due.value === tomorrow, time: f.time.value, years: f.years.value, pr: f.priority.value, cat: f.category.value, mic: document.getElementById('voice-mic').getAttribute('aria-pressed') };
    });
    const want = { title: 'إقرار ضريبة الدخل لمؤسسة تجريبية عن سنة 2023 و2024', emp: 'emp-02', client: 'c1', due: true, time: '10:00', years: '2023، 2024', pr: 'urgent', cat: 'إقرار ضريبة الدخل', mic: 'false' };
    if (JSON.stringify(said) !== JSON.stringify(want)) errs.push(label + ': voice task filled ' + JSON.stringify(said));
    await p.evaluate(() => document.getElementById('msubmit').click()); await p.waitForTimeout(800);
    const wa = await p.evaluate(() => { const a = document.getElementById('wa-go'), x = window.__T.tasks.find((r) => r.data.title.includes('2023')); return { href: a ? a.href : '', saved: x ? x.data : null }; });
    const msg = decodeURIComponent(wa.href.split('?text=')[1] || '');
    if (!wa.href.startsWith('https://wa.me/962790000002?text=') || !['مرحباً موظف', 'إقرار ضريبة الدخل', 'مؤسسة تجريبية للتجارة', '12345678', '2023، 2024', '10:00', 'عاجلة'].every((w) => msg.includes(w)) || !wa.saved || wa.saved.years !== '2023، 2024' || wa.saved.time !== '10:00')
      errs.push(label + ': WhatsApp notice ' + JSON.stringify({ href: wa.href.slice(0, 60), msg, saved: wa.saved }));
    const after = await p.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), row = () => window.__T.tasks.find((r) => r.data.title.includes('2023'));
      const a = document.getElementById('wa-go'); a.addEventListener('click', (e) => e.preventDefault()); a.click(); // the link itself would leave for WhatsApp
      await wait(700);
      const id = row().id, noted = !!row().data.wa_at && !document.querySelector('.modal');
      if (matchMedia('(max-width: 860px)').matches) { document.querySelector('details[data-k="task:' + id + '"] > summary').click(); document.querySelector('[data-act="task-set"][data-id="' + id + '"][data-f="status"][data-v="done"]').click(); }
      else { const s = document.getElementById('task-st-' + id); s.value = 'done'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      await wait(400);
      return { noted, status: row().data.status };
    });
    if (!after.noted || after.status !== 'done') errs.push(label + ': after the notice ' + JSON.stringify(after));
    // printed documents open in the preview: payslips one A4 sheet per employee, the leave form one sheet
    const sheets = async (open) => { await p.evaluate(open); await p.waitForTimeout(300); const n = await p.$$eval('.doc-wrap .lvdoc > .sheet', (x) => x.length); await p.evaluate(() => document.querySelector('[data-act="modal-close"]').click()); return n; };
    await p.goto('http://app.local/#payroll'); await p.waitForTimeout(500);
    const rows = await p.$$eval('[data-act="pay-slip"]', (x) => x.length);
    let n = await sheets(() => document.querySelector('[data-act="slips-all"]').click());
    if (!rows || n !== rows) errs.push(label + ': all payslips gave ' + n + ' sheets for ' + rows + ' employees');
    n = await sheets(() => { document.querySelector('[data-act="pay-slip"]').click(); document.querySelector('[data-act="slip-dl"]').click(); });
    if (n !== 1) errs.push(label + ': one payslip gave ' + n + ' sheets');
    await p.goto('http://app.local/#leaves'); await p.waitForTimeout(500);
    n = await sheets(() => document.querySelector('[data-act="leave-print"]').click());
    if (n !== 1) errs.push(label + ': leave form gave ' + n + ' sheets');
    await p.close();
  }
  await b.close();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('smoke: every page loaded on desktop and phone with no JavaScript errors');
})();
