/**
 * FREIGHTLX Command Palette (v3.4)
 *
 * Cmd+K / Ctrl+K — universal quick action launcher.
 * Includes navigation, AI shortcuts, and per-context actions.
 */
(function () {
  'use strict';

  const STYLE = `
.flx-cmdk-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(0,0,0,.65); backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  animation: flxCmdkBg .25s ease-out;
}
@keyframes flxCmdkBg { from { opacity: 0; } to { opacity: 1; } }

.flx-cmdk {
  background: rgba(15, 23, 42, .96);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(57,198,255,.2);
  border-radius: 16px;
  width: min(620px, calc(100vw - 40px));
  max-height: 70vh;
  box-shadow: 0 24px 64px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06);
  font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
  color: #fff;
  display: flex; flex-direction: column; overflow: hidden;
  animation: flxCmdkIn .3s cubic-bezier(.4,0,.2,1);
}
@keyframes flxCmdkIn { from { opacity: 0; transform: translateY(-20px) scale(.96); } to { opacity: 1; transform: none; } }

.flx-cmdk-search {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.flx-cmdk-search input {
  flex: 1; background: transparent; border: 0; outline: 0;
  color: #fff; font-size: 15px; font-family: inherit;
}
.flx-cmdk-search input::placeholder { color: rgba(255,255,255,.4); }
.flx-cmdk-kbd {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 5px; padding: 2px 7px;
  font: 600 11px ui-monospace, monospace;
  color: rgba(255,255,255,.55);
}

.flx-cmdk-list {
  flex: 1; overflow-y: auto; padding: 8px;
}
.flx-cmdk-group {
  padding: 8px 12px 4px;
  font-size: 10px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  color: rgba(255,255,255,.4);
}
.flx-cmdk-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  cursor: pointer; transition: background .12s;
  margin-bottom: 2px;
}
.flx-cmdk-item:hover, .flx-cmdk-item.active {
  background: rgba(57,198,255,.12);
}
.flx-cmdk-item-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(255,255,255,.06);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.flx-cmdk-item-text { flex: 1; min-width: 0; }
.flx-cmdk-item-title { font-size: 13.5px; font-weight: 500; }
.flx-cmdk-item-sub { font-size: 11.5px; color: rgba(255,255,255,.5); margin-top: 1px; }
.flx-cmdk-item-shortcut { font: 600 10px ui-monospace, monospace; color: rgba(255,255,255,.4); }

.flx-cmdk-foot {
  padding: 8px 16px; font-size: 11px; color: rgba(255,255,255,.4);
  border-top: 1px solid rgba(255,255,255,.06);
  display: flex; gap: 14px; justify-content: space-between;
}
.flx-cmdk-foot span { display: inline-flex; align-items: center; gap: 5px; }
`;

  function ensureStyles() {
    if (document.getElementById('flx-cmdk-styles')) return;
    const s = document.createElement('style'); s.id = 'flx-cmdk-styles';
    s.textContent = STYLE; document.head.appendChild(s);
  }

  function normalize(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  }

  // Built-in commands
  const NAV = [
    { id: 'home',      group: 'تنقّل', title: 'الرئيسية',         sub: '/home', icon: '🏠', href: '/' },
    { id: 'dashboard', group: 'تنقّل', title: 'لوحة التحكم',       sub: '/dashboard', icon: '📊', href: '/dashboard.html' },
    { id: 'rates',     group: 'تنقّل', title: 'الأسعار',           sub: '/rates', icon: '💰', href: '/rates.html' },
    { id: 'packages',  group: 'تنقّل', title: 'باقات الخدمات',     sub: '/packages', icon: '📦', href: '/packages.html' },
    { id: 'admin',     group: 'تنقّل', title: 'لوحة الإدارة',      sub: '/admin', icon: '⚙️', href: '/admin.html' },
    { id: 'test',      group: 'تنقّل', title: 'اختبار النظام',     sub: '/test', icon: '🧪', href: '/test.html' },
  ];

  const AI_PROMPTS = [
    { id: 'ai-track',    group: 'AI', title: 'وين شحنتي؟',                  icon: '📍', prompt: 'وين شحنتي؟' },
    { id: 'ai-cost',     group: 'AI', title: 'احسب تكلفة استيراد',          icon: '🧮', prompt: 'احسب لي تكلفة استيراد كاملة' },
    { id: 'ai-rates',    group: 'AI', title: 'أسعار شحن من الصين',          icon: '🚢', prompt: 'أعطني أسعار شحن من شنغهاي لجدة' },
    { id: 'ai-saber',    group: 'AI', title: 'شهادات سابر للمنتج',          icon: '📜', prompt: 'إيش شهادات سابر اللي محتاجها لـ ' },
    { id: 'ai-hs',       group: 'AI', title: 'بحث HS code',                  icon: '🔢', prompt: 'إيش HS code لـ ' },
    { id: 'ai-demur',    group: 'AI', title: 'احسب الديموراج',               icon: '⏰', prompt: 'احسب ديموراج حاوية تأخرت ' },
    { id: 'ai-compare',  group: 'AI', title: 'قارن الخطوط الملاحية',         icon: '🔍', prompt: 'قارن لي الخطوط الملاحية للمسار ' },
  ];

  function getCmds() {
    const path = location.pathname;
    const cmds = [...NAV, ...AI_PROMPTS];
    // Admin-specific
    if (path.includes('admin')) {
      cmds.push(
        { id: 'adm-bc',    group: 'إدارة', title: 'بث إشعار للعملاء',   icon: '🔔', action: () => document.getElementById('admBroadcastBtn')?.click() },
        { id: 'adm-users', group: 'إدارة', title: 'انتقل لإدارة العملاء',  icon: '👥', action: () => document.querySelector('[data-section="users"]')?.click() },
        { id: 'adm-ships', group: 'إدارة', title: 'انتقل للشحنات',         icon: '📦', action: () => document.querySelector('[data-section="shipments"]')?.click() },
      );
    }
    cmds.push({ id: 'logout', group: 'حساب', title: 'تسجيل الخروج', icon: '🚪', action: () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      location.href = '/';
    }});
    return cmds;
  }

  let palette = null;
  let active = 0;
  let filtered = [];

  function render(query = '') {
    const list = palette.querySelector('.flx-cmdk-list');
    const q = normalize(query);
    let cmds = getCmds();
    if (q) {
      const scored = cmds.map(c => {
        const hay = normalize(c.title + ' ' + (c.sub || '') + ' ' + (c.group || ''));
        let score = 0;
        for (const tok of q.split(/\s+/).filter(Boolean)) {
          if (hay.includes(tok)) score++;
        }
        return { c, score };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      cmds = scored.map(x => x.c);
    }
    filtered = cmds;
    active = Math.min(active, Math.max(0, cmds.length - 1));

    // Group
    const grouped = {};
    for (const c of cmds) { (grouped[c.group || 'إجراءات'] ||= []).push(c); }

    list.innerHTML = '';
    for (const [g, items] of Object.entries(grouped)) {
      const head = document.createElement('div'); head.className = 'flx-cmdk-group'; head.textContent = g;
      list.appendChild(head);
      for (const c of items) {
        const i = cmds.indexOf(c);
        const el = document.createElement('div');
        el.className = 'flx-cmdk-item' + (i === active ? ' active' : '');
        el.innerHTML = `
          <div class="flx-cmdk-item-icon">${c.icon || '•'}</div>
          <div class="flx-cmdk-item-text">
            <div class="flx-cmdk-item-title">${c.title}</div>
            ${c.sub ? `<div class="flx-cmdk-item-sub">${c.sub}</div>` : ''}
          </div>
          ${c.shortcut ? `<div class="flx-cmdk-item-shortcut">${c.shortcut}</div>` : ''}
        `;
        el.addEventListener('click', () => exec(c));
        list.appendChild(el);
      }
    }
    if (!cmds.length) {
      list.innerHTML = '<div style="padding:32px;text-align:center;color:rgba(255,255,255,.5);font-size:13px">لا توجد نتائج</div>';
    }
  }

  function exec(c) {
    close();
    if (c.href) location.href = c.href;
    else if (c.action) c.action();
    else if (c.prompt) {
      // Open AI FAB with prompt prefilled
      const fab = document.querySelector('.flx-ai-fab-btn');
      const panel = document.querySelector('.flx-ai-panel');
      if (fab && panel) {
        if (!panel.classList.contains('open')) fab.click();
        setTimeout(() => {
          const input = panel.querySelector('.flx-ai-input');
          if (input) {
            input.value = c.prompt;
            input.focus();
          }
        }, 50);
      }
    }
  }

  function open() {
    if (palette) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.className = 'flx-cmdk-overlay';
    overlay.innerHTML = `
      <div class="flx-cmdk">
        <div class="flx-cmdk-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="ابحث أو اكتب أمراً..." autofocus autocomplete="off">
          <kbd class="flx-cmdk-kbd">ESC</kbd>
        </div>
        <div class="flx-cmdk-list"></div>
        <div class="flx-cmdk-foot">
          <span><kbd class="flx-cmdk-kbd">↑↓</kbd> تنقّل</span>
          <span><kbd class="flx-cmdk-kbd">↵</kbd> تنفيذ</span>
          <span>FREIGHTLX ⌘K</span>
        </div>
      </div>`;
    palette = overlay;
    document.body.appendChild(overlay);
    active = 0;
    render('');
    const input = overlay.querySelector('input');
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, filtered.length - 1); render(input.value); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(input.value); e.preventDefault(); }
      else if (e.key === 'Enter') { if (filtered[active]) exec(filtered[active]); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    setTimeout(() => input.focus(), 60);
  }

  function close() {
    if (!palette) return;
    palette.remove();
    palette = null;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette ? close() : open();
    }
  });

  window.flxCmdK = { open, close };

  // Add a subtle hint button on page
  function injectHint() {
    if (document.getElementById('flx-cmdk-hint') || document.querySelector('.admin-login:not(.hidden)')) return;
    const hint = document.createElement('button');
    hint.id = 'flx-cmdk-hint';
    hint.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> <kbd>⌘K</kbd>';
    hint.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99996;background:rgba(15,23,42,.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.8);padding:8px 12px;border-radius:10px;cursor:pointer;font:500 11.5px system-ui;display:flex;align-items:center;gap:6px;transition:all .15s;font-family:inherit';
    const k = hint.querySelector('kbd');
    if (k) k.style.cssText = 'background:rgba(255,255,255,.1);padding:2px 6px;border-radius:4px;font:600 10px ui-monospace,monospace;color:rgba(255,255,255,.9)';
    hint.addEventListener('mouseenter', () => hint.style.background = 'rgba(57,198,255,.15)');
    hint.addEventListener('mouseleave', () => hint.style.background = 'rgba(15,23,42,.85)');
    hint.addEventListener('click', () => open());
    hint.title = 'افتح قائمة الأوامر (Cmd+K أو Ctrl+K)';
    document.body.appendChild(hint);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectHint);
  else injectHint();
})();
