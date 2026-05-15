/**
 * FREIGHTLX Live Client — Universal SSE subscriber + DOM event emitter (v3.0)
 *
 * Usage:
 *   <script src="/flx-live.js" data-role="user"></script>
 *
 * Listens for:
 *   window.addEventListener('flx:snapshot', e => e.detail)
 *   window.addEventListener('flx:update',   e => e.detail)
 *   window.addEventListener('flx:notification', e => e.detail) // new unread
 */

(function () {
  'use strict';

  const SCRIPT = document.currentScript;
  const ROLE = (SCRIPT && SCRIPT.dataset.role) || 'user';

  function getToken() {
    // Try Supabase session storage (standard supabase-js layout)
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && v.access_token) return v.access_token;
        if (Array.isArray(v) && v[0]) return v[0];
      }
    } catch {}
    // Fallbacks
    return localStorage.getItem('flx_access_token') ||
           sessionStorage.getItem('flx_access_token') || '';
  }

  const Live = {
    es: null,
    state: { connected: false, snapshot: null, lastUpdate: 0 },
    listeners: new Set(),

    connect() {
      const token = getToken();
      if (!token) {
        console.warn('[FLX Live] No auth token found — skipping live connection');
        return;
      }
      const url = `/api/live?token=${encodeURIComponent(token)}&role=${encodeURIComponent(ROLE)}`;
      try {
        this.es = new EventSource(url);
      } catch (e) {
        console.error('[FLX Live] EventSource failed:', e);
        return;
      }

      this.es.addEventListener('hello', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this.state.connected = true;
          this.state.user = data.user;
          this.state.role = data.role;
          this.state.isAdmin = data.isAdmin;
          this._emit('connected', data);
        } catch {}
      });

      this.es.addEventListener('snapshot', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this.state.snapshot = data;
          this.state.lastUpdate = Date.now();
          this._emit('snapshot', data);
          this._broadcast('flx:snapshot', data);
          this._renderBadges(data);
        } catch {}
      });

      this.es.addEventListener('update', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const prev = this.state.snapshot;
          this.state.snapshot = data;
          this.state.lastUpdate = Date.now();
          this._emit('update', data);
          this._broadcast('flx:update', data);
          this._diffAndNotify(prev, data);
          this._renderBadges(data);
        } catch {}
      });

      this.es.addEventListener('ping', () => {
        this.state.lastUpdate = Date.now();
      });

      this.es.addEventListener('error', () => {
        this.state.connected = false;
        // Auto-reconnect after 5s
        setTimeout(() => {
          if (this.es) { try { this.es.close(); } catch {} }
          this.connect();
        }, 5000);
      });
    },

    on(event, fn) {
      const wrap = { event, fn };
      this.listeners.add(wrap);
      return () => this.listeners.delete(wrap);
    },

    _emit(event, data) {
      for (const l of this.listeners) {
        if (l.event === event || l.event === '*') {
          try { l.fn(data, event); } catch (e) { console.error(e); }
        }
      }
    },

    _broadcast(name, detail) {
      try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    },

    _diffAndNotify(prev, next) {
      if (!prev || !next) return;
      // New shipment statuses
      const prevShip = new Map((prev.shipments || []).map(s => [s.id, s.status]));
      for (const s of (next.shipments || [])) {
        const before = prevShip.get(s.id);
        if (before && before !== s.status) {
          this._toast(`📦 شحنة ${s.id}: ${this._statusAr(s.status)}`);
          this._broadcast('flx:shipment-status', { id: s.id, from: before, to: s.status });
        }
      }
      // New unread notifications
      const prevNotifs = new Set((prev.notifications || []).map(n => n.id));
      for (const n of (next.notifications || [])) {
        if (!prevNotifs.has(n.id) && !n.read) {
          this._toast(`🔔 ${n.title || 'إشعار جديد'}`);
          this._broadcast('flx:notification', n);
        }
      }
    },

    _statusAr(s) {
      const m = { pending: 'قيد المعالجة', active: 'نشطة', transit: 'في الترانزيت',
                  delivered: 'تم التسليم', cancelled: 'ملغاة' };
      return m[s] || s;
    },

    _renderBadges(snap) {
      const c = snap.counts || {};
      const set = (sel, val) => {
        document.querySelectorAll(sel).forEach(el => {
          if (val > 0) { el.textContent = val; el.style.display = ''; }
          else el.style.display = 'none';
        });
      };
      set('[data-flx-badge="active"]', c.active);
      set('[data-flx-badge="unread"]', c.unread_notifs);
      set('[data-flx-badge="invoices"]', c.invoices_pending);
      set('[data-flx-badge="quotes"]', c.quotes);
    },

    _toast(msg) {
      if (window.flxToast) return window.flxToast(msg, 'info');
      // Mini fallback toast
      let t = document.getElementById('flx-live-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'flx-live-toast';
        t.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:linear-gradient(135deg,#0A84FF,#39C6FF);color:#fff;padding:12px 18px;border-radius:12px;font:500 14px/1.4 system-ui;box-shadow:0 12px 32px rgba(10,132,255,.3);transform:translateY(120%);transition:transform .35s cubic-bezier(.4,0,.2,1);max-width:340px;';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.transform = 'translateY(0)';
      clearTimeout(t._h);
      t._h = setTimeout(() => { t.style.transform = 'translateY(120%)'; }, 5000);
    },

    disconnect() {
      if (this.es) { try { this.es.close(); } catch {} this.es = null; }
      this.state.connected = false;
    },
  };

  window.FLXLive = Live;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Live.connect());
  } else {
    Live.connect();
  }
})();
