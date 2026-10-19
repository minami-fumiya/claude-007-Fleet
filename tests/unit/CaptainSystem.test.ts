import { describe, it, expect } from 'vitest';
import {
  ABILITY_MAX, APTITUDE_SCALE, aptitudeFor, assignCaptains, recommendedShips, awardXp, battleXp, captainAbilities, captainModifiers, inherentLabel, inherentTier, levelForXp, MAX_LEVEL,
  nextInherentTier, scaleModifiers, SKILL_LABEL, skillModifiers, withProgress, xpForLevel, bonusScale, LEARNED_SKILL_SCALE, validBonus,
} from '@/systems/CaptainSystem';
import { nationCaptains } from '@/systems/CaptainRoster';
import { parseSave } from '@/utils/ProgressStore';
import { ShipClass } from '@/types/ShipClass';
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
    const lv5 = (skill: CaptainSkill) => skillModifiers(skill, 5);
    expect(lv5(CaptainSkill.Aviation).airPowerMul).toBeCloseTo(1.2);
    // Air defence moved from 航空 to 対空 (#185); aviators rearm faster instead.
    expect(lv5(CaptainSkill.Aviation).aaMul).toBe(1);
    expect(lv5(CaptainSkill.Aviation).rearmMul).toBeCloseTo(0.925);
    expect(lv5(CaptainSkill.AntiAir).aaMul).toBeCloseTo(1.25);
    expect(lv5(CaptainSkill.AntiAir).airPowerMul).toBe(1);
    expect(lv5(CaptainSkill.ASW).depthChargeMul).toBeCloseTo(1.25);
    expect(lv5(CaptainSkill.Recon).visionMul).toBeCloseTo(1.2);
    expect(lv5(CaptainSkill.Damecon).hpMul).toBeCloseTo(1.1);
    expect(lv5(CaptainSkill.Damecon).armorAdd).toBe(2);
    // Each speciality leaves unrelated stats alone.
    expect(lv5(CaptainSkill.Recon).gunPowerMul).toBe(1);
    expect(lv5(CaptainSkill.ASW).torpedoPowerMul).toBe(1);
  });

  it('gives the night-battle speciality its bonus only at night', () => {
    expect(skillModifiers(CaptainSkill.Night, 4)).toEqual(NO_MODIFIERS);
    expect(skillModifiers(CaptainSkill.Night, 4, { night: false })).toEqual(NO_MODIFIERS);
    const night = skillModifiers(CaptainSkill.Night, 4, { night: true });
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

describe('growth to Lv100 (#131)', () => {
  it('keeps the early curve and reaches Lv100', () => {
    expect(MAX_LEVEL).toBe(100);
    expect(xpForLevel(10)).toBe(4500);
    expect(levelForXp(4500)).toBe(10);
    expect(levelForXp(xpForLevel(100))).toBe(100);
    expect(levelForXp(xpForLevel(100) - 1)).toBe(99);
  });

  it('skills stop growing at Lv10; the inherent one strengthens to II at Lv10 and III at Lv50', () => {
    expect(skillModifiers(CaptainSkill.Gunnery, 80)).toEqual(skillModifiers(CaptainSkill.Gunnery, 10));
    expect(inherentTier(9).mul).toBe(1);
    expect(inherentTier(10)).toMatchObject({ mul: 1.5, label: 'II' });
    expect(inherentTier(50)).toMatchObject({ mul: 2, label: 'III' });
    expect(nextInherentTier(20)?.level).toBe(50);
    expect(nextInherentTier(50)).toBeNull();
    expect(inherentLabel(withProgress(data(CaptainSkill.Gunnery), xpForLevel(10)))).toBe('砲術 II');
    const gun = (lv: number) => captainModifiers(withProgress(data(CaptainSkill.Gunnery), xpForLevel(lv))).gunPowerMul;
    expect(gun(10)).toBeGreaterThan(gun(9) + 0.1);
    expect(gun(50)).toBeGreaterThan(gun(49) + 0.1);
  });

  it('abilities grow with level up to +20% for the speciality, a little in everything', () => {
    const lv = (n: number) => captainAbilities(withProgress(data(CaptainSkill.Gunnery), xpForLevel(n)));
    expect(Object.values(lv(1)).every((v) => v === 0)).toBe(true);
    expect(lv(100).gunnery).toBe(ABILITY_MAX);
    expect(lv(50).gunnery).toBeGreaterThan(lv(10).gunnery);
    expect(lv(10).gunnery).toBeGreaterThan(lv(5).gunnery);
    for (const v of Object.values(lv(100))) expect(v).toBeGreaterThan(0);
    expect(captainAbilities(withProgress(data(CaptainSkill.Aviation), xpForLevel(100))).aviation).toBe(ABILITY_MAX);
  });

  it('aptitude follows the speciality, can be overridden, and scales skills and abilities', () => {
    expect(aptitudeFor(data(CaptainSkill.Aviation), ShipClass.Carrier)).toBe('S');
    expect(aptitudeFor(data(CaptainSkill.Gunnery), ShipClass.Battleship)).toBe('S');
    expect(aptitudeFor(data(CaptainSkill.Torpedo), ShipClass.Destroyer)).toBe('S');
    expect(aptitudeFor({ ...data(CaptainSkill.Gunnery), aptitude: { Carrier: 'A' } }, ShipClass.Carrier)).toBe('A');
    const c = withProgress(data(CaptainSkill.Gunnery), xpForLevel(20));
    const bb = captainModifiers(c, {}, [], undefined, ShipClass.Battleship).gunPowerMul - 1;
    const dd = captainModifiers(c, {}, [], undefined, ShipClass.Destroyer).gunPowerMul - 1;
    const cv = captainModifiers(c, {}, [], undefined, ShipClass.Carrier).gunPowerMul - 1;
    expect(bb).toBeGreaterThan(dd);
    expect(dd).toBeGreaterThan(cv);
    expect(scaleModifiers({ ...NO_MODIFIERS, gunPowerMul: 1.5, armorAdd: 3, evadeAdd: 0.1 }, APTITUDE_SCALE.C))
      .toMatchObject({ gunPowerMul: 1.3, armorAdd: 1, evadeAdd: 0.06 });
    expect(scaleModifiers(NO_MODIFIERS, 1.2)).toEqual(NO_MODIFIERS);
  });
});

describe('recommended ships and automatic assignment (#164)', () => {
  const cap = (id: string, skill: CaptainSkill, level: number): ICaptainData & { level: number } => ({ id, name: id, nation: Nation.IJN, skill, level } as ICaptainData & { level: number });
  const torpedo = cap('t', CaptainSkill.Torpedo, 5);
  const gunnery = cap('g', CaptainSkill.Gunnery, 3);
  const aviation = cap('a', CaptainSkill.Aviation, 1);

  it('recommends the strongest owned ships with S aptitude, at most 3', () => {
    const ships = [
      { id: 'dd1', shipClass: ShipClass.Destroyer, hp: 100 },
      { id: 'dd2', shipClass: ShipClass.Destroyer, hp: 120 },
      { id: 'bb', shipClass: ShipClass.Battleship, hp: 600 },
      { id: 'dd3', shipClass: ShipClass.Destroyer, hp: 110 },
      { id: 'dd4', shipClass: ShipClass.Destroyer, hp: 90 },
    ];
    expect(recommendedShips(torpedo, ships).map((s) => s.id)).toEqual(['dd2', 'dd3', 'dd1']);
    expect(recommendedShips(gunnery, ships).map((s) => s.id)).toEqual(['bb']);
    expect(recommendedShips(aviation, ships)).toEqual([]);
  });

  it('gives each ship the best-fitting free captain, flagship first', () => {
    expect(assignCaptains([ShipClass.Battleship, ShipClass.Destroyer, ShipClass.Carrier, null], [torpedo, aviation, gunnery])).toEqual(['g', 't', 'a', null]);
    // Fewer captains than ships: the flagship is served first.
    expect(assignCaptains([ShipClass.Destroyer, ShipClass.Destroyer], [aviation])).toEqual(['a', null]);
    // The same aptitude: the higher level wins.
    expect(assignCaptains([ShipClass.Destroyer], [cap('low', CaptainSkill.Night, 2), cap('high', CaptainSkill.Night, 9)])).toEqual(['high']);
  });
});

describe('航空 and 対空 split (#185)', () => {
  const aviator = withProgress(nationCaptains('IJN').find((c) => c.skill === CaptainSkill.Aviation)!, xpForLevel(50));
  const gunner = withProgress(nationCaptains('IJN').find((c) => c.skill === CaptainSkill.Gunnery)!, xpForLevel(10));

  it('a carried-over 対空 gives an aviator exactly the air defence 航空 gave before', () => {
    // Before 0.0.29: 航空 gave aaMul 1 + 0.03 × level (up to 10) × inherent tier.
    const old = 1 + 0.03 * 10 * inherentTier(aviator.level).mul;
    expect(captainModifiers(aviator, {}, [], undefined, undefined, [CaptainSkill.AntiAir]).aaMul).toBeGreaterThanOrEqual(old - 1e-9);
    expect(skillModifiers(CaptainSkill.AntiAir, aviator.level, {}, bonusScale(aviator)).aaMul).toBeCloseTo(old);
  });

  it('a learned 航空 carried over as 対空 is no weaker than before', () => {
    const old = 1 + 0.03 * 10 * LEARNED_SKILL_SCALE;
    expect(skillModifiers(CaptainSkill.AntiAir, gunner.level, {}, bonusScale(gunner)).aaMul).toBeGreaterThanOrEqual(old);
    // Not twice: learning 対空 again replaces the carried-over one.
    expect(validBonus(gunner, [CaptainSkill.AntiAir], [CaptainSkill.AntiAir])).toEqual([]);
    expect(validBonus(gunner, [CaptainSkill.AntiAir, 'nope'])).toEqual([CaptainSkill.AntiAir]);
  });

  it('the save keeps it: v16 gives 対空 to owned aviators and captains who learned 航空', () => {
    const avId = nationCaptains('IJN').find((c) => c.skill === CaptainSkill.Aviation)!.id;
    const raw = { version: 15, current: 'IJN', record: {}, tutorial: { step: 0, done: true }, nations: { IJN: { ships: ['fubuki'], captains: ['ijn_sakai', avId], captainSkills: { ijn_sakai: ['Aviation'] } } } };
    const save = parseSave(JSON.stringify(raw));
    expect(save.nations.IJN!.captainBonus).toEqual({ ijn_sakai: [CaptainSkill.AntiAir], [avId]: [CaptainSkill.AntiAir] });
  });

  it('every nation has an AA specialist who suits destroyers and cruisers', () => {
    for (const n of ['IJN', 'USN', 'KM', 'RN', 'FR', 'SU', 'RM']) {
      const aa = nationCaptains(n).filter((c) => c.skill === CaptainSkill.AntiAir);
      expect(aa.length, n).toBeGreaterThanOrEqual(1);
      expect(aptitudeFor(aa[0], ShipClass.Destroyer)).toBe('S');
      expect(aptitudeFor(aa[0], ShipClass.Cruiser)).toBe('S');
    }
  });
});
