'use strict';
/* لوحة تحكم العميل */
let me;
let devices = [];
const GATE_MODES = { whitelist: 'فتح تلقائي للمسموح لهم فقط', all: 'فتح للجميع عدا المحظورين', manual: 'فتح يدوي فقط' };

async function init() {
  me = await api('/api/me');
  if (me.role === 'admin') { location.href = '/admin'; return; }
  $('#who').textContent = me.customer_name || me.name;
  $('#avatar').textContent = (me.customer_name || me.name || 'أ').trim()[0];
  $('#add-plate').innerHTML = ICONS.plus + ' إضافة';
  setupNotifBtn();

  setupTabs([
    { id: 'home', label: 'الرئيسية', icon: 'home' },
    { id: 'history', label: 'السجل', icon: 'history', title: 'سجل المركبات' },
    { id: 'lists', label: 'اللوحات', icon: 'plate', title: 'قوائم اللوحات' },
    { id: 'settings', label: 'الإعدادات', icon: 'settings' },
  ], (id) => ({ home: loadHome, history: () => loadHistory(true), lists: loadLists, settings: loadSettings })[id]());

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); $(`.tabbar [data-tab="${go.dataset.go}"]`).click(); }
    const item = e.target.closest('.item[data-plate]');
    if (item && !e.target.closest('img,button')) plateActions(item.dataset.plate);
  });

  live({
    read: (r) => {
      const feed = $('#feed');
      $('.empty', feed)?.remove();
      feed.insertAdjacentHTML('afterbegin', readItem(r, { isNew: true }));
      while (feed.children.length > 10) feed.lastElementChild.remove();
      if (r.list_status === 'block') notify('تنبيه: مركبة محظورة', `${r.plate_display} عند ${r.device_name || r.serial}`);
      refreshStats();
    },
    gate: (g) => toast(`تم فتح البوابة (${g.by})`),
    device_status: (d) => {
      if (!d.online) notify('انقطع اتصال جهاز', d.name || d.serial);
      loadDevices();
    },
  });
}

