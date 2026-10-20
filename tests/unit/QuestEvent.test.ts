import { describe, it, expect } from 'vitest';
import { applyEventReward, daySchedule, eventAppliesToBattle, eventAt, eventEffects, eventFor, EVENT_WINDOW_MS, MAX_DOUBLE, NO_EVENT, nextEvent, windowIndex, WINDOWS_PER_DAY } from '@/systems/EventSystem';
import {
  activeQuests, claimQuest, emptyQuestState, gameDay, gameWeek, isClaimable, nextReset, parseQuestState, QUEST_KINDS, questBoard, questProgress, QUESTS, QUESTS_SHOWN,
  questStatus, recordQuestEvent, refreshQuests, withQuestEvents,
} from '@/systems/QuestSystem';
import { canSweep, openSweeps, SWEEP_MAX, SWEEP_RECHARGE_MS, SWEEP_REWARD_SCALE, sweepArea, sweepCost, sweepsLeft } from '@/systems/ProgressionSystem';
import { battleReward, resources } from '@/systems/ResourceSystem';
import { emptyNationProgress, IProgress } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';
import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';
import { isFreeArea } from '@/systems/CampaignSystem';

/** 2026-10-19 (Monday) 00:00 JST: the game day's start since #219 (the name is kept from the 05:00 days). */
const MONDAY_5AM = Date.UTC(2026, 9, 18, 15);
const HOUR = 3_600_000;

describe('events (#89)', () => {
  it('the same moment gives the same event; windows are three hours from 00:00 JST (#219)', () => {
    expect(windowIndex(MONDAY_5AM + 1) - windowIndex(MONDAY_5AM - 1)).toBe(1);
    expect(windowIndex(MONDAY_5AM + 3 * HOUR - 1)).toBe(windowIndex(MONDAY_5AM));
    for (let i = 0; i < 50; i++) {
      const t = MONDAY_5AM + i * EVENT_WINDOW_MS + 1234;
      const e = eventAt(t);
      expect(e).toEqual(eventAt(t + 60_000));
      if (e) expect(e.startsAt <= t && t < e.endsAt).toBe(true);
    }
  });

  it('every window has an event (#218); every kind turns up; 報酬 2 倍 at most twice a day', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const e = eventAt(MONDAY_5AM + i * EVENT_WINDOW_MS);
      expect(e).not.toBeNull();
      kinds.add(e!.kind);
    }
    expect(kinds).toEqual(new Set(['double', 'steel', 'training', 'repair', 'fuel', 'ammo', 'bauxite']));
    const today = gameDay(MONDAY_5AM);
    for (let d = today; d < today + 60; d++) {
      const day = daySchedule(d);
      expect(day).toHaveLength(WINDOWS_PER_DAY);
      expect(day.filter((e) => e.kind === 'double').length).toBeLessThanOrEqual(MAX_DOUBLE);
      // The schedule starts at the day's 00:00 JST and is the table eventAt reads.
      expect(day[0].startsAt).toBe(MONDAY_5AM + (d - today) * 24 * HOUR);
      expect(eventAt(day[3].startsAt + 1)).toEqual(day[3]);
    }
    expect(nextEvent(MONDAY_5AM)!.startsAt).toBe(MONDAY_5AM + EVENT_WINDOW_MS);
  });

  it('effects apply to rewards; double only in its theater', () => {
    const r = battleReward(true, 2);
    const fx = eventEffects({ kind: 'double', theater: 'pacific', startsAt: 0, endsAt: 1 });
    expect(applyEventReward(r, fx, 'pacific').fuel).toBe(r.fuel * 2);
    expect(applyEventReward(r, fx, 'atlantic')).toEqual(r);
    expect(applyEventReward(r, fx)).toEqual(r);
    const steel = eventEffects({ kind: 'steel', startsAt: 0, endsAt: 1 });
    expect(applyEventReward(r, steel).steel).toBe(Math.round(r.steel * 1.5));
    expect(applyEventReward(r, steel).fuel).toBe(r.fuel);
    expect(eventEffects(null)).toBe(NO_EVENT);
    // Only an event that changed the battle is named on its results.
    expect(eventAppliesToBattle({ kind: 'double', theater: 'pacific', startsAt: 0, endsAt: 1 }, undefined)).toBe(false);
    expect(eventAppliesToBattle({ kind: 'double', theater: 'pacific', startsAt: 0, endsAt: 1 }, 'pacific')).toBe(true);
    expect(eventAppliesToBattle({ kind: 'repair', startsAt: 0, endsAt: 1 }, 'pacific')).toBe(false);
    expect(eventAppliesToBattle({ kind: 'steel', startsAt: 0, endsAt: 1 })).toBe(true);
  });

  it('a clock set back before the newest time seen gets no event', () => {
    let t = MONDAY_5AM;
    while (!eventAt(t)) t += EVENT_WINDOW_MS;
    expect(eventFor(t, t + 5 * HOUR)).toBeNull();
    expect(eventFor(t, t - HOUR)).toEqual(eventAt(t));
  });
});

