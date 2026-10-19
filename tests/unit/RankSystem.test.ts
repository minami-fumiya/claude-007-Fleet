import { describe, it, expect } from 'vitest';
import {
  addMerit, clearCount, examPassed, finalAreas, fleetSlots, GRADE_RANK, grantRankMerit, legacyRankFloor, MAX_FLEET_SLOTS,
  MERIT_FIRST_CLEAR, maxBuildGrade, meritFor, nextRank, nextSlotRank, promotionText, RANKS, rankOf, START_RANK, TUTORIAL_RANK,
} from '@/systems/RankSystem';
import campaign from '@/data/campaign.json';

const at = (merit: number, extra: { campaign?: string[]; nation?: string; rankFloor?: number } = {}) => ({ campaign: [], merit, ...extra });

describe('RankSystem (#30 / #36)', () => {
  it('runs 14 ranks from 士官候補生 to 元帥 with fleet slots 1..8', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['士官候補生', '准尉', '少尉', '中尉', '大尉', '准佐', '少佐', '中佐', '大佐', '准将', '少将', '中将', '大将', '元帥']);
    expect(RANKS.map((r) => r.slots)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8]);
    expect(MAX_FLEET_SLOTS).toBe(8);
    RANKS.forEach((r, i) => {
      expect(r.index).toBe(i);
      if (i > 0) expect(r.minMerit).toBeGreaterThan(RANKS[i - 1].minMerit);
    });
  });

  it('a new admiral starts at 准尉 (until the tutorial, #128) with one slot; the first clear makes 少尉 (two slots)', () => {
    expect(RANKS[0].name).toBe('士官候補生');
    expect(RANKS[START_RANK].name).toBe('准尉');
    expect(rankOf(at(0)).name).toBe('准尉');
    expect(fleetSlots(at(0))).toBe(1);
    const first = meritFor({ victory: true, campaign: true, firstClear: true, enemiesSunk: 1 });
    expect(rankOf(at(first)).name).toBe('少尉');
    expect(fleetSlots(at(first))).toBe(2);
  });

  it('merit: first clears count most, defeats nothing, sinks a little (capped)', () => {
    expect(meritFor({ victory: false, campaign: true, firstClear: true, enemiesSunk: 5 })).toBe(0);
    const exercise = meritFor({ victory: true, campaign: false, firstClear: false, enemiesSunk: 20 });
    const repeat = meritFor({ victory: true, campaign: true, firstClear: false, enemiesSunk: 2 });
    const first = meritFor({ victory: true, campaign: true, firstClear: true, enemiesSunk: 2 });
    expect(exercise).toBeLessThan(first);
    expect(repeat).toBeLessThan(first);
    expect(first).toBeGreaterThanOrEqual(MERIT_FIRST_CLEAR);
    expect(exercise).toBeLessThanOrEqual(20);
  });

  it('reports a promotion when merit crosses a rank', () => {
    expect(addMerit(at(0), 10).promotedTo).toBeNull();
    expect(addMerit(at(0), 100).promotedTo?.name).toBe('少尉');
  });

  it('准将 and 元帥 need their exams (theater final areas)', () => {
    const lots = 100_000;
    expect(rankOf(at(lots, { nation: 'IJN' })).name).toBe('大佐');
    const ijnFinals = finalAreas('IJN');
    expect(ijnFinals).toEqual(['p6', 'm5']);
    expect(rankOf(at(lots, { nation: 'IJN', campaign: ['p6'] })).name).toBe('大将');
    expect(rankOf(at(lots, { nation: 'IJN', campaign: ijnFinals })).name).toBe('元帥');
    expect(examPassed(RANKS[13], at(lots, { nation: 'SU', campaign: ['b5'] }))).toBe(true);
  });

  it('describes the next promotion and the next extra slot', () => {
    expect(nextRank(at(0))).toEqual({ rank: RANKS[2], meritNeeded: 80, exam: undefined });
    expect(nextSlotRank(at(0))?.rank.name).toBe('少尉');
    expect(nextRank(at(900, { nation: 'IJN' }))?.exam).toBe('theaterFinal');
    expect(promotionText(at(0))).toContain('少尉');
    expect(promotionText(at(100_000, { nation: 'IJN', campaign: finalAreas('IJN') }))).toBe('最高位に到達');
  });

  it('counts each area once', () => {
    expect(clearCount({ campaign: ['p1', 'p1', 'a1'] })).toBe(2);
  });

  it('two-theater navies reach 准将 merit from first clears alone (higher ranks wait for more areas, #40)', () => {
    for (const nation of ['IJN', 'USN', 'KM', 'RN']) {
      const theaters = campaign.theaters.filter((t) => (t.opponents as Record<string, string | undefined>)[nation]).map((t) => t.id);
      const areas = campaign.areas.filter((a) => theaters.includes(a.theater)).length;
      expect(areas * MERIT_FIRST_CLEAR, nation).toBeGreaterThanOrEqual(RANKS[9].minMerit);
    }
  });

  it('ship grades unlock along the ranks', () => {
    expect([0, 1, 2, 4, 7, 9, 11, 13].map(maxBuildGrade)).toEqual([0, 0, 1, 2, 3, 4, 5, 5]);
  });

  it('the tutorial promotes to 少尉 without lowering merit', () => {
    expect(rankOf(grantRankMerit(at(0), TUTORIAL_RANK)).name).toBe('少尉');
    expect(grantRankMerit(at(500), TUTORIAL_RANK).merit).toBe(500);
  });

  it('old saves keep their slots and buildable grade (rankFloor)', () => {
    // Old table: 少佐 0 / 中佐 1 / 大佐 2 / 少将 4 / 中将 7 / 大将 10 clears → 1..6 slots, grade = old index.
    [[0, 1], [1, 2], [2, 3], [4, 4], [7, 5], [10, 6]].forEach(([clears, slots], old) => {
      const floor = legacyRankFloor(clears);
      expect(RANKS[floor].slots).toBeGreaterThanOrEqual(slots);
      expect(GRADE_RANK[old]).toBeLessThanOrEqual(floor);
      expect(fleetSlots(at(0, { rankFloor: floor }))).toBe(RANKS[floor].slots);
    });
  });
});
