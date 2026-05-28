import { useCallback, useEffect, useState } from 'react';
import { boot } from './boot';
import { useStore } from './state/store';
import {
  conditionFlagsFromStats,
  transition,
  type StateEvent,
} from './engine/state_machine';
import { startTickLoop, stopTickLoop } from './engine/tick';
import { startStateRollLoop, stopStateRollLoop } from './engine/state_roll';
import { startWalkingLoop, stopWalkingLoop } from './engine/walking_loop';
import {
  cancelAllTransientTimers,
  scheduleEating,
  schedulePooping,
  scheduleScratching,
} from './engine/transient_timers';
import { playCatSound, setSleepPurring, unlockAmbientAudio } from './engine/sound';
import type { DragControllerHandlers } from './engine/Drag_Controller';
import { Room } from './render/Room';
import { StatsHUD } from './ui/StatsHUD';
import { ActionBar } from './ui/ActionBar';
import { MoreSheet } from './ui/MoreSheet';
import { Toast, showToast } from './ui/Toast';
import { ChatPopup } from './ui/ChatPopup';
import { ShopModal } from './ui/ShopModal';
import { InventoryDrawer } from './ui/InventoryDrawer';
import { FocusTimerModal } from './ui/FocusTimerModal';
import { PhotoAlbumModal } from './ui/PhotoAlbumModal';
import { HabitTrackerModal } from './ui/HabitTrackerModal';
import { SettingsModal } from './ui/SettingsModal';
import { AdminDashboardModal } from './ui/AdminDashboardModal';
import { SplashScreen } from './ui/SplashScreen';
import { LoadingScreen } from './ui/LoadingScreen';
import { IntroScreens, type IntroStep } from './ui/IntroScreens';
import { MeowchiTopNav } from './ui/MeowchiUI';
import {
  getCurrentSession,
  isSupabaseConfigured,
  signInOrSignUp,
  signOut,
  supabase,
} from './supabase/client';
import { loadGameSave, startCloudSync, stopCloudSync } from './supabase/game_sync';
import type { Session } from '@supabase/supabase-js';
import { isSleepHour } from './engine/sleep_schedule';

const MIN_SPLASH_MS = 700;
const MIN_LOADING_MS = 900;
const INTRO_DONE_KEY = 'meowchi_intro_done';
type BootStage = 'splash' | 'loading' | 'ready';

function isAdminSession(session: Session | null): boolean {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
  if (!raw || !session?.user.email) return false;
  const allowed = raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(session.user.email.toLowerCase());
}

/**
 * Mochi shell — wires every module into a single mobile-first viewport
 * (Req 1.1, 14.1, 14.3; design §5, §6).
 *
 * Lifecycle:
 *   1. On mount, run `boot()` once. Show a loading splash until it resolves.
 *   2. After boot, start the three game loops (tick / state-roll / walking)
 *      and route their events through the central `dispatch` reducer.
 *   3. Forced events from tick (Bladder=0, Energy=0) interrupt transient
 *      timers via `dispatchForced` before applying the new state.
 *   4. Drag handlers from Room route through the same `dispatch` so drop
 *      resolutions schedule the eating/scratching/pooping timers exactly
 *      once per entry into the transient state.
 */
