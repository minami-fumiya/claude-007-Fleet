import { describe, it, expect } from 'vitest';
import {
  abilityModifiers, addBattleStats, captainAbilities, captainModifiers, captainSources, learnPlan, levelUpNotes, RETRAIN_COST, earnedTraits, LEARNED_SKILL_SCALE, learnSkill, learnSlots, skillModifiers, validLearned, withProgress, xpForLevel,
} from '@/systems/CaptainSystem';
import { combineModifiers } from '@/systems/CustomizationSystem';
import { modifierBreakdown } from '@/systems/EncyclopediaSystem';
import { ALL_CAPTAINS, DUPLICATE_CAPTAIN_XP, duplicateCaptain, RECRUIT_ORDER, nationCaptains, nextCaptain, recruitCaptain, starterCaptain } from '@/systems/CaptainRoster';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { emptySave, parseSave, switchNation } from '@/utils/ProgressStore';

const data: ICaptainData = { id: 'c', name: '試験', nation: Nation.IJN, skill: CaptainSkill.Gunnery };
const atLevel = (lv: number) => withProgress(data, xpForLevel(lv));

describe('learned skills (#45)', () => {
  it('slots open at Lv3 / 6 / 9 / 30 / 60 (#131)', () => {
    expect([1, 2, 3, 5, 6, 8, 9, 10, 29, 30, 59, 60, 100].map(learnSlots)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5]);
  });

  it('learns into free slots, never the inherent skill or a repeat; retraining swaps one', () => {
    const c = atLevel(6);
    expect(learnSkill(atLevel(2), [], CaptainSkill.Torpedo)).toBeNull();
    expect(learnSkill(c, [], CaptainSkill.Gunnery)).toBeNull();
    const one = learnSkill(c, [], CaptainSkill.Torpedo)!;
    expect(learnSkill(c, one, CaptainSkill.Torpedo)).toBeNull();
    const two = learnSkill(c, one, CaptainSkill.Night)!;
    expect(two).toEqual([CaptainSkill.Torpedo, CaptainSkill.Night]);
    expect(learnSkill(c, two, CaptainSkill.Recon)).toBeNull();
    expect(learnSkill(c, two, CaptainSkill.Recon, CaptainSkill.Torpedo)).toEqual([CaptainSkill.Recon, CaptainSkill.Night]);
    // Stored junk or skills beyond the open slots are ignored.
    expect(validLearned(atLevel(3), ['Bogus', 'Gunnery', 'Torpedo', 'Night'])).toEqual([CaptainSkill.Torpedo]);
  });

  it('a learned skill gives 60% of the same skill as a speciality', () => {
    const c = atLevel(5);
    const own = skillModifiers(CaptainSkill.Torpedo, 5);
    const learned = captainModifiers(c, {}, [CaptainSkill.Torpedo]);
    expect(learned.torpedoPowerMul / captainModifiers(c).torpedoPowerMul - 1).toBeCloseTo((own.torpedoPowerMul - 1) * LEARNED_SKILL_SCALE, 6);
    // Without learned skills or traits: the speciality and the abilities (#131).
    expect(captainModifiers(c)).toEqual(combineModifiers(skillModifiers(CaptainSkill.Gunnery, 5), abilityModifiers(captainAbilities(c))));
  });
});

describe('traits (#45)', () => {
  it('are earned from battle stats and add their bonus', () => {
    let stats = addBattleStats(undefined, { night: true, sunk: 2, subsSunk: 0, heavySurvival: false });
    expect(earnedTraits(stats)).toEqual([]);
    stats = addBattleStats(stats, { night: true, sunk: 1, subsSunk: 0, heavySurvival: true });
    expect(earnedTraits(stats).map((t) => t.id)).toEqual(['night_ace']);
    const c = atLevel(1);
    expect(captainModifiers(c, { night: true }, [], stats).nightVisionMul).toBeGreaterThan(1);
    expect(captainModifiers(c, { night: false }, [], stats).nightVisionMul).toBe(1);
  });
});