// ---------- الرئيسية ----------
async function refreshStats() {
  const s = await api('/api/stats');
  $('#stats').innerHTML = [
    ['g', 'car', 'مركبات اليوم', s.today.reads],
    ['g', 'gate', 'مرات فتح البوابة', s.today.opened],
    ['r', 'ban', 'محاولات محظورة', s.today.blocked],
    ['b', 'camera', 'الأجهزة المتصلة', `${s.devices.online}/${s.devices.total}`],
  ].map(([c, i, l, v]) => `<div class="card stat"><div class="ic ${c}">${ICONS[i]}</div><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
  bars($('#hours'), s.hours);
}

async function loadDevices() {
  devices = await api('/api/devices');
  $('#hf-dev').innerHTML = '<option value="">كل الأجهزة</option>' + devices.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#devices').innerHTML = devices.length ? devices.map((d) => `
    <div class="card device ${d.online ? 'online' : ''}">
      <div class="head">
        <div class="icon">${ICONS.camera}</div>
        <div class="grow"><div class="name">${esc(d.name)}</div><div class="meta">${esc(d.location || '')} ${d.location ? '·' : ''} ${d.reads_today} اليوم</div></div>
        <span class="badge ${d.online ? 'on' : 'off'}">${d.online ? 'متصل' : 'غير متصل'}</span>
      </div>
      <button class="gate-btn" data-open="${d.id}" ${d.online ? '' : 'disabled'}>${ICONS.gate} فتح البوابة</button>
    </div>`).join('') : '<div class="card empty">لا توجد أجهزة مرتبطة بحسابك بعد. تواصل مع الدعم لربط أجهزتك.</div>';
  $$('[data-open]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    await act(() => api(`/api/devices/${b.dataset.open}/open`, { method: 'POST' }), 'تم إرسال أمر الفتح');
    setTimeout(() => { b.disabled = false; }, 2500);
  });
}

async function loadHome() {
  refreshStats();
  loadDevices();
  const { rows } = await api('/api/reads?limit=10');
  $('#feed').innerHTML = rows.length ? rows.map((r) => readItem(r)).join('') : '<div class="empty">لم تُسجَّل أي مركبة بعد</div>';
}

// ---------- السجل ----------
let hOffset = 0;
function hParams() {
  const p = new URLSearchParams(formData($('#hf')));
  for (const [k, v] of [...p]) if (!v) p.delete(k);
  return p;
}
async function loadHistory(reset) {
  if (reset) hOffset = 0;
  const p = hParams();
  p.set('limit', 50); p.set('offset', hOffset);
  const { rows, total } = await api('/api/reads?' + p);
  const html = rows.map((r) => readItem(r)).join('');
  if (reset) $('#hlist').innerHTML = html || '<div class="empty">لا توجد نتائج</div>';
  else $('#hlist').insertAdjacentHTML('beforeend', html);
  hOffset += rows.length;
  $('#h-count').textContent = `${total} سجل`;
  $('#more').classList.toggle('hidden', hOffset >= total);
  const csv = hParams();
  $('#csv').href = '/api/reads.csv?' + csv;
}
$('#hf').addEventListener('submit', (e) => { e.preventDefault(); loadHistory(true); });
$('#more').onclick = () => loadHistory(false);

// ---------- اللوحات ----------
let kind = '';
async function loadLists() {
  const p = new URLSearchParams();
  if (kind) p.set('kind', kind);
  if ($('#lq').value) p.set('q', $('#lq').value);
  const rows = await api('/api/lists?' + p);
  $('#plates').innerHTML = rows.length ? rows.map((l) => `
    <div class="item">
      ${plateHTML(l.plate_key, { raw: l.plate_raw })}
      <div class="info">
        <div class="t">${esc(l.owner_name || 'بدون اسم')}</div>
        <div class="s">${l.phone ? esc(l.phone) + ' · ' : ''}${l.valid_until ? 'حتى ' + esc(l.valid_until) + ' · ' : ''}${l.last_seen ? 'آخر دخول ' + ago(l.last_seen) : 'لم يُرصد'}</div>
      </div>
      ${statusBadge(l.kind)}
      <button class="btn sm" data-edit='${esc(JSON.stringify(l))}'>${ICONS.edit}</button>
    </div>`).join('') : '<div class="empty">لا توجد لوحات. أضف المركبات المسموح لها بالدخول.</div>';
  $$('[data-edit]').forEach((b) => b.onclick = () => plateForm(JSON.parse(b.dataset.edit)));
}
$('#kind-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  kind = b.dataset.kind;
  $$('#kind-chips button').forEach((x) => x.classList.toggle('active', x === b));
  loadLists();
});
let lqT; $('#lq').addEventListener('input', () => { clearTimeout(lqT); lqT = setTimeout(loadLists, 300); });
$('#add-plate').onclick = () => plateForm({ kind: kind || 'allow' });

function plateForm(l = {}) {
  modal(`<h3>${l.id ? 'تعديل لوحة' : 'إضافة لوحة'}</h3>
    <form id="pf">
      <label>رقم اللوحة (مثال: ا ب ح 1234 أو ABJ 1234)</label>
      <input name="plate" required value="${esc(l.plate_raw || '')}" ${l.id ? 'readonly' : ''}>
      <div id="preview" style="margin-top:10px"></div>
      <label>النوع</label>
      <select name="kind"><option value="allow">مسموح بالدخول</option><option value="block">محظور</option></select>
      <label>اسم المالك</label><input name="owner_name" value="${esc(l.owner_name || '')}">
      <label>رقم الجوال</label><input name="phone" type="tel" dir="ltr" value="${esc(l.phone || '')}">
      <label>صالح حتى (اختياري)</label><input name="valid_until" type="date" value="${esc(l.valid_until || '')}">
      <label>ملاحظات</label><input name="note" value="${esc(l.note || '')}">
      <div class="actions">
        ${l.id ? '<button type="button" class="btn danger" id="del">حذف</button>' : '<button type="button" class="btn" data-close>إلغاء</button>'}
        <button class="btn primary">حفظ</button>
      </div>
    </form>`, (m, close) => {
    const f = $('#pf', m);
    f.kind.value = l.kind || 'allow';
    const pv = () => { $('#preview', m).innerHTML = f.plate.value ? plateHTML(previewKey(f.plate.value), { lg: true, raw: f.plate.value }) : ''; };
    f.plate.addEventListener('input', pv); pv();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await act(() => api('/api/lists', { body: formData(f) }), 'تم الحفظ')) { close(); loadLists(); }
    };
    $('#del', m)?.addEventListener('click', async () => {
      if (await act(() => api('/api/lists/' + l.id, { method: 'DELETE' }), 'تم الحذف')) { close(); loadLists(); }
    });
  });
}

// معاينة اللوحة بنفس منطق الخادم (لاتيني مفضل، وإلا عربي معكوس)
function previewKey(v) {
  const AR = { 'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ب': 'B', 'ح': 'J', 'د': 'D', 'ر': 'R', 'س': 'S', 'ص': 'X', 'ط': 'T', 'ع': 'E', 'ق': 'G', 'ك': 'K', 'ل': 'L', 'م': 'Z', 'ن': 'N', 'ه': 'H', 'ة': 'H', 'و': 'U', 'ى': 'V', 'ي': 'V' };
  const latin = (v.match(/[A-Za-z]/g) || []).join('').toUpperCase();
  const ar = (v.match(/[ء-ي]/g) || []).map((c) => AR[c]).filter(Boolean).reverse().join('');
  const d = (v.match(/[0-9]/g) || []).join('') || (v.match(/[٠-٩]/g) || []).map((c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).join('');
  return (latin || ar) + d;
}

$('#import').onclick = () => modal(`<h3>استيراد قائمة لوحات</h3>
  <p class="muted small">ضع كل لوحة في سطر، ويمكن إضافة الاسم والجوال مفصولة بفاصلة:<br><span dir="ltr">ABJ 1234, محمد, 0550000000</span></p>
  <form id="imf">
    <select name="kind"><option value="allow">مسموح بالدخول</option><option value="block">محظور</option></select>
    <textarea name="text" rows="8" style="margin-top:8px" required></textarea>
    <div class="actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn primary">استيراد</button></div>
  </form>`, (m, close) => {
  $('#imf', m).onsubmit = async (e) => {
    e.preventDefault();
    const r = await act(() => api('/api/lists/import', { body: formData(e.target) }));
    if (r) { toast(`تم استيراد ${r.imported} لوحة${r.errors.length ? ` (${r.errors.length} غير صحيحة)` : ''}`); close(); loadLists(); }
  };
});

// إجراءات سريعة عند الضغط على مركبة في السجل
function plateActions(raw) {
  modal(`<h3>المركبة</h3><div style="margin:8px 0 4px">${plateHTML(previewKey(raw), { lg: true, raw })}</div>
    <div class="actions"><button class="btn" id="pa-allow">${ICONS.check} سماح</button><button class="btn danger" id="pa-block">${ICONS.ban} حظر</button></div>
    <div class="actions"><button class="btn" id="pa-hist">${ICONS.history} سجل هذه المركبة</button></div>`, (m, close) => {
    const add = async (k) => { if (await act(() => api('/api/lists', { body: { plate: raw, kind: k } }), k === 'allow' ? 'أُضيفت للمسموح' : 'أُضيفت للمحظور')) close(); };
    $('#pa-allow', m).onclick = () => add('allow');
    $('#pa-block', m).onclick = () => add('block');
    $('#pa-hist', m).onclick = () => { close(); $('#hf').q.value = raw; $('.tabbar [data-tab="history"]').click(); };
  });
}

// ---------- الإعدادات ----------
async function loadSettings() {
  devices = await api('/api/devices');
  $('#dev-settings').innerHTML = devices.length ? devices.map((d) => `
    <div class="item">
      <div class="info"><div class="t">${esc(d.name)}</div><div class="s">${GATE_MODES[d.gate_mode]} · ${esc(d.serial)}</div></div>
      <button class="btn sm" data-dev="${d.id}">تعديل</button>
    </div>`).join('') : '<div class="empty">لا توجد أجهزة</div>';
  $$('[data-dev]').forEach((b) => b.onclick = () => deviceForm(devices.find((d) => d.id == b.dataset.dev)));
}

function deviceForm(d) {
  modal(`<h3>إعدادات ${esc(d.name)}</h3><form id="df">
    <label>اسم الجهاز</label><input name="name" value="${esc(d.name)}">
    <label>الموقع (مثال: البوابة الرئيسية)</label><input name="location" value="${esc(d.location || '')}">
    <label>وضع فتح البوابة</label>
    <select name="gate_mode">${Object.entries(GATE_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <div class="actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn primary">حفظ</button></div>
  </form>`, (m, close) => {
    const f = $('#df', m); f.gate_mode.value = d.gate_mode;
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await act(() => api('/api/devices/' + d.id, { method: 'PATCH', body: formData(f) }), 'تم الحفظ')) { close(); loadSettings(); }
    };
  });
}

$('#chpw').onclick = () => modal(`<h3>تغيير كلمة المرور</h3><form id="pw">
  <label>كلمة المرور الحالية</label><input name="current" type="password" dir="ltr" required>
  <label>كلمة المرور الجديدة</label><input name="next" type="password" dir="ltr" minlength="6" required>
  <div class="actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn primary">حفظ</button></div>
</form>`, (m, close) => {
  $('#pw', m).onsubmit = async (e) => {
    e.preventDefault();
    if (await act(() => api('/api/me/password', { body: formData(e.target) }), 'تم تغيير كلمة المرور')) close();
  };
});

function setupNotifBtn() {
  const b = $('#notif-btn');
  b.innerHTML = ICONS.bell;
  if (!('Notification' in window) || Notification.permission === 'granted') { b.classList.add('hidden'); return; }
  b.onclick = async () => {
    const p = await Notification.requestPermission();
    if (p === 'granted') { toast('تم تفعيل الإشعارات'); b.classList.add('hidden'); }
  };
}

init();
