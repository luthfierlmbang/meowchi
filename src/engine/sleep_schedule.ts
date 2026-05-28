/** Mochi's local sleep window: 22:00-05:59. */
export function isSleepHour(hour = new Date().getHours()): boolean {
  return hour >= 22 || hour < 6;
}
