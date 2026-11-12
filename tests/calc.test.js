// Calculation tests for the /*PURE-START*/ … /*PURE-END*/ block of index.html.
// Run: node tests/calc.test.js   (no dependencies)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pure = html.slice(html.indexOf('/*PURE-START*/'), html.indexOf('/*PURE-END*/'));
const P = new Function(pure + '\nreturn { mergeSettings, evalDay, monthSummary, payrollRow, collapsePunches, fpIds, fieldPeriodOn };')();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

test('normal week: grace, late, missing, early, overtime, work on Friday', () => {
  const settings = P.mergeSettings(null);
  const emp = { id: 'e1', name: 'موظف', basic_salary: 600, allowances: 50, ssc: true };
  const days = {
    '2026-10-03': { rec: { e1: { p: ['08:40', '18:30'] } } }, // Sat: 10 min late is within grace; 60 min overtime
    '2026-10-04': { rec: { e1: { p: ['08:50', '17:30'] } } }, // Sun: 20 min late
    '2026-10-05': { rec: { e1: { p: ['08:30'] } } },          // Mon: one punch only
    '2026-10-06': { rec: { e1: { p: ['08:30', '16:30'] } } }, // Tue: left 60 min early
    '2026-10-08': { rec: { e1: { p: ['08:25', '15:10'] } } }, // Thu (ends 14:30): 40 min overtime
    '2026-10-09': { rec: { e1: { p: ['10:00', '13:00'] } } }, // Fri (off): 180 min paid at the off-day rate
  };
  const ctx = { settings, days, leaves: [] };
  const d = (date) => P.evalDay(ctx, emp, date, '2026-10-31', 600);
  assert.equal(d('2026-10-03').status, 'present'); assert.equal(d('2026-10-03').late, 0); assert.equal(d('2026-10-03').ot, 60);
  assert.equal(d('2026-10-04').status, 'late'); assert.equal(d('2026-10-04').late, 20);
  assert.equal(d('2026-10-05').status, 'missing');
  assert.equal(d('2026-10-06').early, 60);
  assert.equal(d('2026-10-08').ot, 40);
  assert.equal(d('2026-10-09').otOff, 180);
});

test('double presses within punch_gap count once', () => {
  assert.deepEqual(P.collapsePunches(['08:52', '08:53', '17:28'], 10), ['08:52', '17:28']);
  assert.deepEqual(P.collapsePunches(['08:52', '08:53'], 10), ['08:52']);
  const ctx = { settings: P.mergeSettings({ start_date: '2026-10-20' }), leaves: [], days: { '2026-10-28': { rec: { m: { p: ['08:54', '08:55'] } } } } };
  const r = P.evalDay(ctx, { id: 'm', name: 'م' }, '2026-10-28', '2026-10-28', 600);
  assert.equal(r.in, '08:54'); assert.ok(!r.out, 'second press must not become the leaving time');
});

test('several device numbers per employee', () => {
  assert.deepEqual(P.fpIds('11, 1'), ['11', '1']);
  assert.deepEqual(P.fpIds('011،1 ;3'), ['11', '1', '3']);
  assert.deepEqual(P.fpIds(''), []);
});

test('standing field-work period', () => {
  const settings = P.mergeSettings({ start_date: '2026-10-27', holidays: [{ date: '2026-12-25', name: 'عطلة' }] });
  const emp = { id: 'r', name: 'موظفة', basic_salary: 450, field_from: '2026-10-28', field_to: '2026-12-31' };
  const days = {
    '2026-10-27': { rec: { r: { p: ['09:30', '17:40'] } } },               // before the period: normal (late)
    '2026-10-28': { rec: { r: { p: ['10:10'] } } },                        // inside: field work even with a late punch
    '2026-11-03': { rec: { r: { p: ['09:20', '17:35'], mark: 'office' } } }, // the day switched back to the fingerprint
  };
  const leaves = [{ employee_id: 'r', type: 'annual', status: 'approved', start: '2026-11-05', end: '2026-11-05', days: 1 }];
  const ctx = { settings, days, leaves };
  const s = (date) => P.evalDay(ctx, emp, date, '2026-12-31', 600).status;
  assert.equal(s('2026-10-27'), 'late');
  assert.equal(s('2026-10-28'), 'field');
  assert.equal(s('2026-10-29'), 'field');
  assert.equal(s('2026-10-30'), 'off');      // Friday stays off
  assert.equal(s('2026-11-03'), 'late');     // 'office' override
  assert.equal(s('2026-11-05'), 'leave');    // leave wins
  assert.equal(s('2026-12-25'), 'holiday');  // holiday stays a holiday
  assert.equal(P.fieldPeriodOn(emp, '2027-01-02'), false);
});

console.log('\n' + n + ' groups passed');
