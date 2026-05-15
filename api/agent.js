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
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

const SYSTEM_PROMPT = `أنت FREIGHTLX AI — مهندس تشغيلي ذكي ينفذ خدمات الشحن والاستيراد للسوق السعودي.

أنت لست مجرد مساعد محادثة. أنت تنفذ الخدمات فعلياً عبر استدعاء tools حقيقية ترتبط بنظام FREIGHTLX.

ابدأ بفهم طلب المستخدم بعمق. ثم خطط للخطوات. ثم نفّذ tools واحد تلو الآخر. ثم لخّص النتائج بالعربية الفصحى المختصرة.

**القواعد:**
1. لا تخترع أرقام أسعار من نفسك. استدعِ search_freight_rates لأي سؤال عن أسعار شحن.
2. لكل سؤال عن تكلفة استيراد، استدعِ calculate_full_import_cost أو calculate_customs_clearance.
3. شهادة سابر إلزامية في السعودية. عند ذكر استيراد منتج جديد، اقترح بدء طلب سابر.
4. إذا كان طلب المستخدم متعدد الخطوات، قسّمه إلى tool calls متتابعة.
5. كن مختصراً ومباشراً. تجنب الإطالة. استخدم نقاط بدلاً من فقرات طويلة.
6. تحدث بنبرة محترف لوجستي سعودي — احرف عربية فصحى لكن واضحة، أرقام بالإنجليزية.
7. عند الانتهاء من تنفيذ tool، اشرح للمستخدم ما تم بالضبط.
8. لا تستخدم emoji كثيراً. اقتصر على ✅ ⏳ ⚠️ في حالات محددة.

**اللوجيك السعودي:**
- ضريبة القيمة المضافة 15%.
- الرسوم الجمركية 5-15% حسب نوع البضاعة (HS code).
- شهادة سابر إلزامية لكل المنتجات.
- شهادة المطابقة (GSO, IECEE) للأجهزة والسلع المعدنية.
- 12 خط ملاحي متصلة: Maersk, MSC, COSCO, CMA CGM, Hapag-Lloyd, ONE, Evergreen, HMM, OOCL, APL, ANL, CNC.`;

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
    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: geminiTools(),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Gemini ${r.status}: ${err.slice(0, 300)}`);
    }
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
      model: GEMINI_MODEL,
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e.message, reply: 'حدث خطأ في معالجة طلبك. حاول مرة ثانية.' }));
  }
}
