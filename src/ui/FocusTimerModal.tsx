import { useEffect, useMemo, useState } from 'react';
import { GameIcon } from '../components/GameUI';
import type { FocusActivity } from '../state/types';
import { useStore } from '../state/store';
import { AnimatedSprite } from './AnimatedSprite';
import { MeowchiButton, MeowchiTopNav } from './MeowchiUI';
import {
  FOCUS_COIN_PER_MINUTE,
  FOCUS_ENERGY_COST_ON_COMPLETE,
  FOCUS_HAPPINESS_REWARD,
  FOCUS_MAX_COINS,
  focusRewardCoins,
} from '../features/focus/focus_rewards';

export interface FocusTimerModalProps {
  open: boolean;
  onClose: () => void;
}

const ACTIVITIES: Array<{ id: FocusActivity; label: string; frames: string[] }> = [
  {
    id: 'workout',
    label: 'Workout',
    frames: ['/assets/Walking-Right/Walking-right1 1.png', '/assets/Walking-Right/Walking-right2 1.png'],
  },
  {
    id: 'padel',
    label: 'Padel',
    frames: ['/assets/toy-action/toy-fish1.png', '/assets/toy-action/toy-fish2.png'],
  },
  {
    id: 'masak',
    label: 'Masak',
    frames: ['/assets/Eat/Eat-1 1.png', '/assets/Eat/Eat-2 1.png'],
  },
  {
    id: 'solat_ngaji',
    label: 'Solat/Ngaji',
    frames: ['/assets/Sleep/Sleep-1 1.png', '/assets/Sleep/Sleep-2 1.png'],
  },
];

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function FocusTimerModal({ open, onClose }: FocusTimerModalProps) {
  const [activity, setActivity] = useState<FocusActivity>('workout');
  const [duration, setDuration] = useState(25);
  const [now, setNow] = useState(() => Date.now());
  const focusSession = useStore((s) => s.focusSession);
  const startFocusSession = useStore((s) => s.startFocusSession);
  const stopFocusSession = useStore((s) => s.stopFocusSession);
  const clearFocusSession = useStore((s) => s.clearFocusSession);

  useEffect(() => {
    if (!open || focusSession?.status !== 'running') return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [open, focusSession?.status]);

  const activeMeta = useMemo(() => {
    const id = focusSession?.activity ?? activity;
    return ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[0];
  }, [activity, focusSession?.activity]);

  if (!open) return null;

  const isRunning = focusSession?.status === 'running';
  const isCompleted = focusSession?.status === 'completed';
  const totalMs = focusSession ? focusSession.durationMinutes * 60_000 : duration * 60_000;
  const remainingMs = focusSession ? focusSession.endsAt - now : totalMs;
  const elapsedMs = focusSession ? Math.max(0, now - focusSession.startedAt) : 0;
  const progress = focusSession ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0;
  const previewCoins = focusRewardCoins(duration);
  const rewardCoins = focusSession ? focusRewardCoins(focusSession.durationMinutes) : 0;

  return (
    <div role="dialog" aria-modal="true" aria-label="Mochi Focus Timer" onClick={onClose} className="meow-chat-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="meow-screen meow-chat-screen meow-focus-screen">
        <MeowchiTopNav title="Mochi Focus" back onBack={onClose} />

        <section className="meow-focus-hero">
          <AnimatedSprite frames={activeMeta.frames} alt="Mochi fokus" className="meow-focus-sprite" intervalMs={400} />
          <div>
            <p>{activeMeta.label}</p>
            <h1>{isRunning ? formatTime(remainingMs) : isCompleted ? 'Selesai!' : 'Mulai Fokus'}</h1>
          </div>
        </section>

        {isRunning && (
          <section className="meow-focus-panel">
            <div className="meow-focus-progress" aria-label="Progress fokus">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p>Mochi nemenin kamu fokus. Hunger dan energy tetap jalan, stat lain istirahat dulu.</p>
            <div className="meow-focus-actions">
              <MeowchiButton
                tone="danger"
                onClick={() => {
                  stopFocusSession();
                  onClose();
                }}
              >
                Stop
              </MeowchiButton>
              <MeowchiButton tone="neutral" onClick={onClose}>Tutup</MeowchiButton>
            </div>
          </section>
        )}

        {isCompleted && (
          <section className="meow-focus-panel">
            <div className="meow-focus-reward">
              <GameIcon name="gold" />
              <strong>+{rewardCoins} koin</strong>
              <span>Happiness naik, energy turun karena capek beraktivitas.</span>
            </div>
            <MeowchiButton
              onClick={() => {
                clearFocusSession();
                onClose();
              }}
            >
              Ambil
            </MeowchiButton>
          </section>
        )}

        {!isRunning && !isCompleted && (
          <section className="meow-focus-panel">
            <div className="meow-focus-activity-grid">
              {ACTIVITIES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="meow-focus-activity"
                  data-active={activity === item.id}
                  onClick={() => setActivity(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="meow-focus-duration">
              <span>Durasi fokus</span>
              <input
                type="number"
                min={1}
                max={180}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
              />
              <small>menit</small>
            </label>
            <div className="meow-focus-formula">
              <strong>Reward sesi ini</strong>
              <span>+{previewCoins} koin</span>
              <span>+{FOCUS_HAPPINESS_REWARD} happiness</span>
              <span>-{FOCUS_ENERGY_COST_ON_COMPLETE} energy saat selesai</span>
              <small>Koin dihitung {FOCUS_COIN_PER_MINUTE} per menit, maksimal {FOCUS_MAX_COINS}.</small>
            </div>
            <MeowchiButton
              onClick={() => {
                const started = startFocusSession(activity, duration);
                if (started) setNow(Date.now());
              }}
            >
              Mulai Fokus
            </MeowchiButton>
          </section>
        )}
      </div>
    </div>
  );
}
