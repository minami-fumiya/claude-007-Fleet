import data from '@/data/ground-weapons.json';
import { IShipData } from '@/types/Ship';
import { IShipModifiers } from '@/types/Modifiers';
import { Nation } from '@/types/Nation';

/**
 * 地上兵器 (#251, pure): each navy's shore defences of history — fortress guns, coastal batteries, AA sites, torpedo
 * boat bases, radar stations and railway guns. In a 対地攻撃 battle the island the enemy holds fields its own: the
 * harbour and the airfield stay where they were, and the batteries around them become the navy's kinds, heavier ones
 * in the deeper seas.
 */

export type GroundKind = 'heavy_battery' | 'battery' | 'aa' | 'torpedo_base' | 'radar' | 'railway';

export interface IGroundWeapon extends IShipData {
  kind: GroundKind;
  /** What it does better than a plain battery: gun power, AA, vision */
  mods?: Partial<IShipModifiers>;
}

export const GROUND_KINDS = data.kinds as Record<GroundKind, string>;
export const GROUND_WEAPONS = (data as unknown as { groundWeapons: IGroundWeapon[] }).groundWeapons;

export function groundWeaponsOf(nation: Nation | string): IGroundWeapon[] {
  return GROUND_WEAPONS.filter((g) => g.nation === nation);
}

export function groundWeapon(nation: Nation | string, kind: GroundKind): IGroundWeapon | undefined {
  return GROUND_WEAPONS.find((g) => g.nation === nation && g.kind === kind);
}

export function isGroundWeapon(id: string | undefined): boolean {
  return !!id && GROUND_WEAPONS.some((g) => g.id === id);
}

/** From this depth on, the heavy guns stand on the island. */
export const HEAVY_DEPTH = 8;
/** The second spot's kind turns with the area: an AA site, a radar station or a torpedo boat base. */
const SUPPORT_KINDS: GroundKind[] = ['aa', 'radar', 'torpedo_base'];

/** A small, stable number from an id (which support kind an area has). */
function idHash(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

/**
 * What stands on each spot of the island (the special.json bombard layout, in order): the harbour and airfield keep
 * their ids; the batteries become the navy's ground weapons. Returns the ids to spawn.
 */
export function bombardLineup(layout: readonly string[], areaId: string, nation: Nation | string, depth: number): string[] {
  let battery = 0;
  return layout.map((id) => {
    if (id !== 'land_battery') return id;
    const i = battery++;
    const kind: GroundKind = i === 0 ? 'battery'
      : i === 1 ? SUPPORT_KINDS[idHash(areaId) % SUPPORT_KINDS.length]
        : depth >= HEAVY_DEPTH ? (idHash(areaId) % 2 === 0 ? 'heavy_battery' : 'railway') : 'battery';
    return groundWeapon(nation, kind)?.id ?? id;
  });
}

/** Ground weapons destroyed, by id, plus this battle's. */
export function addGroundKills(kills: Record<string, number>, destroyed: readonly string[]): Record<string, number> {
  const out = { ...kills };
  for (const id of destroyed) if (isGroundWeapon(id)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** Ground weapons destroyed in all, and the different ones. */
export function groundKillStats(kills: Record<string, number>): { total: number; kinds: number } {
  const ids = Object.keys(kills).filter((id) => (kills[id] ?? 0) > 0 && isGroundWeapon(id));
  return { total: ids.reduce((n, id) => n + kills[id], 0), kinds: ids.length };
}
