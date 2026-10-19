import { IShipData, SUBTYPE_JA } from '@/types/Ship';
import { ADDITIVE_MODIFIERS, IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';

export const CLASS_JA: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '戦艦',
  [ShipClass.Cruiser]: '巡洋艦',
  [ShipClass.Destroyer]: '駆逐艦',
  [ShipClass.Carrier]: '空母',
  [ShipClass.Submarine]: '潜水艦',
};

/** The ship's type for display: its subtype (巡洋戦艦, 軽空母 …) when it has one, else its class. */
export function kindLabel(ship: Pick<IShipData, 'shipClass' | 'subtype'>): string {
  return ship.subtype ? SUBTYPE_JA[ship.subtype] : CLASS_JA[ship.shipClass];
}

/** Display order of ship classes in the encyclopedia. */
export const CLASS_ORDER: ShipClass[] = [
  ShipClass.Battleship,
  ShipClass.Cruiser,
  ShipClass.Destroyer,
  ShipClass.Carrier,
  ShipClass.Submarine,
];

/** Ships of one nation, optionally of one class, sorted by class order (stable within a class). */
export function filterEntries(ships: IShipData[], shipClass: ShipClass | null): IShipData[] {
  return ships
    .filter((s) => shipClass === null || s.shipClass === shipClass)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => CLASS_ORDER.indexOf(a.s.shipClass) - CLASS_ORDER.indexOf(b.s.shipClass) || a.i - b.i)
    .map(({ s }) => s);
}

/** Collapses a loadout into weapon ids with mount counts, in first-seen order. */
export function summarizeWeapons(ids: string[]): Array<{ id: string; count: number }> {
  const out: Array<{ id: string; count: number }> = [];
  for (const id of ids) {
    const hit = out.find((e) => e.id === id);
    if (hit) hit.count++;
    else out.push({ id, count: 1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Captains, aircraft and ground targets (#43 / #44 / #91)
// ---------------------------------------------------------------------------

/** Encyclopedia tabs. */
export type EncyclopediaTab = 'ships' | 'captains' | 'aircraft' | 'ground';
export const TAB_LABEL: Record<EncyclopediaTab, string> = { ships: '艦艇', captains: '艦長', aircraft: '航空機', ground: '地上・支援' };
export const TABS: EncyclopediaTab[] = ['ships', 'captains', 'aircraft', 'ground'];

/** "艦艇 12 / 25" — owned / all. */
export function collectionLabel(label: string, owned: number, all: number): string {
  return `${label} ${owned} / ${all}`;
}

const MOD_LABEL: Partial<Record<keyof IShipModifiers, string>> = {
  hpMul: '耐久', armorAdd: '装甲', speedMul: '速力', gunPowerMul: '砲火力', gunReloadMul: '主砲装填', torpedoPowerMul: '魚雷',
  visionMul: '視界', aaMul: '対空', airPowerMul: '航空攻撃', planesAdd: '艦載機', rearmMul: '再出撃準備', sonarMul: 'ソナー',
  depthChargeMul: '爆雷', nightAimMul: '夜間の照準誤差', nightVisionMul: '夜間の視界', evadeAdd: '回避',
};

/** "砲火力 +15%" / "主砲装填 −5%" / "装甲 +2" for every field that differs from no bonus. */
export function modifierLines(mods: IShipModifiers): string[] {
  const out: string[] = [];
  for (const key of Object.keys(NO_MODIFIERS) as Array<keyof IShipModifiers>) {
    const label = MOD_LABEL[key];
    const text = modifierValue(key, mods[key]);
    if (label && text) out.push(`${label} ${text}`);
  }
  return out;
}

/** "+12%", "−8%", "+2" (armour), or '' when it rounds to no change. */
export function modifierValue(key: keyof IShipModifiers, v: number): string {
  if (v === NO_MODIFIERS[key]) return '';
  const n = ADDITIVE_MODIFIERS.includes(key) ? (key === 'evadeAdd' ? Math.round(v * 100) : Math.round(v)) : Math.round((v - 1) * 100);
  if (n === 0) return '';
  const unit = !ADDITIVE_MODIFIERS.includes(key) || key === 'evadeAdd' ? '%' : '';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}${unit}`;
}

/** One modifier and what each source adds to it (#130): sources are indices into the list passed in. */
export interface IModifierRow {
  key: keyof IShipModifiers;
  label: string;
  total: string;
  parts: Array<{ source: number; value: string }>;
}

/** The colour-coded breakdown (#130): every modifier any source changes, with each source's share. */
export function modifierBreakdown(sources: ReadonlyArray<{ mods: IShipModifiers }>, total: IShipModifiers): IModifierRow[] {
  const rows: IModifierRow[] = [];
  for (const key of Object.keys(NO_MODIFIERS) as Array<keyof IShipModifiers>) {
    const label = MOD_LABEL[key];
    const t = modifierValue(key, total[key]);
    if (!label || !t) continue;
    const parts = sources.map((s, i) => ({ source: i, value: modifierValue(key, s.mods[key]) })).filter((p) => p.value);
    rows.push({ key, label, total: t, parts });
  }
  return rows;
}
