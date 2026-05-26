/**
 * Habit Tracker modal — Routine + Main tabs (Req 9.1, 9.3, 9.4, 9.5, 10.6).
 *
 * Mobile-first full-screen modal:
 * - Tab strip pinned at top (Rutin / Utama). Reuses GameUI's `line-tab` /
 *   `line-tab-group` CSS classes but with local controlled state (the exported
 *   `LineTabGroup` from GameUI is presentation-only with hardcoded labels).
 * - Routine list: each habit row is a tappable button (≥56 px tall) with a
 *   `Checkbox` indicator and label. Tapping rewards +5 koin via
 *   `markRoutineDone(id)` (atomic add record + addCoins inside the action).
 * - Main list: each habit shows label + description + "Verifikasi" button that
 *   opens `HabitMainCaptureModal`. Once completed today the button becomes
 *   disabled and shows "Sudah Selesai Hari Ini" (Req 10.6 anti-replay).
 *
 * Subscribes to `habit_records` so completion state updates live across the
 * modal whenever an action is dispatched (Req 9.4 daily reset is implicit
 * via `effectiveToday()` inside `isCompletedToday`).
 *
 * Design: §5, §14.
 */
import { useState } from 'react';
import { Checkbox, GameButton } from '../components/GameUI';
import {
  MAIN_HABIT_IDS,
  MAIN_HABIT_LABELS,
  MAIN_HABIT_DESCRIPTIONS,
  ROUTINE_HABIT_IDS,
  ROUTINE_HABIT_LABELS,
  LARGE_COIN_REWARD,
  STANDARD_COIN_REWARD,
  type MainHabitId,
} from '../features/habits/constants';
import { isCompletedToday, markRoutineDone } from '../features/habits/habit_tracker';
import { useStore } from '../state/store';
import { HabitMainCaptureModal } from './HabitMainCaptureModal';
import { showToast } from './Toast';

type Tab = 'routine' | 'main';

export interface HabitTrackerModalProps {
  open: boolean;
  onClose: () => void;
}

export function HabitTrackerModal({ open, onClose }: HabitTrackerModalProps) {
  const [tab, setTab] = useState<Tab>('routine');
  const [captureFor, setCaptureFor] = useState<MainHabitId | null>(null);
  // Subscribe so completion ticks update live whenever a record is added.
  useStore((s) => s.habit_records);

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Habit tracker"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          zIndex: 2200,
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
            <strong style={{ color: 'var(--primary-200, #e1bb17)', fontSize: 14 }}>
              Habit Tracker
            </strong>
            <GameButton
              iconOnly
              iconLeft="close"
              tone="secondary"
              onClick={onClose}
              aria-label="Tutup"
            />
          </header>

          {/* Controlled tab strip reusing GameUI's line-tab classes. */}
          <div
            className="line-tab-group"
            role="tablist"
            style={{ width: '100%', padding: '8px 12px 0' }}
          >
            <button
              type="button"
              className="line-tab"
              role="tab"
              aria-selected={tab === 'routine'}
              data-active={tab === 'routine'}
              onClick={() => setTab('routine')}
              style={{ minHeight: 44 }}
            >
              Rutin
            </button>
            <button
              type="button"
              className="line-tab"
              role="tab"
              aria-selected={tab === 'main'}
              data-active={tab === 'main'}
              onClick={() => setTab('main')}
              style={{ minHeight: 44 }}
            >
              Utama
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {tab === 'routine' &&
              ROUTINE_HABIT_IDS.map((id) => {
                const done = isCompletedToday(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={done}
                    onClick={() => {
                      const rewarded = markRoutineDone(id);
                      if (rewarded) {
                        showToast(`+${STANDARD_COIN_REWARD} koin!`, 'info');
                      }
                    }}
                    aria-label={ROUTINE_HABIT_LABELS[id]}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      minHeight: 56,
                      background: done
                        ? 'var(--secondary-400, #5b2f6b)'
                        : 'var(--secondary-500, #42224d)',
                      border: 0,
                      borderRadius: 8,
                      cursor: done ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      opacity: done ? 0.7 : 1,
                    }}
                  >
                    <span style={{ pointerEvents: 'none' }}>
                      <Checkbox checked={done} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: done
                          ? 'var(--secondary-100, #d96eff)'
                          : 'var(--primary-100, #ffd41a)',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      {ROUTINE_HABIT_LABELS[id]}
                    </span>
                    {!done && (
                      <span
                        style={{
                          color: 'var(--positive-100, #25ffa3)',
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        +{STANDARD_COIN_REWARD}
                      </span>
                    )}
                  </button>
                );
              })}

            {tab === 'main' &&
              MAIN_HABIT_IDS.map((id) => {
                const done = isCompletedToday(id);
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: 12,
                      background: 'var(--secondary-500, #42224d)',
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <strong
                        style={{
                          color: 'var(--primary-100, #ffd41a)',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 800,
                          fontSize: 13,
                          flex: 1,
                        }}
                      >
                        {MAIN_HABIT_LABELS[id]}
                      </strong>
                      <span
                        style={{
                          color: 'var(--positive-100, #25ffa3)',
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        +{LARGE_COIN_REWARD}
                      </span>
                    </div>
                    <div
                      style={{
                        color: 'var(--secondary-100, #d96eff)',
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      {MAIN_HABIT_DESCRIPTIONS[id]}
                    </div>
                    <GameButton
                      tone={done ? 'disabled' : 'primary'}
                      disabled={done}
                      onClick={() => setCaptureFor(id)}
                      showLeftIcon={false}
                    >
                      {done ? 'Sudah Selesai Hari Ini' : 'Verifikasi dengan Kamera'}
                    </GameButton>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <HabitMainCaptureModal
        open={captureFor !== null}
        habitId={captureFor}
        onClose={() => setCaptureFor(null)}
      />
    </>
  );
}
