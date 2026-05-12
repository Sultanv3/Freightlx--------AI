/**
 * FREIGHTLX Authentication Module
 * Provides login/signup UI and Supabase integration
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pczfivhvnbewovvbquig.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_SrRBuhhazt3ryn_YN2Apow_OqYMEwfP';

  // Inject Supabase SDK from CDN
  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve(window.supabase);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => resolve(window.supabase);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('flx-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-auth-styles';
    style.textContent = `
      .flx-auth-trigger {
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 9998;
        background: linear-gradient(135deg, #1e3a6e, #2d5599);
        color: #fff;
        border: 0;
        padding: 10px 22px;
        border-radius: 999px;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(30, 58, 110, 0.35);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .flx-auth-trigger:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(30, 58, 110, 0.45); }
      .flx-auth-trigger svg { width: 18px; height: 18px; }
      .flx-auth-trigger.flx-logged { background: linear-gradient(135deg, #0ea66f, #15c585); }

      .flx-auth-overlay {
        position: fixed; inset: 0;
        background: rgba(8, 17, 36, 0.6);
        backdrop-filter: blur(6px);
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: flxFadeIn 0.2s ease-out;
      }
      .flx-auth-overlay.flx-open { display: flex; }
      @keyframes flxFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes flxSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

      .flx-auth-modal {
        background: #fff;
        border-radius: 20px;
        max-width: 420px;
        width: 100%;
        padding: 32px;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        direction: rtl;
        text-align: right;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
        animation: flxSlideUp 0.3s ease-out;
        max-height: 90vh;
        overflow-y: auto;
      }
      .flx-auth-header { text-align: center; margin-bottom: 24px; }
      .flx-auth-logo { width: 120px; height: auto; margin: 0 auto 12px; display: block; }
      .flx-auth-title { font-size: 24px; font-weight: 800; color: #1e3a6e; margin: 0 0 8px; }
      .flx-auth-subtitle { font-size: 14px; color: #64748b; margin: 0; }

      .flx-auth-tabs { display: flex; background: #f1f5f9; border-radius: 12px; padding: 4px; margin-bottom: 20px; }
      .flx-auth-tab {
        flex: 1; padding: 10px; border: 0; background: transparent;
        font-family: inherit; font-weight: 600; font-size: 14px;
        color: #64748b; cursor: pointer; border-radius: 8px; transition: all 0.2s;
      }
      .flx-auth-tab.flx-active { background: #fff; color: #1e3a6e; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

      .flx-auth-field { margin-bottom: 14px; }
      .flx-auth-field label {
        display: block; font-size: 13px; font-weight: 600;
        color: #334155; margin-bottom: 6px;
      }
      .flx-auth-field input {
        width: 100%; padding: 12px 14px; border: 1.5px solid #e2e8f0;
        border-radius: 10px; font-family: inherit; font-size: 14px;
        direction: ltr; text-align: right;
        transition: border-color 0.2s;
      }
      .flx-auth-field input:focus {
        outline: none; border-color: #2d5599; box-shadow: 0 0 0 3px rgba(45, 85, 153, 0.1);
      }

      .flx-auth-submit {
        width: 100%; padding: 13px; border: 0; border-radius: 10px;
        background: linear-gradient(135deg, #1e3a6e, #2d5599); color: #fff;
        font-family: inherit; font-weight: 700; font-size: 15px;
        cursor: pointer; transition: transform 0.15s;
        margin-top: 8px;
      }
      .flx-auth-submit:hover { transform: translateY(-1px); }
      .flx-auth-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

      .flx-auth-divider {
        display: flex; align-items: center; gap: 12px; margin: 18px 0;
        color: #94a3b8; font-size: 12px; font-weight: 600;
      }
      .flx-auth-divider::before, .flx-auth-divider::after {
        content: ''; flex: 1; height: 1px; background: #e2e8f0;
      }

      .flx-auth-google {
        width: 100%; padding: 12px; border: 1.5px solid #e2e8f0;
        border-radius: 10px; background: #fff;
        font-family: inherit; font-weight: 600; font-size: 14px;
        color: #334155; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        transition: background 0.2s, border-color 0.2s;
      }
      .flx-auth-google:hover { background: #f8fafc; border-color: #cbd5e1; }
      .flx-auth-google img { width: 18px; height: 18px; }

      .flx-auth-close {
        position: absolute; top: 14px; left: 14px;
        background: rgba(15, 23, 42, 0.05); border: 0;
        width: 32px; height: 32px; border-radius: 50%;
        cursor: pointer; font-size: 18px; color: #64748b;
        display: flex; align-items: center; justify-content: center;
      }
      .flx-auth-close:hover { background: rgba(15, 23, 42, 0.1); }

      .flx-auth-message {
        padding: 10px 14px; border-radius: 8px; font-size: 13px;
        margin-bottom: 12px; display: none;
      }
      .flx-auth-message.flx-err { background: #fef2f2; color: #b91c1c; display: block; }
      .flx-auth-message.flx-ok { background: #f0fdf4; color: #15803d; display: block; }

      .flx-user-menu {
        position: absolute; top: 60px; left: 20px; z-index: 9997;
        background: #fff; border-radius: 14px; padding: 14px;
        min-width: 220px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        font-family: 'Cairo', sans-serif; direction: rtl; display: none;
      }
      .flx-user-menu.flx-open { display: block; }
      .flx-user-info { padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; margin-bottom: 12px; }
      .flx-user-email { font-size: 13px; color: #1e3a6e; font-weight: 700; word-break: break-all; }
      .flx-user-logout {
        width: 100%; padding: 9px; border: 0; border-radius: 8px;
        background: #fee2e2; color: #b91c1c; font-family: inherit;
        font-weight: 700; cursor: pointer; font-size: 13px;
      }
      .flx-user-logout:hover { background: #fecaca; }
    `;
    document.head.appendChild(style);
  }

  // Build modal HTML
  function buildModal() {
    if (document.getElementById('flx-auth-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'flx-auth-overlay';
    overlay.className = 'flx-auth-overlay';
    overlay.innerHTML = `
      <div class="flx-auth-modal">
        <button class="flx-auth-close" aria-label="إغلاق">×</button>
        <div class="flx-auth-header">
          <img class="flx-auth-logo" src="/assets/logo/color-logo.svg" alt="FREIGHTLX">
          <h2 class="flx-auth-title">مرحباً في FREIGHTLX</h2>
          <p class="flx-auth-subtitle">سجل دخولك للوصول إلى لوحة التحكم</p>
        </div>
        <div class="flx-auth-tabs">
          <button class="flx-auth-tab flx-active" data-mode="signin">تسجيل دخول</button>
          <button class="flx-auth-tab" data-mode="signup">حساب جديد</button>
        </div>
        <div class="flx-auth-message" id="flx-auth-msg"></div>
        <form id="flx-auth-form">
          <div class="flx-auth-field flx-signup-only" style="display:none">
            <label>الاسم الكامل</label>
            <input type="text" name="name" placeholder="سلطان الجاسر" autocomplete="name">
          </div>
          <div class="flx-auth-field">
            <label>البريد الإلكتروني</label>
            <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="flx-auth-field">
            <label>كلمة المرور</label>
            <input type="password" name="password" placeholder="٨ أحرف على الأقل" autocomplete="current-password" required minlength="6">
          </div>
          <button type="submit" class="flx-auth-submit" id="flx-auth-submit-btn">تسجيل دخول</button>
        </form>
        <div class="flx-auth-divider">أو</div>
        <button class="flx-auth-google" id="flx-auth-google-btn">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">
          متابعة باستخدام Google
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    // User menu
    const menu = document.createElement('div');
    menu.id = 'flx-user-menu';
    menu.className = 'flx-user-menu';
    menu.innerHTML = `
      <div class="flx-user-info">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">مسجل دخول كـ</div>
        <div class="flx-user-email" id="flx-user-email"></div>
      </div>
      <button class="flx-user-logout" id="flx-user-logout-btn">تسجيل خروج</button>
    `;
    document.body.appendChild(menu);

    // Trigger button
    const trigger = document.createElement('button');
    trigger.id = 'flx-auth-trigger';
    trigger.className = 'flx-auth-trigger';
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span id="flx-auth-trigger-label">تسجيل دخول</span>
    `;
    document.body.appendChild(trigger);
  }

  // Show/hide modal
  function openModal() { document.getElementById('flx-auth-overlay').classList.add('flx-open'); }
  function closeModal() {
    document.getElementById('flx-auth-overlay').classList.remove('flx-open');
    const msg = document.getElementById('flx-auth-msg');
    msg.className = 'flx-auth-message'; msg.textContent = '';
  }
  function showMessage(text, type = 'err') {
    const msg = document.getElementById('flx-auth-msg');
    msg.className = `flx-auth-message flx-${type}`;
    msg.textContent = text;
  }

  // Initialize after Supabase loads
  async function init() {
    injectStyles();
    buildModal();

    const sb = await loadSupabase();
    const client = sb.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.flxSupabase = client;

    let mode = 'signin';

    // Tab switching
    document.querySelectorAll('.flx-auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.flx-auth-tab').forEach(t => t.classList.remove('flx-active'));
        tab.classList.add('flx-active');
        mode = tab.dataset.mode;
        document.querySelectorAll('.flx-signup-only').forEach(el => {
          el.style.display = mode === 'signup' ? 'block' : 'none';
        });
        document.getElementById('flx-auth-submit-btn').textContent =
          mode === 'signup' ? 'إنشاء حساب' : 'تسجيل دخول';
        showMessage('', 'ok'); // clear
        document.getElementById('flx-auth-msg').className = 'flx-auth-message';
      });
    });

    // Trigger button
    document.getElementById('flx-auth-trigger').addEventListener('click', async () => {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        document.getElementById('flx-user-menu').classList.toggle('flx-open');
      } else {
        openModal();
      }
    });

    // Close
    document.querySelector('.flx-auth-close').addEventListener('click', closeModal);
    document.getElementById('flx-auth-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'flx-auth-overlay') closeModal();
    });

    // Form submit
    document.getElementById('flx-auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email');
      const password = fd.get('password');
      const name = fd.get('name');
      const btn = document.getElementById('flx-auth-submit-btn');
      btn.disabled = true; btn.textContent = '...جاري المعالجة';
      try {
        if (mode === 'signup') {
          const { data, error } = await client.auth.signUp({
            email, password,
            options: { data: { full_name: name || '' } }
          });
          if (error) throw error;
          // Email confirmation is disabled, so user is logged in immediately
          if (data?.session) {
            showMessage('تم إنشاء الحساب وتسجيل دخولك بنجاح!', 'ok');
            setTimeout(closeModal, 800);
          } else {
            // Try to sign in automatically
            try {
              const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
              if (!signInErr) {
                showMessage('تم إنشاء الحساب وتسجيل دخولك!', 'ok');
                setTimeout(closeModal, 800);
              } else {
                showMessage('تم إنشاء الحساب! سجل دخولك الآن.', 'ok');
              }
            } catch {
              showMessage('تم إنشاء الحساب! سجل دخولك الآن.', 'ok');
            }
          }
        } else {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          showMessage('تم تسجيل الدخول بنجاح!', 'ok');
          setTimeout(closeModal, 800);
        }
      } catch (err) {
        showMessage(translateError(err.message), 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = mode === 'signup' ? 'إنشاء حساب' : 'تسجيل دخول';
      }
    });

    // Google
    document.getElementById('flx-auth-google-btn').addEventListener('click', async () => {
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
      } catch (err) {
        showMessage('خطأ في تسجيل دخول Google: ' + err.message, 'err');
      }
    });

    // Logout
    document.getElementById('flx-user-logout-btn').addEventListener('click', async () => {
      await client.auth.signOut();
      document.getElementById('flx-user-menu').classList.remove('flx-open');
      updateUI(null);
    });

    // Auth state changes
    client.auth.onAuthStateChange((event, session) => {
      updateUI(session?.user || null);
    });
    const { data: { user } } = await client.auth.getUser();
    updateUI(user);
  }

  function updateUI(user) {
    const trigger = document.getElementById('flx-auth-trigger');
    const label = document.getElementById('flx-auth-trigger-label');
    const emailEl = document.getElementById('flx-user-email');
    if (user) {
      trigger.classList.add('flx-logged');
      const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'حسابك';
      label.textContent = displayName.length > 14 ? displayName.slice(0, 14) + '...' : displayName;
      emailEl.textContent = user.email || '';
    } else {
      trigger.classList.remove('flx-logged');
      label.textContent = 'تسجيل دخول';
      document.getElementById('flx-user-menu').classList.remove('flx-open');
    }
  }

  function translateError(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'البريد أو كلمة المرور غير صحيحة';
    if (m.includes('user already registered')) return 'هذا البريد مسجل بالفعل';
    if (m.includes('password should be at least')) return 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)';
    if (m.includes('invalid email')) return 'البريد الإلكتروني غير صحيح';
    if (m.includes('email not confirmed')) return 'الرجاء تأكيد البريد أولاً من رسالة التأكيد';
    return msg;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
