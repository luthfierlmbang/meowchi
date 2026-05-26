import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getConfig, disableFeature, getFeatureError } from '../state/Config_Store';

export const VISION_MODEL = 'gemini-2.5-flash';
export const VISION_TIMEOUT_MS = 30_000;
export const VISION_MAX_BYTES = 5 * 1024 * 1024;
export const VISION_ACCEPTED_MIME = 'image/jpeg' as const;

export type Verdict = 'valid' | 'fraud' | 'mismatch';

export interface VisionVerdict {
  verdict: Verdict;
  reason: string;
  confidence: number; // 0..1
}

export class VisionClientError extends Error {
  constructor(
    message: string,
    public code:
      | 'feature_disabled'
      | 'invalid_mime'
      | 'too_large'
      | 'auth'
      | 'quota'
      | 'timeout'
      | 'network'
      | 'malformed_response',
  ) {
    super(message);
    this.name = 'VisionClientError';
  }
}

let _genAi: GoogleGenerativeAI | null = null;

function getGenAi(): GoogleGenerativeAI {
  const cfg = getConfig();
  if (!cfg.visionEnabled || !cfg.geminiKey) {
    throw new VisionClientError(
      'Fitur vision dinonaktifkan: API key Gemini belum dikonfigurasi.',
      'feature_disabled',
    );
  }
  if (!_genAi) {
    _genAi = new GoogleGenerativeAI(cfg.geminiKey);
  }
  return _genAi;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:image/jpeg;base64," prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca blob'));
    reader.readAsDataURL(blob);
  });
}

function validateBlob(blob: Blob): void {
  if (blob.type !== VISION_ACCEPTED_MIME) {
    throw new VisionClientError(
      `MIME ${blob.type} tidak didukung; harus ${VISION_ACCEPTED_MIME}.`,
      'invalid_mime',
    );
  }
  if (blob.size > VISION_MAX_BYTES) {
    throw new VisionClientError('Ukuran berkas melebihi 5 MB.', 'too_large');
  }
}

function isValidVerdict(x: unknown): x is VisionVerdict {
  if (!x || typeof x !== 'object') return false;
  const v = x as Record<string, unknown>;
  if (v.verdict !== 'valid' && v.verdict !== 'fraud' && v.verdict !== 'mismatch') return false;
  if (typeof v.reason !== 'string') return false;
  if (typeof v.confidence !== 'number' || !Number.isFinite(v.confidence)) return false;
  if (v.confidence < 0 || v.confidence > 1) return false;
  return true;
}

/**
 * Verify a habit photo using Gemini Vision.
 *
 * @param imageBlob — must be image/jpeg ≤ 5 MB
 * @param habitDescription — human-readable description of the habit being validated
 * @returns the verdict (caller decides what to do with valid/fraud/mismatch)
 *
 * Throws VisionClientError on disabled/timeout/auth/quota/network/malformed.
 */
export async function verifyHabitPhoto(
  imageBlob: Blob,
  habitDescription: string,
): Promise<VisionVerdict> {
  validateBlob(imageBlob);
  const genAi = getGenAi();
  const base64 = await blobToBase64(imageBlob);

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
    `Tugas: verifikasi apakah foto ini adalah bukti otentik untuk habit "${habitDescription}".`,
    '',
    'Aturan keputusan:',
    '- "valid": foto adalah objek FISIK NYATA yang sesuai dengan habit dan tidak ada indikasi kecurangan.',
    '- "fraud": ada indikasi foto dari layar (foto monitor/HP), gambar yang difoto ulang, screenshot, atau hasil edit/gambar generated.',
    '- "mismatch": foto tampak nyata tapi tidak sesuai dengan habit yang divalidasi.',
    '',
    'Kembalikan JSON sesuai schema {verdict, reason, confidence}. `confidence` adalah angka 0..1 yang merepresentasikan keyakinanmu pada putusan.',
    'Sertakan alasan SINGKAT (maks 200 karakter) dalam Bahasa Indonesia di field `reason`.',
  ].join('\n');

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: instruction },
      ]),
      new Promise<never>((_resolve, reject) => {
        ac.signal.addEventListener('abort', () =>
          reject(new VisionClientError('Timeout', 'timeout')),
        );
      }),
    ]);

    const text = (response as { response: { text(): string } }).response?.text?.() ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new VisionClientError('Respons Gemini bukan JSON valid.', 'malformed_response');
    }
    if (!isValidVerdict(parsed)) {
      throw new VisionClientError('Skema respons tidak sesuai.', 'malformed_response');
    }
    return parsed;
  } catch (err) {
    if (err instanceof VisionClientError) throw err;
    const e = err as Error & { status?: number };
    const msg = (e?.message || '').toLowerCase();
    if (
      msg.includes('api key') ||
      msg.includes('unauthor') ||
      e?.status === 401 ||
      e?.status === 403
    ) {
      disableFeature('vision', 'auth');
      throw new VisionClientError('Auth error pada Gemini vision.', 'auth');
    }
    if (msg.includes('quota') || msg.includes('rate') || e?.status === 429) {
      disableFeature('vision', 'quota');
      throw new VisionClientError('Quota Gemini vision tercapai.', 'quota');
    }
    throw new VisionClientError(e?.message || 'Network error', 'network');
  } finally {
    clearTimeout(timeout);
  }
}

export function _resetForTest(): void {
  _genAi = null;
}

export function getVisionError() {
  return getFeatureError('vision');
}
