/**
 * FREIGHTLX Backend Adapter
 *
 * Detects backend availability and adapts window.FLX to use real API.
 * Falls back to localStorage when backend not configured (offline-first dev).
 *
 * Load AFTER flx-api-client.js and flx-dashboard-system.js.
 */
(function () {
  'use strict';

  const BACKEND_URL = window.FLX_API_BASE;
  let backendReady = false;
  let livestreamClose = null;

  async function detectBackend() {
    if (!BACKEND_URL) return false;
    try {
      const r = await Promise.race([
        fetch(BACKEND_URL + '/health/live', { method: 'GET' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      return r.ok;
    } catch { return false; }
  }

  async function init() {
    if (!window.FLX || !window.flxApi) return;

    backendReady = await detectBackend();
    if (!backendReady) {
      console.info('[FLX] Backend unavailable — using local storage mode');
      return;
    }
    console.info('[FLX] Backend ready — switching to live mode');

    // ── Override FLX methods to use backend ──
    const original = {
      getShipments: window.FLX.getShipments,
      getQuotes: window.FLX.getQuotes,
      getInvoices: window.FLX.getInvoices,
      getDocs: window.FLX.getDocs,
      getNotifications: window.FLX.getNotifications,
      bookQuote: window.FLX.bookQuote,
      addShipment: window.FLX.addShipment,
      updateShipment: window.FLX.updateShipment,
      downloadInvoice: window.FLX.downloadInvoice,
      addNotification: window.FLX.addNotification,
      markAllRead: window.FLX.markAllRead,
    };

    const cache = { shipments: [], quotes: [], invoices: [], docs: [], notifs: [] };

    async function refreshAll() {
      if (!window.flxApi.isAuthenticated()) return;
      try {
        const [s, q, i, d, n] = await Promise.all([
          window.flxApi.shipments.list({ limit: 100 }),
          window.flxApi.quotes.list({ limit: 100 }),
          window.flxApi.invoices.list({ limit: 100 }),
          window.flxApi.documents.list({ limit: 100 }),
          window.flxApi.notifications.list(),
        ]);
        cache.shipments = s.data || [];
        cache.quotes    = q.data || [];
        cache.invoices  = i.data || [];
        cache.docs      = d.data || [];
        cache.notifs    = n.data || [];
        window.FLX.emit('shipments.changed');
        window.FLX.emit('quotes.changed');
        window.FLX.emit('invoices.changed');
        window.FLX.emit('docs.changed');
        window.FLX.emit('notifications.changed');
      } catch (err) {
        console.warn('[FLX] Backend refresh failed', err);
      }
    }

    // Replace getters
    window.FLX.getShipments = () => cache.shipments.slice();
    window.FLX.getQuotes    = () => cache.quotes.slice();
    window.FLX.getInvoices  = () => cache.invoices.slice();
    window.FLX.getDocs      = () => cache.docs.slice();
    window.FLX.getNotifications = () => cache.notifs.slice();
    window.FLX.unreadCount = () => cache.notifs.filter(n => !n.read).length;

    // Override mutations
    window.FLX.bookQuote = async (id) => {
      const result = await window.flxApi.quotes.book(id);
      await refreshAll();
      return result;
    };
    window.FLX.addShipment = async (s) => {
      const r = await window.flxApi.shipments.create({
        origin: s.origin || s.from,
        destination: s.destination || s.to,
        carrier: s.carrier,
        container: s.container,
        price: s.price,
      });
      await refreshAll();
      return r;
    };
    window.FLX.updateShipment = async (id, patch) => {
      const r = await window.flxApi.shipments.update(id, patch);
      await refreshAll();
      return r;
    };
    window.FLX.downloadInvoice = async (id) => {
      try {
        const data = await window.flxApi.invoices.pdfData(id);
        if (window.FLX.generatePDF) {
          await window.FLX.generatePDF({
            title: 'فاتورة ' + data.invoice.id,
            subtitle: 'FREIGHTLX · فاتورة ضريبية',
            content: [
              ['رقم الفاتورة', data.invoice.id],
              ['الوصف', data.invoice.description || ''],
              ['تاريخ', data.invoice.date || ''],
              ['الإجمالي قبل VAT', '$' + (data.formatted.subtotal).toFixed(2)],
              ['VAT (15%)', '$' + (data.formatted.vat_amount).toFixed(2)],
              ['الإجمالي', '$' + (data.invoice.amount).toFixed(2)],
            ],
            filename: data.invoice.id + '.pdf',
          });
        }
      } catch (e) {
        // Fallback to original
        if (original.downloadInvoice) return original.downloadInvoice(id);
        throw e;
      }
    };
    window.FLX.markAllRead = async () => {
      await window.flxApi.notifications.markRead();
      await refreshAll();
    };

    // Initial load
    await refreshAll();

    // Real-time stream
    if (livestreamClose) livestreamClose();
    livestreamClose = window.flxApi.notifications.subscribe((n) => {
      cache.notifs.unshift(n);
      if (cache.notifs.length > 100) cache.notifs.length = 100;
      window.FLX.emit('notifications.changed');
      // Show toast
      if (window.flxToast) window.flxToast(n.text.replace(/<[^>]*>/g, ''), n.type);
    });

    // Refresh every 60s as backup
    setInterval(refreshAll, 60_000);

    // Listen to logout
    window.addEventListener('flx:logout', () => {
      cache.shipments = []; cache.quotes = []; cache.invoices = [];
      cache.docs = []; cache.notifs = [];
      window.FLX.emit('shipments.changed');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }
})();
