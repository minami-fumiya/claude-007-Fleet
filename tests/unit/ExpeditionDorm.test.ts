import { describe, it, expect } from 'vitest';
import { collectExpeditions, EXPEDITIONS, expeditionsAt, shownExpeditions, expeditionSlots, expeditionState, groupProblem, pickShips, recallExpedition, rememberedGroup, shipsAway, startExpedition } from '@/systems/ExpeditionSystem';
import { collectDorm, DORM_PROFICIENCY_CAP, DORM_XP_PER_HOUR, dormSlots, enterDorm, inDorm, leaveDorm } from '@/systems/DormSystem';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { resources } from '@/systems/ResourceSystem';
import { RANKS } from '@/systems/RankSystem';
import { MEDALS } from '@/systems/RecordSystem';
import { emptyProgress, parseSave } from '@/utils/ProgressStore';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';

const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
const CAP = resources({ fuel: 99999, ammo: 99999, steel: 99999, bauxite: 99999 });

describe('遠征 (#41)', () => {
  it('every expedition is well formed, longer ones pay more and ask more', () => {
    expect(EXPEDITIONS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(EXPEDITIONS.map((e) => e.id)).size).toBe(EXPEDITIONS.length);
    for (const e of EXPEDITIONS) {
      const needed = Object.values(e.needs).reduce<number>((a, b) => a + (b ?? 0), 0);
      expect(needed, e.id).toBeLessThanOrEqual(e.ships);
      expect(e.rank, e.id).toBeLessThan(RANKS.length);
      const total = Object.values(e.reward).reduce<number>((a, b) => a + (b ?? 0), 0);
      // A good deal per hour, but less than battling (a mid-game hour of battles brings thousands).
      expect(total / (e.minutes / 60), e.id).toBeLessThanOrEqual(600);
      expect(total, e.id).toBeGreaterThan(0);
    }
    expect(expeditionSlots(1)).toBe(1);
    expect(expeditionSlots(6)).toBe(2);
    expect(expeditionSlots(13)).toBe(3);
  });

  it('picks the classes it needs, then the smallest ships, and says why it cannot go', () => {
    const escort = EXPEDITIONS.find((e) => e.id === 'ex_escort')!;
    const idle = [byId('yamato'), byId('sendai'), byId('fubuki'), byId('yukikaze'), byId('mutsuki')];
    const group = pickShips(escort, idle)!;
    expect(group.map((s) => s.shipClass).sort()).toEqual([ShipClass.Cruiser, ShipClass.Destroyer, ShipClass.Destroyer]);
    expect(group.map((s) => s.id)).not.toContain('yamato');
    expect(pickShips(escort, [byId('yamato'), byId('fubuki')])).toBeNull();
    expect(expeditionState(escort, [], 1, idle)).toBe('rank');
    expect(expeditionState(escort, [], 5, idle)).toBe('ready');
    expect(expeditionState(escort, [], 5, [byId('fubuki')])).toBe('ships');
    const runs = startExpedition([], escort, 5, idle, T0)!;
    expect(expeditionState(escort, runs, 5, idle)).toBe('busy');
    const drill = EXPEDITIONS.find((e) => e.id === 'ex_drill')!;
    expect(expeditionState(drill, runs, 5, idle)).toBe('slots');
  });

  it('ships are away until back; the reward comes home under the cap', () => {
    const drill = EXPEDITIONS.find((e) => e.id === 'ex_drill')!;
    const runs = startExpedition([], drill, 1, [byId('fubuki')], T0)!;
    expect(shipsAway(runs).has('fubuki')).toBe(true);
    const p = { ...emptyProgress(), ships: ['fubuki'], expeditions: runs, resources: CAP };
    expect(sortieBlockers(p, [byId('fubuki')], T0, { exercise: true })).toContain(`${byId('fubuki').name} は遠征中`);
    const early = collectExpeditions(resources(), runs, CAP, T0 + drill.minutes * 60_000 - 1);
    expect(early.done).toBe(0);
    expect(early.runs).toHaveLength(1);
    const back = collectExpeditions(resources(), runs, CAP, T0 + drill.minutes * 60_000);
    expect(back.done).toBe(1);
    expect(back.runs).toEqual([]);
    expect(back.resources.fuel).toBe(drill.reward.fuel);
    const capped = collectExpeditions(resources(), runs, resources({ fuel: 10, ammo: 10, steel: 10, bauxite: 10 }), T0 + 999 * HOUR);
    expect(capped.resources.fuel).toBe(10);
    expect(capped.lost.fuel).toBe((drill.reward.fuel ?? 0) - 10);
  });
});

