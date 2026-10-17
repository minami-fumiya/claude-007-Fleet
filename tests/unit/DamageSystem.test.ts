import { describe, it, expect } from 'vitest';
import { activeCriticals, applyCritical, CRITICAL_DURATION_MS, criticalChance, criticalEffects, rollCriticalHit } from '@/systems/DamageSystem';
import { CriticalType } from '@/types/ShipDamage';
import { WeaponType } from '@/types/Weapon';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('DamageSystem', () => {
  it('scales the chance with hit size and weapon', () => {
    expect(criticalChance(WeaponType.Torpedo, 40, 500)).toBeGreaterThan(criticalChance(WeaponType.ShellHE, 40, 500));
    expect(criticalChance(WeaponType.ShellAP, 80, 500)).toBeGreaterThan(criticalChance(WeaponType.ShellAP, 10, 500));
    expect(criticalChance(WeaponType.AntiAir, 80, 500)).toBe(0);
    expect(criticalChance(WeaponType.ShellAP, 80, 0)).toBe(0);
  });

  it('rolls nothing above the chance, a weighted type below it', () => {
    expect(rollCriticalHit(WeaponType.ShellAP, 40, 500, seq(0.99))).toBeNull();
    // Torpedo weights: Engine 5, Rudder 3, MainGun 2 → second roll 0.1 picks Engine, 0.9 picks MainGun.
    expect(rollCriticalHit(WeaponType.Torpedo, 40, 500, seq(0, 0.1))).toBe(CriticalType.Engine);
    expect(rollCriticalHit(WeaponType.Torpedo, 40, 500, seq(0, 0.9))).toBe(CriticalType.MainGun);
  });

  it('criticals expire after their duration', () => {
    const s = applyCritical({}, CriticalType.Engine, 1000);
    expect(activeCriticals(s, 1000)).toEqual([CriticalType.Engine]);
    expect(activeCriticals(s, 1000 + CRITICAL_DURATION_MS)).toEqual([]);
  });

  it('combines effects of active criticals', () => {
    let s = applyCritical({}, CriticalType.Engine, 0);
    s = applyCritical(s, CriticalType.Rudder, 0);
    s = applyCritical(s, CriticalType.MainGun, 0);
    expect(criticalEffects(s, 1)).toEqual({ speedMul: 0.6, turnMul: 0.4, gunReloadMul: 2 });
    expect(criticalEffects(s, CRITICAL_DURATION_MS + 1)).toEqual({ speedMul: 1, turnMul: 1, gunReloadMul: 1 });
  });
});
