/* ===================== المخازن ===================== */
const mMaterials = crud({
  title: 'المواد والرصيد', table: 'materials', order: 'name',
  cols: [['name', 'المادة'], ['qty', 'الرصيد', fmt], ['unit', 'الوحدة'], ['store', 'المخزن', v => v === 'main' ? 'رئيسي' : 'آليات'], ['building', 'البناية'], ['notes', 'ملاحظات']],
  fields: [T('name', 'اسم المادة', { req: 1 }), T('unit', 'الوحدة', { def: 'قطعة' }), S('store', 'المخزن', [['main', 'المخزن الرئيسي'], ['vehicles', 'مخزن الآليات']], { req: 1 }), N('qty', 'الرصيد الافتتاحي', { def: 0 }), bld, A('notes', 'ملاحظات')],
});
const mMoves = crud({
  title: 'المدخلات والمخرجات', table: 'stock_moves', select: '*,materials(name),vehicles(name)',
  cols: [['created_at', 'الوقت', fdate], ['direction', 'النوع', v => ({ in: tag('إدخال'), out: tag('إخراج', 'amb'), repair_in: tag('إلى التصليح', 'red'), repair_out: tag('رجع من التصليح') }[v])], ['materials', 'المادة', v => esc(v?.name)], ['qty', 'الكمية', fmt], ['vehicles', 'الآلية', v => esc(v?.name || '')], ['building', 'البناية'], ['receipt_photo', 'وصل', link], ['notes', 'ملاحظات']],
  fields: [S('direction', 'النوع', [['in', 'إدخال'], ['out', 'إخراج / صرف'], ['repair_in', 'دخول للتصليح'], ['repair_out', 'خروج من التصليح']], { req: 1 }), R('material_id', 'المادة', 'materials', 'name', { req: 1 }), N('qty', 'الكمية', { req: 1 }), R('vehicle_id', 'الآلية (للصرف المباشر)', 'vehicles', 'name'), bld, P('receipt_photo', 'صورة الوصل'), A('notes', 'ملاحظات')],
  edit: false,
});
const mStocktake = crud({
  title: 'الجرد الفعلي', table: 'stocktakes', select: '*,materials(name,qty)', edit: false,
  cols: [['created_at', 'التاريخ', fdate], ['materials', 'المادة', v => esc(v?.name)], ['system_qty', 'بالنظام', fmt], ['counted', 'الفعلي', fmt], ['system_qty', 'الفرق', (v, r) => { const d = (r.counted || 0) - (r.system_qty || 0); return tag(fmt(d), d === 0 ? '' : 'red'); }], ['notes', 'ملاحظات']],
  fields: [R('material_id', 'المادة', 'materials', 'name', { req: 1 }), N('counted', 'الكمية الفعلية', { req: 1 }), A('notes', 'ملاحظات')],
  before: async (o) => { const { data } = await sb.from('materials').select('qty').eq('id', o.material_id).single(); o.system_qty = data?.qty ?? 0; },
});
const mTrucks = crud({
  title: 'الشاحنات الواصلة', table: 'incoming_trucks', edit: true,
  cols: [['created_at', 'الوصول', fdate], ['plate', 'اللوحة'], ['supplier', 'المورد'], ['material', 'المادة'], ['qty', 'الكمية', fmt], ['state', 'الحالة', v => v === 'unloaded' ? tag('نُزّلت') : tag('واصلة', 'amb')], ['receipt_photo', 'وصل', link]],
  fields: [T('plate', 'رقم الشاحنة'), T('supplier', 'المورد'), T('material', 'المادة'), N('qty', 'الكمية'), S('state', 'الحالة', [['arrived', 'واصلة'], ['unloaded', 'تم التنزيل']], { req: 1 }), P('receipt_photo', 'صورة الوصل')],
  rowBtns: [{ label: 'تم التنزيل', show: r => r.state !== 'unloaded', fn: async (r, load) => { if (await run(sb.from('incoming_trucks').update({ state: 'unloaded' }).eq('id', r.id), 'تم')) load(); } }],
});

