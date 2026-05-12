/**
 * FREIGHTLX Dashboard Customizations
 * - Simplify dashboard (remove Execution Hub & Quick Actions)
 * - Add document upload feature
 */
(function () {
  'use strict';

  /* ============ SIMPLIFICATION ============ */
  function injectSimplificationStyles() {
    if (document.getElementById('flx-dashboard-simplify-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-dashboard-simplify-styles';
    style.textContent = `
      /* Hide the entire Execution Hub section */
      .flx-dashboard-execution { display: none !important; }
      /* Hide the alerts/metrics workbench panel that contains Quick Actions */
      .flx-dashboard-workbench .col-span-4.space-y-4 > div[class*="from-navy-deep"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function hideQuickActionsCard() {
    document.querySelectorAll('div').forEach(el => {
      const txt = el.textContent || '';
      if (txt.trim().startsWith('إجراءات سريعة') && txt.length < 700) {
        // Hide this element directly - it's the panel container
        el.style.display = 'none';
      }
    });
  }

  /* ============ DOCUMENT UPLOAD ============ */
  const SUPABASE_URL = 'https://pczfivhvnbewovvbquig.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_SrRBuhhazt3ryn_YN2Apow_OqYMEwfP';

  function injectDocsStyles() {
    if (document.getElementById('flx-docs-styles')) return;
    const style = document.createElement('style');
    style.id = 'flx-docs-styles';
    style.textContent = `
      .flx-docs-trigger {
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9996;
        background: linear-gradient(135deg, #15803d, #16a34a);
        color: #fff;
        border: 0;
        padding: 13px 22px;
        border-radius: 999px;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 10px 28px rgba(22, 163, 74, 0.35);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s;
      }
      .flx-docs-trigger:hover { transform: translateY(-2px); }
      .flx-docs-trigger svg { width: 18px; height: 18px; }

      .flx-docs-overlay {
        position: fixed; inset: 0;
        background: rgba(8, 17, 36, 0.6);
        backdrop-filter: blur(6px);
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .flx-docs-overlay.flx-open { display: flex; }

      .flx-docs-modal {
        background: #fff;
        border-radius: 20px;
        max-width: 540px;
        width: 100%;
        padding: 28px;
        font-family: 'Cairo', 'Tajawal', sans-serif;
        direction: rtl;
        max-height: 90vh;
        overflow-y: auto;
        position: relative;
      }
      .flx-docs-modal h2 {
        color: #1e3a6e;
        font-size: 22px;
        font-weight: 800;
        margin: 0 0 6px;
      }
      .flx-docs-modal p.flx-sub {
        color: #64748b;
        font-size: 14px;
        margin: 0 0 18px;
      }
      .flx-docs-close {
        position: absolute; top: 12px; left: 12px;
        background: rgba(15, 23, 42, 0.05); border: 0;
        width: 32px; height: 32px; border-radius: 50%;
        cursor: pointer; font-size: 18px; color: #64748b;
        display: flex; align-items: center; justify-content: center;
      }

      .flx-docs-section { margin-bottom: 18px; }
      .flx-docs-section label {
        display: block;
        font-weight: 700;
        font-size: 14px;
        color: #1e3a6e;
        margin-bottom: 8px;
      }
      .flx-docs-section select, .flx-docs-section input[type="text"] {
        width: 100%;
        padding: 11px 14px;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        font-family: inherit;
        font-size: 14px;
        background: #fff;
      }

      .flx-docs-dropzone {
        border: 2px dashed #cbd5e1;
        border-radius: 14px;
        padding: 30px 20px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        background: #f8fafc;
      }
      .flx-docs-dropzone:hover, .flx-docs-dropzone.flx-drag {
        border-color: #2d5599;
        background: #eff6ff;
      }
      .flx-docs-dropzone .flx-icon {
        font-size: 36px;
        margin-bottom: 6px;
      }
      .flx-docs-dropzone .flx-hint {
        font-size: 13px;
        color: #64748b;
        margin-top: 4px;
      }
      .flx-docs-dropzone .flx-main {
        font-size: 15px;
        font-weight: 700;
        color: #1e3a6e;
      }
      .flx-docs-fileinput { display: none; }

      .flx-docs-list { margin-top: 14px; }
      .flx-docs-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        margin-bottom: 8px;
        font-size: 13px;
      }
      .flx-docs-item .flx-name { flex: 1; color: #1e3a6e; font-weight: 600; word-break: break-all; }
      .flx-docs-item .flx-size { color: #94a3b8; font-size: 11px; }
      .flx-docs-item .flx-remove {
        background: #fee2e2; border: 0; color: #b91c1c;
        width: 26px; height: 26px; border-radius: 50%;
        cursor: pointer; font-size: 14px;
      }
      .flx-docs-progress { display: none; margin-top: 12px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
      .flx-docs-progress .flx-bar { height: 100%; background: linear-gradient(90deg, #15803d, #16a34a); width: 0; transition: width 0.3s; }
      .flx-docs-submit {
        width: 100%; padding: 13px; border: 0; border-radius: 10px;
        background: linear-gradient(135deg, #1e3a6e, #2d5599); color: #fff;
        font-family: inherit; font-weight: 700; font-size: 15px;
        cursor: pointer; margin-top: 8px;
      }
      .flx-docs-submit:disabled { opacity: 0.6; cursor: not-allowed; }

      .flx-docs-msg {
        padding: 10px 14px; border-radius: 8px; font-size: 13px;
        margin-bottom: 12px; display: none;
      }
      .flx-docs-msg.flx-err { background: #fef2f2; color: #b91c1c; display: block; }
      .flx-docs-msg.flx-ok { background: #f0fdf4; color: #15803d; display: block; }
    `;
    document.head.appendChild(style);
  }

  function buildDocsUI() {
    if (document.getElementById('flx-docs-trigger')) return;

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'flx-docs-trigger';
    btn.className = 'flx-docs-trigger';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
      رفع وثائق
    `;
    document.body.appendChild(btn);

    // Modal
    const overlay = document.createElement('div');
    overlay.id = 'flx-docs-overlay';
    overlay.className = 'flx-docs-overlay';
    overlay.innerHTML = `
      <div class="flx-docs-modal">
        <button class="flx-docs-close" aria-label="إغلاق">×</button>
        <h2>رفع الوثائق</h2>
        <p class="flx-sub">ارفع إيصال التحويل، وثائق الاستيراد، أو صور المنتج</p>
        <div class="flx-docs-msg" id="flx-docs-msg"></div>

        <div class="flx-docs-section">
          <label>نوع الوثيقة</label>
          <select id="flx-docs-type">
            <option value="payment_receipt">إيصال تحويل بنكي</option>
            <option value="invoice">فاتورة تجارية</option>
            <option value="bill_of_lading">بوليصة شحن (B/L)</option>
            <option value="origin_certificate">شهادة منشأ</option>
            <option value="packing_list">قائمة التعبئة</option>
            <option value="product_photos">صور المنتج</option>
            <option value="import_license">رخصة استيراد</option>
            <option value="industry_id">تعريف صناعي</option>
            <option value="other">أخرى</option>
          </select>
        </div>

        <div class="flx-docs-section">
          <label>رقم الشحنة (اختياري)</label>
          <input type="text" id="flx-docs-shipment" placeholder="FLX-B-2026-7841">
        </div>

        <div class="flx-docs-section">
          <label>الملفات</label>
          <div class="flx-docs-dropzone" id="flx-docs-dropzone">
            <div class="flx-icon">📎</div>
            <div class="flx-main">اسحب الملفات هنا أو انقر للاختيار</div>
            <div class="flx-hint">PDF, JPG, PNG, DOC - حتى 10 ميغابايت</div>
            <input type="file" id="flx-docs-fileinput" class="flx-docs-fileinput" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx">
          </div>
          <div class="flx-docs-list" id="flx-docs-list"></div>
        </div>

        <div class="flx-docs-progress" id="flx-docs-progress"><div class="flx-bar" id="flx-docs-bar"></div></div>
        <button class="flx-docs-submit" id="flx-docs-submit-btn">رفع الوثائق</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Wire up events
    const fileInput = document.getElementById('flx-docs-fileinput');
    const dropzone = document.getElementById('flx-docs-dropzone');
    const list = document.getElementById('flx-docs-list');
    const submitBtn = document.getElementById('flx-docs-submit-btn');
    const progressBar = document.getElementById('flx-docs-progress');
    const bar = document.getElementById('flx-docs-bar');
    const msg = document.getElementById('flx-docs-msg');
    let files = [];

    function showMsg(text, type = 'err') {
      msg.className = `flx-docs-msg flx-${type}`;
      msg.textContent = text;
    }
    function clearMsg() {
      msg.className = 'flx-docs-msg'; msg.textContent = '';
    }

    function renderList() {
      list.innerHTML = files.map((f, i) => `
        <div class="flx-docs-item">
          <div class="flx-name">${f.name}</div>
          <div class="flx-size">${(f.size / 1024).toFixed(0)} KB</div>
          <button class="flx-remove" data-i="${i}" aria-label="حذف">×</button>
        </div>
      `).join('');
      list.querySelectorAll('.flx-remove').forEach(b => {
        b.addEventListener('click', () => {
          files.splice(parseInt(b.dataset.i), 1);
          renderList();
        });
      });
    }

    function addFiles(newFiles) {
      Array.from(newFiles).forEach(f => {
        if (f.size > 10 * 1024 * 1024) {
          showMsg(`الملف "${f.name}" أكبر من 10 ميغابايت`, 'err');
          return;
        }
        files.push(f);
      });
      renderList();
    }

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => addFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(evt =>
      dropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('flx-drag'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      dropzone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('flx-drag'); })
    );
    dropzone.addEventListener('drop', e => addFiles(e.dataTransfer.files));

    overlay.querySelector('.flx-docs-close').addEventListener('click', () => {
      overlay.classList.remove('flx-open');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'flx-docs-overlay') overlay.classList.remove('flx-open');
    });

    btn.addEventListener('click', () => {
      clearMsg();
      overlay.classList.add('flx-open');
    });

    submitBtn.addEventListener('click', async () => {
      if (!files.length) {
        showMsg('الرجاء اختيار ملف واحد على الأقل', 'err');
        return;
      }
      // Check if user is signed in
      const client = window.flxSupabase;
      if (!client) {
        showMsg('الرجاء الانتظار حتى يحمّل النظام', 'err');
        return;
      }
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        showMsg('الرجاء تسجيل الدخول أولاً لرفع الوثائق', 'err');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الرفع...';
      progressBar.style.display = 'block';
      const docType = document.getElementById('flx-docs-type').value;
      const shipment = document.getElementById('flx-docs-shipment').value.trim() || 'general';

      let uploadedCount = 0;
      let errors = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/${shipment}/${docType}/${Date.now()}_${safeName}`;
        try {
          const { error } = await client.storage.from('user-documents').upload(path, f, {
            cacheControl: '3600',
            upsert: false
          });
          if (error) throw error;
          uploadedCount++;
        } catch (err) {
          console.error('Upload error:', err);
          errors++;
        }
        bar.style.width = `${((i + 1) / files.length) * 100}%`;
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'رفع الوثائق';
      if (errors === 0) {
        showMsg(`تم رفع ${uploadedCount} ملف بنجاح ✓`, 'ok');
        files = [];
        renderList();
        document.getElementById('flx-docs-shipment').value = '';
        setTimeout(() => {
          overlay.classList.remove('flx-open');
          progressBar.style.display = 'none';
          bar.style.width = '0';
          clearMsg();
        }, 1500);
      } else {
        showMsg(`رُفع ${uploadedCount}/${files.length}. ${errors > 0 ? 'تحقق من تسجيل الدخول وحاول مرة أخرى.' : ''}`, 'err');
      }
    });
  }

  /* ============ INIT ============ */
  function init() {
    injectSimplificationStyles();
    injectDocsStyles();
    buildDocsUI();
    // Try multiple times in case React re-renders
    let attempts = 0;
    const interval = setInterval(() => {
      hideQuickActionsCard();
      attempts++;
      if (attempts > 20) clearInterval(interval);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
