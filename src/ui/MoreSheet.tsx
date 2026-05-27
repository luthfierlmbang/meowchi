import { GameIcon, type IconName } from '../components/GameUI';
import { MeowchiTopNav } from './MeowchiUI';

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  onSleep: () => void;
  onChat: () => void;
  onAlbum: () => void;
  onInventory: () => void;
  onFocus: () => void;
  onSettings: () => void;
  onLogout: () => void;
  isSleeping: boolean;
}

interface SheetBtnProps {
  icon: IconName;
  label: string;
  sublabel?: string;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'danger';
}

function SheetBtn({ icon, label, sublabel, onClick, tone = 'default' }: SheetBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="meow-sheet-row"
    >
      <span className="meow-sheet-icon" data-tone={tone}>
        <GameIcon name={icon} />
      </span>
      <span className="meow-sheet-copy">
        <strong>{label}</strong>
        {sublabel && <small>{sublabel}</small>}
      </span>
      <GameIcon name="chevron-right" />
    </button>
  );
}

export function MoreSheet({
  open,
  onClose,
  onSleep,
  onChat,
  onAlbum,
  onInventory,
  onFocus,
  onSettings,
  onLogout,
  isSleeping,
}: MoreSheetProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="meow-sheet-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="meow-bottom-sheet"
      >
        <div className="meow-sheet-swiper" />
        <MeowchiTopNav title="Menu" />
        <div className="meow-sheet-hero-icon" aria-hidden="true">
          <GameIcon name="menu" />
        </div>
        <h2>Mau ngapain bareng Meowchi?</h2>

        <SheetBtn
          icon={isSleeping ? 'play' : 'pause'}
          label={isSleeping ? 'Bangunkan Mochi' : 'Tidurkan Mochi'}
          sublabel={isSleeping ? 'Mochi sedang tidur' : 'Mochi akan beristirahat'}
          onClick={() => { onSleep(); onClose(); }}
          tone={isSleeping ? 'default' : 'warning'}
        />
        <SheetBtn
          icon="bell"
          label="Chat dengan Mochi"
          sublabel="Ngobrol bareng Mochi"
          onClick={() => { onChat(); onClose(); }}
        />
        <SheetBtn
          icon="trophy"
          label="Mulai Fokus"
          sublabel="Timer produktif bareng Mochi"
          onClick={() => { onFocus(); onClose(); }}
        />
        <SheetBtn
          icon="heart"
          label="Album Foto"
          sublabel="Lihat kenangan bersama Mochi"
          onClick={() => { onAlbum(); onClose(); }}
        />
        <SheetBtn
          icon="star"
          label="Inventaris"
          sublabel="Kelola furnitur ruangan"
          onClick={() => { onInventory(); onClose(); }}
        />
        <SheetBtn
          icon="settings"
          label="Pengaturan"
          sublabel="Atur volume suara & musik"
          onClick={() => { onSettings(); onClose(); }}
        />
        <SheetBtn
          icon="key"
          label="Logout"
          sublabel="Keluar dari akun Mochi"
          onClick={() => { onLogout(); onClose(); }}
          tone="danger"
        />

        <button
          type="button"
          onClick={onClose}
          className="meow-sheet-close"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