describe('quests (#52)', () => {
  it('game days start at 00:00 JST and weeks on Monday (#219)', () => {
    expect(gameDay(MONDAY_5AM) - gameDay(MONDAY_5AM - 1)).toBe(1);
    expect(gameWeek(MONDAY_5AM) - gameWeek(MONDAY_5AM - 1)).toBe(1);
    expect(gameWeek(MONDAY_5AM + 6 * 24 * HOUR)).toBe(gameWeek(MONDAY_5AM));
    expect(nextReset('daily', MONDAY_5AM + HOUR)).toBe(MONDAY_5AM + 24 * HOUR);
    expect(nextReset('weekly', MONDAY_5AM + HOUR)).toBe(MONDAY_5AM + 7 * 24 * HOUR);
  });

  it('progress, claim once, daily reset keeps one-time quests', () => {
    let s = refreshQuests(emptyQuestState(), MONDAY_5AM);
    const weekly = activeQuests('weekly', MONDAY_5AM)[0];
    s = recordQuestEvent(s, 'sortie', MONDAY_5AM, 7);
    s = recordQuestEvent(s, weekly.event, MONDAY_5AM, 1);
    expect(s.progress.d_sortie).toBe(5);
    expect(s.progress[weekly.id]).toBeGreaterThanOrEqual(1);
    s = recordQuestEvent(s, 'build', MONDAY_5AM);
    expect(isClaimable(s, QUESTS.find((q) => q.id === 'a_build')!)).toBe(true);
    const c = claimQuest(s, 'd_sortie', MONDAY_5AM)!;
    expect(c.reward).toEqual(QUESTS.find((q) => q.id === 'd_sortie')!.reward);
    expect(claimQuest(c.state, 'd_sortie', MONDAY_5AM)).toBeNull();
    // Next day: the daily is open again, the weekly keeps its progress, one-time quests stay.
    const next = refreshQuests(c.state, MONDAY_5AM + 25 * HOUR);
    expect(next.progress.d_sortie).toBeUndefined();
    expect(next.claimed).not.toContain('d_sortie');
    expect(next.progress[weekly.id]).toBe(s.progress[weekly.id]);
    expect(questProgress(next, QUESTS.find((q) => q.id === 'a_build')!)).toBe(1);
    // Next week: weeklies reset too; lifetime totals never do.
    const later = refreshQuests(next, MONDAY_5AM + 8 * 24 * HOUR);
    expect(later.progress[weekly.id]).toBeUndefined();
    expect(later.totals.sortie).toBe(s.totals.sortie);
  });

  it('parses junk safely', () => {
    expect(parseQuestState(null)).toEqual(emptyQuestState());
    expect(parseQuestState({ day: 3, progress: { a: 2, b: 'x' }, claimed: ['a', 1], totals: { win: 4, sink: 'x' } }))
      .toEqual({ day: 3, week: 0, hour: 0, progress: { a: 2 }, claimed: ['a'], totals: { win: 4 } });
  });
});

