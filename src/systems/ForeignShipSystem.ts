import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import type { BattleRank } from './BattleRank';

/**
 * 他国の設計図 (#368, pure): enemies sunk in a campaign battle now and then leave their navy's plans behind. With
 * enough fragments of a navy, its destroyer and light cruiser can be built at home (他国艦): each navy offers two
 * ships, which join the builder's roster under their own name (a copy of the ship, `foreign` naming where it came
 * from). Fragments are kept, not spent; a navy's own plans are never among them.
 */

/** The ships each navy's plans let others build. */
export const FOREIGN_OFFERS: Record<Nation, string[]> = {
  [Nation.IJN]: ['fubuki', 'sendai'],
  [Nation.USN]: ['fletcher', 'cleveland'],
  [Nation.KM]: ['z1', 'nurnberg'],
  [Nation.RN]: ['javelin', 'leander'],
  [Nation.FR]: ['le_fantasque', 'la_galissonniere'],
  [Nation.RM]: ['maestrale', 'garibaldi'],
  [Nation.SU]: ['gnevny', 'kirov'],
};

/** Fragments a ship needs, by class. */
export const FOREIGN_NEED: Partial<Record<ShipClass, number>> = { [ShipClass.Destroyer]: 10, [ShipClass.Cruiser]: 20 };

/** Chance per enemy sunk that its plans are found, by the battle's rank; at most one fragment a battle. */
export const FRAGMENT_CHANCE: Record<BattleRank, number> = { S: 0.5, A: 0.35, B: 0.2, C: 0.1, D: 0 };

/** The id a navy builds another's ship under: "fletcher@IJN". */
export function foreignId(shipId: string, builder: string): string {
  return `${shipId}@${builder}`;
}

/** Every other navy's offered ships as the builder's own copies. */
export function foreignShips(all: readonly IShipData[], builder: Nation): IShipData[] {
  const out: IShipData[] = [];
  for (const [from, ids] of Object.entries(FOREIGN_OFFERS) as Array<[Nation, string[]]>) {
    if (from === builder) continue;
    for (const id of ids) {
      const s = all.find((x) => x.id === id && x.nation === from);
      if (s) out.push({ ...s, id: foreignId(id, builder), nation: builder, foreign: from, no: undefined, sisterOf: undefined, classOf: undefined });
    }
  }
  return out;
}

export function fragmentNeed(ship: Pick<IShipData, 'shipClass'>): number {
  return FOREIGN_NEED[ship.shipClass] ?? 20;
}

/** Fragments of the enemy navy a won battle leaves (0 or 1). `rolls` gives numbers in [0, 1). */
export function rollFragment(sunk: number, rank: BattleRank, victory: boolean, rolls: () => number): number {
  if (!victory) return 0;
  for (let i = 0; i < sunk; i++) if (rolls() < FRAGMENT_CHANCE[rank]) return 1;
  return 0;
}
