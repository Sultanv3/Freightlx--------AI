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

  // ───── User cache for displaying names in tables ──────
  let _userCache = null;
  async function loadUserMap() {
    try {
      const j = await api('/admin/users');
      const arr = j.data || j.users || [];
      _userCache = Object.fromEntries(arr.map(u => [u.id, u]));
      return _userCache;
    } catch { _userCache = {}; return _userCache; }
  }

  // ───── Loaders ───────────────────────────────────────────
  async function loadOverview() {
    try {
      const stats = await api('/admin/stats').catch(() => null);
      if (stats) {
        // Backend returns: { totalRevenue, totalUsers, activeShipments, pendingInvoices, totalShipments, totalInvoices, totalQuotes, totalRateRequests }
        const set = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
        set('admRevenue', fmt.money(stats.totalRevenue || stats.revenue || 0));
        set('admUsers', stats.totalUsers || stats.users || 0);
        set('admActiveShipments', stats.activeShipments || stats.active_shipments || 0);
        set('admPendingInvoices', stats.pendingInvoices || stats.pending_invoices || 0);
        // Extra: rate requests count
        const rrEl = $('#admRateRequests');
        if (rrEl) rrEl.textContent = stats.totalRateRequests || 0;
      }
      const act = await api('/admin/recent-activity').catch(() => null);
      const box = $('#admRecentActivity');
      const events = act?.events || act?.data || [];
      if (box) {
        const icons = { shipment: '📦', invoice: '💰', rate_request: '🔍', user_signup: '👤' };
        box.innerHTML = events.length ? events.slice(0, 12).map(e => `
          <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;gap:12px;align-items:center">
            <span style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">${icons[e.type] || '•'}</span>
              <span>${escapeHtml(e.label || e.action || e.message || 'نشاط')}</span>
            </span>
            <span style="color:#94a3b8;font-size:12px;flex-shrink:0">${fmt.time(e.timestamp || e.created_at)}</span>
          </div>`).join('') : '<div style="padding:20px;color:#94a3b8;text-align:center">لا توجد أنشطة حديثة</div>';
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
      // Build user lookup map (try to fetch profiles once for admin view)
      const userMap = _userCache || await loadUserMap();
      tb.innerHTML = list.map(s => {
        const u = userMap[s.user_id] || {};
        const userLabel = u.email || u.full_name || (s.user_id?.slice(0, 8) || '—');
        return `
        <tr data-sid="${s.id}">
          <td><code style="font-size:11px">${escapeHtml(s.id || '—')}</code></td>
          <td title="${escapeHtml(userLabel)}" style="font-size:12px">${escapeHtml(userLabel)}</td>
          <td>${escapeHtml(s.origin || s.from || '—')} → ${escapeHtml(s.destination || s.to || '—')}</td>
          <td>${escapeHtml(s.carrier || '—')}</td>
          <td><code style="font-size:11px;background:rgba(255,255,255,.05);padding:2px 6px;border-radius:4px">${escapeHtml(s.container || s.container_type || '—')}</code></td>
          <td>${statusBadge(s.status)}</td>
          <td>${fmt.money(s.price || s.total || 0)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(s.date || s.created_at)}</td>
          <td>
            <button class="admin-btn admin-btn-ghost" data-act="edit-shipment" data-id="${s.id}" style="padding:4px 10px;font-size:11px">تعديل</button>
            <button class="admin-btn admin-btn-ghost" data-act="track" data-id="${s.id}" style="padding:4px 10px;font-size:11px">تتبع</button>
          </td>
        </tr>`;
      }).join('');
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
      const userMap = _userCache || await loadUserMap();
      tb.innerHTML = list.map(i => {
        const u = userMap[i.user_id] || {};
        const userLabel = u.email || u.full_name || (i.user_id?.slice(0, 8) || '—');
        return `
        <tr data-iid="${i.id}">
          <td><code style="font-size:11px">${escapeHtml(i.id || '—')}</code></td>
          <td title="${escapeHtml(userLabel)}" style="font-size:12px">${escapeHtml(userLabel)}</td>
          <td>${escapeHtml(i.description || '—')}</td>
          <td><strong>${fmt.money(i.amount || i.total || 0)}</strong></td>
          <td>${statusBadge(i.status)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(i.created_at)}</td>
          <td>
            ${i.status === 'pending' ? `<button class="admin-btn admin-btn-success" data-act="mark-paid" data-id="${i.id}" style="padding:4px 10px;font-size:11px">تأشير كمدفوعة</button>` : ''}
            <button class="admin-btn admin-btn-ghost" data-act="view-invoice" data-id="${i.id}" style="padding:4px 10px;font-size:11px">عرض</button>
          </td>
        </tr>`;
      }).join('');
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
      const userMap = _userCache || await loadUserMap();
      tb.innerHTML = list.map(q => {
        const u = userMap[q.user_id] || {};
        const userLabel = u.email || u.full_name || (q.user_id?.slice(0, 8) || '—');
        return `
        <tr data-qid="${q.id}">
          <td><code style="font-size:11px">${escapeHtml(q.id || '—')}</code></td>
          <td title="${escapeHtml(userLabel)}" style="font-size:12px">${escapeHtml(userLabel)}</td>
          <td>${escapeHtml(q.origin || q.origin_port || '—')} → ${escapeHtml(q.destination || q.destination_port || '—')}</td>
          <td>${escapeHtml(q.carrier || '—')}</td>
          <td><strong>${fmt.money(q.price || q.total || 0)}</strong></td>
          <td>${statusBadge(q.status)}</td>
          <td style="color:#94a3b8;font-size:12px">${fmt.date(q.valid_until || q.created_at)}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#ef4444">خطأ: ${e.message}</td></tr>`;
    }
  }

  // ───── Carriers (Logos & Settings) ──────────────────────
  async function loadCarriers() {
    const grid = $('#admCarriersGrid'); if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:#94a3b8">جاري التحميل...</div>';
    try {
      const j = await api('/admin/carriers');
      const list = j.data || j.carriers || [];
      if (!list.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:#94a3b8">لا توجد خطوط ملاحية مضافة بعد. اضغط <strong>+ إضافة خط شحن</strong></div>';
        return;
      }
      grid.innerHTML = list.map(c => `
        <div class="admin-card" data-code="${escapeHtml(c.code)}" style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:56px;height:56px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:6px;flex-shrink:0">
              ${c.logo
                ? `<img src="${escapeHtml(c.logo)}" alt="${escapeHtml(c.name)}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML='<div style=&quot;font-weight:700;color:#0f1f3f&quot;>'+'${escapeHtml(c.code)}'+'</div>'">`
                : `<div style="font-weight:700;color:#0f1f3f">${escapeHtml(c.code)}</div>`}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:#fff">${escapeHtml(c.name)}</div>
              <div style="font-size:11px;color:#94a3b8;font-family:'JetBrains Mono'">${escapeHtml(c.code)}</div>
            </div>
            <span style="padding:2px 8px;border-radius:99px;background:rgba(${c.active ? '52,211,153' : '148,163,184'},.15);color:${c.active ? '#34d399' : '#94a3b8'};font-size:10px;font-weight:600">${c.active ? 'نشط' : 'معطّل'}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="admin-btn admin-btn-ghost" data-act="edit-carrier" data-id="${escapeHtml(c.code)}" style="flex:1;padding:6px;font-size:11px">تعديل</button>
            <button class="admin-btn admin-btn-ghost" data-act="toggle-carrier" data-id="${escapeHtml(c.code)}" style="flex:1;padding:6px;font-size:11px">${c.active ? 'تعطيل' : 'تفعيل'}</button>
          </div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:30px;text-align:center;color:#ef4444">خطأ: ${e.message}</div>`;
    }
  }

  async function actEditCarrier(code, existing) {
    let c = existing;
    if (!c) {
      const j = await api('/admin/carriers').catch(() => ({}));
      c = (j.data || []).find(x => x.code === code) || {};
    }
    openModal({
      title: c.code ? 'تعديل خط ملاحي' : 'إضافة خط ملاحي',
      sub: c.code || 'جديد',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <label>كود الخط (مثل MAEU, MSCU)<input type="text" id="fCCode" value="${escapeHtml(c.code || '')}" ${c.code ? 'readonly' : ''} maxlength="4" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-transform:uppercase;margin-top:4px;font-family:'JetBrains Mono'"></label>
          <label>الاسم التجاري<input type="text" id="fCName" value="${escapeHtml(c.name || '')}" placeholder="Maersk Line" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px"></label>
          <label>رابط الشعار (Logo URL)
            <input type="url" id="fCLogo" value="${escapeHtml(c.logo || '')}" placeholder="https://… أو /assets/carriers/maersk.svg" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px">
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;font-size:12px;color:#94a3b8">
              <div id="fCPreview" style="width:48px;height:48px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:4px">${c.logo ? `<img src="${escapeHtml(c.logo)}" style="max-width:100%;max-height:100%;object-fit:contain">` : 'preview'}</div>
              <span>المعاينة (يُنعكس على بطاقات الأسعار فوراً)</span>
            </div>
          </label>
          <label>الأولوية (1 = الأعلى)<input type="number" id="fCPriority" value="${c.priority || 50}" min="1" max="100" style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:4px"></label>
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fCActive" ${c.active !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:#34d399"> نشط (يظهر في بطاقات الأسعار)</label>
        </div>`,
      confirmText: c.code ? 'حفظ التعديلات' : 'إضافة',
      onConfirm: async (body) => {
        const data = {
          code: body.querySelector('#fCCode').value.toUpperCase().trim(),
          name: body.querySelector('#fCName').value.trim(),
          logo: body.querySelector('#fCLogo').value.trim(),
          priority: parseInt(body.querySelector('#fCPriority').value) || 50,
          active: body.querySelector('#fCActive').checked,
        };
        if (!data.code || !data.name) throw new Error('الكود والاسم إلزاميان');
        if (c.code) {
          await api(`/admin/carriers/${c.code}`, { method: 'PATCH', body: JSON.stringify(data) });
        } else {
          await api('/admin/carriers', { method: 'POST', body: JSON.stringify(data) });
        }
        toast('تم الحفظ', 'success');
        loadCarriers();
      },
    });
    // Wire logo preview
    setTimeout(() => {
      const logoInput = document.getElementById('fCLogo');
      const preview = document.getElementById('fCPreview');
      if (logoInput && preview) {
        logoInput.addEventListener('input', () => {
          const url = logoInput.value.trim();
          preview.innerHTML = url ? `<img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML='⚠️'">` : 'preview';
        });
      }
    }, 100);
  }

  async function actToggleCarrier(code) {
    try {
      const j = await api('/admin/carriers');
      const c = (j.data || []).find(x => x.code === code);
      if (!c) throw new Error('غير موجود');
      await api(`/admin/carriers/${code}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) });
      toast(`${c.active ? 'تم التعطيل' : 'تم التفعيل'}`, 'success');
      loadCarriers();
    } catch (e) { toast(e.message, 'error'); }
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
    // Fetch shipment + user details for context
    let shipment = null, userLabel = '';
    try {
      const j = await api('/shipments?scope=all');
      shipment = (j.data || []).find(s => s.id === id);
      if (shipment) {
        const userMap = _userCache || await loadUserMap();
        const u = userMap[shipment.user_id] || {};
        userLabel = u.email || u.full_name || shipment.user_id?.slice(0, 8) || '';
      }
    } catch {}

    const currentStatus = shipment?.status || 'pending';
    const statusOpts = [
      ['pending',   'قيد الموافقة',    '⏳'],
      ['active',    'في التخليص',      '📋'],
      ['transit',   'في عرض البحر',    '🚢'],
      ['delivered', 'تم التسليم',      '✅'],
      ['cancelled', 'ملغاة',           '❌'],
    ];

    openModal({
      title: '📦 تحديث حالة الشحنة',
      sub: shipment ? `${id} · ${userLabel} · ${shipment.origin} → ${shipment.destination}` : id,
      body: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="background:rgba(57,198,255,.06);border:1px solid rgba(57,198,255,.15);padding:10px 12px;border-radius:10px;font-size:12.5px;color:#cfe2f9">
            ℹ️ سيُرسل إشعار فوري للعميل بأي تغيير في الحالة + ملاحظتك.
          </div>
          <div>
            <label style="font-size:12.5px;color:#cfe2f9;font-weight:500;margin-bottom:8px;display:block">الحالة الجديدة</label>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px" id="fStatusGrid">
              ${statusOpts.map(([v, l, e]) => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:pointer">
                  <input type="radio" name="fStatus" value="${v}" ${currentStatus === v ? 'checked' : ''} style="accent-color:#39C6FF">
                  <span style="font-size:18px">${e}</span>
                  <span style="font-size:13px">${l}</span>
                </label>`).join('')}
            </div>
          </div>
          <label style="font-size:12.5px;color:#cfe2f9;font-weight:500">ملاحظة للعميل (تظهر في الإشعار)
            <textarea id="fNote" rows="2" placeholder="مثال: وصلت الشحنة ميناء جدة وفي مرحلة التخليص. الوصول للمستودع متوقع خلال 3-5 أيام." style="width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;margin-top:6px;font-family:inherit;font-size:13px;resize:vertical"></textarea>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#cfe2f9">
            <input type="checkbox" id="fSendEmail" checked style="width:16px;height:16px;accent-color:#39C6FF">
            إرسال إيميل للعميل أيضاً
          </label>
        </div>`,
      confirmText: '🔔 تحديث وإرسال إشعار',
      onConfirm: async (body) => {
        const status = body.querySelector('input[name="fStatus"]:checked')?.value;
        const note = body.querySelector('#fNote').value.trim();
        const sendEmail = body.querySelector('#fSendEmail').checked;
        if (!status) throw new Error('اختر حالة');
        await api(`/shipments/${id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status, note, send_email: sendEmail }),
        });
        toast({
          title: '✅ تم التحديث',
          msg: `الشحنة ${id} → ${status}. أُرسل إشعار للعميل.`,
          type: 'success',
        });
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
          else if (sec === 'carriers') loadCarriers();
        }, 50);
      });
    });

    // Add Carrier button
    $('#admAddCarrierBtn')?.addEventListener('click', () => actEditCarrier(null, null));

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
      else if (act === 'edit-carrier') actEditCarrier(id);
      else if (act === 'toggle-carrier') actToggleCarrier(id);
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