describe('quests: the board (#158)', () => {
  it('has about 100 quests over hourly, daily, weekly and one-time kinds', () => {
    expect(QUESTS.length).toBeGreaterThanOrEqual(95);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const k of QUEST_KINDS) expect(QUESTS.filter((q) => q.kind === k).length).toBeGreaterThanOrEqual(QUESTS_SHOWN[k]);
  });

  it('ten of each turn over every hour, day and week (#180), picked per period from a larger pool', () => {
    const now = MONDAY_5AM + 30 * 60_000;
    for (const k of ['hourly', 'daily', 'weekly'] as const) {
      expect(activeQuests(k, now), k).toHaveLength(10);
      expect(questBoard(emptyQuestState(), k, now), k).toHaveLength(10);
    }
    expect(QUESTS.filter((q) => q.kind === 'hourly').length).toBeGreaterThanOrEqual(30);
    expect(QUESTS.filter((q) => q.kind === 'daily').length).toBeGreaterThanOrEqual(30);
    expect(QUESTS.filter((q) => q.kind === 'weekly').length).toBeGreaterThanOrEqual(25);
    expect(activeQuests('hourly', now + 10 * 60_000)).toEqual(activeQuests('hourly', now));
    const hours = new Set(Array.from({ length: 12 }, (_, i) => activeQuests('hourly', now + i * HOUR).map((q) => q.id).join()));
    expect(hours.size).toBeGreaterThan(6);
    expect(activeQuests('daily', now).map((q) => q.id)).toEqual(expect.arrayContaining(['d_sortie', 'd_win', 'd_sink', 'd_repair']));
    expect(activeQuests('daily', now)).toHaveLength(QUESTS_SHOWN.daily);
    expect(activeQuests('daily', now + 24 * HOUR)).not.toEqual(activeQuests('daily', now));
    for (const k of QUEST_KINDS) expect(questBoard(emptyQuestState(), k, now).length).toBeLessThanOrEqual(10);
    expect(nextReset('hourly', now)).toBe(MONDAY_5AM + HOUR);
  });

  it('a full hourly board pays about 600 fuel and ammo; dailies bring 3〜4 time-saving items a day (#180)', () => {
    const hourly = QUESTS.filter((q) => q.kind === 'hourly');
    for (const k of ['fuel', 'ammo'] as const) {
      const perHour = (hourly.reduce((s, q) => s + (q.reward[k] ?? 0), 0) / hourly.length) * QUESTS_SHOWN.hourly;
      expect(perHour, k).toBeGreaterThanOrEqual(500);
      expect(perHour, k).toBeLessThanOrEqual(700);
    }
    // Expected items over many days: the four core dailies always, the rest drawn.
    const days = Array.from({ length: 60 }, (_, i) => activeQuests('daily', MONDAY_5AM + i * 24 * HOUR));
    const items = days.map((d) => d.reduce((s, q) => s + (q.items?.fastRepair ?? 0) + (q.items?.fastBuild ?? 0), 0));
    const mean = items.reduce((a, b) => a + b, 0) / items.length;
    expect(mean).toBeGreaterThanOrEqual(3);
    expect(mean).toBeLessThanOrEqual(4);
  });

  it('hourly progress resets on the hour; an off-board quest gains nothing', () => {
    const now = MONDAY_5AM + 5 * 60_000;
    const h = activeQuests('hourly', now)[0];
    let s = recordQuestEvent(emptyQuestState(), h.event, now, h.goal);
    expect(isClaimable(s, h)).toBe(true);
    s = refreshQuests(s, now + HOUR);
    expect(s.progress[h.id]).toBeUndefined();
    const off = QUESTS.find((q) => q.kind === 'daily' && !activeQuests('daily', now).includes(q))!;
    expect(recordQuestEvent(emptyQuestState(), off.event, now, 99).progress[off.id]).toBeUndefined();
    expect(claimQuest(recordQuestEvent(emptyQuestState(), off.event, now, 99), off.id, now)).toBeNull();
  });

  it('sorts the board: claimable, in progress, not started, claimed; claiming a ladder quest names its medal', () => {
    const now = MONDAY_5AM;
    let s = recordQuestEvent(emptyQuestState(), 'build', now, 10);
    s = recordQuestEvent(s, 'win', now, 3);
    s = claimQuest(s, 'a_build', now)!.state;
    const board = questBoard(s, 'once', now);
    const order = board.map((q) => questStatus(s, q));
    expect(order).toEqual([...order].sort((a, b) => ['claimable', 'progress', 'idle', 'claimed'].indexOf(a) - ['claimable', 'progress', 'idle', 'claimed'].indexOf(b)));
    expect(board[0].id).toBe('a_build10');
    expect(claimQuest(s, 'a_build10', now)!.medal).toBe('q_build10');
    expect(questStatus(s, QUESTS.find((q) => q.id === 'a_win50')!)).toBe('progress');
  });
});

