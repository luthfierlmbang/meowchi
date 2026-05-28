export const FOCUS_COIN_PER_MINUTE = 2;
export const FOCUS_MAX_COINS = 100;
export const FOCUS_HAPPINESS_REWARD = 15;
export const FOCUS_ENERGY_COST_ON_COMPLETE = 20;

export function focusRewardCoins(durationMinutes: number): number {
  const safeMinutes = Math.max(1, Math.floor(durationMinutes));
  return Math.min(FOCUS_MAX_COINS, Math.max(1, safeMinutes * FOCUS_COIN_PER_MINUTE));
}
