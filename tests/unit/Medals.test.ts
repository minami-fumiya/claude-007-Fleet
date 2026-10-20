import { describe, expect, it } from 'vitest';
import { emptyRecord, MEDAL_CATEGORY_LABEL, medalProgress, MEDALS, newMedals } from '@/systems/RecordSystem';
import { awardEarnedMedals, medalContext } from '@/utils/MedalContext';
import { emptyNationProgress, emptySave } from '@/utils/ProgressStore';
import { QUESTS } from '@/systems/QuestSystem';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';

describe('medals (#92)', () => {
  it('about 100 medals with unique ids in every category; the original twelve keep their ids', () => {
    expect(MEDALS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(MEDALS.map((m) => m.id)).size).toBe(MEDALS.length);
    for (const c of Object.keys(MEDAL_CATEGORY_LABEL)) expect(MEDALS.some((m) => m.category === c), c).toBe(true);
    for (const id of ['first_victory', 'veteran', 'perfect', 'ace', 'battleship_slayer', 'carrier_slayer', 'sub_hunter', 'big_gun', 'pacific', 'atlantic', 'baltic', 'mediterranean']) {
      expect(MEDALS.some((m) => m.id === id), id).toBe(true);
    }
  });

  it('new features bring medals and none is ever removed (0.0.25: convoy escort, captain instruction; 0.0.26: captain sinks)', () => {
    // Raise this floor whenever medals are added; it never goes down.
    expect(MEDALS.length).toBeGreaterThanOrEqual(223);
    for (const id of ['convoy', 'convoy_2', 'convoy_3', 'instructor', 'instructor_2', 'instructor_3', 'captain_ace', 'captain_ace_2', 'captain_ace_3', 'task_force', 'task_force_2', 'task_force_3', 'veteran_player', 'veteran_player_2', 'veteran_player_3', 'dock_expansion', 'dock_expansion_2', 'dock_expansion_3', 'rush_work', 'rush_work_2', 's_recruiter', 's_recruiter_2', 'event_tour', 'event_tour_2']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
    const r = emptyRecord();
    expect(newMedals(r, { clearedTheaters: [], totals: { convoyWin: 3, learnSkill: 1 } }).map((m) => m.id)).toEqual(expect.arrayContaining(['convoy', 'instructor']));
    // 0.0.26: one captain's own sinkings (#199)
    expect(newMedals(r, { clearedTheaters: [], captainSinks: 10 }).map((m) => m.id)).toContain('captain_ace');
    // 0.0.26: carriers built now that none is reward-only (#204)
    const save = { ...emptySave(), nations: { IJN: { ...emptyNationProgress('IJN'), ships: ['fubuki', 'kaga', 'taiho'] } } };
    expect(medalContext(save).carriersOwned).toBe(2);
  });

  it('0.0.34: the second dock (#244) and the kinds of ship by number (#249); real sisters make a class (#246)', () => {
    const r = emptyRecord();
    expect(newMedals(r, { clearedTheaters: [], maxDocks: 2 }).map((m) => m.id)).toContain('second_dock');
    const save = { ...emptySave(), nations: { IJN: { ...emptyNationProgress('IJN'), ships: ['fubuki', 'kongo', 'nagato', 'mutsu', 'takao', 'akagi', 'i19'] } } };
    const ctx = medalContext(save);
    // 駆逐艦・巡洋戦艦・戦艦・重巡・空母・潜水艦
    expect(ctx.shipTypes).toBe(6);
    expect(newMedals(r, ctx).map((m) => m.id)).toEqual(expect.arrayContaining(['ship_types', 'ship_types_2']));
    // 長門 and 陸奥 are one class now (#246).
    expect(ctx.classesComplete).toBe(1);
  });

  it('ladders: each tier at its goal, with progress shown towards the next', () => {
    const r = { ...emptyRecord(), sunk: { [ShipClass.Battleship]: 30 } };
    const ids = newMedals(r, { clearedTheaters: [] }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['battleship_slayer', 'battleship_slayer_2']));
    expect(ids).not.toContain('battleship_slayer_3');
    expect(medalProgress('battleship_slayer_3', r, { clearedTheaters: [] })).toEqual([30, 100]);
  });

  it('every quest medal exists and is only given by its quest', () => {
    for (const q of QUESTS.filter((x) => x.medal)) {
      const m = MEDALS.find((x) => x.id === q.medal);
      expect(m?.category, q.id).toBe('quest');
    }
    const r = { ...emptyRecord(), victories: 9999 };
    expect(newMedals(r, { clearedTheaters: [] }).some((m) => m.id.startsWith('q_'))).toBe(false);
  });

  it('the context sums event totals over nations and takes the best collection', () => {
    const ijn = { ...emptyNationProgress(['fubuki', 'yukikaze']), quests: { ...emptyNationProgress().quests, totals: { nightWin: 3 } } };
    const usn = { ...emptyNationProgress(['fletcher']), quests: { ...emptyNationProgress().quests, totals: { nightWin: 4 } }, facilities: { usn_home: { fuelTank: 2 } } };
    const save = { ...emptySave(), nations: { [Nation.IJN]: ijn, [Nation.USN]: usn } };
    const ctx = medalContext(save);
    expect(ctx.totals?.nightWin).toBe(7);
    expect(ctx.shipsOwned).toBe(2);
    expect(ctx.nationsPlayed).toBe(2);
    expect(ctx.facilityLevels).toBe(2);
    const awarded = awardEarnedMedals(save);
    expect(awarded.medals.map((m) => m.id)).toContain('night_fighter');
    expect(awarded.save.record.medals).toContain('nations');
    expect(awardEarnedMedals(awarded.save).medals).toEqual([]);
  });
});

describe('medals of 0.0.29 (#85 #185 #209, 築港章 #217)', () => {
  it('counts open bases and complete classes', () => {
    const np = { ...emptyNationProgress(['kongo', 'hiei', 'haruna', 'kirishima', 'fubuki']), basesOpen: ['ijn_light', 'ijn_cruiser'] };
    const ctx = medalContext({ ...emptySave(), nations: { [Nation.IJN]: np } });
    expect(ctx.basesOpen).toBe(3);
    expect(ctx.classesComplete).toBe(1);
    for (const id of ['harbor_works_2', 'class_set', 'anti_air_3', 'captains_5']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
});

describe('ladder names', () => {
  it('every rung of every ladder has a rank name', () => {
    expect(MEDALS.filter((m) => m.name.includes('undefined')).map((m) => m.id)).toEqual([]);
  });

  it('0.0.35: the seven seas (#250): a medal for each new sea, its battles, and the seas together', () => {
    for (const id of ['north_pacific', 'south_atlantic', 'indian', 'arctic', 'north_pacific_war', 'arctic_war_2', 'seas', 'seas_2', 'seas_3']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
    const r = emptyRecord();
    const ids = newMedals(r, { clearedTheaters: ['pacific', 'baltic', 'blacksea', 'arctic'], totals: { winIndian: 10 } }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['arctic', 'seas', 'indian_war']));
    // The inland seas don't count among the seven.
    expect(ids).not.toContain('seas_2');
    expect(newMedals(r, { clearedTheaters: ['pacific', 'atlantic', 'mediterranean', 'north_pacific', 'south_atlantic', 'indian', 'arctic'] }).map((m) => m.id)).toContain('seas_3');
  });
});
