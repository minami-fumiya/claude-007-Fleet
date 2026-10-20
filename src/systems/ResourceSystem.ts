import { IResources } from '@/types/Progression';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';

/** Resources a newly founded nation starts with (#28): nothing, natural regeneration fills it up. */
export const STARTING_RESOURCES: IResources = { fuel: 0, ammo: 0, steel: 0, bauxite: 0 };
/** What a pre-Sprint-6 save (no resources stored) was given; only used when migrating such saves. */
export const LEGACY_STARTING_RESOURCES: IResources = { fuel: 1500, ammo: 1500, steel: 1500, bauxite: 800 };
/** Sanity clamp on any resource; the real limit is the holding cap (#221), which bases raise well below this. */
export const RESOURCE_CAP = 999_999;
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
/** Light cruisers are cheap to run, heavy cruisers dear (#37); other subtypes pay their class's cost. */
const SUBTYPE_SORTIE_COST: Partial<Record<ShipSubtype, Partial<IResources>>> = {
  [ShipSubtype.HeavyCruiser]: { fuel: 40, ammo: 45 },
  [ShipSubtype.LightCruiser]: { fuel: 25, ammo: 30 },
};
/** Bauxite to replace one aircraft lost in battle. */
export const BAUXITE_PER_PLANE = 6;

export function resources(r: Partial<IResources> = {}): IResources {
  return { fuel: r.fuel ?? 0, ammo: r.ammo ?? 0, steel: r.steel ?? 0, bauxite: r.bauxite ?? 0 };
}

/** `a + b × scale`, clamped to 0..RESOURCE_CAP; `signed` keeps negatives (a net change rather than a stock). */
export function addResources(a: Partial<IResources>, b: Partial<IResources>, scale = 1, signed = false): IResources {
  const x = resources(a);
  const y = resources(b);
  const out = resources();
  for (const k of RESOURCE_KEYS) out[k] = Math.max(signed ? -RESOURCE_CAP : 0, Math.min(RESOURCE_CAP, Math.round(x[k] + y[k] * scale)));
  return out;
}

// ---------------------------------------------------------------------------
// Holding cap (#221)
// ---------------------------------------------------------------------------

/** What a nation can hold without any facility; each level of a resource's facility adds HOLD_CAP_PER_LEVEL. */
export const HOLD_CAP_BASE: IResources = { fuel: 10000, ammo: 10000, steel: 10000, bauxite: 5000 };
export const HOLD_CAP_PER_LEVEL = 5000;

export interface IGain {
  resources: IResources;
  /** What did not fit under the cap */
  lost: IResources;
}

/**
 * Adds an income under the holding cap (#221): a resource rises to at most `cap`, the rest is lost. A resource already
 * above the cap (an old save, a cap that shrank) is never cut, it just stops growing. Negative parts are applied as is.
 */
export function gainResources(have: Partial<IResources>, gain: Partial<IResources>, cap: IResources): IGain {
  const h = resources(have);
  const g = resources(gain);
  const out = resources();
  const lost = resources();
  for (const k of RESOURCE_KEYS) {
    if (g[k] <= 0) {
      out[k] = Math.max(0, h[k] + g[k]);
      continue;
    }
    const room = Math.max(0, cap[k] - h[k]);
    const take = Math.min(room, g[k]);
    out[k] = h[k] + take;
    lost[k] = g[k] - take;
  }
  return { resources: out, lost };
}

/** " (上限で受け取れず: 鋼材 320)" after a reward, or '' when everything fit. */
export function lostNote(lost: Partial<IResources>): string {
  const text = formatResources(lost);
  return text ? `  (上限で受け取れず: ${text})` : '';
}

/** True when some resource of `gain` would not fit under the cap. */
export function overflows(have: Partial<IResources>, gain: Partial<IResources>, cap: IResources): boolean {
  const l = gainResources(have, gain, cap).lost;
  return RESOURCE_KEYS.some((k) => l[k] > 0);
}

/** True when every resource has reached the holding cap (大備蓄章, #221). */
export function atHoldCap(have: IResources, cap: IResources): boolean {
  return RESOURCE_KEYS.every((k) => have[k] >= cap[k]);
}

export function canAfford(have: Partial<IResources>, cost: Partial<IResources>): boolean {
  const h = resources(have);
  const c = resources(cost);
  return RESOURCE_KEYS.every((k) => h[k] >= c[k]);
}

/** What `have` lacks of `cost`, per resource (0 where enough): "鋼材 120 不足" (#262). */
export function shortfall(have: Partial<IResources>, cost: Partial<IResources>): IResources {
  const h = resources(have);
  const c = resources(cost);
  return Object.fromEntries(RESOURCE_KEYS.map((k) => [k, Math.max(0, c[k] - h[k])])) as unknown as IResources;
}

