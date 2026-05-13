/**
 * FREIGHTLX Dashboard — UI Layer (uses FLX system store)
 * Every action is wired to the real DataStore. Live updates via Bus.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function waitForFLX(cb) {
    if (window.FLX) return cb();
    let tries = 0;
    const t = setInterval(() => {
      if (window.FLX || ++tries > 50) { clearInterval(t); cb(); }
    }, 50);
  }

  // Icons
  const ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a4 4 0 0 0 4-2 4 4 0 0 1 4-1 4 4 0 0 1 4 1 4 4 0 0 0 4 2"/><path d="M4 18l-2-7h20l-2 7"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
    file:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    pdf:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    img:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  };

  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const fmtPrice = (n) => '$' + Number(n).toLocaleString('en-US');
  const toast = (m, t) => window.flxToast ? window.flxToast(m, t || 'info') : console.log(m);

  // ════════════════════════════════════════════════════════
  //  RENDERERS — pull from FLX store
  // ════════════════════════════════════════════════════════
  function renderShipmentRow(s, compact) {
    const badge = `<span class="dash-badge dash-badge-${s.status}">${s.statusText}</span>`;
    const route = `<div class="dash-route"><span>${s.from}</span><span class="arrow">←</span><span>${s.to}</span></div>`;
    if (compact) {
      return `<tr data-shipment-id="${s.id}">
        <td class="dash-shipment-code">${s.id}</td>
        <td>${route}</td>
        <td>${badge}</td>
        <td><strong>${fmtPrice(s.price)}</strong></td></tr>`;
    }
    return `<tr data-shipment-id="${s.id}" data-status="${s.status}">
      <td style="padding-right:20px" class="dash-shipment-code">${s.id}</td>
      <td>${route}</td>
      <td>${s.carrier}</td>
      <td><code style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:11px">${s.container}</code></td>
      <td style="color:#64748b">${s.date}</td>
      <td>${badge}</td>
      <td style="text-align:left;padding-left:20px"><strong>${fmtPrice(s.price)}</strong></td></tr>`;
  }

  function renderQuotesRows(quotes) {
    if (!quotes.length) {
      return '<tr><td colspan="6" style="text-align:center;padding:32px;color:#94a3b8">لا توجد عروض بهذا الفلتر</td></tr>';
    }
    return quotes.map(q => {
      const isValid = q.status === 'valid';
      const badge = isValid
        ? '<span class="dash-badge dash-badge-active">سارية</span>'
        : '<span class="dash-badge dash-badge-cancelled">منتهية</span>';
      return `<tr data-quote-id="${q.id}" data-quote-status="${q.status}">
        <td class="dash-shipment-code">${q.id}</td>
        <td><div class="dash-route"><span>${q.from}</span><span class="arrow">←</span><span>${q.to}</span></div></td>
        <td>${q.carrier}</td>
        <td><strong>${fmtPrice(q.price)}</strong></td>
        <td>${q.validUntil} ${badge}</td>
        <td style="text-align:left">
          ${isValid
            ? `<button class="dash-btn dash-btn-primary" data-action="book-quote" data-id="${q.id}" style="padding:6px 12px;font-size:11px">احجز الآن</button>`
            : `<button class="dash-btn dash-btn-ghost" data-action="renew-quote" data-id="${q.id}" style="padding:6px 12px;font-size:11px">طلب تجديد</button>`}
        </td></tr>`;
    }).join('');
  }

  function renderDocsGrid(docs) {
    if (!docs.length) {
      return '<div class="dash-empty-state" style="grid-column:1/-1;padding:32px;text-align:center;color:#94a3b8">لا توجد وثائق</div>';
    }
    return docs.map(d => `
      <div class="dash-doc" data-doc-id="${d.id}" data-doc-cat="${d.cat}" data-action="download-doc">
        <div class="dash-doc-icon">${d.type === 'jpg' || d.type === 'png' ? ICONS.img : ICONS.pdf}</div>
        <div class="dash-doc-name">${d.name}</div>
        <div class="dash-doc-meta">${(d.type || 'pdf').toUpperCase()} · ${d.size} · ${d.date}</div>
      </div>
    `).join('');
  }

  function renderInvoicesRows(invs) {
    return invs.map(i => {
      const badge = i.status === 'paid'
        ? '<span class="dash-badge dash-badge-active">مدفوعة</span>'
        : '<span class="dash-badge dash-badge-pending">قيد التسديد</span>';
      return `<tr data-invoice-id="${i.id}">
        <td class="dash-shipment-code">${i.id}</td>
        <td style="color:#475569">${i.desc}</td>
        <td style="color:#64748b">${i.date}</td>
        <td><strong>${fmtPrice(i.amount)}</strong></td>
        <td>${badge}</td>
        <td style="text-align:left">
          <button class="dash-btn dash-btn-ghost" data-action="download-invoice" data-id="${i.id}" style="padding:6px 12px;font-size:11px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            تحميل PDF
          </button>
        </td></tr>`;
    }).join('');
  }

  // ════════════════════════════════════════════════════════
  //  REFRESH FUNCTIONS — re-render from store
  // ════════════════════════════════════════════════════════
  let currentFilters = { shipments: 'all', quotes: 'all', docs: 'all' };

  function refreshShipments() {
    const all = FLX.getShipments();
    const filter = currentFilters.shipments;
    const filtered = filter === 'all' ? all : all.filter(s => s.status === filter);
    const tbody = $('#dashAllShipments');
    if (tbody) {
      tbody.innerHTML = filtered.length
        ? filtered.map(s => renderShipmentRow(s, false)).join('')
        : '<tr><td colspan="7" style="text-align:center;padding:32px;color:#94a3b8">لا توجد شحنات بهذا الفلتر</td></tr>';
    }
    const recent = $('#dashRecentShipments');
    if (recent) recent.innerHTML = all.slice(0, 4).map(s => renderShipmentRow(s, true)).join('');

    // Update sidebar badge
    const navBadge = document.querySelector('[data-section="shipments"] .dash-nav-badge');
    if (navBadge) {
      const active = all.filter(s => ['active','transit','pending'].includes(s.status)).length;
      navBadge.textContent = active;
      navBadge.style.display = active > 0 ? '' : 'none';
    }
  }

  function refreshQuotes() {
    const all = FLX.getQuotes();
    const filter = currentFilters.quotes;
    const filtered = filter === 'valid' ? all.filter(q => q.status === 'valid')
                   : filter === 'expired' ? all.filter(q => q.status === 'expired')
                   : all;
    const tbody = $('#dashQuotes');
    if (tbody) tbody.innerHTML = renderQuotesRows(filtered);
  }

  function refreshDocs() {
    const all = FLX.getDocs();
    const filter = currentFilters.docs;
    const filtered = filter === 'all' ? all : all.filter(d => d.cat === filter);
    const grid = $('#dashDocs');
    if (grid) grid.innerHTML = renderDocsGrid(filtered);
  }

  function refreshInvoices() {
    const tbody = $('#dashInvoices');
    if (tbody) tbody.innerHTML = renderInvoicesRows(FLX.getInvoices());
  }

  function refreshStats() {
    const stats = FLX.getStats();
    // Update stat card values - find by label text
    $$('.dash-stat-card').forEach(card => {
      const label = card.querySelector('.dash-stat-label')?.textContent || '';
      const valueEl = card.querySelector('.dash-stat-value');
      if (!valueEl) return;
      if (label.includes('شحنات نشطة')) valueEl.textContent = stats.activeShipments;
      else if (label.includes('إجمالي المصاريف')) valueEl.textContent = '$' + (stats.totalSpent / 1000).toFixed(1) + 'K';
      else if (label.includes('شهادات سابر'))   valueEl.textContent = stats.sabaerCerts;
      else if (label.includes('وثائق محفوظة'))  valueEl.textContent = stats.documents;
    });

    // Update Invoices section sub-stats
    const paid    = FLX.getInvoices().filter(i => i.status === 'paid')   .reduce((a, b) => a + b.amount, 0);
    const pending = FLX.getInvoices().filter(i => i.status === 'pending').reduce((a, b) => a + b.amount, 0);
    const count = FLX.getInvoices().length;
    const avg = count > 0 ? Math.round((paid + pending) / count) : 0;
    $$('#section-invoices .dash-stat-value').forEach((el, idx) => {
      if (idx === 0) el.textContent = '$' + paid.toLocaleString();
      if (idx === 1) el.textContent = '$' + pending.toLocaleString();
      if (idx === 2) el.textContent = '$' + avg.toLocaleString();
    });

    // Update quote filter counts
    const validCount = FLX.getQuotes().filter(q => q.status === 'valid').length;
    const expiredCount = FLX.getQuotes().filter(q => q.status === 'expired').length;
    const totalCount = FLX.getQuotes().length;
    $$('#section-quotes .dash-filter').forEach(btn => {
      const t = btn.textContent;
      if (t.includes('الكل'))       btn.firstChild.textContent = `الكل (${totalCount})`;
      else if (t.includes('سارية'))   btn.firstChild.textContent = `سارية (${validCount})`;
      else if (t.includes('منتهية'))  btn.firstChild.textContent = `منتهية الصلاحية (${expiredCount})`;
    });
  }

  // ════════════════════════════════════════════════════════
  //  CHARTS (lazy)
  // ════════════════════════════════════════════════════════
  const charts = {};
  let fontSet = false;
  function setFonts() {
    if (!window.Chart || fontSet) return;
    Chart.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#475569';
    fontSet = true;
  }

  function makeSpendingChart() {
    const ctx = document.getElementById('dashSpendingChart');
    if (!ctx || charts.spending) return;
    setFonts();
    charts.spending = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو'],
        datasets: [{
          label: 'المصروف (USD)', data: [3200, 4800, 5650, 7340, 12420, 13750],
          borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.08)',
          fill: true, tension: 0.36, borderWidth: 2.5,
          pointBackgroundColor: '#0284c7', pointBorderColor: '#fff',
          pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => '$' + (v/1000).toFixed(1) + 'K' }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
      }
    });
  }
  function makeCarriersChart() {
    const ctx = document.getElementById('dashCarriersChart');
    if (!ctx || charts.carriers) return;
    setFonts();
    charts.carriers = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['COSCO','MSC','Maersk','CMA CGM','Hapag-Lloyd','أخرى'],
        datasets: [{ data: [28,22,18,14,11,7], backgroundColor: ['#0ea5e9','#1e3a6e','#d97706','#7e22ce','#16a34a','#94a3b8'], borderColor: '#fff', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 12 } } }, cutout: '60%' }
    });
  }
  function makeRoutesChart() {
    const ctx = document.getElementById('dashRoutesChart');
    if (!ctx || charts.routes) return;
    setFonts();
    charts.routes = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['CN→SA','TR→SA','IN→SA','DE→SA','KR→SA','JP→SA'], datasets: [{ data: [42,18,12,8,5,3], backgroundColor: 'rgba(14, 165, 233, 0.7)', borderRadius: 8, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
    });
  }
  function makeVolumeChart() {
    const ctx = document.getElementById('dashVolumeChart');
    if (!ctx || charts.volume) return;
    setFonts();
    charts.volume = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['ديسمبر','يناير','فبراير','مارس','أبريل','مايو'],
        datasets: [
          { label: '20GP', data: [2,3,4,2,5,3], backgroundColor: '#0ea5e9', borderRadius: 6 },
          { label: '40GP', data: [3,4,3,5,4,6], backgroundColor: '#1e3a6e', borderRadius: 6 },
          { label: '40HC', data: [1,2,3,4,6,5], backgroundColor: '#d97706', borderRadius: 6 }
        ] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: '#f1f5f9' } } } }
    });
  }
  function initSectionCharts(sec) {
    if (sec === 'overview')  makeSpendingChart();
    if (sec === 'analytics') { makeCarriersChart(); makeRoutesChart(); makeVolumeChart(); }
  }

  // ════════════════════════════════════════════════════════
  //  NAVIGATION
  // ════════════════════════════════════════════════════════
  const TITLES = { overview:'نظرة عامة', shipments:'شحناتي', quotes:'عروض الأسعار', documents:'الوثائق', invoices:'الفواتير', analytics:'الإحصائيات', settings:'الإعدادات' };
  function navigateTo(section) {
    if (!TITLES[section]) section = 'overview';
    $$('.dash-nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === section));
    $$('.dash-section').forEach(s => s.classList.toggle('active', s.id === 'section-' + section));
    const t = $('#dashPageTitle'); if (t) t.textContent = TITLES[section];
    initSectionCharts(section);
    if (history.replaceState) history.replaceState(null, '', '#' + section);
    $('#dashSidebar')?.classList.remove('open');
    $('#dashBackdrop')?.classList.remove('show');
    document.scrollingElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ════════════════════════════════════════════════════════
  //  ACTIONS — wired to FLX store (real)
  // ════════════════════════════════════════════════════════
  async function handleAction(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    e.preventDefault();

    target.disabled = true;
    const originalText = target.textContent;

    try {
      switch (action) {
        case 'book-quote': {
          target.textContent = 'جاري الحجز...';
          await new Promise(r => setTimeout(r, 700));
          const result = FLX.bookQuote(id);
          if (result) {
            toast(`✅ تم الحجز! شحنة جديدة: ${result.shipment.id}`, 'success');
            setTimeout(() => navigateTo('shipments'), 1200);
          } else {
            toast('فشل الحجز - العرض غير موجود', 'error');
          }
          break;
        }
        case 'renew-quote': {
          target.textContent = 'جاري التجديد...';
          await new Promise(r => setTimeout(r, 600));
          const q = FLX.renewQuote(id);
          if (q) toast(`✅ تم تجديد العرض ${id} حتى ${q.validUntil}`, 'success');
          break;
        }
        case 'download-invoice': {
          target.textContent = 'جاري التحميل...';
          await FLX.downloadInvoice(id);
          toast(`📄 تم تحميل ${id}.pdf`, 'success');
          break;
        }
        case 'download-doc': {
          const docId = target.dataset.docId || target.dataset.id || target.closest('[data-doc-id]')?.dataset.docId;
          target.style.opacity = '0.6';
          await FLX.downloadDocument(docId);
          toast(`📄 تم تحميل الوثيقة`, 'success');
          break;
        }
        case 'new-shipment':
          toast('🚀 جاري فتح صفحة طلب شحنة جديدة...', 'info');
          setTimeout(() => window.location.href = '/', 800);
          break;
        case 'save-settings': {
          const data = {};
          $$('#section-settings input, #section-settings select').forEach(inp => {
            const label = inp.previousElementSibling?.textContent || inp.placeholder;
            data[label] = inp.value;
          });
          FLX.saveSettings(data);
          toast('✅ تم حفظ الإعدادات', 'success');
          break;
        }
      }
    } catch (err) {
      console.error(err);
      toast('حدث خطأ - حاول مرة أخرى', 'error');
    } finally {
      setTimeout(() => {
        target.disabled = false;
        target.style.opacity = '';
        if (target.textContent !== originalText && !target.dataset.persistText) {
          target.textContent = originalText;
        }
      }, 800);
    }
  }

  // ════════════════════════════════════════════════════════
  //  SEARCH (live)
  // ════════════════════════════════════════════════════════
  function setupSearch() {
    const input = $('.dash-topbar-search input');
    if (!input) return;
    let timer = null;
    input.addEventListener('input', (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim().toLowerCase();
      timer = setTimeout(() => {
        if (!q) {
          currentFilters.shipments = 'all';
          refreshShipments();
          return;
        }
        const all = FLX.getShipments();
        const matched = all.filter(s =>
          s.id.toLowerCase().includes(q) || s.from.toLowerCase().includes(q) ||
          s.to.toLowerCase().includes(q) || s.carrier.toLowerCase().includes(q)
        );
        const tbody = $('#dashAllShipments');
        if (tbody) {
          tbody.innerHTML = matched.length
            ? matched.map(s => renderShipmentRow(s, false)).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8">لا نتائج لـ "${q}"</td></tr>`;
        }
        if (matched.length > 0 && q.length >= 2 && !document.querySelector('#section-shipments.active')) {
          navigateTo('shipments');
        }
      }, 250);
    });
  }

  // ════════════════════════════════════════════════════════
  //  UPLOAD ZONE — real files into IndexedDB
  // ════════════════════════════════════════════════════════
  function setupUploadZone() {
    const zone = $('#dashUploadZone');
    if (!zone) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.hidden = true;
    document.body.appendChild(input);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => handleFiles(e.target.files));

    async function handleFiles(files) {
      if (!files || !files.length) return;
      toast(`جاري رفع ${files.length} ملف...`, 'info');
      for (const f of files) {
        try { await FLX.addDocument(f); } catch (err) { console.error(err); }
      }
      toast(`✅ تم رفع ${files.length} ملف وحُفظ بنجاح`, 'success');
    }
  }

  // ════════════════════════════════════════════════════════
  //  SETTINGS PERSISTENCE
  // ════════════════════════════════════════════════════════
  function setupSettings() {
    // Save button - find by text
    const saveBtn = Array.from(document.querySelectorAll('#section-settings button'))
      .find(b => b.textContent.includes('حفظ التغييرات'));
    if (saveBtn) {
      saveBtn.dataset.action = 'save-settings';
    }
    // Restore values
    const saved = FLX.getSettings();
    if (saved && Object.keys(saved).length) {
      $$('#section-settings input, #section-settings select').forEach(inp => {
        const label = inp.previousElementSibling?.textContent || inp.placeholder;
        if (saved[label] !== undefined) inp.value = saved[label];
      });
    }
    // Toggles
    $$('.dash-toggle-switch').forEach((sw, idx) => {
      const key = 'flx-toggle-' + idx;
      const v = localStorage.getItem(key);
      if (v === '1') sw.classList.add('on');
      else if (v === '0') sw.classList.remove('on');
      sw.addEventListener('click', () => {
        sw.classList.toggle('on');
        localStorage.setItem(key, sw.classList.contains('on') ? '1' : '0');
        toast(sw.classList.contains('on') ? '✅ تم التفعيل' : 'تم الإلغاء', 'info', 1500);
      });
    });
  }

  // ════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════
  function init() {
    // Activity timeline (static for now — could be from notifications)
    const notifs = FLX.getNotifications().slice(0, 5);
    const activityHtml = notifs.map(n => `
      <div class="dash-timeline-item">
        <div class="dash-timeline-dot ${n.type}">${ICONS[n.type === 'success' ? 'check' : n.type === 'warning' ? 'alert' : 'truck']}</div>
        <div>
          <div class="dash-timeline-text">${n.text}</div>
          <div class="dash-timeline-time">${formatRelativeTime(n.time)}</div>
        </div>
      </div>`).join('');
    const actEl = $('#dashActivity');
    if (actEl) actEl.innerHTML = activityHtml || '<div style="color:#94a3b8;text-align:center;padding:24px;font-size:13px">لا توجد نشاطات بعد</div>';

    // Initial renders
    refreshShipments();
    refreshQuotes();
    refreshDocs();
    refreshInvoices();
    refreshStats();
    makeSpendingChart();

    // Live updates
    FLX.on('shipments.changed', () => { refreshShipments(); refreshStats(); });
    FLX.on('quotes.changed',    () => { refreshQuotes(); });
    FLX.on('docs.changed',      () => { refreshDocs(); refreshStats(); });
    FLX.on('invoices.changed',  () => { refreshInvoices(); refreshStats(); });
    FLX.on('stats.changed',     refreshStats);
    FLX.on('notifications.changed', () => {
      // Update activity timeline too
      const notifs = FLX.getNotifications().slice(0, 5);
      const html = notifs.map(n => `
        <div class="dash-timeline-item">
          <div class="dash-timeline-dot ${n.type}">${ICONS[n.type === 'success' ? 'check' : n.type === 'warning' ? 'alert' : 'truck']}</div>
          <div>
            <div class="dash-timeline-text">${n.text}</div>
            <div class="dash-timeline-time">${formatRelativeTime(n.time)}</div>
          </div>
        </div>`).join('');
      if (actEl) actEl.innerHTML = html;
    });

    // Navigation clicks
    $$('.dash-nav-item').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.section)));
    $$('[data-goto]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => navigateTo(el.dataset.goto));
    });

    // Filter clicks (delegated, per-section)
    document.addEventListener('click', (e) => {
      const filter = e.target.closest('.dash-filters .dash-filter');
      if (!filter) return;
      const section = filter.closest('.dash-section')?.id || '';
      const wrap = filter.closest('.dash-filters');
      wrap.querySelectorAll('.dash-filter').forEach(x => x.classList.remove('active'));
      filter.classList.add('active');

      const txt = filter.textContent;
      const v = filter.dataset.filter ||
        (txt.includes('سارية') ? 'valid' :
         txt.includes('منتهية') ? 'expired' :
         txt.includes('سابر') ? 'saber' :
         txt.includes('بوليصات') ? 'bl' :
         txt.includes('فواتير') ? 'invoice' :
         txt.includes('منشأ') ? 'origin' : 'all');

      if (section === 'section-shipments')      { currentFilters.shipments = v; refreshShipments(); }
      else if (section === 'section-quotes')    { currentFilters.quotes    = v; refreshQuotes(); }
      else if (section === 'section-documents') { currentFilters.docs      = v; refreshDocs(); }
    });

    // Actions delegation
    document.addEventListener('click', handleAction);

    // "Open shipment row" - click anywhere on row to see details (later)
    document.addEventListener('click', (e) => {
      const docCard = e.target.closest('.dash-doc');
      if (docCard && !docCard.dataset.actionRunning) {
        docCard.dataset.actionRunning = '1';
        const id = docCard.dataset.docId;
        FLX.downloadDocument(id).then(() => {
          toast('📄 تم تحميل ' + (docCard.querySelector('.dash-doc-name')?.textContent || 'الوثيقة'), 'success');
          setTimeout(() => delete docCard.dataset.actionRunning, 800);
        });
      }
    });

    // Tag "new shipment" / "new quote" buttons
    $$('button').forEach(b => {
      const t = b.textContent.trim();
      if ((t.includes('شحنة جديدة') || t.includes('طلب عرض جديد')) && !b.dataset.action) {
        b.dataset.action = 'new-shipment';
      }
    });

    // Mobile menu
    $('#dashMenuBtn')?.addEventListener('click', () => {
      $('#dashSidebar')?.classList.toggle('open');
      $('#dashBackdrop')?.classList.toggle('show');
    });
    $('#dashBackdrop')?.addEventListener('click', () => {
      $('#dashSidebar')?.classList.remove('open');
      $('#dashBackdrop')?.classList.remove('show');
    });

    setupSearch();
    setupUploadZone();
    setupSettings();

    // Supabase user
    try {
      const allKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.includes('auth-token'));
      for (const k of allKeys) {
        const session = JSON.parse(localStorage.getItem(k) || 'null');
        if (session?.user?.email) {
          const email = session.user.email;
          const name = session.user.user_metadata?.full_name || email.split('@')[0];
          $('#dashUserName').textContent = name;
          $('#dashUserAvatar').textContent = name.charAt(0).toUpperCase();
          break;
        }
      }
    } catch {}

    // URL hash
    const hash = location.hash.replace('#', '');
    if (hash && TITLES[hash]) navigateTo(hash);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('#dashSidebar')?.classList.remove('open');
        $('#dashBackdrop')?.classList.remove('show');
      }
      if (e.key >= '1' && e.key <= '7' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        navigateTo(Object.keys(TITLES)[parseInt(e.key) - 1]);
      }
    });
  }

  function formatRelativeTime(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return 'منذ ' + Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400) return 'منذ ' + Math.floor(diff / 3600) + ' ساعة';
    if (diff < 2592000) return 'منذ ' + Math.floor(diff / 86400) + ' يوم';
    return new Date(ts).toLocaleDateString('ar-SA');
  }

  ready(() => waitForFLX(init));
})();
