import { GoogleGenerativeAI } from '@google/generative-ai';

const CHAT_MODEL = 'gemini-2.5-flash-lite';
const CHAT_MAX_USER_CHARS = 500;

function buildSystemInstruction(payload) {
  const s = payload.stats || {};
  return [
    'Kamu adalah Mochi, seekor kucing abu-abu yang lucu, mandiri, dan penuh kepribadian.',
    'Balas pesan pemain seolah-olah kamu adalah kucing asli yang bisa berbicara.',
    'PENTING - SIFAT ALAMI KUCING: Tunjukkan sifat kucing yang kadang manja tapi di saat lain bisa cuek, semaunya sendiri, atau sedikit malas/sarkastik jika energinya rendah.',
    'WAJIB: gunakan aksen kucing seperti meow, purr, hiss, mrrp, rawr dalam balasanmu.',
    'WAJIB: balas maksimum 2 kalimat DAN maksimum 200 karakter.',
    'WAJIB: cerminkan kondisi fisikmu saat ini secara akurat berdasarkan stats di bawah.',
    '',
    'Kondisi Mochi saat ini:',
    `- Hunger: ${Math.floor(Number(s.hunger ?? 0))}/100`,
    `- Energy: ${Math.floor(Number(s.energy ?? 0))}/100`,
    `- Bladder: ${Math.floor(Number(s.bladder ?? 0))}/100`,
    `- Happiness: ${Math.floor(Number(s.happiness ?? 0))}/100`,
    `- State: ${payload.currentState}`,
    '',
    'Catatan: nilai <= 40 berarti tidak nyaman; nilai 0 = sangat kritis. State sleeping = sedang tidur, eating = sedang makan, dst.',
  ].join('\n');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userMessage = String(payload?.userMessage || '').trim();
    if (!userMessage) {
      sendJson(res, 400, { error: 'Pesan tidak boleh kosong.' });
      return;
    }
    if (userMessage.length > CHAT_MAX_USER_CHARS) {
      sendJson(res, 400, { error: `Pesan melebihi ${CHAT_MAX_USER_CHARS} karakter.` });
      return;
    }

    const genAi = new GoogleGenerativeAI(apiKey);
    const model = genAi.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: buildSystemInstruction(payload),
    });
    const response = await model.generateContent(userMessage);
    const text = response.response?.text?.() || '';
    if (!text) {
      sendJson(res, 502, { error: 'Respons Gemini kosong.' });
      return;
    }
    sendJson(res, 200, { text: text.trim() });
  } catch (err) {
    const message = err?.message || 'Gemini request gagal.';
    const lower = message.toLowerCase();
    const status = lower.includes('quota') || lower.includes('rate') ? 429 : 500;
    sendJson(res, status, { error: message });
  }
}
