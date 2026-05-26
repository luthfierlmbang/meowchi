/**
 * Shop modal — purchase furniture (scratcher / toy / litterbox).
 *
 * Requirements: 11.1, 11.2, 11.3
 * Design: §5, §15
 *
 * - Mobile-first full-screen modal (`position: fixed; inset: 0`); backdrop click closes.
 * - Vertical scrollable list; each row has ~64 px sprite + label + price + "Beli" button.
 * - Click "Beli" → `purchase(type)`. On success: info toast. On `insufficient_coins`: warning toast.
 * - Reuses `GameButton` / `GameIcon` from GameUI.
 */
import { GameButton, GameIcon } from '../components/GameUI';
import { ASSET_MAP } from '../assets/Asset_Map';
import { DIMS, LABELS, PRICES, purchase } from '../features/shop/shop';
import { useStore } from '../state/store';
import { showToast } from './Toast';
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
        gap: 12,
        alignItems: 'center',
        padding: 12,
        background: 'var(--secondary-500, #42224d)',
        borderRadius: 8,
      }}
    >
      <img
        className="pixel-img"
        src={spriteUrlFor(type)}
        alt={LABELS[type]}
        draggable={false}
        style={{ width: 64, height: 64, objectFit: 'contain' }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            color: 'var(--primary-200, #e1bb17)',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {LABELS[type]}
        </div>
        <div
          style={{
            color: 'var(--secondary-100, #d96eff)',
            fontSize: 10,
            fontWeight: 700,
            marginTop: 2,
          }}
        >
          {dims.width}×{dims.height} px
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            color: 'var(--primary-100, #ffd41a)',
            fontSize: 12,
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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        zIndex: 2400,
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
          }}
        >
          <strong style={{ color: 'var(--primary-200, #e1bb17)', fontSize: 14 }}>Toko</strong>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--primary-100, #ffd41a)',
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <GameIcon name="gold" />
            {coins.toLocaleString('id-ID')}
          </div>
          <GameButton
            iconOnly
            iconLeft="close"
            tone="secondary"
            onClick={onClose}
            aria-label="Tutup toko"
          />
        </header>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
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
