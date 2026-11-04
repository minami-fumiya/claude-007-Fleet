import { describe, expect, it } from 'vitest';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import {
  afterBattle, callAtPort, clearOfFeatures, distance, emptyWorld, FEATURE_CLEARANCE, featureProblem, featureReady, FORT_NATION, HOME,
  resourceReward, safeAround, safeDanger, startVoyage, SUPPLY_MAX, takeFort, visitResource, WORLD_SEA, worldFeatures, worldSpots,
} from '@/systems/WorldSystem';

const NOW = Date.UTC(2026, 10, 4, 3);
const ALL = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN, Nation.FR, Nation.SU, Nation.RM];

describe('0.0.66 外洋の第 2 段階 (#65)', () => {
  it('every navy has its own sea: two ports, three resource points and a stronghold held by its foe', () => {
    for (const n of ALL) {
      const f = worldFeatures(n);
      expect(f.filter((x) => x.kind === 'port').length, n).toBe(2);
      expect(f.filter((x) => x.kind === 'fort').length, n).toBe(1);
      expect(new Set(f.map((x) => x.kind))).toEqual(new Set(['port', 'oil', 'mine', 'convoy', 'fort']));
      expect(f.every((x) => x.x > 0 && x.x < 1000 && x.y > 0 && x.y < 1000), n).toBe(true);
      expect(WORLD_SEA[n]).toBeTruthy();
      expect(FORT_NATION[n]).not.toBe(n);
      // The places keep apart, so their marks never sit on each other.
      for (const a of f) for (const b of f) if (a !== b) expect(distance(a, b), `${n} ${a.id} ${b.id}`).toBeGreaterThan(FEATURE_CLEARANCE);
    }
    expect(worldFeatures(Nation.IJN).map((f) => f.name)).toContain('トラック泊地');
    expect(worldFeatures(Nation.RN)[0].x).not.toBe(worldFeatures(Nation.IJN)[0].x);
  });

  it('the hour\'s groups keep clear of the places, every hour', () => {
    for (const n of ALL) {
      const f = worldFeatures(n);
      for (let h = 0; h < 48; h++) {
        const spots = clearOfFeatures(worldSpots(NOW + h * 3_600_000, n, ALL), f);
        for (const s of spots) for (const p of f) expect(distance(s, p), `${n} ${h} ${s.id} ${p.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE);
      }
    }
  });

  it('a port refills the supply once an hour; it only needs the way there', () => {
    const port = worldFeatures(Nation.IJN).find((f) => f.kind === 'port')!;
    const v = { ...startVoyage(['a'], [null], Formation.LineAhead, NOW), supply: 30 };
    expect(featureProblem(v, port)).toBeNull();
    const w = callAtPort({ ...emptyWorld(), voyage: v }, port, NOW);
    expect(w.voyage).toMatchObject({ x: port.x, y: port.y, supply: SUPPLY_MAX });
    expect(featureReady(w, port, NOW)).toBe(false);
    expect(featureReady(w, port, NOW + 3_600_000)).toBe(true);
    expect(featureProblem({ ...v, supply: 1 }, port)).not.toBeNull();
  });

  it('resource points pay by their kind and danger, once an hour', () => {
    const oil = worldFeatures(Nation.IJN).find((f) => f.kind === 'oil')!;
    expect(resourceReward('oil', 4).fuel).toBe(240);
    expect(resourceReward('mine', 4)).toMatchObject({ fuel: 0, steel: 200 });
    const w = visitResource({ ...emptyWorld(), voyage: startVoyage(['a'], [null], Formation.LineAhead, NOW) }, oil, NOW);
    expect(featureReady(w, oil, NOW)).toBe(false);
  });

  it('a stronghold falls once a week and makes the water round it safer; it leaves the hour\'s groups as they were', () => {
    const f = worldFeatures(Nation.IJN);
    const fort = f.find((x) => x.kind === 'fort')!;
    let w = { ...emptyWorld(), voyage: startVoyage(['a'], [null], Formation.LineAhead, NOW) };
    w = afterBattle(w, '5:2', 3, true);
    w = afterBattle(w, fort.id, 9, true);
    expect(w.cleared).toEqual(['5:2']);
    w = takeFort(w, fort.id, NOW);
    expect(featureReady(w, fort, NOW)).toBe(false);
    expect(featureReady(w, fort, NOW + 8 * 86_400_000)).toBe(true);
    const safe = safeAround(w, f, NOW);
    expect(safeDanger({ x: fort.x, y: fort.y + 50, danger: 8 }, safe)).toBe(6);
    expect(safeDanger({ ...HOME, danger: 1 }, safe)).toBe(1);
    expect(safeAround(w, f, NOW + 8 * 86_400_000)).toEqual([]);
  });

  it('medals for port calls, resource runs and strongholds', async () => {
    const { MEDALS } = await import('@/systems/RecordSystem');
    for (const id of ['port_call', 'resource_run', 'fort_taken']) expect(MEDALS.some((m) => m.id.startsWith(id)), id).toBe(true);
  });
});
