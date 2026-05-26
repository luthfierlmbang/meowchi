import type { UserPhoto } from '../state/types';

export const DB_NAME = 'Mochi_Photos_DB';
export const DB_VERSION = 1;
export const STORE_NAME = 'photos';
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export class PhotoDbError extends Error {
  constructor(
    message: string,
    public code:
      | 'unavailable'
      | 'invalid_mime'
      | 'too_large'
      | 'tx_failed'
      | 'open_failed'
      | 'collision_overflow',
  ) {
    super(message);
    this.name = 'PhotoDbError';
  }
}

let _dbPromise: Promise<IDBDatabase> | null = null;
let _availabilityCache: boolean | null = null;

/**
 * Detect if IndexedDB is usable in the current environment.
 * Returns false when `indexedDB` is missing (Req 12.8 read-only fallback).
 */
export async function isAvailable(): Promise<boolean> {
  if (_availabilityCache !== null) return _availabilityCache;
  if (typeof indexedDB === 'undefined') {
    _availabilityCache = false;
    return false;
  }
  try {
    await openDb();
    _availabilityCache = true;
    return true;
  } catch {
    _availabilityCache = false;
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new PhotoDbError('IndexedDB tidak tersedia', 'unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new PhotoDbError(`Gagal membuka ${DB_NAME}`, 'open_failed'));
    req.onblocked = () => reject(new PhotoDbError('IndexedDB terblokir', 'open_failed'));
  });
  return _dbPromise;
}

/**
 * Validate a Blob/File before any IndexedDB transaction.
 */
export function validateBlob(blob: Blob): void {
  if (!ACCEPTED_MIME.includes(blob.type as AcceptedMime)) {
    throw new PhotoDbError(
      `MIME tidak diizinkan. Hanya ${ACCEPTED_MIME.join(', ')} didukung.`,
      'invalid_mime',
    );
  }
  if (blob.size > MAX_BYTES) {
    throw new PhotoDbError('Ukuran berkas melebihi 5 MB.', 'too_large');
  }
}

function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca berkas'));
    reader.readAsDataURL(blob);
  });
}

function toDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Add a photo. Validates MIME and size before opening a transaction.
 * On id collision, retries with `-2`, `-3`, ... suffixes (Req 12.3).
 */
export async function addPhoto(blob: Blob): Promise<UserPhoto> {
  validateBlob(blob); // throws PhotoDbError on invalid

  const base64Data = await blobToBase64DataUrl(blob);
  const uploadedAt = toDDMMYYYY(new Date());
  const baseId = `photo_${Date.now()}`;
  const db = await openDb();

  for (let suffix = 0; suffix < 100; suffix++) {
    const id = suffix === 0 ? baseId : `${baseId}-${suffix + 1}`;
    const photo: UserPhoto = { id, base64Data, uploadedAt };
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(photo);
        req.onsuccess = () => resolve();
        req.onerror = () => {
          // ConstraintError is the expected collision case; reject so the loop retries
          reject(req.error ?? new Error('add failed'));
        };
        tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
        tx.onabort = () => reject(tx.error ?? new Error('tx aborted'));
      });
      return photo;
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'ConstraintError') {
        // collision — try next suffix
        continue;
      }
      throw new PhotoDbError(`Gagal menyimpan foto: ${e?.message ?? 'unknown'}`, 'tx_failed');
    }
  }
  throw new PhotoDbError('Gagal menemukan id unik untuk foto setelah 100 percobaan', 'collision_overflow');
}

/**
 * Get a photo by id (round-trip).
 */
export async function getById(id: string): Promise<UserPhoto | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as UserPhoto | undefined);
    req.onerror = () => reject(new PhotoDbError('Gagal membaca foto', 'tx_failed'));
  });
}

/**
 * Get all photos sorted descending by id (newest first, Req 12.4).
 */
export async function getAll(): Promise<UserPhoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const items = (req.result as UserPhoto[]) ?? [];
      items.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
      resolve(items);
    };
    req.onerror = () => reject(new PhotoDbError('Gagal membaca daftar foto', 'tx_failed'));
  });
}

/**
 * Delete a photo by id (Req 12.5 — caller is responsible for confirmation dialog).
 */
export async function deletePhoto(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new PhotoDbError('Gagal menghapus foto', 'tx_failed'));
    tx.onabort = () => reject(new PhotoDbError('Transaksi delete dibatalkan', 'tx_failed'));
  });
}

/**
 * Reset internal caches (test-only).
 */
export function _resetForTest(): void {
  _dbPromise = null;
  _availabilityCache = null;
}
