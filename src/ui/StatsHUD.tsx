/**
 * StatsHUD — compact 2x2 grid of Hunger/Energy/Bladder/Happiness for the
 * Room overlay (Req 2.1). Mobile-first: fits in ~360 px portrait. Reads
 * UI-floored stats via `uiInt` and reuses `ProgressBar` + `GameIcon`
 * primitives from `components/GameUI` (Design §2, §5).
 */
import type { CSSProperties } from 'react';
import { uiInt } from '../engine/stat_engine';
import { useStore } from '../state/store';

interface StatRowProps {
  icon: string;
  /** Already UI-floored integer in [0, 100]. */
  value: number;
  label: string;
}

function StatRow({ icon, value, label }: StatRowProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const tone = clampedValue <= 25 ? 'low' : clampedValue <= 55 ? 'medium' : 'high';
  return (
    <div className="meow-stat" aria-label={`${label}: ${clampedValue}`}>
      <div className="meow-stat-label">
        <img src={icon} alt="" draggable={false} />
        <span>{label}</span>
      </div>
      <div
        className="meow-stat-track"
        data-tone={tone}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedValue}
        style={{ '--meow-stat-value': `${clampedValue}%` } as CSSProperties}
      >
        <span />
        <em>{clampedValue}%</em>
      </div>
    </div>
  );
}

export function StatsHUD() {
  const stats = useStore((s) => s.pet.stats);
  return (
    <div className="meow-stats-panel">
      <StatRow icon="/assets/figma/stat-happiness.png" value={uiInt(stats.happiness)} label="Happiness" />
      <StatRow icon="/assets/figma/stat-hungry.png" value={uiInt(stats.hunger)} label="Hungry" />
      <StatRow icon="/assets/figma/stat-energy.png" value={uiInt(stats.energy)} label="Energy" />
      <StatRow icon="/assets/figma/stat-bladder.png" value={uiInt(stats.bladder)} label="Bladder" />
    </div>
  );
}
