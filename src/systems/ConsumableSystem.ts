import { ShipClass } from '@/types/ShipClass';

/**
 * 消耗品 (#47, pure): two active skills per ship, by class — damage control parties, smoke, full power, an AA barrage,
 * radar / hydrophones. Each has charges, a cooldown and an effect that lasts a while. Research opens each kind (and
 * a deep enough branch adds a charge). The player uses the flagship's from the HUD; every other ship — escorts and
 * the enemy — uses its own when the moment calls for it.
 */

export type ConsumableKind = 'repair' | 'smoke' | 'boost' | 'aa' | 'radar';

export interface IConsumableDef {
  kind: ConsumableKind;
  name: string;
  /** Effect length */
  durationMs: number;
  cooldownMs: number;
  charges: number;
  /** Research that opens it, and the research that adds a charge */
  requires: string;
  extraChargeAt: string;
  note: string;
}

export const CONSUMABLES: Record<ConsumableKind, IConsumableDef> = {
  repair: { kind: 'repair', name: '応急修理', durationMs: 8_000, cooldownMs: 60_000, charges: 1, requires: 'damage_control_2', extraChargeAt: 'damage_control_6', note: '8 秒で耐久を最大の 15% 回復し、火災・浸水を消す' },
  smoke: { kind: 'smoke', name: '煙幕', durationMs: 20_000, cooldownMs: 50_000, charges: 2, requires: 'night_2', extraChargeAt: 'night_6', note: '20 秒間、煙の中の艦は近くの敵にしか見えない' },
  boost: { kind: 'boost', name: '機関全開', durationMs: 15_000, cooldownMs: 40_000, charges: 2, requires: 'engine_2', extraChargeAt: 'engine_6', note: '15 秒間、速力 +15%' },
  aa: { kind: 'aa', name: '対空弾幕', durationMs: 20_000, cooldownMs: 45_000, charges: 2, requires: 'aa_2', extraChargeAt: 'aa_6', note: '20 秒間、対空 ×2' },
  radar: { kind: 'radar', name: '索敵', durationMs: 20_000, cooldownMs: 50_000, charges: 2, requires: 'radar_1', extraChargeAt: 'radar_6', note: '20 秒間、視界 ×1.5、煙幕と潜航中の潜水艦も見つける' },
};

/** The two slots of each class. */
export const CLASS_CONSUMABLES: Record<ShipClass, [ConsumableKind, ConsumableKind]> = {
  [ShipClass.Battleship]: ['repair', 'boost'],
  [ShipClass.Cruiser]: ['repair', 'radar'],
  [ShipClass.Destroyer]: ['smoke', 'boost'],
  [ShipClass.Carrier]: ['aa', 'repair'],
  [ShipClass.Submarine]: ['boost', 'radar'],
};

/** What each effect does. */
export const REPAIR_SHARE = 0.15;
export const BOOST_SPEED = 1.15;
export const AA_BARRAGE = 2;
export const RADAR_VISION = 1.5;
export const SMOKE_RADIUS = 160;
/** An enemy this close sees into the smoke. */
export const SMOKE_SPOT = 180;

export interface IConsumableSlot {
  kind: ConsumableKind;
  left: number;
  /** Battle time it can be used again */
  readyAt: number;
  /** Battle time its effect ends (0 = none running) */
  activeUntil: number;
}

/**
 * A ship's slots for the research done; kinds whose research is missing are left out. An enemy ship has every kind its
 * class has, one charge each (its strength is set by the difficulty curve).
 */
export function shipConsumables(shipClass: ShipClass, research: readonly string[] | 'enemy'): IConsumableSlot[] {
  return CLASS_CONSUMABLES[shipClass]
    .filter((k) => research === 'enemy' || research.includes(CONSUMABLES[k].requires))
    .map((kind) => ({
      kind,
      // An enemy ship has one charge of each.
      left: research === 'enemy' ? 1 : CONSUMABLES[kind].charges + (research.includes(CONSUMABLES[kind].extraChargeAt) ? 1 : 0),
      readyAt: 0,
      activeUntil: 0,
    }));
}

export function canUse(slot: IConsumableSlot, now: number): boolean {
  return slot.left > 0 && now >= slot.readyAt && now >= slot.activeUntil;
}

/** Uses a charge: the effect runs from `now` and the cooldown starts when it ends. Null when it can't be used. */
export function useConsumable(slot: IConsumableSlot, now: number): IConsumableSlot | null {
  if (!canUse(slot, now)) return null;
  const def = CONSUMABLES[slot.kind];
  return { ...slot, left: slot.left - 1, activeUntil: now + def.durationMs, readyAt: now + def.durationMs + def.cooldownMs };
}

export function isActive(slots: readonly IConsumableSlot[], kind: ConsumableKind, now: number): boolean {
  return slots.some((s) => s.kind === kind && s.activeUntil > now);
}

/** The button's label: "煙幕 2", "煙幕 中 12", "煙幕 待 30", "煙幕 —". */
export function slotLabel(slot: IConsumableSlot, now: number): string {
  const name = CONSUMABLES[slot.kind].name;
  if (slot.activeUntil > now) return `${name} 中 ${Math.ceil((slot.activeUntil - now) / 1000)}`;
  if (slot.left <= 0) return `${name} —`;
  if (now < slot.readyAt) return `${name} 待 ${Math.ceil((slot.readyAt - now) / 1000)}`;
  return `${name} ${slot.left}`;
}

/** What the ship knows when it decides (AI ships and the flagship on AUTO). */
export interface IConsumableSituation {
  hpFraction: number;
  /** Seen by the other side */
  seen: boolean;
  /** Enemy planes within a few hundred px */
  raidNear: boolean;
  /** An enemy submarine under water, or enemies the side has lost sight of */
  hiddenFoes: boolean;
  /** Enemies within gun range */
  foesNear: boolean;
  burning: boolean;
}

/** Which kind an AI ship uses now, if any. */
export function aiConsumable(slots: readonly IConsumableSlot[], s: IConsumableSituation, now: number): ConsumableKind | null {
  const ready = (k: ConsumableKind): boolean => slots.some((x) => x.kind === k && canUse(x, now));
  if (ready('repair') && (s.hpFraction < 0.5 || (s.burning && s.hpFraction < 0.8))) return 'repair';
  if (ready('smoke') && s.seen && s.foesNear && s.hpFraction < 0.6) return 'smoke';
  if (ready('aa') && s.raidNear) return 'aa';
  if (ready('radar') && s.hiddenFoes) return 'radar';
  // Full power to get away when badly hurt (rushing in with it broke the line and ran into torpedoes).
  if (ready('boost') && s.foesNear && s.hpFraction < 0.35) return 'boost';
  return null;
}

/** HP the repair puts back per second while it runs. */
export function repairPerSec(maxHp: number): number {
  return (maxHp * REPAIR_SHARE) / (CONSUMABLES.repair.durationMs / 1000);
}

export interface ISmokeCloud {
  x: number;
  y: number;
  until: number;
}

/** Whether a ship at (x, y) is hidden in smoke from viewers at `viewers` (an enemy close enough still sees it). */
export function hiddenBySmoke(x: number, y: number, clouds: readonly ISmokeCloud[], viewers: ReadonlyArray<{ x: number; y: number }>, now: number): boolean {
  const inside = clouds.some((c) => c.until > now && Math.hypot(c.x - x, c.y - y) <= SMOKE_RADIUS);
  return inside && !viewers.some((v) => Math.hypot(v.x - x, v.y - y) <= SMOKE_SPOT);
}
