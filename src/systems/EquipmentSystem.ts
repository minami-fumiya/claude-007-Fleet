import { IUpgradeData } from '@/types/Modifiers';
import { IResources } from '@/types/Progression';
import { Nation } from '@/types/Nation';
import { canAfford, pay, resources } from './ResourceSystem';
import { unlockedUpgrades } from './ResearchSystem';

/**
 * 装備の所持と開発 (#55, pure). Upgrades are items: the admiral holds a stock of each, fitting one takes it from the
 * stock and taking it off (or scrapping the ship, #42) puts it back. New copies are developed in the arsenal with
 * resources — a chosen one at its full price, or 「おまかせ」 (a random unlocked one) for less — or come from enemies
 * sunk in battle (#150). Research opens development; a copy in hand can be fitted whatever the research.
 */

/** What developing one copy costs when the data gives none. */
export const DEFAULT_DEVELOP_COST: IResources = { fuel: 100, ammo: 100, steel: 200, bauxite: 50 };
/** 「おまかせ」 pays this share of the average price of what it may give. */
export const RANDOM_DEVELOP_MUL = 0.6;

/** The stock and fits of one nation (a slice of its progress). */
export interface IEquipmentHolder {
  /** Upgrade id → copies in the stock (not fitted) */
  equipment: Record<string, number>;
  /** Ship id → fitted upgrade ids */
  upgrades: Record<string, string[]>;
  research: string[];
  resources: IResources;
}

/** Copies of `id` in the stock. */
export function stockOf(holder: Pick<IEquipmentHolder, 'equipment'>, id: string): number {
  return Math.max(0, holder.equipment[id] ?? 0);
}

/** Copies fitted to ships. */
export function fittedCount(holder: Pick<IEquipmentHolder, 'upgrades'>, id: string): number {
  return Object.values(holder.upgrades).reduce((n, list) => n + list.filter((u) => u === id).length, 0);
}

/** Every copy held, fitted or not. */
export function heldCount(holder: Pick<IEquipmentHolder, 'equipment' | 'upgrades'>, id: string): number {
  return stockOf(holder, id) + fittedCount(holder, id);
}

/** `equipment` with `n` copies of `id` added (or taken, with a negative `n`; never below 0). */
export function addStock(equipment: Record<string, number>, id: string, n: number): Record<string, number> {
  const next = Math.max(0, (equipment[id] ?? 0) + n);
  const out = { ...equipment };
  if (next > 0) out[id] = next;
  else delete out[id];
  return out;
}

/** Whether an upgrade is made by this nation (one without a nation is made by all). */
export function madeBy(upgrade: Pick<IUpgradeData, 'nations'>, nation: Nation): boolean {
  return !upgrade.nations || upgrade.nations.length === 0 || upgrade.nations.includes(nation);
}

/** Upgrades this nation can develop now: its own (or common) ones whose research is done; parts taken from enemies never. */
export function developable(catalog: readonly IUpgradeData[], done: readonly string[], nation: Nation): IUpgradeData[] {
  return unlockedUpgrades([...catalog], [...done]).filter((u) => !u.dropFrom && madeBy(u, nation));
}

export function developCost(upgrade: Pick<IUpgradeData, 'cost'>): IResources {
  return resources(upgrade.cost ?? DEFAULT_DEVELOP_COST);
}

/** The price of 「おまかせ」: a share of the average price of what it may give. */
export function randomDevelopCost(pool: readonly IUpgradeData[]): IResources {
  if (pool.length === 0) return resources();
  const sum = pool.reduce((s, u) => {
    const c = developCost(u);
    return { fuel: s.fuel + c.fuel, ammo: s.ammo + c.ammo, steel: s.steel + c.steel, bauxite: s.bauxite + c.bauxite };
  }, resources());
  const each = (v: number): number => Math.round((v / pool.length) * RANDOM_DEVELOP_MUL / 10) * 10;
  return { fuel: each(sum.fuel), ammo: each(sum.ammo), steel: each(sum.steel), bauxite: each(sum.bauxite) };
}

/** Develops one copy of `id`; null when it can't be developed or paid for. */
export function develop<T extends IEquipmentHolder>(holder: T, catalog: readonly IUpgradeData[], id: string, nation: Nation): T | null {
  const upgrade = developable(catalog, holder.research, nation).find((u) => u.id === id);
  if (!upgrade) return null;
  const left = pay(holder.resources, developCost(upgrade));
  return left ? { ...holder, resources: left, equipment: addStock(holder.equipment, id, 1) } : null;
}

/** 「おまかせ」: one copy of a random developable upgrade, for less. `roll` is in [0, 1). */
export function developRandom<T extends IEquipmentHolder>(holder: T, catalog: readonly IUpgradeData[], nation: Nation, roll: number): { holder: T; id: string } | null {
  const pool = developable(catalog, holder.research, nation);
  if (pool.length === 0) return null;
  const left = pay(holder.resources, randomDevelopCost(pool));
  if (!left) return null;
  const id = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))].id;
  return { holder: { ...holder, resources: left, equipment: addStock(holder.equipment, id, 1) }, id };
}

export function canDevelop(holder: IEquipmentHolder, catalog: readonly IUpgradeData[], id: string, nation: Nation): boolean {
  const upgrade = developable(catalog, holder.research, nation).find((u) => u.id === id);
  return !!upgrade && canAfford(holder.resources, developCost(upgrade));
}

/**
 * Fits `id` to a ship from the stock, or takes it off back into the stock when it is already fitted. A full ship, a
 * duplicate or an empty stock leaves things as they are (null).
 */
export function toggleFit<T extends Pick<IEquipmentHolder, 'equipment' | 'upgrades'>>(holder: T, shipId: string, id: string, slots: number): T | null {
  const fitted = holder.upgrades[shipId] ?? [];
  if (fitted.includes(id)) {
    return { ...holder, upgrades: { ...holder.upgrades, [shipId]: fitted.filter((u) => u !== id) }, equipment: addStock(holder.equipment, id, 1) };
  }
  if (fitted.length >= slots || stockOf(holder, id) <= 0) return null;
  return { ...holder, upgrades: { ...holder.upgrades, [shipId]: [...fitted, id] }, equipment: addStock(holder.equipment, id, -1) };
}

/** Takes every upgrade off a ship back into the stock (a scrapped ship, #42). */
export function unfitAll<T extends Pick<IEquipmentHolder, 'equipment' | 'upgrades'>>(holder: T, shipId: string): T {
  const fitted = holder.upgrades[shipId] ?? [];
  let equipment = holder.equipment;
  for (const id of fitted) equipment = addStock(equipment, id, 1);
  const upgrades = { ...holder.upgrades };
  delete upgrades[shipId];
  return { ...holder, upgrades, equipment };
}
