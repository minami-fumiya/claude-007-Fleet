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
