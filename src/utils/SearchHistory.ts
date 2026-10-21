/**
 * The name search's memory and suggestions (#308, pure): the last few searches, and the names that start with (or
 * contain) what has been typed so far.
 */

export const RECENT_MAX = 5;
export const SUGGEST_MAX = 8;

/** `query` at the front of the recent searches, without repeats, at most RECENT_MAX. */
export function pushRecent(recent: readonly string[], query: string): string[] {
  const q = query.trim();
  if (!q) return [...recent];
  return [q, ...recent.filter((r) => r !== q)].slice(0, RECENT_MAX);
}

/** Names matching `typed`: those starting with it first, then those containing it; none for an empty query. */
export function suggest(names: readonly string[], typed: string, max = SUGGEST_MAX): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const unique = [...new Set(names)];
  const starts = unique.filter((n) => n.toLowerCase().startsWith(q));
  const contains = unique.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, max);
}

/** The searchable names of a ship: "金剛 (Kongo)" gives "金剛" and "Kongo", plus its class ("金剛型"). */
export function shipSearchNames(ships: ReadonlyArray<{ name: string; className?: string }>): string[] {
  const out: string[] = [];
  for (const s of ships) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s.name);
    if (m) out.push(m[1], m[2]);
    else out.push(s.name);
    if (s.className) out.push(s.className);
  }
  return [...new Set(out.filter((n) => n))];
}
