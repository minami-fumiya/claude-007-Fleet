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

  update(current: number, max: number, cx: number, cy: number, overrideColor?: number): void {
    const fraction = max > 0 ? Math.max(0, current / max) : 0;
    const barColor =
      overrideColor ??
      (fraction > 0.5 ? 0x5df2b0 : fraction > 0.25 ? 0xffc94a : 0xff5f7a);

    this.bg.clear();
    const r = this.height / 2;
    this.bg.fillStyle(0x020814, 0.7);
    this.bg.fillRoundedRect(cx - this.width / 2, cy, this.width, this.height, r);

    this.bar.clear();
    if (fraction > 0) {
      this.bar.fillStyle(barColor);
      const innerH = this.height - 2;
      this.bar.fillRoundedRect(
        cx - this.width / 2 + 1,
        cy + 1,
        Math.max(innerH, (this.width - 2) * fraction),
        innerH,
        innerH / 2,
      );
    }
  }

  destroy(): void {
    this.bg.destroy();
    this.bar.destroy();
  }
}
