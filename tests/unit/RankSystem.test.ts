import { describe, it, expect } from 'vitest';
import { MEDALS } from '@/systems/RecordSystem';
import { runMigrations } from '@/utils/SaveMigration';
import {
  addMerit, addRankStats, ALL_MISSION_MEDALS, ALL_MISSIONS_DONE, clearCount, missionText, openMissions, RANK_MISSIONS, examAreas, examPassed, examProgress, finalAreas, fleetSlots, GRADE_RANK, grantRankMerit, legacyRankFloor, MAX_FLEET_SLOTS,
  MERIT_FIRST_CLEAR, maxBuildGrade, meritFor, nextRank, nextSlotRank, promotionText, RANKS, rankOf, START_RANK, TUTORIAL_RANK,
} from '@/systems/RankSystem';
import campaign from '@/data/campaign.json';
import { runMigrations } from '@/utils/SaveMigration';

// Promotion missions (#142) done, so merit and exams alone decide (missions are tested on their own below).
const at = (merit: number, extra: { campaign?: string[]; nation?: string; rankFloor?: number } = {}) => ({ campaign: [], merit, rankStats: ALL_MISSIONS_DONE, record: { medals: ALL_MISSION_MEDALS }, ...extra });

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

  it('准将 needs a theater final; 元帥 every area of the nation\'s theaters (#304)', () => {
    const lots = 100_000;
    expect(rankOf(at(lots, { nation: 'IJN' })).name).toBe('大佐');
    const ijnFinals = finalAreas('IJN');
    expect(ijnFinals).toEqual(['p6', 'm5']);
    expect(rankOf(at(lots, { nation: 'IJN', campaign: ['p6'] })).name).toBe('大将');
    // Only the finals is no longer enough (#304).
    expect(rankOf(at(lots, { nation: 'IJN', campaign: ijnFinals })).name).toBe('大将');
    const all = examAreas('IJN');
    expect(all.length).toBeGreaterThan(ijnFinals.length);
    expect(all).toEqual(expect.arrayContaining(ijnFinals));
    expect(examProgress('allAreas', { nation: 'IJN', campaign: ijnFinals })).toEqual([2, all.length]);
    expect(rankOf(at(lots, { nation: 'IJN', campaign: all })).name).toBe('元帥');
    expect(rankOf(at(lots, { nation: 'IJN', campaign: all.slice(1) })).name).toBe('大将');
    expect(examPassed(RANKS[13], at(lots, { nation: 'SU', campaign: examAreas('SU') }))).toBe(true);
  });

  it('describes the next promotion and the next extra slot', () => {
    expect(nextRank(at(0))).toEqual({ rank: RANKS[2], meritNeeded: 80, exam: undefined, missions: [] });
    expect(nextSlotRank(at(0))?.rank.name).toBe('少尉');
    expect(nextRank(at(900, { nation: 'IJN' }))?.exam).toBe('theaterFinal');
    expect(promotionText(at(0))).toContain('少尉');
    expect(promotionText(at(100_000, { nation: 'IJN', campaign: finalAreas('IJN') }))).toBe(`次の昇進: 元帥 (全戦域の全海域を攻略 (2 / ${examAreas('IJN').length}))`);
    expect(promotionText(at(100_000, { nation: 'IJN', campaign: examAreas('IJN') }))).toBe('最高位に到達');
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

describe('promotion missions (#142)', () => {
  const fresh = (merit: number) => ({ campaign: [], merit });

  it('merit alone stops at the first rank with an open mission', () => {
    expect(rankOf(fresh(100)).name).toBe('准尉');
    expect(nextRank(fresh(100))?.missions.map((m) => m.stat)).toEqual(['campaignWin', 'sink', 'areaClear', 'medal']);
    expect(promotionText(fresh(100))).toBe('次の昇進: 少尉 (作戦で 1 回勝利 + 作戦で敵艦を 1 隻撃沈 + 作戦の海域を 1 か所攻略 + 勲章「初陣勝利章」を得る)');
    const done = addRankStats(fresh(100), { campaignWin: 1, sink: 1, areaClear: 1 });
    expect(rankOf(done).name).toBe('准尉');
    expect(rankOf({ ...done, record: { medals: ['first_victory'] } }).name).toBe('少尉');
  });

  it('counters add up and show their progress', () => {
    const medals = { record: { medals: ['first_victory', 'victor'] } };
    let p = { ...addRankStats(fresh(200), { campaignWin: 5, sink: 12, areaClear: 1, nightWin: 1 }), ...medals };
    expect(rankOf(p).name).toBe('少尉');
    expect(missionText(openMissions(RANKS[3], p)[0], p)).toBe('作戦で敵艦を 20 隻撃沈 (12 / 20)');
    p = addRankStats(p, { sink: 8, nightWin: 0 });
    expect(rankOf(p).name).toBe('中尉');
    expect(addRankStats(p, { sink: 0 })).toBe(p);
  });

  it('four missions on every rank from 少尉 to 元帥, one of them a medal that exists (#261)', () => {
    for (let index = 2; index < RANKS.length; index++) {
      const list = RANK_MISSIONS[index] ?? [];
      expect(list, RANKS[index].name).toHaveLength(4);
      expect(list.filter((m) => m.stat === 'medal'), RANKS[index].name).toHaveLength(1);
      for (const m of list) expect(m.goal).toBeGreaterThan(0);
      for (const m of list) if (m.medal) expect(MEDALS.some((x) => x.id === m.medal), m.medal).toBe(true);
    }
    expect(RANK_MISSIONS[0]).toBeUndefined();
    expect(RANK_MISSIONS[1]).toBeUndefined();
    // A counter asked again later asks for more.
    const last: Record<string, number> = {};
    for (let index = 2; index < RANKS.length; index++) {
      for (const m of RANK_MISSIONS[index] ?? []) {
        if (m.stat === 'medal') continue;
        expect(m.goal, `${RANKS[index].name} ${m.stat}`).toBeGreaterThan(last[m.stat] ?? 0);
        last[m.stat] = m.goal;
      }
    }
  });

  it('only the next rank shows its missions (#261)', () => {
    const p = fresh(0);
    expect(nextRank(p)?.rank.name).toBe('少尉');
    expect(nextRank(p)?.missions).toHaveLength(4);
  });

  it('the tutorial promotion completes the missions up to its rank', () => {
    expect(rankOf(grantRankMerit(fresh(0), TUTORIAL_RANK)).index).toBe(TUTORIAL_RANK);
  });
});

describe('promotion missions and old saves (#142)', () => {
  it('a nation keeps the rank it held before the missions existed', () => {
    const out = runMigrations({ version: 9, nations: { IJN: { merit: 900, campaign: [], rankFloor: 0 } } }) as { nations: { IJN: { rankFloor: number; rankStats: object } } };
    expect(out.nations.IJN.rankStats).toEqual({ areaClear: 0 });
    expect(RANKS[out.nations.IJN.rankFloor].name).toBe('大佐');
    expect(rankOf({ campaign: [], merit: 900, rankFloor: out.nations.IJN.rankFloor }).name).toBe('大佐');
  });

  it('an admiral who made 元帥 by the finals alone keeps the rank after #304 (save v21)', () => {
    const out = runMigrations({ version: 20, current: 'IJN', nations: { IJN: { merit: 2600, campaign: finalAreas('IJN'), rankFloor: 0 }, USN: { merit: 2600, campaign: [], rankFloor: 0 } } }) as {
      nations: Record<string, { rankFloor: number }>;
    };
    expect(out.nations.IJN.rankFloor).toBe(13);
    expect(out.nations.USN.rankFloor).toBeLessThanOrEqual(START_RANK);
  });

  it('an admiral keeps the rank held under the one-mission rules after #261 / #322 (save v22)', () => {
    const stats = { campaignWin: 3, sink: 25, nightWin: 1, sinkCarrier: 1, objectiveWin: 1, bigS: 1 };
    const campaign = ['p1', 'p2', 'p3'];
    const out = runMigrations({ version: 21, current: 'IJN', nations: { IJN: { merit: 1400, campaign, rankFloor: 0, rankStats: stats } } }) as {
      nations: Record<string, { rankFloor: number; rankStats: Record<string, number> }>;
    };
    // 大佐 under the old rules (准将 needs a theater final): kept, though 大佐 now asks four missions and a medal.
    expect(RANKS[out.nations.IJN.rankFloor].name).toBe('大佐');
    expect(rankOf({ campaign, merit: 1400, rankFloor: out.nations.IJN.rankFloor, rankStats: out.nations.IJN.rankStats }).name).toBe('大佐');
    // First clears so far count for the new 海域攻略 mission.
    expect(out.nations.IJN.rankStats.areaClear).toBe(3);
  });
});
