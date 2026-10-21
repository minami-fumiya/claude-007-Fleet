import { describe, it, expect } from 'vitest';
import { firstNation, LATER_NATION_THEATERS, nationLocks, newlyUnlocked, STARTER_NATIONS, theaterFinal } from '@/systems/NationUnlock';
import { Nation } from '@/types/Nation';
import { ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import campaignData from '@/data/campaign.json';

const p = (merit: number, campaign: string[] = []) => ({ merit, campaign, rankFloor: 0, rankStats: ALL_MISSIONS_DONE });
const open = (locks: ReturnType<typeof nationLocks>): Nation[] => PLAYABLE_NATIONS.filter((n) => locks[n].unlocked);

describe('nations open step by step (#134)', () => {
  it('a new save offers the four starters', () => {
    expect(open(nationLocks({}))).toEqual(PLAYABLE_NATIONS.filter((n) => STARTER_NATIONS.includes(n)));
  });

  it('after the first pick, the other starters wait for 少佐 or a whole theater', () => {
    const locks = nationLocks({ IJN: p(250) });
    expect(open(locks)).toEqual([Nation.IJN]);
    expect(locks.USN.condition).toBe('日本が少佐か戦域攻略で解放');
    expect(locks.USN.progress).toBe('いま 日本 大尉');
    expect(open(nationLocks({ IJN: p(500) }))).toEqual(expect.arrayContaining(STARTER_NATIONS));
    expect(nationLocks({ IJN: p(500) }).SU.unlocked).toBe(false);
    expect(open(nationLocks({ IJN: p(100, [theaterFinal('pacific')!]) }))).toEqual(expect.arrayContaining(STARTER_NATIONS));
  });

  it('France follows the Atlantic or the Mediterranean, Italy the Mediterranean, the Soviet Union its seas (#294)', () => {
    const atl = nationLocks({ RN: p(100, [theaterFinal('atlantic')!]) });
    expect(atl.FR.unlocked).toBe(true);
    expect(atl.RM.unlocked).toBe(false);
    expect(atl.SU.unlocked).toBe(false);
    const med = nationLocks({ RN: p(100, [theaterFinal('mediterranean')!]) });
    expect(med.FR.unlocked && med.RM.unlocked).toBe(true);
    expect(nationLocks({ KM: p(500) }).SU.unlocked).toBe(false);
    expect(nationLocks({ KM: p(100, [theaterFinal('baltic')!]) }).SU.unlocked).toBe(true);
    expect(nationLocks({ IJN: p(100, [theaterFinal('north_pacific')!]) }).SU.unlocked).toBe(true);
  });

  it('every later nation opens by a theater each starter can fight in, with its progress shown (#294)', () => {
    for (const [n, ids] of Object.entries(LATER_NATION_THEATERS)) {
      const theaters = campaignData.theaters.filter((t) => ids!.includes(t.id));
      expect(theaters.length).toBe(ids!.length);
      const fights = (t: (typeof theaters)[number], who: string): boolean => (t.opponents as Record<string, string>)[who] !== undefined;
      expect(theaters.every((t) => fights(t, n))).toBe(true);
      expect(theaters.some((t) => STARTER_NATIONS.some((s) => fights(t, s)))).toBe(true);
    }
    const firstArctic = campaignData.areas.filter((a) => a.theater === 'arctic' && !(a as { training?: boolean }).training);
    const locks = nationLocks({ RN: p(100, [firstArctic[0].id, firstArctic[1].id]) });
    expect(locks.SU.condition).toBe('バルト海・北極海・北太平洋のどれかの攻略で解放');
    expect(locks.SU.progress).toBe(`いま 北極海 2 / ${firstArctic.length}`);
    expect(nationLocks({ RN: p(100) }).SU.progress).toBe('');
  });

  it('a training area is no theater final: winning one opens nothing (#241)', () => {
    const training = campaignData.areas.filter((a) => (a as { training?: boolean }).training).map((a) => a.id);
    expect(training.length).toBeGreaterThan(0);
    for (const t of campaignData.theaters) expect(training).not.toContain(theaterFinal(t.id));
    expect(open(nationLocks({ IJN: p(100, training) }))).toEqual([Nation.IJN]);
    expect(open(nationLocks({ RN: p(100, training) }))).toEqual([Nation.RN]);
  });

  it('a nation already started is never locked (saves from before #134)', () => {
    const locks = nationLocks({ IJN: p(0), SU: p(0), RM: p(0) });
    expect(locks.SU.unlocked && locks.RM.unlocked && locks.IJN.unlocked).toBe(true);
  });

  it('the first nation is the most advanced one; newly opened nations are listed', () => {
    expect(firstNation({ IJN: p(10), RN: p(300) })).toBe(Nation.RN);
    expect(firstNation({})).toBeUndefined();
    expect(newlyUnlocked(nationLocks({ IJN: p(400) }), nationLocks({ IJN: p(500) }))).toEqual([Nation.USN, Nation.KM, Nation.RN]);
  });
});
