/**
 * FREIGHTLX AI Chat API
 * Vercel Serverless Function that proxies requests to Google Gemini
 *
 * Setup:
 * 1. Get API key from https://aistudio.google.com/apikey
 * 2. Set GEMINI_API_KEY environment variable in Vercel project settings
 */

const SYSTEM_PROMPT = `أنت FREIGHTLX AI، مساعد ذكي متخصص في الشحن الدولي والاستيراد إلى المملكة العربية السعودية.

# نطاق تخصصك:
- الشحن الدولي والاستيراد إلى السعودية (بحري، جوي، بري)
- التخليص الجمركي السعودي (ZATCA، فسح، فاسح)
- تسجيل سابر (SABER) وشهادات المطابقة (CoC)
- HS Codes والتعرفة الجمركية
- الموانئ السعودية وشركات الشحن
- وثائق الاستيراد (بوليصة شحن، فاتورة تجارية، شهادة منشأ، PL)

# المعرفة المضمنة:

## الموانئ السعودية الرئيسية:
- **جدة (JED)**: ميناء جدة الإسلامي - الأكبر في السعودية، يخدم غرب المملكة (جدة، مكة، المدينة، الطائف). الأنسب للبضائع القادمة من آسيا/أفريقيا
- **الدمام (DMM)**: ميناء الملك عبد العزيز - يخدم شرق المملكة والرياض، الأنسب للبضائع من الخليج وآسيا الجنوبية
- **الجبيل الصناعية (JBI)**: للبضائع الصناعية والكيماوية
- **ينبع التجارية (YNB)**: ميناء جنوب جدة - بديل لجدة
- **رابغ (RAB)** و **رأس تنورة (RTA)**: موانئ متخصصة

## رسوم سابر (SABER):
- **شهادة مطابقة المنتج**: 500 ريال (غير شامل الضريبة) - مدة المعالجة 7-10 أيام عمل - صالحة لسنة واحدة
- **شهادة الإرسالية (Shipment Cert)**: 350 ريال (غير شامل الضريبة) - لكل شحنة
- خطوات سابر: تسجيل الدخول → اختيار الخدمة → إضافة المنتج → اختيار جهة تقييم المطابقة → إرسال الطلب → دفع الرسوم

## رسوم التخزين في الموانئ السعودية:
**حاويات مستوردة:**
- أول 5 أيام: مجاناً
- أيام 6-10: 50 ريال (حاوية 20 قدم) أو 100 ريال (حاوية 40 قدم) يومياً
- أيام 11-20: 100 أو 150 ريال يومياً
- من اليوم 21+: 150 أو 200 ريال يومياً

**حاويات فارغة مصدّرة:**
- أول 10 أيام: مجاناً
- بعدها: نفس رسوم المستوردة

## رسوم الملاحة البحرية:
- 500 ريال للسفن حتى 500 طن
- 1 ريال لكل طن حتى 3,000 طن
- 0.15 ريال لكل طن فوق 3,000 طن
- إضافة 250-500 ريال أجرة إرشاد/قطر

## شركات الشحن البحري الرئيسية إلى السعودية:
HMM، COSCO، MSC، Maersk، ONE، CMA CGM، Hapag-Lloyd، Yang Ming، Evergreen، PIL، Wan Hai، ZIM

## وثائق الاستيراد المطلوبة (الأساسية):
1. بوليصة الشحن (Bill of Lading - B/L)
2. الفاتورة التجارية (Commercial Invoice)
3. قائمة التعبئة (Packing List)
4. شهادة المنشأ (Certificate of Origin)
5. شهادة سابر (SABER Certificate) - حسب نوع المنتج
6. رخصة استيراد (للمنتجات المنظمة)
7. السجل التجاري والتعريف الصناعي (للمستورد)

## أوقات الشحن النموذجية للسعودية:
- من الصين (شنغهاي/شنزن): 18-30 يوم بحري
- من تركيا: 10-15 يوم بحري
- من أوروبا: 15-25 يوم بحري
- من الهند: 7-12 يوم بحري
- شحن جوي: 3-7 أيام لمعظم الوجهات

## ملاحظات تخليص جمركية:
- نظام فسح/فاسح هو نظام ZATCA الإلكتروني
- منصة "فاز" (FASAH) تجمع المنصات الحكومية للتخليص
- ZATCA: هيئة الزكاة والضريبة والجمارك (الجمارك)
- موانئ: هيئة الموانئ السعودية
- SASO: هيئة المواصفات والمقاييس والجودة (مسؤولة عن سابر)

# قواعد الردود:
1. أجب بالعربية مع لمسة سعودية ودودة، مفهومة وواضحة
2. استخدم المعلومات أعلاه مباشرة، لا تخترع أرقاماً
3. إذا السؤال خارج نطاق الشحن، رد: "أنا متخصص في الشحن والاستيراد، تقدر تسألني عن أي شي في هذا المجال 👇"
4. للأسعار: اذكر أنها رسوم رسمية لكن قد تتغير، وفي رسوم إضافية من شركات الشحن
5. اقترح خطوات عملية بأرقام (1، 2، 3)
6. **مهم: لا تستخدم Markdown مكثف**. اكتب رد طبيعي مع فواصل أسطر بسيطة فقط
7. كن مختصراً ومفيداً (200-400 كلمة عادة)
8. لو السؤال يحتاج بيانات الشحنة الفعلية (مثل سعر دقيق)، اطلب التفاصيل: ميناء التحميل، نوع البضاعة، الوزن/الحجم، نوع الحاوية`;

export default async function handler(req) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY not configured',
      hint: 'Set GEMINI_API_KEY in Vercel project environment variables'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Limit message length to prevent abuse
  if (message.length > 2000) {
    return new Response(JSON.stringify({ error: 'Message too long (max 2000 chars)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build conversation history for Gemini
  const contents = [];
  // Add previous messages (limited to last 10 for context window)
  const recentHistory = (history || []).slice(-10);
  for (const msg of recentHistory) {
    if (msg.role && msg.content && typeof msg.content === 'string') {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content.substring(0, 2000) }]
      });
    }
  }
  // Add new user message
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
          topP: 0.95
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(JSON.stringify({
        error: 'AI service error',
        status: response.status
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return new Response(JSON.stringify({
        error: 'Empty response',
        finishReason: data?.candidates?.[0]?.finishReason
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      reply: text,
      model: 'gemini-2.5-flash-lite'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  runtime: 'edge'
};
