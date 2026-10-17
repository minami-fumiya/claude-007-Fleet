import Phaser from 'phaser';
import { DEPTH_HUD } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { Colors } from '@/ui/theme';
import { drawPanel } from '@/ui/components/UIKit';

/**
 * Corner overview of the whole sea: the camera's view box, friendly ships (blue), enemies the player
 * can see (red). Redrawn every frame into one Graphics object fixed to the screen.
 */
export class Minimap {
  private g: Phaser.GameObjects.Graphics;
  private readonly scale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    width: number,
    worldW: number,
    private readonly worldH: number,
  ) {
    this.scale = width / worldW;
    const h = worldH * this.scale;
    drawPanel(scene.add.graphics(), x - 4, y - 4, width + 8, h + 8, { radius: 10, fillAlpha: 0.7, rimAlpha: 0.35 })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 1);
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD + 2);
  }

  get height(): number {
    return this.worldH * this.scale;
  }

  update(friendlies: BaseShip[], enemies: BaseShip[], seen: Set<BaseShip>): void {
    const g = this.g;
    const k = this.scale;
    g.clear();
    const view = this.scene.cameras.main.worldView;
    g.lineStyle(1, Colors.cyan, 0.5);
    g.strokeRect(this.x + view.x * k, this.y + view.y * k, view.width * k, view.height * k);
    for (const s of friendlies) {
      if (!s.isAlive) continue;
      g.fillStyle(Colors.blue, s.submerged ? 0.5 : 1);
      g.fillCircle(this.x + s.x * k, this.y + s.y * k, 2.5);
    }
    g.fillStyle(Colors.danger, 1);
    for (const s of enemies) {
      if (s.isAlive && seen.has(s)) g.fillCircle(this.x + s.x * k, this.y + s.y * k, 2.5);
    }
  }
}
