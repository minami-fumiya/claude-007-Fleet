import { IShipData } from '@/types/Ship';
import type { BuildState } from './ShipyardSystem';
import { classKey, hullNumber } from './ShipOrder';

/**
 * What a list may show of something not yet within reach (#245, pure). The shipyard greys out a ship it cannot
 * build yet (research, rank, medal, or a reward-only ship) and hides its name; the 図鑑 does the same for anything
 * not yet owned. Once a ship of the class is owned, the others show as "長門型 ？番艦".
 */

export const HIDDEN_NAME = '？？？';

/** Build states that keep the ship's name hidden: it is out of reach until something else is done first. */
const LOCKED: ReadonlySet<BuildState> = new Set<BuildState>(['reward', 'research', 'fictional', 'rank', 'medal']);

/** Whether the shipyard shows the ship's name (and draws it in colour): owned, building, or buildable now. */
export function buildNameShown(state: BuildState): boolean {
  return !LOCKED.has(state);
}

/** The name a hidden ship goes by: "長門型 ？番艦" when a ship of its class is owned, else "？？？". */
export function hiddenShipName(roster: readonly IShipData[], ship: IShipData, owned: readonly string[]): string {
  const key = classKey(ship);
  const known = roster.some((s) => s.id !== ship.id && classKey(s) === key && owned.includes(s.id));
  return known ? `${hullNumber(roster, ship).className} ？番艦` : HIDDEN_NAME;
}
