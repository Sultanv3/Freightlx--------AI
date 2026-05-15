/**
 * FREIGHTLX Quotes UI
 * Beautiful price display modal - shows real-time quotes from /api/quotes
 */
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('flx-quotes-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-quotes-ui-styles';
    style.textContent = `
      .flx-quotes-overlay {
        position: fixed; inset: 0;
        background: rgba(8, 17, 36, 0.75);
        backdrop-filter: blur(10px);
        z-index: 9999;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 40px 20px;
        overflow-y: auto;
        animation: flxFadeIn 0.3s ease-out;
      }
      .flx-quotes-overlay.flx-show { display: flex; }
      @keyframes flxFadeIn { from { opacity: 0; } to { opacity: 1; } }

      .flx-quotes-modal {
        background: linear-gradient(135deg, #ffffff, #f8fafc);
        border-radius: 24px;
        max-width: 1000px;
        width: 100%;
        padding: 32px;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        direction: rtl;
        box-shadow: 0 30px 70px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: flxQuoteIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes flxQuoteIn {
        from { opacity: 0; transform: translateY(30px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .flx-quotes-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        padding-bottom: 20px;
        border-bottom: 2px solid #e2e8f0;
      }
      .flx-quotes-title-wrap h2 {
        color: #1e3a6e;
        font-size: 26px;
        font-weight: 800;
        margin: 0 0 6px;
      }
      .flx-quotes-route {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #475569;
        font-size: 15px;
        font-weight: 600;
      }
      .flx-quotes-route-arrow {
        color: #0ea5e9;
        font-size: 18px;
      }
      .flx-quotes-close {
        background: rgba(15, 23, 42, 0.05);
        border: 0;
        width: 40px; height: 40px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 22px;
        color: #64748b;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .flx-quotes-close:hover {
        background: #fee2e2;
        color: #b91c1c;
        transform: rotate(90deg);
      }

      .flx-quotes-info {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 24px;
      }
      .flx-quotes-info-item {
        background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
        padding: 12px 14px;
        border-radius: 12px;
        text-align: center;
      }
      .flx-quotes-info-item .flx-label {
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .flx-quotes-info-item .flx-value {
        font-size: 15px;
        color: #1e3a6e;
        font-weight: 700;
      }

      .flx-quotes-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .flx-quote-card {
        background: #fff;
        border: 1.5px solid #e2e8f0;
        border-radius: 16px;
        padding: 20px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 20px;
        align-items: center;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      .flx-quote-card::before {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        right: 0;
        width: 4px;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        opacity: 0.7;
      }
      .flx-quote-card:hover {
        transform: translateY(-3px);
        border-color: #0ea5e9;
        box-shadow: 0 12px 30px rgba(14, 165, 233, 0.12);
      }
      .flx-quote-card.flx-best::before {
        background: linear-gradient(180deg, #15803d, #16a34a);
        width: 6px;
      }
      .flx-quote-card.flx-best {
        border-color: #16a34a;
        background: linear-gradient(135deg, #f0fdf4, #ffffff);
      }
      .flx-quote-badge-best {
        position: absolute;
        top: -10px;
        right: 16px;
        background: linear-gradient(135deg, #15803d, #16a34a);
        color: #fff;
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        box-shadow: 0 4px 10px rgba(22, 163, 74, 0.3);
      }

      .flx-quote-carrier {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 100px;
      }
      .flx-quote-carrier-logo {
        width: 56px; height: 56px;
        background: linear-gradient(135deg, #1e3a6e, #2d5599);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
      }
      .flx-quote-carrier-name {
        font-size: 14px;
        font-weight: 700;
        color: #1e3a6e;
      }

      .flx-quote-details {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .flx-quote-vessel {
        font-size: 16px;
        font-weight: 700;
        color: #1e3a6e;
      }
      .flx-quote-route-flow {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: #475569;
      }
      .flx-quote-flow-step {
        background: #f1f5f9;
        padding: 4px 10px;
        border-radius: 8px;
        font-weight: 600;
      }
      .flx-quote-flow-arrow {
        color: #94a3b8;
        font-size: 14px;
      }
      .flx-quote-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #64748b;
        flex-wrap: wrap;
      }
      .flx-quote-meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .flx-quote-meta-item strong {
        color: #1e3a6e;
        font-weight: 700;
      }

      .flx-quote-price-wrap {
        text-align: center;
        min-width: 180px;
        padding-left: 16px;
        border-right: 2px solid #e2e8f0;
      }
      .flx-quote-price {
        font-size: 32px;
        font-weight: 800;
        color: #1e3a6e;
        line-height: 1;
        margin-bottom: 4px;
        font-family: 'Cairo', sans-serif;
      }
      .flx-quote-currency {
        font-size: 13px;
        color: #64748b;
        font-weight: 600;
        margin-bottom: 12px;
      }
      .flx-quote-book-btn {
        background: linear-gradient(135deg, #1e3a6e, #2d5599);
        color: #fff;
        border: 0;
        padding: 10px 24px;
        border-radius: 999px;
        font-family: 'Cairo', sans-serif;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 4px 10px rgba(30, 58, 110, 0.2);
      }
      .flx-quote-book-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(30, 58, 110, 0.35);
      }

      .flx-quotes-footer {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
      }
      .flx-quotes-mock-notice {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        color: #92400e;
        padding: 10px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 16px;
        text-align: center;
      }

      @media (max-width: 768px) {
        .flx-quotes-modal { padding: 20px; }
        .flx-quotes-info { grid-template-columns: repeat(2, 1fr); }
        .flx-quote-card {
          grid-template-columns: 1fr;
          gap: 14px;
          text-align: center;
        }
        .flx-quote-carrier { flex-direction: row; min-width: auto; justify-content: center; }
        .flx-quote-price-wrap { border-right: 0; border-top: 1px solid #e2e8f0; padding-top: 14px; padding-left: 0; }
        .flx-quote-meta { justify-content: center; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    if (document.getElementById('flx-quotes-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'flx-quotes-overlay';
    overlay.className = 'flx-quotes-overlay';
    overlay.innerHTML = `
      <div class="flx-quotes-modal">
        <div class="flx-quotes-header">
          <div class="flx-quotes-title-wrap">
            <h2>🚢 عروض الأسعار</h2>
            <div class="flx-quotes-route" id="flx-quotes-route">
              <span>الميناء الأصلي</span>
              <span class="flx-quotes-route-arrow">←</span>
              <span>الميناء الوجهة</span>
            </div>
          </div>
          <button class="flx-quotes-close" id="flx-quotes-close" aria-label="إغلاق">×</button>
        </div>
        <div class="flx-quotes-info" id="flx-quotes-info"></div>
        <div id="flx-quotes-mock-notice" style="display:none"></div>
        <div class="flx-quotes-list" id="flx-quotes-list"></div>
        <div class="flx-quotes-footer">
          الأسعار شاملة الشحن البحري فقط · لا تشمل الجمارك أو الخدمات المحلية · صالحة 7 أيام
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#flx-quotes-close').addEventListener('click', () => {
      overlay.classList.remove('flx-show');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'flx-quotes-overlay') overlay.classList.remove('flx-show');
    });
  }

  function renderOffers(data, requestInfo) {
    const overlay = document.getElementById('flx-quotes-overlay');
    if (!overlay) return;

    // Update route header
    const routeEl = overlay.querySelector('#flx-quotes-route');
    if (routeEl && requestInfo) {
      routeEl.innerHTML = `
        <span>${requestInfo.originPort || 'الأصل'}</span>
        <span class="flx-quotes-route-arrow">←</span>
        <span>${requestInfo.destinationPort || 'الوجهة'}</span>
      `;
    }

    // Info row
    const infoEl = overlay.querySelector('#flx-quotes-info');
    if (infoEl && requestInfo) {
      infoEl.innerHTML = `
        <div class="flx-quotes-info-item">
          <div class="flx-label">نوع الحاوية</div>
          <div class="flx-value">${requestInfo.containerType || '40HC'}</div>
        </div>
        <div class="flx-quotes-info-item">
          <div class="flx-label">عدد العروض</div>
          <div class="flx-value">${data.offers?.length || 0}</div>
        </div>
        <div class="flx-quotes-info-item">
          <div class="flx-label">أقل سعر</div>
          <div class="flx-value">$${Math.min(...(data.offers || []).map(o => o.price)).toLocaleString()}</div>
        </div>
        <div class="flx-quotes-info-item">
          <div class="flx-label">أسرع وصول</div>
          <div class="flx-value">${Math.min(...(data.offers || []).map(o => o.transitTime))} يوم</div>
        </div>
      `;
    }

    // Mock notice
    const noticeEl = overlay.querySelector('#flx-quotes-mock-notice');
    if (noticeEl) {
      if (data.mock) {
        noticeEl.style.display = 'block';
        noticeEl.className = 'flx-quotes-mock-notice';
        noticeEl.innerHTML = '⚠️ هذه أسعار تقديرية — جاري الاتصال بـ 12 خط ملاحي للحصول على الأسعار الحقيقية';
      } else {
        noticeEl.style.display = 'none';
      }
    }

    // Offers list
    const listEl = overlay.querySelector('#flx-quotes-list');
    if (listEl) {
      const offers = data.offers || [];
      listEl.innerHTML = offers.map((o, i) => `
        <div class="flx-quote-card ${i === 0 ? 'flx-best' : ''}">
          ${i === 0 ? '<div class="flx-quote-badge-best">⭐ الأفضل</div>' : ''}
          <div class="flx-quote-carrier">
            <div class="flx-quote-carrier-logo">${o.carrierLogo || '🚢'}</div>
            <div class="flx-quote-carrier-name">${escapeHTML(o.carrier)}</div>
          </div>
          <div class="flx-quote-details">
            <div class="flx-quote-vessel">${escapeHTML(o.vessel || o.carrier)}</div>
            <div class="flx-quote-route-flow">
              <span class="flx-quote-flow-step">${o.etd || 'مغادرة'}</span>
              <span class="flx-quote-flow-arrow">→</span>
              <span class="flx-quote-flow-step">${escapeHTML(o.services || 'مباشر')}</span>
              <span class="flx-quote-flow-arrow">→</span>
              <span class="flx-quote-flow-step">${o.eta || 'وصول'}</span>
            </div>
            <div class="flx-quote-meta">
              <div class="flx-quote-meta-item">⏱ <strong>${o.transitTime}</strong> يوم</div>
              <div class="flx-quote-meta-item">📦 <strong>${escapeHTML(o.containerType)}</strong></div>
              <div class="flx-quote-meta-item">🆓 <strong>${o.freeDays}</strong> أيام مجانية</div>
              <div class="flx-quote-meta-item">📅 صالح حتى <strong>${o.validity}</strong></div>
            </div>
          </div>
          <div class="flx-quote-price-wrap">
            <div class="flx-quote-price">$${o.price.toLocaleString()}</div>
            <div class="flx-quote-currency">${o.currency}</div>
            <button class="flx-quote-book-btn">احجز الآن</button>
          </div>
        </div>
      `).join('');
    }
  }

  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  /**
   * Public API - fetch and show quotes
   */
  window.flxShowQuotes = async function (requestInfo) {
    injectStyles();
    buildOverlay();
    const overlay = document.getElementById('flx-quotes-overlay');

    // Show loading first
    if (window.flxShowQuoteLoading) {
      await window.flxShowQuoteLoading(2500);
    }

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestInfo || {})
      });
      const data = await res.json();
      renderOffers(data, requestInfo);
      overlay.classList.add('flx-show');
    } catch (err) {
      console.error('[FREIGHTLX Quotes] Error:', err);
      alert('حصل خطأ في تحميل الأسعار. حاول مرة ثانية.');
    }
  };

  /**
   * Workflow context tracker - captures user's selections during the flow
   */
  const workflowState = {
    originPort: null,
    destinationPort: null,
    containerType: null,
    commodityCode: null,
    productName: null
  };

  function scanCurrentSelections() {
    // Search the visible DOM for selected ports & containers
    // Common patterns: selected dropdown values, highlighted chips, value attributes

    // Look for "ميناء" labels and adjacent values
    const portRegex = /([A-Z]{5})\b/g;
    const text = document.body.innerText || '';
    const ports = (text.match(portRegex) || []).filter(p => p !== 'FREIG'); // Filter out FREIG-something

    // Try to read selected dropdowns / inputs
    document.querySelectorAll('input[type="text"], input[type="search"], select, textarea').forEach(inp => {
      const val = (inp.value || '').toUpperCase();
      const placeholder = (inp.placeholder || '').toLowerCase();
      const label = inp.closest('label')?.textContent || '';
      if (val.match(/^[A-Z]{5}$/)) {
        if (placeholder.includes('تحميل') || placeholder.includes('مصدر') || label.includes('تحميل') || label.includes('مصدر')) {
          workflowState.originPort = val;
        } else if (placeholder.includes('وصول') || placeholder.includes('وجهة') || label.includes('وصول') || label.includes('وجهة')) {
          workflowState.destinationPort = val;
        }
      }
    });

    // Look for active container type buttons
    document.querySelectorAll('button.active, button[aria-pressed="true"], button.selected, .flx-active').forEach(btn => {
      const t = btn.textContent?.trim() || '';
      if (t.match(/20\s*قدم|20ft|20GP/i)) workflowState.containerType = '20GP';
      else if (t.match(/40\s*hc|40\s*high cube|HC/i)) workflowState.containerType = '40HC';
      else if (t.match(/40\s*قدم|40ft|40GP/i)) workflowState.containerType = '40GP';
      else if (t.match(/reefer|RF|مبرد/i)) workflowState.containerType = '40RF';
      else if (t.match(/LCL/i)) workflowState.containerType = 'LCL';
    });

    // Try to find product/HS code from page
    const hsMatch = text.match(/HS[\s:]*([0-9]{4,6})/i);
    if (hsMatch) workflowState.commodityCode = hsMatch[1];
  }

  /**
   * Auto-trigger: detect when user picks container type or requests quote
   */
  function setupAutoTrigger() {
    // Track port/container selections
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, [role="button"], [role="option"]');
      if (!target) return;
      const text = target.textContent?.trim() || '';

      // Detect port code in clicked element
      const portCode = text.match(/\b([A-Z]{5})\b/);
      if (portCode) {
        const code = portCode[1];
        // Determine if this is origin or destination by context
        const parent = target.closest('[class*="origin"], [class*="dest"], [data-side]');
        const isOrigin = parent?.className?.includes('origin') || parent?.dataset?.side === 'origin';
        const isDest = parent?.className?.includes('dest') || parent?.dataset?.side === 'destination';
        if (isOrigin || code.startsWith('CN') || code.startsWith('IN') || code.startsWith('TR')) {
          workflowState.originPort = code;
        } else if (isDest || code.startsWith('SA')) {
          workflowState.destinationPort = code;
        } else if (!workflowState.originPort) {
          workflowState.originPort = code;
        } else if (!workflowState.destinationPort) {
          workflowState.destinationPort = code;
        }
      }

      // Container type detection
      const containerMatch = text.match(/حاوية\s+(20|40)\s*قدم|(20|40)\s*ft|40\s*hc/i);
      if (containerMatch) {
        const t = text.toLowerCase();
        if (t.includes('hc') || t.includes('high cube')) workflowState.containerType = '40HC';
        else if (t.includes('reefer') || t.includes('مبرد')) workflowState.containerType = '40RF';
        else if (text.includes('20')) workflowState.containerType = '20GP';
        else workflowState.containerType = '40HC';
      } else if (text.toLowerCase().includes('lcl')) {
        workflowState.containerType = 'LCL';
      }

      // Trigger quotes display
      const quoteMatch = text.includes('احصل على عرض') ||
                         text.includes('عرض سعر') ||
                         text.includes('احسب السعر') ||
                         text.includes('ابحث عن عروض') ||
                         text.includes('بحث الأسعار') ||
                         text === 'بحث' && workflowState.originPort && workflowState.destinationPort;

      const containerSelected = containerMatch && (workflowState.originPort || workflowState.destinationPort);

      if (quoteMatch || containerSelected) {
        scanCurrentSelections();
        // Navigate to the dedicated rate-request page with deep-link params
        const params = new URLSearchParams();
        if (workflowState.originPort) params.set('from', workflowState.originPort);
        if (workflowState.destinationPort) params.set('to', workflowState.destinationPort);
        if (workflowState.containerType) params.set('type', workflowState.containerType);
        // Map "LCL" container hint → mode
        if ((workflowState.containerType || '').toUpperCase() === 'LCL') params.set('mode', 'LCL');
        // Cargo category: try to infer from text
        const lower = (text || '').toLowerCase();
        if (lower.includes('مبرد') || lower.includes('reefer')) params.set('cargo', 'reefer');
        else if (lower.includes('خطر') || lower.includes('dg ') || lower.includes('imo')) params.set('cargo', 'dangerous');
        else if (lower.includes('مجمد') || lower.includes('frozen')) params.set('cargo', 'frozen');
        // Auto-search only if both ports detected
        if (workflowState.originPort && workflowState.destinationPort) params.set('auto', '1');
        setTimeout(() => {
          window.location.href = '/rates.html' + (params.toString() ? '?' + params.toString() : '');
        }, 150);
      }
    }, false);

    // Continuously scan for selections
    setInterval(scanCurrentSelections, 1500);
  }

  function init() {
    injectStyles();
    buildOverlay();
    setupAutoTrigger();
    console.log('[FREIGHTLX Quotes] UI ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
