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
  names.forEach((n, i) => T.employees.push({ id: 'emp-0' + (i + 1), data: { annual_days: i === 1 ? 21 : 14, leave_open_balance: i === 1 ? 27 : 0, leave_open_date: '2026-10-31', name: n, title: i ? 'محاسب' : 'المدير العام', fp_id: String(i + 1), basic_salary: [1000,600,600,600,500,500,500][i], allowances: 30, ssc: true, track: true, active: true, order: i + 1, hire_date: '2022-03-01' } }));
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
    for (const h of ['home', 'attendance', 'leaves', 'payroll', 'employees', 'tasks', 'clients', 'config']) {
      await p.goto('http://app.local/#' + h); await p.waitForTimeout(500);
      if (outDir) { fs.mkdirSync(outDir, { recursive: true }); await p.screenshot({ path: path.join(outDir, label + '-' + h + '.png'), fullPage: true }); }
    }
    await p.close();
  }
  await b.close();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('smoke: every page loaded on desktop and phone with no JavaScript errors');
})();
