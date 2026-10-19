import { describe, it, expect } from 'vitest';
import {
  boostedBase, buildTimeMul, facilityCost, facilityLevel, facilityState, finishFacilities, regenRules, startFacility, uniqueStrength,
} from '@/systems/FacilitySystem';
import { BASES } from '@/systems/BaseSystem';
import { REGEN_CAP, REGEN_PER_TICK, regenerate, resources } from '@/systems/ResourceSystem';
import { runMigrations } from '@/utils/SaveMigration';

const T0 = 1_700_000_000_000;
const rich = resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 });
const base = (id: string) => BASES.find((b) => b.id === id)!;

describe('base facilities (#146)', () => {
  it('without facilities, regeneration is exactly as before', () => {
    const r = regenRules({});
    expect(r.perTick).toEqual(REGEN_PER_TICK);
    expect(r.cap).toEqual(resources({ fuel: REGEN_CAP, ammo: REGEN_CAP, steel: REGEN_CAP, bauxite: REGEN_CAP }));
    expect(regenerate(resources(), T0, T0 + 10 * 60_000, r)).toEqual(regenerate(resources(), T0, T0 + 10 * 60_000));
  });

  it('tanks, mills and air bases of every base add up', () => {
    const r = regenRules({ ijn_home: { fuelTank: 2, steelMill: 1 }, ijn_light: { fuelTank: 1, airBase: 3, ammoDepot: 1 } });
    expect(r.cap.fuel).toBe(REGEN_CAP + 3000);
    expect(r.cap.ammo).toBe(REGEN_CAP + 1000);
    expect(r.perTick.steel).toBe(REGEN_PER_TICK.steel + 1);
    expect(r.perTick.bauxite).toBe(REGEN_PER_TICK.bauxite + 3);
    // The higher cap lets fuel regenerate past the old limit.
    expect(regenerate(resources({ fuel: REGEN_CAP }), T0, T0 + 60_000, r).resources.fuel).toBe(REGEN_CAP + REGEN_PER_TICK.fuel);
  });

  it('building pays, takes time and takes effect when finished; one job per base', () => {
    const p = { resources: rich, facilities: {}, facilityJobs: [] };
    const started = startFacility(p, 'ijn_home', 'fuelTank', T0)!;
    expect(started.resources.steel).toBe(rich.steel - facilityCost('fuelTank', 1).steel);
    expect(facilityState(started.facilities, started.facilityJobs, 'ijn_home', 'steelMill', rich)).toBe('busy');
    expect(facilityState(started.facilities, started.facilityJobs, 'ijn_light', 'steelMill', rich)).toBe('ready');
    expect(startFacility(started, 'ijn_home', 'steelMill', T0)).toBeNull();
    expect(finishFacilities(started, T0 + 1)).toBe(started);
    const done = finishFacilities(started, T0 + 10 * 60_000);
    expect(facilityLevel(done.facilities, 'ijn_home', 'fuelTank')).toBe(1);
    expect(done.facilityJobs).toEqual([]);
    expect(facilityState({ ijn_home: { fuelTank: 5 } }, [], 'ijn_home', 'fuelTank', rich)).toBe('max');
    expect(facilityState({}, [], 'ijn_home', 'fuelTank', resources())).toBe('resources');
  });

  it("the base's own facility starts at Lv1 (its #88 bonus) and strengthens it; the workshop trims costs and build time", () => {
    expect(facilityLevel({}, 'ijn_home', 'unique')).toBe(1);
    expect(uniqueStrength({}, 'ijn_home')).toBe(1);
    expect(boostedBase(base('ijn_home'), {})).toEqual({ ...base('ijn_home'), build: undefined, research: undefined });
    const lv3 = boostedBase(base('ijn_home'), { ijn_home: { unique: 3 } })!;
    expect(lv3.repairTime).toBeCloseTo(1 - (1 - base('ijn_home').repairTime!) * 2);
    const workshop = boostedBase(base('ijn_light'), { ijn_light: { workshop: 2 } })!;
    expect(workshop.research).toBeCloseTo(0.9);
    expect(buildTimeMul({ ijn_light: { workshop: 2 } }, 'ijn_light')).toBeCloseTo(0.9);
  });

  it('an old save starts with no facilities', () => {
    const out = runMigrations({ version: 10, nations: { IJN: { ships: [] } } }) as { nations: { IJN: { facilities: object; facilityJobs: unknown[] } } };
    expect(out.nations.IJN.facilities).toEqual({});
    expect(out.nations.IJN.facilityJobs).toEqual([]);
  });
});
