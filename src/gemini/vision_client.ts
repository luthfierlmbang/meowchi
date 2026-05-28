import { disableFeature, getFeatureError } from '../state/Config_Store';

export const VISION_MODEL = 'gemini-2.5-flash-lite';
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
  const base64 = await blobToBase64(imageBlob);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, habitDescription }),
        signal: ac.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        ac.signal.addEventListener('abort', () =>
          reject(new VisionClientError('Timeout', 'timeout')),
        );
      }),
    ]);

    const res = response as Response;
    const parsed = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const e = parsed as { error?: string } | null;
      throw new VisionClientError(e?.error || 'Gemini vision gagal.', res.status === 429 ? 'quota' : 'network');
    }
    if (!isValidVerdict(parsed)) {
      throw new VisionClientError('Skema respons tidak sesuai.', 'malformed_response');
    }
    return parsed;
  } catch (err) {
    console.error('[Gemini Vision Error]', err);
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
  // Kept for test compatibility.
}

export function getVisionError() {
  return getFeatureError('vision');
}
