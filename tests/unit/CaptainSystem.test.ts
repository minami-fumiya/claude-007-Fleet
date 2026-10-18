import { describe, it, expect } from 'vitest';
import { awardXp, battleXp, captainModifiers, levelForXp, MAX_LEVEL, SKILL_LABEL, withProgress, xpForLevel } from '@/systems/CaptainSystem';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { Nation } from '@/types/Nation';
import { NO_MODIFIERS } from '@/types/Modifiers';
import captains from '@/data/captains.json';

const data = (skill: CaptainSkill): ICaptainData => ({ id: 'c', name: 'c', nation: Nation.IJN, skill });

describe('CaptainSystem levels', () => {
  it('uses triangular XP thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
  });

  it('derives the level from XP, capped', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(1e9)).toBe(MAX_LEVEL);
  });

  it('awards XP and reports level-ups', () => {
    const c = withProgress(data(CaptainSkill.Gunnery), 90);
    const a = awardXp(c, 20);
    expect(a.captain.xp).toBe(110);
    expect(a.captain.level).toBe(2);
    expect(a.leveledUp).toBe(true);
    expect(awardXp(a.captain, 10).leveledUp).toBe(false);
  });
});

describe('battleXp', () => {
  it('rewards kills and victory, more on the flagship, less when sunk', () => {
    const base = { victory: false, enemiesSunk: 0, flagship: false, survived: true };
    expect(battleXp(base)).toBe(40);
    expect(battleXp({ ...base, victory: true, enemiesSunk: 3 })).toBe(190);
    expect(battleXp({ ...base, flagship: true })).toBe(48);
    expect(battleXp({ ...base, survived: false })).toBe(20);
  });
});

describe('captainModifiers', () => {
  it('is neutral without a captain', () => {
    expect(captainModifiers(null)).toEqual(NO_MODIFIERS);
  });

  it('scales the speciality with level', () => {
    const lv1 = captainModifiers(withProgress(data(CaptainSkill.Gunnery), 0));
    const lv4 = captainModifiers(withProgress(data(CaptainSkill.Gunnery), 600));
    expect(lv4.gunPowerMul).toBeGreaterThan(lv1.gunPowerMul);
    expect(lv4.gunReloadMul).toBeLessThan(1);
    expect(captainModifiers(withProgress(data(CaptainSkill.Torpedo), 0)).torpedoPowerMul).toBeGreaterThan(1);
    const eng = captainModifiers(withProgress(data(CaptainSkill.Engineering), 0));
    expect(eng.speedMul).toBeGreaterThan(1);
    expect(eng.hpMul).toBeGreaterThan(1);
  });

  it('maps the new specialities to their modifiers', () => {
    const lv5 = (skill: CaptainSkill) => captainModifiers(withProgress(data(skill), xpForLevel(5)));
    expect(lv5(CaptainSkill.Aviation).airPowerMul).toBeCloseTo(1.2);
    expect(lv5(CaptainSkill.Aviation).aaMul).toBeGreaterThan(1);
    expect(lv5(CaptainSkill.ASW).aswMul).toBeCloseTo(1.25);
    expect(lv5(CaptainSkill.Recon).visionMul).toBeCloseTo(1.2);
    expect(lv5(CaptainSkill.Damecon).hpMul).toBeCloseTo(1.1);
    expect(lv5(CaptainSkill.Damecon).armorAdd).toBe(2);
    // Each speciality leaves unrelated stats alone.
    expect(lv5(CaptainSkill.Recon).gunPowerMul).toBe(1);
    expect(lv5(CaptainSkill.ASW).torpedoPowerMul).toBe(1);
  });

  it('gives the night-battle speciality its bonus only at night', () => {
    const c = withProgress(data(CaptainSkill.Night), xpForLevel(4));
    expect(captainModifiers(c)).toEqual(NO_MODIFIERS);
    expect(captainModifiers(c, { night: false })).toEqual(NO_MODIFIERS);
    const night = captainModifiers(c, { night: true });
    expect(night.visionMul).toBeCloseTo(1.2);
    expect(night.gunPowerMul).toBeGreaterThan(1);
    expect(night.torpedoPowerMul).toBeGreaterThan(1);
  });

  it('labels every skill', () => {
    for (const skill of Object.values(CaptainSkill)) expect(SKILL_LABEL[skill], skill).toMatch(/^.{2}$/);
  });

  it('has eight captains per nation, one of each skill, with unique ids', () => {
    const all = captains.captains as ICaptainData[];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const nation of Object.values(Nation)) {
      const mine = all.filter((c) => c.nation === nation);
      expect(mine.map((c) => c.skill).sort(), nation).toEqual(Object.values(CaptainSkill).sort());
    }
  });
});
