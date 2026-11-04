import { describe, expect, it } from 'vitest';
import campaignData from '@/data/campaign.json';
import type { ICampaignData } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { gameWeek } from '@/systems/QuestSystem';
import {
  ANNIVERSARIES, ANNIVERSARY_REWARD_MUL, anniversariesOn, anniversaryRewardMul, fleetKeepsRule, jstDate, nextAnniversary, parseSpecialOps,
  scenarioAnniversary, SPECIAL_RULES, specialReward, specialState, weeklyArea, weeklyRule, winAnniversary, winSpecial,
} from '@/systems/SpecialOpsSystem';

const DATA = campaignData as ICampaignData;
/** 2026-06-05 12:00 JST */
const MIDWAY_DAY = Date.UTC(2026, 5, 5, 3);

describe('0.0.64 記念日 (#416)', () => {
  it('every anniversary is a real day, and each scenario it names exists', async () => {
    const { ALL_SCENARIOS } = await import('@/data/scenarios');
    const ids = new Set(ALL_SCENARIOS.map((s) => s.id));
    for (const a of ANNIVERSARIES) {
      expect(a.md, a.id).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      if (a.scenario) expect(ids.has(a.scenario), a.scenario).toBe(true);
    }
    expect(new Set(ANNIVERSARIES.map((a) => a.id)).size).toBe(ANNIVERSARIES.length);
    expect(ANNIVERSARIES.find((a) => a.md === '12-08')?.name).toBe('真珠湾攻撃');
  });

  it('the day goes by Japanese time', () => {
    expect(jstDate(MIDWAY_DAY).md).toBe('06-05');
    // 23:30 UTC on 4 June is already 5 June in Japan.
    expect(jstDate(Date.UTC(2026, 5, 4, 15, 30)).md).toBe('06-05');
    expect(anniversariesOn(MIDWAY_DAY).map((a) => a.id)).toEqual(['midway']);
    expect(scenarioAnniversary('midway', MIDWAY_DAY)?.id).toBe('midway');
    expect(scenarioAnniversary('midway', MIDWAY_DAY + 86_400_000)).toBeUndefined();
  });

  it('the navies of the day earn more; the others do not', () => {
    expect(anniversaryRewardMul(Nation.IJN, MIDWAY_DAY)).toBe(ANNIVERSARY_REWARD_MUL);
    expect(anniversaryRewardMul(Nation.KM, MIDWAY_DAY)).toBe(1);
  });

  it('the day\'s scenario pays once a year', () => {
    const first = winAnniversary(undefined, 'midway', MIDWAY_DAY);
    expect(first?.anniversary.id).toBe('midway');
    expect(winAnniversary(first!.ops, 'midway', MIDWAY_DAY + 3_600_000)).toBeNull();
    // The next year it pays again; another day not at all.
    expect(winAnniversary(first!.ops, 'midway', Date.UTC(2027, 5, 5, 3))).not.toBeNull();
    expect(winAnniversary(undefined, 'coral-sea', MIDWAY_DAY)).toBeNull();
  });

  it('the next anniversary is found from any day', () => {
    expect(nextAnniversary(MIDWAY_DAY)).toEqual({ anniversary: expect.objectContaining({ id: 'midway' }), days: 0 });
    expect(nextAnniversary(Date.UTC(2026, 5, 6, 3)).anniversary.id).toBe('sevastopol');
  });
});

describe('0.0.64 週替わりの特別海域 (#416)', () => {
  const NOW = Date.UTC(2026, 10, 4, 3);
  const pacific = DATA.areas.filter((a) => a.theater === 'pacific');

  it('one rule a week, in turn, and one of the seas won (never a training sea)', () => {
    const rules = new Set([0, 1, 2].map((w) => weeklyRule(NOW + w * 7 * 86_400_000).id));
    expect(rules.size).toBe(SPECIAL_RULES.length);
    expect(weeklyArea(pacific, [], NOW)).toBeUndefined();
    const won = ['p1', 'p2', 'p3'];
    const area = weeklyArea(pacific, won, NOW);
    expect(won).toContain(area?.id);
    // It holds all week.
    expect(weeklyArea(pacific, won, NOW + 3_600_000)?.id).toBe(area?.id);
    const training = DATA.areas.filter((a) => a.training).map((a) => a.id);
    expect(weeklyArea(DATA.areas, training, NOW)).toBeUndefined();
  });

  it('the fleet must be all of the class', () => {
    const dd = SPECIAL_RULES.find((r) => r.shipClass === ShipClass.Destroyer)!;
    expect(fleetKeepsRule(dd, [ShipClass.Destroyer, ShipClass.Destroyer])).toBe(true);
    expect(fleetKeepsRule(dd, [ShipClass.Destroyer, ShipClass.Cruiser])).toBe(false);
    expect(fleetKeepsRule(dd, [])).toBe(false);
  });

  it('a win pays once a week, more than the first clear', () => {
    const area = pacific[0];
    expect(specialState(undefined, area, NOW)).toBe('open');
    const ops = winSpecial(undefined, NOW)!;
    expect(ops.wonWeek).toBe(gameWeek(NOW));
    expect(specialState(ops, area, NOW)).toBe('won');
    expect(winSpecial(ops, NOW)).toBeNull();
    expect(specialState(ops, area, NOW + 7 * 86_400_000)).toBe('open');
    expect(specialReward({ fuel: 100, steel: 40 })).toEqual({ fuel: 150, ammo: 0, steel: 60, bauxite: 0 });
  });

  it('old saves read with nothing won; odd entries are dropped', async () => {
    expect(parseSpecialOps(undefined)).toEqual({ anniversaries: [] });
    expect(parseSpecialOps({ wonWeek: -1, anniversaries: ['2026:midway', 3, '2026:midway'] })).toEqual({ anniversaries: ['2026:midway'] });
    const { emptyNationProgress, parseSave, emptySave } = await import('@/utils/ProgressStore');
    const raw = JSON.stringify({ ...emptySave(), nations: { IJN: { ...emptyNationProgress(), specialOps: undefined } } });
    expect(parseSave(raw).nations.IJN!.specialOps).toEqual({ anniversaries: [] });
  });

  it('the home strip shows this week\'s special sea until it is won', async () => {
    const { pendingSummary } = await import('@/systems/PendingSummary');
    const { emptyProgress } = await import('@/utils/ProgressStore');
    const p = { ...emptyProgress(), campaign: ['p1'] };
    const item = pendingSummary(p, NOW, 0).find((i) => i.id === 'special');
    expect(item?.data).toEqual({ areaId: 'p1' });
    expect(pendingSummary({ ...p, specialOps: winSpecial(undefined, NOW)! }, NOW, 0).find((i) => i.id === 'special')).toBeUndefined();
  });

  it('medals for both', async () => {
    const { MEDALS } = await import('@/systems/RecordSystem');
    const ids = MEDALS.map((m) => m.id);
    expect(ids.some((id) => id.startsWith('anniversary'))).toBe(true);
    expect(ids.some((id) => id.startsWith('special_sea'))).toBe(true);
  });
});
