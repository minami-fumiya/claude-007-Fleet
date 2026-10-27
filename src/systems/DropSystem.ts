import { IUpgradeData } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import type { BattleRank } from './BattleRank';
import { addStock } from './EquipmentSystem';
import { BLUEPRINT_NEED, BLUEPRINT_PER_GIANT, BLUEPRINT_PER_GIANT_AREA } from './SuperweaponSystem';

/**
 * 部品と設計図の回収 (#150, pure): enemies sunk in a campaign battle now and then leave something behind — a part of
 * their kind (a battleship's gun sight, a submarine's hydrophone) or a piece of their navy's own gear (a USN
 * destroyer's VT fuzes). The better the battle's rank, the likelier. A superweapon always leaves its engine and
 * blueprint fragments; enough fragments let the nation build its own (#148).
 */

/** Chance per enemy ship sunk, by the battle's rank. */
export const DROP_CHANCE: Record<BattleRank, number> = { S: 0.3, A: 0.2, B: 0.12, C: 0.05, D: 0 };
/** At most this many pieces a battle (the superweapon's own aside). */
export const MAX_DROPS = 2;
/** The superweapon's part, always taken when it sinks. */
export const SUPERWEAPON_PART = 'superweapon_core';

export interface ISunkEnemy {
  shipClass: ShipClass;
  nation: Nation;
}

/** What an enemy of this kind and navy can leave: parts of its kind and its navy's own developed gear. */
export function dropTable(catalog: readonly IUpgradeData[], enemy: ISunkEnemy): IUpgradeData[] {
  return catalog.filter((u) => (u.dropFrom ? u.dropFrom.includes(enemy.shipClass) : !!u.nations?.includes(enemy.nation)));
}

export interface IDropResult {
  /** Upgrade ids taken, in order (may repeat) */
  parts: string[];
  blueprints: number;
}

/**
 * Rolls a won battle's pieces. `rolls` gives numbers in [0, 1): two per enemy sunk (whether it drops, and what).
 * A lost battle leaves nothing; a superweapon sunk always leaves its part and blueprint fragments.
 */
export function rollDrops(
  catalog: readonly IUpgradeData[], sunk: readonly ISunkEnemy[], rank: BattleRank, victory: boolean,
  opts: { giantSunk?: boolean; giantArea?: boolean }, rolls: () => number,
): IDropResult {
  const parts: string[] = [];
  if (!victory) return { parts, blueprints: 0 };
  for (const enemy of sunk) {
    if (parts.length >= MAX_DROPS) break;
    const roll = rolls();
    const pick = rolls();
    if (roll >= DROP_CHANCE[rank]) continue;
    const table = dropTable(catalog, enemy);
    if (table.length > 0) parts.push(table[Math.min(table.length - 1, Math.floor(pick * table.length))].id);
  }
  if (opts.giantSunk) parts.push(SUPERWEAPON_PART);
  const blueprints = opts.giantSunk ? (opts.giantArea ? BLUEPRINT_PER_GIANT_AREA : BLUEPRINT_PER_GIANT) : 0;
  return { parts, blueprints };
}

/** Puts the pieces into the stock and the fragments with the rest. */
export function applyDrops<T extends { equipment: Record<string, number>; blueprints: number }>(holder: T, drops: IDropResult): T {
  let equipment = holder.equipment;
  for (const id of drops.parts) equipment = addStock(equipment, id, 1);
  return { ...holder, equipment, blueprints: (holder.blueprints ?? 0) + drops.blueprints };
}

/** The results line: "回収: 聴音機・VT 信管  ·  設計図の断片 +2 (3 / 5)". */
export function dropLine(catalog: readonly IUpgradeData[], drops: IDropResult, blueprintsAfter: number): string {
  const names = drops.parts.map((id) => catalog.find((u) => u.id === id)?.name ?? id);
  const bits = [
    names.length > 0 ? `回収: ${names.join('・')} (改装で付けられます)` : '',
    drops.blueprints > 0 ? `設計図の断片 +${drops.blueprints} (${Math.min(blueprintsAfter, BLUEPRINT_NEED)} / ${BLUEPRINT_NEED}${blueprintsAfter >= BLUEPRINT_NEED ? '・自国の超兵器を建造できます' : ''})` : '',
  ];
  return bits.filter((b) => b).join('  ·  ');
}
