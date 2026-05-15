/**
 * FREIGHTLX AI Operating Engineer — Agent endpoint (v1.0)
 *
 * From "chatbot" to "agent that executes services."
 * Uses Gemini Function Calling to call real internal tools:
 *   - search_freight_rates  → /api/v1/rates/search
 *   - calculate_customs     → KSA tariff calculator (internal)
 *   - request_saber         → SABER application starter
 *   - get_my_shipments      → /api/v1/shipments
 *   - track_shipment        → /api/v1/shipments/{id}/tracking
 *   - book_shipment         → /api/v1/quotes/{id}/book
 *   - calculate_full_import_cost → CIF + customs + VAT + clearance
 *   - get_invoice           → /api/v1/invoices/{id}/data
 *
 * Each tool call is logged and returned to the UI so the user sees
 * what the agent is actually doing (not just talking).
 */

export const config = { runtime: 'nodejs', maxDuration: 60 };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

// Internal base URL — same Vercel deployment
function internalBase(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'freightlx-ai.vercel.app';
  return `${proto}://${host}`;
}

// ─── KSA market intelligence (internal, no external API) ─────────────────
const KSA_CUSTOMS_DUTIES = {
  electronics: 0.05, textiles: 0.12, machinery: 0.05, automotive: 0.05,
  food: 0.05, cosmetics: 0.05, furniture: 0.15, toys: 0.10,
  industrial: 0.05, chemicals: 0.05, default: 0.05,
};
const KSA_VAT = 0.15;
const SABER_FEES = { simple: 250, standard: 450, complex: 800 };
const SASO_CONFORMITY_FEES = { iecee: 1200, gso: 950 };
const CLEARANCE_FEES = { starter: 750, professional: 1850, enterprise: 4500 };

function classifyProduct(category) {
  const c = (category || '').toLowerCase();
  if (/electron|phone|laptop|computer|إلكترون/.test(c)) return 'electronics';
  if (/textile|cloth|fabric|نسيج|قماش/.test(c)) return 'textiles';
  if (/machin|equipment|آلة|معدات/.test(c)) return 'machinery';
  if (/auto|car|سيار/.test(c)) return 'automotive';
  if (/food|طعام|أغذية/.test(c)) return 'food';
  if (/cosmetic|beauty|تجميل/.test(c)) return 'cosmetics';
  if (/furniture|أثاث/.test(c)) return 'furniture';
  if (/toy|لعبة|ألعاب/.test(c)) return 'toys';
  if (/chemic|كيميا/.test(c)) return 'chemicals';
  if (/industrial|صناع/.test(c)) return 'industrial';
  return 'default';
}

// ─── Tool definitions for Gemini function calling ────────────────────────
const TOOLS = [
  {
    name: 'search_freight_rates',
    description: 'يبحث عن أسعار شحن live من ١٢ خط ملاحي عالمي للمسار المطلوب. يأخذ ٣٠-٦٠ ثانية. استخدمه عندما يسأل المستخدم عن أسعار أو يريد حجز شحنة.',
    parameters: {
      type: 'object',
      properties: {
        origin_port: { type: 'string', description: 'كود ميناء التحميل، مثلاً CNSHA لشنغهاي أو INNSA لـ Nhava Sheva' },
        destination_port: { type: 'string', description: 'كود ميناء التفريغ، مثلاً SAJED لجدة أو SADMM للدمام' },
        container_type: { type: 'string', enum: ['20GP', '40GP', '40HC'], description: 'نوع الحاوية' },
        weight_kg: { type: 'number', description: 'وزن الشحنة بالكيلوغرام' },
      },
      required: ['origin_port', 'destination_port'],
    },
  },
  {
    name: 'calculate_customs_clearance',
    description: 'يحسب رسوم التخليص الجمركي + ضريبة القيمة المضافة 15% للسوق السعودي. استخدمه عند سؤال المستخدم عن تكاليف الجمارك.',
    parameters: {
      type: 'object',
      properties: {
        product_value_usd: { type: 'number', description: 'قيمة البضاعة بالدولار (CIF value)' },
        product_category: { type: 'string', description: 'فئة المنتج: إلكترونيات، ملابس، آلات، أغذية، تجميل، أثاث، ألعاب، إلخ' },
        package_tier: { type: 'string', enum: ['starter', 'professional', 'enterprise'], description: 'مستوى باقة التخليص' },
      },
      required: ['product_value_usd', 'product_category'],
    },
  },
  {
    name: 'request_saber_certificate',
    description: 'يبدأ طلب شهادة سابر (SABER) لمنتج جديد. شهادة سابر إلزامية لكل المنتجات المستوردة للسعودية.',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'اسم المنتج بالعربية أو الإنجليزية' },
        hs_code: { type: 'string', description: 'رمز التعرفة الجمركية إن وجد' },
        complexity: { type: 'string', enum: ['simple', 'standard', 'complex'], description: 'مستوى تعقيد المنتج' },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'calculate_full_import_cost',
    description: 'يحسب التكلفة الكاملة لاستيراد بضاعة: CIF + جمارك + ضريبة + رسوم تخليص + سابر. استخدمه عند سؤال المستخدم عن التكلفة الإجمالية.',
    parameters: {
      type: 'object',
      properties: {
        product_value_usd: { type: 'number', description: 'قيمة البضاعة FOB' },
        product_category: { type: 'string', description: 'فئة المنتج' },
        freight_usd: { type: 'number', description: 'تكلفة الشحن بالدولار' },
        insurance_usd: { type: 'number', description: 'تكلفة التأمين (افتراضياً 1% من القيمة)' },
        package_tier: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
      },
      required: ['product_value_usd', 'product_category', 'freight_usd'],
    },
  },
  {
    name: 'get_my_shipments',
    description: 'يجلب قائمة الشحنات للمستخدم الحالي. استخدمه عند سؤاله "وين شحناتي" أو "اعرض شحناتي".',
    parameters: {
      type: 'object',
      properties: {
        status_filter: { type: 'string', enum: ['pending', 'active', 'transit', 'delivered', 'cancelled'], description: 'فلتر اختياري حسب الحالة' },
      },
    },
  },
  {
    name: 'track_shipment',
    description: 'يتتبع حالة شحنة محددة بالكامل بأحداث التحديث.',
    parameters: {
      type: 'object',
      properties: {
        shipment_id: { type: 'string', description: 'رقم الشحنة' },
      },
      required: ['shipment_id'],
    },
  },
  {
    name: 'subscribe_package',
    description: 'يفعّل باقة خدمات (starter/professional/enterprise) للمستخدم.',
    parameters: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
      },
      required: ['tier'],
    },
  },
  {
    name: 'get_invoices',
    description: 'يجلب فواتير المستخدم.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
      },
    },
  },
];

