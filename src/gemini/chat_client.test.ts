import { beforeEach, describe, expect, it } from 'vitest';
import { sendMessage } from './chat_client';
import { useStore } from '../state/store';

const baseStats = {
  hunger: 100,
  energy: 80,
  bladder: 100,
  happiness: 100,
};

describe('chat-driven pet state', () => {
  beforeEach(() => {
    useStore.getState()._resetToDefaults();
  });

  it('puts Mochi to sleep when the player asks via chat', async () => {
    const reply = await sendMessage({
      stats: baseStats,
      currentState: 'idle',
      userMessage: 'Mochi tidur dulu ya',
    });

    expect(useStore.getState().pet.currentState).toBe('sleeping');
    expect(reply.text).toContain('zzzz');
  });

  it('returns zzzz for normal chat while Mochi is sleeping', async () => {
    useStore.getState().setPetState('sleeping');

    const reply = await sendMessage({
      stats: baseStats,
      currentState: 'sleeping',
      userMessage: 'Mochi kamu lagi apa?',
    });

    expect(useStore.getState().pet.currentState).toBe('sleeping');
    expect(reply.text).toBe('zzzz');
  });

  it('wakes Mochi up when the player asks via chat', async () => {
    useStore.getState().setPetState('sleeping');

    const reply = await sendMessage({
      stats: baseStats,
      currentState: 'sleeping',
      userMessage: 'Mochi bangun dong',
    });

    expect(useStore.getState().pet.currentState).toBe('idle');
    expect(reply.text).toContain('bangun');
  });
});
