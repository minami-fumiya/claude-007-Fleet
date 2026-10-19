/** "4:05" (minutes:seconds), or "1:02:03" from an hour up, for dock and construction timers. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mmss = `${String(Math.floor((s % 3600) / 60)).padStart(s >= 3600 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mmss}` : mmss;
}
