import { describe, it, expect } from 'vitest';
import {
  addBattleStats, captainModifiers, earnedTraits, LEARNED_SKILL_SCALE, learnSkill, learnSlots, skillModifiers, validLearned, withProgress, xpForLevel,
} from '@/systems/CaptainSystem';
import { nationCaptains, nextCaptain, recruitCaptain, starterCaptain } from '@/systems/CaptainRoster';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { Nation } from '@/types/Nation';
import { emptySave, parseSave, switchNation } from '@/utils/ProgressStore';

const data: ICaptainData = { id: 'c', name: '試験', nation: Nation.IJN, skill: CaptainSkill.Gunnery };
const atLevel = (lv: number) => withProgress(data, xpForLevel(lv));

describe('learned skills (#45)', () => {
  it('slots open at Lv3 / 6 / 9', () => {
    expect([1, 2, 3, 5, 6, 8, 9, 10].map(learnSlots)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
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
    expect(learned.torpedoPowerMul - 1).toBeCloseTo((own.torpedoPowerMul - 1) * LEARNED_SKILL_SCALE, 6);
    // Without learned skills or traits a captain is exactly as strong as before #45.
    expect(captainModifiers(c)).toEqual(skillModifiers(CaptainSkill.Gunnery, 5));
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
  it('a new nation starts with its first captain; recruits come in data order', () => {
    const save = switchNation(emptySave(), Nation.USN, 'fletcher', 0);
    const first = starterCaptain('USN')!;
    expect(save.nations.USN!.captains).toEqual([first.id]);
    const r = recruitCaptain('USN', [first.id]);
    expect(r.joined?.id).toBe(nationCaptains('USN')[1].id);
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
