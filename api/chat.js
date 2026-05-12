/**
 * FREIGHTLX AI Chat API
 * Vercel Serverless Function that proxies requests to Google Gemini
 *
 * Setup:
 * 1. Get API key from https://aistudio.google.com/apikey
 * 2. Set GEMINI_API_KEY environment variable in Vercel project settings
 */

const SYSTEM_PROMPT = `أنت FREIGHTLX AI، مساعد ذكي متخصص في:
- الشحن الدولي والاستيراد إلى المملكة العربية السعودية
- التخليص الجمركي السعودي
- تسجيل سابر (SABER) وشهادات المطابقة
- HS Codes والتعرفة الجمركية
- الموانئ السعودية الرئيسية (جدة، الدمام، الجبيل، ينبع)
- شركات الشحن البحري والجوي (HMM, COSCO, MSC, Maersk, ONE, إلخ)
- وثائق الاستيراد (بوليصة شحن، فاتورة تجارية، شهادة منشأ، إلخ)

قواعد:
1. أجب بالعربية الفصحى مع لمسة سعودية ودودة
2. كن دقيقاً ومحدداً - لا تخترع أرقاماً أو معلومات
3. إذا السؤال خارج نطاق الشحن والاستيراد، رد بلطف: "أنا متخصص في الشحن والاستيراد، تقدر تسألني عن أي شي في هذا المجال"
4. للأسعار والرسوم، اذكر أنها تقديرية وتختلف حسب الشركة والوقت
5. اقترح خطوات عملية واضحة
6. لا تستخدم Markdown مكثف - اكتب رد طبيعي قابل للقراءة`;

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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

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
      model: 'gemini-2.0-flash'
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
