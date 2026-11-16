'use strict';
/* ===================== نظام شركة المنصور — الواجهة ===================== */
const C = window.APP_CONFIG;
const sb = supabase.createClient(C.url, C.key);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
const today = () => new Date().toISOString().slice(0, 10);
const fdate = d => d ? new Date(d).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' }) : '';
let ME = null, VIEW = 'home', SITES = [];

const ROLES = { owner: 'المالك', developer: 'مطوّر', project_manager: 'مدير المشروع', gm1: 'المدير العام الأول', gm2: 'المدير العام الثاني', project_admin: 'مسؤول إدارة المشروع', dept_electric: 'قسم الكهرباء', dept_mech: 'قسم الميكانيك', dept_vehicles: 'قسم الآليات', store_main: 'المخزن الرئيسي', store_vehicles: 'مخزن الآليات', storekeeper: 'أمين المخزن', receiver: 'مستلم المواد', prep: 'التجهيز', purchasing_head: 'مسؤول المشتريات', buyer: 'المشتري', operator: 'المشغّل', driver: 'السائق', mechanic: 'الميكانيكي', fuel_officer: 'مسؤول الوقود', security: 'الأمنية', foreman: 'الفورمن', attendance_clerk: 'مسجّل الحضور', engineer: 'المهندس', contractor: 'المقاول', accounts_head: 'مسؤول الحسابات', disbursement: 'مسؤولة الصرف', sales_head: 'مسؤول المبيعات', sales_staff: 'موظف المبيعات', pending: 'بانتظار الموافقة' };
const ADMIN = ['project_manager', 'gm1', 'gm2', 'project_admin'];
const DEPT = ['dept_electric', 'dept_mech', 'dept_vehicles'];
const STORE = ['store_main', 'store_vehicles', 'storekeeper', 'receiver', 'prep'];
const PURCH = ['purchasing_head', 'buyer'];
const VEH = ['operator', 'driver', 'mechanic', 'fuel_officer', 'security', 'store_vehicles', 'dept_vehicles', 'prep'];
const ATT = ['foreman', 'attendance_clerk', 'engineer', 'contractor', 'project_admin'];
const SALES = ['sales_head', 'sales_staff'];
const isOwner = () => ME && ['owner', 'developer'].includes(ME.role);
const hasRole = (rs) => isOwner() || (rs === 'all') || rs.includes(ME.role);

