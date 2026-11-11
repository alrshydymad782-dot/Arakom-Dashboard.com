'use strict';
/* لوحة تحكم المدير */
let customers = [];
let devices = [];
const GATE_MODES = { whitelist: 'للمسموح فقط', all: 'للجميع عدا المحظور', manual: 'يدوي فقط' };
const ACTIONS = {
  login: 'تسجيل دخول', open_gate: 'فتح بوابة', list_upsert: 'إضافة/تعديل لوحة', list_delete: 'حذف لوحة', list_import: 'استيراد لوحات',
  device_add: 'إضافة جهاز', device_update: 'تعديل جهاز', device_delete: 'حذف جهاز', customer_add: 'إضافة عميل',
  customer_update: 'تعديل عميل', customer_delete: 'حذف عميل', user_add: 'إضافة مستخدم', user_update: 'تعديل مستخدم',
};

async function init() {
  const me = await api('/api/me');
  if (me.role !== 'admin') { location.href = '/app'; return; }
  $('#lo').innerHTML = ICONS.logout;
  $('#add-customer').innerHTML = ICONS.plus + ' عميل جديد';
  $('#add-device').innerHTML = ICONS.plus + ' جهاز';
  $('#add-user').innerHTML = ICONS.plus + ' مستخدم';
  await loadCustomersData();

  setupTabs([
    { id: 'overview', label: 'الرئيسية', icon: 'home', title: 'نظرة عامة' },
    { id: 'customers', label: 'العملاء', icon: 'users' },
    { id: 'devices', label: 'الأجهزة', icon: 'camera' },
    { id: 'reads', label: 'السجل', icon: 'history', title: 'سجل القراءات' },
    { id: 'users', label: 'الحسابات', icon: 'settings', title: 'حسابات الدخول' },
    { id: 'system', label: 'النظام', icon: 'server' },
  ], (id) => ({ overview: loadOverview, customers: loadCustomers, devices: loadDevices, reads: () => loadReads(true), users: loadUsers, system: loadSystem })[id]());

  live({
    read: (r) => {
      const feed = $('#feed');
      $('.empty', feed)?.remove();
      feed.insertAdjacentHTML('afterbegin', readItem(r, { isNew: true, showCustomer: true }));
      while (feed.children.length > 15) feed.lastElementChild.remove();
    },
    device_new: (d) => { toast(`جهاز جديد اتصل: ${d.serial}`); if (!$('[data-view="devices"]').classList.contains('hidden')) loadDevices(); },
    device_status: () => { if (!$('[data-view="devices"]').classList.contains('hidden')) loadDevices(); },
  });
}

async function loadCustomersData() {
  customers = await api('/api/admin/customers');
  const opts = customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#hf-cust').innerHTML = '<option value="">كل العملاء</option>' + opts;
}
const customerOptions = (sel) => '<option value="">— غير مرتبط —</option>' +
  customers.map((c) => `<option value="${c.id}" ${c.id == sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

// ---------- نظرة عامة ----------
async function loadOverview() {
  const s = await api('/api/stats');
  $('#stats').innerHTML = [
    ['b', 'users', 'العملاء النشطون', `${s.customers.active || 0}/${s.customers.n}`],
    ['g', 'camera', 'الأجهزة المتصلة', `${s.devices.online}/${s.devices.total}`],
    ['g', 'car', 'قراءات اليوم', s.today.reads],
    ['r', 'ban', 'محاولات محظورة', s.today.blocked],
  ].map(([c, i, l, v]) => `<div class="card stat"><div class="ic ${c}">${ICONS[i]}</div><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
  const alerts = [];
  if (!s.mqtt.connected) alerts.push(['block', 'غير متصل بخادم MQTT! تحقق من إعدادات Mosquitto.', 'system']);
  if (s.unassigned) alerts.push(['warn', `${s.unassigned} جهاز غير مرتبط بأي عميل`, 'devices']);
  if (s.devices.total - s.devices.online > 0) alerts.push(['warn', `${s.devices.total - s.devices.online} جهاز غير متصل حالياً`, 'devices']);
  $('#alerts').innerHTML = alerts.map(([c, t, go]) => `<div class="card row" style="margin-top:12px"><span class="badge ${c}">تنبيه</span><span class="grow">${t}</span><button class="btn sm" data-goto="${go}">عرض</button></div>`).join('');
  $$('[data-goto]').forEach((b) => b.onclick = () => $(`.tabbar [data-tab="${b.dataset.goto}"]`).click());
  bars($('#hours'), s.hours);
  const { rows } = await api('/api/reads?limit=15');
  $('#feed').innerHTML = rows.length ? rows.map((r) => readItem(r, { showCustomer: true })).join('') : '<div class="empty">لا توجد قراءات بعد</div>';
}

