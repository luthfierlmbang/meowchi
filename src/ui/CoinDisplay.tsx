import { Pill } from '../components/GameUI';
import { useStore } from '../state/store';

/**
 * Coin counter pill anchored at the top-right of the Room overlay (Req 11.2,
 * design §5). Reads the live `coins` total from the persisted store and formats
 * it with Indonesian locale thousands separators. The underlying `Pill` already
 * renders the gold icon, so this component only supplies the formatted value
 * and an accessible label.
 */
export function CoinDisplay() {
  const coins = useStore((s) => s.coins);
  return (
    <div aria-label={`Koin: ${coins}`}>
      <Pill value={coins.toLocaleString('id-ID')} />
    </div>
  );
}