/* ---------- أدوات عامة ---------- */
function toast(msg, ms = 2800) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function errMsg(e) {
  if (!e) return '';
  if (e.code === '23505') return 'انحفظ من قبل (تكرار)';
  if (e.code === '42501') return 'ما عندك صلاحية لهذا الإجراء';
  return e.message || String(e);
}
async function run(p, okMsg) {
  const r = await p;
  if (r.error) { toast('⚠ ' + errMsg(r.error), 4500); return null; }
  if (okMsg) toast(okMsg);
  return r.data ?? true;
}
function notify(title, body) { sb.from('notifications').insert({ site_id: ME.site_id, title, body, kind: 'info' }); }
function norm(s) {
  return String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
function nameScore(a, b) {
  const A = norm(a).split(' '), B = norm(b).split(' ');
  if (!A[0] || !B[0]) return 0;
  const hit = A.filter(x => B.some(y => y === x || (x.length > 2 && y.length > 2 && (x.startsWith(y) || y.startsWith(x))))).length;
  return hit / Math.max(A.length, B.length);
}
const phoneWA = p => { p = String(p || '').replace(/\D/g, ''); return p.startsWith('0') ? '964' + p.slice(1) : p; };

async function upload(file) {
  const ext = (file.name.split('.').pop() || 'jpg').replace(/\W/g, '');
  const p = `${ME.site_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from(C.bucket).upload(p, file);
  if (error) throw error;
  return sb.storage.from(C.bucket).getPublicUrl(p).data.publicUrl;
}
function toB64(file) {
  return new Promise((res, rej) => {
    if (!file.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => res({ data: r.result.split(',')[1], type: file.type }); r.onerror = rej; r.readAsDataURL(file); return; }
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = img.width * k; cv.height = img.height * k;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      res({ data: cv.toDataURL('image/jpeg', .85).split(',')[1], type: 'image/jpeg' }); URL.revokeObjectURL(u);
    };
    img.onerror = rej; img.src = u;
  });
}
// قراءة بالذكاء الاصطناعي. twice=true → قراءتين ومقارنة (للحضور والكاز)
async function aiRead(kind, file, twice = false) {
  const b = await toB64(file);
  const call = () => sb.functions.invoke('ai-read', { body: { kind, data: b.data, media_type: b.type } });
  const [a, c] = twice ? await Promise.all([call(), call()]) : [await call(), null];
  if (a.error) throw new Error('فشلت القراءة: ' + (a.error.message || ''));
  return { result: a.data, second: c && c.data, agree: c ? JSON.stringify(a.data) === JSON.stringify(c.data) : true };
}

/* ---------- نموذج عام (نافذة) ---------- */
const refCache = {};
async function refOpts(table, lab = 'name', filter) {
  const key = table + lab;
  if (!refCache[key] || refCache[key].t < Date.now() - 20000) {
    let q = sb.from(table).select('*').limit(1000); if (filter) q = filter(q);
    const { data } = await q; refCache[key] = { t: Date.now(), d: data || [] };
  }
  return refCache[key].d.map(r => [r.id, typeof lab === 'function' ? lab(r) : r[lab]]);
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); return m;
}
async function openForm({ title, fields, init = {}, save, extra = '', onReady }) {
  for (const f of fields) if (f.t === 'ref') f.opts = await refOpts(f.ref, f.lab || 'name', f.filter);
  const token = uid();
  const row = f => {
    const v = init[f.k] ?? f.def ?? '';
    const id = 'f_' + f.k;
    let inp;
    if (f.t === 'select' || f.t === 'ref') inp = `<select id="${id}">${f.t === 'ref' || !f.req ? '<option value="">—</option>' : ''}${(f.opts || []).map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    else if (f.t === 'area') inp = `<textarea id="${id}">${esc(v)}</textarea>`;
    else if (f.t === 'check') inp = `<input type="checkbox" id="${id}" ${v ? 'checked' : ''}>`;
    else if (f.t === 'photo') inp = `<input type="file" id="${id}" accept="image/*,application/pdf" capture="environment">`;
    else inp = `<input id="${id}" type="${f.t || 'text'}" value="${esc(v)}" ${f.t === 'number' ? 'inputmode="decimal" step="any"' : ''}>`;
    return `<label>${esc(f.label)}${f.req ? ' *' : ''}</label>${inp}`;
  };
  const m = modal(`<h3>${esc(title)}</h3>${extra}${fields.map(row).join('')}<div class="row" style="margin-top:12px"><button class="btn" id="fsave">حفظ</button><button class="btn sec" id="fcancel">إلغاء</button></div><div class="err" id="ferr"></div>`);
  $('#fcancel', m).onclick = () => m.remove();
  const read = async () => {
    const o = {};
    for (const f of fields) {
      const el = $('#f_' + f.k, m);
      if (f.t === 'check') o[f.k] = el.checked;
      else if (f.t === 'photo') o[f.k] = el.files[0] ? await upload(el.files[0]) : (init[f.k] || null);
      else if (f.t === 'number') o[f.k] = el.value === '' ? null : Number(el.value);
      else o[f.k] = el.value === '' ? null : el.value;
      if (f.req && (o[f.k] === null || o[f.k] === '')) throw new Error('عبّي: ' + f.label);
    }
    return o;
  };
  $('#fsave', m).onclick = async function () {
    this.disabled = true; $('#ferr', m).textContent = '';
    try { const o = await read(); o.client_token = token; const ok = await save(o, m); if (ok !== false) m.remove(); else this.disabled = false; }
    catch (e) { $('#ferr', m).textContent = errMsg(e); this.disabled = false; }
  };
  if (onReady) onReady(m);
  return m;
}

/* ---------- جدول عام ---------- */
function table(cols, rows, actions) {
  return `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join('')}${actions ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((r, i) =>
    `<tr>${cols.map(c => `<td>${c[2] ? c[2](r[c[0]], r) : esc(r[c[0]])}</td>`).join('')}${actions ? `<td>${actions(r, i)}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="mut">ما كو بيانات</td></tr>`}</tbody></table></div>`;
}
const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;

/* موديول عام CRUD */
function crud(cfg) {
  return async function (root) {
    const load = async () => {
      let q = sb.from(cfg.table).select(cfg.select || '*').order(cfg.order || 'created_at', { ascending: false }).limit(300);
      if (cfg.filter) q = cfg.filter(q);
      const { data, error } = await q;
      if (error) { root.innerHTML = `<div class="card err">${esc(errMsg(error))}</div>`; return; }
      draw(data || []);
    };
    const draw = rows => {
      root.innerHTML = `<div class="card"><div class="row"><h3 style="flex:1;margin:0">${cfg.title}</h3>${cfg.add !== false && (!cfg.addRoles || hasRole(cfg.addRoles)) ? '<button class="btn" id="add">+ جديد</button>' : ''}${(cfg.buttons || []).map((b, i) => `<button class="btn sec" data-b="${i}">${b.label}</button>`).join('')}</div>
        ${cfg.top ? cfg.top(rows) : ''}<input id="q" placeholder="بحث..." style="margin:8px 0"><div id="tb"></div></div>`;
      const paint = () => {
        const q = norm($('#q', root).value);
        const f = rows.filter(r => !q || norm(JSON.stringify(Object.values(r))).includes(q));
        $('#tb', root).innerHTML = table(cfg.cols, f, r => {
          let s = '';
          if (cfg.edit !== false) s += `<button class="btn sec" data-e="${r.id}">تعديل</button> `;
          (cfg.rowBtns || []).forEach((b, i) => { if (!b.show || b.show(r)) s += `<button class="btn sec" data-r="${i}|${r.id}">${b.label}</button> `; });
          if (isOwner() && cfg.del !== false) s += `<button class="btn red" data-d="${r.id}">حذف</button>`;
          return s;
        });
        root.querySelectorAll('[data-e]').forEach(b => b.onclick = () => edit(rows.find(r => r.id === b.dataset.e)));
        root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('حذف نهائي؟')) { if (await run(sb.from(cfg.table).delete().eq('id', b.dataset.d), 'انحذف')) load(); } });
        root.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { const [i, id] = b.dataset.r.split('|'); await cfg.rowBtns[i].fn(rows.find(r => r.id === id), load); });
      };
      $('#q', root).oninput = paint; paint();
      const a = $('#add', root); if (a) a.onclick = () => edit(null);
      root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => cfg.buttons[b.dataset.b].fn(rows, load));
    };
    const edit = async (rec) => {
      await openForm({
        title: (rec ? 'تعديل — ' : 'جديد — ') + cfg.title, fields: cfg.fields.map(f => ({ ...f })), init: rec || cfg.init || {},
        extra: cfg.extra ? cfg.extra(rec) : '',
        onReady: cfg.onReady,
        save: async (o) => {
          if (cfg.before) { const r = await cfg.before(o, rec); if (r === false) return false; }
          const r = rec ? await run(sb.from(cfg.table).update(o).eq('id', rec.id), 'انحفظ')
            : await run(sb.from(cfg.table).insert(o).select(), 'انحفظ');
          if (!r) return false;
          if (cfg.after) await cfg.after(o, r);
          load();
        }
      });
    };
    await load();
  };
}
const T = (k, label, extra = {}) => ({ k, label, t: 'text', ...extra });
const N = (k, label, extra = {}) => ({ k, label, t: 'number', ...extra });
const D = (k, label, extra = {}) => ({ k, label, t: 'date', ...extra });
const S = (k, label, opts, extra = {}) => ({ k, label, t: 'select', opts, ...extra });
const A = (k, label) => ({ k, label, t: 'area' });
const P = (k, label) => ({ k, label, t: 'photo' });
const R = (k, label, ref, lab, extra = {}) => ({ k, label, t: 'ref', ref, lab, ...extra });
const BUILDINGS = Array.from({ length: 22 }, (_, i) => ['T' + (i + 1), 'T' + (i + 1)]);
const bld = S('building', 'البناية', [['', '—'], ...BUILDINGS]);
const link = u => u ? `<a href="${esc(u)}" target="_blank">📎</a>` : '';
