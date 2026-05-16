/**
 * FREIGHTLX Toast System (v3.4)
 *
 * Universal stackable, dismissible toasts with action buttons.
 *
 * Usage:
 *   flxToast('تم الحفظ', 'success')
 *   flxToast('فشل', 'error')
 *   flxToast({ title: 'شحنة جديدة', body: '...', actions: [{ label: 'فتح', onClick: () => {} }] })
 */
(function () {
  'use strict';

  const STYLE = `
.flx-toast-stack {
  position: fixed; top: 20px; left: 20px; z-index: 99997;
  display: flex; flex-direction: column; gap: 10px;
  pointer-events: none; max-width: 380px;
}
@media (max-width: 600px) { .flx-toast-stack { left: 10px; right: 10px; top: 10px; max-width: none; } }

.flx-toast {
  pointer-events: auto;
  background: rgba(15, 23, 42, .94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px;
  padding: 14px 16px;
  color: #fff;
  font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
  font-size: 13.5px; line-height: 1.5;
  box-shadow: 0 12px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
  display: flex; gap: 12px; align-items: flex-start;
  animation: flxToastIn .4s cubic-bezier(.4,0,.2,1);
  position: relative; overflow: hidden;
  max-width: 100%;
}
@keyframes flxToastIn {
  from { opacity: 0; transform: translateX(-30px) scale(.95); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
.flx-toast.dismissing {
  animation: flxToastOut .3s cubic-bezier(.4,0,.2,1) forwards;
}
@keyframes flxToastOut {
  from { opacity: 1; transform: translateX(0); max-height: 200px; margin-bottom: 10px; padding: 14px 16px; }
  to   { opacity: 0; transform: translateX(-30px); max-height: 0; margin-bottom: 0; padding: 0 16px; border-width: 0; }
}

.flx-toast::before {
  content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 3px;
}
.flx-toast.success::before { background: linear-gradient(180deg, #34d399, #10b981); }
.flx-toast.error::before   { background: linear-gradient(180deg, #ef4444, #dc2626); }
.flx-toast.warn::before    { background: linear-gradient(180deg, #fbbf24, #f59e0b); }
.flx-toast.info::before    { background: linear-gradient(180deg, #0ea5e9, #0284c7); }

.flx-toast-icon {
  flex-shrink: 0; width: 22px; height: 22px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 13px;
}
.flx-toast.success .flx-toast-icon { background: rgba(52,211,153,.15); color: #34d399; }
.flx-toast.error   .flx-toast-icon { background: rgba(239,68,68,.15); color: #ef4444; }
.flx-toast.warn    .flx-toast-icon { background: rgba(251,191,36,.15); color: #fbbf24; }
.flx-toast.info    .flx-toast-icon { background: rgba(14,165,233,.15); color: #0ea5e9; }

.flx-toast-body { flex: 1; min-width: 0; }
.flx-toast-title { font-weight: 600; margin: 0 0 2px; font-size: 14px; }
.flx-toast-msg   { font-size: 12.5px; color: rgba(255,255,255,.75); white-space: pre-wrap; word-wrap: break-word; }

.flx-toast-actions { display: flex; gap: 6px; margin-top: 8px; }
.flx-toast-actions button {
  background: rgba(255,255,255,.08); border: 0; border-radius: 8px;
  color: #fff; padding: 5px 10px; font-size: 11.5px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: background .15s;
}
.flx-toast-actions button:hover { background: rgba(255,255,255,.16); }
.flx-toast-actions button.primary {
  background: linear-gradient(135deg, #0A84FF, #39C6FF);
}

.flx-toast-close {
  background: none; border: 0; color: rgba(255,255,255,.4);
  cursor: pointer; padding: 2px; line-height: 0;
  transition: color .15s;
}
.flx-toast-close:hover { color: #fff; }
.flx-toast-progress {
  position: absolute; bottom: 0; right: 0; left: 0; height: 2px;
  background: linear-gradient(90deg, currentColor, transparent);
  transform-origin: right;
  animation: flxToastProgress var(--dur, 4s) linear forwards;
}
@keyframes flxToastProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
`;

  let stack;
  function ensureStack() {
    if (stack) return stack;
    const s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);
    stack = document.createElement('div'); stack.className = 'flx-toast-stack';
    document.body.appendChild(stack);
    return stack;
  }

  const ICONS = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warn:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(arg, type = 'info', duration = 4500) {
    ensureStack();
    let opts;
    if (typeof arg === 'string') opts = { msg: arg, type, duration };
    else opts = { type, duration, ...arg };
    if (!opts.type) opts.type = 'info';
    if (!opts.duration && opts.duration !== 0) opts.duration = type === 'error' ? 6500 : 4500;

    const el = document.createElement('div');
    el.className = `flx-toast ${opts.type}`;
    el.style.setProperty('--dur', opts.duration + 'ms');

    const actionsHtml = (opts.actions || []).map((a, i) =>
      `<button data-act="${i}" class="${a.primary ? 'primary' : ''}">${escapeHtml(a.label)}</button>`
    ).join('');

    el.innerHTML = `
      <div class="flx-toast-icon">${ICONS[opts.type] || ICONS.info}</div>
      <div class="flx-toast-body">
        ${opts.title ? `<div class="flx-toast-title">${escapeHtml(opts.title)}</div>` : ''}
        ${opts.msg || opts.body ? `<div class="flx-toast-msg">${escapeHtml(opts.msg || opts.body)}</div>` : ''}
        ${actionsHtml ? `<div class="flx-toast-actions">${actionsHtml}</div>` : ''}
      </div>
      <button class="flx-toast-close" aria-label="إغلاق">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${opts.duration > 0 ? '<div class="flx-toast-progress" style="color:currentColor"></div>' : ''}
    `;

    function close() {
      if (el.classList.contains('dismissing')) return;
      el.classList.add('dismissing');
      setTimeout(() => el.remove(), 320);
    }
    el.querySelector('.flx-toast-close').addEventListener('click', close);
    (opts.actions || []).forEach((a, i) => {
      el.querySelector(`[data-act="${i}"]`)?.addEventListener('click', () => {
        try { a.onClick?.(close); } catch (e) { console.error(e); }
        if (!a.keepOpen) close();
      });
    });

    stack.appendChild(el);
    if (opts.duration > 0) setTimeout(close, opts.duration);

    // Cap stack at 5
    while (stack.children.length > 5) stack.firstElementChild?.remove();
    return close;
  }

  window.flxToast = toast;

  // Auto-display SSE notifications via flx:notification event
  window.addEventListener('flx:notification', (ev) => {
    const n = ev.detail || {};
    toast({
      title: n.title || 'إشعار جديد',
      msg: n.message || '',
      type: n.type || 'info',
    });
  });
})();
