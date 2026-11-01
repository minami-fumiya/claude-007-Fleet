import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import type { BattleRank } from './BattleRank';

/**
 * 他国の設計図 (#368, pure): enemies sunk in a campaign battle now and then leave their navy's plans behind. With
 * enough fragments of a ship, it can be built at home (他国艦): each navy offers a destroyer, a light cruiser and
 * (most) a heavy cruiser, which join the builder's roster under their own name (a copy of the ship, `foreign` naming
 * where it came from). Fragments are counted per offered ship (0.0.60, #420), keyed by its own id ("fletcher"): a
 * sunk destroyer leaves the destroyer's plans, a heavy cruiser the heavy cruiser's. Battleships, carriers and
 * submarines leave none. Fragments are kept, not spent; a navy's own plans are never among them.
 */

/** The ships each navy's plans let others build. */
export const FOREIGN_OFFERS: Record<Nation, string[]> = {
  [Nation.IJN]: ['fubuki', 'sendai', 'myoko'],
  [Nation.USN]: ['fletcher', 'cleveland', 'baltimore'],
  [Nation.KM]: ['z1', 'nurnberg', 'admiral_hipper'],
  [Nation.RN]: ['javelin', 'leander', 'kent'],
  [Nation.FR]: ['le_fantasque', 'la_galissonniere', 'algerie'],
  [Nation.RM]: ['maestrale', 'garibaldi', 'zara'],
  [Nation.SU]: ['gnevny', 'kirov'],
};

/** Fragments a ship needs, by its size (#420): destroyer 5, light cruiser 8, heavy cruiser 12. */
export const FOREIGN_NEED = { destroyer: 5, light: 8, heavy: 12 } as const;

type FragmentSize = keyof typeof FOREIGN_NEED;

/** The size a ship's plans count as, or null for ships whose plans are never found (battleships, carriers, subs). */
export function fragmentSize(ship: Pick<IShipData, 'shipClass' | 'subtype'>): FragmentSize | null {
  if (ship.shipClass === ShipClass.Destroyer) return 'destroyer';
  if (ship.shipClass === ShipClass.Cruiser) return ship.subtype === ShipSubtype.HeavyCruiser ? 'heavy' : 'light';
  return null;
}

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

export function fragmentNeed(ship: Pick<IShipData, 'shipClass' | 'subtype'>): number {
  return FOREIGN_NEED[fragmentSize(ship) ?? 'heavy'];
}

/** The key a ship's fragments are kept under: the offered ship's own id ("fletcher@IJN" → "fletcher"). */
export function fragmentKey(ship: Pick<IShipData, 'id'>): string {
  return ship.id.split('@')[0];
}

/** Fragments held for a ship (the builder's copy or the original). */
export function fragmentsOf(fragments: Readonly<Record<string, number>> | undefined, ship: Pick<IShipData, 'id'>): number {
  return fragments?.[fragmentKey(ship)] ?? 0;
}

/** The offered ship of a navy whose plans a ship of this size leaves; a light cruiser stands in for a missing heavy. */
export function offerFor(all: readonly IShipData[], from: Nation, ship: Pick<IShipData, 'id' | 'shipClass' | 'subtype'>): IShipData | null {
  const offers = (FOREIGN_OFFERS[from] ?? []).flatMap((id) => all.filter((s) => s.id === id && s.nation === from));
  const own = offers.find((s) => s.id === fragmentKey(ship));
  if (own) return own;
  const size = fragmentSize(ship);
  if (!size) return null;
  return offers.find((s) => fragmentSize(s) === size) ?? (size === 'heavy' ? offers.find((s) => fragmentSize(s) === 'light') ?? null : null);
}

/**
 * The ship whose plans a won battle leaves (#420), or null: each sunk ship whose plans can be found is rolled in
 * turn (at most one fragment a battle, the same odds as before). `rolls` gives numbers in [0, 1).
 */
export function rollFragment(all: readonly IShipData[], from: Nation, sunk: ReadonlyArray<Pick<IShipData, 'id' | 'shipClass' | 'subtype'>>, rank: BattleRank, victory: boolean, rolls: () => number): IShipData | null {
  if (!victory) return null;
  for (const s of sunk) {
    const offer = offerFor(all, from, s);
    if (offer && rolls() < FRAGMENT_CHANCE[rank]) return offer;
  }
  return null;
}

/**
 * Old saves (before 0.0.60) kept one count per navy ("USN": 7). Each of that navy's offered ships is given the
 * count, so a ship that could be built still can (α 版の読み替え). Ship keys are kept as they are.
 */
export function migrateFragments(raw: Readonly<Record<string, number>>): Record<string, number> {
  const nations = new Set<string>(Object.values(Nation));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ids = nations.has(k) ? FOREIGN_OFFERS[k as Nation] ?? [] : [k];
    for (const id of ids) out[id] = Math.max(out[id] ?? 0, v);
  }
  return out;
}

/**
 * The results' line for a fragment taken (#394 #420): "フレッチャーの設計図 +1 (3 / 5)", and "…を建造できるように
 * なりました" once it is complete; never "can be built" before it can.
 */
export function fragmentNote(ship: IShipData, before: number, after: number): string {
  const short = ship.name.replace(/\s*\(.*\)\s*$/, '');
  const need = fragmentNeed(ship);
  const head = `${short}の設計図 +${after - before} (${Math.min(after, need)} / ${need})`;
  if (after >= need && before < need) return `${head}・建造できるようになりました (工廠 › 建造)`;
  if (after >= need) return `${head}・建造できます`;
  return head;
}