// ---------- العملاء ----------
async function loadCustomers() {
  await loadCustomersData();
  const q = $('#cq').value.trim();
  const rows = customers.filter((c) => !q || `${c.name} ${c.phone} ${c.city}`.includes(q));
  $('#customers').innerHTML = rows.length ? rows.map((c) => `
    <div class="item">
      <div class="avatar" style="width:40px;height:40px">${esc(c.name.trim()[0])}</div>
      <div class="info">
        <div class="t">${esc(c.name)}</div>
        <div class="s">${c.devices} جهاز · ${c.users} حساب${c.city ? ' · ' + esc(c.city) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}${c.subscription_until ? ' · الاشتراك حتى ' + esc(c.subscription_until) : ''}</div>
      </div>
      <span class="badge ${c.active ? 'on' : 'off'}">${c.active ? 'نشط' : 'موقوف'}</span>
      <button class="btn sm" data-c="${c.id}">${ICONS.edit}</button>
    </div>`).join('') : '<div class="empty">لا يوجد عملاء. أضف أول عميل.</div>';
  $$('[data-c]').forEach((b) => b.onclick = () => customerForm(customers.find((c) => c.id == b.dataset.c)));
}
$('#cq').addEventListener('input', loadCustomers);
$('#add-customer').onclick = () => customerForm({});

function customerForm(c) {
  const isNew = !c.id;
  modal(`<h3>${isNew ? 'عميل جديد' : 'تعديل ' + esc(c.name)}</h3><form id="cf">
    <label>اسم العميل / المنشأة</label><input name="name" required value="${esc(c.name || '')}">
    <label>الجوال</label><input name="phone" dir="ltr" value="${esc(c.phone || '')}">
    <label>البريد الإلكتروني</label><input name="email" dir="ltr" value="${esc(c.email || '')}">
    <label>المدينة</label><input name="city" value="${esc(c.city || '')}">
    <label>الدولة</label><select name="country">
      ${[['SA', 'السعودية'], ['AE', 'الإمارات'], ['KW', 'الكويت'], ['QA', 'قطر'], ['BH', 'البحرين'], ['OM', 'عُمان']].map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
    <label>الاشتراك ساري حتى</label><input name="subscription_until" type="date" value="${esc(c.subscription_until || '')}">
    <label>ملاحظات</label><input name="notes" value="${esc(c.notes || '')}">
    ${isNew ? `<label>اسم مستخدم للعميل (للدخول)</label><input name="username" dir="ltr" autocapitalize="off" placeholder="مثال: villa-ahmed">
      <label>كلمة المرور</label><input name="password" dir="ltr" value="${Math.random().toString(36).slice(2, 10)}">` :
      `<label class="row" style="color:var(--text)"><input type="checkbox" name="active" style="width:auto" ${c.active ? 'checked' : ''}> الحساب نشط</label>`}
    <div class="actions">${isNew ? '<button type="button" class="btn" data-close>إلغاء</button>' : '<button type="button" class="btn danger" id="del">حذف</button>'}<button class="btn primary">حفظ</button></div>
  </form>`, (m, close) => {
    const f = $('#cf', m);
    f.country.value = c.country || 'SA';
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = formData(f);
      const ok = await act(() => api('/api/admin/customers' + (isNew ? '' : '/' + c.id), { method: isNew ? 'POST' : 'PATCH', body }), 'تم الحفظ');
      if (ok) {
        close(); loadCustomers();
        if (isNew && body.username) modal(`<h3>بيانات دخول العميل</h3><p>أرسل هذه البيانات للعميل:</p>
          <div class="card" dir="ltr" style="background:var(--bg)">${location.origin}<br>User: <b>${esc(body.username.toLowerCase())}</b><br>Pass: <b>${esc(body.password)}</b></div>
          <div class="actions"><button class="btn primary" data-close>تم</button></div>`);
      }
    };
    $('#del', m)?.addEventListener('click', async () => {
      if (!await confirmBox(`حذف ${c.name} وكل بياناته؟`, 'حذف')) return;
      if (await act(() => api('/api/admin/customers/' + c.id, { method: 'DELETE' }), 'تم الحذف')) { close(); loadCustomers(); }
    });
  });
}

