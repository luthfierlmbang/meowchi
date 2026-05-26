import { GameIcon } from '../components/GameUI';
import type { UserPhoto } from '../state/types';

export interface PhotoFullViewProps {
  photo: UserPhoto | null;
  onClose: () => void;
}

/**
 * Full-screen overlay that shows a single `UserPhoto` letterboxed within the
 * viewport. Tapping the backdrop closes the view; the close button at the
 * top-right offers an explicit dismiss target with a 44×44 minimum touch
 * area (Req 12.4, Design §5).
 *
 * NOTE: `GameButton` in `GameUI.tsx` does not currently expose an `onClick`
 * prop, so we use a thin `<button>` wrapper that renders `GameIcon` directly
 * to avoid mutating shared chrome.
 */
export function PhotoFullView({ photo, onClose }: PhotoFullViewProps) {
  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 16,
      }}
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 12,
          minWidth: 44,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          background: 'rgba(0,0,0,0.6)',
          border: '2px solid var(--primary-200, #e1bb17)',
          borderRadius: 8,
          color: 'var(--primary-200, #e1bb17)',
          cursor: 'pointer',
        }}
      >
        <GameIcon name="close" label="Tutup" />
      </button>

      <img
        className="pixel-img"
        src={photo.base64Data}
        alt={`Foto ${photo.uploadedAt}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'var(--primary-200, #e1bb17)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 800,
          pointerEvents: 'none',
        }}
      >
        {photo.uploadedAt}
      </div>
    </div>
  );
}
