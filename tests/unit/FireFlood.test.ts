import { describe, it, expect } from 'vitest';
import {
  activeStatus, applyCritical, applyStatus, CRITICAL_DURATION_MS, damageReadout, effectiveShell, weaponReadout, FLOOD_SPEED_MUL, nextShellMode, rollStatus, STATUS_DPS, STATUS_DURATION_MS, statusDamage, statusSpeedMul,
} from '@/systems/DamageSystem';
import { CombatSystem } from '@/systems/CombatSystem';
import { ShipClass } from '@/types/ShipClass';
import { CriticalType } from '@/types/ShipDamage';
import { IWeaponData, WeaponType } from '@/types/Weapon';

const seq = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('弾種と火災・浸水 (#48)', () => {
  it('HE and bombs start fires, torpedoes flood; good damage control lowers the odds', () => {
    expect(rollStatus(WeaponType.ShellHE, seq(0.05))).toBe('fire');
    expect(rollStatus(WeaponType.ShellHE, seq(0.5, 0.5))).toBeNull();
    expect(rollStatus(WeaponType.Torpedo, seq(0.9, 0.2))).toBe('flood');
    expect(rollStatus(WeaponType.ShellAP, seq(0.05, 0.05))).toBeNull();
    expect(rollStatus(WeaponType.ShellHE, seq(0.11, 0.9), 0.85)).toBeNull();
  });

  it('a fire burns for its time, a flood also slows the ship; damage control shortens both', () => {
    const s = applyStatus(applyStatus({}, 'fire', 1000), 'flood', 1000, 0.7);
    // The flood (shortened to 70%) is over before the fire.
    expect(activeStatus(s, 1000 + STATUS_DURATION_MS.flood * 0.7 + 1)).toEqual(['fire']);
    expect(statusDamage(s, 2000, 1000, 10_000)).toBeCloseTo((STATUS_DPS.fire + STATUS_DPS.flood) * 10_000);
    expect(statusSpeedMul(s, 2000)).toBe(FLOOD_SPEED_MUL);
    expect(statusSpeedMul(s, 1000 + STATUS_DURATION_MS.flood)).toBe(1);
    expect(statusDamage(s, 1000 + STATUS_DURATION_MS.flood, 1000, 10_000)).toBe(0);
  });

  it('AUTO fires AP at heavy ships and HE at the rest, so a forced wrong shell does less', () => {
    expect(effectiveShell(WeaponType.ShellHE, 'auto', ShipClass.Battleship)).toBe(WeaponType.ShellAP);
    expect(effectiveShell(WeaponType.ShellAP, 'auto', ShipClass.Destroyer)).toBe(WeaponType.ShellHE);
    expect(effectiveShell(WeaponType.ShellAP, 'HE', ShipClass.Battleship)).toBe(WeaponType.ShellHE);
    expect(effectiveShell(WeaponType.Torpedo, 'AP', ShipClass.Battleship)).toBe(WeaponType.Torpedo);
    const gun = { firePower: 100, type: WeaponType.ShellAP } as IWeaponData;
    const vsBB = (t: WeaponType): number => CombatSystem.calculateDamage({ ...gun, type: t }, ShipClass.Battleship, 20);
    const vsDD = (t: WeaponType): number => CombatSystem.calculateDamage({ ...gun, type: t }, ShipClass.Destroyer, 5);
    expect(vsBB(WeaponType.ShellAP)).toBeGreaterThan(vsBB(WeaponType.ShellHE));
    expect(vsDD(WeaponType.ShellHE)).toBeGreaterThan(vsDD(WeaponType.ShellAP));
    expect([nextShellMode('auto'), nextShellMode('AP'), nextShellMode('HE')]).toEqual(['AP', 'HE', 'auto']);
  });
});

describe('HUD readouts (#81)', () => {
  it('lists each weapon as ready or how far reloaded', () => {
    expect(weaponReadout([{ label: '主砲', progress: 1 }, { label: '魚雷', progress: 0.645 }])).toBe('主砲 ●  魚雷 64%');
    expect(weaponReadout([])).toBe('');
  });

  it('names what is damaged, what it does and how long it lasts', () => {
    const crits = applyCritical({}, CriticalType.Engine, 0);
    const status = applyStatus({}, 'fire', 0);
    const line = damageReadout(crits, status, 3000);
    expect(line).toContain('機関損傷 速力 −40%');
    expect(line).toContain(`${Math.ceil((CRITICAL_DURATION_MS - 3000) / 1000)}秒`);
    expect(line).toContain('火災 9秒');
    expect(damageReadout({}, {}, 0)).toBe('');
  });
});
