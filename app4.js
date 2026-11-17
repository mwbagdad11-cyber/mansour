/* ===================== الحسابات ===================== */
async function mCash(root) {
  const { data } = await sb.from('cash_ledger').select('*').neq('ref', 'legacy').eq('box', 'main').order('created_at', { ascending: false }).limit(500);
  const rows = data || []; const bal = rows.reduce((a, r) => a + (r.direction === 'in' ? 1 : -1) * Number(r.amount), 0);
  const tin = rows.filter(r => r.day === today() && r.direction === 'in').reduce((a, r) => a + Number(r.amount), 0), tout = rows.filter(r => r.day === today() && r.direction === 'out').reduce((a, r) => a + Number(r.amount), 0);
  const cats = {}; rows.filter(r => r.day.slice(0, 7) === today().slice(0, 7)).forEach(r => { const k = r.category || '—'; cats[k] = cats[k] || { i: 0, o: 0 }; cats[k][r.direction === 'in' ? 'i' : 'o'] += Number(r.amount); });
  root.innerHTML = `<div class="grid"><div class="kpi"><span>رصيد الصندوق الرئيسي</span><b>${fmt(bal)}</b></div><div class="kpi"><span>وارد اليوم</span><b>${fmt(tin)}</b></div><div class="kpi"><span>صادر اليوم</span><b>${fmt(tout)}</b></div></div>
  <div class="card"><div class="row"><h3 style="flex:1;margin:0">الدفتر</h3><button class="btn" id="in">+ وارد</button><button class="btn amb" id="out">+ صادر</button></div>
  <div class="row" style="margin:8px 0"><button class="btn sec" id="cl">إغلاق الصندوق اليومي</button><button class="btn sec" id="ex">⬇ Excel</button><button class="btn sec" id="im">⬆ استيراد النظام القديم</button><button class="btn sec" id="cu">تحويل دولار</button><button class="btn sec" id="cd">تسليم عهدة صرف</button><button class="btn sec" id="op">رصيد افتتاحي</button></div>
  ${table([['day', 'التاريخ'], ['direction', 'الحركة', v => v === 'in' ? tag('وارد') : tag('صادر', 'amb')], ['category', 'الفئة'], ['amount', 'المبلغ', fmt], ['notes', 'ملاحظات']], rows.slice(0, 100), r => r.reverses || r.ref === 'reversed' ? tag('عكس') : `<button class="btn sec" data-rv="${r.id}">عكس</button>`)}</div>
  <div class="card"><h3>الملخص الشهري</h3>${table([['k', 'الفئة'], ['i', 'وارد', fmt], ['o', 'صادر', fmt]], Object.entries(cats).map(([k, v]) => ({ k, ...v })))}</div>`;
  const add = dir => openForm({ title: dir === 'in' ? 'وارد' : 'صادر', fields: [D('day', 'التاريخ', { def: today() }), T('category', 'الفئة', { req: 1 }), N('amount', 'المبلغ', { req: 1 }), A('notes', 'ملاحظات')], save: async o => { o.direction = dir; o.box = 'main'; if (!(await run(sb.from('cash_ledger').insert(o), 'انسجل'))) return false; mCash(root); } });
  $('#in', root).onclick = () => add('in'); $('#out', root).onclick = () => add('out');
  $('#op', root).onclick = () => openForm({ title: 'رصيد افتتاحي', fields: [D('day', 'التاريخ', { def: today() }), N('amount', 'المبلغ', { req: 1 })], save: async o => { Object.assign(o, { direction: 'in', category: 'رصيد افتتاحي', box: 'main' }); if (!(await run(sb.from('cash_ledger').insert(o), 'انسجل'))) return false; mCash(root); } });
  root.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.rv); if (!confirm('سوّي حركة عكس لهذي الحركة؟')) return; if (await run(sb.from('cash_ledger').insert({ direction: r.direction === 'in' ? 'out' : 'in', category: 'عكس: ' + (r.category || ''), amount: r.amount, reverses: r.id, box: r.box, client_token: 'rv-' + r.id, notes: 'تصحيح' }), 'انعكست')) mCash(root); });
  $('#cl', root).onclick = async () => { if (await run(sb.from('cash_closings').insert({ day: today(), total_in: tin, total_out: tout, balance: bal }), 'أُغلق الصندوق')) { } };
  $('#ex', root).onclick = () => { const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ التاريخ: r.day, الحركة: r.direction === 'in' ? 'وارد' : 'صادر', الفئة: r.category, المبلغ: r.amount, ملاحظات: r.notes }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'الدفتر'); XLSX.writeFile(wb, `الدفتر-${today()}.xlsx`); };
  $('#im', root).onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv'; i.onchange = async () => { const wb = XLSX.read(await i.files[0].arrayBuffer()); const js = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); const out = js.map((r, k) => ({ client_token: 'leg-' + Date.now() + '-' + k, day: String(r['التاريخ'] || today()).slice(0, 10), direction: (r['الحركة'] || '').includes('صادر') ? 'out' : 'in', category: r['الفئة'], amount: Number(r['المبلغ']) || 0, notes: r['ملاحظات'], ref: 'legacy' })).filter(r => r.amount); if (await run(sb.from('cash_ledger').insert(out), `استُوردت ${out.length} حركة (ما تدخل بالرصيد)`)) mCash(root); }; i.click(); };
  $('#cu', root).onclick = () => openForm({ title: 'تحويل دولار', fields: [N('usd', 'المبلغ بالدولار', { req: 1 }), N('rate', 'سعر الصرف (دينار لكل $)', { req: 1 })], save: async o => { const id = uid(); const a = await run(sb.from('cash_ledger').insert({ direction: 'out', category: 'تحويل إلى دولار', amount: o.usd * o.rate, box: 'main', client_token: 'fx-o-' + id })); const b = await run(sb.from('cash_ledger').insert({ direction: 'in', category: 'تحويل من دينار', amount: o.usd, currency: 'USD', box: 'usd', client_token: 'fx-i-' + id, notes: 'سعر ' + o.rate })); if (!a || !b) return false; mCash(root); } });
  $('#cd', root).onclick = async () => { const { data: us } = await sb.from('profiles').select('id,full_name').eq('role', 'disbursement').eq('approved', true); openForm({ title: 'تسليم عهدة لمسؤولة الصرف', fields: [S('u', 'المستلمة', (us || []).map(u => [u.id, u.full_name]), { req: 1 }), N('amount', 'المبلغ', { req: 1 })], save: async o => { const id = uid(); const a = await run(sb.from('cash_ledger').insert({ direction: 'out', category: 'عهدة صرف', amount: o.amount, box: 'main', client_token: 'cd-o-' + id })); const b = await run(sb.from('cash_ledger').insert({ direction: 'in', category: 'عهدة مستلمة', amount: o.amount, box: 'disbursement:' + o.u, client_token: 'cd-i-' + id })); if (!a || !b) return false; mCash(root); } }); };
}
async function mDisb(root) {
  const box = 'disbursement:' + ME.id;
  const { data } = await sb.from('cash_ledger').select('*').eq('box', box).order('created_at', { ascending: false });
  const bal = (data || []).reduce((a, r) => a + (r.direction === 'in' ? 1 : -1) * Number(r.amount), 0);
  root.innerHTML = `<div class="kpi"><span>رصيد صندوق الصرف</span><b>${fmt(bal)}</b></div><div class="card"><div class="row"><h3 style="flex:1;margin:0">صندوق الصرف</h3><button class="btn amb" id="o">+ صرف</button></div>${table([['created_at', 'الوقت', fdate], ['direction', 'الحركة', v => v === 'in' ? tag('عهدة') : tag('صرف', 'amb')], ['category', 'البند'], ['amount', 'المبلغ', fmt], ['notes', 'ملاحظات']], data || [])}</div>`;
  $('#o', root).onclick = () => openForm({ title: 'صرف', fields: [T('category', 'البند', { req: 1 }), N('amount', 'المبلغ', { req: 1 }), A('notes', 'ملاحظات')], save: async o => { if (o.amount > bal) { toast('⚠ أكثر من الرصيد'); return false; } o.direction = 'out'; o.box = box; if (!(await run(sb.from('cash_ledger').insert(o), 'انسجل'))) return false; mDisb(root); } });
}
const mAdvances = crud({
  title: 'السلف التشغيلية', table: 'advances',
  cols: [['party_kind', 'النوع'], ['party', 'الجهة'], ['amount', 'المبلغ', fmt], ['settled', 'المُسوّى', fmt], ['amount', 'المتبقي', (v, r) => tag(fmt(r.amount - r.settled), r.amount - r.settled > 0 ? 'amb' : '')], ['notes', 'ملاحظات']],
  fields: [S('party_kind', 'النوع', [['معمل', 'معمل'], ['معمل سمنت', 'معمل سمنت'], ['ناقل', 'ناقل'], ['شخص', 'شخص'], ['محطة', 'محطة']], { req: 1 }), T('party', 'الاسم', { req: 1 }), N('amount', 'المبلغ', { req: 1 }), A('notes', 'ملاحظات (السلفة مو مصروف — تُسوّى بالفواتير أو الإرجاع)')],
  rowBtns: [{ label: 'تسوية', fn: async (r, l) => { const v = Number(prompt('مبلغ التسوية (فواتير معتمدة / إرجاع):')); if (v > 0 && await run(sb.from('advances').update({ settled: Number(r.settled) + v }).eq('id', r.id), 'تمت')) l(); } }],
});
const mContractorPay = crud({ title: 'حسابات المقاولين (الدفعات)', table: 'contractor_payments', cols: [['created_at', 'التاريخ', fdate], ['contractor', 'المقاول'], ['amount', 'المبلغ', fmt], ['notes', 'ملاحظات']], fields: [T('contractor', 'المقاول', { req: 1 }), N('amount', 'الدفعة', { req: 1 }), A('notes', 'ملاحظات')] });
async function mStation(root) {
  const { data } = await sb.from('fuel_station_statements').select('*').order('created_at', { ascending: false });
  root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">سلفة الكاز — محطة الفلوجة</h3><button class="btn" id="up">⬆ رفع كشف المحطة</button></div>${table([['created_at', 'التاريخ', fdate], ['period', 'الفترة'], ['liters', 'اللترات', fmt], ['price_per_liter', 'سعر اللتر', fmt], ['amount', 'المبلغ', fmt], ['status', 'الحالة', v => tag(v === 'approved' ? 'معتمد' : 'للمراجعة', v === 'approved' ? '' : 'amb')], ['photo', 'الكشف', link]], data || [], r => (r.status !== 'approved' ? `<button class="btn sec" data-m="${r.id}">مطابقة</button> ` : '') + (r.status !== 'approved' && hasRole(['accounts_head']) ? `<button class="btn" data-ap="${r.id}">اعتماد</button>` : ''))}</div>`;
  $('#up', root).onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.onchange = async () => { toast('جاري قراءة الكشف مرتين...', 8000); try { const { result: r, agree } = await aiRead('station_statement', i.files[0], true); const photo = await upload(i.files[0]); const lines = r.lines || []; const sum = lines.reduce((a, l) => a + Number(l.liters || 0), 0); const warn = []; if (!agree) warn.push('القراءتان مختلفتان'); if (r.liters && Math.abs(sum - r.liters) > 0.5) warn.push(`مجموع الأسطر ${fmt(sum)} ≠ المجموع ${fmt(r.liters)}`); const seen = new Set(), dup = []; lines.forEach(l => { const k = `${l.date}|${l.liters}|${l.vehicle}`; if (seen.has(k)) dup.push(k); seen.add(k); }); if (dup.length) warn.push(`${dup.length} سطر مكرر`); if (await run(sb.from('fuel_station_statements').insert({ client_token: uid(), period: r.period, liters: r.liters, amount: r.amount, price_per_liter: r.price_per_liter, lines, photo }), 'انرفع الكشف')) { if (warn.length) modal(`<h3>⚠ ملاحظات التدقيق</h3>${warn.map(w => `<div class="warn">${esc(w)}</div>`).join('')}`); mStation(root); } } catch (e) { toast('⚠ ' + errMsg(e), 5000); } }; i.click(); };
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { const st = data.find(x => x.id === b.dataset.m); const { data: logs } = await sb.from('fuel_logs').select('liters').eq('direction', 'in'); const rec = (logs || []).reduce((a, x) => a + Number(x.liters), 0); modal(`<h3>مطابقة</h3><p>لترات الكشف: <b>${fmt(st.liters)}</b></p><p>مجموع استلامات الكاز المسجّلة: <b>${fmt(rec)}</b></p><p>الفرق: <b>${fmt(st.liters - rec)}</b></p><div class="mut">مسؤولين الكاز يأكدون كل سطر من قائمة الأسطر.</div>${table([['date', 'التاريخ'], ['vehicle', 'الآلية'], ['liters', 'لتر'], ['amount', 'مبلغ']], st.lines || [])}`); });
  root.querySelectorAll('[data-ap]').forEach(b => b.onclick = async () => { const st = data.find(x => x.id === b.dataset.ap); if (!confirm('اعتماد وخصم من السلفة؟')) return; if (await run(sb.from('fuel_station_statements').update({ status: 'approved' }).eq('id', st.id))) { const { data: adv } = await sb.from('advances').select('*').eq('party', 'محطة الفلوجة').limit(1); if (adv?.[0]) await sb.from('advances').update({ settled: Number(adv[0].settled) + Number(st.amount || 0) }).eq('id', adv[0].id); else toast('ما لكيت سلفة باسم «محطة الفلوجة» — أضفها بالسلف'); mStation(root); } });
}

