import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';

/**
 * Ship classes and hull numbers (#246, pure). A class is a lead ship and its sisters — generated ones (`sisterOf`)
 * and real ones kept with stats of their own (`classOf`). Lists show the classes oldest first (the year the class
 * entered service), and inside a class the lead first, then the sisters by year, then in data order (the order the
 * hulls were laid down).
 */

/** The lead ship id of `ship`'s class. */
export function classKey(ship: Pick<IShipData, 'id' | 'sisterOf' | 'classOf'>): string {
  return ship.classOf ?? ship.sisterOf ?? ship.id;
}

const SHORT = (name: string): string => name.replace(/\s*\(.*\)\s*$/, '');

/** "長門型" / "フレッチャー級": the lead's short name and the word for a class in that navy. */
export function className(lead: Pick<IShipData, 'name' | 'nation'>): string {
  const short = SHORT(lead.name);
  if (/[型級]/.test(short)) return short;
  return `${short}${lead.nation === Nation.IJN ? '型' : '級'}`;
}

export interface IShipClassGroup {
  key: string;
  /** "長門型" */
  name: string;
  /** Oldest year in the class (the lead's, usually) */
  year: number;
  /** Lead first, then the sisters in hull order */
  ships: IShipData[];
}

const YEAR_UNKNOWN = 9999;

/** The classes in `ships`, oldest first; ships keep their hull order inside each. */
export function shipClasses(ships: readonly IShipData[]): IShipClassGroup[] {
  const index = new Map(ships.map((s, i) => [s.id, i]));
  const groups = new Map<string, IShipData[]>();
  for (const s of ships) {
    const k = classKey(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out = [...groups.entries()].map(([key, members]) => {
    const sorted = [...members].sort((a, b) =>
      Number(b.id === key) - Number(a.id === key)
      || (a.year ?? YEAR_UNKNOWN) - (b.year ?? YEAR_UNKNOWN)
      || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
    const lead = sorted[0];
    return { key, name: className(lead), year: Math.min(...members.map((m) => m.year ?? YEAR_UNKNOWN)), ships: sorted, first: index.get(lead.id) ?? 0 };
  });
  out.sort((a, b) => a.year - b.year || a.first - b.first);
  return out.map(({ first: _f, ...g }) => g);
}

/** `ships` in list order (#246): class by class, oldest class first, hulls in order inside each. */
export function shipOrder(ships: readonly IShipData[]): IShipData[] {
  return shipClasses(ships).flatMap((g) => g.ships);
}

/** The hull number of `ship` in its class within `roster` (1 = the lead), and the class's name. */
export function hullNumber(roster: readonly IShipData[], ship: IShipData): { className: string; number: number; of: number } {
  const group = shipClasses(roster.filter((s) => classKey(s) === classKey(ship)))[0];
  const number = group ? group.ships.findIndex((s) => s.id === ship.id) + 1 : 1;
  return { className: group?.name ?? className(ship), number: Math.max(1, number), of: group?.ships.length ?? 1 };
}
