import { IWeaponData, WeaponType } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';
import { BaseShip } from '@/entities/ships/BaseShip';

const REDUCTION_FACTOR = 0.5;

const TYPE_MULTIPLIERS: Record<WeaponType, Record<ShipClass, number>> = {
  [WeaponType.ShellAP]: {
    [ShipClass.Battleship]: 1.0,
    [ShipClass.Cruiser]: 0.9,
    [ShipClass.Destroyer]: 0.7,
    [ShipClass.Carrier]: 0.8,
    [ShipClass.Submarine]: 0.3,
  },
  [WeaponType.ShellHE]: {
    [ShipClass.Battleship]: 0.7,
    [ShipClass.Cruiser]: 1.0,
    [ShipClass.Destroyer]: 1.2,
    [ShipClass.Carrier]: 1.1,
    [ShipClass.Submarine]: 0.4,
  },
  [WeaponType.Torpedo]: {
    [ShipClass.Battleship]: 1.3,
    [ShipClass.Cruiser]: 1.1,
    [ShipClass.Destroyer]: 0.9,
    [ShipClass.Carrier]: 1.5,
    [ShipClass.Submarine]: 0.5,
  },
  [WeaponType.DepthCharge]: {
    [ShipClass.Battleship]: 0.2,
    [ShipClass.Cruiser]: 0.2,
    [ShipClass.Destroyer]: 0.2,
    [ShipClass.Carrier]: 0.2,
    [ShipClass.Submarine]: 2.0,
  },
  [WeaponType.Bomb]: {
    [ShipClass.Battleship]: 0.8,
    [ShipClass.Cruiser]: 0.9,
    [ShipClass.Destroyer]: 1.3,
    [ShipClass.Carrier]: 1.2,
    [ShipClass.Submarine]: 0.3,
  },
  [WeaponType.AntiAir]: {
    [ShipClass.Battleship]: 0.1,
    [ShipClass.Cruiser]: 0.1,
    [ShipClass.Destroyer]: 0.1,
    [ShipClass.Carrier]: 0.1,
    [ShipClass.Submarine]: 0.1,
  },
};

export class CombatSystem {
  static calculateDamage(weapon: IWeaponData, targetClass: ShipClass, targetArmor: number): number {
    const multiplier = TYPE_MULTIPLIERS[weapon.type]?.[targetClass] ?? 1.0;
    return Math.max(1, weapon.firePower * multiplier - targetArmor * REDUCTION_FACTOR);
  }

  static applyDamage(ship: BaseShip, damage: number): void {
    ship.takeDamage(Math.round(damage));
  }
}