/* ===================== المبيعات ===================== */
const mApartments = crud({
  title: 'الشقق', table: 'apartments', order: 'building',
  cols: [['building', 'البناية'], ['floor', 'الطابق'], ['number', 'الشقة'], ['area', 'المساحة م²'], ['status', 'الحالة', v => ({ free: tag('متاحة'), reserved: tag('محجوزة', 'amb'), sold: tag('مباعة', 'red') }[v])]],
  fields: [S('building', 'البناية', BUILDINGS, { req: 1 }), N('floor', 'الطابق', { req: 1 }), T('number', 'رقم الشقة', { req: 1 }), N('area', 'المساحة م²', { req: 1 }), S('status', 'الحالة', [['free', 'متاحة'], ['reserved', 'محجوزة'], ['sold', 'مباعة']], { req: 1 })],
  top: () => '<div class="mut">T1 إلى T4 حصة المستثمر</div>', addRoles: ['sales_head'],
});
const mCustomers = crud({
  title: 'الزبائن والمستأجرين', table: 'customers', order: 'name',
  cols: [['name', 'الاسم'], ['phone', 'الهاتف'], ['kind', 'النوع', v => v === 'tenant' ? 'مستأجر' : 'مشتري'], ['id_doc', 'المستمسك']],
  fields: [T('name', 'الاسم', { req: 1 }), T('phone', 'الهاتف'), S('kind', 'النوع', [['buyer', 'مشتري'], ['tenant', 'مستأجر']], { req: 1 }), T('id_doc', 'رقم المستمسك'), A('notes', 'ملاحظات')],
  rowBtns: [{ label: 'ملف / عقد', fn: async (r) => { const { data } = await sb.from('contract_files').select('*').eq('customer_id', r.id); const m = modal(`<h3>ملف ${esc(r.name)}</h3>${table([['title', 'المستند'], ['file_url', 'الملف', link]], data || [])}<button class="btn" id="cf">+ رفع مستند</button>`); $('#cf', m).onclick = () => { m.remove(); openForm({ title: 'مستند', fields: [T('title', 'العنوان (عقد، هوية…)', { req: 1 }), P('file_url', 'الملف')], save: async o => { o.customer_id = r.id; return (await run(sb.from('contract_files').insert(o), 'انرفع')) ? true : false; } }); }; } }],
});
function planOf(b) {
  const total = Number(b.total || 0), rem = Math.max(0, total - Number(b.down_payment || 0) - Number(b.handover_payment || 0));
  const cap = Number(b.down_payment) < 90000000 ? 90 : 84; let inst = Number(b.installment || 2000000), months = Math.ceil(rem / inst);
  if (months > cap) { months = cap; inst = Math.ceil(rem / cap); }
  return { total, rem, inst, months };
}
async function mBookings(root) {
  const { data } = await sb.from('bookings').select('*,customers(name,phone),apartments(building,floor,number)').order('created_at', { ascending: false });
  const { data: pays } = await sb.from('sales_payments').select('*');
  const paidBy = {}; (pays || []).forEach(p => paidBy[p.booking_id] = (paidBy[p.booking_id] || 0) + Number(p.amount));
  const sched = b => {
    const pl = planOf(b), rows = []; const st = new Date(b.start_date), day = b.due_day || st.getDate();
    rows.push({ k: 'مقدّمة', due: b.start_date, amt: Number(b.down_payment) }); if (Number(b.handover_payment)) rows.push({ k: 'دفعة استلام', due: null, amt: Number(b.handover_payment) });
    for (let i = 1; i <= pl.months; i++) { const d = new Date(st.getFullYear(), st.getMonth() + i, 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); rows.push({ k: 'قسط ' + i, due: d.toISOString().slice(0, 10), amt: i === pl.months ? pl.rem - pl.inst * (pl.months - 1) : pl.inst }); }
    let paid = paidBy[b.id] || 0; rows.forEach(r => { const x = Math.min(paid, r.amt); r.paid = x; paid -= x; r.late = r.due && r.due < today() && r.paid < r.amt; }); return rows;
  };
  const late = b => sched(b).filter(r => r.late).reduce((a, r) => a + r.amt - r.paid, 0);
  const canEdit = hasRole(['sales_head', 'gm1', 'gm2']);
  root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">الحجوزات والأقساط</h3>${canEdit ? '<button class="btn" id="nb">+ حجز جديد</button>' : ''}</div><input id="q" placeholder="بحث بالاسم أو الرقم أو الشقة" style="margin:8px 0"><div id="tb"></div></div>`;
  const paint = () => { const q = norm($('#q', root).value); const f = (data || []).filter(b => !q || norm(`${b.customers?.name} ${b.customers?.phone} ${b.apartments?.building} ${b.apartments?.number}`).includes(q)); $('#tb', root).innerHTML = table([['customers', 'الزبون', v => esc(v?.name)], ['apartments', 'الشقة', v => esc(`${v?.building}-${v?.floor}-${v?.number}`)], ['total', 'السعر', fmt], ['id', 'المدفوع', v => fmt(paidBy[v] || 0)], ['id', 'المتبقي', (v, b) => fmt(b.total - (paidBy[v] || 0))], ['id', 'المتأخر', (v, b) => { const l = late(b); return l ? tag(fmt(l), 'red') : '—'; }]], f, b => `<button class="btn sec" data-o="${b.id}">فتح</button>`); root.querySelectorAll('[data-o]').forEach(x => x.onclick = () => open(data.find(b => b.id === x.dataset.o))); };
  $('#q', root).oninput = paint; paint();
  const open = b => {
    const s = sched(b), paid = paidBy[b.id] || 0, lt = late(b);
    const msg = encodeURIComponent(`السيد ${b.customers?.name}\nتذكير: عندكم مبلغ متأخر ${fmt(lt)} دينار على الشقة ${b.apartments?.building}-${b.apartments?.number}. نرجو التسديد. شركة المنصور`);
    const m = modal(`<h3>${esc(b.customers?.name)} — ${esc(b.apartments?.building)}-${esc(b.apartments?.number)}</h3><div class="grid"><div class="kpi"><span>السعر</span><b>${fmt(b.total)}</b></div><div class="kpi"><span>المدفوع</span><b>${fmt(paid)}</b></div><div class="kpi"><span>المتبقي</span><b>${fmt(b.total - paid)}</b></div><div class="kpi"><span>المتأخر</span><b>${fmt(lt)}</b></div></div>
      <div class="row" style="margin:8px 0"><button class="btn" id="pp">+ تسجيل دفعة</button>${lt ? `<a class="btn amb" target="_blank" href="https://wa.me/${phoneWA(b.customers?.phone)}?text=${msg}">تذكير واتساب</a>` : ''}<button class="btn sec" id="ks">كشف حساب</button></div>
      <div class="tw" style="max-height:40vh;overflow:auto">${table([['k', 'الدفعة'], ['due', 'الاستحقاق'], ['amt', 'المبلغ', fmt], ['paid', 'المدفوع', fmt], ['late', '', v => v ? tag('متأخر', 'red') : '']], s)}</div>`);
    $('#ks', m).onclick = () => { const w = window.open('', '_blank'); w.document.write(`<html dir="rtl"><body style="font-family:sans-serif"><h2>كشف حساب — ${esc(b.customers?.name)}</h2><p>الشقة ${esc(b.apartments?.building)}-${esc(b.apartments?.number)} | السعر ${fmt(b.total)} | المدفوع ${fmt(paid)} | المتبقي ${fmt(b.total - paid)}</p>${table([['k', 'الدفعة'], ['due', 'الاستحقاق'], ['amt', 'المبلغ', fmt], ['paid', 'المدفوع', fmt]], s)}</body></html>`); setTimeout(() => w.print(), 400); };
    $('#pp', m).onclick = () => { m.remove(); openForm({ title: 'تسجيل دفعة', fields: [N('amount', 'المبلغ', { req: 1 }), S('kind', 'النوع', [['installment', 'قسط'], ['down', 'مقدّمة'], ['handover', 'دفعة استلام']], { req: 1 }), N('services', 'خدمات (صيانة/كهرباء/إنترنت/ماء) بنفس الوصل', { def: 0 }), D('day', 'التاريخ', { def: today() })], save: async o => { o.booking_id = b.id; if (!(await run(sb.from('sales_payments').insert(o), 'انسجلت'))) return false; const after = (paidBy[b.id] || 0) + o.amount; const wm = encodeURIComponent(`وصل استلام — شركة المنصور\nالسيد ${b.customers?.name}\nالمبلغ: ${fmt(o.amount)}${o.services ? ' + خدمات ' + fmt(o.services) : ''}\nالمدفوع الكلي: ${fmt(after)}\nالمتبقي: ${fmt(b.total - after)}`); if (b.customers?.phone) window.open(`https://wa.me/${phoneWA(b.customers.phone)}?text=${wm}`, '_blank'); mBookings(root); } }); };
  };
  const nb = $('#nb', root);
  if (nb) nb.onclick = async () => {
    const apts = (await sb.from('apartments').select('*').neq('status', 'sold').order('building')).data || [];
    const custs = await refOpts('customers', 'name');
    const bs = [...new Set(apts.map(a => a.building))];
    const m = modal(`<h3>حجز جديد</h3>
      <label>الزبون</label><select id="c"><option value="">—</option>${custs.map(([a, b]) => `<option value="${a}">${esc(b)}</option>`).join('')}</select>
      <label>البناية</label><select id="b"><option value="">—</option>${bs.map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <label>الطابق</label><select id="f"></select><label>الشقة</label><select id="a"></select>
      <div class="grid"><div><label>المساحة م²</label><input id="ar" type="number"></div><div><label>سعر المتر</label><input id="mp" type="number" value="1750000"></div></div>
      <div class="grid"><div><label>نوع الخصم</label><select id="dk"><option value="amt">مبلغ</option><option value="pct">نسبة %</option><option value="mtr">على سعر المتر</option></select></div><div><label>قيمة الخصم</label><input id="dv" type="number" value="0"></div></div>
      <label>سبب الخصم</label><input id="dr">
      <div class="grid"><div><label>المقدّمة</label><input id="dp" type="number" value="90000000"></div><div><label>دفعة الاستلام</label><input id="hp" type="number" value="50000000"></div><div><label>القسط الشهري</label><input id="in" type="number" value="2000000"></div></div>
      <label>تاريخ البداية</label><input id="sd" type="date" value="${today()}">
      <div class="kpi" style="margin-top:10px" id="pv"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="sv">حفظ الحجز</button></div>`);
    const g = id => $('#' + id, m).value;
    const calc = () => {
      const area = Number(g('ar')) || 0; let mp = Number(g('mp')), disc = 0, dv = Number(g('dv')) || 0;
      if (g('dk') === 'mtr') mp = Math.max(0, mp - dv); let total = area * mp; if (g('dk') === 'amt') disc = dv; if (g('dk') === 'pct') disc = total * dv / 100; if (g('dk') === 'mtr') disc = area * dv; total -= (g('dk') === 'mtr' ? 0 : disc);
      const o = { total, down_payment: Number(g('dp')), handover_payment: Number(g('hp')), installment: Number(g('in')) }; const p = planOf(o);
      $('#pv', m).innerHTML = `<span>الإجمالي بعد الخصم</span><b>${fmt(total)}</b><span>المتبقي بعد المقدّمة والاستلام: ${fmt(p.rem)} ← ${p.months} قسط × ${fmt(p.inst)}</span>`; return { ...o, disc, mp };
    };
    $('#b', m).onchange = () => { const fl = [...new Set(apts.filter(a => a.building === g('b')).map(a => a.floor))]; $('#f', m).innerHTML = '<option value="">—</option>' + fl.map(x => `<option>${x}</option>`).join(''); $('#a', m).innerHTML = ''; };
    $('#f', m).onchange = () => { $('#a', m).innerHTML = '<option value="">—</option>' + apts.filter(a => a.building === g('b') && String(a.floor) === g('f')).map(a => `<option value="${a.id}" data-ar="${a.area}">شقة ${esc(a.number)} (${a.area} م²)</option>`).join(''); };
    $('#a', m).onchange = () => { $('#ar', m).value = $('#a', m).selectedOptions[0]?.dataset.ar || ''; calc(); };
    m.querySelectorAll('input,select').forEach(e => e.addEventListener('input', calc)); calc();
    const token = uid();
    $('#sv', m).onclick = async function () {
      if (!g('c') || !g('a')) return toast('اختر الزبون والشقة'); this.disabled = true;
      const c = calc(), p = planOf(c);
      const ok = await run(sb.from('bookings').insert({ client_token: token, customer_id: g('c'), apartment_id: g('a'), area: Number(g('ar')), meter_price: c.mp, discount: c.disc, discount_reason: g('dr'), total: c.total, down_payment: c.down_payment, handover_payment: c.handover_payment, installment: p.inst, months: p.months, start_date: g('sd'), due_day: new Date(g('sd')).getDate() }), 'انحفظ الحجز');
      if (ok) { await sb.from('apartments').update({ status: 'reserved' }).eq('id', g('a')); m.remove(); mBookings(root); } else this.disabled = false;
    };
  };
}
