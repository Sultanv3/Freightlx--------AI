/**
 * FREIGHTLX UI/UX Enhancements
 * ─────────────────────────────────────────────
 *  1. Toast notifications (نظام تنبيهات منبثقة)
 *  2. Skeleton loaders (تحميل أنيق للمحتوى)
 *  3. Scroll-to-top button
 *  4. Smooth fade-in animations عند ظهور العناصر
 *  5. Ripple effect على الأزرار
 *  6. Mobile bottom-sheet للـ chatbot
 *  7. Keyboard shortcuts (Cmd+K, Esc، إلخ)
 *  8. Smart back-button behavior
 *  9. Network status indicator
 * 10. Page load progress bar
 */

(function () {
  'use strict';

  if (window.flxUIEnhancementsLoaded) return;
  window.flxUIEnhancementsLoaded = true;

  // ════════════════════════════════════════════════════════
  // 1. TOAST NOTIFICATIONS SYSTEM
  // ════════════════════════════════════════════════════════
  function ensureToastContainer() {
    let c = document.getElementById('flx-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'flx-toast-container';
      c.className = 'flx-toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  window.flxToast = function (message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = 'flx-toast flx-toast-' + type;

    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    toast.innerHTML = `
      <div class="flx-toast-icon">${icons[type] || icons.info}</div>
      <div class="flx-toast-text">${message}</div>
      <button class="flx-toast-close" aria-label="إغلاق">×</button>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('flx-toast-show'));

    const closeToast = () => {
      toast.classList.remove('flx-toast-show');
      toast.classList.add('flx-toast-hide');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.flx-toast-close').onclick = closeToast;
    setTimeout(closeToast, duration);
    return toast;
  };

  // ════════════════════════════════════════════════════════
  // 2. SKELETON LOADERS
  // ════════════════════════════════════════════════════════
  window.flxSkeleton = {
    quoteCard() {
      return `
        <div class="flx-skeleton-card">
          <div class="flx-skeleton-row">
            <div class="flx-skeleton flx-skeleton-circle"></div>
            <div class="flx-skeleton flx-skeleton-line" style="width:60%"></div>
          </div>
          <div class="flx-skeleton flx-skeleton-line" style="width:80%"></div>
          <div class="flx-skeleton flx-skeleton-line" style="width:40%"></div>
          <div class="flx-skeleton flx-skeleton-line flx-skeleton-button"></div>
        </div>
      `;
    },
    portRow() {
      return `
        <div class="flx-skeleton-port">
          <div class="flx-skeleton flx-skeleton-circle" style="width:28px;height:28px"></div>
          <div style="flex:1">
            <div class="flx-skeleton flx-skeleton-line" style="width:70%"></div>
            <div class="flx-skeleton flx-skeleton-line" style="width:40%;margin-top:6px"></div>
          </div>
        </div>
      `;
    },
    chatMessage() {
      return `
        <div class="flx-skeleton-msg">
          <div class="flx-skeleton flx-skeleton-circle"></div>
          <div class="flx-skeleton-msg-body">
            <div class="flx-skeleton flx-skeleton-line"></div>
            <div class="flx-skeleton flx-skeleton-line" style="width:75%"></div>
          </div>
        </div>
      `;
    }
  };

  // ════════════════════════════════════════════════════════
  // 3. SCROLL-TO-TOP BUTTON
  // ════════════════════════════════════════════════════════
  function setupScrollToTop() {
    if (document.getElementById('flx-scroll-top')) return;

    const btn = document.createElement('button');
    btn.id = 'flx-scroll-top';
    btn.className = 'flx-scroll-top';
    btn.setAttribute('aria-label', 'الذهاب للأعلى');
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          btn.classList.toggle('flx-show', window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ════════════════════════════════════════════════════════
  // 4. FADE-IN ON SCROLL (IntersectionObserver)
  // ════════════════════════════════════════════════════════
  function setupFadeInOnScroll() {
    if (!('IntersectionObserver' in window)) return;
    // Skip on dashboard page - it has its own animations
    if (document.querySelector('.dash-layout')) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('flx-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    function markObservable(root) {
      const candidates = (root || document).querySelectorAll(
        '.flx-service-card, .flx-quote-card, .flx-port-row, [data-flx-fade]'
      );
      candidates.forEach((el) => {
        if (!el.classList.contains('flx-fade-init')) {
          el.classList.add('flx-fade-init');
          observer.observe(el);
        }
      });
    }

    markObservable();
    // Throttle MutationObserver — only watch direct children, not entire subtree
    let pending = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        markObservable();
      });
    });
    mo.observe(document.body, { childList: true, subtree: false });
  }

  // ════════════════════════════════════════════════════════
  // 5. RIPPLE EFFECT ON BUTTONS
  // ════════════════════════════════════════════════════════
  function setupRippleEffect() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, .flx-card-cta, .flx-confirm-service-btn, [data-flx-ripple]');
      if (!target) return;
      if (target.dataset.flxNoRipple !== undefined) return;

      const rect = target.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height) * 1.5;

      ripple.className = 'flx-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top  = (e.clientY - rect.top  - size / 2) + 'px';

      const cs = getComputedStyle(target);
      if (cs.position === 'static') target.style.position = 'relative';
      target.style.overflow = 'hidden';
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // ════════════════════════════════════════════════════════
  // 6. NETWORK STATUS INDICATOR
  // ════════════════════════════════════════════════════════
  function setupNetworkStatus() {
    function showOffline() {
      window.flxToast('انقطع الاتصال بالإنترنت', 'error', 5000);
    }
    function showOnline() {
      window.flxToast('عاد الاتصال!', 'success', 2500);
    }
    window.addEventListener('offline', showOffline);
    window.addEventListener('online', showOnline);
  }

  // ════════════════════════════════════════════════════════
  // 7. PAGE LOAD PROGRESS BAR
  // ════════════════════════════════════════════════════════
  function setupLoadingBar() {
    const bar = document.createElement('div');
    bar.id = 'flx-load-bar';
    bar.className = 'flx-load-bar';
    document.body.appendChild(bar);

    let progress = 0;
    let timer = null;

    window.flxLoadingBar = {
      start() {
        progress = 0;
        bar.style.opacity = '1';
        bar.style.width = '0%';
        clearInterval(timer);
        timer = setInterval(() => {
          progress = Math.min(progress + Math.random() * 8, 92);
          bar.style.width = progress + '%';
        }, 200);
      },
      finish() {
        clearInterval(timer);
        bar.style.width = '100%';
        setTimeout(() => {
          bar.style.opacity = '0';
          setTimeout(() => { bar.style.width = '0%'; }, 300);
        }, 200);
      }
    };

    // Auto-hook fetch
    const _fetch = window.fetch;
    let activeRequests = 0;
    window.fetch = function () {
      if (activeRequests === 0) window.flxLoadingBar.start();
      activeRequests++;
      const onDone = () => {
        activeRequests = Math.max(0, activeRequests - 1);
        if (activeRequests === 0) window.flxLoadingBar.finish();
      };
      return _fetch.apply(this, arguments).then(
        (r) => { onDone(); return r; },
        (e) => { onDone(); throw e; }
      );
    };
  }

  // ════════════════════════════════════════════════════════
  // 8. KEYBOARD SHORTCUTS
  // ════════════════════════════════════════════════════════
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K → فتح الـ chatbot
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const heroCta = document.getElementById('flx-hero-cta');
        if (heroCta) heroCta.click();
        else window.flxToast('الـ chatbot غير متاح هنا', 'info');
      }

      // Esc → إغلاق المودال المفتوح
      if (e.key === 'Escape') {
        const closeBtn = document.querySelector('.flx-modal-close, [data-flx-modal-close]');
        if (closeBtn) closeBtn.click();
      }

      // / → التركيز على حقل البحث/الإدخال
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        const input = document.querySelector('#flx-chat-input, [data-flx-focus]');
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // 9. SMOOTH HOVER LIFT FOR CARDS
  // ════════════════════════════════════════════════════════
  function setupCardHover() {
    // Skip entirely on dashboard / mobile / pages without service cards
    if (document.querySelector('.dash-layout')) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const cards = document.querySelectorAll('.flx-service-card');
    if (cards.length === 0) return;

    cards.forEach((card) => {
      if (card.dataset.flxHoverInit) return;
      card.dataset.flxHoverInit = '1';

      let raf = null;
      card.addEventListener('mousemove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const rect = card.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 4;
          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 4;
          card.style.transform = `translateY(-4px) rotateX(${-y}deg) rotateY(${x}deg)`;
        });
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
    // No MutationObserver — initial cards are enough; new cards are rare
  }

  // ════════════════════════════════════════════════════════
  // 10. BETTER FOCUS STYLES + ACCESSIBILITY
  // ════════════════════════════════════════════════════════
  function setupAccessibility() {
    let usingMouse = true;
    document.addEventListener('mousedown', () => {
      usingMouse = true;
      document.body.classList.remove('flx-keyboard-nav');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        usingMouse = false;
        document.body.classList.add('flx-keyboard-nav');
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════
  function init() {
    setupScrollToTop();
    setupFadeInOnScroll();
    setupRippleEffect();
    setupNetworkStatus();
    setupLoadingBar();
    setupKeyboardShortcuts();
    setupCardHover();
    setupAccessibility();

    // Welcome toast - show ONCE per browser session, never on dashboard
    if (!document.querySelector('.dash-layout') && !sessionStorage.getItem('flx-welcome-shown')) {
      sessionStorage.setItem('flx-welcome-shown', '1');
      setTimeout(() => {
        if (window.flxToast) {
          window.flxToast('💡 جرّب Cmd+K لفتح الـ chatbot بسرعة', 'info', 4000);
        }
      }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
