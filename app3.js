/* ===================== البوابة والأمنية ===================== */
async function mGate(root) {
  let veh = null;
  root.innerHTML = `<div class="card"><h3>البوابة — تسجيل آلية</h3>
    <label>امسح الباركود أو اكتبه</label><div class="row"><input id="code" placeholder="V-XXXXXX" style="flex:1"><button class="btn sec" id="cam">📷</button><button class="btn" id="find">بحث</button></div>
    <div id="info"></div></div><div class="card"><h3>آخر الحركات</h3><div id="log"></div></div>`;
  const log = async () => { const { data } = await sb.from('gate_logs').select('*,vehicles(name)').order('created_at', { ascending: false }).limit(30); $('#log', root).innerHTML = table([['created_at', 'الوقت', fdate], ['event', 'الحركة', v => v === 'exit' ? tag('خروج', 'amb') : tag('دخول')], ['vehicles', 'الآلية', v => esc(v?.name)], ['driver', 'السائق'], ['material', 'المادة'], ['qty', 'الكمية'], ['warning', 'تحذير', v => v ? tag(v, 'red') : '']], data || []); };
  const find = async () => {
    const code = $('#code', root).value.trim(); if (!code) return;
    const { data } = await sb.from('vehicles').select('*').or(`barcode.eq.${code},plate.eq.${code}`).limit(1);
    veh = data?.[0]; if (!veh) { $('#info', root).innerHTML = '<div class="warn">ما لكيت آلية بهذا الرمز</div>'; return; }
    $('#info', root).innerHTML = `<div class="kpi" style="margin:8px 0"><b>${esc(veh.name)}</b><span>${esc(veh.kind || '')} · ${esc(veh.plate || '')} · الحالة: ${veh.status === 'out' ? 'خارج' : 'داخل'}</span></div>
      <label>السائق</label><input id="drv"><label>المادة</label><input id="mat"><label>الكمية</label><input id="qty" type="number" inputmode="decimal">
      <div class="row" style="margin-top:12px"><button class="btn big" id="en" style="flex:1">تسجيل دخول آلية</button><button class="btn big amb" id="ex" style="flex:1">تسجيل خروج آلية</button></div>`;
    const go = ev => async function () {
      this.disabled = true;
      const { data: r, error } = await sb.from('gate_logs').insert({ client_token: uid(), vehicle_id: veh.id, event: ev, driver: $('#drv', root).value, material: $('#mat', root).value, qty: Number($('#qty', root).value) || null }).select().single();
      if (error) { toast('⚠ ' + errMsg(error), 4000); this.disabled = false; return; }
      toast(r.warning ? '⚠ ' + r.warning : 'انسجل'); $('#info', root).innerHTML = r.warning ? `<div class="warn">⚠ ${esc(r.warning)}</div>` : ''; $('#code', root).value = ''; log();
    };
    $('#en', root).onclick = go('enter'); $('#ex', root).onclick = go('exit');
  };
  $('#find', root).onclick = find; $('#code', root).onkeydown = e => { if (e.key === 'Enter') find(); };
  $('#cam', root).onclick = async () => {
    if (!('BarcodeDetector' in window)) return toast('الكاميرا للباركود غير مدعومة بهذا المتصفح — اكتب الرمز');
    const det = new BarcodeDetector(); const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const m = modal('<video id="v" autoplay playsinline style="width:100%"></video>'); const v = $('#v', m); v.srcObject = st;
    const t = setInterval(async () => { try { const c = await det.detect(v); if (c.length) { clearInterval(t); st.getTracks().forEach(x => x.stop()); m.remove(); $('#code', root).value = c[0].rawValue; find(); } } catch { } }, 400);
    m.addEventListener('click', () => { clearInterval(t); st.getTracks().forEach(x => x.stop()); });
  };
  log();
}
const mExternal = crud({
  title: 'الآليات الخارجية', table: 'external_vehicles', order: 'entered_at',
  cols: [['entered_at', 'الدخول', fdate], ['plate', 'اللوحة'], ['company', 'الجهة'], ['reason', 'السبب'], ['is_supply', 'توريد', v => v ? tag('توريد') : ''], ['banned', 'ممنوعة', v => v ? tag('ممنوعة', 'red') : ''], ['exited_at', 'الخروج', (v, r) => v ? `${fdate(v)} ${r.exit_state === 'loaded' ? tag(r.exit_permit ? 'محمّلة بإذن' : 'محمّلة بدون إذن', r.exit_permit ? '' : 'red') : tag('فارغة')}` : (Date.now() - new Date(r.entered_at) > 144e5 ? tag('باقية > 4 ساعات', 'red') : tag('داخل', 'amb'))]],
  fields: [T('plate', 'رقم اللوحة', { req: 1 }), T('kind', 'نوع السيارة'), T('company', 'الشركة / الجهة'), T('reason', 'سبب الدخول'), T('destination', 'الوجهة'), { k: 'is_supply', label: 'توريد مواد (تظهر شاحنة واصلة للمخزن)', t: 'check' }, P('plate_photo', 'صورة اللوحة')],
  extra: () => `<div class="row"><button class="btn sec" id="aiplate">📷 قراءة اللوحة</button></div>`,
  onReady: m => { $('#aiplate', m).onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = async () => { try { const { result: r } = await aiRead('plate', i.files[0]); $('#f_plate', m).value = r.plate || ''; $('#f_kind', m).value = r.kind || ''; const { data } = await sb.from('external_vehicles').select('*').eq('plate', r.plate).order('entered_at', { ascending: false }).limit(1); if (data?.[0]) { $('#f_company', m).value = data[0].company || ''; $('#f_kind', m).value = data[0].kind || r.kind || ''; toast('سيارة معروفة — انعبّت معلوماتها'); } const dt = new DataTransfer(); dt.items.add(i.files[0]); $('#f_plate_photo', m).files = dt.files; } catch (e) { toast(errMsg(e)); } }; i.click(); }; },
  rowBtns: [{ label: 'خروج فارغة', show: r => !r.exited_at, fn: async (r, l) => { if (await run(sb.from('external_vehicles').update({ exited_at: new Date().toISOString(), exit_state: 'empty' }).eq('id', r.id), 'انسجل')) l(); } },
  { label: 'خروج محمّلة', show: r => !r.exited_at, fn: async (r, l) => { const p = confirm('عندها إذن إخراج؟ (موافق = نعم)'); if (await run(sb.from('external_vehicles').update({ exited_at: new Date().toISOString(), exit_state: 'loaded', exit_permit: p }).eq('id', r.id), 'انسجل')) l(); } },
  { label: 'منع', show: r => !r.banned, fn: async (r, l) => { const why = prompt('سبب المنع؟'); if (why === null) return; await sb.from('banned_plates').insert({ plate: r.plate, reason: why }); toast('انضافت للممنوعين'); l(); } }],
  buttons: [{ label: 'ملخص الشركات', fn: rows => { const g = {}; rows.forEach(r => { const k = r.company || '—'; g[k] = (g[k] || 0) + 1; }); modal(`<h3>ملخص لكل شركة</h3>${table([['k', 'الشركة'], ['n', 'عدد الدخلات']], Object.entries(g).map(([k, n]) => ({ k, n })))}`); } }],
});

