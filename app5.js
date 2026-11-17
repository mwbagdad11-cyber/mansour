/* ===================== المستخدمين ===================== */
async function mUsers(root) {
  const { data } = await sb.from('profiles').select('*').order('approved').order('created_at', { ascending: false });
  const { data: sites } = await sb.from('sites').select('*'); SITES = sites || [];
  const roleOpts = Object.entries(ROLES).filter(([k]) => k !== 'pending' && (isOwner() || !['owner', 'developer'].includes(k)));
  root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">المستخدمين والموافقات</h3><button class="btn sec" id="bc">🖨 باركودات الكادر</button></div>${table([['full_name', 'الاسم'], ['username', 'المستخدم'], ['phone', 'الهاتف'], ['role', 'الصفة', (v, r) => `<select data-r="${r.id}">${roleOpts.concat(r.role === 'pending' ? [['pending', 'بانتظار الموافقة']] : []).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`], ['site_id', 'الموقع', (v, r) => isOwner() ? `<select data-s="${r.id}">${SITES.map(s => `<option value="${s.id}" ${s.id === v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : esc(SITES.find(s => s.id === v)?.name)], ['approved', 'الحالة', v => v ? tag('مفعّل') : tag('ينتظر', 'amb')], ['login_number', 'رقم الدخول'], ['barcode', 'الباركود']], data || [], r => (r.approved ? `<button class="btn sec" data-x="${r.id}">إيقاف</button>` : `<button class="btn" data-ok="${r.id}">موافقة</button>`) + (isOwner() ? ` <button class="btn red" data-del="${r.id}">حذف</button>` : ''))}</div>`;
  root.querySelectorAll('[data-r]').forEach(s => s.onchange = async () => { const ok = await run(sb.from('profiles').update({ role: s.value }).eq('id', s.dataset.r), 'تغيّرت الصفة'); if (!ok) mUsers(root); });
  root.querySelectorAll('[data-s]').forEach(s => s.onchange = () => run(sb.from('profiles').update({ site_id: Number(s.value) }).eq('id', s.dataset.s), 'تغيّر الموقع'));
  root.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { const u = data.find(x => x.id === b.dataset.ok); const role = root.querySelector(`[data-r="${u.id}"]`).value; if (role === 'pending') return toast('اختر الصفة أولاً'); if (await run(sb.from('profiles').update({ approved: true, role }).eq('id', u.id), 'تمت الموافقة')) mUsers(root); });
  root.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { if (await run(sb.from('profiles').update({ approved: false }).eq('id', b.dataset.x), 'أُوقف')) mUsers(root); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف الحساب؟') && await run(sb.from('profiles').delete().eq('id', b.dataset.del), 'انحذف')) mUsers(root); });
  $('#bc', root).onclick = () => printBarcodes((data || []).filter(u => u.approved).map(u => ({ code: u.barcode, label: u.full_name })));
}
const mAudit = crud({ title: 'سجل التعديلات', table: 'audit_log', order: 'at', add: false, edit: false, del: false, cols: [['at', 'الوقت', fdate], ['table_name', 'الجدول'], ['action', 'العملية'], ['user_id', 'المستخدم', v => esc(String(v || '').slice(0, 8))], ['row_id', 'السطر', v => esc(String(v).slice(0, 8))]] });

/* ===================== الرئيسية ===================== */
async function mHome(root) {
  const cnt = async (t, f) => { let q = sb.from(t).select('*', { count: 'exact', head: true }); if (f) q = f(q); const { count } = await q; return count ?? 0; };
  const k = [];
  if (hasRole([...DEPT, ...STORE, ...PURCH, ...ADMIN])) { k.push(['طلبات مفتوحة', await cnt('requests', q => q.in('stage', ['submitted', 'store', 'purchasing']))]); }
  if (hasRole([...VEH, ...ADMIN])) k.push(['آليات خارج المجمع', await cnt('vehicles', q => q.eq('status', 'out'))]);
  if (hasRole([...STORE, ...ADMIN, 'security'])) k.push(['شاحنات واصلة', await cnt('incoming_trucks', q => q.eq('state', 'arrived'))]);
  if (hasRole([...ATT, ...ADMIN])) k.push(['حاضرين اليوم', await cnt('attendance', q => q.eq('day', today()).eq('present', true))]);
  if (hasRole(['accounts_head', ...ADMIN])) { const { data } = await sb.from('cash_ledger').select('direction,amount').neq('ref', 'legacy').eq('box', 'main'); k.push(['رصيد الصندوق', fmt((data || []).reduce((a, r) => a + (r.direction === 'in' ? 1 : -1) * Number(r.amount), 0))]); }
  if (hasRole(['sales_head', 'gm1', 'gm2'])) k.push(['حجوزات', await cnt('bookings')]);
  const { data: nt } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(15);
  root.innerHTML = `<div class="card"><b>أهلاً ${esc(ME.full_name)}</b><div class="mut">${esc(ROLES[ME.role])} — ${esc(SITES.find(s => s.id === ME.site_id)?.name || '')}</div></div><div class="grid">${k.map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
   <div class="card" style="margin-top:10px"><h3>الإشعارات</h3>${table([['created_at', 'الوقت', fdate], ['title', 'الإشعار'], ['body', 'التفاصيل', v => /^https?:/.test(v || '') ? link(v) : esc(v)]], nt || [])}</div>
   ${isOwner() ? '<div class="card"><button class="btn sec" id="bk">⬇ نسخة احتياطية Excel</button> <button class="btn sec" id="pr">🖨 طباعة</button> <button class="btn sec" id="late">فحص الطلبات المتأخرة</button></div>' : ''}`;
  if (isOwner()) {
    $('#pr', root).onclick = () => window.print();
    $('#late', root).onclick = async () => { await run(sb.rpc('notify_late_requests'), 'تم'); mount(); };
    $('#bk', root).onclick = async () => { const wb = XLSX.utils.book_new(); for (const t of ['materials', 'stock_moves', 'requests', 'invoices', 'vehicles', 'fuel_logs', 'gate_logs', 'workers', 'attendance', 'cash_ledger', 'advances', 'apartments', 'customers', 'bookings', 'sales_payments']) { const { data } = await sb.from(t).select('*').limit(10000); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data || []), t.slice(0, 31)); } XLSX.writeFile(wb, `نسخة-احتياطية-${today()}.xlsx`); };
  }
}

