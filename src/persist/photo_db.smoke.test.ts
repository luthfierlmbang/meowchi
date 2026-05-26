/**
 * Smoke test: IndexedDB unavailable read-only mode (Req 12.8).
 *
 * When `indexedDB` is missing from the global scope, `photo_db.isAvailable()`
 * must resolve to `false` so the photo album can render in read-only mode
 * (uploads/deletes disabled).
 *
 * **Validates: Requirements 12.8**
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetForTest, isAvailable } from './photo_db';

describe('Smoke: IndexedDB unavailable read-only mode', () => {
  beforeEach(() => {
    _resetForTest();
  });

  afterEach(() => {
    _resetForTest();
  });

  it('isAvailable returns false when indexedDB is undefined on globalThis', async () => {
    const target = globalThis as unknown as { indexedDB?: unknown };
    const original = target.indexedDB;
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const ok = await isAvailable();
      expect(ok).toBe(false);
    } finally {
      // Restore the original descriptor so subsequent tests still see fake-indexeddb.
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
      } else {
        Object.defineProperty(globalThis, 'indexedDB', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
      _resetForTest();
    }
  });

  it('isAvailable returns true when indexedDB is present (sanity check via fake-indexeddb)', async () => {
    // setup.ts imports `fake-indexeddb/auto`, so indexedDB is defined here.
    expect(typeof indexedDB).not.toBe('undefined');
    const ok = await isAvailable();
    expect(ok).toBe(true);
  });
});