// ---------- الأجهزة ----------
let devFilter = '';
async function loadDevices() {
  devices = await api('/api/devices');
  const rows = devices.filter((d) => !devFilter || (devFilter === 'unassigned' ? !d.customer_id : !d.online));
  $('#devlist').innerHTML = rows.length ? rows.map((d) => `
    <div class="item">
      <div class="ic ${d.online ? 'g' : 'r'}" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center">${ICONS.camera}</div>
      <div class="info">
        <div class="t">${esc(d.name)} <span class="muted small" dir="ltr">${esc(d.serial)}</span></div>
        <div class="s">${d.customer_name ? esc(d.customer_name) : '<b style="color:var(--warn)">غير مرتبط</b>'} · ${GATE_MODES[d.gate_mode]} · ${ago(d.last_seen)}${d.ip ? ' · ' + esc(d.ip) : ''}</div>
      </div>
      <span class="badge ${d.online ? 'on' : 'off'}">${d.online ? 'متصل' : 'غير متصل'}</span>
      <button class="btn sm" data-d="${d.id}">${ICONS.edit}</button>
    </div>`).join('') : '<div class="empty">لا توجد أجهزة. الأجهزة تظهر هنا تلقائياً عند اتصالها بخادم MQTT.</div>';
  $$('[data-d]').forEach((b) => b.onclick = () => deviceForm(devices.find((d) => d.id == b.dataset.d)));
}
$('#dev-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  devFilter = b.dataset.f;
  $$('#dev-chips button').forEach((x) => x.classList.toggle('active', x === b));
  loadDevices();
});
$('#add-device').onclick = () => deviceForm({});

async function deviceForm(d) {
  await loadCustomersData();
  const isNew = !d.id;
  modal(`<h3>${isNew ? 'إضافة جهاز' : esc(d.name)}</h3><form id="df">
    <label>الرقم التسلسلي (Serial)</label><input name="serial" dir="ltr" required value="${esc(d.serial || '')}">
    <label>الاسم</label><input name="name" value="${esc(d.name || '')}">
    <label>العميل</label><select name="customer_id">${customerOptions(d.customer_id)}</select>
    <label>الموقع</label><input name="location" value="${esc(d.location || '')}">
    <label>وضع البوابة</label><select name="gate_mode">${Object.entries(GATE_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <div class="actions">${isNew ? '<button type="button" class="btn" data-close>إلغاء</button>' : '<button type="button" class="btn danger" id="del">حذف</button><button type="button" class="btn" id="open">فتح البوابة</button>'}<button class="btn primary">حفظ</button></div>
  </form>`, (m, close) => {
    const f = $('#df', m);
    f.gate_mode.value = d.gate_mode || 'whitelist';
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await act(() => api('/api/devices' + (isNew ? '' : '/' + d.id), { method: isNew ? 'POST' : 'PATCH', body: formData(f) }), 'تم الحفظ')) { close(); loadDevices(); }
    };
    $('#open', m)?.addEventListener('click', () => act(() => api(`/api/devices/${d.id}/open`, { method: 'POST' }), 'تم إرسال أمر الفتح'));
    $('#del', m)?.addEventListener('click', async () => {
      if (!await confirmBox('حذف هذا الجهاز؟', 'حذف')) return;
      if (await act(() => api('/api/devices/' + d.id, { method: 'DELETE' }), 'تم الحذف')) { close(); loadDevices(); }
    });
  });
}

// ---------- السجل ----------
let hOffset = 0;
function hParams() {
  const p = new URLSearchParams(formData($('#hf')));
  for (const [k, v] of [...p]) if (!v) p.delete(k);
  return p;
}
async function loadReads(reset) {
  if (reset) hOffset = 0;
  const p = hParams(); p.set('limit', 50); p.set('offset', hOffset);
  const { rows, total } = await api('/api/reads?' + p);
  const html = rows.map((r) => readItem(r, { showCustomer: true })).join('');
  if (reset) $('#hlist').innerHTML = html || '<div class="empty">لا توجد نتائج</div>';
  else $('#hlist').insertAdjacentHTML('beforeend', html);
  hOffset += rows.length;
  $('#h-count').textContent = `${total} سجل`;
  $('#more').classList.toggle('hidden', hOffset >= total);
  $('#csv').href = '/api/reads.csv?' + hParams();
}
$('#hf').addEventListener('submit', (e) => { e.preventDefault(); loadReads(true); });
$('#more').onclick = () => loadReads(false);

