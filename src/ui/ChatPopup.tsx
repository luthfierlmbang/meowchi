import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { GameIcon } from '../components/GameUI';
import {
  cancelInFlight,
  CHAT_MAX_USER_CHARS,
  ChatClientError,
  clearHistory,
  getHistory,
  sendMessage,
  type ChatMessage,
} from '../gemini/chat_client';
import { getConfig } from '../state/Config_Store';
import { useStore } from '../state/store';
import { AnimatedSprite } from './AnimatedSprite';
import { MeowchiButton, MeowchiTopNav } from './MeowchiUI';

export interface ChatPopupProps {
  open: boolean;
  onClose: () => void;
}

const CHAT_FRAMES = [1, 2, 3, 4, 5, 6, 7].map((i) => `/assets/Chats/Chat-${i} 1.png`);

/**
 * Gemini chat popup (Req 8.1, 8.5, 8.6, 8.8, 8.10).
 *
 * Mobile-first: full-screen modal anchored to viewport bottom; the input row
 * is `position: sticky` at the bottom so the iOS soft keyboard pushes it into
 * view. Layout uses `100dvh` and respects safe-area insets.
 */
export function ChatPopup({ open, onClose }: ChatPopupProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after sendMessage mutates the module-level history so React
  // re-reads getHistory() on the next render.
  const [historyVer, setHistoryVer] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const stats = useStore((s) => s.pet.stats);
  const currentState = useStore((s) => s.pet.currentState);

  const happinessLocked = stats.happiness === 0;
  // Read config snapshot per render so feature-disable (auth/quota) propagates
  // immediately after the next state update.
  const cfg = getConfig();
  const chatDisabled = !cfg.chatEnabled;

  // On open: clear transient state and focus the input.
  // On close: clear history and cancel any in-flight request (Req 8.10).
  useEffect(() => {
    if (open) {
      setError(null);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    clearHistory();
    cancelInFlight();
    setLoading(false);
    setInput('');
    setError(null);
    setHistoryVer((v) => v + 1);
    return undefined;
  }, [open]);

  // Auto-scroll the message list to the bottom whenever the history grows
  // or the loading indicator toggles.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [historyVer, loading]);

  if (!open) return null;

  const history: readonly ChatMessage[] = getHistory();
  const trimmed = input.trim();
  const sendDisabled = loading || happinessLocked || chatDisabled || trimmed.length === 0;
  const inputDisabled = loading || happinessLocked || chatDisabled;

  async function handleSend() {
    if (loading || happinessLocked || chatDisabled) return;
    const text = input.trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    setInput('');
    try {
      await sendMessage({
        stats: {
          hunger: stats.hunger,
          energy: stats.energy,
          bladder: stats.bladder,
          happiness: stats.happiness,
        },
        currentState,
        userMessage: text,
      });
    } catch (err) {
      const e = err as ChatClientError | Error;
      setError(e?.message ?? 'Gagal mengirim pesan.');
    } finally {
      setLoading(false);
      // History mutated inside sendMessage — force a re-read.
      setHistoryVer((v) => v + 1);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat dengan Mochi"
      onClick={onClose}
      className="meow-chat-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="meow-screen meow-chat-screen"
      >
        <MeowchiTopNav title="Chats" back onBack={onClose} />

        <section className="meow-chat-hero">
          <AnimatedSprite frames={CHAT_FRAMES} alt="Meowchi ngobrol" className="meow-chat-animation" intervalMs={300} />
          {history.length === 0 && <h1>Apa yang mochi pengen obrolin sama Meowchi?</h1>}
        </section>

        {/* Messages */}
        <div
          ref={listRef}
          className="meow-chat-messages"
        >
          {history.length === 0 && !chatDisabled && !happinessLocked && (
            <div className="meow-chat-empty">
              Sapa Mochi! Dia akan merespons sesuai kondisinya saat ini.
            </div>
          )}
          {history.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className="meow-chat-bubble"
              data-role={m.role}
            >
              {m.text}
            </div>
          ))}
          {loading && (
            <div
              className="meow-chat-typing"
              aria-live="polite"
              aria-label="Mochi sedang mengetik"
            >
              <AnimatedSprite frames={CHAT_FRAMES} alt="" className="meow-chat-typing-sprite" intervalMs={300} />
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="meow-chat-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Input row / lock notice */}
        {happinessLocked ? (
          <div className="meow-chat-notice" data-tone="danger">
            Mochi terlalu sedih untuk berbicara.
          </div>
        ) : chatDisabled ? (
          <div className="meow-chat-notice">
            Fitur chat dinonaktifkan: API key Gemini belum dikonfigurasi.
          </div>
        ) : (
          <div className="meow-chat-input-row">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_MAX_USER_CHARS))}
              onKeyDown={handleKeyDown}
              placeholder="Pesan untuk Mochi..."
              disabled={inputDisabled}
              maxLength={CHAT_MAX_USER_CHARS}
              rows={2}
              aria-label="Tulis pesan untuk Mochi"
            />
            <MeowchiButton
              onClick={handleSend}
              disabled={sendDisabled}
            >
              <GameIcon name="play" label="Kirim pesan" />
            </MeowchiButton>
          </div>
        )}
      </div>
    </div>
  );
}