/* ===================== قائمة الوحدات حسب الصفة ===================== */
const MODS = [
  ['home', '🏠 الرئيسية', 'all', mHome],
  ['requests', 'الطلبات', [...DEPT, ...STORE, ...PURCH, ...ADMIN], mRequests],
  ['materials', 'المواد', [...STORE, ...ADMIN], mMaterials],
  ['moves', 'المدخلات والمخرجات', [...STORE, ...ADMIN], mMoves],
  ['stocktake', 'الجرد', [...STORE, ...ADMIN], mStocktake],
  ['trucks', 'الشاحنات الواصلة', [...STORE, 'security', ...ADMIN], mTrucks],
  ['invoices', 'الفواتير', [...PURCH, 'storekeeper', 'store_main', 'accounts_head', ...ADMIN], mInvoices],
  ['suppliers', 'الموردين', [...PURCH, 'accounts_head', ...ADMIN], mSuppliers],
  ['prices', 'أسعار المواد', [...PURCH, 'accounts_head', ...ADMIN], mPrices],
  ['gps', 'تتبع GPS', ['purchasing_head', ...ADMIN], mGps],
  ['gate', 'البوابة', ['security', ...ADMIN], mGate],
  ['external', 'الآليات الخارجية', ['security', ...ADMIN], mExternal],
  ['vehicles', 'الآليات', [...VEH, ...ADMIN], mVehicles],
  ['fuel', 'الكاز', ['fuel_officer', 'store_vehicles', ...ADMIN], mFuel],
  ['attendance', 'الحضور', [...ATT, ...ADMIN], mAttendance],
  ['workers', 'العمال', ['project_admin', 'accounts_head', ...ADMIN], mWorkers],
  ['payroll', 'الرواتب', ['project_admin', 'accounts_head', ...ADMIN], mPayroll],
  ['cash', 'الصندوق والدفتر', ['accounts_head', ...ADMIN], mCash],
  ['disb', 'صندوق الصرف', ['disbursement'], mDisb],
  ['advances', 'السلف', ['accounts_head', ...ADMIN], mAdvances],
  ['contractors', 'المقاولين', ['accounts_head', ...ADMIN], mContractorPay],
  ['station', 'سلفة الكاز', ['accounts_head', 'fuel_officer', ...ADMIN], mStation],
  ['bookings', 'الحجوزات', [...SALES, 'gm1', 'gm2', 'project_manager', 'accounts_head'], mBookings],
  ['apartments', 'الشقق', [...SALES, 'gm1', 'gm2', 'project_manager'], mApartments],
  ['customers', 'الزبائن والعقود', [...SALES, 'gm1', 'gm2', 'project_manager'], mCustomers],
  ['users', 'المستخدمين', ADMIN, mUsers],
  ['audit', 'سجل التعديلات', [], mAudit],
];
let mount = () => { };

