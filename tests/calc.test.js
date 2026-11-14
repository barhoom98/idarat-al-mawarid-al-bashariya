// Calculation tests for the /*PURE-START*/ … /*PURE-END*/ block of index.html.
// Run: node tests/calc.test.js   (no dependencies)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pure = html.slice(html.indexOf('/*PURE-START*/'), html.indexOf('/*PURE-END*/'));
const P = new Function(pure + '\nreturn { mergeSettings, evalDay, monthSummary, payrollRow, collapsePunches, fpIds, fieldPeriodOn, parseTaskSpeech, waNumber };')();

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

test('voice task: a spoken sentence becomes the task fields', () => {
  // invented people and companies; the shapes (shared middle names, a family name a client also carries) are the ones that matter
  const employees = [
    { id: 'e1', name: 'حسن صالح العلي', active: false },
    { id: 'e2', name: 'سامر خليل محمد الحلبي' }, { id: 'e3', name: 'محمد خليل محمد أبو حمدان' }, { id: 'e4', name: 'يوسف محمد سالم العمري' },
    { id: 'e5', name: 'هبة مأمون يوسف النمر' }, { id: 'e6', name: 'دينا مأمون يوسف النمر' }, { id: 'e7', name: 'سلمى حسن صالح العلي' }, { id: 'e8', name: 'ريم موسى خليل الصباغ' },
  ];
  const clients = [
    { id: 'c1', name: 'شركة النور للتجارة ذ.م.م' }, { id: 'c2', name: 'شركة خالد النجار للخضار والفواكه' }, { id: 'c3', name: 'شركة محمد النجار وشركاه' }, { id: 'c4', name: 'مؤسسة السلام الزراعية' },
    { id: 'c5', name: 'شركة أحمد الخطيب لتجارة المواد الغذائية' }, { id: 'c6', name: 'مؤسسة محمود سعيد للتجارة' }, { id: 'c7', name: 'شركة الأمل لصناعة البلاستيك' }, { id: 'c8', name: 'شركة عمر وليد الخطيب وشريكه' },
    { id: 'c9', name: 'نصر علي أبو حمدان' }, { id: 'c10', name: 'يوسف إسماعيل غزال' },
  ];
  const say = (text) => P.parseTaskSpeech(text, { today: '2026-11-14', employees, clients }); // a Saturday
  const has = (r, want) => { for (const k of Object.keys(want)) assert.deepEqual(r[k], want[k], k + ' in «' + r.title + '»'); };

  has(say('مهمة لسامر: إقرار ضريبة الدخل لشركة النور للتجارة عن سنة 2023 و 2024 يوم الأحد الساعة عشرة مستعجل'),
    { title: 'إقرار ضريبة الدخل لشركة النور للتجارة عن سنة 2023 و 2024', employee_id: 'e2', client_id: 'c1', due: '2026-11-15', time: '10:00', years: [2023, 2024], priority: 'urgent', category: 'إقرار ضريبة الدخل' });
  has(say('يوسف يقدم إقرار المبيعات لمؤسسة السلام بكرة'), { title: 'يقدم إقرار المبيعات لمؤسسة السلام', employee_id: 'e4', client_id: 'c4', due: '2026-11-15', time: '', priority: 'normal', category: 'إقرار ضريبة المبيعات' });
  has(say('تدقيق حسابات شركة الأمل سنة 2022 المسؤول دينا موعد التسليم 20/11'), { title: 'تدقيق حسابات شركة الأمل سنة 2022', employee_id: 'e6', client_id: 'c7', due: '2026-11-20', years: [2022] });
  // «9-10» is a sales-tax period, not the 9th of October; «الساعة 2» in office hours is the afternoon
  has(say('إقرار المبيعات لشهري 9-10 لشركة خالد النجار، المسؤولة هبة، بعد بكرا الساعة 2 ونص'), { title: 'إقرار المبيعات لشهري 9-10 لشركة خالد النجار', employee_id: 'e5', client_id: 'c2', due: '2026-11-16', time: '14:30' });
  // two clients share the family name: neither is guessed, both are offered
  const two = say('ريم تجهز القوائم المالية لشركة النجار للسنوات من 2021 إلى 2024 يوم الخميس الجاي ضروري');
  has(two, { employee_id: 'e8', client_id: '', due: '2026-11-19', years: [2021, 2022, 2023, 2024], priority: 'urgent', category: 'القوائم المالية' });
  assert.deepEqual(two.clientAlt.slice().sort(), ['c2', 'c3']);
  has(say('اقتطاعات الرواتب كل شهر لشركة أحمد الخطيب على هبة آخر الشهر'), { title: 'اقتطاعات الرواتب لشركة أحمد الخطيب', employee_id: 'e5', client_id: 'c5', due: '2026-11-30', recur: 'monthly' });
  has(say('سجل مهمة جديدة براءة ذمة لشركة عمر الخطيب عن ألفين وثلاثة وعشرين المسؤول سلمى بعد ٣ أيام مهم جدا'), { employee_id: 'e7', client_id: 'c8', due: '2026-11-17', years: [2023], priority: 'high', category: 'معاملة حكومية' });
  has(say('سلمى تدخل فواتير شركة النور 25/12/2026 الساعة 9:30'), { employee_id: 'e7', client_id: 'c1', due: '2026-12-25', time: '09:30', years: [], category: 'مسك الدفاتر والقيود' });
  // an employee and a client carry the same family name
  has(say('محمد أبو حمدان يراجع دائرة الضريبة عن ملف محمود سعيد خمسة عشر تشرين الثاني الساعة 11 الصبح'), { title: 'يراجع دائرة الضريبة عن ملف محمود سعيد', employee_id: 'e3', client_id: 'c6', due: '2026-11-15', time: '11:00', category: 'معاملة حكومية' });
  has(say('المسؤول أبو حمدان تعديل إقرارات 2023 لشركة الأمل'), { title: 'تعديل إقرارات 2023 لشركة الأمل', employee_id: 'e3', client_id: 'c7', years: [2023] });
  has(say('محمد أبو حمدان يجهز ملف نصر أبو حمدان بكرة'), { employee_id: 'e3', client_id: 'c9', due: '2026-11-15' });
  // a first name alone never picks a client; inside a client's own name it is not the employee; no date said means today, flagged
  has(say('يوسف يجهز إقرار الدخل 2024'), { employee_id: 'e4', client_id: '', clientAlt: [], years: [2024] });
  has(say('إقرار دخل يوسف غزال عن 2022 و2023 المسؤول سامر'), { employee_id: 'e2', client_id: 'c10', years: [2022, 2023] });
  has(say('إقرار دخل لمحمد النجار 2025'), { employee_id: '', client_id: 'c3', years: [2025], due: '2026-11-14', dueSaid: false });
  assert.deepEqual(['+962 7 9000 0001', '0790000001', '790000001', '00962790000001', '٠٧٩٠٠٠٠٠٠١', '123'].map(P.waNumber), ['962790000001', '962790000001', '962790000001', '962790000001', '962790000001', '']);
});

console.log('\n' + n + ' groups passed');
