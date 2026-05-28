import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { Stats } from '../state/types';
import { MeowchiButton, MeowchiTopNav } from './MeowchiUI';
import { showToast } from './Toast';

export interface AdminDashboardModalProps {
  open: boolean;
  onClose: () => void;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function AdminDashboardModal({ open, onClose }: AdminDashboardModalProps) {
  const stats = useStore((s) => s.pet.stats);
  const coins = useStore((s) => s.coins);
  const setPetStats = useStore((s) => s.setPetStats);
  const setCoins = useStore((s) => s.setCoins);
  const addCoins = useStore((s) => s.addCoins);
  const atomicApplyStatDelta = useStore((s) => s.atomicApplyStatDelta);

  const [draftCoins, setDraftCoins] = useState(String(coins));
  const [draftStats, setDraftStats] = useState<Record<keyof Stats, string>>({
    hunger: String(Math.floor(stats.hunger)),
    energy: String(Math.floor(stats.energy)),
    bladder: String(Math.floor(stats.bladder)),
    happiness: String(Math.floor(stats.happiness)),
  });
  const [rewardCoins, setRewardCoins] = useState('50');
  const [rewardMood, setRewardMood] = useState('15');
  const [rewardEnergyCost, setRewardEnergyCost] = useState('20');

  useEffect(() => {
    if (!open) return;
    setDraftCoins(String(coins));
    setDraftStats({
      hunger: String(Math.floor(stats.hunger)),
      energy: String(Math.floor(stats.energy)),
      bladder: String(Math.floor(stats.bladder)),
      happiness: String(Math.floor(stats.happiness)),
    });
  }, [open, coins, stats.hunger, stats.energy, stats.bladder, stats.happiness]);

  if (!open) return null;

  const updateStatDraft = (key: keyof Stats, value: string) => {
    setDraftStats((prev) => ({ ...prev, [key]: value }));
  };

  const applyStats = () => {
    setCoins(Math.max(0, Math.floor(numberFromInput(draftCoins, coins))));
    setPetStats({
      hunger: clampPercent(numberFromInput(draftStats.hunger, stats.hunger)),
      energy: clampPercent(numberFromInput(draftStats.energy, stats.energy)),
      bladder: clampPercent(numberFromInput(draftStats.bladder, stats.bladder)),
      happiness: clampPercent(numberFromInput(draftStats.happiness, stats.happiness)),
    });
    showToast('Dashboard maintain tersimpan.', 'info');
  };

  const applyReward = () => {
    const coinDelta = Math.floor(numberFromInput(rewardCoins, 0));
    const moodDelta = Math.floor(numberFromInput(rewardMood, 0));
    const energyCost = Math.floor(numberFromInput(rewardEnergyCost, 0));
    addCoins(coinDelta);
    atomicApplyStatDelta({
      happiness: moodDelta,
      energy: -energyCost,
    });
    showToast('Reward admin diterapkan.', 'info');
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Dashboard Maintain" onClick={onClose} className="meow-chat-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="meow-screen meow-chat-screen meow-admin-screen">
        <MeowchiTopNav title="Maintain" back onBack={onClose} />

        <section className="meow-admin-panel">
          <h2>Status Mochi</h2>
          <label className="meow-admin-field">
            <span>Koin</span>
            <input type="number" min={0} value={draftCoins} onChange={(e) => setDraftCoins(e.target.value)} />
          </label>
          {([
            ['hunger', 'Hunger'],
            ['energy', 'Energy'],
            ['bladder', 'Bladder'],
            ['happiness', 'Mood'],
          ] as Array<[keyof Stats, string]>).map(([key, label]) => (
            <label className="meow-admin-field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draftStats[key]}
                onChange={(e) => updateStatDraft(key, e.target.value)}
              />
            </label>
          ))}
          <MeowchiButton onClick={applyStats}>Simpan Status</MeowchiButton>
        </section>

        <section className="meow-admin-panel">
          <h2>Reward Cepat</h2>
          <label className="meow-admin-field">
            <span>Tambah koin</span>
            <input type="number" value={rewardCoins} onChange={(e) => setRewardCoins(e.target.value)} />
          </label>
          <label className="meow-admin-field">
            <span>Tambah mood</span>
            <input type="number" value={rewardMood} onChange={(e) => setRewardMood(e.target.value)} />
          </label>
          <label className="meow-admin-field">
            <span>Kurangi energy</span>
            <input type="number" min={0} value={rewardEnergyCost} onChange={(e) => setRewardEnergyCost(e.target.value)} />
          </label>
          <MeowchiButton tone="success" onClick={applyReward}>Terapkan Reward</MeowchiButton>
        </section>
      </div>
    </div>
  );
}
