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

describe('0.0.64 研究と遠征の NEW 印 (#416)', () => {
  it('research projects open once their prerequisites, rank and medal are met', async () => {
    const { openResearch } = await import('@/systems/NewMarks');
    const { TECH_TREE } = await import('@/systems/ResearchSystem');
    const first = openResearch(TECH_TREE, [], [], 2);
    expect(first.length).toBeGreaterThan(0);
    // Finishing them opens the next levels (at a rank high enough); a project done is no longer open.
    const next = openResearch(TECH_TREE, first, [], 13);
    expect(next.length).toBeGreaterThan(0);
    expect(next.some((id) => first.includes(id))).toBe(false);
    expect(openResearch(TECH_TREE, [first[0]], [], 2)).not.toContain(first[0]);
  });

  it('expeditions open with the rank; the next rank\'s goal is not open yet', async () => {
    const { openExpeditions } = await import('@/systems/NewMarks');
    const { shownExpeditions } = await import('@/systems/ExpeditionSystem');
    const shown = shownExpeditions(0);
    const open = openExpeditions(shown, 0);
    expect(open.length).toBe(shown.length - 1);
    expect(openExpeditions(shownExpeditions(3), 3).length).toBeGreaterThan(open.length);
  });
});

describe('0.0.64 設計艦の見た目 (#416)', () => {
  it('the drawing follows the hull and what it carries', async () => {
    const { designLook, designSpriteKey } = await import('@/systems/DesignSystem');
    const bb = designLook({ hull: 'hull_bb', modules: ['46cm_main_gun', '15_5cm_triple', 'fit_engine'] });
    expect(bb).toMatchObject({ mounts: 3, barrels: 3, beamGuns: true, funnels: 2 });
    expect(designLook({ hull: 'hull_bb_large', modules: ['46cm_main_gun'] }).mounts).toBe(4);
    const dd = designLook({ hull: 'hull_dd', modules: ['fit_bulge'] });
    expect(dd).toMatchObject({ mounts: 0, torpedoes: false, beam: 1.1 });
    // The key changes with the modules, whatever their order.
    expect(designSpriteKey('d', { hull: 'hull_bb', modules: ['b', 'a'] })).toBe(designSpriteKey('d', { hull: 'hull_bb', modules: ['a', 'b'] }));
    expect(designSpriteKey('d', { hull: 'hull_bb', modules: ['a'] })).not.toBe(designSpriteKey('d', { hull: 'hull_bb', modules: ['a', 'b'] }));
  });
});

describe('0.0.64 機雷原・防潜網・上陸支援 (#368)', () => {
  it('minefields lie in the deeper seas only, nets where a harbour or strait is fought for', async () => {
    const { hazardPlan, MINE_DEPTH } = await import('@/systems/HazardSystem');
    const { Objective } = await import('@/types/Campaign');
    const deep = DATA.areas.filter((a) => !a.training).map((a) => hazardPlan(a, 10));
    expect(deep.some((p) => p.mines > 0)).toBe(true);
    expect(DATA.areas.every((a) => hazardPlan(a, MINE_DEPTH - 1).mines === 0)).toBe(true);
    expect(hazardPlan({ id: 'x', objective: Objective.Bombard }, 5).net).toBe(true);
    expect(hazardPlan({ id: 'x', objective: Objective.Annihilate }, 5).net).toBe(false);
    expect(hazardPlan({ id: 'x', objective: Objective.Bombard, training: true }, 9)).toEqual({ mines: 0, net: false });
  });

  it('a field is placed the same way every time, between the fleets', async () => {
    const { placeHazards } = await import('@/systems/HazardSystem');
    const world = { w: 3200, h: 3200 };
    const a = placeHazards({ mines: 2, net: false }, 'p9', world);
    expect(a).toEqual(placeHazards({ mines: 2, net: false }, 'p9', world));
    for (const z of a) expect(z.y).toBeGreaterThan(world.h * 0.3);
    const net = placeHazards({ mines: 0, net: true }, 'p9', world, { x: 1000, y: 900, r: 300 })[0];
    expect(net).toMatchObject({ kind: 'net', x: 1000, y: 900 });
    expect(net.r).toBeGreaterThan(300);
  });

  it('mines strike moving surface ships; destroyers sweep the field away', async () => {
    const { mineChance, sweep, SWEEP_SECONDS, netSpeedMul, NET_SPEED_MUL } = await import('@/systems/HazardSystem');
    const field = { kind: 'minefield' as const, x: 0, y: 0, r: 200, charge: 1 };
    expect(mineChance(field, 150, 1)).toBeGreaterThan(0);
    expect(mineChance(field, 0, 1)).toBe(0);
    expect(mineChance(field, 150, 1, { submerged: true })).toBe(0);
    expect(mineChance(field, 150, 1, { sweeper: true })).toBeLessThan(mineChance(field, 150, 1));
    const half = sweep(field, 2, SWEEP_SECONDS / 4);
    expect(half.charge).toBeCloseTo(0.5);
    expect(sweep(half, 1, SWEEP_SECONDS).charge).toBe(0);
    expect(mineChance({ ...field, charge: 0 }, 150, 1)).toBe(0);
    const net = { kind: 'net' as const, x: 0, y: 0, r: 200, charge: 1 };
    expect(netSpeedMul([net], ShipClass.Submarine, 10, 10)).toBe(NET_SPEED_MUL);
    expect(netSpeedMul([net], ShipClass.Destroyer, 10, 10)).toBe(1);
  });

  it('the landing parties go ashore at their times, when the fleet is close', async () => {
    const { landingDue, LANDING_AT, LANDING_RANGE } = await import('@/systems/HazardSystem');
    expect(landingDue(LANDING_AT[0] - 1, 0, 100)).toBe(false);
    expect(landingDue(LANDING_AT[0], 0, 100)).toBe(true);
    expect(landingDue(LANDING_AT[0], 0, LANDING_RANGE + 1)).toBe(false);
    expect(landingDue(LANDING_AT[1], 1, 100)).toBe(true);
    expect(landingDue(999_999, LANDING_AT.length, 100)).toBe(false);
    const { MEDALS } = await import('@/systems/RecordSystem');
    expect(MEDALS.some((m) => m.id.startsWith('mine_sweeper'))).toBe(true);
    expect(MEDALS.some((m) => m.id.startsWith('landing'))).toBe(true);
  });
});
