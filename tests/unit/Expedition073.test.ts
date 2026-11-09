import { describe, expect, it } from 'vitest';
import { EXPEDITIONS, collectExpeditions, startExpedition } from '@/systems/ExpeditionSystem';
import { expeditionDangerMul, expeditionPlan, expeditionPos, expeditionSectors, msHomeFrom, oneWayFor, MAX_ONE_WAY } from '@/systems/ExpeditionRoute';
import { SECTOR_PX, homePort, isSea } from '@/systems/OpenSeaSystem';
import { resources } from '@/systems/ResourceSystem';
import { IShipData } from '@/types/Ship';

const T0 = Date.UTC(2026, 10, 10, 1);

describe('0.0.73 遠征の航路 (#445)', () => {
  it('gives every expedition a sea route for every navy, out and back within its own time', () => {
    for (const n of ['IJN', 'USN', 'RN', 'KM', 'FR', 'RM', 'SU']) {
      for (const e of EXPEDITIONS) {
        const plan = expeditionPlan(n, e);
        expect(plan, `${n} ${e.id}`).not.toBeNull();
        expect(plan!.legMs * 2 + plan!.stationMs, `${n} ${e.id}`).toBeGreaterThanOrEqual(e.minutes * 60_000);
        expect(plan!.legMs * 2 + plan!.stationMs, `${n} ${e.id}`).toBeLessThanOrEqual(e.minutes * 60_000 * 1.05);
        for (const s of plan!.route) expect(isSea(s.c, s.r), `${n} ${e.id}`).toBe(true);
      }
    }
  }, 60_000);

  it('goes farther the longer it is (30 sectors at most), and the same way every time', () => {
    expect(oneWayFor(10)).toBeLessThan(oneWayFor(60));
    expect(oneWayFor(360)).toBe(MAX_ONE_WAY);
    const a = EXPEDITIONS.find((e) => e.id === 'ex_drill')!;
    const b = EXPEDITIONS.find((e) => e.id === 'ex_long_patrol')!;
    expect(expeditionSectors(expeditionPlan('IJN', b)!)).toBeGreaterThan(expeditionSectors(expeditionPlan('IJN', a)!));
    expect(expeditionPlan('IJN', a)).toEqual(expeditionPlan('IJN', a));
  });

  it('sails out, keeps station, sails back and is home when its time is up', () => {
    const e = EXPEDITIONS.find((x) => x.id === 'ex_long_patrol')!;
    const plan = expeditionPlan('IJN', e)!;
    const home = homePort('IJN')!;
    const at0 = expeditionPos(plan, T0, T0);
    expect(Math.floor(at0.x / SECTOR_PX)).toBe(home.c);
    expect(expeditionPos(plan, T0, T0 + plan.legMs + 1).leg).toBe('station');
    expect(expeditionPos(plan, T0, T0 + plan.legMs * 2 + plan.stationMs - 1000).leg).toBe('back');
    const end = expeditionPos(plan, T0, T0 + plan.legMs * 2 + plan.stationMs);
    expect(Math.hypot(end.x - at0.x, end.y - at0.y)).toBeLessThan(1);
    expect(msHomeFrom(plan, T0, T0 + plan.legMs / 2)).toBeCloseTo(plan.legMs / 2, -2);
  });

  it('pays a little more out in dangerous water, a little less near home', () => {
    expect(expeditionDangerMul(1)).toBe(0.9);
    expect(expeditionDangerMul(3)).toBe(1);
    expect(expeditionDangerMul(10)).toBe(1.3);
  });

  it('remembers when it set out; turned home early it pays half', () => {
    const e = EXPEDITIONS.find((x) => x.id === 'ex_drill')!;
    const ship = { id: 'a', shipClass: 'Destroyer' } as unknown as IShipData;
    const runs = startExpedition([], e, 20, [ship], T0)!;
    expect(runs[0]).toMatchObject({ startedAt: T0, checkedAt: T0, met: [] });
    const cap = { fuel: 1e9, ammo: 1e9, steel: 1e9, bauxite: 1e9 };
    const full = collectExpeditions(resources(), runs, cap, T0 + e.minutes * 60_000);
    const cut = collectExpeditions(resources(), [{ ...runs[0], cut: true }], cap, T0 + e.minutes * 60_000);
    expect(cut.gained.fuel).toBe(Math.round(full.gained.fuel * 0.5));
  });
});

describe('0.0.73 記念日を海の上に', () => {
  it('puts every anniversary battle with a scenario on a sea sector where it was fought', async () => {
    const { ANNIVERSARIES, ANNIVERSARY_PLACES } = await import('@/systems/SpecialOpsSystem');
    const os = await import('@/systems/OpenSeaSystem');
    for (const a of ANNIVERSARIES.filter((x) => x.scenario)) {
      const at = ANNIVERSARY_PLACES[a.id];
      expect(at, a.id).toBeDefined();
      const s = os.seaSectorAt(at[0], at[1]);
      expect(s, a.id).not.toBeNull();
      expect(os.isSea(s!.c, s!.r), a.id).toBe(true);
      const ll = os.lonLatOf(s!);
      expect(Math.abs(ll.lat - at[1]), a.id).toBeLessThan(6);
    }
  });
});
