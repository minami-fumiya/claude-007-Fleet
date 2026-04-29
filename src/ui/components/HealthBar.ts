import Phaser from 'phaser';
import { DEPTH_HUD } from '@/config/GameConstants';

export class HealthBar {
  private bg: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private readonly width: number;
  private readonly height: number;

  constructor(scene: Phaser.Scene, width = 60, height = 7, depth = DEPTH_HUD) {
    this.width = width;
    this.height = height;
    this.bg = scene.add.graphics().setDepth(depth);
    this.bar = scene.add.graphics().setDepth(depth);
  }

  update(current: number, max: number, cx: number, cy: number): void {
    const fraction = max > 0 ? Math.max(0, current / max) : 0;
    const barColor = fraction > 0.5 ? 0x44ff44 : fraction > 0.25 ? 0xffff00 : 0xff4444;

    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.55);
    this.bg.fillRect(cx - this.width / 2, cy, this.width, this.height);

    this.bar.clear();
    if (fraction > 0) {
      this.bar.fillStyle(barColor);
      this.bar.fillRect(cx - this.width / 2 + 1, cy + 1, (this.width - 2) * fraction, this.height - 2);
    }
  }

  destroy(): void {
    this.bg.destroy();
    this.bar.destroy();
  }
}
