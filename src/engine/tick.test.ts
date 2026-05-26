import { describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { runTickOnce } from './tick';

describe('Ticker Sleep/Wake logic', () => {
  it('recharges energy when sleeping during live tick', () => {
    // Reset to defaults
    useStore.getState()._resetToDefaults();
    
    // Set state to sleeping and energy to 50
    useStore.getState().setPetState('sleeping');
    useStore.getState().setPetStats({
      hunger: 100,
      energy: 50,
      bladder: 100,
      happiness: 100,
    });

    // Run tick once (60 seconds, or 1/60th of an hour)
    // Recharge rate: +20/h -> +0.3333333333333333 per tick
    runTickOnce();

    const stats = useStore.getState().pet.stats;
    expect(stats.energy).toBeCloseTo(50.333, 3);
    // Other stats should decay: Hunger -0.1 (rate 6/h), Bladder -0.0833 (rate 5/h)
    expect(stats.hunger).toBeCloseTo(99.9, 3);
    expect(stats.bladder).toBeCloseTo(99.9167, 3);
  });

  it('keeps recharging energy while happiness decays from social neglect during sleep', () => {
    useStore.getState()._resetToDefaults();
    useStore.setState((s) => ({
      pet: {
        ...s.pet,
        currentState: 'sleeping',
        stats: {
          hunger: 100,
          energy: 50,
          bladder: 100,
          happiness: 80,
        },
        lastInteractionAt: Date.now() - 4 * 3_600_000,
      },
    }));

    runTickOnce();

    const stats = useStore.getState().pet.stats;
    expect(stats.energy).toBeCloseTo(50.333, 3);
    expect(stats.happiness).toBeCloseTo(79.933, 3);
  });

  it('triggers wake_up when sleeping energy reaches 100 during live tick', () => {
    useStore.getState()._resetToDefaults();
    useStore.getState().setPetState('sleeping');
    // Energy is 99.9 (so next tick it reaches 100)
    useStore.getState().setPetStats({
      hunger: 100,
      energy: 99.9,
      bladder: 100,
      happiness: 100,
    });

    const onForcedEvent = vi.fn();
    runTickOnce({ onForcedEvent });

    const stats = useStore.getState().pet.stats;
    expect(stats.energy).toBe(100);
    expect(onForcedEvent).toHaveBeenCalledWith({ kind: 'wake_up' });
  });

  it('decays energy normally when not sleeping', () => {
    useStore.getState()._resetToDefaults();
    useStore.getState().setPetState('idle');
    useStore.getState().setPetStats({
      hunger: 100,
      energy: 50,
      bladder: 100,
      happiness: 100,
    });

    runTickOnce();

    const stats = useStore.getState().pet.stats;
    // Energy rate: -4/h -> -0.0667 per tick
    expect(stats.energy).toBeCloseTo(49.933, 3);
  });
});
