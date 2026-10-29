import { describe, expect, it } from 'vitest';
import { lastStandArmor, luckChance, SHIP_SKILLS, skillModifiers, skillOf, skillText } from '@/systems/ShipSkillSystem';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import rm from '@/data/ships/rm.json';
import su from '@/data/ships/su.json';

const ships = [ijn, usn, km, rn, fr, rm, su].flatMap((d) => (d as { ships: Array<{ id: string; nation: string; fictional?: boolean }> }).ships);

describe('艦の固有スキル (#58)', () => {
  it('every skill belongs to a real, historical ship, one skill each', () => {
    for (const s of SHIP_SKILLS) {
      const ship = ships.find((x) => x.id === s.ship);
      expect(ship, s.ship).toBeDefined();
      expect(ship?.fictional, s.ship).toBeFalsy();
    }
    expect(new Set(SHIP_SKILLS.map((s) => s.ship)).size).toBe(SHIP_SKILLS.length);
  });

  it('every navy has famous ships with skills', () => {
    for (const n of ['IJN', 'USN', 'KM', 'RN', 'FR', 'RM', 'SU']) {
      expect(SHIP_SKILLS.filter((s) => ships.find((x) => x.id === s.ship)?.nation === n).length, n).toBeGreaterThanOrEqual(4);
    }
  });

  it('every skill does something and says what', () => {
    for (const s of SHIP_SKILLS) {
      expect(s.mods || s.luck || s.lastStand, s.ship).toBeTruthy();
      expect(skillText(s, 0).length, s.ship).toBeGreaterThan(0);
    }
  });

  it('grows by half again from 改二', () => {
    const yamato = skillOf('yamato');
    expect(skillModifiers(yamato, 0).gunPowerMul).toBeCloseTo(1.08);
    expect(skillModifiers(yamato, 2).gunPowerMul).toBeCloseTo(1.12);
    const yukikaze = skillOf('yukikaze');
    expect(luckChance(yukikaze, 0)).toBeCloseTo(0.12);
    expect(luckChance(yukikaze, 3)).toBeCloseTo(0.18);
    expect(lastStandArmor(skillOf('bismarck'), 0)).toBe(10);
    expect(lastStandArmor(skillOf('bismarck'), 2)).toBe(15);
    expect(skillText(yamato!, 2)).toContain('+12%');
  });

  it('a ship without a skill changes nothing', () => {
    expect(skillOf('fubuki')).toBeUndefined();
    expect(skillModifiers(undefined, 2).gunPowerMul).toBe(1);
    expect(luckChance(undefined, 2)).toBe(0);
  });

  it('no skill is stronger than a modest bonus', () => {
    for (const s of SHIP_SKILLS) {
      for (const v of Object.values(s.mods ?? {})) expect(Math.abs(v - 1) <= 0.15 || v <= 5, s.ship).toBe(true);
      expect(s.luck ?? 0, s.ship).toBeLessThanOrEqual(0.12);
    }
  });
});
