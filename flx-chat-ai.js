/**
 * FREIGHTLX AI Chat Integration
 * Connects the existing chatbot to Google Gemini via /api/chat
 */
(function () {
  'use strict';

  const API_ENDPOINT = '/api/chat';
  let conversationHistory = [];
  let aiEnabled = true; // can be toggled off

  function injectStyles() {
    if (document.getElementById('flx-ai-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-ai-styles';
    style.textContent = `
      .flx-ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        margin-right: 8px;
        font-family: 'Cairo', sans-serif;
      }
      .flx-ai-badge svg { width: 12px; height: 12px; }

      .flx-ai-msg-wrap {
        display: flex; flex-direction: column; gap: 6px;
        margin: 12px 0; max-width: 75%; align-self: flex-end;
        font-family: 'Cairo', 'Tajawal', sans-serif;
      }
      .flx-ai-msg {
        background: linear-gradient(135deg, #1e3a6e, #2d5599);
        color: #fff;
        padding: 14px 18px;
        border-radius: 18px 18px 6px 18px;
        font-size: 14px;
        line-height: 1.7;
        white-space: pre-wrap;
        word-wrap: break-word;
        box-shadow: 0 6px 20px rgba(30, 58, 110, 0.2);
        direction: rtl;
        text-align: right;
      }
      .flx-ai-msg-meta {
        font-size: 10px; color: #94a3b8;
        display: flex; align-items: center; gap: 6px;
        padding: 0 8px;
      }
      .flx-user-msg-wrap {
        align-self: flex-start;
        max-width: 75%;
        margin: 12px 0;
      }
      .flx-user-msg {
        background: #f1f5f9; color: #1e293b;
        padding: 12px 16px; border-radius: 18px 18px 18px 6px;
        font-size: 14px; line-height: 1.6;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        direction: rtl; text-align: right;
      }
      .flx-ai-typing {
        display: inline-flex;
        gap: 4px; padding: 14px 18px;
        background: #f1f5f9;
        border-radius: 18px 18px 18px 6px;
        align-self: flex-start;
        margin: 12px 0;
      }
      .flx-ai-typing span {
        width: 8px; height: 8px;
        background: #94a3b8;
        border-radius: 50%;
        animation: flxBounce 1.4s infinite ease-in-out;
      }
      .flx-ai-typing span:nth-child(1) { animation-delay: -0.32s; }
      .flx-ai-typing span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes flxBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }

      .flx-ai-container {
        display: flex; flex-direction: column;
        padding: 0 20px;
        max-height: 60vh;
        overflow-y: auto;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Find the chat modal's input and send mechanism
   * Returns { input, sendBtn, msgArea } or null
   */
  function findChatElements() {
    // Look for the chat input by placeholder
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    const chatInput = inputs.find(i =>
      i.placeholder?.includes('سؤالك') ||
      i.placeholder?.includes('شحنتك') ||
      i.placeholder?.includes('اكتب')
    );
    if (!chatInput) return null;

    // Find the message container - the scrollable area containing chat messages
    let msgArea = chatInput.closest('[class*="dialog"], [class*="modal"], [role="dialog"]');
    if (!msgArea) {
      // Walk up to find a reasonable container
      let parent = chatInput.parentElement;
      while (parent && parent.offsetHeight < 300) parent = parent.parentElement;
      msgArea = parent;
    }

    return { input: chatInput, msgArea };
  }

  function findOrCreateAIContainer(chatModal) {
    let container = chatModal.querySelector('.flx-ai-container');
    if (container) return container;

    // Try to find the existing message area inside the modal
    const inputEl = chatModal.querySelector('input[placeholder*="سؤالك"], input[placeholder*="شحنتك"], input[placeholder*="اكتب"]');
    if (!inputEl) return null;

    // Insert before the input's parent
    const inputWrap = inputEl.closest('div[class*="border"], div[class*="rounded"]') || inputEl.parentElement;
    container = document.createElement('div');
    container.className = 'flx-ai-container';
    inputWrap.parentElement.insertBefore(container, inputWrap);
    return container;
  }

  function addUserMessage(container, text) {
    const wrap = document.createElement('div');
    wrap.className = 'flx-user-msg-wrap';
    wrap.innerHTML = `<div class="flx-user-msg">${escapeHTML(text)}</div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function addAIMessage(container, text) {
    const wrap = document.createElement('div');
    wrap.className = 'flx-ai-msg-wrap';
    wrap.innerHTML = `
      <div class="flx-ai-msg">${escapeHTML(text)}</div>
      <div class="flx-ai-msg-meta">
        <span class="flx-ai-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6m11-11h-6M7 12H1m17.07-7.07L15 7m-6 10l-3.07 3.07M17.07 17.07L15 15M7 7L4.93 4.93"/></svg>
          Gemini AI
        </span>
        <span>FREIGHTLX AI</span>
      </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(container) {
    const typing = document.createElement('div');
    typing.className = 'flx-ai-typing';
    typing.id = 'flx-ai-typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    return typing;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  async function askAI(message, chatModal) {
    const container = findOrCreateAIContainer(chatModal);
    if (!container) return false;

    addUserMessage(container, message);
    const typing = showTyping(container);

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: conversationHistory
        })
      });

      typing.remove();

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData.error || `خطأ ${res.status}`;
        if (res.status === 500 && errorData.hint) {
          addAIMessage(container, `⚠️ AI غير مفعّل بعد.\n\nالمالك يحتاج إضافة GEMINI_API_KEY في إعدادات Vercel.\n\nمؤقتاً، استخدم البطاقات والأزرار في الأعلى.`);
        } else {
          addAIMessage(container, `حصل خطأ: ${errMsg}. حاول مرة ثانية.`);
        }
        return true;
      }

      const data = await res.json();
      addAIMessage(container, data.reply);
      // Update conversation history
      conversationHistory.push({ role: 'user', content: message });
      conversationHistory.push({ role: 'assistant', content: data.reply });
      // Keep history small (last 10 exchanges)
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }
      return true;
    } catch (err) {
      typing.remove();
      addAIMessage(container, `خطأ في الاتصال: ${err.message}`);
      return true;
    }
  }

  /**
   * Override the existing flxSendMsg function to route through AI
   */
  function hookExistingChatFunctions() {
    let originalSend = null;
    let hooked = false;

    function tryHook() {
      if (hooked) return;
      if (typeof window.flxSendMsg !== 'function') return;
      originalSend = window.flxSendMsg;
      hooked = true;

      window.flxSendMsg = function (...args) {
        // Get the message - either from args or from input
        let message = args[0];
        if (!message || typeof message !== 'string') {
          const inp = document.querySelector('input[placeholder*="سؤالك"], input[placeholder*="شحنتك"], input[placeholder*="اكتب"]');
          if (inp) message = inp.value.trim();
        }
        if (!message) return;

        // Find chat modal
        const inp = document.querySelector('input[placeholder*="سؤالك"], input[placeholder*="شحنتك"], input[placeholder*="اكتب"]');
        const chatModal = inp?.closest('[class*="dialog"], [class*="modal"], [role="dialog"]')
          || inp?.closest('div[class*="fixed"]')
          || document.body;

        // Clear the input
        if (inp) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(inp, '');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Call AI
        if (aiEnabled) {
          askAI(message, chatModal);
        } else if (originalSend) {
          return originalSend.apply(this, args);
        }
      };

      console.log('[FREIGHTLX AI] Hooked flxSendMsg successfully');
    }

    setInterval(tryHook, 500);
    tryHook();
  }

  function init() {
    injectStyles();
    hookExistingChatFunctions();
    console.log('[FREIGHTLX AI] Chat hooks initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
