import weaponsData from '@/data/weapons/weapons.json';
import { IShipDesign } from '@/types/Design';
import { IAirWing } from '@/types/Aircraft';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData, WeaponType } from '@/types/Weapon';

/**
 * 設計艦 (#51, pure): the player draws up a ship from a hull and modules — at most one weapon of each role (主砲 ·
 * 副砲 · 魚雷 · 爆雷) and fittings (装甲・機関・バルジ・格納庫) — within the hull's slots and weight, then names it.
 * Designs stand beside the historical ships (史実艦) and the planned ones (架空艦) as their own category and are
 * built like any other ship. How far a navy can design grows with its national focuses and the 架空艦計画 research
 * (`designTier`): bigger hulls, more weight, more designs.
 */

export interface IHull {
  id: string;
  name: string;
  shipClass: ShipClass;
  subtype?: ShipSubtype;
  hp: number;
  armor: number;
  speed: number;
  /** Modules it takes (weapons and fittings together) */
  slots: number;
  /** Weight it carries at tier 0; each tier adds TIER_WEIGHT */
  weight: number;
  /** Design tier it needs */
  tier: number;
  airWing?: IAirWing;
}

/** Hulls a little below the middle of their kind: the fittings bring them up to the best of the real ships. */
export const HULLS: IHull[] = [
  { id: 'hull_dd', name: '駆逐艦船体', shipClass: ShipClass.Destroyer, hp: 200, armor: 12, speed: 235, slots: 4, weight: 6, tier: 0 },
  { id: 'hull_dd_leader', name: '大型駆逐艦船体', shipClass: ShipClass.Destroyer, subtype: ShipSubtype.LeaderDestroyer, hp: 220, armor: 13, speed: 245, slots: 4, weight: 7, tier: 1 },
  { id: 'hull_cl', name: '軽巡洋艦船体', shipClass: ShipClass.Cruiser, subtype: ShipSubtype.LightCruiser, hp: 330, armor: 26, speed: 178, slots: 4, weight: 8, tier: 0 },
  { id: 'hull_ca', name: '重巡洋艦船体', shipClass: ShipClass.Cruiser, subtype: ShipSubtype.HeavyCruiser, hp: 390, armor: 34, speed: 172, slots: 5, weight: 10, tier: 1 },
  { id: 'hull_bb', name: '戦艦船体', shipClass: ShipClass.Battleship, hp: 660, armor: 52, speed: 125, slots: 5, weight: 15, tier: 1 },
  { id: 'hull_bc', name: '巡洋戦艦船体', shipClass: ShipClass.Battleship, subtype: ShipSubtype.BattleCruiser, hp: 630, armor: 45, speed: 165, slots: 5, weight: 14, tier: 2 },
  { id: 'hull_bb_large', name: '超大型戦艦船体', shipClass: ShipClass.Battleship, hp: 760, armor: 60, speed: 125, slots: 6, weight: 18, tier: 3 },
  { id: 'hull_cvl', name: '軽空母船体', shipClass: ShipClass.Carrier, subtype: ShipSubtype.LightCarrier, hp: 455, armor: 18, speed: 160, slots: 3, weight: 6, tier: 0, airWing: { fighters: 3, diveBombers: 3, torpedoBombers: 3 } },
  { id: 'hull_cv', name: '正規空母船体', shipClass: ShipClass.Carrier, hp: 500, armor: 26, speed: 160, slots: 4, weight: 8, tier: 1, airWing: { fighters: 5, diveBombers: 4, torpedoBombers: 4 } },
  { id: 'hull_cv_armored', name: '装甲空母船体', shipClass: ShipClass.Carrier, subtype: ShipSubtype.ArmoredCarrier, hp: 540, armor: 40, speed: 145, slots: 4, weight: 9, tier: 2, airWing: { fighters: 4, diveBombers: 4, torpedoBombers: 4 } },
  { id: 'hull_ss', name: '潜水艦船体', shipClass: ShipClass.Submarine, hp: 145, armor: 6, speed: 150, slots: 3, weight: 4, tier: 0 },
  { id: 'hull_ss_large', name: '大型潜水艦船体', shipClass: ShipClass.Submarine, subtype: ShipSubtype.LargeSubmarine, hp: 160, armor: 6, speed: 150, slots: 3, weight: 5, tier: 1 },
];

export interface IFitting {
  id: string;
  name: string;
  /** What it does, one line */
  text: string;
  weight: number;
  /** Only these classes take it (none = every class) */
  classes?: ShipClass[];
}