/* ===================== الطلبات ===================== */
const STAGES = { submitted: ['مقدّم', 'amb'], store: ['عند المخزن', 'amb'], purchasing: ['عند المشتريات', 'red'], received: ['مستلم', ''], done: ['مكتمل', ''], rejected: ['مرفوض', 'red'] };
async function mRequests(root) {
  const load = async () => {
    const { data, error } = await sb.from('requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { root.innerHTML = `<div class="card err">${esc(errMsg(error))}</div>`; return; }
    const names = {}; (await sb.from('profiles').select('id,full_name')).data?.forEach(p => names[p.id] = p.full_name);
    root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">الطلبات</h3><button class="btn" id="n">+ طلب مادة</button><button class="btn sec" id="ai">📷 ورقة مكتوبة</button></div>
      <div id="late"></div><div id="tb"></div></div>`;
    const late = data.filter(r => ['submitted', 'store', 'purchasing'].includes(r.stage) && Date.now() - new Date(r.stage_at) > 864e5);
    if (late.length) $('#late', root).innerHTML = `<div class="warn">⏰ ${late.length} طلب متأخر أكثر من يوم بنفس المرحلة</div>`;
    $('#tb', root).innerHTML = table([['created_at', 'التاريخ', fdate], ['material', 'المادة'], ['qty', 'الكمية', (v, r) => fmt(v) + ' ' + esc(r.unit || '')], ['work_place', 'مكان العمل'], ['dept', 'القسم'], ['stage', 'وين صار هسه', (v, r) => `${tag(STAGES[v]?.[0] || v, STAGES[v]?.[1])}<div class="mut">عند: ${esc(names[r.stage_by] || '—')} · ${fdate(r.stage_at)}</div>`], ['photo', 'صورة', link]], data, r => {
      const b = [];
      const st = hasRole([...STORE, ...ADMIN]), pu = hasRole([...PURCH, ...ADMIN, 'storekeeper']);
      if (r.stage === 'submitted' && st) b.push(['store', 'استلمه المخزن']);
      if (['submitted', 'store'].includes(r.stage) && st) { b.push(['done', 'صرف من المخزن']); b.push(['purchasing', 'حوّل للمشتريات']); }
      if (r.stage === 'purchasing' && pu) b.push(['received', 'تم الشراء/الاستلام']);
      if (r.stage === 'received' && st) b.push(['done', 'إغلاق']);
      if (isOwner()) { if (!b.length && r.stage !== 'done') b.push(['done', 'إغلاق']); b.push(['rejected', 'رفض']); }
      return b.map(([s, l]) => `<button class="btn sec" data-s="${s}|${r.id}">${l}</button>`).join(' ') + ` <button class="btn sec" data-l="${r.id}">السجل</button>`;
    });
    root.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => {
      const [s, id] = b.dataset.s.split('|');
      if (await run(sb.from('requests').update({ stage: s, stage_by: ME.id, stage_at: new Date().toISOString() }).eq('id', id), 'تم')) {
        await sb.from('request_log').insert({ request_id: id, stage: s });
        if (s === 'purchasing') notify('طلب محوّل للمشتريات', data.find(x => x.id === id)?.material);
        load();
      }
    });
    root.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => {
      const { data: lg } = await sb.from('request_log').select('*').eq('request_id', b.dataset.l).order('at');
      modal(`<h3>مسار الطلب</h3>${table([['at', 'الوقت', fdate], ['stage', 'المرحلة', v => esc(STAGES[v]?.[0] || v)], ['by_user', 'بواسطة', v => esc(names[v] || '')]], lg || [])}`);
    });
    $('#n', root).onclick = () => newReq();
    $('#ai', root).onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
      i.onchange = async () => {
        toast('جاري قراءة الورقة...', 6000);
        try {
          const { result } = await aiRead('request_sheet', i.files[0]);
          const photo = await upload(i.files[0]);
          const items = result.items || [];
          if (!items.length) return toast('ما انقرت مواد');
          const m = modal(`<h3>راجع المواد المقروءة</h3><div id="it">${items.map((x, k) => `<div class="row"><input data-k="${k}" data-f="material" value="${esc(x.material)}" style="flex:3"><input data-k="${k}" data-f="qty" value="${esc(x.qty)}" style="flex:1"><input data-k="${k}" data-f="unit" value="${esc(x.unit || '')}" style="flex:1"></div>`).join('')}</div><label>مكان العمل</label><input id="wp"><div class="row" style="margin-top:10px"><button class="btn" id="ok">إرسال الطلبات</button></div>`);
          $('#ok', m).onclick = async function () {
            this.disabled = true;
            m.querySelectorAll('input[data-k]').forEach(el => items[el.dataset.k][el.dataset.f] = el.value);
            const rows = items.filter(x => x.material).map(x => ({ client_token: uid(), material: x.material, qty: Number(x.qty) || null, unit: x.unit, work_place: $('#wp', m).value, dept: ME.role, photo, from_vehicle_store: ME.role === 'dept_vehicles' || ME.role === 'store_vehicles' }));
            if (await run(sb.from('requests').insert(rows), 'انرسلت ' + rows.length + ' طلب')) { m.remove(); load(); }
          };
        } catch (e) { toast('⚠ ' + errMsg(e), 5000); }
      }; i.click();
    };
  };
  const newReq = () => openForm({
    title: 'طلب مادة', fields: [T('material', 'المادة', { req: 1 }), N('qty', 'الكمية'), T('unit', 'الوحدة'), T('work_place', 'مكان العمل'), bld, P('photo', 'صورة المادة'), A('notes', 'ملاحظات')],
    save: async (o) => { o.dept = ME.role; o.from_vehicle_store = ME.role === 'dept_vehicles' || ME.role === 'store_vehicles'; o.stage_by = ME.id; if (!(await run(sb.from('requests').insert(o), 'انرسل الطلب'))) return false; load(); },
  });
  await load();
}

/* ===================== المشتريات والفواتير ===================== */
const mSuppliers = crud({ title: 'الموردين', table: 'suppliers', order: 'name', cols: [['name', 'الاسم'], ['phone', 'الهاتف'], ['notes', 'ملاحظات']], fields: [T('name', 'الاسم', { req: 1 }), T('phone', 'الهاتف'), A('notes', 'ملاحظات')] });
const mPrices = crud({ title: 'تاريخ أسعار المواد', table: 'price_history', order: 'at', cols: [['at', 'التاريخ'], ['material', 'المادة'], ['supplier', 'المورد'], ['price', 'السعر', fmt]], fields: [T('material', 'المادة', { req: 1 }), T('supplier', 'المورد'), N('price', 'السعر', { req: 1 }), D('at', 'التاريخ', { def: today() })] });
const mInvoices = crud({
  title: 'الفواتير', table: 'invoices',
  cols: [['inv_date', 'التاريخ'], ['supplier', 'المورد'], ['invoice_no', 'الرقم'], ['total', 'المجموع', fmt], ['payment', 'الدفع', v => v === 'cash' ? 'نقد' : 'آجل'], ['building', 'البناية'], ['status', 'الحالة', v => tag({ draft: 'مسودة', review: 'بانتظار التدقيق', approved: 'معتمدة', rejected: 'مرفوضة' }[v], v === 'approved' ? '' : 'amb')], ['photo', 'صورة', link]],
  top: rows => `<div class="mut">مشترياتي: ${fmt(rows.filter(r => r.buyer === ME.id).reduce((a, r) => a + Number(r.total || 0), 0))} د.ع</div>`,
  fields: [T('supplier', 'المورد'), T('invoice_no', 'رقم الفاتورة'), D('inv_date', 'التاريخ', { def: today() }), N('total', 'المجموع'), S('payment', 'الدفع', [['cash', 'نقد'], ['credit', 'آجل']]), bld, P('photo', 'صورة الفاتورة'), A('notes', 'ملاحظات / الأسطر')],
  extra: () => `<div class="row"><button class="btn sec" id="aiinv">📷 قراءة الفاتورة بالذكاء الاصطناعي</button></div><div class="mut" id="aist"></div>`,
  onReady: (m) => {
    $('#aiinv', m).onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
      i.onchange = async () => {
        $('#aist', m).textContent = 'جاري القراءة...';
        try {
          const { result: r } = await aiRead('invoice', i.files[0]);
          $('#f_supplier', m).value = r.supplier || ''; $('#f_invoice_no', m).value = r.invoice_no || ''; $('#f_total', m).value = r.total || '';
          if (r.payment) $('#f_payment', m).value = r.payment === 'credit' ? 'credit' : 'cash';
          $('#f_notes', m).value = (r.lines || []).map(l => `${l.material} × ${l.qty} @ ${l.price}`).join('\n');
          m.dataset.lines = JSON.stringify(r.lines || []);
          const sum = (r.lines || []).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
          $('#aist', m).innerHTML = sum && r.total && Math.abs(sum - r.total) > 1 ? `<div class="warn">⚠ مجموع الأسطر (${fmt(sum)}) ما يطابق المجموع (${fmt(r.total)})</div>` : 'انقرت — راجعها قبل الحفظ';
          const f = $('#f_photo', m); const dt = new DataTransfer(); dt.items.add(i.files[0]); f.files = dt.files;
        } catch (e) { $('#aist', m).textContent = errMsg(e); }
      }; i.click();
    };
  },
  before: async (o) => {
    const m = document.querySelector('.modal'); const lines = m?.dataset.lines ? JSON.parse(m.dataset.lines) : [];
    o.lines = lines; o.buyer = ME.id; o.status = o.status || 'review';
    if (o.invoice_no && o.supplier) { const { data } = await sb.from('invoices').select('id').eq('supplier', o.supplier).eq('invoice_no', o.invoice_no).limit(1); if (data?.length && !confirm('⚠ فاتورة مكررة (نفس المورد والرقم). تحفظ؟')) return false; }
  },
  after: async (o) => {
    for (const l of (o.lines || [])) if (l.material && l.price) await sb.from('price_history').insert({ material: l.material, supplier: o.supplier, price: l.price, client_token: uid() });
    notify('فاتورة جديدة', `${o.supplier || ''} — ${fmt(o.total)}`);
    if (o.payment === 'cash' && o.status === 'approved') await sb.from('cash_ledger').insert({ direction: 'out', category: 'مشتريات', amount: o.total, ref: 'invoice', client_token: uid() });
  },
  rowBtns: [
    { label: 'تدقيق', show: r => r.status === 'review' && hasRole(['accounts_head']), fn: async (r, load) => { if (await run(sb.from('invoices').update({ status: 'approved' }).eq('id', r.id), 'اعتُمدت')) { if (r.payment === 'cash') await sb.from('cash_ledger').insert({ direction: 'out', category: 'مشتريات', amount: r.total, ref: 'inv:' + r.id, client_token: 'inv-' + r.id }); load(); } } },
    { label: 'رفض', show: r => r.status === 'review' && hasRole(['accounts_head']), fn: async (r, load) => { if (await run(sb.from('invoices').update({ status: 'rejected' }).eq('id', r.id))) load(); } },
  ],
});
async function mGps(root) {
  const { data } = await sb.from('gps_points').select('*').order('at', { ascending: false }).limit(200);
  const names = {}; (await sb.from('profiles').select('id,full_name,role')).data?.forEach(p => names[p.id] = p);
  const last = {}; (data || []).forEach(p => { if (!last[p.user_id]) last[p.user_id] = p; });
  root.innerHTML = `<div class="card"><h3>تتبع GPS (آخر موقع)</h3>${table([['user_id', 'الشخص', v => esc(names[v]?.full_name)], ['user_id', 'الصفة', v => esc(ROLES[names[v]?.role])], ['at', 'الوقت', fdate], ['lat', 'الخريطة', (v, r) => `<a target="_blank" href="https://maps.google.com/?q=${r.lat},${r.lng}">فتح</a>`]], Object.values(last))}<div class="mut">يشتغل لحاله على موبايل المشتري والسواق عند فتح التطبيق.</div></div>`;
}

/* ===================== الآليات والوقود ===================== */
const mVehicles = crud({
  title: 'الآليات', table: 'vehicles', order: 'name',
  cols: [['name', 'الآلية'], ['plate', 'اللوحة'], ['kind', 'النوع'], ['barcode', 'الباركود'], ['status', 'الحالة', v => ({ inside: tag('داخل'), out: tag('خارج', 'amb'), loaded: tag('محمّلة', 'red') }[v])]],
  fields: [T('name', 'اسم / رقم الآلية', { req: 1 }), T('plate', 'اللوحة'), T('kind', 'النوع'), N('fuel_rate', 'المعدل اليومي للكاز (لتر)'), A('notes', 'ملاحظات')],
  buttons: [{ label: '🖨 طباعة الباركودات', fn: async (rows) => printBarcodes(rows.map(r => ({ code: r.barcode, label: r.name }))) }],
  rowBtns: [{ label: 'كلفة', fn: async (r) => openForm({ title: 'كلفة — ' + r.name, fields: [S('kind', 'النوع', [['repair', 'تصليح'], ['parts', 'قطع غيار'], ['maintenance', 'صيانة']], { req: 1 }), N('amount', 'المبلغ', { req: 1 }), N('days', 'عدد الأيام (للصيانة)'), A('notes', 'ملاحظات')], save: async (o) => { o.vehicle_id = r.id; return await run(sb.from('vehicle_costs').insert(o), 'انسجلت') ? true : false; } }) },
  { label: 'سجل الكلفة', fn: async (r) => { const { data } = await sb.from('vehicle_costs').select('*').eq('vehicle_id', r.id).order('created_at', { ascending: false }); modal(`<h3>كلفة ${esc(r.name)}</h3>${table([['created_at', 'التاريخ', fdate], ['kind', 'النوع'], ['amount', 'المبلغ', fmt], ['days', 'أيام'], ['notes', 'ملاحظات']], data || [])}<b>المجموع: ${fmt((data || []).reduce((a, x) => a + Number(x.amount || 0), 0))}</b>`); } }],
});
async function printBarcodes(items) {
  if (!window.JsBarcode) await new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'; s.onload = r; document.head.appendChild(s); });
  const w = window.open('', '_blank');
  w.document.write(`<html dir="rtl"><body style="font-family:sans-serif"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${items.map((it, i) => `<div style="border:1px solid #999;padding:6px;text-align:center"><div>${esc(it.label)}</div><svg id="b${i}"></svg></div>`).join('')}</div></body></html>`);
  items.forEach((it, i) => window.JsBarcode(w.document.getElementById('b' + i), it.code, { height: 50, fontSize: 12 }));
  setTimeout(() => w.print(), 500);
}
const mFuel = (() => {
  const base = crud({
    title: 'الكاز', table: 'fuel_logs', select: '*,vehicles(name,fuel_rate)', edit: false, addRoles: ['fuel_officer', 'store_vehicles'],
    cols: [['created_at', 'الوقت', fdate], ['direction', 'الحركة', v => v === 'in' ? tag('استلام من المحطة') : tag('تعبئة آلية', 'amb')], ['vehicles', 'الآلية', v => esc(v?.name || '')], ['liters', 'اللترات', fmt], ['station', 'المحطة'], ['price_per_liter', 'سعر اللتر', fmt]],
    top: () => `<div id="fb" class="kpi" style="margin:8px 0"><span>رصيد الخزان</span><b>…</b></div>`,
    fields: [S('direction', 'الحركة', [['out', 'تعبئة آلية'], ['in', 'استلام من المحطة']], { req: 1 }), R('vehicle_id', 'الآلية', 'vehicles', 'name'), N('liters', 'اللترات', { req: 1 }), T('station', 'المحطة'), N('price_per_liter', 'سعر اللتر')],
    before: async (o) => {
      if (o.direction === 'out') {
        if (!o.vehicle_id) { toast('اختر الآلية'); return false; }
        const { data: v } = await sb.from('vehicles').select('fuel_rate,name').eq('id', o.vehicle_id).single();
        if (v?.fuel_rate && o.liters > v.fuel_rate && !confirm(`⚠ ${v.name}: ${o.liters} لتر أكثر من المعدل (${v.fuel_rate}). تكمل؟`)) return false;
        const { data: b } = await sb.from('fuel_balance').select('balance').maybeSingle();
        if (b && o.liters > b.balance && !confirm(`⚠ رصيد الخزان (${fmt(b.balance)}) أقل من المطلوب. تكمل؟`)) return false;
      }
    },
    buttons: [],
  });
  return async root => { await base(root); const { data } = await sb.from('fuel_balance').select('balance').maybeSingle(); const el = $('#fb b', root); if (el) el.textContent = fmt(data?.balance || 0) + ' لتر'; };
})();
