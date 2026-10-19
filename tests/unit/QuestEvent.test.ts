import { describe, it, expect } from 'vitest';
import { applyEventReward, eventAppliesToBattle, eventAt, eventEffects, eventFor, EVENT_WINDOW_MS, NO_EVENT, nextEvent, windowIndex } from '@/systems/EventSystem';
import { claimableCount, claimQuest, emptyQuestState, gameDay, gameWeek, nextReset, parseQuestState, QUESTS, recordQuestEvent, refreshQuests, withQuestEvents } from '@/systems/QuestSystem';
import { canSweep, SWEEP_REWARD_SCALE, sweepArea, sweepCost, SWEEPS_PER_DAY, sweepsLeft } from '@/systems/ProgressionSystem';
import { battleReward, resources } from '@/systems/ResourceSystem';
import { emptyNationProgress, IProgress } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';
import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';
import { isFreeArea } from '@/systems/CampaignSystem';

/** 2026-10-19 (Monday) 05:00 JST */
const MONDAY_5AM = Date.UTC(2026, 9, 18, 20);
const HOUR = 3_600_000;

describe('events (#89)', () => {
  it('the same moment gives the same event; windows are three hours from 05:00 JST', () => {
    expect(windowIndex(MONDAY_5AM + 1) - windowIndex(MONDAY_5AM - 1)).toBe(1);
    expect(windowIndex(MONDAY_5AM + 3 * HOUR - 1)).toBe(windowIndex(MONDAY_5AM));
    for (let i = 0; i < 50; i++) {
      const t = MONDAY_5AM + i * EVENT_WINDOW_MS + 1234;
      const e = eventAt(t);
      expect(e).toEqual(eventAt(t + 60_000));
      if (e) expect(e.startsAt <= t && t < e.endsAt).toBe(true);
    }
  });

  it('some windows have events and some do not; every kind turns up', () => {
    const kinds = new Set<string>();
    let none = 0;
    for (let i = 0; i < 400; i++) {
      const e = eventAt(MONDAY_5AM + i * EVENT_WINDOW_MS);
      if (e) kinds.add(e.kind); else none++;
    }
    expect(kinds).toEqual(new Set(['double', 'steel', 'training', 'repair']));
    expect(none).toBeGreaterThan(100);
    expect(nextEvent(MONDAY_5AM)!.startsAt).toBeGreaterThan(MONDAY_5AM);
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
  it('game days start at 05:00 JST and weeks on Monday', () => {
    expect(gameDay(MONDAY_5AM) - gameDay(MONDAY_5AM - 1)).toBe(1);
    expect(gameWeek(MONDAY_5AM) - gameWeek(MONDAY_5AM - 1)).toBe(1);
    expect(gameWeek(MONDAY_5AM + 6 * 24 * HOUR)).toBe(gameWeek(MONDAY_5AM));
    expect(nextReset('daily', MONDAY_5AM + HOUR)).toBe(MONDAY_5AM + 24 * HOUR);
    expect(nextReset('weekly', MONDAY_5AM + HOUR)).toBe(MONDAY_5AM + 7 * 24 * HOUR);
  });

  it('progress, claim once, daily reset keeps one-time quests', () => {
    let s = refreshQuests(emptyQuestState(), MONDAY_5AM);
    s = recordQuestEvent(s, 'sortie', MONDAY_5AM, 5);
    expect(s.progress.d_sortie).toBe(3);
    expect(s.progress.w_sortie).toBe(5);
    s = recordQuestEvent(s, 'build', MONDAY_5AM);
    expect(claimableCount(s, MONDAY_5AM)).toBe(2);
    const c = claimQuest(s, 'd_sortie', MONDAY_5AM)!;
    expect(c.reward).toEqual(QUESTS.find((q) => q.id === 'd_sortie')!.reward);
    expect(claimQuest(c.state, 'd_sortie', MONDAY_5AM)).toBeNull();
    expect(claimQuest(c.state, 'w_sortie', MONDAY_5AM)).toBeNull();
    // Next day: the daily is open again, the weekly keeps its progress, one-time quests stay.
    const next = refreshQuests(c.state, MONDAY_5AM + 25 * HOUR);
    expect(next.progress.d_sortie).toBeUndefined();
    expect(next.claimed).not.toContain('d_sortie');
    expect(next.progress.w_sortie).toBe(5);
    expect(next.progress.a_build).toBe(1);
    // Next week: weeklies reset too.
    expect(refreshQuests(next, MONDAY_5AM + 8 * 24 * HOUR).progress.w_sortie).toBeUndefined();
  });

  it('parses junk safely', () => {
    expect(parseQuestState(null)).toEqual(emptyQuestState());
    expect(parseQuestState({ day: 3, progress: { a: 2, b: 'x' }, claimed: ['a', 1] })).toEqual({ day: 3, week: 0, progress: { a: 2 }, claimed: ['a'] });
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
    expect(r.progress.quests.progress.a_sweep).toBe(1);
    expect(r.progress.quests.progress.w_carrier).toBe(1);
    expect(r.progress.campaign).toEqual(p.campaign);
    const doubled = sweepArea(p, area, enemy, MONDAY_5AM, eventEffects({ kind: 'double', theater: area.theater, startsAt: 0, endsAt: 1 }))!;
    expect(doubled.reward.fuel).toBe(Math.round(won.fuel * 2 * SWEEP_REWARD_SCALE));
    expect(withQuestEvents(p, [], MONDAY_5AM)).toBe(p);
  });

  it('three sweeps per area per game day (#57: unlimited sweeps made battles pointless)', () => {
    let p: IProgress = { ...base(), perfect: [area.id] };
    for (let i = 0; i < SWEEPS_PER_DAY; i++) {
      expect(sweepsLeft(p, area.id, MONDAY_5AM)).toBe(SWEEPS_PER_DAY - i);
      p = sweepArea(p, area, enemy, MONDAY_5AM)!.progress;
    }
    expect(sweepsLeft(p, area.id, MONDAY_5AM)).toBe(0);
    expect(sweepArea(p, area, enemy, MONDAY_5AM + HOUR)).toBeNull();
    // Other areas have their own count; the next game day starts over.
    expect(sweepsLeft(p, 'other', MONDAY_5AM)).toBe(SWEEPS_PER_DAY);
    expect(sweepsLeft(p, area.id, MONDAY_5AM + 24 * HOUR)).toBe(SWEEPS_PER_DAY);
    expect(sweepArea(p, area, enemy, MONDAY_5AM + 24 * HOUR)).not.toBeNull();
  });
});
