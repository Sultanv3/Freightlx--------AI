/**
 * FREIGHTLX Admin Dashboard Logic
 * Uses FLX system store, adds admin-specific functions.
 */
(function () {
  'use strict';

  const ADMIN_KEY = 'flx-admin-session';
  const ADMIN_PASS_KEY = 'flx-admin-pass';
  const ADMIN_SETTINGS_KEY = 'flx-admin-settings';
  const ADMIN_LOGS_KEY = 'flx-admin-logs';
  const DEFAULT_PASS = 'admin123';

  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const fmt = (n) => '$' + Number(n).toLocaleString('en-US');
  const toast = (m, t) => window.flxToast ? window.flxToast(m, t || 'info') : alert(m);

  // ════════════════════════════════════════════════════════
  //  USERS (mock — could be from Supabase)
  // ════════════════════════════════════════════════════════
  function getUsers() {
    let users = JSON.parse(localStorage.getItem('flx-admin-users') || 'null');
    if (!users) {
      users = [
        { id: 'U-001', name: 'سلطان الجاسر',  email: 'sultan@freightlx.com',  status: 'active',  joined: '2026-01-15', shipments: 12, totalSpent: 47200 },
        { id: 'U-002', name: 'محمد العتيبي',  email: 'mohammed@example.com',  status: 'active',  joined: '2026-02-03', shipments: 7,  totalSpent: 21340 },
        { id: 'U-003', name: 'فهد القحطاني',  email: 'fahad@example.com',     status: 'active',  joined: '2026-02-18', shipments: 5,  totalSpent: 14820 },
        { id: 'U-004', name: 'عبدالله النصر', email: 'abdullah@example.com',  status: 'pending', joined: '2026-04-25', shipments: 0,  totalSpent: 0 },
        { id: 'U-005', name: 'ريم الزهراني', email: 'reem@example.com',      status: 'active',  joined: '2026-03-08', shipments: 9,  totalSpent: 31420 },
        { id: 'U-006', name: 'خالد الحربي',  email: 'khaled@example.com',    status: 'cancelled', joined: '2026-01-20', shipments: 2, totalSpent: 4600 },
      ];
      localStorage.setItem('flx-admin-users', JSON.stringify(users));
    }
    return users;
  }
  function saveUsers(users) {
    localStorage.setItem('flx-admin-users', JSON.stringify(users));
  }

  // ════════════════════════════════════════════════════════
  //  CARRIERS
  // ════════════════════════════════════════════════════════
  function getCarriers() {
    let c = JSON.parse(localStorage.getItem('flx-admin-carriers') || 'null');
    if (!c) {
      c = [
        { id: 'C-1', name: 'COSCO',       country: 'الصين',    code: 'CSCO', active: true,  shipments: 28 },
        { id: 'C-2', name: 'MSC',         country: 'سويسرا',   code: 'MSCU', active: true,  shipments: 22 },
        { id: 'C-3', name: 'Maersk',      country: 'دنمارك',   code: 'MAEU', active: true,  shipments: 18 },
        { id: 'C-4', name: 'CMA CGM',     country: 'فرنسا',    code: 'CMDU', active: true,  shipments: 14 },
        { id: 'C-5', name: 'Hapag-Lloyd', country: 'ألمانيا',  code: 'HLCU', active: true,  shipments: 11 },
        { id: 'C-6', name: 'HMM',         country: 'كوريا',    code: 'HDMU', active: true,  shipments: 8 },
        { id: 'C-7', name: 'ONE',         country: 'اليابان',  code: 'ONEY', active: false, shipments: 5 },
        { id: 'C-8', name: 'Arkas',       country: 'تركيا',    code: 'ARKU', active: true,  shipments: 3 },
      ];
      localStorage.setItem('flx-admin-carriers', JSON.stringify(c));
    }
    return c;
  }
  function saveCarriers(c) { localStorage.setItem('flx-admin-carriers', JSON.stringify(c)); }

  // ════════════════════════════════════════════════════════
  //  ACTIVITY LOG
  // ════════════════════════════════════════════════════════
  function logActivity(action, details) {
    const logs = JSON.parse(localStorage.getItem(ADMIN_LOGS_KEY) || '[]');
    logs.unshift({ action, details, time: Date.now(), id: 'L-' + Date.now() });
    if (logs.length > 200) logs.length = 200;
    localStorage.setItem(ADMIN_LOGS_KEY, JSON.stringify(logs));
    if (typeof renderLogs === 'function') renderLogs();
  }
  function getLogs() {
    return JSON.parse(localStorage.getItem(ADMIN_LOGS_KEY) || '[]');
  }
  function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'الآن';
    if (d < 3600) return 'منذ ' + Math.floor(d / 60) + ' دقيقة';
    if (d < 86400) return 'منذ ' + Math.floor(d / 3600) + ' ساعة';
    return 'منذ ' + Math.floor(d / 86400) + ' يوم';
  }

  // ════════════════════════════════════════════════════════
  //  LOGIN
  // ════════════════════════════════════════════════════════
  function checkAuth() {
    return sessionStorage.getItem(ADMIN_KEY) === '1';
  }

  function setupLogin() {
    const login = $('#adminLogin');
    const app   = $('#adminApp');
    const input = $('#adminPassword');
    const btn   = $('#adminLoginBtn');
    const err   = $('#adminLoginError');

    if (checkAuth()) {
      login.classList.add('hidden');
      app.style.display = 'grid';
      initApp();
      return;
    }

    function attempt() {
      const expected = localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_PASS;
      if (input.value === expected) {
        sessionStorage.setItem(ADMIN_KEY, '1');
        login.classList.add('hidden');
        app.style.display = 'grid';
        logActivity('admin.login', 'مدير سجّل دخول');
        initApp();
      } else {
        err.classList.add('show');
        input.value = '';
        input.focus();
        setTimeout(() => err.classList.remove('show'), 3000);
      }
    }

    btn.addEventListener('click', attempt);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    setTimeout(() => input.focus(), 100);

    $('#adminLogoutBtn')?.addEventListener('click', () => {
      sessionStorage.removeItem(ADMIN_KEY);
      logActivity('admin.logout', 'تسجيل خروج');
      location.reload();
    });
  }

  // ════════════════════════════════════════════════════════
  //  RENDERERS
  // ════════════════════════════════════════════════════════
  function renderOverview() {
    if (!window.FLX) return;
    const ships = FLX.getShipments();
    const invs  = FLX.getInvoices();
    const users = getUsers();
    const totalRevenue = invs.filter(i => i.status === 'paid').reduce((a, b) => a + b.amount, 0);
    const pending = invs.filter(i => i.status === 'pending').length;
    const active = ships.filter(s => ['active','transit','pending'].includes(s.status)).length;

    $('#admRevenue').textContent = fmt(totalRevenue);
    $('#admUsers').textContent = users.length;
    $('#admActiveShipments').textContent = active;
    $('#admPendingInvoices').textContent = pending;

    // Recent activity
    const logs = getLogs().slice(0, 6);
    const html = logs.length ? logs.map(l => `
      <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;gap:12px;align-items:center">
        <div style="width:34px;height:34px;border-radius:50%;background:rgba(14,165,233,0.12);color:#38bdf8;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <div style="flex:1">
          <div style="color:white;font-weight:600;font-size:13px">${l.action}</div>
          <div style="color:#64748b;font-size:11px;margin-top:2px">${l.details}</div>
        </div>
        <div style="color:#64748b;font-size:11px">${timeAgo(l.time)}</div>
      </div>
    `).join('') : '<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">لا توجد نشاطات بعد</div>';
    $('#admRecentActivity').innerHTML = html;

    // Date
    $('#admDateNow').textContent = new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderUsers(q) {
    let users = getUsers();
    if (q) {
      const ql = q.toLowerCase();
      users = users.filter(u => u.name.includes(q) || u.email.toLowerCase().includes(ql));
    }
    const html = users.length ? users.map(u => `
      <tr data-uid="${u.id}">
        <td style="padding-right:22px" class="admin-code">${u.id}</td>
        <td><strong style="color:white">${u.name}</strong></td>
        <td><span style="color:#94a3b8">${u.email}</span></td>
        <td>${u.shipments}</td>
        <td><strong>${fmt(u.totalSpent)}</strong></td>
        <td><span class="admin-badge admin-badge-${u.status === 'active' ? 'active' : u.status === 'cancelled' ? 'cancelled' : 'pending'}">${u.status === 'active' ? 'نشط' : u.status === 'cancelled' ? 'محظور' : 'بانتظار التفعيل'}</span></td>
        <td style="padding-left:22px">
          <div class="admin-action-row">
            <button class="admin-btn admin-btn-ghost" data-act="view-user" data-id="${u.id}">عرض</button>
            ${u.status === 'pending'
              ? `<button class="admin-btn admin-btn-success" data-act="activate-user" data-id="${u.id}">تفعيل</button>`
              : u.status === 'active'
              ? `<button class="admin-btn admin-btn-danger" data-act="ban-user" data-id="${u.id}">حظر</button>`
              : `<button class="admin-btn admin-btn-success" data-act="unban-user" data-id="${u.id}">رفع الحظر</button>`}
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b">لا توجد نتائج</td></tr>';
    $('#admUsersTable').innerHTML = html;
  }

  function renderShipments(filter) {
    if (!window.FLX) return;
    filter = filter || 'all';
    let ships = FLX.getShipments();
    if (filter !== 'all') ships = ships.filter(s => s.status === filter);
    const html = ships.length ? ships.map(s => `
      <tr data-sid="${s.id}">
        <td style="padding-right:22px" class="admin-code">${s.id}</td>
        <td><span class="admin-route">${s.from} ← ${s.to}</span></td>
        <td>${s.carrier}</td>
        <td><code style="background:rgba(255,255,255,0.06);padding:2px 7px;border-radius:5px;font-size:10px;color:#cbd5e1">${s.container}</code></td>
        <td style="color:#64748b">${s.date}</td>
        <td><span class="admin-badge admin-badge-${s.status}">${s.statusText}</span></td>
        <td><strong style="color:white">${fmt(s.price)}</strong></td>
        <td style="padding-left:22px">
          <div class="admin-action-row">
            <button class="admin-btn admin-btn-ghost" data-act="edit-ship" data-id="${s.id}">تعديل</button>
            <button class="admin-btn admin-btn-success" data-act="advance-ship" data-id="${s.id}">تقدم</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:#64748b">لا توجد شحنات</td></tr>';
    $('#admShipmentsTable').innerHTML = html;
  }

  function renderQuotes() {
    if (!window.FLX) return;
    const quotes = FLX.getQuotes();
    const html = quotes.length ? quotes.map(q => {
      const isValid = q.status === 'valid';
      return `
        <tr>
          <td style="padding-right:22px" class="admin-code">${q.id}</td>
          <td><span class="admin-route">${q.from} ← ${q.to}</span></td>
          <td>${q.carrier}</td>
          <td><strong style="color:white">${fmt(q.price)}</strong></td>
          <td>${q.validUntil}</td>
          <td><span class="admin-badge ${isValid ? 'admin-badge-active' : 'admin-badge-cancelled'}">${isValid ? 'سارية' : 'منتهية'}</span></td>
          <td style="padding-left:22px">
            <div class="admin-action-row">
              <button class="admin-btn admin-btn-ghost" data-act="edit-quote" data-id="${q.id}">تعديل</button>
              <button class="admin-btn admin-btn-danger" data-act="del-quote" data-id="${q.id}">حذف</button>
            </div>
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b">لا توجد عروض</td></tr>';
    $('#admQuotesTable').innerHTML = html;
  }

  function renderInvoices() {
    if (!window.FLX) return;
    const invs = FLX.getInvoices();
    const html = invs.length ? invs.map(i => `
      <tr>
        <td style="padding-right:22px" class="admin-code">${i.id}</td>
        <td><span style="color:#cbd5e1">${i.desc}</span></td>
        <td style="color:#64748b">${i.date}</td>
        <td><strong style="color:white">${fmt(i.amount)}</strong></td>
        <td><span class="admin-badge admin-badge-${i.status === 'paid' ? 'paid' : 'pending'}">${i.status === 'paid' ? 'مدفوعة' : 'قيد التسديد'}</span></td>
        <td style="padding-left:22px">
          <div class="admin-action-row">
            ${i.status !== 'paid' ? `<button class="admin-btn admin-btn-success" data-act="mark-paid" data-id="${i.id}">تعليم مدفوع</button>` : ''}
            <button class="admin-btn admin-btn-ghost" data-act="download-inv" data-id="${i.id}">PDF</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#64748b">لا توجد فواتير</td></tr>';
    $('#admInvoicesTable').innerHTML = html;
  }

  function renderCarriers() {
    const carriers = getCarriers();
    const html = carriers.map(c => `
      <div class="admin-card" style="text-align:center;position:relative">
        <div style="position:absolute;top:14px;right:14px">
          <span class="admin-badge ${c.active ? 'admin-badge-active' : 'admin-badge-cancelled'}">${c.active ? 'نشط' : 'موقوف'}</span>
        </div>
        <div style="width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,#0ea5e9,#6366f1);margin:0 auto 12px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;color:white;font-weight:700">${c.name.charAt(0)}</div>
        <div style="font-family:Fraunces,serif;font-weight:700;font-size:17px;color:white">${c.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${c.country} · ${c.code}</div>
        <div style="font-size:12px;color:#38bdf8;margin-top:10px;font-weight:600">${c.shipments} شحنة</div>
        <div style="margin-top:14px;display:flex;gap:6px;justify-content:center">
          <button class="admin-btn admin-btn-ghost" data-act="toggle-carrier" data-id="${c.id}">${c.active ? 'إيقاف' : 'تفعيل'}</button>
          <button class="admin-btn admin-btn-ghost" data-act="edit-carrier" data-id="${c.id}">تعديل</button>
        </div>
      </div>
    `).join('');
    $('#admCarriersGrid').innerHTML = html;
  }

  function renderLogs() {
    const logs = getLogs();
    const html = logs.length ? logs.slice(0, 50).map(l => `
      <div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;gap:14px">
        <div style="font-family:'IBM Plex Mono',monospace;color:#64748b;font-size:11px;min-width:140px">${new Date(l.time).toLocaleString('ar-SA')}</div>
        <div style="background:rgba(14,165,233,0.08);color:#38bdf8;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;height:fit-content;font-family:'IBM Plex Mono',monospace">${l.action}</div>
        <div style="flex:1;color:#cbd5e1;font-size:13px">${l.details}</div>
      </div>
    `).join('') : '<div style="text-align:center;padding:40px;color:#64748b">لا توجد عمليات مسجّلة بعد</div>';
    $('#admLogsContainer').innerHTML = html;
  }

  // ════════════════════════════════════════════════════════
  //  CHARTS
  // ════════════════════════════════════════════════════════
  const charts = {};
  function chartSetup() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#94a3b8';
  }

  function makeRevenueChart() {
    const ctx = document.getElementById('admRevenueChart');
    if (!ctx || charts.revenue) return;
    chartSetup();
    charts.revenue = new Chart(ctx, {
      type: 'line',
      data: { labels: ['ديسمبر','يناير','فبراير','مارس','أبريل','مايو'],
        datasets: [{ data: [18500, 24300, 29800, 38400, 47200, 52800],
          borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)',
          fill: true, tension: 0.4, borderWidth: 2.5,
          pointBackgroundColor: '#0ea5e9', pointBorderColor: '#0a1428',
          pointBorderWidth: 2, pointRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' }, grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } }
    });
  }

  function makeStatusChart() {
    const ctx = document.getElementById('admStatusChart');
    if (!ctx || charts.status) return;
    chartSetup();
    if (!window.FLX) return;
    const ships = FLX.getShipments();
    const buckets = { active: 0, transit: 0, pending: 0, completed: 0, cancelled: 0 };
    ships.forEach(s => buckets[s.status] = (buckets[s.status] || 0) + 1);
    charts.status = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['نشطة','في الطريق','معلّقة','مكتملة','ملغية'],
        datasets: [{ data: [buckets.active, buckets.transit, buckets.pending, buckets.completed, buckets.cancelled],
          backgroundColor: ['#22c55e','#0ea5e9','#f59e0b','#64748b','#ef4444'],
          borderColor: '#0a1428', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { padding: 12, boxWidth: 10 } } } }
    });
  }

  function makeAnalyticsCharts() {
    chartSetup();
    if (!charts.carrierRevenue) {
      const ctx = document.getElementById('admCarrierRevenueChart');
      if (ctx) charts.carrierRevenue = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['COSCO','MSC','Maersk','CMA CGM','Hapag','HMM'],
          datasets: [{ data: [18400, 14200, 11800, 9600, 7400, 5200],
            backgroundColor: 'rgba(56,189,248,0.7)', borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }, x: { grid: { display: false } } } }
      });
    }
    if (!charts.route) {
      const ctx = document.getElementById('admRouteChart');
      if (ctx) charts.route = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['CN→SA','TR→SA','IN→SA','DE→SA','KR→SA','JP→SA'],
          datasets: [{ data: [42, 18, 12, 8, 5, 3], backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } }
      });
    }
    if (!charts.conversion) {
      const ctx = document.getElementById('admConversionChart');
      if (ctx) charts.conversion = new Chart(ctx, {
        type: 'line',
        data: { labels: ['ديسمبر','يناير','فبراير','مارس','أبريل','مايو'],
          datasets: [
            { label: 'عروض مُرسلة', data: [42, 56, 64, 78, 89, 102], borderColor: '#64748b', borderWidth: 2, tension: 0.36, fill: false },
            { label: 'حجوزات مؤكدة', data: [18, 24, 31, 42, 51, 64], borderColor: '#22c55e', borderWidth: 2.5, tension: 0.36, fill: false, backgroundColor: 'rgba(34,197,94,0.1)' }
          ] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: '#cbd5e1' } } },
          scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } }
      });
    }
  }

  // ════════════════════════════════════════════════════════
  //  NAVIGATION
  // ════════════════════════════════════════════════════════
  const TITLES = {
    overview: 'نظرة عامة', users: 'العملاء', shipments: 'الشحنات',
    quotes: 'العروض', invoices: 'الفواتير', carriers: 'خطوط الشحن',
    analytics: 'التحليلات', logs: 'سجل النشاط', settings: 'الإعدادات'
  };
  function navigateTo(section) {
    if (!TITLES[section]) section = 'overview';
    $$('.admin-nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === section));
    $$('.admin-section').forEach(s => s.classList.toggle('active', s.id === 'adm-section-' + section));
    if (section === 'overview') { renderOverview(); makeRevenueChart(); makeStatusChart(); }
    if (section === 'users')     renderUsers();
    if (section === 'shipments') renderShipments();
    if (section === 'quotes')    renderQuotes();
    if (section === 'invoices')  renderInvoices();
    if (section === 'carriers')  renderCarriers();
    if (section === 'logs')      renderLogs();
    if (section === 'analytics') makeAnalyticsCharts();
    if (history.replaceState) history.replaceState(null, '', '#' + section);
    document.scrollingElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ════════════════════════════════════════════════════════
  //  ACTIONS
  // ════════════════════════════════════════════════════════
  function bindActions() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      const id = t.dataset.id;

      // Users
      if (act === 'activate-user') {
        const users = getUsers();
        const u = users.find(x => x.id === id);
        if (u) { u.status = 'active'; saveUsers(users); renderUsers(); logActivity('user.activate', `تفعيل ${u.name}`); toast('✅ تم تفعيل ' + u.name, 'success'); }
      }
      if (act === 'ban-user') {
        const users = getUsers();
        const u = users.find(x => x.id === id);
        if (u) { u.status = 'cancelled'; saveUsers(users); renderUsers(); logActivity('user.ban', `حظر ${u.name}`); toast('🚫 تم حظر ' + u.name, 'error'); }
      }
      if (act === 'unban-user') {
        const users = getUsers();
        const u = users.find(x => x.id === id);
        if (u) { u.status = 'active'; saveUsers(users); renderUsers(); logActivity('user.unban', `رفع حظر ${u.name}`); toast('✅ تم رفع الحظر', 'success'); }
      }
      if (act === 'view-user') {
        const u = getUsers().find(x => x.id === id);
        toast(`عرض ${u?.name}: ${u?.shipments} شحنة، ${fmt(u?.totalSpent)} إجمالي`, 'info', 5000);
      }

      // Shipments
      if (act === 'advance-ship') {
        const order = ['pending','active','transit','completed'];
        const texts = ['قيد الموافقة','في التخليص','في عرض البحر','مكتملة'];
        const s = FLX.getShipments().find(x => x.id === id);
        if (s) {
          const i = order.indexOf(s.status);
          const next = order[Math.min(i + 1, order.length - 1)];
          FLX.updateShipment(id, { status: next, statusText: texts[order.indexOf(next)] });
          logActivity('ship.advance', `${id}: ${s.status} → ${next}`);
          FLX.addNotification({ type:'info', text:`تم تحديث حالة شحنة <strong>${id}</strong> إلى ${texts[order.indexOf(next)]}` });
          renderShipments();
          toast('✅ تم تحديث الحالة', 'success');
        }
      }
      if (act === 'edit-ship') {
        openModal('تعديل الشحنة', `رقم: ${id}`, `<div class="admin-form-grid">
          <div class="admin-form-group"><label>الحالة</label>
            <select id="modShipStatus">
              <option value="pending">معلّقة</option><option value="active">نشطة</option>
              <option value="transit">في الطريق</option><option value="completed">مكتملة</option>
              <option value="cancelled">ملغية</option>
            </select></div>
          <div class="admin-form-group"><label>السعر ($)</label>
            <input type="number" id="modShipPrice" min="0"></div>
        </div>`, () => {
          const status = $('#modShipStatus').value;
          const price = parseFloat($('#modShipPrice').value) || undefined;
          const texts = { pending:'قيد الموافقة', active:'في التخليص', transit:'في عرض البحر', completed:'مكتملة', cancelled:'ملغية' };
          const patch = { status, statusText: texts[status] };
          if (price) patch.price = price;
          FLX.updateShipment(id, patch);
          renderShipments();
          logActivity('ship.edit', `${id} → ${status}`);
          toast('✅ تم تحديث الشحنة', 'success');
        });
        const s = FLX.getShipments().find(x => x.id === id);
        if (s) { $('#modShipStatus').value = s.status; $('#modShipPrice').value = s.price; }
      }

      // Quotes
      if (act === 'del-quote') {
        if (!confirm('هل تريد حذف هذا العرض؟')) return;
        const all = FLX.getQuotes();
        const idx = all.findIndex(q => q.id === id);
        if (idx >= 0) {
          // mutate by re-saving with quote removed
          const win = window;
          win.FLX_INTERNAL_STORE = win.FLX_INTERNAL_STORE || {};
          // Use direct localStorage manipulation since we don't have a delete API
          const storeKey = 'flx-dashboard-store-v1';
          const data = JSON.parse(localStorage.getItem(storeKey));
          data.quotes = data.quotes.filter(q => q.id !== id);
          localStorage.setItem(storeKey, JSON.stringify(data));
          FLX.emit('quotes.changed');
          renderQuotes();
          logActivity('quote.delete', `حذف ${id}`);
          toast('🗑️ تم الحذف', 'success');
        }
      }

      // Invoices
      if (act === 'mark-paid') {
        const storeKey = 'flx-dashboard-store-v1';
        const data = JSON.parse(localStorage.getItem(storeKey));
        const inv = data.invoices.find(i => i.id === id);
        if (inv) {
          inv.status = 'paid';
          localStorage.setItem(storeKey, JSON.stringify(data));
          FLX.emit('invoices.changed');
          FLX.addNotification({ type:'success', text:`الفاتورة <strong>${id}</strong> تم تحديثها كمدفوعة` });
          renderInvoices();
          renderOverview();
          logActivity('invoice.paid', `${id} مدفوعة الآن (${fmt(inv.amount)})`);
          toast('✅ تم تعليم الفاتورة مدفوعة', 'success');
        }
      }
      if (act === 'download-inv') {
        FLX.downloadInvoice(id);
        logActivity('invoice.download', `تحميل ${id}`);
      }

      // Carriers
      if (act === 'toggle-carrier') {
        const carriers = getCarriers();
        const c = carriers.find(x => x.id === id);
        if (c) { c.active = !c.active; saveCarriers(carriers); renderCarriers(); logActivity('carrier.toggle', `${c.name}: ${c.active ? 'تفعيل' : 'إيقاف'}`); toast('✅ تم التحديث', 'success'); }
      }
      if (act === 'edit-carrier') {
        const c = getCarriers().find(x => x.id === id);
        if (!c) return;
        openModal('تعديل خط الشحن', c.name, `<div class="admin-form-grid">
          <div class="admin-form-group"><label>الاسم</label><input id="modCarName" value="${c.name}"></div>
          <div class="admin-form-group"><label>الدولة</label><input id="modCarCountry" value="${c.country}"></div>
          <div class="admin-form-group"><label>الكود</label><input id="modCarCode" value="${c.code}"></div>
        </div>`, () => {
          c.name = $('#modCarName').value;
          c.country = $('#modCarCountry').value;
          c.code = $('#modCarCode').value;
          saveCarriers(getCarriers());
          renderCarriers();
          logActivity('carrier.edit', c.name);
          toast('✅ تم التحديث', 'success');
        });
      }
    });

    // User search
    $('#admUserSearch')?.addEventListener('input', (e) => {
      renderUsers(e.target.value.trim());
    });

    // Filters (shipments)
    $$('#adm-section-shipments .admin-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#adm-section-shipments .admin-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderShipments(btn.dataset.filter);
      });
    });

    // Add buttons (open modal)
    $('#admAddUserBtn')?.addEventListener('click', () => {
      openModal('إضافة عميل', 'أدخل بيانات العميل الجديد', `<div class="admin-form-grid">
        <div class="admin-form-group" style="grid-column:1/-1"><label>الاسم</label><input id="modUserName"></div>
        <div class="admin-form-group" style="grid-column:1/-1"><label>الإيميل</label><input type="email" id="modUserEmail"></div>
      </div>`, () => {
        const name = $('#modUserName').value.trim();
        const email = $('#modUserEmail').value.trim();
        if (!name || !email) { toast('الاسم والإيميل مطلوبان', 'error'); return false; }
        const users = getUsers();
        const id = 'U-' + String(users.length + 1).padStart(3, '0');
        users.push({ id, name, email, status: 'active', joined: new Date().toISOString().slice(0,10), shipments: 0, totalSpent: 0 });
        saveUsers(users);
        renderUsers();
        logActivity('user.add', `إضافة ${name}`);
        toast('✅ تم إضافة العميل', 'success');
      });
    });

    $('#admAddShipmentBtn')?.addEventListener('click', () => {
      openModal('إضافة شحنة', 'شحنة يدوية جديدة', `<div class="admin-form-grid">
        <div class="admin-form-group"><label>من (UN/LOCODE)</label><input id="modShipFrom" maxlength="5" placeholder="CNSHA"></div>
        <div class="admin-form-group"><label>إلى</label><input id="modShipTo" maxlength="5" value="SAJED"></div>
        <div class="admin-form-group"><label>الناقل</label><input id="modShipCarrier" placeholder="COSCO"></div>
        <div class="admin-form-group"><label>الحاوية</label><select id="modShipContainer"><option>40HC</option><option>40GP</option><option>20GP</option></select></div>
        <div class="admin-form-group" style="grid-column:1/-1"><label>السعر ($)</label><input type="number" id="modShipPriceNew" min="100" placeholder="2500"></div>
      </div>`, () => {
        const from = $('#modShipFrom').value.toUpperCase().trim();
        const to = $('#modShipTo').value.toUpperCase().trim();
        const carrier = $('#modShipCarrier').value.trim();
        const container = $('#modShipContainer').value;
        const price = parseFloat($('#modShipPriceNew').value);
        if (!from || !to || !carrier || !price) { toast('كل الحقول مطلوبة', 'error'); return false; }
        const id = 'FLX-B-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
        FLX.addShipment({ id, from, to, carrier, container, date: new Date().toISOString().slice(0,10), status: 'pending', statusText: 'قيد الموافقة', price });
        renderShipments();
        renderOverview();
        logActivity('ship.add', `إضافة ${id}`);
        toast('✅ تم إضافة الشحنة', 'success');
      });
    });

    $('#admAddCarrierBtn')?.addEventListener('click', () => {
      openModal('إضافة خط شحن', '', `<div class="admin-form-grid">
        <div class="admin-form-group"><label>الاسم</label><input id="modNewCarName"></div>
        <div class="admin-form-group"><label>الدولة</label><input id="modNewCarCountry"></div>
        <div class="admin-form-group" style="grid-column:1/-1"><label>الكود (SCAC)</label><input id="modNewCarCode" maxlength="4"></div>
      </div>`, () => {
        const carriers = getCarriers();
        const name = $('#modNewCarName').value.trim();
        const country = $('#modNewCarCountry').value.trim();
        const code = $('#modNewCarCode').value.toUpperCase().trim();
        if (!name) { toast('الاسم مطلوب', 'error'); return false; }
        carriers.push({ id: 'C-' + Date.now(), name, country, code, active: true, shipments: 0 });
        saveCarriers(carriers);
        renderCarriers();
        logActivity('carrier.add', `إضافة ${name}`);
        toast('✅ تم إضافة خط الشحن', 'success');
      });
    });

    // Settings
    $('#admSaveSettingsBtn')?.addEventListener('click', () => {
      const s = {
        platform: $('#admSetPlatform').value,
        email: $('#admSetEmail').value,
        currency: $('#admSetCurrency').value,
        commission: parseFloat($('#admSetCommission').value),
        vat: parseFloat($('#admSetVAT').value),
        saberFee: parseFloat($('#admSetSaberFee').value)
      };
      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(s));
      logActivity('settings.save', 'تم تحديث إعدادات النظام');
      toast('✅ تم حفظ الإعدادات', 'success');
    });

    $('#admChangePassBtn')?.addEventListener('click', () => {
      const p1 = $('#admNewPass').value;
      const p2 = $('#admNewPass2').value;
      if (p1.length < 6) { toast('كلمة المرور يجب 6 أحرف على الأقل', 'error'); return; }
      if (p1 !== p2) { toast('كلمتا المرور غير متطابقتين', 'error'); return; }
      localStorage.setItem(ADMIN_PASS_KEY, p1);
      $('#admNewPass').value = ''; $('#admNewPass2').value = '';
      logActivity('admin.password', 'تغيير كلمة المرور');
      toast('✅ تم تحديث كلمة المرور', 'success');
    });

    $('#admResetDataBtn')?.addEventListener('click', () => {
      if (!confirm('⚠️ هذا سيمسح كل البيانات. متأكد؟')) return;
      ['flx-dashboard-store-v1','flx-admin-users','flx-admin-carriers',ADMIN_LOGS_KEY,ADMIN_SETTINGS_KEY].forEach(k => localStorage.removeItem(k));
      logActivity('system.reset', 'مسح كل البيانات');
      toast('🗑️ تم المسح - إعادة تحميل...', 'info');
      setTimeout(() => location.reload(), 1200);
    });

    $('#admClearLogsBtn')?.addEventListener('click', () => {
      if (!confirm('مسح كل سجل النشاط؟')) return;
      localStorage.removeItem(ADMIN_LOGS_KEY);
      renderLogs();
      toast('🗑️ تم مسح السجل', 'success');
    });

    $('#admRefreshBtn')?.addEventListener('click', () => {
      renderOverview();
      toast('🔄 تم التحديث', 'success', 1500);
    });
  }

  // ════════════════════════════════════════════════════════
  //  MODAL
  // ════════════════════════════════════════════════════════
  function openModal(title, sub, bodyHtml, onConfirm) {
    $('#admModalTitle').textContent = title;
    $('#admModalSub').textContent = sub;
    $('#admModalBody').innerHTML = bodyHtml;
    $('#admModal').classList.add('show');
    const confirmBtn = $('#admModalConfirm');
    const cancelBtn = $('#admModalCancel');
    const close = () => $('#admModal').classList.remove('show');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', () => {
      const result = onConfirm && onConfirm();
      if (result !== false) close();
    });
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', close);
  }

  // ════════════════════════════════════════════════════════
  //  INIT APP (after login)
  // ════════════════════════════════════════════════════════
  function initApp() {
    // Wait for FLX
    if (!window.FLX) {
      setTimeout(initApp, 100);
      return;
    }

    // Load settings
    try {
      const s = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || 'null');
      if (s) {
        if (s.platform)  $('#admSetPlatform').value = s.platform;
        if (s.email)     $('#admSetEmail').value = s.email;
        if (s.currency)  $('#admSetCurrency').value = s.currency;
        if (s.commission != null) $('#admSetCommission').value = s.commission;
        if (s.vat != null)        $('#admSetVAT').value = s.vat;
        if (s.saberFee != null)   $('#admSetSaberFee').value = s.saberFee;
      }
    } catch {}

    // Navigation
    $$('.admin-nav-item').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.section)));

    // Bind all actions
    bindActions();

    // Initial render
    renderOverview();
    makeRevenueChart();
    makeStatusChart();

    // Live updates from store
    FLX.on('shipments.changed', () => { renderShipments(); renderOverview(); });
    FLX.on('invoices.changed',  () => { renderInvoices();  renderOverview(); });
    FLX.on('quotes.changed',    renderQuotes);

    // URL hash
    const hash = location.hash.replace('#', '');
    if (hash && TITLES[hash]) navigateTo(hash);

    // Welcome toast
    setTimeout(() => toast('👋 مرحباً Admin · ' + Object.keys(TITLES).length + ' أقسام متاحة', 'info', 3000), 800);
  }

  // ════════════════════════════════════════════════════════
  //  BOOT
  // ════════════════════════════════════════════════════════
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLogin);
  else setupLogin();
})();
