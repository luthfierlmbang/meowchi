/**
 * Shop modal — purchase furniture (scratcher / toy / litterbox).
 *
 * Requirements: 11.1, 11.2, 11.3
 * Design: §5, §15
 *
 * - Mobile-first full-screen modal (`position: absolute; inset: 0`); backdrop click closes.
 * - Vertical scrollable list; each row has ~64 px sprite + label + price + "Beli" button.
 * - Click "Beli" → `purchase(type)`. On success: info toast. On `insufficient_coins`: warning toast.
 * - Reuses `GameButton` / `GameIcon` from GameUI.
 */
import { GameButton, GameIcon } from '../components/GameUI';
import { ASSET_MAP } from '../assets/Asset_Map';
import { DIMS, LABELS, PRICES, purchase } from '../features/shop/shop';
import { useStore } from '../state/store';
import { showToast } from './Toast';
import { MeowchiTopNav } from './MeowchiUI';
import type { FurnitureType } from '../state/types';

const TYPES: FurnitureType[] = ['scratcher', 'toy', 'litterbox'];

function spriteUrlFor(type: FurnitureType): string {
  switch (type) {
    case 'scratcher':
      return ASSET_MAP.items.scratcher;
    case 'toy':
      return ASSET_MAP.items.toy;
    case 'litterbox':
      return ASSET_MAP.items.litterbox_clean;
  }
}

interface ShopRowProps {
  type: FurnitureType;
  coins: number;
}

function ShopRow({ type, coins }: ShopRowProps) {
  const price = PRICES[type];
  const dims = DIMS[type];
  const canAfford = coins >= price;

  function handleBuy() {
    const result = purchase(type);
    if (result.ok) {
      showToast(`Pembelian ${LABELS[type]} berhasil!`, 'info');
    } else if (result.reason === 'insufficient_coins') {
      showToast('Koin tidak cukup.', 'warning');
    } else {
      showToast('Pembelian gagal.', 'error');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        padding: 16,
        background: 'var(--meow-surface)',
        border: '2px solid #111',
        borderRadius: 18,
        boxShadow: '0 4px 0 #111',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--meow-surface-muted)',
          border: '2px solid #111',
          borderRadius: 14,
          flexShrink: 0,
        }}
      >
        <img
          className="pixel-img"
          src={spriteUrlFor(type)}
          alt={LABELS[type]}
          draggable={false}
          style={{ width: 54, height: 54, objectFit: 'contain' }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            color: 'var(--meow-text)',
            fontFamily: 'var(--meow-body)',
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          {LABELS[type]}
        </div>
        <div
          style={{
            color: 'var(--meow-text-muted)',
            fontFamily: 'var(--meow-body)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Ukuran: {dims.width}×{dims.height} px
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
            color: 'var(--meow-brand)',
            fontFamily: 'var(--meow-body)',
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          <GameIcon name="gold" />
          {price}
        </div>
      </div>
      <GameButton tone="primary" onClick={handleBuy} disabled={!canAfford} showLeftIcon={false}>
        Beli
      </GameButton>
    </div>
  );
}

export interface ShopModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShopModal({ open, onClose }: ShopModalProps) {
  const coins = useStore((s) => s.coins);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Toko"
      onClick={onClose}
      className="meow-chat-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="meow-screen meow-chat-screen"
      >
        <MeowchiTopNav title="Toko Mochi" back onBack={onClose} />
        
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 8px',
            background: 'var(--meow-bg)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--meow-text-soft)', fontFamily: 'var(--meow-body)' }}>
            Koin Tersedia
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--meow-brand)',
              fontFamily: 'var(--meow-body)',
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            <GameIcon name="gold" />
            <span>{coins.toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {TYPES.map((t) => (
            <ShopRow key={t} type={t} coins={coins} />
          ))}
        </div>
      </div>
    </div>
  );
}