describe('sweep (#57)', () => {
  const area = (campaign as ICampaignData).areas.find((a) => !isFreeArea(a)) as ICampaignArea;
  const enemy = [{ id: 'e1', shipClass: ShipClass.Destroyer }, { id: 'e2', shipClass: ShipClass.Carrier }] as IShipData[];
  const base = (): IProgress => ({
    ...emptyNationProgress(), nation: Nation.IJN, campaign: [area.id], resources: resources({ fuel: 3000, ammo: 3000, steel: 3000, bauxite: 3000 }),
    record: { sorties: 0, victories: 0, perfectVictories: 0, sunk: {}, damageDealt: 0, bestDamage: 0, shipsLost: 0, medals: [] },
  });

  it('needs a win without losses first', () => {
    expect(canSweep(base(), area)).toBe(false);
    expect(sweepArea(base(), area, enemy, MONDAY_5AM)).toBeNull();
  });

  it('pays the sortie, gives 80% of a win, merit and quest progress', () => {
    const p = { ...base(), perfect: [area.id] };
    const r = sweepArea(p, area, enemy, MONDAY_5AM)!;
    const cost = sweepCost(area, enemy);
    const won = battleReward(true, enemy.length);
    expect(r.reward.fuel).toBe(Math.round(won.fuel * SWEEP_REWARD_SCALE));
    expect(r.progress.resources.fuel).toBe(p.resources.fuel - cost.fuel + r.reward.fuel);
    expect(r.merit).toBeGreaterThan(0);
    expect(questProgress(r.progress.quests, QUESTS.find((q) => q.id === 'a_sweep')!)).toBe(1);
    expect(r.progress.quests.totals.sinkCarrier).toBe(1);
    expect(r.progress.campaign).toEqual(p.campaign);
    const doubled = sweepArea(p, area, enemy, MONDAY_5AM, eventEffects({ kind: 'double', theater: area.theater, startsAt: 0, endsAt: 1 }))!;
    expect(doubled.reward.fuel).toBe(Math.round(won.fuel * 2 * SWEEP_REWARD_SCALE));
    expect(withQuestEvents(p, [], MONDAY_5AM)).toBe(p);
  });

  it('banks up to three sweeps, one more an hour; the first S opens it at 0 (#181)', () => {
    let p: IProgress = openSweeps({ ...base(), perfect: [area.id] }, area.id, MONDAY_5AM);
    expect(sweepsLeft(p, area.id, MONDAY_5AM)).toBe(0);
    expect(sweepArea(p, area, enemy, MONDAY_5AM)).toBeNull();
    expect(sweepsLeft(p, area.id, MONDAY_5AM + HOUR - 1)).toBe(0);
    expect(sweepsLeft(p, area.id, MONDAY_5AM + HOUR)).toBe(1);
    expect(sweepsLeft(p, area.id, MONDAY_5AM + 10 * HOUR)).toBe(SWEEP_MAX);
    // Opening again (another S) keeps the charges.
    expect(openSweeps(p, area.id, MONDAY_5AM + HOUR)).toBe(p);
    // Using one at 2.5 h keeps the running hour: the next comes at 3 h.
    p = sweepArea(p, area, enemy, MONDAY_5AM + 2.5 * HOUR)!.progress;
    expect(sweepsLeft(p, area.id, MONDAY_5AM + 2.5 * HOUR)).toBe(1);
    expect(sweepsLeft(p, area.id, MONDAY_5AM + 3 * HOUR)).toBe(2);
    expect(SWEEP_RECHARGE_MS).toBe(HOUR);
  });

  it('a full bank starts its hour on use, stops at the cap and ignores a clock set back (#181)', () => {
    let p: IProgress = { ...base(), perfect: [area.id], sweepCharges: { [area.id]: { charges: SWEEP_MAX, at: 0 } } };
    for (let i = 0; i < SWEEP_MAX; i++) {
      expect(sweepsLeft(p, area.id, MONDAY_5AM)).toBe(SWEEP_MAX - i);
      p = sweepArea(p, area, enemy, MONDAY_5AM)!.progress;
    }
    expect(sweepsLeft(p, area.id, MONDAY_5AM)).toBe(0);
    expect(sweepArea(p, area, enemy, MONDAY_5AM + HOUR / 2)).toBeNull();
    expect(sweepsLeft(p, area.id, MONDAY_5AM - 24 * HOUR)).toBe(0);
    expect(sweepsLeft(p, area.id, MONDAY_5AM + HOUR)).toBe(1);
    // Areas keep their own charges; an area open from before the charges counts as full.
    expect(sweepsLeft(p, 'other', MONDAY_5AM)).toBe(SWEEP_MAX);
  });
});
