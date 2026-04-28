import { describe, it, expect } from 'vitest';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponType, IWeaponData } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';

const makeWeapon = (type: WeaponType, firePower: number): IWeaponData => ({
  id: 'test',
  name: 'Test Weapon',
  type,
  firePower,
  range: 300,
  reloadTime: 1000,
  projectileSpeed: 500,
});

describe('CombatSystem.calculateDamage', () => {
  it('AP vs Battleship applies 1.0 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Battleship, 0);
    expect(dmg).toBe(100);
  });

  it('AP vs Destroyer applies 0.7 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Destroyer, 0);
    expect(dmg).toBe(70);
  });

  it('AP vs Cruiser applies 0.9 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Cruiser, 0);
    expect(dmg).toBe(90);
  });

  it('armor reduces damage by 0.5 factor', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Battleship, 50);
    expect(dmg).toBe(75); // 100*1.0 - 50*0.5 = 75
  });

  it('minimum damage is 1 regardless of armor', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 10), ShipClass.Battleship, 9999);
    expect(dmg).toBe(1);
  });

  it('HE is more effective than AP vs Destroyer', () => {
    const ap = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Destroyer, 0);
    const he = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellHE, 100), ShipClass.Destroyer, 0);
    expect(he).toBeGreaterThan(ap);
  });

  it('AP is more effective than HE vs Battleship', () => {
    const ap = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Battleship, 0);
    const he = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellHE, 100), ShipClass.Battleship, 0);
    expect(ap).toBeGreaterThan(he);
  });

  it('Torpedo vs Carrier applies 1.5 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.Torpedo, 100), ShipClass.Carrier, 0);
    expect(dmg).toBe(150);
  });

  it('DepthCharge vs Submarine applies 2.0 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.DepthCharge, 100), ShipClass.Submarine, 0);
    expect(dmg).toBe(200);
  });

  it('AP vs Submarine applies 0.3 multiplier', () => {
    const dmg = CombatSystem.calculateDamage(makeWeapon(WeaponType.ShellAP, 100), ShipClass.Submarine, 0);
    expect(dmg).toBe(30);
  });
});
