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
import { MeowchiTopNav } from './MeowchiUI';

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
        className="meow-chat-backdrop"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="meow-screen meow-chat-screen"
        >
          <MeowchiTopNav title="Habit Tracker" back onBack={onClose} />

          {/* Controlled tab strip reusing GameUI's line-tab classes. */}
          <div
            className="line-tab-group"
            role="tablist"
            style={{ width: '100%', padding: '12px 18px 0', display: 'flex', borderBottom: '2px solid var(--meow-border)' }}
          >
            <button
              type="button"
              className="line-tab"
              role="tab"
              aria-selected={tab === 'routine'}
              data-active={tab === 'routine'}
              onClick={() => setTab('routine')}
              style={{
                minHeight: 44,
                color: tab === 'routine' ? 'var(--meow-brand)' : 'var(--meow-text-soft)',
                borderColor: tab === 'routine' ? 'var(--meow-brand)' : 'transparent',
                borderBottomWidth: 3,
                fontFamily: 'var(--meow-body)',
                fontSize: 14,
                fontWeight: 800,
                background: 'transparent',
                cursor: 'pointer',
              }}
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
              style={{
                minHeight: 44,
                color: tab === 'main' ? 'var(--meow-brand)' : 'var(--meow-text-soft)',
                borderColor: tab === 'main' ? 'var(--meow-brand)' : 'transparent',
                borderBottomWidth: 3,
                fontFamily: 'var(--meow-body)',
                fontSize: 14,
                fontWeight: 800,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Utama
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 18px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
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
                      gap: 14,
                      padding: 16,
                      minHeight: 64,
                      background: done
                        ? 'var(--meow-surface-muted)'
                        : 'var(--meow-surface)',
                      border: '2px solid #111',
                      borderRadius: 18,
                      boxShadow: done ? 'none' : '0 4px 0 #111',
                      cursor: done ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      opacity: done ? 0.6 : 1,
                      transform: done ? 'translateY(2px)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <Checkbox checked={done} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: done
                          ? 'var(--meow-text-muted)'
                          : 'var(--meow-text)',
                        fontFamily: 'var(--meow-body)',
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {ROUTINE_HABIT_LABELS[id]}
                    </span>
                    {!done && (
                      <span
                        style={{
                          color: 'var(--meow-brand)',
                          fontSize: 12,
                          fontWeight: 800,
                          fontFamily: 'var(--meow-body)',
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
                      gap: 10,
                      padding: 16,
                      background: done
                        ? 'var(--meow-surface-muted)'
                        : 'var(--meow-surface)',
                      border: '2px solid #111',
                      borderRadius: 18,
                      boxShadow: done ? 'none' : '0 4px 0 #111',
                      opacity: done ? 0.7 : 1,
                      transform: done ? 'translateY(2px)' : 'none',
                      transition: 'all 0.15s ease',
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
                          color: done ? 'var(--meow-text-muted)' : 'var(--meow-text)',
                          fontFamily: 'var(--meow-body)',
                          fontWeight: 800,
                          fontSize: 14,
                          flex: 1,
                        }}
                      >
                        {MAIN_HABIT_LABELS[id]}
                      </strong>
                      <span
                        style={{
                          color: done ? 'var(--meow-text-muted)' : 'var(--meow-brand)',
                          fontSize: 13,
                          fontWeight: 800,
                          fontFamily: 'var(--meow-body)',
                        }}
                      >
                        +{LARGE_COIN_REWARD}
                      </span>
                    </div>
                    <div
                      style={{
                        color: 'var(--meow-text-soft)',
                        fontFamily: 'var(--meow-body)',
                        fontSize: 12,
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