describe('captain roster (#44)', () => {
  it('a new nation starts with a destroyer captain; recruits suit the classes the nation owns (#159)', () => {
    const save = switchNation(emptySave(), Nation.USN, 'fletcher', 0);
    const first = starterCaptain('USN')!;
    expect(first.skill).toBe(CaptainSkill.Torpedo);
    expect(save.nations.USN!.captains).toEqual([first.id]);
    const r = recruitCaptain('USN', [first.id]);
    expect(r.joined?.id).toBe(nationCaptains('USN')[1].id);
    // Destroyers only: the next destroyer specialists; a carrier brings the aviator forward.
    // The engineer suits destroyers at S too (#188).
    const dd = nationCaptains('USN').filter((c) => [CaptainSkill.Torpedo, CaptainSkill.ASW, CaptainSkill.Night, CaptainSkill.Engineering].includes(c.skill)).map((c) => c.id);
    expect(nextCaptain('USN', [first.id], [ShipClass.Destroyer])?.skill).toBe(CaptainSkill.ASW);
    expect(nextCaptain('USN', dd, [ShipClass.Destroyer])?.skill).toBe(CaptainSkill.Recon);
    expect(nextCaptain('USN', [first.id], [ShipClass.Carrier])?.skill).toBe(CaptainSkill.Aviation);
    expect(nationCaptains('USN').map((c) => c.skill)).toEqual(RECRUIT_ORDER);
    const all = nationCaptains('USN').map((c) => c.id);
    expect(nextCaptain('USN', all)).toBeUndefined();
    expect(recruitCaptain('USN', all).joined).toBeNull();
  });

  it('saves from before #44 keep every captain of their nations', () => {
    const v5 = { version: 5, current: 'IJN', record: {}, tutorial: { step: 0, done: true }, nations: { IJN: { ships: ['fubuki'], captainXp: { ijn_sakai: 300 } }, USN: { ships: ['fletcher'] } } };
    const save = parseSave(JSON.stringify(v5));
    expect(save.nations.IJN!.captains).toEqual(nationCaptains('IJN').map((c) => c.id));
    expect(save.nations.USN!.captains).toEqual(nationCaptains('USN').map((c) => c.id));
    expect(save.nations.IJN!.captainSkills).toEqual({});
  });
});

describe('captain screen (#130 / #131)', () => {
  it('learnPlan: a free slot is free, a filled one names what it drops and costs RETRAIN_COST', () => {
    const c = atLevel(6);
    expect(learnPlan(c, [], 0, CaptainSkill.Torpedo)).toEqual({ learned: [CaptainSkill.Torpedo], cost: null, replaces: undefined });
    const swap = learnPlan(c, [CaptainSkill.Torpedo, CaptainSkill.Night], 0, CaptainSkill.Recon)!;
    expect(swap).toEqual({ learned: [CaptainSkill.Recon, CaptainSkill.Night], cost: RETRAIN_COST, replaces: CaptainSkill.Torpedo });
    // Locked slots, the inherent skill, a skill in another slot and the same skill again are refused.
    expect(learnPlan(c, [], 2, CaptainSkill.Torpedo)).toBeNull();
    expect(learnPlan(c, [], 0, CaptainSkill.Gunnery)).toBeNull();
    expect(learnPlan(c, [CaptainSkill.Torpedo, CaptainSkill.Night], 0, CaptainSkill.Night)).toBeNull();
    expect(learnPlan(c, [CaptainSkill.Torpedo], 0, CaptainSkill.Torpedo)).toBeNull();
  });

  it('every source of the bonus is listed, and the breakdown splits each line by source', () => {
    const c = atLevel(12);
    const stats = { nightSinks: 3, subSinks: 0, heavySurvivals: 0 };
    const sources = captainSources(c, { night: true }, [CaptainSkill.Night], stats);
    expect(sources.map((s) => s.kind)).toEqual(['inherent', 'learned', 'ability', 'trait']);
    expect(sources[0].label).toBe('砲術 II');
    const rows = modifierBreakdown(sources, captainModifiers(c, { night: true }, [CaptainSkill.Night], stats));
    const gun = rows.find((r) => r.key === 'gunPowerMul')!;
    // 砲火力: inherent, learned 夜戦, abilities and 夜戦巧者 all add to it.
    expect(gun.parts.map((p) => p.source)).toEqual([0, 1, 2, 3]);
    expect(gun.total).toMatch(/^\+\d+%$/);
  });

  it('level-ups name what they brought', () => {
    expect(levelUpNotes(atLevel(9), atLevel(10))).toEqual(expect.arrayContaining(['固有スキル「砲術 II」']));
    expect(levelUpNotes(atLevel(29), atLevel(30))).toContain('習得枠 +1');
    expect(levelUpNotes(atLevel(4), atLevel(5)).some((n) => n.startsWith('砲術 +'))).toBe(true);
    expect(levelUpNotes(atLevel(5), atLevel(5))).toEqual([]);
  });

  it('once every captain has joined, a recruit trains one instead', () => {
    const all = nationCaptains('IJN').map((c) => c.id);
    expect(recruitCaptain('IJN', all).joined).toBeNull();
    expect(all).toContain(duplicateCaptain('IJN', all, () => 0.99)!.id);
    expect(duplicateCaptain('IJN', [])).toBeUndefined();
    expect(DUPLICATE_CAPTAIN_XP).toBeGreaterThan(0);
  });

  it('every captain has a biography', () => {
    for (const c of ALL_CAPTAINS) expect(c.bio?.length ?? 0, c.id).toBeGreaterThan(10);
  });
});
