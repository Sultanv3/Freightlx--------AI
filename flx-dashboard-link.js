/**
 * Hooks every "افتح لوحة التحكم" button on the landing page
 * so it navigates to the standalone dashboard at /dashboard.
 */
(function () {
  'use strict';

  const DASH_URL = '/dashboard';

  function isDashboardTrigger(el) {
    if (!el) return false;
    const txt = (el.textContent || '').trim();
    return /افتح\s*لوحة\s*التحكم|فتح\s*لوحة\s*التحكم|لوحة\s*تحكمي/.test(txt) ||
           el.dataset.flxCustomsAction === 'dashboard' ||
           el.matches('[data-action="dashboard"], [data-goto="dashboard"]');
  }

  // Delegated click - catches static & dynamically-added buttons
  document.addEventListener('click', function (e) {
    const trigger = e.target.closest('button, a, [role="button"]');
    if (!trigger) return;
    if (!isDashboardTrigger(trigger)) return;

    e.preventDefault();
    e.stopPropagation();

    // Show toast first if available (instant feedback)
    if (window.flxToast) window.flxToast('فتح لوحة التحكم...', 'info', 1500);

    // Navigate after a tiny delay so the user sees feedback
    setTimeout(() => { window.location.href = DASH_URL; }, 150);
  }, true);
})();