export default function App() {
  const [bootStage, setBootStage] = useState<BootStage>('splash');
  const [introDone, setIntroDone] = useState(() => localStorage.getItem(INTRO_DONE_KEY) === '1');
  const [introStartStep, setIntroStartStep] = useState<IntroStep>('letter');
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [habitOpen, setHabitOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const currentState = useStore((s) => s.pet.currentState);
  const focusSession = useStore((s) => s.focusSession);
  const ready = bootStage === 'ready';

  // Run boot once on mount.
  useEffect(() => {
    let cancelled = false;
    const bootPromise = boot().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[App] boot failed:', err);
      });

    async function runBootSequence() {
      await new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
      if (cancelled) return;
      setBootStage('loading');
      await Promise.all([
        bootPromise,
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      if (!cancelled) setBootStage('ready');
    }

    void runBootSequence();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !ready) return undefined;
    let cancelled = false;

    void getCurrentSession()
      .then(async (nextSession) => {
        if (cancelled) return;
        setSession(nextSession);
        if (nextSession) {
          await loadGameSave(nextSession.user.id);
          startCloudSync(nextSession.user.id);
          localStorage.setItem(INTRO_DONE_KEY, '1');
          setIntroDone(true);
        } else {
          stopCloudSync();
          localStorage.removeItem(INTRO_DONE_KEY);
          setIntroStartStep('login');
          setIntroDone(false);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    const { data } = supabase!.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadGameSave(nextSession.user.id).then(() => startCloudSync(nextSession.user.id));
      } else {
        stopCloudSync();
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
      stopCloudSync();
    };
  }, [ready]);

  /**
   * Central state-machine driver.
   *  - Reads current state + condition flags from the store.
   *  - Runs the pure transition reducer.
   *  - Applies the resulting state via `setPetState`.
   *  - Schedules transient animation timers when entering eating/scratching/pooping.
   *  - Plays carry sound when entering 'carried'.
   */
  const dispatch = useCallback((event: StateEvent) => {
    const state = useStore.getState();
    const cur = state.pet.currentState;
    const conditions = conditionFlagsFromStats(state.pet.stats);
    const result = transition(cur, event, conditions);
    if (!result.changed) return;
    state.setPetState(result.next);
    if (result.next === 'carried') {
      void playCatSound('lift');
    } else if (result.next === 'eating') {
      scheduleEating({ onAnimationEnd: dispatch });
    } else if (result.next === 'scratching') {
      scheduleScratching({ onAnimationEnd: dispatch });
    } else if (result.next === 'pooping') {
      const cause = event.kind === 'forced_pooping' ? 'forced' : 'drop';
      schedulePooping(cause, { onAnimationEnd: dispatch });
    }
  }, []);

  useEffect(() => {
    if (!ready || focusSession?.status !== 'running') return undefined;
    const completeIfDone = () => {
      const session = useStore.getState().focusSession;
      if (session?.status === 'running' && Date.now() >= session.endsAt) {
        useStore.getState().completeFocusSession();
        setFocusOpen(true);
      }
    };
    completeIfDone();
    const id = setInterval(completeIfDone, 500);
    return () => clearInterval(id);
  }, [ready, focusSession?.id, focusSession?.status]);

  /**
   * Forced events from the tick (Bladder=0, Energy=0) interrupt any pending
   * transient timer (eating/scratching/pooping) before the new state takes
   * effect. Without this, an animation_end fired by an interrupted timer
   * could clobber the forced state with a stale 'idle' transition.
   */
  const dispatchForced = useCallback(
    (event: StateEvent) => {
      if (event.kind === 'forced_pooping' || event.kind === 'forced_sleeping') {
        cancelAllTransientTimers();
        useStore.getState().clearFocusSession();
      }
      dispatch(event);
    },
    [dispatch],
  );

  // Start game loops after boot resolves; stop and clear timers on unmount.
  useEffect(() => {
    if (!ready) return;
    startTickLoop({ onForcedEvent: dispatchForced });
    startStateRollLoop({ onRoll: dispatch });
    startWalkingLoop({ onEdgeHit: dispatch });
    return () => {
      stopTickLoop();
      stopStateRollLoop();
      stopWalkingLoop();
      cancelAllTransientTimers();
    };
  }, [ready, dispatch, dispatchForced]);

  useEffect(() => {
    if (!ready) return;

    const unlock = () => {
      unlockAmbientAudio(() => useStore.getState().pet.currentState === 'sleeping');
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    setSleepPurring(currentState === 'sleeping');
    return () => setSleepPurring(false);
  }, [ready, currentState]);

  // Auto-sleep: check every minute whether the current hour is a sleep hour.
  // If so, and the cat is not already sleeping, force it to sleep.
  useEffect(() => {
    if (!ready) return;
    function checkSleepHour() {
      const hour = new Date().getHours();
      const state = useStore.getState();
      const cs = state.pet.currentState;
      if (isSleepHour(hour) && cs !== 'sleeping' && state.pet.stats.energy < 100) {
        if (cs === 'focusing') return;
        cancelAllTransientTimers();
        dispatch({ kind: 'sleep_button' });
      } else if (!isSleepHour(hour) && cs === 'sleeping') {
        // Wake up when it's no longer sleep time (e.g., user left app open overnight)
        dispatch({ kind: 'wake_up' });
      }
    }
    checkSleepHour(); // run immediately on boot
    const id = setInterval(checkSleepHour, 60_000);
    return () => clearInterval(id);
  }, [ready, dispatch]);

  /** Feed Mochi: trigger eating animation + apply stat delta after animation. */
  const handleFeed = useCallback(() => {
    const state = useStore.getState();
    const cs = state.pet.currentState;
    if (cs === 'sleeping') {
      showToast('Mochi sedang tidur!', 'info');
      return;
    }
    if (cs === 'focusing') {
      showToast('Mochi sedang fokus!', 'info');
      return;
    }
    if (cs === 'eating') {
      showToast('Mochi sedang makan!', 'info');
      return;
    }
    if (cs === 'scratching' || cs === 'pooping') {
      showToast('Mochi sedang sibuk!', 'info');
      return;
    }
    // Trigger eating state + schedule the animation timer (same as drop on toy)
    state.setPetState('eating');
    scheduleEating({ onAnimationEnd: dispatch });
  }, [dispatch]);

  // Drag handlers for the Room — route every event through `dispatch`.
  const dragHandlers: DragControllerHandlers = {
    onEvent: dispatch,
    onPoke: (facingLeft: boolean) => {
      // Short tap → poke animation (clicked_left or clicked_right)
      void playCatSound('poke');
      dispatch({ kind: 'poke', facingLeft });
      // Auto-return to idle after 600ms
      setTimeout(() => {
        dispatch({ kind: 'animation_end' });
      }, 600);
    },
  };

  const handleLogout = useCallback(() => {
    void signOut().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[Supabase Auth] sign out failed:', err);
    });
    setSession(null);
    stopCloudSync();
    localStorage.removeItem(INTRO_DONE_KEY);
    setMoreOpen(false);
    setChatOpen(false);
    setShopOpen(false);
    setAlbumOpen(false);
    setHabitOpen(false);
    setInventoryOpen(false);
    setFocusOpen(false);
    setAdminOpen(false);
    setIntroStartStep('login');
    setIntroDone(false);
  }, []);

  if (!ready || !authReady) {
    return bootStage === 'loading' ? <LoadingScreen /> : <SplashScreen />;
  }

  if (!introDone) {
    return (
      <IntroScreens
        initialStep={introStartStep}
        onDone={async (credentials) => {
          if (isSupabaseConfigured) {
            if (!credentials) throw new Error('Email dan password wajib diisi.');
            const nextSession = await signInOrSignUp(credentials.email, credentials.password);
            if (!nextSession) {
              throw new Error('Cek email kamu untuk konfirmasi akun, lalu login lagi.');
            }
            setSession(nextSession);
            if (nextSession) {
              await loadGameSave(nextSession.user.id);
              startCloudSync(nextSession.user.id);
            }
          }
          localStorage.setItem(INTRO_DONE_KEY, '1');
          setIntroStartStep('letter');
          setIntroDone(true);
        }}
      />
    );
  }

  return (
    <main
      className="meow-screen meow-game-shell"
    >
      <MeowchiTopNav title="Mochi" menu onMenu={() => setMoreOpen(true)} />

      {/* ── Room (fills remaining space) ── */}
      <div
        className="meow-room-wrap"
      >
        <Room dragHandlers={dragHandlers} />
      </div>

      {/* ── Bottom action bar ── */}
      <ActionBar
        onFeed={handleFeed}
        onShop={() => setShopOpen(true)}
        onHabit={() => setHabitOpen(true)}
        onChat={() => setChatOpen(true)}
      />
      <StatsHUD />

      {/* More sheet */}
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        isSleeping={currentState === 'sleeping'}
        onSleep={() => {
          const cur = useStore.getState().pet.currentState;
          if (cur === 'sleeping') {
            dispatch({ kind: 'wake_up' });
          } else {
            dispatch({ kind: 'sleep_button' });
          }
        }}
        onChat={() => setChatOpen(true)}
        onAlbum={() => setAlbumOpen(true)}
        onInventory={() => setInventoryOpen(true)}
        onFocus={() => setFocusOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onAdmin={() => setAdminOpen(true)}
        showAdmin={isAdminSession(session)}
        onLogout={handleLogout}
      />

      {/* Modals */}
      <ChatPopup open={chatOpen} onClose={() => setChatOpen(false)} />
      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <PhotoAlbumModal open={albumOpen} onClose={() => setAlbumOpen(false)} />
      <HabitTrackerModal open={habitOpen} onClose={() => setHabitOpen(false)} />
      <InventoryDrawer open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
      <FocusTimerModal open={focusOpen} onClose={() => setFocusOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AdminDashboardModal open={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* Toast layer */}
      <Toast />
    </main>
  );
}
