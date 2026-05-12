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

      /* ===== Compact service cards ===== */
      .flx-cards-compact {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        padding: 0 12px !important;
        margin: 6px 0 16px !important;
      }
      .flx-cards-compact > * {
        transform: none !important;
        font-size: 12px !important;
        padding: 12px !important;
        border-radius: 12px !important;
        background: linear-gradient(135deg, #fff, #f8fafc) !important;
        border: 1px solid #e2e8f0 !important;
        box-shadow: 0 2px 8px rgba(30, 58, 110, 0.06) !important;
        min-height: auto !important;
        max-height: 110px !important;
        overflow: hidden !important;
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .flx-cards-compact > *:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 18px rgba(30, 58, 110, 0.12) !important;
      }
      /* Scale down children */
      .flx-cards-compact svg,
      .flx-cards-compact img { width: 24px !important; height: 24px !important; }
      .flx-cards-compact h1,
      .flx-cards-compact h2,
      .flx-cards-compact h3,
      .flx-cards-compact h4 {
        font-size: 13px !important;
        margin: 4px 0 !important;
        font-weight: 700 !important;
      }
      .flx-cards-compact p,
      .flx-cards-compact span,
      .flx-cards-compact div {
        font-size: 11px !important;
        line-height: 1.4 !important;
      }
      .flx-cards-compact button {
        font-size: 11px !important;
        padding: 6px 12px !important;
        border-radius: 8px !important;
        margin-top: 4px !important;
      }
      .flx-cards-compact [class*="bg-gradient"],
      .flx-cards-compact [class*="from-"] {
        padding: 6px !important;
        border-radius: 8px !important;
      }
      /* Hide the "الأكثر استخداماً" badge in compact mode */
      .flx-cards-compact [class*="rounded-full"]:first-child {
        font-size: 9px !important;
        padding: 2px 8px !important;
      }
      @media (max-width: 600px) {
        .flx-cards-compact {
          grid-template-columns: 1fr !important;
        }
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
    // Compress (not hide) the welcome content/cards into a compact pill row
    const container = document.getElementById('flx-messages');
    if (!container) return;
    Array.from(container.children).forEach(row => {
      // Don't touch our AI messages
      if (row.classList.contains('flx-ai-user-row') || row.classList.contains('flx-ai-bot-row') || row.classList.contains('flx-ai-typing-row')) {
        return;
      }
      const txt = row.textContent || '';
      // Hide welcome bubble only
      if (txt.includes('وش تحتاج اليوم')) {
        row.style.display = 'none';
        return;
      }
      // Compact the service cards (don't hide)
      if (txt.includes('FULL IMPORT COST') || txt.includes('OCEAN FREIGHT QUOTE') ||
          txt.includes('احصل على عرض سعر') || txt.includes('احسب تكاليف الاستيراد كاملة') ||
          txt.includes('الأكثر استخداماً')) {
        if (!row.dataset.flxCompacted) {
          row.dataset.flxCompacted = '1';
          row.classList.add('flx-cards-compact');
        }
      }
    });
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

  /* ============ VOICE INPUT ============ */
  function setupVoiceInput() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.log('[FREIGHTLX AI] Voice recognition not supported in this browser');
      return;
    }

    function findMicButton() {
      // The chat has a mic icon next to the input. Look for SVG path that looks like a microphone.
      const micButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const svg = btn.querySelector('svg');
        if (!svg) return false;
        const html = btn.outerHTML;
        // Microphone icon usually has a rect/path resembling a mic
        return html.includes('microphone') || html.includes('mic') ||
               (svg.querySelector('path[d*="M12 1"]') || svg.querySelector('rect'));
      });
      // Filter to only those near the chat textarea
      return micButtons.find(b => {
        const ta = document.querySelector('textarea[placeholder*="سؤالك"]');
        return ta && b.closest('div')?.contains(ta) === false &&
               Math.abs(b.getBoundingClientRect().top - ta.getBoundingClientRect().top) < 50;
      });
    }

    function attachVoiceToMic() {
      const ta = document.querySelector('textarea[placeholder*="سؤالك"], textarea[placeholder*="شحنتك"]');
      if (!ta) return;
      // Find any nearby mic-like button (in toolbar near textarea)
      const taParent = ta.closest('div')?.parentElement;
      if (!taParent) return;
      const buttons = taParent.querySelectorAll('button');
      let micBtn = null;
      buttons.forEach(btn => {
        if (btn.dataset.flxVoiceHooked) return;
        const html = btn.innerHTML.toLowerCase();
        if (html.includes('m12 1') || html.includes('microphone') || html.includes('mic')) {
          micBtn = btn;
        }
      });
      if (!micBtn) return;

      micBtn.dataset.flxVoiceHooked = '1';
      micBtn.title = 'انقر للتحدث';
      let recognition = null;
      let isListening = false;

      micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (isListening && recognition) {
          recognition.stop();
          return;
        }

        recognition = new SpeechRec();
        recognition.lang = 'ar-SA';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = () => {
          isListening = true;
          micBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
          micBtn.style.color = '#fff';
          micBtn.style.borderRadius = '50%';
          micBtn.style.animation = 'flxPulse 1.2s infinite';
          // Add pulse keyframe
          if (!document.getElementById('flx-voice-pulse-style')) {
            const s = document.createElement('style');
            s.id = 'flx-voice-pulse-style';
            s.textContent = '@keyframes flxPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.15);}}';
            document.head.appendChild(s);
          }
        };

        recognition.onresult = (event) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, transcript);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        };

        recognition.onerror = (event) => {
          console.error('[FREIGHTLX AI] Voice error:', event.error);
          isListening = false;
          micBtn.style.background = '';
          micBtn.style.color = '';
          micBtn.style.animation = '';
          if (event.error === 'not-allowed') {
            alert('الرجاء السماح باستخدام الميكروفون من إعدادات المتصفح');
          }
        };

        recognition.onend = () => {
          isListening = false;
          micBtn.style.background = '';
          micBtn.style.color = '';
          micBtn.style.animation = '';
        };

        try {
          recognition.start();
        } catch (err) {
          console.error('[FREIGHTLX AI] Voice start error:', err);
        }
      }, true);
    }

    setInterval(attachVoiceToMic, 800);
    attachVoiceToMic();
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
    setupVoiceInput();
    console.log('[FREIGHTLX AI] Chat integration initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
