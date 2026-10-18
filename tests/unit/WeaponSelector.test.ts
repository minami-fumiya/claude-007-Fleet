import { describe, it, expect } from 'vitest';
import { canEngage, maxSurfaceRange, primaryWeapon, selectWeapons, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { IWeaponData, WeaponType } from '@/types/Weapon';

const w = (id: string, type: WeaponType, range: number): IWeaponData => ({
  id,
  name: id,
  type,
  firePower: 10,
  range,
  reloadTime: 1000,
  projectileSpeed: 500,
});
const gun = w('gun', WeaponType.ShellAP, 500);
const he = w('he', WeaponType.ShellHE, 400);
const torp = w('torp', WeaponType.Torpedo, 300);
const dc = w('dc', WeaponType.DepthCharge, 60);
const surface = { targetSubmerged: false, shooterSubmerged: false };

describe('WeaponSelector', () => {
  it('classifies weapon kinds', () => {
    expect(weaponKind(gun)).toBe(WeaponKind.Gun);
    expect(weaponKind(he)).toBe(WeaponKind.Gun);
    expect(weaponKind(torp)).toBe(WeaponKind.Torpedo);
    expect(weaponKind(dc)).toBe(WeaponKind.DepthCharge);
    expect(weaponKind(w('aa', WeaponType.AntiAir, 100))).toBe(WeaponKind.Other);
  });

  it('fires guns at surface targets within range', () => {
    expect(selectWeapons([gun, he, torp, dc], { ...surface, distance: 450 })).toEqual([gun]);
    expect(selectWeapons([gun, he, torp, dc], { ...surface, distance: 250 })).toEqual([gun, he, torp]);
  });

  it('holds torpedoes until closer when eagerness is low', () => {
    expect(canEngage(torp, { ...surface, distance: 250, torpedoEagerness: 0 })).toBe(false);
    expect(canEngage(torp, { ...surface, distance: 170, torpedoEagerness: 0 })).toBe(true);
    expect(canEngage(torp, { ...surface, distance: 290, torpedoEagerness: 1 })).toBe(true);
  });

  it('only depth charges reach a submerged target', () => {
    const ctx = { targetSubmerged: true, shooterSubmerged: false };
    expect(selectWeapons([gun, torp, dc], { ...ctx, distance: 50 })).toEqual([dc]);
    expect(selectWeapons([gun, torp, dc], { ...ctx, distance: 80 })).toEqual([]);
  });

  it('never drops depth charges on surface ships', () => {
    expect(canEngage(dc, { ...surface, distance: 10 })).toBe(false);
  });

  it('lets a submerged boat launch torpedoes only', () => {
    const ctx = { targetSubmerged: false, shooterSubmerged: true, distance: 100 };
    expect(selectWeapons([gun, torp, dc], ctx)).toEqual([torp]);
  });

  it('picks the first gun as the primary weapon', () => {
    expect(primaryWeapon([torp, he, gun])).toBe(he);
    expect(primaryWeapon([torp])).toBe(torp);
    expect(primaryWeapon([])).toBeUndefined();
  });

  it('reports the longest surface range', () => {
    expect(maxSurfaceRange([dc, torp, gun])).toBe(500);
    expect(maxSurfaceRange([dc])).toBe(0);
  });
});
