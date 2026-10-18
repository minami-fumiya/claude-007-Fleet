import { describe, it, expect } from 'vitest';
import { BATTLE_WORLD, convoyEscortStart, enemySpawnPoints, ENEMY_SPACING, lineSlot, MAX_FLEET_SIZE, playerStart, START_GAP } from '@/systems/BattleLayout';

describe('BattleLayout', () => {
  it('is a square world', () => {
    expect(BATTLE_WORLD.w).toBe(BATTLE_WORLD.h);
  });

  it('starts the fleets START_GAP apart around the middle', () => {
    const p = playerStart();
    const [e] = enemySpawnPoints(1);
    expect(p.y - e.y).toBe(START_GAP);
    expect(p.x).toBe(BATTLE_WORLD.w / 2);
    expect(e.x).toBe(BATTLE_WORLD.w / 2);
  });

  it('alternates enemy slots left and right of the flagship', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(lineSlot)).toEqual([0, -1, 1, -2, 2, -3, 3, -4]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 15, 20])('spreads %i enemies inside the world without overlap', (n) => {
    const pts = enemySpawnPoints(n);
    expect(pts).toHaveLength(n);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(200);
      expect(p.x).toBeLessThan(BATTLE_WORLD.w - 200);
      expect(p.y).toBeGreaterThan(200);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(ENEMY_SPACING);
    }
  });

  it('leaves room astern for a full line-ahead fleet', () => {
    // Line ahead puts the 7th escort 630 px behind the flagship.
    expect(playerStart().y + 630).toBeLessThan(BATTLE_WORLD.h - 60);
    expect(convoyEscortStart().y + 630).toBeLessThan(BATTLE_WORLD.h - 60);
    expect(MAX_FLEET_SIZE).toBe(8);
  });
});