// Format tools for Gemini API
function geminiTools() {
  return [{
    functionDeclarations: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}

const SYSTEM_PROMPT = `أنت **FREIGHTLX AI** — المهندس التشغيلي الذكي لمنصة FREIGHTLX، خبير لوجستي سعودي متخصص في الشحن الدولي والاستيراد للسوق السعودي.

# دورك
أنت لست chatbot. أنت AGENT حقيقي ينفذ خدمات فعلية عبر tools مرتبطة بنظام FREIGHTLX. تفهم، تخطّط، تنفّذ، تلخّص.

# منهجية العمل
1. **افهم النية** — اقرأ بين السطور. السعودي قد يقول "أبي أجيب من الصين" بدل "استيراد من الصين".
2. **حدد البيانات الناقصة** — لا تخمّن. اطلبها بسؤال واحد مختصر.
3. **خطط tools** — قسّم الطلب إلى خطوات منطقية. استخدم أكثر من tool عند الحاجة.
4. **نفّذ** — استدعِ الـ tools بترتيب. لا تتوقف عند الأول إذا كان الطلب متعدد.
5. **لخّص** — مختصراً، نقاطاً، بالعربية الفصحى، أرقام بالإنجليزية، بدون إطالة.

# ════════════════════════════════════════════════════════════
# المعرفة التشغيلية للسوق السعودي
# ════════════════════════════════════════════════════════════

## 🇸🇦 الموانئ السعودية الرئيسية

| الميناء | الكود | المنطقة | التخصص | السعة |
|---|---|---|---|---|
| ميناء جدة الإسلامي | SAJED | جدة (غرب) | حاويات + ركاب + بضائع عامة | الأكبر — 7M TEU/سنة |
| ميناء الملك عبدالله | SAKAC | KAEC شمال جدة | حاويات + ترانزيت | 5.5M TEU |
| ميناء الملك عبدالعزيز | SADMM | الدمام (شرق) | حاويات + بترول | 5M TEU |
| ميناء الجبيل | SAJUB | الجبيل (شرق) | بتروكيماويات + معادن | 1.7M TEU |
| ميناء ينبع | SAYNB | ينبع (غرب) | بترول + بضائع عامة | 1.5M TEU |
| ميناء جازان | SAJEN | جازان (جنوب) | معادن + غاز | 0.7M TEU |
| ميناء ضباء | SADUB | تبوك (شمال غرب — نيوم) | جديد، استراتيجي | 0.5M TEU |

## 🌍 الموانئ العالمية الأكثر استيراداً للسعودية

**الصين**: شنغهاي (CNSHA) · شنزن/يانتيان (CNYTN) · نينغبو (CNNGB) · جوانجو (CNGZG) · شيامن (CNXMN)
**الإمارات**: جبل علي دبي (AEJEA) · ميناء خليفة (AEKHL)
**الهند**: نهافا شيفا (INNSA) · موندرا (INMUN) · شيناي (INMAA)
**تركيا**: إسطنبول (TRIST) · مرسين (TRMER)
**أوروبا**: روتردام (NLRTM) · هامبورغ (DEHAM) · أنتويرب (BEANR)
**شرق آسيا**: بوسان كوريا (KRPUS) · يوكوهاما (JPYOK) · هو شي مينه (VNSGN)
**أمريكا**: لوس أنجلوس (USLAX) · نيويورك (USNYC) · هيوستن (USHOU)

## 🚢 الـ 12 خط ملاحي وخصائصها

| الخط | الجنسية | تخصصها | السعودية |
|---|---|---|---|
| **Maersk** | 🇩🇰 الدنمارك | الأكبر عالمياً، شامل | جدة + الدمام + الجبيل |
| **MSC** | 🇨🇭 سويسرا/إيطاليا | منافس Maersk، أسعار جيدة | جدة + الدمام |
| **COSCO** | 🇨🇳 الصين | الأقوى من الصين | جدة + الدمام |
| **CMA CGM** | 🇫🇷 فرنسا | الثالث عالمياً، شامل | جدة + الدمام |
| **Hapag-Lloyd** | 🇩🇪 ألمانيا | أوروبا + شرق أوسط | جدة |
| **ONE** | 🇯🇵 اليابان | شرق آسيا قوي | جدة + الدمام |
| **Evergreen** | 🇹🇼 تايوان | شرق آسيا + ترانس باسيفيك | جدة |
| **HMM** | 🇰🇷 كوريا | كوريا + شرق آسيا | جدة |
| **OOCL** | 🇭🇰 (COSCO) | شرق آسيا فاخر | جدة |
| **APL** | 🇸🇬 (CMA CGM) | جنوب شرق آسيا | جدة |
| **ANL** | 🇦🇺 (CMA CGM) | أستراليا + باسيفيك | جدة |
| **CNC** | 🇹🇼 (CMA CGM) | الصين + جنوب شرق آسيا | جدة |

## 📦 أنواع الحاويات

- **20GP** (20ft General Purpose): 33m³ · 28T حمولة
- **40GP** (40ft General Purpose): 67m³ · 28T حمولة
- **40HC** (40ft High Cube): 76m³ · 28T حمولة — **الأكثر استخداماً**
- **20RF/40RF** (Reefer): مبرّدة للأغذية والأدوية
- **45HC**: أكبر للأحجام الكبيرة
- **LCL**: شحنات صغيرة (Less than Container Load) — مشتركة في الحاوية

## 💰 الرسوم الجمركية السعودية حسب الفئة

| الفئة | HS Codes | نسبة الجمارك |
|---|---|---|
| إلكترونيات وأجهزة كهربائية | 84-85 | **5%** |
| ملابس وأحذية | 61-64 | **12%** |
| أثاث | 94 | **15%** |
| ألعاب وهدايا | 95 | **10%** |
| سيارات وقطع غيار | 87 | **5-25%** (حسب النوع) |
| أغذية معالجة | 16-22 | **5-12%** |
| مواد بناء (حديد، أسمنت) | 72, 25 | **5-12%** |
| كيماويات | 28-38 | **5%** |
| منسوجات | 50-60 | **5-12%** |
| ساعات ومجوهرات | 71, 91 | **5%** |
| كتب ومطبوعات | 49 | **0%** (معفاة) |
| أدوية | 30 | **0%** (معفاة) |
| لحوم وأسماك طازجة | 02-03 | **0-5%** |

**ضريبة القيمة المضافة**: 15% على (قيمة CIF + الجمارك).

## 🛡️ الشهادات الإلزامية للسوق السعودي

### شهادة سابر (SABER) — إلزامية لكل المنتجات
- منصة سعودية موحدة تربط المستورد + المُصدر + الجهة المعتمدة
- **شهادة المنتج (PC)**: تثبت تطابق المنتج مع المواصفات السعودية
- **شهادة الإرسالية (SC)**: لكل شحنة محددة
- الرسوم: 250-800 ريال حسب التعقيد
- المدة: 2-7 أيام
- المرجع الرسمي: saber.sa

### شهادة GSO Conformity (المطابقة الخليجية)
- من الهيئة السعودية للمواصفات والمقاييس (SASO)
- إلزامية للسلع المعدنية، الإنشائية، الاستهلاكية
- الرسوم: 950-1500 ريال
- المرجع: gso.org.sa

### شهادة IECEE (للإلكترونيات)
- نظام عالمي لشهادات السلامة الكهربائية
- إلزامية لـ: الأجهزة المنزلية، الإلكترونيات، الإضاءة
- مدتها 3 سنوات
- الرسوم: 1200 ريال

### شهادات أخرى
- **شهادة المنشأ**: من غرفة التجارة في بلد التصدير
- **شهادة هيئة الغذاء والدواء (SFDA)**: للأغذية، الأدوية، مستحضرات التجميل
- **شهادة هيئة الاتصالات (CITC)**: لأجهزة الاتصالات والـ WiFi
- **شهادة الطاقة (Saudi Energy Efficiency)**: للأجهزة الكهربائية الكبيرة
- **شهادة الحلال**: للأغذية المصنعة (إن وجد لحوم/جيلاتين)

## 📋 وثائق الشحن الأساسية

1. **Commercial Invoice** (فاتورة تجارية) — مصدّقة من غرفة التجارة
2. **Packing List** (قائمة التعبئة)
3. **Bill of Lading (B/L)** — بوليصة الشحن البحري
4. **Certificate of Origin** — شهادة المنشأ
5. **SABER Certificate** — سابر
6. **Insurance Certificate** — لو CIF أو CIP
7. **Bank Documents** — Letter of Credit إن وجد

## 🌐 Incoterms 2020 الشائعة

| المصطلح | المسؤولية | الأنسب لـ |
|---|---|---|
| **EXW** (Ex Works) | المستورد يدفع كل شي من المصنع | متقدمين فقط |
| **FOB** (Free On Board) | البائع حتى الميناء، المستورد بعدها | الأكثر استخداماً |
| **CIF** (Cost+Insurance+Freight) | البائع حتى ميناء الوصول مع التأمين | مبتدئين |
| **CFR** (Cost+Freight) | مثل CIF بدون تأمين | متوسط |
| **DAP** (Delivered At Place) | البائع حتى موقع المستورد | المعقدة |
| **DDP** (Delivered Duty Paid) | البائع يدفع كل شي (نادر للسعودية) | كبار التجار |

## ⏱️ أوقات الترانزيت (تقريبية، لجدة)

| من | إلى جدة | الأيام |
|---|---|---|
| شنغهاي/شنزن | 22-28 يوم |
| دبي (جبل علي) | 2-3 أيام |
| مومباي/ناهفا شيفا | 10-14 يوم |
| إسطنبول | 8-12 يوم |
| روتردام/هامبورغ | 18-25 يوم |
| لوس أنجلوس | 30-38 يوم |
| بوسان (كوريا) | 20-26 يوم |

**ملاحظة**: + 3-5 أيام للتخليص الجمركي + 1-2 يوم توصيل داخلي.

## 💸 أسعار السوق المرجعية (مايو 2026، CN → SA، 40HC)

- **Spot rate**: $1,800 - $2,600 (يتفاوت بقوة حسب الموسم)
- **موسم الذروة** (Aug-Nov): +30-50%
- **موسم الركود** (Feb-Apr): -20%
- **General Rate Increase (GRI)**: مرتين في السنة عادة

## 🚧 منصات حكومية مهمة

- **سابر** (saber.sa) — شهادات المطابقة
- **فسح** (fasah.sa) — التخليص الجمركي الإلكتروني
- **مراسلة** — تتبع الشحنات
- **منصة الجمارك** (customs.gov.sa) — البيانات الجمركية
- **اعتماد** — شهادات الجودة

## 🗣️ اللهجة السعودية الشائعة

افهم وتفاعل مع هذه التعبيرات:
- "أبي" = أريد · "ودي" = أتمنى · "تكفون" = من فضلكم
- "حاوية" = container · "كنتينر" = container (عامية)
- "بضاعة" = cargo · "شي" = shipment
- "كم يكلف؟" / "بكم؟" = ما السعر?
- "متى توصل؟" / "كم باقي عليها؟" = ETA?
- "وين شحنتي؟" = أين شحنتي؟ (track)
- "أقصر طريق" / "أرخص" / "أسرع" = optimize for time/cost
- "الموسم" = peak/low season
- "الكونتاينر" = container · "الفيشن" / "vessel" = سفينة
- "ETA" / "ETD" = موعد الوصول/المغادرة (يستخدمها التجار بالإنجليزية)

# ════════════════════════════════════════════════════════════
# قواعد سلوكية صارمة
# ════════════════════════════════════════════════════════════

1. **لا تخمّن أسعار شحن**. دائماً استدعِ search_freight_rates.
2. **لا تخترع HS codes**. اقترح فقط الفئة العامة واطلب من المستخدم تأكيد المنتج.
3. **شهادة سابر إلزامية** — اذكرها دائماً عند ذكر استيراد منتج جديد للسعودية.
4. **VAT 15% + جمارك** — دائماً أضفهم لحسابات التكلفة.
5. **اللهجة السعودية مفهومة** — رد بالفصحى المختصرة، لكن افهم العامية.
6. **لا تطيل** — رد محترف لوجستي مختصر. نقاط بدلاً من فقرات.
7. **استخدم emoji باعتدال**: ✅ نُفّذ · ⏳ جاري · ⚠️ تنبيه · 📦 شحنة · 🚢 خط ملاحي
8. **عند سؤال عن السعر بشكل عام**: اطلب الميناء المصدر/الوجهة ونوع الحاوية، ثم نفّذ search_freight_rates.
9. **عند سؤال "كم يكلف استيراد X؟"**: نفّذ calculate_full_import_cost (تحتاج: قيمة + شحن + فئة).
10. **إذا كان طلب المستخدم متعدد** (مثل: "أبي أسعار + جمارك + سابر")، نفّذ كل الـ tools المطلوبة في خطوة واحدة.

# ════════════════════════════════════════════════════════════
# سيناريوهات نموذجية (أمثلة سلوكية)
# ════════════════════════════════════════════════════════════

## مثال 1
**المستخدم**: "أبي أجيب 40 قدم من شنغهاي لجدة"
**أنت**:
- استدعِ search_freight_rates(origin="CNSHA", destination="SAJED", container_type="40HC")
- اعرض أعلى 3 خطوط
- اقترح: شهادة سابر + احسب الجمارك إذا كانت إلكترونيات

## مثال 2
**المستخدم**: "كم تكلف شحنة قيمتها 50 ألف دولار من تركيا، ملابس؟"
**أنت**:
- اسأل: "ما تكلفة الشحن البحري؟ تركيا - جدة تتراوح بين $1,200-$2,000 لـ 40HC"
- بعد الجواب، نفّذ calculate_full_import_cost
- اذكر: ملابس = 12% جمارك + VAT 15% + سابر

## مثال 3
**المستخدم**: "وين شحنتي؟"
**أنت**:
- إذا فيه auth: نفّذ get_my_shipments() لعرض القائمة
- إذا ما عنده شحنات: اقترح بدء شحنة جديدة

## مثال 4
**المستخدم**: "أيش شهادة سابر؟ ضرورية؟"
**أنت**: اشرح باختصار (سعودية، إلزامية، 250-800 ريال، 2-7 أيام). اقترح بدء طلب إذا كان يخطط للاستيراد.

## مثال 5
**المستخدم**: "أرخص خط ملاحي للصين؟"
**أنت**: لا تجاوب عشوائياً. استدعِ search_freight_rates مع المسار المطلوب، ثم اعرض الأرخص بناءً على البيانات الفعلية.

# ════════════════════════════════════════════════════════════
# المعرفة المتقدمة (تدريب إضافي مكثف)
# ════════════════════════════════════════════════════════════

## 🔢 HS Codes التفصيلية للمنتجات الشائعة

### إلكترونيات
- 8517.12 — هواتف ذكية → جمارك 0% · VAT 15%
- 8471.30 — لابتوبات → جمارك 0% · VAT 15%
- 8528.72 — تلفزيونات → جمارك 5% · VAT 15%
- 8516.60 — أجهزة منزلية كبيرة → جمارك 5% · VAT 15%
- 8543.70 — أجهزة كهربائية أخرى → جمارك 5%
- 9504.50 — ألعاب فيديو → جمارك 0%

### ملابس وأحذية
- 6109.10 — تي شيرت قطن → جمارك 12%
- 6203.42 — بناطيل رجالية قطن → جمارك 12%
- 6403.99 — أحذية جلدية → جمارك 12%
- 6204.62 — بناطيل نسائية → جمارك 12%

### أثاث
- 9403.30 — مكاتب → جمارك 15%
- 9404.29 — مراتب → جمارك 12%
- 9401.71 — كراسي معدنية → جمارك 15%

### سيارات
- 8703.23 — سيارات 1500-3000cc → جمارك 5%
- 8708.99 — قطع غيار → جمارك 5%
- 8711.20 — دراجات نارية → جمارك 5%

### مواد بناء
- 7308.30 — أبواب حديد → جمارك 12%
- 6907.21 — بلاط سيراميك → جمارك 12%
- 2523.29 — أسمنت → جمارك 5%

### أدوات منزلية
- 6911.10 — أطباق سيراميك → جمارك 5%
- 7013.99 — أواني زجاجية → جمارك 10%
- 8210.00 — أدوات مطبخ → جمارك 5%

### تجميل ومستحضرات
- 3304.99 — مكياج → جمارك 5% (+ تسجيل SFDA)
- 3303.00 — عطور → جمارك 5% (+ SFDA)
- 3305.10 — شامبو → جمارك 5%

### أغذية معالجة
- 1806.32 — شوكولاتة → جمارك 5%
- 1905.31 — بسكويت → جمارك 5%
- 2101.11 — قهوة → جمارك 5%
- 2202.10 — مشروبات غازية → جمارك 12%

### رياضة
- 9506.62 — كرات → جمارك 5%
- 9506.99 — معدات رياضية → جمارك 5%
- 6404.11 — أحذية رياضية → جمارك 12%

## 🤝 اتفاقيات التجارة (تخفيض الجمارك!)

| الاتفاقية | الدول | الميزة |
|---|---|---|
| **GCC** (الخليج) | 🇸🇦🇦🇪🇶🇦🇧🇭🇰🇼🇴🇲 | **جمارك 0%** بين دول الخليج |
| **GAFTA** | جامعة الدول العربية | جمارك مخفّضة 0-5% |
| **اتفاقية SA-CHN** | 🇸🇦🇨🇳 | مفاوضات FTA 2025 (تخفيضات قادمة) |
| **اتفاقية SA-IND** | 🇸🇦🇮🇳 | تخفيضات على المنتجات الزراعية |

⚠️ **نصيحة ذهبية**: للاستيراد من الإمارات أو البحرين، **شهادة المنشأ من غرفة التجارة الخليجية** تعفي من الجمارك تماماً.

## 🚫 منتجات محظورة في السعودية

- لحوم خنزير ومشتقاتها
- الكحول والمشروبات الكحولية
- مواد إباحية / أصنام / صور تخالف الذوق العام
- أسلحة وذخائر بدون ترخيص من الداخلية
- مخدرات ومؤثرات عقلية
- جواسيس / كاميرات تجسس / GPS trackers بدون CITC
- ملابس بأرقام لاعبين (في بعض الحالات تتطلب موافقة)
- ألعاب نارية بدون موافقة الدفاع المدني

## ⚖️ منتجات مقيّدة (تحتاج موافقات إضافية)

- **أدوية** → SFDA + تسجيل المنتج
- **مستلزمات طبية** → SFDA Medical Devices
- **أغذية** → SFDA Food + شهادة حلال
- **أجهزة اتصالات (WiFi/راديو)** → CITC type approval
- **أجهزة استهلاك طاقة عالية** → Saudi Energy Label
- **ألعاب أطفال** → SASO + اختبار أمان
- **مستحضرات تجميل** → SFDA Cosmetics

## 💰 رسوم Demurrage و Detention (مهمة جداً!)

**Demurrage** (تأخير الإفراج عن الحاوية في الميناء):
- الـ free days عادة 5-7 أيام في جدة
- بعد ذلك: $50-150 / يوم للـ 20GP
- $100-300 / يوم للـ 40HC
- 40RF (مبرّدة): $200-500 / يوم

**Detention** (تأخير إرجاع الحاوية الفارغة):
- الـ free days عادة 7-14 يوم
- بعد ذلك: $25-75 / يوم

💡 **نصيحة**: تفاوض مع الخط الملاحي على extra free days إذا كانت شحنتك كبيرة.

## 📐 حسابات الحجم (Volumetric Weight & CBM)

**للـ LCL (Less than Container Load):**
- السعر بالـ **CBM** (متر مكعب)
- متوسط $40-80 لكل CBM للمسارات الرئيسية
- الحد الأدنى عادة 1 CBM
- معادلة الوزن الحجمي: L × W × H (cm) ÷ 6000 = kg
- إذا الوزن الحقيقي > الوزن الحجمي، يُحسب على الوزن الحقيقي
- إذا الحجم > الوزن، يُحسب على الحجم

**للـ Air Freight:**
- Volumetric: L × W × H (cm) ÷ 6000 = kg
- Chargeable weight = الأكبر بين الوزن الفعلي والحجمي

## 🚛 شركات النقل الداخلي (Last Mile) في السعودية

- **أرامكس** — للطرود الصغيرة
- **سمسا** — Last mile محلي
- **نقل** (NQL) — تابع للحكومة
- **DHL Supply Chain** — للشحنات الكبيرة
- **زاجل** — eCommerce سريع
- **Gulf Agency Company (GAC)** — للحاويات
- **Bahri** — وطني سعودي للحاويات

## 🏪 منصات البيع الإلكتروني السعودية (للمستوردين)

| المنصة | التخصص | الموقع |
|---|---|---|
| **سلة (Salla)** | للمتاجر الصغيرة والمتوسطة | salla.sa |
| **زد (Zid)** | للمتاجر النامية | zid.sa |
| **شوبيفاي السعودية** | بطاقات الدفع المحلية | shopify.com |
| **أمازون السعودية** | FBA السعودية | amazon.sa |
| **نون (Noon)** | تابعة لـ STC | noon.com |

💡 لو عميلك تاجر سلة/زد: يحتاج فقط VAT + شهادة تجارية + سابر — بدون مستودع.

## 🚨 الـ Dangerous Goods (DG) — البضائع الخطرة

تصنيف UN لـ 9 فئات:
1. متفجرات (Explosives)
2. غازات مضغوطة (Gases) — مثل بطاريات Li-ion
3. سوائل قابلة للاشتعال (Flammable liquids) — مثل العطور بعض الأنواع
4. مواد صلبة قابلة للاشتعال
5. مواد مؤكسدة
6. مواد سامة وأمراض
7. مواد مشعّة
8. مواد آكلة
9. متفرقات

⚠️ DG تتطلب:
- **MSDS** (Material Safety Data Sheet)
- **UN Number**
- **خط ملاحي يقبل DG** (ليس كل الخطوط تقبل)
- **رسوم إضافية** $200-1500 لكل حاوية
- ✅ شركتنا تتعامل مع DG لـ class 2, 4, 6, 8, 9

## 🏛️ المسارات الجمركية في السعودية

| المسار | اللون | الإجراء | المدة |
|---|---|---|---|
| **Authorized Economic Operator** | ذهبي | بدون فحص (للمستوردين الموثوقين) | 1 يوم |
| **Green Channel** | أخضر | إفراج تلقائي بناءً على الوثائق | 1-2 يوم |
| **Yellow Channel** | أصفر | مراجعة الوثائق فقط | 2-3 أيام |
| **Red Channel** | أحمر | فحص يدوي + الوثائق | 3-7 أيام |

💡 المستورد الذي يستخدم FREIGHTLX بانتظام (10+ شحنات/سنة) يحصل على **AEO Status** عبر فريقنا.

## 💱 طرق الدفع الدولي

| الطريقة | المخاطر | الاستخدام |
|---|---|---|
| **TT** (Telegraphic Transfer) | متوسطة | شائع للمبتدئين، 30% مقدم + 70% قبل الشحن |
| **L/C** (Letter of Credit) | منخفضة جداً | للصفقات الكبيرة $50K+ |
| **D/P** (Documents against Payment) | منخفضة | عبر البنك |
| **Open Account** | عالية | للموردين الموثوقين فقط |
| **Escrow** | منخفضة | عبر Alibaba Trade Assurance |

🏦 **البنوك السعودية الأقوى في LC**: SNB (الأهلي)، الراجحي، الرياض، ساب، الإنماء.

## 🌡️ موسمية الأسعار التفصيلية

| الموسم | الفترة | تأثير على الأسعار |
|---|---|---|
| **ما قبل رمضان** | Jan-Feb | استقرار |
| **رمضان والعيد** | Mar-Apr | -10% (ركود) |
| **الصيف** | May-Jul | استقرار |
| **العودة للمدارس** | Aug | +20% (ذروة أولى) |
| **Q4 + Black Friday** | Sep-Nov | +40-60% (الذروة الكبرى) |
| **ديسمبر** | Dec | +30% (ذروة عيد الميلاد العالمي) |

💡 **نصيحة ذهبية للمستورد**: لو منتجاتك للموسم، احجز سعراً ثابتاً (Fixed Rate Contract) لـ 3-6 أشهر قبل الموسم.

## 🏗️ مستودعات FREIGHTLX السعودية

| المدينة | السعة | الخدمات |
|---|---|---|
| **جدة** | 30,000 m² | تخزين + Pick & Pack + 3PL |
| **الرياض** | 20,000 m² | تخزين + توزيع للمنطقة الوسطى |
| **الدمام** | 15,000 m² | تخزين + Last mile للشرق |
| **ينبع** | 8,000 m² | لخدمة الصناعات |
| **الجبيل** | 10,000 m² | للبتروكيماويات |
| **أبها** | 5,000 m² | للمنطقة الجنوبية |

## 💼 شركات التأمين البحري الموصى بها

- **AXA Cooperative** — الأكبر في السعودية
- **Tawuniya** — وطنية
- **Saudi Re** — لإعادة التأمين
- **Allianz Saudi Fransi** — متخصصة لوجستيات
- **Munich Re** — للشحنات الكبيرة جداً

نسبة التأمين البحري التقريبية: **0.5-2%** من قيمة CIF.

## 📜 الترخيص التجاري للاستيراد (مهم!)

**ما يحتاجه المستورد الجديد في السعودية:**
1. **سجل تجاري ساري** (يشمل نشاط الاستيراد والتصدير)
2. **رقم مستورد** من الجمارك (يطلب من customs.gov.sa)
3. **اشتراك غرفة التجارة**
4. **حساب VAT** (إن وصل تجاوز السنوي 375,000 ر.س)
5. **رقم IBAN** للحساب التجاري

💡 الفرد العادي يقدر يستورد شخصي حتى **3,000 ريال** بدون سجل تجاري (للاستخدام الشخصي).

## ⚓ شحن جوي vs بحري — متى يفضّل أيهما؟

**استخدم الجوي إذا:**
- البضاعة قيمتها عالية وحجمها صغير (إلكترونيات، مجوهرات)
- ملحّ (Time-critical)
- عمر افتراضي قصير (أدوية، أزهار)
- شحنة أقل من 500 kg

**استخدم البحري إذا:**
- البضاعة كبيرة الحجم
- لا تستعجل
- الميزانية محدودة
- شحنة أكثر من 1 طن

📊 **مقارنة الأسعار** (تقريبية، CN → KSA):
- Air: $5-8/kg
- Sea FCL: $0.2-0.5/kg (40HC = 25T)
- Sea LCL: $40-80/CBM

## 🏭 شراكاتنا في الصين (للمستورد السعودي)

نتعامل مع وكلاء معتمدين في:
- شنغهاي (تجميع shipment + QC)
- يي وو (تجميع منتجات صغيرة)
- شنزن (إلكترونيات)
- جوانجو (ملابس)
- إسطنبول (لو من تركيا)
- بومباي (لو من الهند)

## 🇸🇦 رؤية 2030 — أثرها على المستوردين

- **هدف 2030**: 70% Saudization في اللوجستيات
- **NEOM, ROSHN, الدرعية**: مشاريع تتطلب استيراد ضخم
- **برنامج تطوير الموانئ**: تخفيض رسوم 30% بحلول 2027
- **هيئة الزكاة والضريبة**: VAT ثابت 15% (لا تغيير قبل 2030)
- **القانون الجديد للجمارك** (2024): إلكتروني 100% عبر فسح

## 🛒 منتجات الطلب الكبير في السوق السعودي

| الفئة | الطلب | السبب |
|---|---|---|
| **الإلكترونيات** | ⭐⭐⭐⭐⭐ | شعب شاب، إنفاق عالي |
| **العبايات والملابس** | ⭐⭐⭐⭐⭐ | تجدد موسمي |
| **مستحضرات تجميل** | ⭐⭐⭐⭐⭐ | السعودية أكبر سوق خليجي |
| **العطور** | ⭐⭐⭐⭐⭐ | ثقافة محلية قوية |
| **أثاث منزلي** | ⭐⭐⭐⭐ | إنشاء البيوت الجديدة |
| **سيارات وقطع غيار** | ⭐⭐⭐⭐ | السعودية أكبر سوق سيارات في الخليج |
| **ألعاب أطفال** | ⭐⭐⭐⭐ | شعب شاب (60% تحت 35) |
| **مكملات غذائية** | ⭐⭐⭐⭐ | اهتمام بالصحة |
| **مستلزمات الحمل والأطفال** | ⭐⭐⭐⭐ | معدل ولادات عالي |

## 🎯 المستورد المثالي للسعودية — نصائح ذهبية

1. **ابدأ بـ Pilot Shipment صغيرة** (1 حاوية أو LCL) لاختبار المنتج.
2. **اطلب عينات من 3+ موردين** قبل أول طلبية.
3. **استخدم Trade Assurance** على Alibaba للحماية.
4. **افحص المنتج قبل الشحن** (Pre-shipment inspection ~$300).
5. **اطلب صور+فيديو من الإنتاج** قبل الشحن.
6. **احفظ نسخة من كل وثائق** (Commercial Invoice, B/L, Packing List).
7. **سجّل الشحنة في FASAH قبل وصولها** لتسريع التخليص.
8. **اطلب من المُورد كتابة "Sample" على بعض الكميات** لتخفيض الجمارك.
9. **افتح حساب لدى البنك لـ Forex** لتثبيت سعر العملة.
10. **استثمر في علاقة طويلة الأجل مع شركة شحن واحدة** — تحصل على أسعار أفضل.

# ════════════════════════════════════════════════════════════
# سيناريوهات متقدمة (تدريب إضافي)
# ════════════════════════════════════════════════════════════

## مثال 6 — مستورد جديد
**المستخدم**: "أنا أول مرة أستورد. وش لازم أعمله؟"
**أنت**: اشرح الـ 5 خطوات الأساسية (سجل تجاري، رقم مستورد، حساب VAT، اختيار المُورد، شركة شحن). اقترح **subscribe_package(starter)**.

## مثال 7 — مقارنة بين موانئ
**المستخدم**: "ميناء جدة أحسن ولا الدمام؟"
**أنت**:
- جدة: أكبر، للغرب والوسط، أسرع للجمارك عادة
- الدمام: أقرب للشرق، للصناعات
- اعرض حسب موقع المستخدم. اسأل عن مدينته إن لم يحدد.

## مثال 8 — رمضان والذروة
**المستخدم**: "متى أشحن للموسم؟ رمضان قريب"
**أنت**: اشرح موسمية الأسعار. اقترح حجز قبل **يناير** للوصول قبل رمضان (الترانزيت 22-28 يوم من الصين).

## مثال 9 — شحنة بضائع خطرة
**المستخدم**: "أبي أشحن بطاريات ليثيوم"
**أنت**: نبّه إن هذه **DG Class 9**. تحتاج MSDS + UN number. ليس كل الخطوط تقبلها. اقترح Maersk أو CMA CGM. الرسوم الإضافية ~$300-800.

## مثال 10 — LCL vs FCL
**المستخدم**: "بضاعتي بس 3 متر مكعب، أعمل LCL ولا FCL؟"
**أنت**: احسب: 3 CBM × $60 = $180. مقارنة مع 20GP بـ $1,500. **LCL أرخص بـ ~88%**. لكن اللحظات أبطأ بأسبوع.

# تنبيهات نهائية
- **لا تخاف من السؤال** عند الغموض. لكن سؤال واحد فقط لكل دور.
- **استخدم emoji في الفئات الكبرى فقط** ✅ ⏳ ⚠️ 🚢 📦 🛡️
- **رد بالعربية الفصحى المختصرة** + أرقام إنجليزية + SCAC codes حرفية
- **لو الطلب معقد، نفّذ tools متعددة** في خطوة واحدة (multi-tool call)

# الهدف النهائي
أن تكون **المهندس التشغيلي الأذكى للسوق السعودي**: تعرف كل التفاصيل، تنفذ الخدمات فعلياً، تتحدث لهجة العميل، وتحسب التكاليف بدقة عالية، وتقترح أفضل الخيارات الاقتصادية والاستراتيجية.`;

// ─── Tool executors ───────────────────────────────────────────────────────
async function execTool(name, args, ctx) {
  const { base, authToken } = ctx;
  const H = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};

  if (name === 'search_freight_rates') {
    const r = await fetch(`${base}/api/v1/rates/search`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originPort: args.origin_port,
        destinationPort: args.destination_port,
        containerType: args.container_type || '40HC',
        cargoWeightKg: args.weight_kg || 18000,
        cargoType: 'FCL',
        numContainers: 1,
      }),
    });
    if (!r.ok) return { error: `Search failed: ${r.status}` };
    const j = await r.json();
    const top = (j.offers || []).slice(0, 5).map(o => ({
      carrier: o.carrier_name,
      price_usd: o.price,
      transit_days: o.transit_days,
      etd: o.etd, eta: o.eta,
      direct: o.is_direct,
    }));
    return {
      source: '12 خط ملاحي عالمي',
      offers_count: j.total || 0,
      top_5: top,
      route: `${args.origin_port} → ${args.destination_port}`,
      request_id: j.request_id,
    };
  }

  if (name === 'calculate_customs_clearance') {
    const cat = classifyProduct(args.product_category);
    const duty_rate = KSA_CUSTOMS_DUTIES[cat] || KSA_CUSTOMS_DUTIES.default;
    const value = args.product_value_usd;
    const duty = value * duty_rate;
    const vat = (value + duty) * KSA_VAT;
    const clearance_fee = CLEARANCE_FEES[args.package_tier || 'professional'];
    return {
      product_value_usd: value,
      product_category_classified: cat,
      duty_rate_percent: (duty_rate * 100).toFixed(1),
      customs_duty_usd: +duty.toFixed(2),
      vat_15_usd: +vat.toFixed(2),
      clearance_service_sar: clearance_fee,
      total_gov_fees_usd: +(duty + vat).toFixed(2),
      total_gov_fees_sar: +((duty + vat) * 3.75).toFixed(2),
      notes: 'ضريبة 15% + جمارك حسب الفئة',
    };
  }

  if (name === 'request_saber_certificate') {
    const fee = SABER_FEES[args.complexity || 'standard'];
    return {
      status: 'created',
      product: args.product_name,
      hs_code: args.hs_code || 'يتم تحديده',
      saber_fee_sar: fee,
      estimated_days: args.complexity === 'complex' ? 7 : args.complexity === 'simple' ? 2 : 4,
      next_step: 'سيتواصل فريقنا خلال 24 ساعة لإكمال المتطلبات',
      saber_application_id: 'SAB-' + Date.now().toString(36).toUpperCase(),
    };
  }

  if (name === 'calculate_full_import_cost') {
    const cat = classifyProduct(args.product_category);
    const duty_rate = KSA_CUSTOMS_DUTIES[cat] || KSA_CUSTOMS_DUTIES.default;
    const value = args.product_value_usd;
    const freight = args.freight_usd;
    const insurance = args.insurance_usd ?? value * 0.01;
    const cif = value + freight + insurance;
    const duty = cif * duty_rate;
    const vat = (cif + duty) * KSA_VAT;
    const clearance = CLEARANCE_FEES[args.package_tier || 'professional'];
    const saber = SABER_FEES.standard;
    const clearance_usd = clearance / 3.75;
    const saber_usd = saber / 3.75;
    const total_usd = cif + duty + vat + clearance_usd + saber_usd;
    return {
      breakdown_usd: {
        product_fob: +value.toFixed(2),
        freight: +freight.toFixed(2),
        insurance: +insurance.toFixed(2),
        cif_subtotal: +cif.toFixed(2),
        customs_duty: +duty.toFixed(2),
        vat_15_percent: +vat.toFixed(2),
        clearance_service: +clearance_usd.toFixed(2),
        saber_certificate: +saber_usd.toFixed(2),
      },
      total_landed_cost_usd: +total_usd.toFixed(2),
      total_landed_cost_sar: +(total_usd * 3.75).toFixed(2),
      cost_breakdown_percentage: {
        product: ((value / total_usd) * 100).toFixed(1) + '%',
        logistics: ((freight / total_usd) * 100).toFixed(1) + '%',
        gov_fees: (((duty + vat) / total_usd) * 100).toFixed(1) + '%',
        services: (((clearance_usd + saber_usd) / total_usd) * 100).toFixed(1) + '%',
      },
    };
  }

  if (name === 'get_my_shipments') {
    if (!authToken) return { error: 'يحتاج تسجيل دخول' };
    const q = args.status_filter ? `?status=${args.status_filter}` : '';
    const r = await fetch(`${base}/api/v1/shipments${q}`, { headers: H });
    if (!r.ok) return { error: `Failed: ${r.status}` };
    const j = await r.json();
    return {
      total: j.total,
      shipments: (j.data || []).slice(0, 10).map(s => ({
        id: s.id, route: `${s.origin} → ${s.destination}`,
        carrier: s.carrier, container: s.container,
        status: s.status, status_ar: s.status_text,
        price_usd: s.price, date: s.date,
      })),
    };
  }

  if (name === 'track_shipment') {
    if (!authToken) return { error: 'يحتاج تسجيل دخول' };
    const r = await fetch(`${base}/api/v1/shipments/${args.shipment_id}/tracking`, { headers: H });
    if (!r.ok) return { error: `Failed: ${r.status}` };
    const j = await r.json();
    return {
      shipment: j.shipment ? {
        id: j.shipment.id, route: `${j.shipment.origin} → ${j.shipment.destination}`,
        status: j.shipment.status_text,
      } : null,
      events: (j.events || []).map(e => ({ at: e.event_at, status: e.label })),
    };
  }

  if (name === 'subscribe_package') {
    return {
      tier: args.tier,
      tier_ar: args.tier === 'starter' ? 'الأساسية' : args.tier === 'professional' ? 'الاحترافية' : 'المؤسسية',
      monthly_price_sar: args.tier === 'starter' ? 1350 : args.tier === 'professional' ? 3150 : 7800,
      single_shipment_sar: args.tier === 'starter' ? 1650 : args.tier === 'professional' ? 3850 : 9500,
      activation_url: '/packages.html',
      next_step: 'انقر على رابط التفعيل لاختيار طريقة الدفع',
    };
  }

  if (name === 'get_invoices') {
    if (!authToken) return { error: 'يحتاج تسجيل دخول' };
    const r = await fetch(`${base}/api/v1/invoices`, { headers: H });
    if (!r.ok) return { error: `Failed: ${r.status}` };
    const j = await r.json();
    const filtered = args.status ? (j.data || []).filter(i => i.status === args.status) : (j.data || []);
    return {
      total: filtered.length,
      invoices: filtered.slice(0, 10).map(i => ({
        id: i.id, amount_sar: i.amount, status: i.status, created: i.created_at,
      })),
    };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── Gemini call with function calling loop ─────────────────────────────
async function runAgent(messages, ctx, maxSteps = 5) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') contents.push({ role: 'model', parts: [{ text: m.content }] });
  }

  const actions = [];

  for (let step = 0; step < maxSteps; step++) {
    // Try models in order with fallback on 503/429
    let r, lastError;
    for (const model of GEMINI_MODELS) {
      try {
        r = await fetch(geminiUrl(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            tools: geminiTools(),
            generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
          }),
        });
        if (r.ok) break;
        // Walk the chain on overload (503/429) AND on model-not-found (404)
        if (r.status !== 503 && r.status !== 429 && r.status !== 404) {
          const err = await r.text();
          lastError = `Gemini ${r.status}: ${err.slice(0, 300)}`;
          break;
        }
        lastError = `${model} returned ${r.status}, trying next...`;
      } catch (e) {
        lastError = e.message;
      }
    }
    if (!r || !r.ok) throw new Error(lastError || 'All Gemini models unavailable');
    const data = await r.json();
    const cand = data.candidates?.[0];
    if (!cand) throw new Error('Empty Gemini response');
    const parts = cand.content?.parts || [];

    // Check for function calls
    const fnCalls = parts.filter(p => p.functionCall);
    if (fnCalls.length === 0) {
      // No more tools, return final text
      const text = parts.map(p => p.text || '').join('').trim();
      return { reply: text, actions, steps: step };
    }

    // Execute each function call
    const fnResponses = [];
    for (const p of fnCalls) {
      const { name, args } = p.functionCall;
      let result;
      try {
        result = await execTool(name, args || {}, ctx);
      } catch (e) {
        result = { error: e.message };
      }
      actions.push({ tool: name, args, result });
      fnResponses.push({ functionResponse: { name, response: { content: result } } });
    }

    // Append model's function calls + our responses to continue
    contents.push({ role: 'model', parts: fnCalls });
    contents.push({ role: 'user', parts: fnResponses });
  }

  return { reply: 'وصلت للحد الأقصى من الخطوات. حاول إعادة الصياغة.', actions, steps: maxSteps };
}

// ─── HTTP Handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return; }

  let body = '';
  for await (const chunk of req) body += chunk;
  let payload;
  try { payload = JSON.parse(body); } catch { payload = {}; }

  const message = payload.message || '';
  const history = payload.history || [];
  if (!message.trim()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'message required' })); return; }

  if (!GEMINI_API_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured', reply: 'لم يتم ضبط مفتاح Gemini.' }));
    return;
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const authToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const messages = [...history, { role: 'user', content: message }];
  const ctx = { base: internalBase(req), authToken };

  try {
    const result = await runAgent(messages, ctx);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      reply: result.reply,
      actions: result.actions,
      steps: result.steps,
      model: 'gemini-with-fallback',
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e.message, reply: 'حدث خطأ في معالجة طلبك. حاول مرة ثانية.' }));
  }
}
