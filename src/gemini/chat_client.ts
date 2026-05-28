import { disableFeature, getFeatureError } from '../state/Config_Store';
import { useStore } from '../state/store';
import type { CatState } from '../state/types';
import type { ChatMessage } from '../state/types';
import { cancelAllTransientTimers } from '../engine/transient_timers';
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
type ChatIntent = 'sleep' | 'wake' | null;

function detectChatIntent(message: string): ChatIntent {
  const normalized = message.toLowerCase();
  if (
    /\b(bangun|wake|wake up|wakeup|bangunin|ayo bangun)\b/.test(normalized)
  ) {
    return 'wake';
  }
  if (
    /\b(tidur|bobo|bobok|boboin|sleep|sleepy|istirahat|rebahan)\b/.test(normalized)
  ) {
    return 'sleep';
  }
  return null;
}

function appendLocalExchange(userText: string, replyText: string): ChatMessage {
  const now = Date.now();
  const userMsg: ChatMessage = { role: 'user', text: userText, ts: now };
  const mochiMsg: ChatMessage = { role: 'mochi', text: replyText, ts: now + 1 };
  const state = useStore.getState();
  state.addChatMessage(userMsg);
  state.addChatMessage(mochiMsg);
  state.markSocialInteraction(now);
  return mochiMsg;
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
  if (typeof payload.userMessage !== 'string' || payload.userMessage.trim().length === 0) {
    throw new ChatClientError('Pesan tidak boleh kosong.', 'invalid_input');
  }
  if (payload.userMessage.length > CHAT_MAX_USER_CHARS) {
    throw new ChatClientError(`Pesan melebihi ${CHAT_MAX_USER_CHARS} karakter.`, 'invalid_input');
  }
  if (_inFlight) {
    throw new ChatClientError('Permintaan sebelumnya masih berjalan.', 'in_flight');
  }

  const text = payload.userMessage.trim();
  if (payload.currentState === 'focusing') {
    return appendLocalExchange(text, 'Mochi lagi fokus dulu, meow.');
  }
  const intent = detectChatIntent(text);
  if (intent === 'wake') {
    cancelAllTransientTimers();
    useStore.getState().setPetState('idle');
    return appendLocalExchange(text, 'Meow... Mochi bangun.');
  }
  if (intent === 'sleep') {
    cancelAllTransientTimers();
    useStore.getState().setPetState('sleeping');
    return appendLocalExchange(text, 'Mochi tidur dulu... zzzz');
  }
  if (payload.currentState === 'sleeping') {
    return appendLocalExchange(text, 'zzzz');
  }

  if (payload.stats.happiness === 0) {
    throw new ChatClientError('Mochi terlalu sedih untuk berbicara.', 'happiness_locked');
  }

  buildSystemInstruction(payload); // validate stats before calling backend

  const ac = new AbortController();
  _inFlight = ac;
  const timeout = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ac.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        ac.signal.addEventListener('abort', () => reject(new ChatClientError('Timeout', 'timeout')));
      }),
    ]);

    const res = response as Response;
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) {
      throw new ChatClientError(data.error || 'Gemini chat gagal.', res.status === 429 ? 'quota' : 'network');
    }
    const text = data.text ?? '';
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
      throw new ChatClientError('Gemini sedang kena rate limit. Tunggu sebentar lalu coba lagi.', 'quota');
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
}

/**
 * Get the chat feature error if any (for UI display).
 */
export function getChatError() {
  return getFeatureError('chat');
}
