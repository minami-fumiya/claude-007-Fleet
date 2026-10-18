import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';

/** Resources a newly founded nation starts with (#28): nothing, natural regeneration fills it up. */
export const STARTING_RESOURCES: IResources = { fuel: 0, ammo: 0, steel: 0, bauxite: 0 };
/** What a pre-Sprint-6 save (no resources stored) was given; only used when migrating such saves. */
export const LEGACY_STARTING_RESOURCES: IResources = { fuel: 1500, ammo: 1500, steel: 1500, bauxite: 800 };
/** Each resource is capped here. */
export const RESOURCE_CAP = 20000;
export const RESOURCE_KEYS: Array<keyof IResources> = ['fuel', 'ammo', 'steel', 'bauxite'];

export const RESOURCE_LABEL: Record<keyof IResources, string> = {
  fuel: '燃料',
  ammo: '弾薬',
  steel: '鋼材',
  bauxite: 'ボーキ',
};

/** Fuel / ammo each class needs to sortie; carriers also need bauxite for their aircraft. */
const SORTIE_COST: Record<ShipClass, Partial<IResources>> = {
  [ShipClass.Battleship]: { fuel: 60, ammo: 70 },
  [ShipClass.Carrier]: { fuel: 50, ammo: 20, bauxite: 40 },
  [ShipClass.Cruiser]: { fuel: 35, ammo: 40 },
  [ShipClass.Destroyer]: { fuel: 15, ammo: 20 },
  [ShipClass.Submarine]: { fuel: 10, ammo: 15 },
};
/** Bauxite to replace one aircraft lost in battle. */
export const BAUXITE_PER_PLANE = 6;

export function resources(r: Partial<IResources> = {}): IResources {
  return { fuel: r.fuel ?? 0, ammo: r.ammo ?? 0, steel: r.steel ?? 0, bauxite: r.bauxite ?? 0 };
}

export function addResources(a: Partial<IResources>, b: Partial<IResources>, scale = 1): IResources {
  const x = resources(a);
  const y = resources(b);
  const out = resources();
  for (const k of RESOURCE_KEYS) out[k] = Math.max(0, Math.min(RESOURCE_CAP, Math.round(x[k] + y[k] * scale)));
  return out;
}

export function canAfford(have: Partial<IResources>, cost: Partial<IResources>): boolean {
  const h = resources(have);
  const c = resources(cost);
  return RESOURCE_KEYS.every((k) => h[k] >= c[k]);
}

/** Pays `cost`, or returns null if any resource is short. */
export function pay(have: Partial<IResources>, cost: Partial<IResources>): IResources | null {
  return canAfford(have, cost) ? addResources(have, cost, -1) : null;
}

export function sortieCost(ships: IShipData[]): IResources {
  return ships.reduce((sum, s) => addResources(sum, SORTIE_COST[s.shipClass] ?? {}), resources());
}

/** Spoils of a battle: per enemy sunk (half on a defeat) plus a victory bonus. */
export function battleReward(victory: boolean, enemiesSunk: number): IResources {
  const perSunk = resources({ fuel: 40, ammo: 40, steel: 60, bauxite: 20 });
  const bonus = victory ? resources({ fuel: 100, ammo: 100, steel: 120, bauxite: 50 }) : resources();
  return addResources(bonus, perSunk, Math.max(0, enemiesSunk) * (victory ? 1 : 0.5));
}

export function formatResources(r: Partial<IResources>, onlyNonZero = true): string {
  const x = resources(r);
  return RESOURCE_KEYS.filter((k) => !onlyNonZero || x[k] !== 0)
    .map((k) => `${RESOURCE_LABEL[k]} ${x[k]}`)
    .join('  ');
}

// ---------------------------------------------------------------------------
// Natural regeneration (#28)
// ---------------------------------------------------------------------------

/** Gained every REGEN_INTERVAL_MS of real time, also while the game is closed. */
export const REGEN_PER_TICK: IResources = { fuel: 3, ammo: 3, steel: 3, bauxite: 1 };
export const REGEN_INTERVAL_MS = 60_000;
/** Regeneration stops at this amount; rewards can still take a resource above it. */
export const REGEN_CAP = 1500;

export interface IRegenResult {
  resources: IResources;
  /** Epoch ms the next tick counts from */
  regenAt: number;
}

/**
 * Applies the regeneration ticks that elapsed since `regenAt` (epoch ms, like dock `endsAt`). A resource at or
 * above REGEN_CAP is left alone; one below it rises to at most the cap. `regenAt <= 0` (never started) or a clock
 * that went backwards just restarts the timer. Returns the input object unchanged when nothing happened.
 */
export function regenerate(have: IResources, regenAt: number, now: number): IRegenResult {
  if (regenAt <= 0 || now < regenAt) return { resources: have, regenAt: now };
  const ticks = Math.floor((now - regenAt) / REGEN_INTERVAL_MS);
  if (ticks <= 0) return { resources: have, regenAt };
  const out = resources(have);
  for (const k of RESOURCE_KEYS) {
    if (out[k] < REGEN_CAP) out[k] = Math.min(REGEN_CAP, out[k] + REGEN_PER_TICK[k] * ticks);
  }
  return { resources: out, regenAt: regenAt + ticks * REGEN_INTERVAL_MS };
}

/** Milliseconds until the next regeneration tick. */
export function nextRegenMs(regenAt: number, now: number): number {
  if (regenAt <= 0 || now < regenAt) return REGEN_INTERVAL_MS;
  return REGEN_INTERVAL_MS - ((now - regenAt) % REGEN_INTERVAL_MS);
}

/** True when every resource has reached the regeneration cap. */
export function regenFull(have: IResources): boolean {
  return RESOURCE_KEYS.every((k) => have[k] >= REGEN_CAP);
}