/** Pays `cost`, or returns null if any resource is short. */
export function pay(have: Partial<IResources>, cost: Partial<IResources>): IResources | null {
  return canAfford(have, cost) ? addResources(have, cost, -1) : null;
}

export function sortieCost(ships: IShipData[]): IResources {
  return ships.reduce((sum, s) => addResources(sum, (s.subtype && SUBTYPE_SORTIE_COST[s.subtype]) ?? SORTIE_COST[s.shipClass] ?? {}), resources());
}

/**
 * Spoils of a battle: per enemy sunk (half on a defeat) plus a victory bonus. Fuel pays most: sorties, repairs,
 * research, building and docks all burn it. Steel used to pay double (#35) and piled up while fuel ran out (0.0.12).
 */
export function battleReward(victory: boolean, enemiesSunk: number, sunkClasses: ShipClass[] = []): IResources {
  const perSunk = resources({ fuel: 80, ammo: 70, steel: 0, bauxite: 20 });
  const bonus = victory ? resources({ fuel: 160, ammo: 150, steel: 170, bauxite: 50 }) : resources();
  const scale = victory ? 1 : 0.5;
  const out = addResources(bonus, perSunk, Math.max(0, enemiesSunk) * scale);
  // Steel comes from the wrecks (#132): big ships give more. Sinks without a known class count as average.
  const known = sunkClasses.slice(0, Math.max(0, enemiesSunk));
  const steel = known.reduce((sum, c) => sum + (SINK_STEEL[c] ?? SINK_STEEL_DEFAULT), 0) + (Math.max(0, enemiesSunk) - known.length) * SINK_STEEL_DEFAULT;
  return { ...out, steel: Math.round(out.steel + steel * scale) };
}

/** Steel salvaged per enemy sunk, by class (#132); a quarter more since 0.0.28 (#222): builds burn steel fastest. */
export const SINK_STEEL: Partial<Record<ShipClass, number>> = {
  [ShipClass.Battleship]: 190,
  [ShipClass.Carrier]: 150,
  [ShipClass.Cruiser]: 100,
  [ShipClass.Destroyer]: 55,
  [ShipClass.Submarine]: 45,
};
const SINK_STEEL_DEFAULT = 75;

export function formatResources(r: Partial<IResources>, onlyNonZero = true): string {
  const x = resources(r);
  return RESOURCE_KEYS.filter((k) => !onlyNonZero || x[k] !== 0)
    .map((k) => `${RESOURCE_LABEL[k]} ${x[k]}`)
    .join('  ');
}

// ---------------------------------------------------------------------------
// Natural regeneration (#28)
// ---------------------------------------------------------------------------

/**
 * Gained every REGEN_INTERVAL_MS of real time, also while the game is closed. Fuel regenerates fastest (every sortie
 * and repair spends it), then ammo and steel (0.0.12: steel led after #35 and fuel became the bottleneck).
 */
export const REGEN_PER_TICK: IResources = { fuel: 6, ammo: 4, steel: 5, bauxite: 1 };
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
export function regenerate(
  have: IResources, regenAt: number, now: number,
  rules: { perTick: IResources; cap: IResources } = { perTick: REGEN_PER_TICK, cap: resources({ fuel: REGEN_CAP, ammo: REGEN_CAP, steel: REGEN_CAP, bauxite: REGEN_CAP }) },
): IRegenResult {
  if (regenAt <= 0 || now < regenAt) return { resources: have, regenAt: now };
  const ticks = Math.floor((now - regenAt) / REGEN_INTERVAL_MS);
  if (ticks <= 0) return { resources: have, regenAt };
  const out = resources(have);
  // Base facilities (#146) raise the rates and caps; without any, these are REGEN_PER_TICK and REGEN_CAP.
  for (const k of RESOURCE_KEYS) {
    if (out[k] < rules.cap[k]) out[k] = Math.min(rules.cap[k], out[k] + rules.perTick[k] * ticks);
  }
  return { resources: out, regenAt: regenAt + ticks * REGEN_INTERVAL_MS };
}

/** Milliseconds until the next regeneration tick. */
export function nextRegenMs(regenAt: number, now: number): number {
  if (regenAt <= 0 || now < regenAt) return REGEN_INTERVAL_MS;
  return REGEN_INTERVAL_MS - ((now - regenAt) % REGEN_INTERVAL_MS);
}

/** True when every resource has reached the regeneration cap. */
export function regenFull(have: IResources, cap?: IResources): boolean {
  return RESOURCE_KEYS.every((k) => have[k] >= (cap ? cap[k] : REGEN_CAP));
}

/** Cost scaled by `mul` (a base bonus, #88), rounded up to whole units. */
export function scaleCost<T extends Partial<IResources>>(cost: T, mul: number): T {
  if (mul === 1) return cost;
  const out = { ...cost };
  for (const k of RESOURCE_KEYS) {
    const v = cost[k];
    if (v !== undefined) out[k] = Math.ceil(v * mul) as T[typeof k];
  }
  return out;
}
