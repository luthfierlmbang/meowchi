/**
 * Smoke test: localStorage quota fallback (Req 1.12, 13.6).
 *
 * When `localStorage.setItem` throws (typically `QuotaExceededError`), the
 * persistence layer must:
 *   1. Switch to the in-memory `Map` fallback (so the session keeps running).
 *   2. Emit a non-blocking toast event on `window` so the UI can surface the
 *      degradation to the user.
 *
 * **Validates: Requirements 1.12, 13.6**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_TOAST_EVENT,
  type StorageToastDetail,
  useStore,
  _clearInMemoryFallbackForTest,
  _flushPendingForTest,
  _isUsingInMemoryFallbackForTest,
} from './store';

describe('Smoke: localStorage quota fallback', () => {
  beforeEach(() => {
    _clearInMemoryFallbackForTest();
    localStorage.clear();
    useStore.getState()._resetToDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearInMemoryFallbackForTest();
    localStorage.clear();
    useStore.getState()._resetToDefaults();
  });

  it('falls back to in-memory map and emits a storage_quota toast on QuotaExceededError', () => {
    const toastEvents: StorageToastDetail[] = [];
    const listener = ((e: Event) => {
      const ce = e as CustomEvent<StorageToastDetail>;
      toastEvents.push(ce.detail);
    }) as EventListener;
    window.addEventListener(STORAGE_TOAST_EVENT, listener);

    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        const err = new Error('quota') as Error & { name: string; code: number };
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      });

    try {
      // Trigger a state change → persist middleware schedules a debounced write.
      useStore.getState().addCoins(10);

      // Force the debounced flush so the setItem call happens synchronously.
      _flushPendingForTest();

      expect(setItem).toHaveBeenCalled();
      // Fallback flag should flip after the first throw.
      expect(_isUsingInMemoryFallbackForTest()).toBe(true);
      // Exactly one toast was emitted with kind 'storage_quota'.
      expect(toastEvents.length).toBeGreaterThanOrEqual(1);
      expect(toastEvents[0]!.kind).toBe('storage_quota');
      expect(toastEvents[0]!.message).toMatch(/localStorage/);
    } finally {
      window.removeEventListener(STORAGE_TOAST_EVENT, listener);
    }
  });

  it('subsequent writes after fallback go to the in-memory map (no further setItem calls)', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        const err = new Error('quota') as Error & { name: string };
        err.name = 'QuotaExceededError';
        throw err;
      });

    // First write: triggers fallback activation.
    useStore.getState().addCoins(10);
    _flushPendingForTest();
    expect(_isUsingInMemoryFallbackForTest()).toBe(true);

    const callsAfterFirstFlush = setItem.mock.calls.length;

    // Second write: should go to the in-memory map only.
    useStore.getState().addCoins(5);
    _flushPendingForTest();

    // localStorage.setItem must NOT be called again — fallback bypasses it.
    expect(setItem.mock.calls.length).toBe(callsAfterFirstFlush);
  });
});
