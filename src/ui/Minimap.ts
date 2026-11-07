import Phaser from 'phaser';
import { DEPTH_HUD } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { Colors } from '@/ui/theme';
import { drawPanel } from '@/ui/components/UIKit';
import { IResolvedMap } from '@/types/Map';

/**
 * Corner overview of the whole sea: the camera's view box, friendly ships (blue), enemies the player
 * can see (red). Redrawn every frame into one Graphics object fixed to the screen.
 */
export class Minimap {
  private g: Phaser.GameObjects.Graphics;
  private readonly scale: number;
  private land: Phaser.GameObjects.Graphics | null = null;
  /** World pixel at the minimap's top-left: 0 for a battle sea, the window's corner on the open sea (#445) */
  private ox = 0;
  private oy = 0;
  private readonly worldW: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    width: number,
    worldW: number,
    private readonly worldH: number,
  ) {
    this.scale = width / worldW;
    this.worldW = worldW;
    const h = worldH * this.scale;
    drawPanel(scene.add.graphics(), x - 4, y - 4, width + 8, h + 8, { radius: 10, fillAlpha: 0.7, rimAlpha: 0.35 })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 1);
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD + 2);
  }

  /** Static land masses, drawn once under the ship dots. */
  drawIslands(map: IResolvedMap, landRects: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = []): void {
    this.land?.destroy();
    const land = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD + 1);
    this.land = land;
    land.fillStyle(0x6f8f5a, 0.9);
    const k = this.scale;
    const w = this.worldW * k;
    const h = this.worldH * k;
    for (const r of landRects) land.fillRect(this.x + (r.x - this.ox) * k, this.y + (r.y - this.oy) * k, r.w * k, r.h * k);
    for (const island of map.islands) {
      for (const c of island) {
        const x = (c.x - this.ox) * k;
        const y = (c.y - this.oy) * k;
        const r = Math.max(1.5, c.r * k);
        // Only what fits inside the panel (the open sea's window, #445).
        if (x - r < 0 || y - r < 0 || x + r > w || y + r > h) continue;
        land.fillCircle(this.x + x, this.y + y, r);
      }
    }
  }

  /**
   * The open sea (#445): the minimap shows the window of sectors whose top-left is (ox, oy), redrawn when it moves.
   * Land sectors come as whole rectangles; `map` holds the islands of the sea sectors.
   */
  setWindow(ox: number, oy: number, map: IResolvedMap, landRects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): void {
    this.ox = ox;
    this.oy = oy;
    this.drawIslands(map, landRects);
  }

  get height(): number {
    return this.worldH * this.scale;
  }

  update(friendlies: BaseShip[], enemies: BaseShip[], seen: Set<BaseShip>): void {
    const g = this.g;
    const k = this.scale;
    g.clear();
    const view = this.scene.cameras.main.worldView;
    const ox = this.ox;
    const oy = this.oy;
    g.lineStyle(1, Colors.cyan, 0.5);
    g.strokeRect(this.x + (view.x - ox) * k, this.y + (view.y - oy) * k, view.width * k, view.height * k);
    for (const s of friendlies) {
      if (!s.isAlive) continue;
      g.fillStyle(Colors.blue, s.submerged ? 0.5 : 1);
      g.fillCircle(this.x + (s.x - ox) * k, this.y + (s.y - oy) * k, 2.5);
    }
    g.fillStyle(Colors.danger, 1);
    for (const s of enemies) {
      if (s.isAlive && seen.has(s)) g.fillCircle(this.x + (s.x - ox) * k, this.y + (s.y - oy) * k, 2.5);
    }
  }
}
