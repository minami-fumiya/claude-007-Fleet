import { describe, it, expect } from 'vitest';
import { collectExpeditions, EXPEDITIONS, expeditionSlots, expeditionState, pickShips, shipsAway, startExpedition } from '@/systems/ExpeditionSystem';
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
    expect(expeditionState(escort, [], 4, idle)).toBe('ready');
    expect(expeditionState(escort, [], 4, [byId('fubuki')])).toBe('ships');
    const runs = startExpedition([], escort, 4, idle, T0)!;
    expect(expeditionState(escort, runs, 4, idle)).toBe('busy');
    const drill = EXPEDITIONS.find((e) => e.id === 'ex_drill')!;
    expect(expeditionState(drill, runs, 4, idle)).toBe('slots');
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
