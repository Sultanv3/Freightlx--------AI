/**
 * FREIGHTLX AI Chat Integration
 * Connects the existing chatbot to Google Gemini via /api/chat
 *
 * Strategy: Override the existing flxSendMsg function. The chat uses
 * #flx-messages container with .flx-msg-row.user / .flx-msg-row.bot rows.
 */
(function () {
  'use strict';

  const API_ENDPOINT = '/api/chat';
  let conversationHistory = [];
  let aiEnabled = true;

  function injectStyles() {
    if (document.getElementById('flx-ai-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-ai-styles';
    style.textContent = `
      .flx-msg-row.flx-ai-bot-row .flx-ai-source {
        display: inline-block;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        margin-bottom: 6px;
        font-family: 'Cairo', sans-serif;
      }
      .flx-msg-row.flx-ai-bot-row .flx-ai-content {
        white-space: pre-wrap;
        line-height: 1.7;
        font-family: 'Cairo', 'Tajawal', sans-serif;
      }
      .flx-ai-typing {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .flx-ai-typing span {
        width: 7px; height: 7px;
        background: #94a3b8;
        border-radius: 50%;
        animation: flxAITypingBounce 1.4s infinite ease-in-out;
      }
      .flx-ai-typing span:nth-child(1) { animation-delay: -0.32s; }
      .flx-ai-typing span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes flxAITypingBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function getMessagesContainer() {
    return document.getElementById('flx-messages');
  }

  function hideWelcomeCards() {
    // Hide the welcome message and the service cards (Full Import Cost, Ocean Freight Quote)
    const cardsToHide = [];
    document.querySelectorAll('.flx-msg-row').forEach(row => {
      const txt = row.textContent || '';
      if (txt.includes('وش تحتاج اليوم') ||
          txt.includes('FULL IMPORT COST') ||
          txt.includes('OCEAN FREIGHT QUOTE') ||
          txt.includes('احصل على عرض سعر') ||
          txt.includes('احسب تكاليف الاستيراد كاملة')) {
        cardsToHide.push(row);
      }
    });
    cardsToHide.forEach(c => { c.style.display = 'none'; });
  }

  function addUserMessage(text) {
    const container = getMessagesContainer();
    if (!container) return false;
    const row = document.createElement('div');
    row.className = 'flx-msg-row user flx-ai-user-row';
    // Use the same bubble structure as existing user messages
    row.innerHTML = `<div class="flx-msg-bubble user">${escapeHTML(text)}</div>`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return true;
  }

  function addAIMessage(text) {
    const container = getMessagesContainer();
    if (!container) return false;
    const row = document.createElement('div');
    row.className = 'flx-msg-row bot flx-ai-bot-row';
    row.innerHTML = `
      <div class="flx-msg-bubble bot">
        <span class="flx-ai-source">✦ Gemini AI</span>
        <div class="flx-ai-content">${escapeHTML(text)}</div>
      </div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return true;
  }

  function showTyping() {
    const container = getMessagesContainer();
    if (!container) return null;
    const row = document.createElement('div');
    row.className = 'flx-msg-row bot flx-ai-typing-row';
    row.id = 'flx-ai-typing-indicator';
    row.innerHTML = `
      <div class="flx-msg-bubble bot">
        <div class="flx-ai-typing"><span></span><span></span><span></span></div>
      </div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return row;
  }

  async function askAI(message) {
    hideWelcomeCards();
    addUserMessage(message);
    const typing = showTyping();

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: conversationHistory
        })
      });

      if (typing) typing.remove();

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 500 && errorData.hint) {
          addAIMessage('⚠️ AI غير مفعّل. يحتاج إضافة GEMINI_API_KEY في Vercel.');
        } else {
          addAIMessage(`حصل خطأ (${res.status}). حاول مرة ثانية.`);
        }
        return;
      }

      const data = await res.json();
      addAIMessage(data.reply);

      conversationHistory.push({ role: 'user', content: message });
      conversationHistory.push({ role: 'assistant', content: data.reply });
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }
    } catch (err) {
      if (typing) typing.remove();
      addAIMessage(`خطأ في الاتصال: ${err.message}`);
    }
  }

  function hookExistingChatFunctions() {
    let originalSend = null;
    let hooked = false;

    function tryHook() {
      if (hooked) return;
      if (typeof window.flxSendMsg !== 'function') return;
      originalSend = window.flxSendMsg;
      hooked = true;

      window.flxSendMsg = function (...args) {
        let message = args[0];
        if (!message || typeof message !== 'string') {
          // Try to get from textarea
          const ta = document.querySelector('textarea[placeholder*="سؤالك"], textarea[placeholder*="شحنتك"]');
          if (ta) message = ta.value.trim();
        }
        if (!message) return;

        // Clear the textarea
        const ta = document.querySelector('textarea[placeholder*="سؤالك"], textarea[placeholder*="شحنتك"]');
        if (ta) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, '');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (aiEnabled) {
          askAI(message);
        } else if (originalSend) {
          return originalSend.apply(this, args);
        }
      };

      console.log('[FREIGHTLX AI] Hooked flxSendMsg → Gemini AI active');
    }

    setInterval(tryHook, 500);
    tryHook();
  }

  function init() {
    injectStyles();
    hookExistingChatFunctions();
    console.log('[FREIGHTLX AI] Chat integration initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
