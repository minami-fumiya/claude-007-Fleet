import { ADDITIVE_MODIFIERS, IShipModifiers, IUpgradeData } from '@/types/Modifiers';
import { IResources } from '@/types/Progression';
import { canAfford, pay, scaleCost } from './ResourceSystem';
import { addStock, developCost, heldCount, IEquipmentHolder, stockOf } from './EquipmentSystem';

/**
 * 装備改修 (#368, pure): equipment is improved from ★0 to ★10, for every copy of it the navy holds. Each ★ makes its
 * bonus 6% stronger (★10: the bonus ×1.6). Up to ★5 it takes resources only; from ★6 on a spare copy from the stock
 * goes into it as well.
 */
export const MAX_STARS = 10;
/** Each ★ adds this share to the bonus */
export const STAR_STEP = 0.06;
/** From this ★ on, a spare copy is used up too */
export const COPY_FROM = 6;

export function starsOf(stars: Readonly<Record<string, number>> | undefined, id: string): number {
  return Math.min(MAX_STARS, Math.max(0, Math.floor(stars?.[id] ?? 0)));
}

/** The upgrade's effects at ★`stars`: every bonus grows by STAR_STEP a ★ (a −10% reload becomes −16% at ★10). */
export function improvedEffects(effects: Partial<IShipModifiers>, stars: number): Partial<IShipModifiers> {
  if (stars <= 0) return effects;
  const k = 1 + STAR_STEP * stars;
  const out: Partial<IShipModifiers> = {};
  for (const [key, v] of Object.entries(effects) as Array<[keyof IShipModifiers, number]>) {
    out[key] = ADDITIVE_MODIFIERS.includes(key) ? v * k : 1 + (v - 1) * k;
  }
  return out;
}

/** The catalog with each upgrade at the navy's ★: what the modifiers are read from. */
export function improvedCatalog(catalog: readonly IUpgradeData[], stars: Readonly<Record<string, number>> | undefined): IUpgradeData[] {
  return catalog.map((u) => {
    const s = starsOf(stars, u.id);
    return s > 0 ? { ...u, effects: improvedEffects(u.effects, s) } : u;
  });
}

/** Resources to raise the upgrade from ★`stars` to the next: its development price, growing a quarter a ★. */
export function improveCost(upgrade: Pick<IUpgradeData, 'cost'>, stars: number): IResources {
  return scaleCost(developCost(upgrade), 1 + stars * 0.25);
}

export type ImproveState = 'max' | 'none' | 'copy' | 'resources' | 'ready';

export interface IImproveHolder extends IEquipmentHolder {
  equipStars: Record<string, number>;
}

export function improveState(holder: IImproveHolder, upgrade: IUpgradeData): ImproveState {
  const s = starsOf(holder.equipStars, upgrade.id);
  if (s >= MAX_STARS) return 'max';
  if (heldCount(holder, upgrade.id) <= 0) return 'none';
  if (s + 1 >= COPY_FROM && stockOf(holder, upgrade.id) <= 0) return 'copy';
  if (!canAfford(holder.resources, improveCost(upgrade, s))) return 'resources';
  return 'ready';
}

/** Raises the upgrade one ★; null when it can't be now. */
export function improve<T extends IImproveHolder>(holder: T, upgrade: IUpgradeData): T | null {
  if (improveState(holder, upgrade) !== 'ready') return null;
  const s = starsOf(holder.equipStars, upgrade.id);
  const left = pay(holder.resources, improveCost(upgrade, s));
  if (!left) return null;
  const equipment = s + 1 >= COPY_FROM ? addStock(holder.equipment, upgrade.id, -1) : holder.equipment;
  return { ...holder, resources: left, equipment, equipStars: { ...holder.equipStars, [upgrade.id]: s + 1 } };
}

/** "★3" (nothing at ★0). */
export function starLabel(stars: number): string {
  return stars > 0 ? `★${stars}` : '';
}
