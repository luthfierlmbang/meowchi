import { GoogleGenerativeAI } from '@google/generative-ai';
import { getConfig, disableFeature, getFeatureError } from '../state/Config_Store';
import { useStore } from '../state/store';
import type { CatState } from '../state/types';
import type { ChatMessage } from '../state/types';
export type { ChatMessage };

export const CHAT_MODEL = 'gemini-2.5-flash';
export const CHAT_TIMEOUT_MS = 30_000;
export const CHAT_MAX_USER_CHARS = 500;

export interface ChatStatsSnapshot {
  hunger: number;
  energy: number;
  bladder: number;
  happiness: number;
}

export interface ChatPayload {
  stats: ChatStatsSnapshot;
  currentState: CatState;
  userMessage: string;
}

export class ChatClientError extends Error {
  constructor(
    message: string,
    public code:
      | 'feature_disabled'
      | 'happiness_locked'
      | 'invalid_input'
      | 'in_flight'
      | 'auth'
      | 'quota'
      | 'timeout'
      | 'network'
      | 'malformed_response'
      | 'instruction_build_failed',
  ) {
    super(message);
    this.name = 'ChatClientError';
  }
}

let _inFlight: AbortController | null = null;
let _genAi: GoogleGenerativeAI | null = null;

function getGenAi(): GoogleGenerativeAI {
  const cfg = getConfig();
  if (!cfg.chatEnabled || !cfg.geminiKey) {
    throw new ChatClientError(
      'Fitur chat dinonaktifkan: API key Gemini belum dikonfigurasi.',
      'feature_disabled',
    );
  }
  if (!_genAi) {
    _genAi = new GoogleGenerativeAI(cfg.geminiKey);
  }
  return _genAi;
}

/**
 * Build the System Instruction with ONLY the allow-listed fields.
 * Throws on missing/invalid stats (Req 8.3).
 */
function buildSystemInstruction(payload: ChatPayload): string {
  const s = payload.stats;
  for (const k of ['hunger', 'energy', 'bladder', 'happiness'] as const) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
      throw new ChatClientError(`Stats invalid: ${k}`, 'instruction_build_failed');
    }
  }
  return [
    'Kamu adalah Mochi, seekor kucing abu-abu yang lucu, mandiri, dan penuh kepribadian.',
    'Balas pesan pemain seolah-olah kamu adalah kucing asli yang bisa berbicara.',
    'PENTING - SIFAT ALAMI KUCING: Tunjukkan sifat kucing yang kadang manja (ingin dielus, mendengkur "purr", minta makan) tapi di saat lain bisa sangat cuek, acuh tak acuh, semaunya sendiri, atau bahkan sedikit malas/sarkastik jika energinya sedang rendah.',
    'WAJIB: gunakan aksen kucing seperti meow, purr, hiss, mrrp, rawr dalam balasanmu.',
    'WAJIB: balas maksimum 2 kalimat DAN maksimum 200 karakter.',
    'WAJIB: cerminkan kondisi fisikmu saat ini secara akurat berdasarkan stats di bawah.',
    '',
    'Kondisi Mochi saat ini:',
    `- Hunger: ${Math.floor(s.hunger)}/100`,
    `- Energy: ${Math.floor(s.energy)}/100`,
    `- Bladder: ${Math.floor(s.bladder)}/100`,
    `- Happiness: ${Math.floor(s.happiness)}/100`,
    `- State: ${payload.currentState}`,
    '',
    'Catatan: nilai ≤ 40 berarti tidak nyaman; nilai 0 = sangat kritis. State sleeping = sedang tidur, eating = sedang makan, dst.',
  ].join('\n');
}

/**
 * Send a user message to Gemini. Returns Mochi's reply (single string).
 * Writes directly to the central Zustand store for persistent chat history.
 */
export async function sendMessage(payload: ChatPayload): Promise<ChatMessage> {
  // Pre-flight checks
  if (payload.stats.happiness === 0) {
    throw new ChatClientError('Mochi terlalu sedih untuk berbicara.', 'happiness_locked');
  }
  if (typeof payload.userMessage !== 'string' || payload.userMessage.trim().length === 0) {
    throw new ChatClientError('Pesan tidak boleh kosong.', 'invalid_input');
  }
  if (payload.userMessage.length > CHAT_MAX_USER_CHARS) {
    throw new ChatClientError(`Pesan melebihi ${CHAT_MAX_USER_CHARS} karakter.`, 'invalid_input');
  }
  if (_inFlight) {
    throw new ChatClientError('Permintaan sebelumnya masih berjalan.', 'in_flight');
  }

  const systemInstruction = buildSystemInstruction(payload); // may throw instruction_build_failed
  const genAi = getGenAi();
  const model = genAi.getGenerativeModel({ model: CHAT_MODEL, systemInstruction });

  const ac = new AbortController();
  _inFlight = ac;
  const timeout = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);

  try {
    // Run generateContent against the user message
    const response = await Promise.race([
      model.generateContent(payload.userMessage),
      new Promise<never>((_resolve, reject) => {
        ac.signal.addEventListener('abort', () => reject(new ChatClientError('Timeout', 'timeout')));
      }),
    ]);

    const text = (response as { response: { text(): string } }).response?.text?.() ?? '';
    if (!text || typeof text !== 'string') {
      throw new ChatClientError('Respons tidak valid dari Gemini.', 'malformed_response');
    }

    const userMsg: ChatMessage = { role: 'user', text: payload.userMessage, ts: Date.now() };
    const mochiMsg: ChatMessage = { role: 'mochi', text: text.trim(), ts: Date.now() };
    useStore.getState().addChatMessage(userMsg);
    useStore.getState().addChatMessage(mochiMsg);
    useStore.getState().markSocialInteraction();
    return mochiMsg;
  } catch (err) {
    console.error('[Gemini Chat Error]', err);
    const e = err as Error & { status?: number; statusText?: string };
    if (err instanceof ChatClientError) throw err;
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('api key') || msg.includes('unauthor') || e?.status === 401 || e?.status === 403) {
      disableFeature('chat', 'auth');
      throw new ChatClientError('Auth error pada Gemini chat.', 'auth');
    }
    if (msg.includes('quota') || msg.includes('rate') || e?.status === 429) {
      disableFeature('chat', 'quota');
      throw new ChatClientError('Quota Gemini chat tercapai.', 'quota');
    }
    throw new ChatClientError(e?.message || 'Network error', 'network');
  } finally {
    clearTimeout(timeout);
    _inFlight = null;
  }
}

/**
 * Get the chat history from Zustand store.
 */
export function getHistory(): readonly ChatMessage[] {
  return useStore.getState().chatHistory;
}

/**
 * Clear chat history in Zustand store.
 */
export function clearHistory(): void {
  useStore.getState().clearChatHistory();
}

/**
 * Cancel any in-flight request (used when popup closes or app unmounts).
 */
export function cancelInFlight(): void {
  if (_inFlight) {
    _inFlight.abort();
    _inFlight = null;
  }
}

/**
 * Test-only: reset the genAi client reference.
 */
export function _resetForTest(): void {
  _inFlight = null;
  _genAi = null;
}

/**
 * Get the chat feature error if any (for UI display).
 */
export function getChatError() {
  return getFeatureError('chat');
}
