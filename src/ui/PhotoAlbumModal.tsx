import { useEffect, useRef, useState } from 'react';
import { GameButton, GameIcon, Spinner } from '../components/GameUI';
import {
  ACCEPTED_MIME,
  addPhoto,
  deletePhoto,
  getAll,
  isAvailable,
  PhotoDbError,
} from '../persist/photo_db';
import { ConfirmDialog } from './ConfirmDialog';
import { PhotoFullView } from './PhotoFullView';
import { showToast } from './Toast';
import type { UserPhoto } from '../state/types';

export interface PhotoAlbumModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen photo album modal (Req 12.1, 12.4, 12.5, 12.8, Design §5/§12).
 *
 * - 3-column thumbnail grid using `pixel-img` for crisp scaling.
 * - Hidden `<input type="file">` triggered by the header add button.
 * - Read-only mode when IndexedDB is unavailable: hides add/delete actions
 *   and shows an explanation banner.
 * - Delete uses `ConfirmDialog` (destructive tone) before invoking
 *   `deletePhoto`.
 * - Errors thrown by `addPhoto`/`deletePhoto` (`PhotoDbError`) are surfaced
 *   via `showToast` with kind-specific copy for `invalid_mime` / `too_large`.
 */
export function PhotoAlbumModal({ open, onClose }: PhotoAlbumModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<UserPhoto | null>(null);

  // Load on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const avail = await isAvailable();
      if (cancelled) return;
      setAvailable(avail);
      if (avail) {
        try {
          const all = await getAll();
          if (!cancelled) setPhotos(all);
        } catch {
          if (!cancelled) showToast('Gagal memuat album.', 'error');
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function reloadPhotos() {
    try {
      const all = await getAll();
      setPhotos(all);
    } catch {
      showToast('Gagal memuat album.', 'error');
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    let added = 0;
    let rejected = 0;
    for (const file of Array.from(files)) {
      try {
        await addPhoto(file);
        added++;
      } catch (err) {
        const e = err as PhotoDbError;
        rejected++;
        if (e?.code === 'invalid_mime') {
          showToast(`Tipe berkas tidak didukung. Hanya: ${ACCEPTED_MIME.join(', ')}`, 'warning');
        } else if (e?.code === 'too_large') {
          showToast('Ukuran berkas melebihi 5 MB.', 'warning');
        } else {
          showToast(e?.message || 'Gagal menyimpan foto.', 'error');
        }
      }
    }
    await reloadPhotos();
    setLoading(false);
    if (added > 0 && rejected === 0) showToast(`${added} foto ditambahkan.`, 'info');
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await deletePhoto(id);
      await reloadPhotos();
      showToast('Foto dihapus.', 'info');
    } catch {
      showToast('Gagal menghapus foto.', 'error');
    }
  }

  if (!open) return null;
  const readOnly = available === false;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Album foto"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          zIndex: 2300,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 430,
            background: 'var(--secondary-600, #2e1836)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top, 0)',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              minHeight: 52,
              borderBottom: '2px solid var(--secondary-500, #42224d)',
              gap: 8,
            }}
          >
            <strong style={{ color: 'var(--primary-200, #e1bb17)', fontSize: 14, flex: 1 }}>
              Album Foto
            </strong>
            {!readOnly && (
              <GameButton
                iconOnly
                iconLeft="add"
                tone="primary"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Tambah foto"
              />
            )}
            <GameButton iconOnly iconLeft="close" tone="secondary" onClick={onClose} aria-label="Tutup album" />
          </header>
          {readOnly && (
            <div
              style={{
                padding: 12,
                color: 'var(--secondary-100, #d96eff)',
                fontWeight: 800,
                fontSize: 11,
                textAlign: 'center',
                background: 'var(--secondary-500, #42224d)',
              }}
            >
              IndexedDB tidak tersedia di perangkat ini. Mode hanya-baca aktif.
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME.join(',')}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
            }}
          >
            {loading ? (
              <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
                <Spinner phase={2} />
              </div>
            ) : photos.length === 0 ? (
              <div
                style={{
                  color: 'var(--secondary-100, #d96eff)',
                  fontSize: 12,
                  textAlign: 'center',
                  padding: 32,
                }}
              >
                Belum ada foto. {!readOnly && 'Tap tombol + untuk menambahkan.'}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                }}
              >
                {photos.map((p) => (
                  <div key={p.id} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                    <button
                      type="button"
                      onClick={() => setViewing(p)}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: 0,
                        border: 0,
                        background: 'var(--secondary-500, #42224d)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        borderRadius: 4,
                      }}
                      aria-label={`Lihat foto ${p.uploadedAt}`}
                    >
                      <img
                        className="pixel-img"
                        src={p.base64Data}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(p.id);
                        }}
                        aria-label="Hapus foto"
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          minWidth: 32,
                          minHeight: 32,
                          padding: 4,
                          background: 'rgba(0,0,0,0.6)',
                          border: '2px solid var(--negative-100, #ff2929)',
                          borderRadius: 6,
                          color: 'var(--negative-100, #ff2929)',
                          cursor: 'pointer',
                        }}
                      >
                        <GameIcon name="trash" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Hapus Foto?"
        message="Foto yang dihapus tidak dapat dikembalikan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        tone="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <PhotoFullView photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