/* ===================== الدخول والتسجيل ===================== */
function loginScreen() {
  $('#app').innerHTML = `<div class="login"><div class="card"><h2 style="text-align:center;margin:0 0 8px">نظام شركة المنصور</h2>
    <div class="tabs"><button class="btn" id="t1">دخول</button><button class="btn sec" id="t2">تسجيل جديد</button></div>
    <div id="box"></div><div class="err" id="er"></div></div></div>`;
  const log = () => {
    $('#box').innerHTML = `<label>اسم المستخدم أو رقم الدخول (8 أرقام) أو الباركود</label><input id="u" autocomplete="username"><label>كلمة السر</label><input id="p" type="password" autocomplete="current-password"><button class="btn" id="go" style="margin-top:12px;width:100%">دخول</button>`;
    $('#go').onclick = async () => {
      $('#er').textContent = ''; const code = $('#u').value.trim(); if (!code || !$('#p').value) return;
      const { data: em } = await sb.rpc('login_email', { code });
      const email = em || (code + '@mansour.local');
      const { error } = await sb.auth.signInWithPassword({ email, password: $('#p').value });
      if (error) $('#er').textContent = 'اسم المستخدم أو كلمة السر غلط'; else boot();
    };
  };
  const reg = () => {
    $('#box').innerHTML = `<label>الاسم الكامل</label><input id="n"><label>اسم المستخدم (إنكليزي بدون مسافات)</label><input id="u" autocapitalize="none"><label>رقم الهاتف</label><input id="ph" inputmode="tel"><label>كلمة السر (6 أحرف على الأقل)</label><input id="p" type="password"><label>الموقع</label><select id="s"><option value="1">المنصور ستي</option><option value="2">مجمع الأميرات ستي (الفلوجة)</option></select><button class="btn" id="go" style="margin-top:12px;width:100%">سجّل وانتظر الموافقة</button>`;
    $('#go').onclick = async () => {
      const u = $('#u').value.trim().toLowerCase(); if (!/^[a-z0-9._-]{3,}$/.test(u) || !$('#n').value) return $('#er').textContent = 'تأكد من الاسم واسم المستخدم (حروف إنكليزية وأرقام)';
      const { error } = await sb.auth.signUp({ email: u + '@mansour.local', password: $('#p').value, options: { data: { full_name: $('#n').value, phone: $('#ph').value, site_id: Number($('#s').value) } } });
      if (error) $('#er').textContent = errMsg(error); else { await sb.auth.signOut(); $('#box').innerHTML = '<div class="warn">انسجلت. انتظر موافقة المسؤول، وبعدها تدخل.</div>'; }
    };
  };
  $('#t1').onclick = () => { $('#t1').className = 'btn'; $('#t2').className = 'btn sec'; log(); };
  $('#t2').onclick = () => { $('#t2').className = 'btn'; $('#t1').className = 'btn sec'; reg(); };
  log();
}
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginScreen();
  const { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (!p) { await sb.auth.signOut(); return loginScreen(); }
  if (!p.approved) {
    $('#app').innerHTML = `<div class="login"><div class="card"><h3>حسابك بانتظار الموافقة</h3><p>رقم دخولك: <b>${esc(p.login_number)}</b><br>باركودك: <b>${esc(p.barcode)}</b></p><button class="btn" id="lo">خروج</button></div></div>`;
    $('#lo').onclick = async () => { await sb.auth.signOut(); loginScreen(); }; return;
  }
  ME = p; SITES = (await sb.from('sites').select('*')).data || [];
  const mods = MODS.filter(m => m[0] === 'audit' ? isOwner() : hasRole(m[2]));
  mount = async () => {
    $('#app').innerHTML = `<header><h1>نظام المنصور</h1>${isOwner() ? `<select id="sw">${SITES.map(s => `<option value="${s.id}" ${s.id === ME.site_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : `<span class="mut" style="color:#cfe">${esc(SITES.find(s => s.id === ME.site_id)?.name || '')}</span>`}<button id="lo">خروج</button></header>
      <nav>${mods.map(m => `<button data-v="${m[0]}" class="${m[0] === VIEW ? 'on' : ''}">${m[1]}</button>`).join('')}</nav><main id="main"></main>`;
    $('#lo').onclick = async () => { await sb.auth.signOut(); location.reload(); };
    const sw = $('#sw'); if (sw) sw.onchange = async () => { ME.site_id = Number(sw.value); await sb.from('profiles').update({ site_id: ME.site_id }).eq('id', ME.id); Object.keys(refCache).forEach(k => delete refCache[k]); mount(); };
    document.querySelectorAll('nav [data-v]').forEach(b => b.onclick = () => { VIEW = b.dataset.v; mount(); });
    const m = mods.find(x => x[0] === VIEW) || mods[0]; VIEW = m[0];
    const root = $('#main'); root.innerHTML = '<div class="mut">...</div>';
    try { await m[3](root); } catch (e) { root.innerHTML = `<div class="card err">${esc(errMsg(e))}</div>`; console.error(e); }
  };
  mount();
  // إشعارات فورية
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  sb.channel('nt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, pl => {
    if (pl.new.site_id !== ME.site_id && !isOwner()) return;
    toast('🔔 ' + pl.new.title + ' — ' + (pl.new.body || ''), 5000);
    try { if (Notification.permission === 'granted') new Notification(pl.new.title, { body: pl.new.body || '' }); } catch { }
  }).subscribe();
  // GPS للمشتريات والسواق
  if (['purchasing_head', 'buyer', 'driver'].includes(ME.role) && navigator.geolocation) {
    const send = () => navigator.geolocation.getCurrentPosition(p => sb.from('gps_points').insert({ lat: p.coords.latitude, lng: p.coords.longitude }), () => { }, { enableHighAccuracy: true });
    send(); setInterval(send, 120000);
  }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
boot();
