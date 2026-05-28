import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const VISION_MODEL = 'gemini-2.5-flash-lite';
const VISION_MAX_BASE64_CHARS = 7_000_000;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isValidPayload(body) {
  return (
    body &&
    typeof body.imageBase64 === 'string' &&
    body.imageBase64.length > 0 &&
    body.imageBase64.length <= VISION_MAX_BASE64_CHARS &&
    typeof body.habitDescription === 'string' &&
    body.habitDescription.trim().length > 0
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'GEMINI_API_KEY belum diset di Vercel.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!isValidPayload(body)) {
      sendJson(res, 400, { error: 'Payload vision tidak valid.' });
      return;
    }

    const genAi = new GoogleGenerativeAI(apiKey);
    const model = genAi.getGenerativeModel({
      model: VISION_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            verdict: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['valid', 'fraud', 'mismatch'],
            },
            reason: { type: SchemaType.STRING },
            confidence: { type: SchemaType.NUMBER },
          },
          required: ['verdict', 'reason', 'confidence'],
        },
      },
    });

    const instruction = [
      `Tugas: verifikasi apakah foto ini adalah bukti otentik untuk habit "${body.habitDescription.trim()}".`,
      '',
      'Aturan keputusan:',
      '- "valid": foto adalah objek FISIK NYATA yang sesuai dengan habit dan tidak ada indikasi kecurangan.',
      '- "fraud": ada indikasi foto dari layar, gambar yang difoto ulang, screenshot, atau hasil edit/gambar generated.',
      '- "mismatch": foto tampak nyata tapi tidak sesuai dengan habit yang divalidasi.',
      '',
      'Kembalikan JSON sesuai schema {verdict, reason, confidence}.',
      'Sertakan alasan SINGKAT (maks 200 karakter) dalam Bahasa Indonesia di field reason.',
    ].join('\n');

    const response = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: body.imageBase64 } },
      { text: instruction },
    ]);
    const text = response.response?.text?.() || '';
    const parsed = JSON.parse(text);
    sendJson(res, 200, parsed);
  } catch (err) {
    const message = err?.message || 'Gemini vision request gagal.';
    const lower = message.toLowerCase();
    const status = lower.includes('quota') || lower.includes('rate') ? 429 : 500;
    sendJson(res, status, { error: message });
  }
}
