import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData } from '@/types/Weapon';
import { CombatSystem } from './CombatSystem';
import { weaponKind, WeaponKind } from './WeaponSelector';

/**
 * Analytic balance model (pure): expected damage per second of a ship's loadout against a target and
 * how long a one-on-one gunfight would take. Used by the balance tests and docs, not by the game.
 */

/** Share of shots / torpedoes expected to hit at typical ranges. */
export const GUN_HIT_RATE = 0.45;
export const TORPEDO_HIT_RATE = 0.3;
/** Torpedo weapons fire 2-torpedo salvos sharing their firePower (see WeaponSystem). */
const TORPEDOES_PER_SALVO = 2;

export interface ITarget {
  shipClass: ShipClass;
  armor: number;
}

export function weaponDps(weapon: IWeaponData, target: ITarget): number {
  const kind = weaponKind(weapon);
  if (weapon.reloadTime <= 0) return 0;
  const perSec = 1000 / weapon.reloadTime;
  if (kind === WeaponKind.Gun) {
    return CombatSystem.calculateDamage(weapon, target.shipClass, target.armor) * perSec * GUN_HIT_RATE;
  }
  if (kind === WeaponKind.Torpedo) {
    const each = { ...weapon, firePower: weapon.firePower / TORPEDOES_PER_SALVO };
    return CombatSystem.calculateDamage(each, target.shipClass, target.armor) * TORPEDOES_PER_SALVO * perSec * TORPEDO_HIT_RATE;
  }
  return 0;
}

export function shipDps(loadout: IWeaponData[], target: ITarget): number {
  return loadout.reduce((sum, w) => sum + weaponDps(w, target), 0);
}

/** Seconds for `attacker` to sink `defender` (Infinity when it can't hurt it). */
export function timeToKill(attacker: IWeaponData[], defender: IShipData): number {
  const dps = shipDps(attacker, defender);
  return dps > 0 ? defender.hp / dps : Infinity;
}

/** attacker's time-to-kill on defender divided by defender's on attacker: < 1 means the attacker wins. */
export function duelRatio(a: IWeaponData[], aShip: IShipData, b: IWeaponData[], bShip: IShipData): number {
  return timeToKill(a, bShip) / timeToKill(b, aShip);
}
