import Phaser from 'phaser';
import { DEPTH_SHIPS, DEPTH_WATER_FX } from '@/config/GameConstants';
import { IResolvedMap } from '@/types/Map';

/**
 * Draws a battle map: pale shoal water, islands (sand rim, green interior) and faint arrows showing
 * currents. Returns the static physics group of island circles for colliders.
 */
export function drawMap(scene: Phaser.Scene, map: IResolvedMap): Phaser.Physics.Arcade.StaticGroup {
  const water = scene.add.graphics().setDepth(DEPTH_WATER_FX - 2);
  for (const s of map.shoals) {
    water.fillStyle(0x3fb6c9, 0.16);
    water.fillCircle(s.x, s.y, s.r);
    water.lineStyle(1, 0x7fe0ee, 0.25);
    water.strokeCircle(s.x, s.y, s.r);
  }
  // Current arrows on a coarse grid inside each zone.
  water.lineStyle(1.5, 0xbfe6ff, 0.18);
  for (const z of map.currents) {
    const speed = Math.hypot(z.vx, z.vy);
    if (speed === 0) continue;
    const ux = z.vx / speed;
    const uy = z.vy / speed;
    for (let x = z.x + 60; x < z.x + z.w; x += 160) {
      for (let y = z.y + 60; y < z.y + z.h; y += 160) {
        const ex = x + ux * 34;
        const ey = y + uy * 34;
        water.lineBetween(x, y, ex, ey);
        water.lineBetween(ex, ey, ex - ux * 9 - uy * 6, ey - uy * 9 + ux * 6);
        water.lineBetween(ex, ey, ex - ux * 9 + uy * 6, ey - uy * 9 - ux * 6);
      }
    }
  }

  const land = scene.add.graphics().setDepth(DEPTH_SHIPS - 1);
  for (const island of map.islands) {
    for (const c of island) {
      land.fillStyle(0xd9c48f, 1);
      land.fillCircle(c.x, c.y, c.r);
    }
    for (const c of island) {
      land.fillStyle(0x4f7a43, 1);
      land.fillCircle(c.x, c.y, Math.max(4, c.r - 14));
    }
    for (const c of island) {
      land.fillStyle(0x3b6234, 1);
      land.fillCircle(c.x - c.r * 0.15, c.y - c.r * 0.15, Math.max(2, c.r * 0.45));
    }
  }

  const group = scene.physics.add.staticGroup();
  for (const island of map.islands) {
    for (const c of island) {
      const zone = scene.add.zone(c.x, c.y, c.r * 2, c.r * 2);
      scene.physics.add.existing(zone, true);
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      body.setCircle(c.r);
      group.add(zone);
    }
  }
  return group;
}
