/**
 * FREIGHTLX Dashboard — REAL System
 * ───────────────────────────────────────────────────────────────
 *  • DataStore: localStorage + IndexedDB persistence
 *  • EventBus: live cross-section updates
 *  • PDFGenerator: real PDF files (jsPDF)
 *  • NotificationCenter: real-time dropdown with badge
 *  • Real file upload/download via IndexedDB Blob storage
 *  • Live status changes, real bookings, real invoices
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════
  //  jsPDF lazy loader
  // ════════════════════════════════════════════════════════
  function loadJsPDF() {
    return new Promise((resolve, reject) => {
      if (window.jspdf) return resolve(window.jspdf);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = () => resolve(window.jspdf);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ════════════════════════════════════════════════════════
  //  EVENT BUS — cross-section communication
  // ════════════════════════════════════════════════════════
  const Bus = {
    handlers: {},
    on(ev, fn) {
      (this.handlers[ev] = this.handlers[ev] || []).push(fn);
    },
    emit(ev, data) {
      (this.handlers[ev] || []).forEach(fn => {
        try { fn(data); } catch (e) { console.error(e); }
      });
    }
  };

  // ════════════════════════════════════════════════════════
  //  INDEXEDDB — for binary file storage
  // ════════════════════════════════════════════════════════
  const DB_NAME = 'flx-dashboard-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbPut(id, blob, meta) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['files'], 'readwrite');
      tx.objectStore('files').put({ id, blob, meta, at: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(id) {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['files'], 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  // ════════════════════════════════════════════════════════
  //  DATA STORE — localStorage persistence
  // ════════════════════════════════════════════════════════
  const KEY = 'flx-dashboard-store-v1';

  function loadStore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(Store)); } catch {}
  }

  // Seed initial data only once
  const seedData = {
    shipments: [
      { id: 'FLX-B-2026-7841', from: 'CNSHA', to: 'SAJED', carrier: 'COSCO',  container: '40HC', date: '2026-04-28', status: 'transit',   statusText: 'في عرض البحر',    price: 3450 },
      { id: 'FLX-B-2026-7639', from: 'CNSZX', to: 'SADMM', carrier: 'MSC',    container: '40GP', date: '2026-04-30', status: 'active',    statusText: 'في التخليص',      price: 2980 },
      { id: 'FLX-B-2026-7421', from: 'TRMER', to: 'SAJED', carrier: 'Arkas',  container: '20GP', date: '2026-05-02', status: 'pending',   statusText: 'قيد الموافقة',    price: 1650 },
      { id: 'FLX-B-2026-7102', from: 'INNSA', to: 'SAJED', carrier: 'Maersk', container: '40HC', date: '2026-04-10', status: 'completed', statusText: 'مكتملة',          price: 2720 },
      { id: 'FLX-B-2026-6890', from: 'DEHAM', to: 'SADMM', carrier: 'Hapag-Lloyd', container: '40GP', date: '2026-03-22', status: 'completed', statusText: 'مكتملة', price: 4120 },
      { id: 'FLX-B-2026-6754', from: 'CNNGB', to: 'SAJED', carrier: 'CMA CGM',container: '40HC', date: '2026-03-15', status: 'completed', statusText: 'مكتملة',          price: 3380 },
      { id: 'FLX-B-2026-6502', from: 'CNSHA', to: 'SAJED', carrier: 'HMM',    container: '20GP', date: '2026-03-01', status: 'completed', statusText: 'مكتملة',          price: 1820 }
    ],
    quotes: [
      { id: 'Q-2026-1284', from: 'CNSHA', to: 'SAJED', carrier: 'COSCO',  price: 3450, validUntil: '2026-05-20', status: 'valid' },
      { id: 'Q-2026-1283', from: 'CNSZX', to: 'SADMM', carrier: 'MSC',    price: 2980, validUntil: '2026-05-19', status: 'valid' },
      { id: 'Q-2026-1281', from: 'TRMER', to: 'SAJED', carrier: 'Arkas',  price: 1650, validUntil: '2026-05-25', status: 'valid' },
      { id: 'Q-2026-1278', from: 'INNSA', to: 'SAJED', carrier: 'Maersk', price: 2720, validUntil: '2026-05-15', status: 'valid' },
      { id: 'Q-2026-1275', from: 'DEHAM', to: 'SADMM', carrier: 'Hapag',  price: 4120, validUntil: '2026-05-30', status: 'valid' },
      { id: 'Q-2026-1242', from: 'CNNGB', to: 'SAJED', carrier: 'CMA',    price: 3380, validUntil: '2026-04-30', status: 'expired' },
      { id: 'Q-2026-1218', from: 'CNSHA', to: 'SAJED', carrier: 'HMM',    price: 1820, validUntil: '2026-04-22', status: 'expired' }
    ],
    docs: [
      { id: 'doc-1', name: 'شهادة سابر SC-9821',        type: 'pdf', size: '186 KB', date: '2026-05-08', cat: 'saber' },
      { id: 'doc-2', name: 'بوليصة شحن BL-7841',         type: 'pdf', size: '420 KB', date: '2026-05-07', cat: 'bl' },
      { id: 'doc-3', name: 'فاتورة تجارية INV-2026-152',type: 'pdf', size: '215 KB', date: '2026-05-05', cat: 'invoice' },
      { id: 'doc-4', name: 'شهادة منشأ CO-3344',         type: 'pdf', size: '156 KB', date: '2026-05-04', cat: 'origin' },
      { id: 'doc-5', name: 'بوليصة شحن BL-7639',         type: 'pdf', size: '380 KB', date: '2026-05-02', cat: 'bl' },
      { id: 'doc-6', name: 'شهادة سابر SC-9712',         type: 'pdf', size: '195 KB', date: '2026-04-28', cat: 'saber' }
    ],
    invoices: [
      { id: 'INV-2026-152', desc: 'شحن CNSHA → SAJED · COSCO 40HC',  date: '2026-05-08', amount: 3450, status: 'paid' },
      { id: 'INV-2026-151', desc: 'شهادة سابر SC-9821',               date: '2026-05-05', amount: 580,  status: 'paid' },
      { id: 'INV-2026-150', desc: 'شحن CNSZX → SADMM · MSC 40GP',     date: '2026-05-02', amount: 2980, status: 'pending' },
      { id: 'INV-2026-149', desc: 'تخليص جمركي + رسوم',                date: '2026-04-30', amount: 720,  status: 'pending' },
      { id: 'INV-2026-148', desc: 'شحن INNSA → SAJED · Maersk 40HC',  date: '2026-04-22', amount: 2720, status: 'paid' }
    ],
    notifications: [
      { id: 'n1', type: 'success', text: 'شحنة FLX-B-2026-7102 وصلت لميناء جدة', time: Date.now() - 2*3600*1000, read: false },
      { id: 'n2', type: 'info',    text: 'شحنة FLX-B-2026-7841 غادرت ميناء شنغهاي', time: Date.now() - 28*3600*1000, read: false },
      { id: 'n3', type: 'warning', text: 'شهادة سابر SC-9821 ستنتهي خلال 3 أيام',  time: Date.now() - 30*3600*1000, read: false }
    ],
    settings: {}
  };

  const Store = loadStore() || JSON.parse(JSON.stringify(seedData));
  saveStore();

  // CRUD helpers
  function genId(prefix) {
    return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function nowISO() { return new Date().toISOString().slice(0, 10); }

  // ════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════
  const FLX = {
    // Shipments
    getShipments: () => Store.shipments.slice(),
    addShipment(s) {
      Store.shipments.unshift(s);
      saveStore();
      Bus.emit('shipments.changed');
      Bus.emit('stats.changed');
    },
    updateShipment(id, patch) {
      const s = Store.shipments.find(x => x.id === id);
      if (s) Object.assign(s, patch);
      saveStore();
      Bus.emit('shipments.changed');
    },

    // Quotes
    getQuotes: () => Store.quotes.slice(),
    bookQuote(quoteId) {
      const q = Store.quotes.find(x => x.id === quoteId);
      if (!q) return null;
      // Create shipment from quote
      const newShipmentId = 'FLX-B-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
      const shipment = {
        id: newShipmentId,
        from: q.from, to: q.to,
        carrier: q.carrier, container: '40HC',
        date: nowISO(),
        status: 'pending', statusText: 'قيد الموافقة',
        price: q.price,
        sourceQuote: q.id
      };
      this.addShipment(shipment);
      // Create invoice
      const invId = 'INV-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
      this.addInvoice({
        id: invId,
        desc: `شحن ${q.from} → ${q.to} · ${q.carrier}`,
        date: nowISO(),
        amount: q.price + 580,
        status: 'pending'
      });
      // Notification
      this.addNotification({
        type: 'success',
        text: `تم إنشاء شحنة <strong>${newShipmentId}</strong> من العرض ${q.id}`,
      });
      this.addNotification({
        type: 'info',
        text: `فاتورة جديدة <strong>${invId}</strong> قيد التسديد ($${(q.price + 580).toLocaleString()})`,
      });
      // Remove quote from list (it's now booked)
      Store.quotes = Store.quotes.filter(x => x.id !== quoteId);
      saveStore();
      Bus.emit('quotes.changed');
      return { shipment, invoice: invId };
    },
    renewQuote(quoteId) {
      const q = Store.quotes.find(x => x.id === quoteId);
      if (!q) return null;
      // Extend validity 14 days
      const future = new Date();
      future.setDate(future.getDate() + 14);
      q.validUntil = future.toISOString().slice(0, 10);
      q.status = 'valid';
      saveStore();
      Bus.emit('quotes.changed');
      this.addNotification({
        type: 'success',
        text: `تم تجديد العرض <strong>${quoteId}</strong> لمدة 14 يوماً`,
      });
      return q;
    },

    // Documents
    getDocs: () => Store.docs.slice(),
    async addDocument(file) {
      const id = genId('doc');
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const cat = ext === 'pdf' ? 'invoice' : 'photo';
      // Store actual file in IndexedDB
      await dbPut(id, file, { name: file.name, type: file.type });
      const sizeText = file.size < 1024*1024
        ? (file.size / 1024).toFixed(0) + ' KB'
        : (file.size / 1048576).toFixed(1) + ' MB';
      const doc = {
        id, name: file.name, type: ext,
        size: sizeText, date: nowISO(), cat, hasBlob: true
      };
      Store.docs.unshift(doc);
      saveStore();
      Bus.emit('docs.changed');
      this.addNotification({
        type: 'info',
        text: `تم رفع وثيقة جديدة: <strong>${file.name}</strong>`,
      });
      return doc;
    },
    async downloadDocument(id) {
      const doc = Store.docs.find(d => d.id === id);
      if (!doc) return false;
      if (doc.hasBlob) {
        // Real file from IndexedDB
        const stored = await dbGet(id);
        if (stored && stored.blob) {
          downloadBlob(stored.blob, doc.name);
          return true;
        }
      }
      // Generated demo PDF
      await generatePDF({
        title: doc.name,
        subtitle: 'وثيقة من نظام FREIGHTLX',
        content: [
          ['نوع الوثيقة', categoryLabel(doc.cat)],
          ['الحجم', doc.size],
          ['تاريخ الإصدار', doc.date],
          ['الحالة', 'سارية']
        ],
        filename: doc.name.replace(/[^\w\s-]/g, '_') + '.pdf'
      });
      return true;
    },

    // Invoices
    getInvoices: () => Store.invoices.slice(),
    addInvoice(inv) {
      Store.invoices.unshift(inv);
      saveStore();
      Bus.emit('invoices.changed');
    },
    async downloadInvoice(id) {
      const inv = Store.invoices.find(i => i.id === id);
      if (!inv) return false;
      await generatePDF({
        title: 'فاتورة ' + inv.id,
        subtitle: 'FREIGHTLX · فاتورة ضريبية',
        content: [
          ['رقم الفاتورة',  inv.id],
          ['الوصف',         inv.desc],
          ['تاريخ الإصدار', inv.date],
          ['المبلغ',        '$' + inv.amount.toLocaleString()],
          ['الحالة',        inv.status === 'paid' ? 'مدفوعة' : 'قيد التسديد'],
          ['', ''],
          ['الإجمالي قبل VAT', '$' + (inv.amount / 1.15).toFixed(2)],
          ['VAT (15%)',        '$' + (inv.amount - inv.amount / 1.15).toFixed(2)],
          ['الإجمالي شامل VAT', '$' + inv.amount.toLocaleString()]
        ],
        filename: inv.id + '.pdf'
      });
      this.addNotification({
        type: 'success',
        text: `تم تحميل الفاتورة <strong>${id}</strong>`,
      });
      return true;
    },

    // Notifications
    getNotifications: () => Store.notifications.slice().sort((a, b) => b.time - a.time),
    addNotification(n) {
      n.id = genId('n');
      n.time = Date.now();
      n.read = false;
      Store.notifications.unshift(n);
      // Keep only latest 50
      if (Store.notifications.length > 50) Store.notifications.length = 50;
      saveStore();
      Bus.emit('notifications.changed');
    },
    markAllRead() {
      Store.notifications.forEach(n => n.read = true);
      saveStore();
      Bus.emit('notifications.changed');
    },
    unreadCount() {
      return Store.notifications.filter(n => !n.read).length;
    },

    // Settings
    getSettings: () => ({ ...Store.settings }),
    saveSettings(s) {
      Store.settings = { ...Store.settings, ...s };
      saveStore();
      Bus.emit('settings.changed');
    },

    // Stats
    getStats() {
      const active = Store.shipments.filter(s =>
        ['active', 'transit', 'pending'].includes(s.status)
      ).length;
      const totalSpent = Store.invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + i.amount, 0);
      return {
        activeShipments: active,
        totalSpent,
        documents: Store.docs.length,
        sabaerCerts: Store.docs.filter(d => d.cat === 'saber').length + 10
      };
    },

    // Reset (for debugging)
    reset() {
      localStorage.removeItem(KEY);
      location.reload();
    },

    // Bus access
    on: Bus.on.bind(Bus),
    emit: Bus.emit.bind(Bus),
  };

  function categoryLabel(cat) {
    const map = {
      saber: 'شهادة سابر',
      bl: 'بوليصة شحن',
      invoice: 'فاتورة تجارية',
      origin: 'شهادة منشأ',
      photo: 'صورة'
    };
    return map[cat] || 'وثيقة';
  }

  // ════════════════════════════════════════════════════════
  //  PDF GENERATION (real downloadable files)
  // ════════════════════════════════════════════════════════
  async function generatePDF({ title, subtitle, content, filename }) {
    await loadJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(15, 31, 63);
    doc.rect(0, 0, w, 35, 'F');

    // FREIGHTLX branding
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('FREIGHTLX', 15, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(200, 220, 240);
    doc.text('Smart Freight & Customs Platform', 15, 25);

    // Date top-right
    doc.setFontSize(9);
    doc.setTextColor(220, 230, 240);
    doc.text(new Date().toLocaleDateString('en-GB'), w - 15, 25, { align: 'right' });

    // Title
    doc.setTextColor(15, 31, 63);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 15, 55);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, 15, 63);
    }

    // Divider
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 70, w - 15, 70);

    // Content rows
    doc.setFontSize(11);
    let y = 82;
    content.forEach(([label, value]) => {
      if (!label && !value) { y += 4; return; }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, 15, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 31, 63);
      doc.text(String(value), w - 15, y, { align: 'right' });
      y += 8;
    });

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 270, w - 15, 270);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated by FREIGHTLX AI · freightlx.com', w / 2, 278, { align: 'center' });
    doc.text('VAT: 30000000000003 · CR: 1010000000', w / 2, 283, { align: 'center' });

    doc.save(filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ════════════════════════════════════════════════════════
  //  NOTIFICATION CENTER (dropdown in topbar)
  // ════════════════════════════════════════════════════════
  function buildNotifCenter() {
    const bellBtn = Array.from(document.querySelectorAll('.dash-icon-btn'))
      .find(b => b.querySelector('.dash-dot'));
    if (!bellBtn) return;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'flxNotifDropdown';
    dropdown.className = 'flx-notif-dropdown';
    dropdown.style.cssText = `
      position: absolute; top: 56px; right: 80px; width: 360px;
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
      box-shadow: 0 16px 40px rgba(15,31,63,0.18);
      z-index: 100; max-height: 480px; overflow-y: auto; display: none;
    `;
    document.body.appendChild(dropdown);

    function render() {
      const notifs = FLX.getNotifications();
      const unread = FLX.unreadCount();
      // Update badge
      const dot = bellBtn.querySelector('.dash-dot');
      if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

      dropdown.innerHTML = `
        <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;font-size:14px;color:#0f1f3f">الإشعارات ${unread > 0 ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 7px;font-size:10px;margin-right:6px">' + unread + '</span>' : ''}</div>
          ${notifs.length > 0 ? '<button id="flxMarkAllRead" style="background:transparent;border:0;color:#0284c7;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">تعليم الكل كمقروء</button>' : ''}
        </div>
        ${notifs.length === 0
          ? '<div style="padding:32px 16px;text-align:center;color:#94a3b8;font-size:13px">لا توجد إشعارات</div>'
          : notifs.map(n => {
              const ago = timeAgo(n.time);
              const icon = n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : 'ℹ️';
              return `
                <div style="padding:12px 16px;border-bottom:1px solid #f8fafc;display:flex;gap:10px;${!n.read ? 'background:#f0f9ff' : ''}">
                  <div style="font-size:18px;flex-shrink:0">${icon}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;line-height:1.5;color:#0f1f3f">${n.text}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:3px">${ago}</div>
                  </div>
                  ${!n.read ? '<div style="width:8px;height:8px;background:#0ea5e9;border-radius:50%;margin-top:8px;flex-shrink:0"></div>' : ''}
                </div>`;
            }).join('')}
      `;

      const markBtn = document.getElementById('flxMarkAllRead');
      if (markBtn) markBtn.onclick = () => FLX.markAllRead();
    }

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const show = dropdown.style.display === 'none';
      dropdown.style.display = show ? 'block' : 'none';
      if (show) render();
    });
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== bellBtn) {
        dropdown.style.display = 'none';
      }
    });

    Bus.on('notifications.changed', render);
    render();
  }

  function timeAgo(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return 'منذ ' + Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400) return 'منذ ' + Math.floor(diff / 3600) + ' ساعة';
    return 'منذ ' + Math.floor(diff / 86400) + ' يوم';
  }

  // ════════════════════════════════════════════════════════
  //  EXPOSE GLOBALLY
  // ════════════════════════════════════════════════════════
  window.FLX = FLX;
  window.FLX.buildNotifCenter = buildNotifCenter;
  window.FLX.generatePDF = generatePDF;

  // Auto-init notif center when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNotifCenter);
  } else {
    buildNotifCenter();
  }
})();
