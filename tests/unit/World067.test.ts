import { describe, expect, it } from 'vitest';
import { Nation } from '@/types/Nation';
import { ALL_SCENARIOS } from '@/data/scenarios';
import { playableScenarios } from '@/systems/ScenarioSystem';
import {
  allyPatrol, clearOfFeatures, CONTROL_WINS, controlledRings, distance, emptyWorld, FEATURE_CLEARANCE, historicBattle, historicReady, HOME,
  parseWorld, patrolJoins, PATROL_RANGE, ringControlled, winHistoric, winInRing, worldFeatures, worldSpots,
} from '@/systems/WorldSystem';

const NOW = Date.UTC(2026, 10, 5, 3);
const ALL = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN, Nation.FR, Nation.SU, Nation.RM];

describe('0.0.67 外洋の第 3 段階 (#65)', () => {
  it('three wins in a ring in a week take its control, which lapses with the week', () => {
    let w = emptyWorld();
    for (let i = 0; i < CONTROL_WINS - 1; i++) w = winInRing(w, 4, NOW).world;
    expect(ringControlled(w, 4, NOW)).toBe(false);
    const took = winInRing(w, 4, NOW);
    expect(took.took).toBe(true);
    expect(controlledRings(took.world, NOW)).toEqual([4]);
    expect(winInRing(took.world, 4, NOW).took).toBe(false);
    expect(ringControlled(took.world, 4, NOW + 8 * 86_400_000)).toBe(false);
  });

  it('the patrol sits in rings 3 to 7, clear of the places, and joins fights near it', () => {
    for (const n of ALL) {
      const f = worldFeatures(n);
      for (let h = 0; h < 24; h++) {
        const p = allyPatrol(NOW + h * 3_600_000, f);
        expect(p.danger, `${n} ${h}`).toBeGreaterThanOrEqual(3);
        expect(p.danger, `${n} ${h}`).toBeLessThanOrEqual(7);
        for (const x of f) expect(distance(p, x), `${n} ${h} ${x.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE);
      }
    }
    const p = allyPatrol(NOW, worldFeatures(Nation.IJN));
    expect(patrolJoins(p, { x: p.x + PATROL_RANGE - 1, y: p.y })).toBe(true);
    expect(patrolJoins(p, { x: p.x + PATROL_RANGE + 1, y: p.y })).toBe(false);
  });

  it('one historical battle a day among those the navy fought, clear of the rest, won once a day', () => {
    for (const n of ALL) {
      const list = playableScenarios(ALL_SCENARIOS, n);
      expect(list.length, n).toBeGreaterThan(0);
      const f = worldFeatures(n);
      for (let d = 0; d < 14; d++) {
        const now = NOW + d * 86_400_000;
        const patrol = allyPatrol(now, f);
        const h = historicBattle(now, list, [...f, patrol, HOME])!;
        expect(list.map((s) => s.id), n).toContain(h.scenarioId);
        for (const x of [...f, patrol]) expect(distance(h, x), `${n} ${d} ${x.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE);
        const spots = clearOfFeatures(worldSpots(now, n, ALL), [...f, patrol, h]);
        for (const s of spots) expect(distance(s, h), `${n} ${d} ${s.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE);
      }
    }
    expect(historicBattle(NOW, [], [])).toBeNull();
    const w = winHistoric(emptyWorld(), NOW);
    expect(historicReady(w, NOW)).toBe(false);
    expect(historicReady(w, NOW + 86_400_000)).toBe(true);
  });

  it('old saves read with nothing held; the control and the day survive a save', () => {
    expect(parseWorld({}).control).toEqual({});
    const w = winHistoric(winInRing(emptyWorld(), 2, NOW).world, NOW);
    expect(parseWorld(JSON.parse(JSON.stringify(w)))).toMatchObject({ control: w.control, histDay: w.histDay });
  });

  it('medals for the rings held, the patrol and the historical battles', async () => {
    const { MEDALS } = await import('@/systems/RecordSystem');
    for (const id of ['world_control', 'patrol_win', 'historic_win']) expect(MEDALS.some((m) => m.id.startsWith(id)), id).toBe(true);
  });
});

describe('0.0.67 外洋の印は重ならない (#65)', () => {
  it('every hour for three weeks, each navy\'s groups keep clear of the places, the patrol, the historical battle and each other', () => {
    for (const n of ALL) {
      const list = playableScenarios(ALL_SCENARIOS, n);
      const f = worldFeatures(n);
      for (let h = 0; h < 24 * 21; h++) {
        const now = NOW + h * 3_600_000;
        const patrol = allyPatrol(now, f);
        const hist = historicBattle(now, list, [...f, patrol, HOME])!;
        const marks = [...f, patrol, hist];
        const spots = clearOfFeatures(worldSpots(now, n, ALL), marks);
        for (const s of spots) {
          for (const m of marks) expect(distance(s, m), `${n} ${h} ${s.id} ${m.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE);
          for (const o of spots) if (o !== s) expect(distance(s, o), `${n} ${h} ${s.id} ${o.id}`).toBeGreaterThanOrEqual(FEATURE_CLEARANCE * 0.6);
        }
      }
    }
  }, 120_000);
});
