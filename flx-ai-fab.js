/**
 * FREIGHTLX AI FAB — Floating AI Assistant for Dashboard & Admin (v3.0)
 *
 * Injects an AI bubble that calls /api/agent with the current page context.
 *
 * <script src="/flx-ai-fab.js" data-context="dashboard|admin"></script>
 */
(function () {
  'use strict';

  const SCRIPT = document.currentScript;
  const CONTEXT = (SCRIPT && SCRIPT.dataset.context) || 'dashboard';
  const ENDPOINT = '/api/agent';

  const STYLE = `
.flx-ai-fab-btn {
  position: fixed; bottom: 24px; left: 24px; z-index: 99998;
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, #0A84FF 0%, #39C6FF 100%);
  border: none; cursor: pointer; color: #fff;
  box-shadow: 0 12px 32px rgba(10,132,255,.45), 0 0 0 0 rgba(57,198,255,.6);
  animation: flxFabPulse 2.6s cubic-bezier(.4,0,.2,1) infinite;
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s cubic-bezier(.4,0,.2,1);
}
.flx-ai-fab-btn:hover { transform: scale(1.08); }
.flx-ai-fab-btn svg { width: 26px; height: 26px; }
@keyframes flxFabPulse {
  0%, 100% { box-shadow: 0 12px 32px rgba(10,132,255,.45), 0 0 0 0 rgba(57,198,255,.6); }
  50%      { box-shadow: 0 12px 32px rgba(10,132,255,.45), 0 0 0 18px rgba(57,198,255,0); }
}

.flx-ai-panel {
  position: fixed; bottom: 96px; left: 24px; z-index: 99998;
  width: min(420px, calc(100vw - 32px)); height: min(620px, calc(100vh - 140px));
  background: rgba(5, 14, 24, 0.94); backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(57,198,255,0.2); border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06);
  display: none; flex-direction: column; overflow: hidden;
  font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
  color: #fff;
}
.flx-ai-panel.open { display: flex; animation: flxPanelIn .3s cubic-bezier(.4,0,.2,1); }
@keyframes flxPanelIn { from { opacity: 0; transform: translateY(20px) scale(.96); } to { opacity: 1; transform: none; } }
.flx-ai-head {
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: linear-gradient(180deg, rgba(10,132,255,.18), transparent);
}
.flx-ai-head .t { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; }
.flx-ai-head .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; }
.flx-ai-close {
  background: none; border: none; color: rgba(255,255,255,.6); cursor: pointer;
  width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
}
.flx-ai-close:hover { background: rgba(255,255,255,.08); color: #fff; }
.flx-ai-body {
  flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.flx-ai-msg {
  max-width: 88%; padding: 11px 14px; border-radius: 14px;
  font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word;
}
.flx-ai-msg.user {
  align-self: flex-end; background: linear-gradient(135deg,#0A84FF,#39C6FF); color: #fff;
  border-radius: 14px 14px 4px 14px;
}
.flx-ai-msg.bot {
  align-self: flex-start; background: rgba(255,255,255,.08); color: #e8eef5;
  border-radius: 14px 14px 14px 4px; border: 1px solid rgba(255,255,255,.05);
}
.flx-ai-msg.action {
  align-self: flex-start; background: rgba(57,198,255,.08); border: 1px solid rgba(57,198,255,.25);
  font-size: 12.5px; color: #9bd9ff; padding: 8px 12px;
}
.flx-ai-action-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #39C6FF; margin-left: 6px; animation: flxDotPulse 1s infinite; }
@keyframes flxDotPulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
.flx-ai-cards {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 4px;
}
.flx-ai-card {
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
  padding: 10px 12px; border-radius: 12px; cursor: pointer; font-size: 12px;
  color: #cfe2f9; text-align: right; transition: all .15s;
}
.flx-ai-card:hover { background: rgba(57,198,255,.12); border-color: rgba(57,198,255,.4); transform: translateY(-1px); }
.flx-ai-foot { padding: 12px; border-top: 1px solid rgba(255,255,255,.08); display: flex; gap: 8px; }
.flx-ai-input {
  flex: 1; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 10px 14px; color: #fff; font-size: 13.5px;
  font-family: inherit; outline: none; transition: all .15s;
}
.flx-ai-input:focus { border-color: rgba(57,198,255,.5); background: rgba(255,255,255,.09); }
.flx-ai-input::placeholder { color: rgba(255,255,255,.4); }
.flx-ai-send {
  background: linear-gradient(135deg,#0A84FF,#39C6FF); border: none; border-radius: 12px;
  padding: 0 16px; color: #fff; cursor: pointer; font-weight: 600; font-size: 13px;
  display: flex; align-items: center; justify-content: center; min-width: 48px;
}
.flx-ai-send:disabled { opacity: .5; cursor: wait; }
`;

  function ensureStyles() {
    if (document.getElementById('flx-ai-fab-styles')) return;
    const s = document.createElement('style'); s.id = 'flx-ai-fab-styles';
    s.textContent = STYLE; document.head.appendChild(s);
  }

  function html(s) { const d = document.createElement('div'); d.innerHTML = s; return d.firstElementChild; }

  function buildFab() {
    const btn = html(`<button class="flx-ai-fab-btn" title="FREIGHTLX AI" aria-label="فتح FREIGHTLX AI">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </button>`);
    return btn;
  }

  function buildPanel() {
    const suggested = CONTEXT === 'admin'
      ? ['كم عميل جديد اليوم؟', 'الشحنات اللي محتاجة تدخل', 'الإيرادات هذا الشهر', 'الطلبات اللي معلقة']
      : ['وين شحنتي؟', 'احسب تكلفة استيراد', 'سعر شحن من الصين', 'إيش شهادات سابر اللازمة'];
    const cards = suggested.map(s => `<button class="flx-ai-card" data-prompt="${s}">${s}</button>`).join('');
    return html(`<div class="flx-ai-panel">
      <div class="flx-ai-head">
        <div class="t"><span class="dot"></span><span>FREIGHTLX AI · ${CONTEXT === 'admin' ? 'Admin' : 'مساعدك التشغيلي'}</span></div>
        <button class="flx-ai-close" aria-label="إغلاق">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="flx-ai-body">
        <div class="flx-ai-msg bot">${CONTEXT === 'admin'
          ? 'أهلاً بك في وحدة Admin AI. أقدر أبحث في الشحنات، أحدّث الحالات، أرسل إشعارات للعملاء، وأبني تقارير. وش تحتاج؟'
          : 'أنا FREIGHTLX AI — المهندس التشغيلي. أقدر أتتبع شحناتك، أحسب التكاليف، أحجز عروض، وأتعامل مع الجمارك والسابر. سؤالك؟'}
        </div>
        <div class="flx-ai-cards">${cards}</div>
      </div>
      <form class="flx-ai-foot">
        <input class="flx-ai-input" type="text" placeholder="اكتب رسالتك..." autocomplete="off" />
        <button class="flx-ai-send" type="submit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>`);
  }

  const history = [];

  async function send(prompt, panel) {
    if (!prompt || !prompt.trim()) return;
    const body = panel.querySelector('.flx-ai-body');
    const cards = panel.querySelector('.flx-ai-cards');
    if (cards) cards.style.display = 'none';

    body.appendChild(html(`<div class="flx-ai-msg user">${escapeHtml(prompt)}</div>`));
    body.scrollTop = body.scrollHeight;

    const thinking = html('<div class="flx-ai-msg action">يفكر <span class="flx-ai-action-dot"></span></div>');
    body.appendChild(thinking);
    body.scrollTop = body.scrollHeight;

    const input = panel.querySelector('.flx-ai-input');
    const send  = panel.querySelector('.flx-ai-send');
    input.disabled = true; send.disabled = true;

    try {
      const auth = getToken();
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify({
          message: prompt,
          history,
          context: { page: CONTEXT, url: location.pathname },
        }),
      });
      const j = await r.json().catch(() => ({}));
      thinking.remove();

      // Render any tool actions
      const acts = j.actions || [];
      for (const a of acts) {
        body.appendChild(html(`<div class="flx-ai-msg action">✓ ${a.tool || a.name || 'action'}</div>`));
      }
      // Render reply
      const reply = j.reply || j.error || 'لم أحصل على رد. حاول مرة ثانية.';
      body.appendChild(html(`<div class="flx-ai-msg bot">${escapeHtml(reply)}</div>`));
      history.push({ role: 'user', content: prompt });
      history.push({ role: 'assistant', content: reply });
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (e) {
      thinking.remove();
      body.appendChild(html(`<div class="flx-ai-msg bot">حدث خطأ: ${escapeHtml(e.message)}</div>`));
    } finally {
      input.disabled = false; send.disabled = false; input.value = ''; input.focus();
      body.scrollTop = body.scrollHeight;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getToken() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && v.access_token) return v.access_token;
        if (Array.isArray(v) && v[0]) return v[0];
      }
    } catch {}
    return localStorage.getItem('flx_access_token') || '';
  }

  function init() {
    ensureStyles();
    const fab = buildFab();
    const panel = buildPanel();
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) panel.querySelector('.flx-ai-input').focus();
    });
    panel.querySelector('.flx-ai-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('.flx-ai-foot').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const input = panel.querySelector('.flx-ai-input');
      send(input.value, panel);
    });
    panel.addEventListener('click', (ev) => {
      const card = ev.target.closest('.flx-ai-card');
      if (card) send(card.dataset.prompt, panel);
    });

    // Show notification badge when new flx:notification arrives and panel is closed
    window.addEventListener('flx:notification', () => {
      if (!panel.classList.contains('open')) {
        fab.style.background = 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)';
        setTimeout(() => { fab.style.background = ''; }, 4000);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
