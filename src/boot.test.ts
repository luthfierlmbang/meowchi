import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { useStore } from './state/store';
import { boot } from './boot';
import * as preloader from './assets/Asset_Preloader';
import * as sound from './engine/sound';

vi.mock('./assets/Asset_Preloader', () => ({
  preloadAll: vi.fn(() => Promise.resolve()),
}));

vi.mock('./engine/sound', () => ({
  preloadSounds: vi.fn(),
  unlockAmbientAudio: vi.fn(),
  playCatSound: vi.fn(),
  setSleepPurring: vi.fn(),
}));

describe('Boot sequence offline catch-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wakes up the cat if energy reaches 100 while sleeping offline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00+07:00'));
    useStore.getState()._resetToDefaults();
    
    // Set pet to sleeping and energy to 80, checked 2 hours ago
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    useStore.setState({
      pet: {
        currentState: 'sleeping',
        stats: { hunger: 100, energy: 80, bladder: 100, happiness: 100 },
        position: { x: 100, y: 100 },
        lastChecked: twoHoursAgo,
        lastInteractionAt: Date.now(),
      }
    });

    // Run boot sequence.
    // Recharging at +20/h, 2 hours is +40, so energy will reach 100 (clamped).
    await boot();

    const pet = useStore.getState().pet;
    expect(pet.stats.energy).toBe(100);
    expect(pet.currentState).toBe('idle');
  });

  it('keeps the cat sleeping at full energy during scheduled sleep hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T23:00:00+07:00'));
    useStore.getState()._resetToDefaults();

    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    useStore.setState({
      pet: {
        currentState: 'sleeping',
        stats: { hunger: 100, energy: 80, bladder: 100, happiness: 100 },
        position: { x: 100, y: 100 },
        lastChecked: twoHoursAgo,
        lastInteractionAt: Date.now(),
      }
    });

    await boot();

    const pet = useStore.getState().pet;
    expect(pet.stats.energy).toBe(100);
    expect(pet.currentState).toBe('sleeping');
  });

  it('keeps the cat sleeping if energy is still below 100 after offline catch-up', async () => {
    useStore.getState()._resetToDefaults();
    
    // Set pet to sleeping and energy to 50, checked 1 hour ago
    const oneHourAgo = Date.now() - 1 * 3600 * 1000;
    useStore.setState({
      pet: {
        currentState: 'sleeping',
        stats: { hunger: 100, energy: 50, bladder: 100, happiness: 100 },
        position: { x: 100, y: 100 },
        lastChecked: oneHourAgo,
        lastInteractionAt: Date.now(),
      }
    });

    // Run boot.
    // +20 energy in 1 hour -> energy 70
    await boot();

    const pet = useStore.getState().pet;
    expect(pet.stats.energy).toBe(70);
    expect(pet.currentState).toBe('sleeping'); // Still sleeping
  });
});
