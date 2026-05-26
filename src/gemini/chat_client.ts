import { GoogleGenerativeAI } from '@google/generative-ai';
import { getConfig, disableFeature, getFeatureError } from '../state/Config_Store';
import type { CatState } from '../state/types';

export const CHAT_MODEL = 'gemini-2.0-flash';
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

export interface ChatMessage {
  role: 'user' | 'mochi';
  text: string;
  ts: number; // ms epoch
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

let _history: ChatMessage[] = [];
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
    'Kamu adalah Mochi, seekor kucing abu-abu yang lucu dan menggemaskan.',
    'Balas pesan pemain seolah-olah kamu adalah kucing yang sedang berbicara.',
    'WAJIB: gunakan aksen kucing seperti meow, purr, hiss, mrrp dalam balasanmu.',
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
 *
 * Throws ChatClientError on:
 *  - feature_disabled: chat disabled (key missing or previously errored)
 *  - happiness_locked: Happiness === 0 (caller should pre-empt)
 *  - invalid_input: empty or oversized userMessage
 *  - in_flight: another request is pending
 *  - auth/quota: Gemini API rejected with auth/quota (also calls disableFeature)
 *  - timeout: 30 s without response (caller treats as failure)
 *  - network/malformed_response: any other failure
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

  const userMsg: ChatMessage = { role: 'user', text: payload.userMessage, ts: Date.now() };
  _history.push(userMsg);

  const systemInstruction = buildSystemInstruction(payload); // may throw instruction_build_failed
  const genAi = getGenAi();
  const model = genAi.getGenerativeModel({ model: CHAT_MODEL, systemInstruction });

  const ac = new AbortController();
  _inFlight = ac;
  const timeout = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);

  try {
    // Run generateContent against the user message; we don't pass full history
    // because the System Instruction already encodes pet state and we keep
    // history visual-only (per design: in-memory only, not replayed to API).
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

    const mochiMsg: ChatMessage = { role: 'mochi', text: text.trim(), ts: Date.now() };
    _history.push(mochiMsg);
    return mochiMsg;
  } catch (err) {
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
 * Get the in-memory chat history (read-only copy).
 */
export function getHistory(): readonly ChatMessage[] {
  return _history.slice();
}

/**
 * Clear chat history (called on popup close and on app reload).
 */
export function clearHistory(): void {
  _history = [];
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
 * Test-only: reset the module to a clean state.
 */
export function _resetForTest(): void {
  _history = [];
  _inFlight = null;
  _genAi = null;
}

/**
 * Get the chat feature error if any (for UI display).
 */
export function getChatError() {
  return getFeatureError('chat');
}