export const FITTINGS: IFitting[] = [
  { id: 'fit_armor', name: '装甲強化', text: '装甲 +15%', weight: 3 },
  { id: 'fit_engine', name: '機関強化', text: '速力 +8%', weight: 2 },
  { id: 'fit_bulge', name: 'バルジ', text: '耐久 +6%・速力 −4%', weight: 2 },
  { id: 'fit_hangar', name: '格納庫拡張', text: '搭載機 各 +1', weight: 3, classes: [ShipClass.Carrier] },
];

/** The role a weapon fills in a design: one of each at most. */
export type WeaponRole = 'main' | 'secondary' | 'torpedo' | 'charge';

export const ROLE_JA: Record<WeaponRole, string> = { main: '主砲', secondary: '副砲・両用砲', torpedo: '魚雷', charge: '爆雷' };

export const TIER_WEIGHT = 1;
export const MAX_TIER = 3;
export const NAME_MAX = 16;

const WEAPONS = (weaponsData as { weapons: IWeaponData[] }).weapons;

function weapon(id: string): IWeaponData | undefined {
  return WEAPONS.find((w) => w.id === id);
}

export function hull(id: string): IHull | undefined {
  return HULLS.find((h) => h.id === id);
}

export function fitting(id: string): IFitting | undefined {
  return FITTINGS.find((f) => f.id === id);
}

/** A submarine's torpedoes (slow reload), which only submarines carry. */
function isSubTorpedo(w: IWeaponData): boolean {
  return w.type === WeaponType.Torpedo && w.reloadTime >= 8000;
}

export function weaponRole(w: IWeaponData): WeaponRole | undefined {
  switch (w.type) {
    case WeaponType.ShellAP: return 'main';
    case WeaponType.ShellHE: return 'secondary';
    case WeaponType.Torpedo: return w.reloadTime > 0 ? 'torpedo' : undefined;
    case WeaponType.DepthCharge: return 'charge';
    default: return undefined;
  }
}

/** A weapon's weight: the bigger the gun, the heavier. */
export function weaponWeight(w: IWeaponData): number {
  if (w.type === WeaponType.ShellAP) return w.firePower >= 110 ? 8 : w.firePower >= 95 ? 7 : w.firePower >= 80 ? 6 : w.firePower >= 60 ? 4 : 3;
  if (w.type === WeaponType.ShellHE) return w.firePower >= 44 ? 2 : 1;
  if (w.type === WeaponType.Torpedo) return isSubTorpedo(w) ? 2 : 3;
  return 1;
}

/** Whether a hull can carry the weapon (by its kind, as the real ships of that kind do). */
export function weaponFits(w: IWeaponData, h: IHull): boolean {
  const role = weaponRole(w);
  if (!role || w.id === 'shore_battery') return false;
  if (h.shipClass === ShipClass.Submarine) return isSubTorpedo(w);
  if (isSubTorpedo(w)) return false;
  switch (role) {
    case 'main': return h.shipClass === ShipClass.Battleship || (h.subtype === ShipSubtype.HeavyCruiser && w.firePower <= 70);
    case 'secondary': return h.shipClass !== ShipClass.Destroyer || w.firePower <= 40;
    case 'torpedo': return h.shipClass === ShipClass.Destroyer || h.shipClass === ShipClass.Cruiser;
    case 'charge': return h.shipClass === ShipClass.Destroyer || h.subtype === ShipSubtype.LightCruiser;
  }
}

/** Weapons a navy can design with: those its own ships carry (data and planned), which fit the hull. */
export function designWeapons(roster: readonly IShipData[], nation: string, h: IHull): IWeaponData[] {
  const ids = new Set(roster.filter((s) => s.nation === nation && !s.designed && !s.foreign && !s.blueprint).flatMap((s) => s.weapons));
  return WEAPONS.filter((w) => ids.has(w.id) && weaponFits(w, h)).sort((a, b) => (weaponRole(a) ?? '').localeCompare(weaponRole(b) ?? '') || b.firePower - a.firePower);
}

export function fittingsFor(h: IHull): IFitting[] {
  return FITTINGS.filter((f) => !f.classes || f.classes.includes(h.shipClass));
}

/** How far a navy can design: a step per three focuses done, and one for the 架空艦計画 research (0..3). */
export function designTier(focusDone: number, research: readonly string[]): number {
  return Math.min(MAX_TIER, Math.floor(focusDone / 3) + (research.includes('fictional_ships') ? 1 : 0));
}

export function hullCapacity(h: IHull, tier: number): number {
  return h.weight + tier * TIER_WEIGHT;
}

/** Designs a navy may keep at this tier. */
export function designLimit(tier: number): number {
  return 2 + tier;
}