// ---------- الحسابات ----------
async function loadUsers() {
  const users = await api('/api/admin/users');
  $('#users').innerHTML = users.map((u) => `
    <div class="item">
      <div class="info"><div class="t" dir="ltr" style="text-align:right">${esc(u.username)}</div>
      <div class="s">${u.role === 'admin' ? 'مدير' : esc(u.customer_name || '')} · ${esc(u.name || '')}</div></div>
      <span class="badge ${u.active ? 'on' : 'off'}">${u.active ? 'نشط' : 'موقوف'}</span>
      <button class="btn sm" data-u='${esc(JSON.stringify(u))}'>${ICONS.edit}</button>
    </div>`).join('');
  $$('[data-u]').forEach((b) => b.onclick = () => userEdit(JSON.parse(b.dataset.u)));
}
$('#add-user').onclick = async () => {
  await loadCustomersData();
  modal(`<h3>حساب دخول جديد</h3><form id="uf">
    <label>النوع</label><select name="role"><option value="customer">عميل</option><option value="admin">مدير (موظف لديك)</option></select>
    <label>العميل</label><select name="customer_id">${customerOptions()}</select>
    <label>الاسم</label><input name="name">
    <label>اسم المستخدم</label><input name="username" dir="ltr" autocapitalize="off" required>
    <label>كلمة المرور</label><input name="password" dir="ltr" required minlength="6">
    <div class="actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn primary">إنشاء</button></div>
  </form>`, (m, close) => {
    $('#uf', m).onsubmit = async (e) => {
      e.preventDefault();
      if (await act(() => api('/api/admin/users', { body: formData(e.target) }), 'تم إنشاء الحساب')) { close(); loadUsers(); }
    };
  });
};
function userEdit(u) {
  modal(`<h3 dir="ltr" style="text-align:right">${esc(u.username)}</h3><form id="ue">
    <label>الاسم</label><input name="name" value="${esc(u.name || '')}">
    <label>كلمة مرور جديدة (اتركها فارغة بدون تغيير)</label><input name="password" dir="ltr">
    <label class="row" style="color:var(--text)"><input type="checkbox" name="active" style="width:auto" ${u.active ? 'checked' : ''}> الحساب نشط</label>
    <div class="actions"><button type="button" class="btn danger" id="del">حذف</button><button class="btn primary">حفظ</button></div>
  </form>`, (m, close) => {
    $('#ue', m).onsubmit = async (e) => {
      e.preventDefault();
      const b = formData(e.target); if (!b.password) delete b.password;
      if (await act(() => api('/api/admin/users/' + u.id, { method: 'PATCH', body: b }), 'تم الحفظ')) { close(); loadUsers(); }
    };
    $('#del', m).onclick = async () => {
      if (!await confirmBox('حذف هذا الحساب؟', 'حذف')) return;
      if (await act(() => api('/api/admin/users/' + u.id, { method: 'DELETE' }), 'تم الحذف')) { close(); loadUsers(); }
    };
  });
}

// ---------- النظام ----------
async function loadSystem() {
  const s = await api('/api/admin/system');
  const row = (t, v) => `<div class="item"><div class="info"><div class="t">${t}</div></div><div dir="ltr">${v}</div></div>`;
  $('#sys').innerHTML = [
    row('الاتصال', `<span class="badge ${s.mqtt.connected ? 'on' : 'off'}">${s.mqtt.connected ? 'متصل' : 'غير متصل'}</span>`),
    row('عنوان الخادم', esc(s.mqtt.url)),
    row('موضوع القراءات', esc(s.mqtt.topics.result)),
    row('موضوع النبض', esc(s.mqtt.topics.heartbeat)),
    row('موضوع الأوامر', esc(s.mqtt.topics.command)),
    row('عدد الرسائل', s.mqtt.messages),
    row('آخر رسالة', s.mqtt.lastMessageAt ? fmtDate(s.mqtt.lastMessageAt) : '—'),
    s.mqtt.lastError ? row('آخر خطأ', esc(s.mqtt.lastError)) : '',
    row('حجم قاعدة البيانات', s.dbSizeMB + ' MB'),
    row('مدة حفظ السجلات', s.keepReadsDays + ' يوم'),
    row('مدة التشغيل', Math.round(s.uptime / 3600) + ' ساعة'),
  ].join('');
  const a = await api('/api/admin/audit');
  $('#audit').innerHTML = a.map((x) => `<tr><td>${fmtDate(x.ts)}</td><td dir="ltr">${esc(x.username || 'النظام')}</td><td>${ACTIONS[x.action] || esc(x.action)}</td><td>${esc(x.customer_name || '')}</td><td class="small muted" dir="ltr">${esc(x.details && x.details !== '{}' ? x.details : '')}</td></tr>`).join('');
}

init();
