import { describe, it, expect } from 'vitest';
import {
  ACE_KILLS, ACE_NAMES, AIRCRAFT, aircraftDevState, carrierModel, chooseModel, developAircraft, IAirHolder, modelsFor, nextAceName, perfOf,
  grantStarterAircraft, OLD_PERF, pilotAfterBattle, pilotMul, STARTER_AIRCRAFT, STARTER_COST, developCostOf, wingPerf,
} from '@/systems/AircraftSystem';
import { createAirWing } from '@/systems/AirWingSystem';
import { AircraftType, CARRIER_AIRCRAFT } from '@/types/Aircraft';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { resources } from '@/systems/ResourceSystem';
import techTree from '@/data/tech-tree.json';
import { parseSave } from '@/utils/ProgressStore';

const holder = (patch: Partial<IAirHolder> = {}): IAirHolder => ({
  research: [], resources: resources({ fuel: 9000, ammo: 9000, steel: 9000, bauxite: 9000 }), aircraftDev: [], airGroups: {}, pilots: {}, ...patch,
});

describe('航空機の機種と開発 (#87)', () => {
  it('every navy flies a base model of each carrier kind from the start; later ones need research', () => {
    const techIds = new Set(techTree.tech.map((n) => n.id));
    for (const n of PLAYABLE_NATIONS) {
      for (const kind of CARRIER_AIRCRAFT) {
        const models = modelsFor(n, kind);
        expect(models.length, `${n} ${kind}`).toBeGreaterThan(0);
        expect(models[0].requires, `${n} ${kind}`).toBeUndefined();
        for (const m of models.slice(1)) {
          expect(m.requires && techIds.has(m.requires), m.id).toBe(true);
          expect(m.cost, m.id).toBeDefined();
        }
      }
    }
    expect(new Set(AIRCRAFT.map((a) => a.id)).size).toBe(AIRCRAFT.length);
  });

  it('a later model is better than the one before it overall', () => {
    const score = (id: string): number => {
      const f = perfOf(AIRCRAFT.find((a) => a.id === id));
      return f.attack + f.agility + f.toughness + f.speed;
    };
    for (const n of PLAYABLE_NATIONS) {
      for (const kind of CARRIER_AIRCRAFT) {
        const ids = modelsFor(n, kind).map((m) => m.id);
        for (let i = 1; i < ids.length; i++) expect(score(ids[i]), ids[i]).toBeGreaterThan(score(ids[i - 1]));
      }
    }
  });

  it('develops once with research and resources, then a carrier can pick it', () => {
    const h = holder();
    const zero52 = AIRCRAFT.find((a) => a.id === 'ijn_fighter2')!;
    expect(aircraftDevState(h, zero52)).toBe('research');
    expect(developAircraft(h, 'ijn_fighter2')).toBeNull();
    const ready = holder({ research: ['aviation_3'] });
    expect(aircraftDevState(ready, zero52)).toBe('ready');
    expect(aircraftDevState({ ...ready, resources: resources() }, zero52)).toBe('resources');
    const done = developAircraft(ready, 'ijn_fighter2')!;
    expect(done.aircraftDev).toEqual(['ijn_fighter2']);
    expect(aircraftDevState(done, zero52)).toBe('developed');
    expect(developAircraft(done, 'ijn_fighter2')).toBeNull();
    // The newest developed model flies unless the carrier chose another.
    expect(carrierModel(done, 'akagi', 'IJN', AircraftType.Fighter)?.id).toBe('ijn_fighter2');
    // 初期機も要開発 (#385): the first model can be picked once developed.
    expect(chooseModel(done, 'akagi', 'ijn_fighter')).toBeNull();
    const both = developAircraft(done, 'ijn_fighter')!;
    const picked = chooseModel(both, 'akagi', 'ijn_fighter')!;
    expect(carrierModel(picked, 'akagi', 'IJN', AircraftType.Fighter)?.id).toBe('ijn_fighter');
    expect(chooseModel(done, 'akagi', 'ijn_fighter3')).toBeNull();
    expect(wingPerf(done, 'akagi', 'IJN')[AircraftType.Fighter]).toEqual(perfOf(zero52));
  });

  it('a wing carries its models and pilots into battle', () => {
    const wing = createAirWing({ fighters: 6, diveBombers: 6, torpedoBombers: 6 }, 1000, { perf: wingPerf(holder({ aircraftDev: ['usn_fighter'] }), 'x', 'USN'), pilot: 1.1 });
    expect(wing.pilot).toBe(1.1);
    expect(wing.perf?.[AircraftType.Fighter]?.toughness).toBeGreaterThan(1);
    expect(createAirWing({ fighters: 1, diveBombers: 0, torpedoBombers: 0 }).perf).toBeUndefined();
  });

  it('saves without the air fields read empty (a save from before 0.0.55 with every first model, #385)', () => {
    const np = parseSave(JSON.stringify({ version: 40, current: 'IJN', nations: { IJN: { ships: ['akagi'], airGroups: { akagi: { Fighter: 'ijn_fighter2', Bogus: 'x' } }, pilots: { akagi: { skill: 140, kills: 3 } } } } })).nations.IJN!;
    expect(np.aircraftDev).toEqual(STARTER_AIRCRAFT);
    expect(np.airStart).toBe(true);
    expect(parseSave(JSON.stringify({ version: 40, current: 'IJN', nations: { IJN: { ships: [], airStart: false } } })).nations.IJN!.aircraftDev).toEqual([]);
    expect(np.airGroups).toEqual({ akagi: { Fighter: 'ijn_fighter2' } });
    expect(np.pilots).toEqual({ akagi: { skill: 100, kills: 3 } });
  });
});

