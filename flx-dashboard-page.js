/**
 * FREIGHTLX Dashboard Logic
 * Sidebar navigation, mock data rendering, Chart.js integration
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════
  //  MOCK DATA
  // ════════════════════════════════════════════════════════
  const SHIPMENTS = [
    { id: 'FLX-B-2026-7841', from: 'CNSHA', to: 'SAJED', carrier: 'COSCO',  container: '40HC', date: '2026-04-28', status: 'transit',   statusText: 'في عرض البحر',    price: 3450 },
    { id: 'FLX-B-2026-7639', from: 'CNSZX', to: 'SADMM', carrier: 'MSC',    container: '40GP', date: '2026-04-30', status: 'active',    statusText: 'في التخليص',      price: 2980 },
    { id: 'FLX-B-2026-7421', from: 'TRMER', to: 'SAJED', carrier: 'Arkas',  container: '20GP', date: '2026-05-02', status: 'pending',   statusText: 'قيد الموافقة',    price: 1650 },
    { id: 'FLX-B-2026-7102', from: 'INNSA', to: 'SAJED', carrier: 'Maersk', container: '40HC', date: '2026-04-10', status: 'completed', statusText: 'مكتملة',          price: 2720 },
    { id: 'FLX-B-2026-6890', from: 'DEHAM', to: 'SADMM', carrier: 'Hapag-Lloyd', container: '40GP', date: '2026-03-22', status: 'completed', statusText: 'مكتملة', price: 4120 },
    { id: 'FLX-B-2026-6754', from: 'CNNGB', to: 'SAJED', carrier: 'CMA CGM',container: '40HC', date: '2026-03-15', status: 'completed', statusText: 'مكتملة',          price: 3380 },
    { id: 'FLX-B-2026-6502', from: 'CNSHA', to: 'SAJED', carrier: 'HMM',    container: '20GP', date: '2026-03-01', status: 'completed', statusText: 'مكتملة',          price: 1820 },
    { id: 'FLX-B-2026-6234', from: 'KRPUS', to: 'SADMM', carrier: 'ONE',    container: '40HC', date: '2026-02-18', status: 'cancelled', statusText: 'ملغية',           price: 0 }
  ];

  const QUOTES = [
    { id: 'Q-2026-1284', from: 'CNSHA', to: 'SAJED', carrier: 'COSCO',  price: 3450, validUntil: '2026-05-20', status: 'valid' },
    { id: 'Q-2026-1283', from: 'CNSZX', to: 'SADMM', carrier: 'MSC',    price: 2980, validUntil: '2026-05-19', status: 'valid' },
    { id: 'Q-2026-1281', from: 'TRMER', to: 'SAJED', carrier: 'Arkas',  price: 1650, validUntil: '2026-05-25', status: 'valid' },
    { id: 'Q-2026-1278', from: 'INNSA', to: 'SAJED', carrier: 'Maersk', price: 2720, validUntil: '2026-05-15', status: 'valid' },
    { id: 'Q-2026-1275', from: 'DEHAM', to: 'SADMM', carrier: 'Hapag',  price: 4120, validUntil: '2026-05-30', status: 'valid' },
    { id: 'Q-2026-1242', from: 'CNNGB', to: 'SAJED', carrier: 'CMA',    price: 3380, validUntil: '2026-04-30', status: 'expired' },
    { id: 'Q-2026-1218', from: 'CNSHA', to: 'SAJED', carrier: 'HMM',    price: 1820, validUntil: '2026-04-22', status: 'expired' },
    { id: 'Q-2026-1195', from: 'KRPUS', to: 'SADMM', carrier: 'ONE',    price: 3120, validUntil: '2026-04-15', status: 'expired' }
  ];

  const ACTIVITY = [
    { type: 'success', icon: 'check', text: '<strong>شحنة FLX-B-2026-7102</strong> وصلت لميناء جدة', time: 'منذ ساعتين' },
    { type: 'info',    icon: 'truck', text: '<strong>FLX-B-2026-7841</strong> غادرت ميناء شنغهاي', time: 'أمس · 14:30' },
    { type: 'warning', icon: 'alert', text: 'شهادة سابر لـ <strong>SC-9821</strong> ستنتهي خلال 3 أيام', time: 'أمس · 09:15' },
    { type: 'info',    icon: 'file',  text: 'تم رفع <strong>فاتورة تجارية</strong> لشحنة FLX-B-2026-7421', time: 'منذ يومين' },
    { type: 'success', icon: 'check', text: 'تم استلام دفعة <strong>$2,720</strong> للفاتورة INV-2026-148', time: '3 مايو · 11:20' }
  ];

  const DOCS = [
    { name: 'شهادة سابر SC-9821',         type: 'pdf', size: '186 KB', date: '2026-05-08', cat: 'saber' },
    { name: 'بوليصة شحن BL-7841',          type: 'pdf', size: '420 KB', date: '2026-05-07', cat: 'bl' },
    { name: 'فاتورة تجارية INV-2026-152', type: 'pdf', size: '215 KB', date: '2026-05-05', cat: 'invoice' },
    { name: 'شهادة منشأ CO-3344',          type: 'pdf', size: '156 KB', date: '2026-05-04', cat: 'origin' },
    { name: 'بوليصة شحن BL-7639',          type: 'pdf', size: '380 KB', date: '2026-05-02', cat: 'bl' },
    { name: 'شهادة سابر SC-9712',          type: 'pdf', size: '195 KB', date: '2026-04-28', cat: 'saber' },
    { name: 'صورة الحاوية CO-7102',        type: 'jpg', size: '2.4 MB', date: '2026-04-25', cat: 'photo' },
    { name: 'فاتورة تجارية INV-2026-148', type: 'pdf', size: '210 KB', date: '2026-04-22', cat: 'invoice' }
  ];

  const INVOICES = [
    { id: 'INV-2026-152', desc: 'شحن CNSHA → SAJED · COSCO 40HC',  date: '2026-05-08', amount: 3450, status: 'paid' },
    { id: 'INV-2026-151', desc: 'شهادة سابر SC-9821',               date: '2026-05-05', amount: 580,  status: 'paid' },
    { id: 'INV-2026-150', desc: 'شحن CNSZX → SADMM · MSC 40GP',     date: '2026-05-02', amount: 2980, status: 'pending' },
    { id: 'INV-2026-149', desc: 'تخليص جمركي + رسوم',                date: '2026-04-30', amount: 720,  status: 'pending' },
    { id: 'INV-2026-148', desc: 'شحن INNSA → SAJED · Maersk 40HC',  date: '2026-04-22', amount: 2720, status: 'paid' },
    { id: 'INV-2026-147', desc: 'شهادة سابر SC-9712',               date: '2026-04-20', amount: 580,  status: 'paid' },
    { id: 'INV-2026-146', desc: 'شحن DEHAM → SADMM · Hapag 40GP',   date: '2026-03-30', amount: 4120, status: 'paid' },
    { id: 'INV-2026-145', desc: 'شحن CNNGB → SAJED · CMA 40HC',     date: '2026-03-22', amount: 3380, status: 'paid' }
  ];

  // ════════════════════════════════════════════════════════
  //  ICONS
  // ════════════════════════════════════════════════════════
  const ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a4 4 0 0 0 4-2 4 4 0 0 1 4-1 4 4 0 0 1 4 1 4 4 0 0 0 4 2"/><path d="M4 18l-2-7h20l-2 7"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
    file:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    pdf:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    img:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  };

  // ════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ════════════════════════════════════════════════════════
  const $ = (s, ctx) => (ctx || document).querySelector(s);
  const fmtPrice = (n) => '$' + n.toLocaleString('en-US');

  function renderShipmentRow(s, compact) {
    const badge = `<span class="dash-badge dash-badge-${s.status}">${s.statusText}</span>`;
    const route = `<div class="dash-route"><span>${s.from}</span><span class="arrow">←</span><span>${s.to}</span></div>`;
    if (compact) {
      return `
        <tr>
          <td class="dash-shipment-code">${s.id}</td>
          <td>${route}</td>
          <td>${badge}</td>
          <td><strong>${fmtPrice(s.price)}</strong></td>
        </tr>`;
    }
    return `
      <tr>
        <td style="padding-right:20px" class="dash-shipment-code">${s.id}</td>
        <td>${route}</td>
        <td>${s.carrier}</td>
        <td><code style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:11px">${s.container}</code></td>
        <td style="color:#64748b">${s.date}</td>
        <td>${badge}</td>
        <td style="text-align:left;padding-left:20px"><strong>${fmtPrice(s.price)}</strong></td>
      </tr>`;
  }

  function renderActivity(items) {
    return items.map(a => `
      <div class="dash-timeline-item">
        <div class="dash-timeline-dot ${a.type}">${ICONS[a.icon] || ICONS.file}</div>
        <div>
          <div class="dash-timeline-text">${a.text}</div>
          <div class="dash-timeline-time">${a.time}</div>
        </div>
      </div>
    `).join('');
  }

  function renderDocs(docs) {
    return docs.map(d => `
      <div class="dash-doc">
        <div class="dash-doc-icon">${d.type === 'jpg' ? ICONS.img : ICONS.pdf}</div>
        <div class="dash-doc-name">${d.name}</div>
        <div class="dash-doc-meta">${d.type.toUpperCase()} · ${d.size} · ${d.date}</div>
      </div>
    `).join('');
  }

  function renderQuotes(quotes) {
    return quotes.map(q => {
      const isValid = q.status === 'valid';
      const badge = isValid
        ? `<span class="dash-badge dash-badge-active">سارية</span>`
        : `<span class="dash-badge dash-badge-cancelled">منتهية</span>`;
      return `
        <tr>
          <td class="dash-shipment-code">${q.id}</td>
          <td><div class="dash-route"><span>${q.from}</span><span class="arrow">←</span><span>${q.to}</span></div></td>
          <td>${q.carrier}</td>
          <td><strong>${fmtPrice(q.price)}</strong></td>
          <td>${q.validUntil} ${badge}</td>
          <td style="text-align:left">
            ${isValid
              ? '<button class="dash-btn dash-btn-primary" style="padding:6px 12px;font-size:11px">احجز</button>'
              : '<button class="dash-btn dash-btn-ghost" style="padding:6px 12px;font-size:11px">تجديد</button>'}
          </td>
        </tr>`;
    }).join('');
  }

  function renderInvoices(invs) {
    return invs.map(i => {
      const badge = i.status === 'paid'
        ? `<span class="dash-badge dash-badge-active">مدفوعة</span>`
        : `<span class="dash-badge dash-badge-pending">قيد التسديد</span>`;
      return `
        <tr>
          <td class="dash-shipment-code">${i.id}</td>
          <td style="color:#475569">${i.desc}</td>
          <td style="color:#64748b">${i.date}</td>
          <td><strong>${fmtPrice(i.amount)}</strong></td>
          <td>${badge}</td>
          <td style="text-align:left">
            <button class="dash-btn dash-btn-ghost" style="padding:6px 12px;font-size:11px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              تحميل
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // ════════════════════════════════════════════════════════
  //  CHARTS
  // ════════════════════════════════════════════════════════
  let charts = {};

  function chartFontDefaults() {
    if (window.Chart) {
      Chart.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif";
      Chart.defaults.font.size = 12;
      Chart.defaults.color = '#475569';
    }
  }

  function makeSpendingChart() {
    const ctx = document.getElementById('dashSpendingChart');
    if (!ctx || charts.spending) return;
    charts.spending = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو'],
        datasets: [{
          label: 'المصروف (USD)',
          data: [3200, 4800, 5650, 7340, 12420, 13750],
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.08)',
          fill: true,
          tension: 0.36,
          borderWidth: 2.5,
          pointBackgroundColor: '#0284c7',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: { callback: (v) => '$' + (v/1000).toFixed(1) + 'K' },
            grid: { color: '#f1f5f9' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function makeCarriersChart() {
    const ctx = document.getElementById('dashCarriersChart');
    if (!ctx || charts.carriers) return;
    charts.carriers = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['COSCO', 'MSC', 'Maersk', 'CMA CGM', 'Hapag-Lloyd', 'أخرى'],
        datasets: [{
          data: [28, 22, 18, 14, 11, 7],
          backgroundColor: ['#0ea5e9','#1e3a6e','#d97706','#7e22ce','#16a34a','#94a3b8'],
          borderColor: '#fff',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 12 } } },
        cutout: '60%'
      }
    });
  }

  function makeRoutesChart() {
    const ctx = document.getElementById('dashRoutesChart');
    if (!ctx || charts.routes) return;
    charts.routes = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['CN→SA', 'TR→SA', 'IN→SA', 'DE→SA', 'KR→SA', 'JP→SA'],
        datasets: [{
          label: 'الشحنات',
          data: [42, 18, 12, 8, 5, 3],
          backgroundColor: 'rgba(14, 165, 233, 0.7)',
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function makeVolumeChart() {
    const ctx = document.getElementById('dashVolumeChart');
    if (!ctx || charts.volume) return;
    charts.volume = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو'],
        datasets: [
          { label: '20GP', data: [2, 3, 4, 2, 5, 3], backgroundColor: '#0ea5e9', borderRadius: 6 },
          { label: '40GP', data: [3, 4, 3, 5, 4, 6], backgroundColor: '#1e3a6e', borderRadius: 6 },
          { label: '40HC', data: [1, 2, 3, 4, 6, 5], backgroundColor: '#d97706', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  function initSectionCharts(section) {
    if (section === 'overview')  makeSpendingChart();
    if (section === 'analytics') { makeCarriersChart(); makeRoutesChart(); makeVolumeChart(); }
  }

  // ════════════════════════════════════════════════════════
  //  NAVIGATION
  // ════════════════════════════════════════════════════════
  const SECTION_TITLES = {
    overview:  'نظرة عامة',
    shipments: 'شحناتي',
    quotes:    'عروض الأسعار',
    documents: 'الوثائق',
    invoices:  'الفواتير',
    analytics: 'الإحصائيات',
    settings:  'الإعدادات'
  };

  function navigateTo(section) {
    document.querySelectorAll('.dash-nav-item').forEach(n =>
      n.classList.toggle('active', n.dataset.section === section)
    );
    document.querySelectorAll('.dash-section').forEach(s =>
      s.classList.toggle('active', s.id === 'section-' + section)
    );
    const title = SECTION_TITLES[section] || 'لوحة التحكم';
    const titleEl = $('#dashPageTitle');
    if (titleEl) titleEl.textContent = title;
    initSectionCharts(section);
    // Update URL hash
    if (history.replaceState) history.replaceState(null, '', '#' + section);
    // Close mobile menu
    $('#dashSidebar')?.classList.remove('open');
    $('#dashBackdrop')?.classList.remove('show');
  }

  // ════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════
  function init() {
    chartFontDefaults();

    // Render data
    const recent = SHIPMENTS.slice(0, 4);
    $('#dashRecentShipments').innerHTML = recent.map(s => renderShipmentRow(s, true)).join('');
    $('#dashAllShipments').innerHTML    = SHIPMENTS.map(s => renderShipmentRow(s, false)).join('');
    $('#dashActivity').innerHTML        = renderActivity(ACTIVITY);
    $('#dashDocs').innerHTML            = renderDocs(DOCS);
    $('#dashQuotes').innerHTML          = renderQuotes(QUOTES);
    $('#dashInvoices').innerHTML        = renderInvoices(INVOICES);

    // Init first section's chart
    makeSpendingChart();

    // Navigation clicks
    document.querySelectorAll('.dash-nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.section));
    });
    document.querySelectorAll('[data-goto]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => navigateTo(el.dataset.goto));
    });

    // Filter clicks (visual toggle only for now)
    document.querySelectorAll('.dash-filters .dash-filter').forEach(f => {
      f.addEventListener('click', (e) => {
        const parent = f.closest('.dash-filters');
        parent.querySelectorAll('.dash-filter').forEach(x => x.classList.remove('active'));
        f.classList.add('active');
      });
    });

    // Mobile menu toggle
    $('#dashMenuBtn')?.addEventListener('click', () => {
      $('#dashSidebar')?.classList.toggle('open');
      $('#dashBackdrop')?.classList.toggle('show');
    });
    $('#dashBackdrop')?.addEventListener('click', () => {
      $('#dashSidebar')?.classList.remove('open');
      $('#dashBackdrop')?.classList.remove('show');
    });

    // Load Supabase user info if available
    try {
      const session = JSON.parse(localStorage.getItem('sb-' + (window.SUPABASE_KEY || '') + '-auth-token') || 'null');
      if (session?.user?.email) {
        const email = session.user.email;
        const name = session.user.user_metadata?.full_name || email.split('@')[0];
        $('#dashUserName').textContent = name;
        $('#dashUserAvatar').textContent = name.charAt(0).toUpperCase();
      }
    } catch {}

    // Honor URL hash
    const hash = location.hash.replace('#', '');
    if (hash && SECTION_TITLES[hash]) navigateTo(hash);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
