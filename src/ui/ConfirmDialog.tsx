import { GameButton, GameIcon } from '../components/GameUI';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Batal',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        className="dialog-box"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative' }}
      >
        <header>
          <strong>{title}</strong>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              padding: 0,
              position: 'absolute',
              right: 14,
              top: 8,
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GameIcon name="close" />
          </button>
        </header>
        <div className="placeholder" style={{ minHeight: 80, lineHeight: 1.4 }}>
          <span>{message}</span>
        </div>
        <div className="button-pair">
          <GameButton tone="secondary" onClick={onCancel} showLeftIcon={false}>
            {cancelLabel}
          </GameButton>
          <GameButton
            tone={tone === 'destructive' ? 'negative' : 'primary'}
            onClick={onConfirm}
            showLeftIcon={false}
          >
            {confirmLabel}
          </GameButton>
        </div>
      </div>
    </div>
  );
}
