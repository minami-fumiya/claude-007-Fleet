import { describe, it, expect } from 'vitest';
import { avoidHeading, clearAhead, clearSpawn, currentAt, inShoal, onIsland, resolveMap } from '@/systems/MapSystem';
import { IMapData } from '@/types/Map';
import { BATTLE_WORLD, enemySpawnPoints, lineAtSea, playerStart } from '@/systems/BattleLayout';
import archipelago from '@/data/maps/archipelago.json';
import strait from '@/data/maps/strait.json';
import atoll from '@/data/maps/atoll.json';
import convoy from '@/data/maps/convoy-route.json';
import openSea from '@/data/maps/open-sea.json';

const map: IMapData = {
  id: 't',
  name: 't',
  islands: [[{ x: 0.5, y: 0.5, r: 0.1 }]],
  shoals: [{ x: 0.2, y: 0.2, r: 0.05 }],
  currents: [{ x: 0, y: 0, w: 0.5, h: 1, vx: 10, vy: -5 }],
};
const m = resolveMap(map, 2000, 1000);

describe('MapSystem', () => {
  it('resolves normalised coordinates against the world', () => {
    expect(m.islands[0][0]).toEqual({ x: 1000, y: 500, r: 100 });
    expect(m.currents[0]).toEqual({ x: 0, y: 0, w: 1000, h: 1000, vx: 10, vy: -5 });
  });

  it('reports currents and shoals by position', () => {
    expect(currentAt(m, 100, 100)).toEqual({ vx: 10, vy: -5 });
    expect(currentAt(m, 1500, 100)).toEqual({ vx: 0, vy: 0 });
    expect(inShoal(m, 400, 200)).toBe(true);
    expect(inShoal(m, 1500, 900)).toBe(false);
  });

  it('detects land with a margin', () => {
    expect(onIsland(m, 1000, 500)).toBe(true);
    expect(onIsland(m, 1150, 500)).toBe(false);
    expect(onIsland(m, 1150, 500, 60)).toBe(true);
  });

  it('checks the way ahead and steers around land', () => {
    // Heading east (90°) from x=800 runs into the island at x=900..1100.
    expect(clearAhead(m, 800, 500, 90, 200)).toBe(false);
    expect(clearAhead(m, 800, 500, 0, 200)).toBe(true);
    const h = avoidHeading(m, 800, 500, 90);
    expect(h).not.toBe(90);
    expect(clearAhead(m, 800, 500, h, 170)).toBe(true);
    expect(avoidHeading(m, 800, 100, 90)).toBe(90);
  });

  it('moves spawns off islands', () => {
    const p = clearSpawn(m, 1000, 500);
    expect(onIsland(m, p.x, p.y, 60)).toBe(false);
    expect(clearSpawn(m, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  it('keeps spawns apart from ships already placed', () => {
    const taken: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 8; i++) taken.push(clearSpawn(m, 1000, 500, 60, taken, 110));
    for (const p of taken) expect(onIsland(m, p.x, p.y, 60)).toBe(false);
    for (let i = 0; i < taken.length; i++) {
      for (let j = i + 1; j < taken.length; j++) expect(Math.hypot(taken[i].x - taken[j].x, taken[i].y - taken[j].y)).toBeGreaterThanOrEqual(110);
    }
  });

  it.each([archipelago, strait, atoll, convoy, openSea] as IMapData[])('$id keeps the spawn areas at sea', (data) => {
    const { w, h } = BATTLE_WORLD;
    const r = resolveMap(data, w, h);
    // Player fleet starts south of the middle (escorts astern), enemies in a line north of it.
    const p = playerStart();
    for (let k = 0; k <= 7; k++) expect(onIsland(r, p.x, p.y + k * 90, 60), `${data.id} player ${k}`).toBe(false);
    // The enemy line shifts north / south as a whole to get off land; the gap to the player stays sensible.
    for (const n of [1, 3, 8]) {
      const line = lineAtSea(r, enemySpawnPoints(n));
      for (const e of line) expect(onIsland(r, e.x, e.y, 60), `${data.id} enemy ${n}`).toBe(false);
      const gap = p.y - line[0].y;
      expect(gap, `${data.id} gap`).toBeGreaterThan(900);
      expect(gap, `${data.id} gap`).toBeLessThan(2000);
    }
  });
});