export function moduleWeight(id: string): number {
  const w = weapon(id);
  return w ? weaponWeight(w) : (fitting(id)?.weight ?? 0);
}

export function designWeight(modules: readonly string[]): number {
  return modules.reduce((sum, id) => sum + moduleWeight(id), 0);
}

/** Why the design can't be drawn as it stands (null when it can). */
export function designProblem(d: Pick<IShipDesign, 'name' | 'hull' | 'modules'>, roster: readonly IShipData[], nation: string, tier: number): string | null {
  const h = hull(d.hull);
  if (!h) return '船体がありません';
  if (h.tier > tier) return `設計段階 ${h.tier} が必要です`;
  if (!d.name.trim()) return '艦名を付けてください';
  if (d.name.length > NAME_MAX) return `艦名は ${NAME_MAX} 文字までです`;
  if (d.modules.length > h.slots) return `枠は ${h.slots} つまでです`;
  const usable = new Set(designWeapons(roster, nation, h).map((w) => w.id));
  const fits = new Set(fittingsFor(h).map((f) => f.id));
  const roles = new Set<WeaponRole>();
  let weapons = 0;
  for (const id of d.modules) {
    const w = weapon(id);
    if (w) {
      if (!usable.has(id)) return `${w.name} は載せられません`;
      const role = weaponRole(w)!;
      if (roles.has(role)) return `${ROLE_JA[role]} は 1 つまでです`;
      roles.add(role);
      weapons++;
    } else if (!fits.has(id)) return '載せられない装備があります';
  }
  if (new Set(d.modules).size !== d.modules.length) return '同じ装備は 1 つまでです';
  if (weapons === 0 && h.shipClass !== ShipClass.Carrier) return '兵装を 1 つ以上載せてください';
  if (weapons === 0 && h.shipClass === ShipClass.Carrier && d.modules.length === 0) return '装備を 1 つ以上載せてください';
  const cap = hullCapacity(h, tier);
  if (designWeight(d.modules) > cap) return `重量が上限 ${cap} を超えています`;
  return null;
}

/** The ship a design is built and fought as. `roster` lends it the look of a real ship of its kind. */
export function designShip(d: IShipDesign, nation: string, roster: readonly IShipData[]): IShipData {
  const h = hull(d.hull) ?? HULLS[0];
  const has = (id: string): boolean => d.modules.includes(id);
  const hp = Math.round(h.hp * (has('fit_bulge') ? 1.06 : 1));
  const armor = Math.round(h.armor * (has('fit_armor') ? 1.15 : 1));
  const speed = Math.round(h.speed * (has('fit_engine') ? 1.08 : 1) * (has('fit_bulge') ? 0.96 : 1));
  const look = roster
    .filter((s) => s.nation === nation && s.shipClass === h.shipClass && !s.designed && (s.subtype ?? '') === (h.subtype ?? ''))
    .sort((a, b) => Math.abs(a.hp - hp) - Math.abs(b.hp - hp))[0] ?? roster.find((s) => s.shipClass === h.shipClass);
  const air = h.airWing && (has('fit_hangar') ? { fighters: h.airWing.fighters + 1, diveBombers: h.airWing.diveBombers + 1, torpedoBombers: h.airWing.torpedoBombers + 1 } : { ...h.airWing });
  return {
    id: d.id,
    name: d.name,
    nation: nation as IShipData['nation'],
    shipClass: h.shipClass,
    ...(h.subtype ? { subtype: h.subtype } : {}),
    hp,
    armor,
    speed,
    weapons: d.modules.filter((id) => weapon(id) !== undefined),
    spriteKey: look?.spriteKey ?? '',
    ...(air ? { airWing: air } : {}),
    designed: true,
    description: `設計艦。${h.name}に${d.modules.map((id) => weapon(id)?.name ?? fitting(id)?.name ?? id).join('・') || '装備なし'}。`,
    year: 1946,
  };
}

/** The id for a new design of the nation. */
export function newDesignId(nation: string, designs: readonly IShipDesign[]): string {
  const prefix = `design_${nation.toLowerCase()}_`;
  const used = new Set(designs.map((d) => d.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Tolerant parse of the stored designs. */
export function parseDesigns(v: unknown): IShipDesign[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: IShipDesign[] = [];
  for (const x of v) {
    if (x === null || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.hull !== 'string' || seen.has(o.id)) continue;
    const h = hull(o.hull);
    if (!h) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, NAME_MAX) : '設計艦',
      shipClass: h.shipClass,
      hull: h.id,
      modules: Array.isArray(o.modules) ? o.modules.filter((m): m is string => typeof m === 'string') : [],
    });
  }
  return out;
}