/* ===================== الحضور والكادر ===================== */
const L = { ar: { title: 'سجل الحضور', day: 'التاريخ', present: 'حاضر', absent: 'غائب', save: 'حفظ', hours: 'الساعات', trade: 'المهنة', no: 'الرقم' }, en: { title: 'Attendance', day: 'Date', present: 'Present', absent: 'Absent', save: 'Save', hours: 'Hours', trade: 'Trade', no: 'No.' }, ku: { title: 'تۆماری ئامادەبوون', day: 'بەروار', present: 'ئامادە', absent: 'غائیب', save: 'پاشەکەوت', hours: 'کاتژمێر', trade: 'پیشە', no: 'ژمارە' } };
let LANG = localStorage.lang || 'ar';
async function mAttendance(root) {
  const t = L[LANG]; const canUp = hasRole([...ADMIN, 'foreman', 'attendance_clerk']);
  const { data: workers } = await sb.from('workers').select('*').eq('active', true).order('name');
  let day = root.dataset.day || today();
  const load = async () => {
    const { data: att } = await sb.from('attendance').select('*').eq('day', day);
    const am = {}; (att || []).forEach(a => am[a.worker_id] = a);
    const groups = {}; (workers || []).forEach(w => (groups[w.nationality || '—'] = groups[w.nationality || '—'] || []).push(w));
    root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">${t.title}</h3><select id="lg" style="width:auto"><option value="ar">عربي</option><option value="en">English</option><option value="ku">کوردی</option></select></div>
      <div class="row"><label>${t.day}</label><input type="date" id="day" value="${day}" style="width:auto"></div>
      ${canUp ? `<div class="row" style="margin:8px 0"><button class="btn sec" id="fp">⬆ ملف البصمة</button><button class="btn sec" id="fm">📷 ورقة الفورمن</button><button class="btn sec" id="wf">⬆ ملف العمال</button></div>` : ''}
      ${Object.entries(groups).map(([nat, ws]) => { const pres = ws.filter(w => (am[w.id]?.present ?? false)).length; return `<h4>${esc(nat)}</h4>${table([['name', 'الاسم'], ['trade', t.trade], ['number', t.no], ['id', t.present, (v, w) => `<input type="checkbox" data-w="${w.id}" ${am[w.id]?.present ? 'checked' : ''} ${canUp ? '' : 'disabled'}>${am[w.id]?.needs_review ? ' ⚠' : ''}`]], ws)}<div class="mut">${t.present}: ${pres} — ${t.absent}: ${ws.length - pres}</div>`; }).join('')}
      ${canUp ? `<button class="btn" id="sv" style="margin-top:10px">${t.save}</button>` : ''}</div>`;
    $('#lg', root).value = LANG; $('#lg', root).onchange = e => { LANG = localStorage.lang = e.target.value; mAttendance(root); };
    $('#day', root).onchange = e => { day = root.dataset.day = e.target.value; load(); };
    const sv = $('#sv', root);
    if (sv) sv.onclick = async () => {
      const rows = [...root.querySelectorAll('[data-w]')].map(c => ({ worker_id: c.dataset.w, day, present: c.checked, source: 'manual', recorded_by: ME.id, site_id: ME.site_id }));
      if (await run(sb.from('attendance').upsert(rows, { onConflict: 'worker_id,day' }), 'انحفظ الحضور')) load();
    };
    const pickFile = (accept, fn) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => fn(i.files[0]); i.click(); };
    if ($('#fp', root)) $('#fp', root).onclick = () => pickFile('.xlsx,.xls,.csv', async f => {
      const wbk = XLSX.read(await f.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wbk.Sheets[wbk.SheetNames[0]], { header: 1 });
      const found = new Map(), un = [];
      for (const r of rows.slice(1)) {
        const nm = r.find(c => typeof c === 'string' && /[^\d\s:\-\/]/.test(c)); const fid = r.find(c => typeof c === 'number' || /^\d+$/.test(String(c)));
        if (!nm) continue;
        let best = null, sc = 0; (workers || []).forEach(w => { const s = nameScore(nm, w.name); if (s > sc) { sc = s; best = w; } });
        const wk = (workers || []).find(w => fid && w.fingerprint_id == fid) || (sc >= 0.5 ? best : null);
        if (wk) { found.set(wk.id, fid); } else un.push(nm);
      }
      const rowsA = [...found.keys()].map(id => ({ worker_id: id, day, present: true, source: 'fingerprint', site_id: ME.site_id, recorded_by: ME.id }));
      if (rowsA.length) await run(sb.from('attendance').upsert(rowsA, { onConflict: 'worker_id,day' }));
      for (const [id, fid] of found) if (fid) await sb.from('workers').update({ fingerprint_id: String(fid) }).eq('id', id);
      toast(`تطابق ${found.size} — غير متطابق ${un.length}`, 5000); if (un.length) modal(`<h3>أسماء ما تطابقت</h3><div>${un.map(esc).join('<br>')}</div>`); load();
    });
    if ($('#fm', root)) $('#fm', root).onclick = () => pickFile('image/*', async f => {
      toast('جاري قراءة الورقة مرتين للتدقيق...', 8000);
      try {
        const { result, second, agree } = await aiRead('attendance_sheet', f, true);
        const photo = await upload(f); const rows = [], dbl = [];
        (result.rows || []).forEach((r, i) => {
          let best = null, sc = 0; (workers || []).forEach(w => { const s = nameScore(r.name, w.name); if (s > sc) { sc = s; best = w; } });
          const other = second?.rows?.[i]; const mismatch = !other || other.absent !== r.absent;
          if (best && sc >= 0.5) rows.push({ worker_id: best.id, day, present: !r.absent, source: 'foreman_sheet', needs_review: mismatch || sc < 0.8, site_id: ME.site_id, recorded_by: ME.id }); else dbl.push(r.name);
        });
        if (rows.length) await run(sb.from('attendance').upsert(rows, { onConflict: 'worker_id,day' }), `انسجل ${rows.length}${agree ? '' : ' (فيه فروق بين القراءتين — علّمتها ⚠)'}`);
        await sb.from('notifications').insert({ site_id: ME.site_id, title: 'ورقة فورمن تحتاج تثبيت', body: photo, kind: 'attendance' });
        if (dbl.length) modal(`<h3>مشكوك بيهم</h3>${dbl.map(esc).join('<br>')}`); load();
      } catch (e) { toast('⚠ ' + errMsg(e), 5000); }
    });
    if ($('#wf', root)) $('#wf', root).onclick = () => pickFile('.xlsx,.xls,.csv', async f => {
      const wb = XLSX.read(await f.arrayBuffer()); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let upd = 0, add = 0;
      for (const r of rows) {
        const name = r['الاسم'] || r.name || r.Name; if (!name) continue;
        const rec = { name: String(name).trim(), nationality: r['الجنسية'] || r.nationality || 'عراقي', trade: r['المهنة'] || r.trade, number: r['الرقم'] ? String(r['الرقم']) : null, daily_wage: Number(r['الأجر'] || r.wage) || 0 };
        let best = null, sc = 0; (workers || []).forEach(w => { const s = nameScore(rec.name, w.name); if (s > sc) { sc = s; best = w; } });
        if (best && sc >= 0.85) { await sb.from('workers').update(rec).eq('id', best.id); upd++; } else { await sb.from('workers').insert({ ...rec, client_token: uid() }); add++; }
      }
      toast(`حُدّث ${upd} — أضيف ${add}`); mAttendance(root);
    });
  };
  await load();
}
const mWorkers = crud({
  title: 'العمال والكادر', table: 'workers', order: 'name',
  cols: [['name', 'الاسم'], ['nationality', 'الجنسية'], ['trade', 'المهنة'], ['number', 'الرقم'], ['daily_wage', 'الأجر اليومي', fmt], ['contractor', 'المقاول'], ['active', 'فعّال', v => v ? '✓' : '✗']],
  fields: [T('name', 'الاسم', { req: 1 }), T('nationality', 'الجنسية', { def: 'عراقي' }), T('trade', 'المهنة'), T('number', 'الرقم'), N('daily_wage', 'الأجر اليومي'), T('contractor', 'المقاول'), { k: 'active', label: 'فعّال', t: 'check', def: true }],
});
const mPayroll = crud({
  title: 'الرواتب والسلف والخصومات', table: 'payroll_items', select: '*,workers(name)',
  cols: [['created_at', 'التاريخ', fdate], ['workers', 'العامل', v => esc(v?.name)], ['kind', 'النوع', v => ({ salary: 'راتب', deduction: 'خصم', advance: 'سلفة', cut: 'قطع راتب' }[v])], ['amount', 'المبلغ', fmt], ['period', 'الفترة'], ['posted', 'مرحّل', v => v ? tag('مرحّل') : tag('لا', 'amb')], ['notes', 'ملاحظات']],
  fields: [R('worker_id', 'العامل', 'workers', 'name', { req: 1 }), S('kind', 'النوع', [['salary', 'راتب'], ['deduction', 'خصم'], ['advance', 'سلفة'], ['cut', 'قطع راتب']], { req: 1 }), N('amount', 'المبلغ', { req: 1 }), T('period', 'الفترة (مثال 2026-11)'), A('notes', 'ملاحظات')],
  buttons: [{ label: '💰 احتساب الأجور اليومية للفترة', fn: async () => { const per = prompt('الفترة (مثال 2026-11):', today().slice(0, 7)); if (!per) return; const { data: ws } = await sb.from('workers').select('*').eq('active', true); const { data: at } = await sb.from('attendance').select('*').gte('day', per + '-01').lte('day', per + '-31').eq('present', true); const rows = (ws || []).map(w => { const days = (at || []).filter(a => a.worker_id === w.id); const hrs = days.reduce((s, a) => s + Number(a.hours || 8), 0); return { client_token: `sal-${per}-${w.id}`, worker_id: w.id, kind: 'salary', amount: Math.round(Number(w.daily_wage || 0) * hrs / 8), period: per, notes: `${days.length} يوم / ${hrs} ساعة` }; }).filter(r => r.amount > 0); if (await run(sb.from('payroll_items').upsert(rows, { onConflict: 'client_token', ignoreDuplicates: true }), 'انحسبت ' + rows.length)) mount(); } },
  { label: '⇨ ترحيل للصندوق', fn: async (rows) => { const pend = rows.filter(r => r.kind === 'salary' && !r.posted); const tot = pend.reduce((a, r) => a + Number(r.amount), 0); if (!pend.length || !confirm(`ترحيل ${fmt(tot)} د.ع للصندوق؟`)) return; const ok = await run(sb.from('cash_ledger').insert({ direction: 'out', category: 'رواتب', amount: tot, client_token: 'pay-' + uid(), notes: `${pend.length} راتب` })); if (ok) { await sb.from('payroll_items').update({ posted: true }).in('id', pend.map(r => r.id)); toast('رُحّلت'); mount(); } } }],
});