describe('遠征の編成と呼び戻し (#337)', () => {
  const escort = () => EXPEDITIONS.find((e) => e.id === 'ex_escort')!;
  const idle = [byId('yamato'), byId('sendai'), byId('fubuki'), byId('yukikaze'), byId('mutsuki')];

  it('a chosen group goes as chosen when it fits, and says what it lacks when not', () => {
    const e = escort();
    // 海上護衛任務: a cruiser and two destroyers.
    const mine = [byId('sendai'), byId('yukikaze'), byId('fubuki')];
    expect(groupProblem(e, mine)).toBeNull();
    expect(groupProblem(e, [byId('sendai'), byId('yukikaze')])).toContain('あと 1 隻');
    expect(groupProblem(e, [byId('yamato'), byId('fubuki'), byId('yukikaze')])).not.toBeNull();
    expect(groupProblem(e, [...mine, byId('yamato')])).toContain('多すぎる');
    const runs = startExpedition([], e, 5, idle, T0, mine)!;
    expect(runs[0].shipIds).toEqual(mine.map((s) => s.id));
    // A group that doesn't fit falls back to the picked ships.
    expect(startExpedition([], e, 5, idle, T0, [byId('yamato')])![0].shipIds).not.toContain('yamato');
  });

  it('the group sent last time is kept for the next, while its ships are free', () => {
    const e = escort();
    const groups = { ex_escort: ['sendai', 'yukikaze', 'fubuki'] };
    expect(rememberedGroup(groups, e, idle)?.map((s) => s.id)).toEqual(['sendai', 'yukikaze', 'fubuki']);
    expect(rememberedGroup(groups, e, idle.filter((s) => s.id !== 'fubuki'))).toBeNull();
    expect(rememberedGroup({}, e, idle)).toBeNull();
  });

  it('recalling frees the ships at once, without the reward', () => {
    const runs = startExpedition([], escort(), 5, idle, T0)!;
    const back = recallExpedition(runs, 'ex_escort');
    expect(back).toEqual([]);
    expect(collectExpeditions(resources(), back, CAP, T0 + 999 * HOUR).done).toBe(0);
    expect(parseSave(JSON.stringify({ version: 1, nations: { IJN: { ships: [] } } })).nations.IJN!.expeditionGroups).toEqual({});
  });
});

describe('寮舎 (#57)', () => {
  const base = () => ({ ...emptyProgress(), ships: ['fubuki'], captains: ['ijn_yamamoto'], proficiency: { fubuki: 10 }, captainXp: {} as Record<string, number> });

  it('ships gain proficiency up to a ceiling, captains XP, with time', () => {
    let p = enterDorm(base(), 'ship', 'fubuki', 1, T0)!;
    p = enterDorm(p, 'captain', 'ijn_yamamoto', 1, T0)!;
    expect(enterDorm(p, 'ship', 'yukikaze', 1, T0)).toBeNull();
    expect(inDorm(p.dorm, 'ship', 'fubuki')).toBe(true);
    const after = collectDorm(p, T0 + 5 * HOUR);
    expect(after.progress.proficiency.fubuki).toBe(20);
    expect(after.progress.captainXp.ijn_yamamoto).toBe(5 * DORM_XP_PER_HOUR);
    expect(after.hours).toBe(10);
    // Collected again at once, nothing more comes.
    expect(collectDorm(after.progress, T0 + 5 * HOUR).progress.proficiency.fubuki).toBe(20);
    // Never past the ceiling, and a stay counts a day at most.
    expect(collectDorm(p, T0 + 999 * HOUR).progress.proficiency.fubuki).toBe(DORM_PROFICIENCY_CAP);
  });

  it('what is in the dorm cannot sortie; leaving credits the training', () => {
    const p = { ...enterDorm(base(), 'ship', 'fubuki', 1, T0)!, resources: CAP };
    expect(sortieBlockers(p, [byId('fubuki')], T0, { exercise: true })).toContain(`${byId('fubuki').name} は寮舎で訓練中`);
    const out = leaveDorm(p, 'ship', 'fubuki', T0 + 2 * HOUR);
    expect(out.progress.dorm).toEqual([]);
    expect(out.progress.proficiency.fubuki).toBe(14);
    expect(dormSlots(1)).toBe(2);
    expect(dormSlots(13)).toBe(4);
  });

  it('a save without them reads empty, and both bring medals', () => {
    const np = parseSave(JSON.stringify({ version: 1, nations: { IJN: { ships: ['fubuki'] } } })).nations.IJN!;
    expect(np.expeditions).toEqual([]);
    expect(np.dorm).toEqual([]);
    for (const id of ['expedition', 'expedition_3', 'dorm', 'dorm_3']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
});

describe('遠征は階級ごとに 1 つずつ (#359)', () => {
  it('each rank from 准尉 to 元帥 opens exactly one expedition, shorter than 0.0.46', () => {
    for (let r = 1; r < RANKS.length; r++) expect(expeditionsAt(r).length, RANKS[r].name).toBe(1);
    expect(Math.min(...EXPEDITIONS.map((e) => e.minutes))).toBeLessThanOrEqual(10);
    // One or two long ones stay, to send before sleeping.
    const long = EXPEDITIONS.filter((e) => e.minutes >= 120).length;
    expect(long).toBeGreaterThanOrEqual(1);
  });

  it('the list shows the opened ones newest first, after the next one as a goal', () => {
    const shown = shownExpeditions(3);
    expect(shown[0].rank).toBe(4);
    expect(shown.slice(1).map((e) => e.rank)).toEqual([3, 2, 1]);
    // At 元帥 every one is open and none is waiting.
    expect(shownExpeditions(13)).toHaveLength(EXPEDITIONS.length);
    // An expedition out stays listed even if the rank no longer reaches it.
    expect(shownExpeditions(1, [{ id: 'ex_support', shipIds: [], endsAt: 0 }]).some((e) => e.id === 'ex_support')).toBe(true);
  });
});
