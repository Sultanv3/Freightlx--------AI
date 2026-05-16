/**
 * FREIGHTLX Admin Live (v3.0)
 *
 * Connects admin.html DOM to real backend endpoints:
 *   - GET /api/v1/admin/stats        → overview tiles
 *   - GET /api/v1/admin/users        → users table
 *   - PATCH /api/v1/admin/users/{id} → edit role / suspend
 *   - GET /api/v1/shipments          → all shipments (admin scope)
 *   - PATCH /api/v1/shipments/{id}   → edit status
 *   - GET /api/v1/invoices           → invoices table
 *   - PATCH /api/v1/invoices/{id}/status
 *   - GET /api/v1/admin/recent-activity → activity feed
 *   - POST /api/v1/notifications     → admin broadcast notification
 *
 * Live: subscribes to window 'flx:update' from flx-live.js → re-fetches affected lists.
 */
(function () {
  'use strict';

  const API = '/api/v1';

  function getToken() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && v.access_token) return v.access_token;
        if (Array.isArray(v) && v[0]) return v[0];
      }
    } catch {}
    return localStorage.getItem('flx_access_token') || '';
  }

  async function api(path, init = {}) {
    const token = getToken();
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
    return r.json();
  }

  const $ = (s) => document.querySelector(s);
  const fmt = {
    money: n => '$' + Number(n || 0).toLocaleString('en-US'),
    sar:   n => Number(n || 0).toLocaleString('ar-SA') + ' ﷼',
    date:  d => d ? new Date(d).toLocaleDateString('ar-SA') : '—',
    time:  d => d ? new Date(d).toLocaleString('ar-SA') : '—',
  };

  function statusBadge(s) {
    const map = {
      pending:   ['#fbbf24', 'قيد المعالجة'],
      active:    ['#34d399', 'نشطة'],
      transit:   ['#0ea5e9', 'في الترانزيت'],
      delivered: ['#a78bfa', 'تم التسليم'],
      cancelled: ['#ef4444', 'ملغاة'],
      paid:      ['#34d399', 'مدفوعة'],
      unpaid:    ['#fbbf24', 'غير مدفوعة'],
    };
    const [c, l] = map[s] || ['#94a3b8', s || '—'];
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${c}22;color:${c};font-size:11px;font-weight:600">${l}</span>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ───── Modal helpers ─────────────────────────────────────
  function openModal({ title, sub, body, onConfirm, confirmText = 'حفظ' }) {
    const m = $('#admModal'); if (!m) return null;
    $('#admModalTitle').textContent = title || '';
    $('#admModalSub').textContent = sub || '';
    $('#admModalBody').innerHTML = body || '';
    $('#admModalConfirm').textContent = confirmText;
    m.classList.add('open');
    m.style.display = 'flex';
    const close = () => { m.classList.remove('open'); m.style.display = 'none'; };
    $('#admModalCancel').onclick = close;
    $('#admModalConfirm').onclick = async () => {
      try { await onConfirm?.($('#admModalBody')); close(); } catch (e) { alert(e.message); }
    };
    return close;
  }

  function toast(msg, type = 'info') {
    if (window.flxToast) return window.flxToast(msg, type);
    const c = { info: '#0ea5e9', success: '#34d399', error: '#ef4444', warn: '#fbbf24' }[type] || '#0ea5e9';
    let t = document.getElementById('flx-adm-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'flx-adm-toast';
      t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;color:#fff;padding:12px 18px;border-radius:12px;font:500 14px/1.4 system-ui;box-shadow:0 12px 32px rgba(0,0,0,.3);transform:translateX(120%);transition:transform .35s';
      document.body.appendChild(t);
    }
    t.style.background = c;
    t.textContent = msg;
    t.style.transform = 'translateX(0)';
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.transform = 'translateX(120%)'; }, 4000);
  }

  // ───── Loaders ───────────────────────────────────────────
  async function loadOverview() {
    try {
      const stats = await api('/admin/stats').catch(() => null);
      if (stats?.data) {
        const d = stats.data;
        const set = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
        set('admRevenue', fmt.money(d.revenue || 0));
        set('admUsers', d.users || 0);
        set('admActiveShipments', d.active_shipments || 0);
        set('admPendingInvoices', d.pending_invoices || 0);
      }
      const act = await api('/admin/recent-activity').catch(() => null);
      const box = $('#admRecentActivity');
      if (box && act?.data) {
        box.innerHTML = (act.data || []).slice(0, 12).map(a => `
          <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;gap:12px">
            <span>${escapeHtml(a.action || a.title || a.message || 'نشاط')}</span>
            <span style="color:#94a3b8;font-size:12px">${fmt.time(a.created_at || a.timestamp)}</span>
          </div>`).join('') || '<div style="padding:20px;color:#94a3b8">لا توجد أنشطة حديثة</div>';
      }
    } catch (e) { console.warn('[adm] overview:', e.message); }
  }

  async function loadUsers(query = '') {
    const tb = $('#admUsersTable'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">جاري التحميل...</td></tr>';
    try {
      const j = await api('/admin/users');
      let users = j.data || j.users || [];
      if (query) {
        const q = query.toLowerCase();
        users = users.filter(u => (u.email || '').toLowerCase().includes(q) ||
                                  (u.full_name || '').toLowerCase().includes(q));
      }
      if (!users.length) {
        tb.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8">لا يوجد عملاء</td></tr>';
        return;
      }
      tb.innerHTML = users.map(u => `
        <tr data-uid="${u.id}">
          <td><code style="font-size:11px">${u.id?.slice(0, 8) || '—'}</code></td>
          <td>${escapeHtml(u.full_name || '—')}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td><span style="padding:2px 8px;border-radius:6px;background:rgba(14,165,233,.15);color:#0ea5e9;font-size:11px">${u.role || 'user'}</span></td>
          <td>${u.shipments_count || 0}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(u.created_at)}</td>
          <td>
            <button class="admin-btn admin-btn-ghost" data-act="edit-user" data-id="${u.id}" style="padding:4px 10px;font-size:11px">تعديل</button>
            <button class="admin-btn admin-btn-ghost" data-act="suspend-user" data-id="${u.id}" style="padding:4px 10px;font-size:11px;color:#ef4444">${u.suspended ? 'تفعيل' : 'تعليق'}</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="7" style="padding:20px;text-align:center;color:#ef4444">خطأ: ${e.message}</td></tr>`;
    }
  }

  async function loadShipments() {
    const tb = $('#admShipmentsTable'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:#94a3b8">جاري التحميل...</td></tr>';
    try {
      const j = await api('/shipments?limit=50&scope=all');
      const list = j.data || j.shipments || [];
      if (!list.length) {
        tb.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#94a3b8">لا توجد شحنات</td></tr>';
        return;
      }
      tb.innerHTML = list.map(s => `
        <tr data-sid="${s.id}">
          <td><code style="font-size:11px">${s.id?.slice(0, 8) || '—'}</code></td>
          <td>${escapeHtml(s.origin || s.from || '—')} → ${escapeHtml(s.destination || s.to || '—')}</td>
          <td>${escapeHtml(s.carrier || '—')}</td>
          <td>${escapeHtml(s.container_type || s.container || '—')}</td>
          <td>${statusBadge(s.status)}</td>
          <td>${fmt.money(s.total || s.price || 0)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(s.created_at)}</td>
          <td>
            <button class="admin-btn admin-btn-ghost" data-act="edit-shipment" data-id="${s.id}" style="padding:4px 10px;font-size:11px">تعديل الحالة</button>
            <button class="admin-btn admin-btn-ghost" data-act="track" data-id="${s.id}" style="padding:4px 10px;font-size:11px">تتبع</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="8" style="padding:20px;text-align:center;color:#ef4444">خطأ: ${e.message}</td></tr>`;
    }
  }

  async function loadInvoices() {
    const tb = $('#admInvoicesTable'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">جاري التحميل...</td></tr>';
    try {
      const j = await api('/invoices?limit=50&scope=all');
      const list = j.data || j.invoices || [];
      if (!list.length) {
        tb.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8">لا توجد فواتير</td></tr>';
        return;
      }
      tb.innerHTML = list.map(i => `
        <tr data-iid="${i.id}">
          <td><code style="font-size:11px">${i.invoice_number || i.id?.slice(0, 8) || '—'}</code></td>
          <td>${escapeHtml(i.customer_name || i.user_email || '—')}</td>
          <td><strong>${fmt.money(i.amount || i.total || 0)}</strong></td>
          <td>${statusBadge(i.status)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(i.created_at)}</td>
          <td>
            ${i.status === 'pending' ? `<button class="admin-btn admin-btn-success" data-act="mark-paid" data-id="${i.id}" style="padding:4px 10px;font-size:11px">تأشير كمدفوعة</button>` : ''}
            <button class="admin-btn admin-btn-ghost" data-act="view-invoice" data-id="${i.id}" style="padding:4px 10px;font-size:11px">عرض</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#ef4444">خطأ: ${e.message}</td></tr>`;
    }
  }

  async function loadQuotes() {
    const tb = $('#admQuotesTable'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">جاري التحميل...</td></tr>';
    try {
      const j = await api('/quotes?limit=50&scope=all');
      const list = j.data || j.quotes || [];
      if (!list.length) {
        tb.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8">لا توجد عروض</td></tr>';
        return;
      }
      tb.innerHTML = list.map(q => `
        <tr data-qid="${q.id}">
          <td><code style="font-size:11px">${q.id?.slice(0, 8) || '—'}</code></td>
          <td>${escapeHtml(q.origin_port || '—')} → ${escapeHtml(q.destination_port || '—')}</td>
          <td>${escapeHtml(q.carrier || '—')}</td>
          <td><strong>${fmt.money(q.total || q.price || 0)}</strong></td>
          <td>${statusBadge(q.status)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(q.valid_until || q.created_at)}</td>
        </tr>`).join('');
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#ef4444">خطأ: ${e.message}</td></tr>`;
    }
  }

  // ───── Actions ───────────────────────────────────────────
  async function actEditUser(id) {
    const j = await api('/admin/users').catch(() => ({ data: [] }));
    const u = (j.data || []).find(x => x.id === id);
    if (!u) return toast('المستخدم غير موجود', 'error');
    openModal({
      title: `تعديل المستخدم`,
      sub: u.email,
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <label>الاسم<input type="text" id="fEditFullname" value="${escapeHtml(u.full_name || '')}" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px"></label>
          <label>الدور
            <select id="fEditRole" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>عميل</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>إداري</option>
              <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>سوبر أدمن</option>
            </select>
          </label>
        </div>`,
      onConfirm: async (body) => {
        const full_name = body.querySelector('#fEditFullname').value;
        const role = body.querySelector('#fEditRole').value;
        await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ full_name, role }) });
        toast('تم التحديث', 'success');
        loadUsers();
      },
    });
  }

  async function actSuspendUser(id) {
    if (!confirm('تأكيد تغيير حالة المستخدم؟')) return;
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ suspended: true }) });
      toast('تم التحديث', 'success');
      loadUsers();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function actEditShipment(id) {
    openModal({
      title: 'تحديث حالة الشحنة',
      sub: id?.slice(0, 8),
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <label>الحالة الجديدة
            <select id="fStatus" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px">
              <option value="pending">قيد المعالجة</option>
              <option value="active">نشطة</option>
              <option value="transit">في الترانزيت</option>
              <option value="delivered">تم التسليم</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </label>
          <label>ملاحظة للعميل (اختيارية)
            <input type="text" id="fNote" placeholder="مثال: الشحنة وصلت ميناء جدة" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px">
          </label>
        </div>`,
      confirmText: 'تحديث',
      onConfirm: async (body) => {
        const status = body.querySelector('#fStatus').value;
        const note = body.querySelector('#fNote').value;
        await api(`/shipments/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) });
        toast('تم تحديث الحالة', 'success');
        loadShipments();
      },
    });
  }

  async function actMarkPaid(id) {
    if (!confirm('تأشير الفاتورة كمدفوعة؟')) return;
    try {
      await api(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
      toast('تم التأشير', 'success');
      loadInvoices();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function actBroadcast() {
    openModal({
      title: 'إرسال إشعار للعملاء',
      sub: 'سيتم بثّ الإشعار لكل العملاء المتصلين فوراً',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <label>العنوان<input type="text" id="fBcTitle" placeholder="مثال: تحديث على شحنة بحرية" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px"></label>
          <label>الرسالة<textarea id="fBcBody" rows="4" placeholder="نص الإشعار..." style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px;resize:vertical"></textarea></label>
          <label>المستوى
            <select id="fBcType" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px">
              <option value="info">معلومة</option>
              <option value="warning">تنبيه</option>
              <option value="success">نجاح</option>
            </select>
          </label>
        </div>`,
      confirmText: 'بث الإشعار',
      onConfirm: async (body) => {
        const title = body.querySelector('#fBcTitle').value;
        const message = body.querySelector('#fBcBody').value;
        const type = body.querySelector('#fBcType').value;
        if (!title || !message) throw new Error('العنوان والرسالة إلزاميان');
        await api('/notifications', { method: 'POST', body: JSON.stringify({ title, message, type, broadcast: true }) });
        toast('تم بث الإشعار', 'success');
      },
    });
  }

  // ───── Wire up ───────────────────────────────────────────
  function wire() {
    // Section switching → load on demand
    document.querySelectorAll('.admin-nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section;
        setTimeout(() => {
          if (sec === 'overview') loadOverview();
          else if (sec === 'users') loadUsers();
          else if (sec === 'shipments') loadShipments();
          else if (sec === 'invoices') loadInvoices();
          else if (sec === 'quotes') loadQuotes();
        }, 50);
      });
    });

    // Table click delegation
    document.body.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t) return;
      const id = t.dataset.id;
      const act = t.dataset.act;
      if (act === 'edit-user') actEditUser(id);
      else if (act === 'suspend-user') actSuspendUser(id);
      else if (act === 'edit-shipment') actEditShipment(id);
      else if (act === 'mark-paid') actMarkPaid(id);
      else if (act === 'view-invoice') window.open(`/invoice.html?id=${id}`, '_blank');
      else if (act === 'track') window.open(`/track.html?id=${id}`, '_blank');
    });

    // Refresh + add buttons
    const refresh = $('#admRefreshBtn');
    if (refresh) refresh.addEventListener('click', () => { loadOverview(); toast('تم التحديث', 'success'); });

    // Inject Broadcast button into overview header
    const overview = $('#adm-section-overview .admin-section-header, #adm-section-overview > div:first-child') || $('#adm-section-overview');
    if (overview && !document.getElementById('admBroadcastBtn')) {
      const bcBtn = document.createElement('button');
      bcBtn.id = 'admBroadcastBtn';
      bcBtn.className = 'admin-btn admin-btn-primary';
      bcBtn.style.marginRight = '8px';
      bcBtn.textContent = '🔔 بث إشعار';
      bcBtn.addEventListener('click', actBroadcast);
      if (refresh && refresh.parentNode) refresh.parentNode.insertBefore(bcBtn, refresh);
    }

    // Add user / shipment / invoice modals
    $('#admAddUserBtn')?.addEventListener('click', () => {
      openModal({
        title: 'إضافة عميل جديد',
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <input type="email" id="fNewEmail" placeholder="البريد الإلكتروني" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
          <input type="text" id="fNewName" placeholder="الاسم الكامل" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
        </div>`,
        confirmText: 'إرسال دعوة',
        onConfirm: async (body) => {
          const email = body.querySelector('#fNewEmail').value;
          const full_name = body.querySelector('#fNewName').value;
          if (!email) throw new Error('الإيميل إلزامي');
          await api('/admin/users', { method: 'POST', body: JSON.stringify({ email, full_name }) }).catch(() => null);
          toast('تم إرسال الدعوة', 'success');
          loadUsers();
        },
      });
    });

    $('#admAddShipmentBtn')?.addEventListener('click', () => {
      openModal({
        title: 'إضافة شحنة يدوية',
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <input type="text" id="fSOrigin" placeholder="ميناء التحميل (مثل CNSHA)" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
          <input type="text" id="fSDest" placeholder="ميناء التفريغ (مثل SAJED)" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
          <input type="text" id="fSCarrier" placeholder="الخط الملاحي (Maersk, MSC...)" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
          <input type="number" id="fSPrice" placeholder="السعر $" style="padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff">
        </div>`,
        confirmText: 'إنشاء',
        onConfirm: async (body) => {
          const payload = {
            origin: body.querySelector('#fSOrigin').value,
            destination: body.querySelector('#fSDest').value,
            carrier: body.querySelector('#fSCarrier').value,
            total: Number(body.querySelector('#fSPrice').value),
            status: 'pending',
          };
          await api('/shipments', { method: 'POST', body: JSON.stringify(payload) });
          toast('تم إنشاء الشحنة', 'success');
          loadShipments();
        },
      });
    });

    // User search
    const userSearch = $('#admUserSearch');
    if (userSearch) {
      let t;
      userSearch.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadUsers(userSearch.value), 250);
      });
    }

    // Live updates: refresh active section
    window.addEventListener('flx:update', () => {
      const active = document.querySelector('.admin-section.active');
      if (!active) return;
      const id = active.id || '';
      if (id.includes('overview')) loadOverview();
      else if (id.includes('users')) loadUsers();
      else if (id.includes('shipments')) loadShipments();
      else if (id.includes('invoices')) loadInvoices();
      else if (id.includes('quotes')) loadQuotes();
    });

    window.addEventListener('flx:shipment-status', (e) => {
      toast(`📦 شحنة ${e.detail.id?.slice(0,8)}: ${e.detail.to}`, 'info');
    });
  }

  function start() {
    wire();
    // Initial load
    loadOverview();
    // Update date
    const dn = $('#admDateNow');
    if (dn) dn.textContent = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
