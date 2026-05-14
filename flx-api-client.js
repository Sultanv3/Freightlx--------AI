/**
 * FREIGHTLX API Client
 * Single source of truth for all backend calls.
 * Auto-handles: JWT tokens, refresh, retries, error normalization.
 *
 * Usage:
 *   await flxApi.auth.login({ email, password });
 *   const ships = await flxApi.shipments.list();
 *   await flxApi.shipments.create({ origin: 'CNSHA', destination: 'SAJED', ... });
 */
(function () {
  'use strict';

  const BASE_URL = window.FLX_API_BASE || 'https://api.freightlx.com/api/v1';
  const TOKEN_KEY = 'flx_access_token';
  const REFRESH_KEY = 'flx_refresh_token';

  // ── Token storage — reads Supabase auth token if present ──
  const Tokens = {
    get access() {
      // Try local first, then Supabase auth-token in localStorage
      const local = localStorage.getItem(TOKEN_KEY);
      if (local) return local;
      // Find any Supabase auth-token key
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try {
            const data = JSON.parse(localStorage.getItem(k));
            if (data?.access_token) return data.access_token;
          } catch {}
        }
      }
      return null;
    },
    get refresh() {
      const local = localStorage.getItem(REFRESH_KEY);
      if (local) return local;
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try {
            const data = JSON.parse(localStorage.getItem(k));
            if (data?.refresh_token) return data.refresh_token;
          } catch {}
        }
      }
      return null;
    },
    set(access, refresh) {
      if (access)  localStorage.setItem(TOKEN_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    },
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    },
  };

  // ── HTTP layer with auto-refresh ──
  let refreshInFlight = null;

  async function http(path, options = {}) {
    const url = path.startsWith('http') ? path : BASE_URL + path;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (Tokens.access && !options.skipAuth) {
      headers.Authorization = `Bearer ${Tokens.access}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.body = JSON.stringify(options.body);
    } else if (options.body instanceof FormData) {
      delete headers['Content-Type']; // browser sets multipart boundary
    }

    let res = await fetch(url, { ...options, headers });

    // 401 → try to refresh and retry once
    if (res.status === 401 && Tokens.refresh && !options.skipAuth && !options.retried) {
      if (!refreshInFlight) {
        refreshInFlight = fetch(BASE_URL + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: Tokens.refresh }),
        }).then(async (r) => {
          if (r.ok) {
            const d = await r.json();
            Tokens.set(d.access_token, d.refresh_token);
            return d.access_token;
          }
          Tokens.clear();
          window.dispatchEvent(new CustomEvent('flx:logout'));
          throw new Error('Session expired');
        }).finally(() => { refreshInFlight = null; });
      }
      try {
        await refreshInFlight;
        return http(path, { ...options, retried: true });
      } catch {
        // fall through to error
      }
    }

    let body;
    const ct = res.headers.get('content-type') || '';
    body = ct.includes('json') ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      const err = new Error(body?.error?.message || res.statusText);
      err.status = res.status;
      err.code = body?.error?.code;
      err.details = body?.error?.details;
      throw err;
    }
    return body;
  }

  const get  = (p, q) => http(p + (q ? '?' + new URLSearchParams(q) : ''));
  const post = (p, body) => http(p, { method: 'POST', body });
  const patch = (p, body) => http(p, { method: 'PATCH', body });
  const del  = (p) => http(p, { method: 'DELETE' });

  // ── Public API ──
  window.flxApi = {
    setBaseURL(url) { window.FLX_API_BASE = url; },

    isAuthenticated: () => Boolean(Tokens.access),

    auth: {
      async signup(data) {
        const r = await post('/auth/signup', data);
        Tokens.set(r.access_token, r.refresh_token);
        return r;
      },
      async login(data) {
        const r = await post('/auth/login', data);
        Tokens.set(r.access_token, r.refresh_token);
        return r;
      },
      async logout() {
        try { await post('/auth/logout'); } catch {}
        Tokens.clear();
      },
      me: () => get('/auth/me'),
    },

    shipments: {
      list: (params) => get('/shipments', params),
      get: (id) => get(`/shipments/${id}`),
      create: (data) => post('/shipments', data),
      update: (id, data) => patch(`/shipments/${id}`, data),
      delete: (id) => del(`/shipments/${id}`),
    },

    quotes: {
      list: (params) => get('/quotes', params),
      get: (id) => get(`/quotes/${id}`),
      create: (data) => post('/quotes', data),
      book: (id, data = {}) => post(`/quotes/${id}/book`, data),
      delete: (id) => del(`/quotes/${id}`),
    },

    invoices: {
      list: (params) => get('/invoices', params),
      get: (id) => get(`/invoices/${id}`),
      create: (data) => post('/invoices', data),
      markStatus: (id, status) => patch(`/invoices/${id}/status`, { status }),
      pdfData: (id) => get(`/invoices/${id}/data`),
    },

    documents: {
      list: (params) => get('/documents', params),
      async upload(file, category = 'other', shipmentId) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('category', category);
        if (shipmentId) fd.append('shipmentId', shipmentId);
        return http('/documents/upload', { method: 'POST', body: fd });
      },
      get: (id) => get(`/documents/${id}`),
      download: (id) => get(`/documents/${id}/download`),
      delete: (id) => del(`/documents/${id}`),
    },

    notifications: {
      list: (unreadOnly = false) => get('/notifications', unreadOnly ? { unread: '1' } : undefined),
      markRead: (ids) => post('/notifications/mark-read', ids ? { ids } : {}),

      /** Subscribe to real-time stream. Returns close fn. */
      subscribe(onNotification) {
        if (!Tokens.access) throw new Error('Not authenticated');
        const url = BASE_URL + '/notifications/stream';
        // EventSource doesn't support custom headers — use token in query
        // Or use fetch + ReadableStream
        const controller = new AbortController();
        (async () => {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${Tokens.access}` },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const events = buf.split('\n\n');
            buf = events.pop() ?? '';
            for (const e of events) {
              const lines = e.split('\n');
              const data = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
              const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
              if (event === 'notification' && data) {
                try { onNotification(JSON.parse(data)); } catch {}
              }
            }
          }
        })().catch(() => { /* connection closed */ });
        return () => controller.abort();
      },
    },

    admin: {
      users: (params) => get('/admin/users', params),
      updateUser: (id, data) => patch(`/admin/users/${id}`, data),
      stats: () => get('/admin/stats'),
    },

    ai: {
      chat: (message, history) => post('/ai/chat', { message, history }),
      rates: (origin, destination, container = '40HC') =>
        get('/ai/rates', { origin, destination, container }),
    },

    health: () => get('/health'),
  };
})();
