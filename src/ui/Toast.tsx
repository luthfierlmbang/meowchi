import { useEffect, useState } from 'react';
import { Banner } from '../components/GameUI';
import { STORAGE_TOAST_EVENT, type StorageToastDetail } from '../state/store';

export type ToastKind = 'info' | 'warning' | 'error';

interface ToastEntry {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_EVENT = 'mochi:toast';
const AUTO_DISMISS_MS = 5_000;

let _seq = 0;

/**
 * Programmatic API for showing a toast. Dispatches a CustomEvent that the
 * mounted Toast container listens for.
 */
export function showToast(message: string, kind: ToastKind = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<{ message: string; kind: ToastKind }>(TOAST_EVENT, {
      detail: { message, kind },
    }),
  );
}

export function Toast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    function pushToast(message: string, kind: ToastKind) {
      const id = ++_seq;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS);
    }

    function onStorageToast(e: Event) {
      const ce = e as CustomEvent<StorageToastDetail>;
      pushToast(ce.detail.message, 'warning');
    }
    function onGenericToast(e: Event) {
      const ce = e as CustomEvent<{ message: string; kind: ToastKind }>;
      pushToast(ce.detail.message, ce.detail.kind);
    }

    window.addEventListener(STORAGE_TOAST_EVENT, onStorageToast);
    window.addEventListener(TOAST_EVENT, onGenericToast);
    return () => {
      window.removeEventListener(STORAGE_TOAST_EVENT, onStorageToast);
      window.removeEventListener(TOAST_EVENT, onGenericToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          style={{
            pointerEvents: 'auto',
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <Banner>{t.message}</Banner>
        </button>
      ))}
    </div>
  );
}
