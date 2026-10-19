import { describe, it, expect } from 'vitest';
import {
  boostedBase, buildTimeMul, facilityCost, facilityLevel, facilitySlots, facilityState, finishFacilities, facilityPreview, regenRules, UNIQUE_REGEN_CAP, startFacility, uniqueStrength,
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
    // The higher cap lets fuel regenerate past the old limit, and the tanks speed it up too (#190).
    expect(regenerate(resources({ fuel: REGEN_CAP }), T0, T0 + 60_000, r).resources.fuel).toBe(REGEN_CAP + REGEN_PER_TICK.fuel + 3);
  });

  it('every resource facility raises both rate and cap (#190), never below 0.0.27', () => {
    const levels = { ijn_home: { fuelTank: 2, ammoDepot: 1, steelMill: 3, airBase: 1 } };
    const r = regenRules(levels);
    expect(r.perTick).toEqual({ fuel: REGEN_PER_TICK.fuel + 2, ammo: REGEN_PER_TICK.ammo + 1, steel: REGEN_PER_TICK.steel + 3, bauxite: REGEN_PER_TICK.bauxite + 1 });
    expect(r.cap).toEqual({ fuel: REGEN_CAP + 2000, ammo: REGEN_CAP + 1000, steel: REGEN_CAP + 3000, bauxite: REGEN_CAP + 1000 });
    // 0.0.27's rules: tanks raised caps only, mills and air bases rates only.
    expect(r.cap.fuel).toBeGreaterThanOrEqual(REGEN_CAP + 1000 * 2);
    expect(r.perTick.steel).toBeGreaterThanOrEqual(REGEN_PER_TICK.steel + 3);
    // The base's own facility adds to every cap.
    expect(regenRules({ ijn_home: { unique: 3 } }).cap.steel).toBe(REGEN_CAP + 2 * UNIQUE_REGEN_CAP);
    expect(facilityPreview(levels, 'ijn_home', 'steelMill')).toContain(`回復 ${REGEN_PER_TICK.steel + 3} → ${REGEN_PER_TICK.steel + 4} / 分`);
    expect(facilityPreview(levels, 'ijn_home', 'workshop')).toBeUndefined();
  });

  it('building pays, takes time and takes effect when finished; two at once per base, three from its own facility Lv2 (#216)', () => {
    const p = { resources: rich, facilities: {}, facilityJobs: [] };
    const started = startFacility(p, 'ijn_home', 'fuelTank', T0)!;
    expect(started.resources.steel).toBe(rich.steel - facilityCost('fuelTank', 1).steel);
    // The same facility can't be raised twice at once; another one can.
    expect(facilityState(started.facilities, started.facilityJobs, 'ijn_home', 'fuelTank', rich)).toBe('busy');
    const two = startFacility(started, 'ijn_home', 'steelMill', T0)!;
    expect(facilitySlots(two.facilities, 'ijn_home')).toBe(2);
    expect(facilityState(two.facilities, two.facilityJobs, 'ijn_home', 'ammoDepot', rich)).toBe('busy');
    expect(facilityState(two.facilities, two.facilityJobs, 'ijn_light', 'ammoDepot', rich)).toBe('ready');
    const bigger = { ...two, facilities: { ijn_home: { unique: 2 } } };
    expect(facilityState(bigger.facilities, bigger.facilityJobs, 'ijn_home', 'ammoDepot', rich)).toBe('ready');
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