describe('搭乗員とエース (#87)', () => {
  it('pilots grow with battles and kills, lose some with planes lost', () => {
    const first = pilotAfterBattle(undefined, { kills: 4, lost: 0 }, 'IJN', {});
    expect(first.pilot.skill).toBe(5);
    expect(first.aceBorn).toBeUndefined();
    expect(pilotAfterBattle({ skill: 10, kills: 0 }, { kills: 0, lost: 20 }, 'IJN', {}).pilot.skill).toBe(7);
    expect(pilotMul({ skill: 100, kills: 0 })).toBeCloseTo(1.2);
    expect(pilotMul(undefined)).toBe(1);
  });

  it('an ace joins past the kills, named from the navy and never twice', () => {
    const r = pilotAfterBattle({ skill: 50, kills: ACE_KILLS - 1 }, { kills: 1, lost: 0 }, 'IJN', {});
    expect(r.aceBorn).toBe(ACE_NAMES.IJN[0]);
    expect(r.pilot.ace).toBe(ACE_NAMES.IJN[0]);
    expect(pilotMul(r.pilot)).toBeGreaterThan(pilotMul({ skill: r.pilot.skill, kills: 0 }));
    expect(nextAceName('IJN', { akagi: r.pilot })).toBe(ACE_NAMES.IJN[1]);
    // An ace stays; no second one for the same group.
    expect(pilotAfterBattle(r.pilot, { kills: 20, lost: 0 }, 'IJN', { akagi: r.pilot }).aceBorn).toBeUndefined();
    for (const n of PLAYABLE_NATIONS) expect(ACE_NAMES[n]?.length, n).toBeGreaterThan(1);
  });
});

describe('初期機も要開発 (#385)', () => {
  it('the first models are developed cheaply; with none the kind flies old planes', () => {
    const first = AIRCRAFT.find((a) => a.id === 'ijn_dive')!;
    expect(aircraftDevState(holder(), first)).toBe('ready');
    expect(developCostOf(first)).toEqual(resources(STARTER_COST));
    expect(wingPerf(holder(), 'akagi', 'IJN')[AircraftType.DiveBomber]).toEqual(OLD_PERF);
    const score = (f: typeof OLD_PERF): number => f.attack + f.agility + f.toughness + f.speed;
    expect(score(OLD_PERF)).toBeLessThan(score(perfOf(first)));
    // Floatplanes need nothing.
    expect(aircraftDevState(holder(), AIRCRAFT.find((a) => a.id === 'ijn_recon')!)).toBe('developed');
  });

  it('the first carrier brings the first fighter, once', () => {
    const isCv = (id: string): boolean => id === 'hosho';
    const fresh = { aircraftDev: [] as string[], airStart: false, ships: ['fubuki'] };
    expect(grantStarterAircraft(fresh, 'IJN', isCv)).toBe(fresh);
    const got = grantStarterAircraft({ ...fresh, ships: ['fubuki', 'hosho'] }, 'IJN', isCv);
    expect(got.aircraftDev).toEqual(['ijn_fighter']);
    expect(got.airStart).toBe(true);
    expect(grantStarterAircraft({ ...got, aircraftDev: [] }, 'IJN', isCv).aircraftDev).toEqual([]);
  });
});
