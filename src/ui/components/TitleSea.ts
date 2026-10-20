import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W } from '@/config/GameConstants';
import { Colors } from '@/ui/theme';

/**
 * The title screen's sea (#198): night sky with drifting clouds and two slow searchlights, a horizon, waves that
 * roll towards the viewer, and a fleet in line ahead crossing with its wakes. Drawn with Graphics only. With
 * `still` (the OS asks for less motion, or the device can't keep up) it is drawn once and stops moving.
 */
export class TitleSea {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly far: Phaser.GameObjects.Graphics;
  private readonly waves: Phaser.GameObjects.Graphics;
  private readonly fleet: Phaser.GameObjects.Graphics;
  private t = 0;
  private still: boolean;
  private slowFor = 0;

  constructor(scene: Phaser.Scene, private readonly horizon: number, still: boolean) {
    this.sky = scene.add.graphics().setDepth(-30);
    this.far = scene.add.graphics().setDepth(-20);
    this.waves = scene.add.graphics().setDepth(-15);
    this.fleet = scene.add.graphics().setDepth(-10);
    this.still = still;
    this.draw();
  }

  /** Advances the scene; a device that stays under 30 fps for 3 s stops the motion (#99). */
  update(delta: number, fps: number): void {
    if (this.still) return;
    this.slowFor = fps < 30 ? this.slowFor + delta : 0;
    if (this.slowFor > 3000) this.still = true;
    this.t += delta / 1000;
    this.draw();
  }

  get moving(): boolean {
    return !this.still;
  }

  private draw(): void {
    const t = this.t;
    const h = this.horizon;
    // Sky: bands from deep night to the glow above the horizon.
    const sky = this.sky.clear();
    for (let i = 0; i < 12; i++) {
      sky.fillStyle(Phaser.Display.Color.GetColor(4 + i * 2, 12 + i * 3, 30 + i * 5), 1);
      sky.fillRect(0, (h / 12) * i, CANVAS_W, h / 12 + 1);
    }
    // Searchlights sweeping slowly from beyond the horizon.
    for (const [x0, phase] of [[CANVAS_W * 0.22, 0], [CANVAS_W * 0.78, 2.1]] as const) {
      const a = -Math.PI / 2 + Math.sin(t * 0.25 + phase) * 0.45;
      const len = h * 1.1;
      const spread = 0.05;
      sky.fillStyle(0xcfe8ff, 0.06);
      sky.fillTriangle(x0, h, x0 + Math.cos(a - spread) * len, h + Math.sin(a - spread) * len, x0 + Math.cos(a + spread) * len, h + Math.sin(a + spread) * len);
    }
    // Clouds drifting (the far layer moves slower: parallax).
    const far = this.far.clear();
    for (let i = 0; i < 6; i++) {
      const speed = i % 2 === 0 ? 6 : 11;
      const x = ((i * 260 + t * speed) % (CANVAS_W + 400)) - 200;
      const y = h * (0.18 + (i % 3) * 0.17);
      far.fillStyle(0x1a2c4d, i % 2 === 0 ? 0.35 : 0.5);
      far.fillEllipse(x, y, 260, 34);
      far.fillEllipse(x + 70, y - 12, 160, 28);
    }
    // Sea: darker towards the viewer, wave lines rolling down.
    const sea = this.waves.clear();
    sea.fillStyle(Colors.bgMid, 1);
    sea.fillRect(0, h, CANVAS_W, CANVAS_H - h);
    sea.lineStyle(1, 0x61e7ff, 0.5);
    sea.lineBetween(0, h, CANVAS_W, h);
    for (let i = 0; i < 14; i++) {
      const f = ((i + (t * 0.35) % 1) / 14);
      const y = h + Math.pow(f, 1.6) * (CANVAS_H - h);
      const amp = 2 + f * 9;
      sea.lineStyle(1 + f * 1.5, 0x61e7ff, 0.05 + f * 0.12);
      sea.beginPath();
      for (let x = 0; x <= CANVAS_W; x += 24) {
        const yy = y + Math.sin(x * (0.012 - f * 0.006) + t * (1 + f) + i) * amp;
        if (x === 0) sea.moveTo(x, yy);
        else sea.lineTo(x, yy);
      }
      sea.strokePath();
    }
    // The fleet in line ahead: battleship, carrier, cruiser, destroyers, crossing left to right.
    const g = this.fleet.clear();
    const lane = h + 18;
    // The fleet starts in view (its flagship a little past the middle) and wraps around after leaving.
    const head = ((t * 14 + CANVAS_W * 0.6 + 300) % (CANVAS_W + 900)) - 300;
    const ships: Array<[number, (x: number) => void]> = [
      [0, (x) => this.battleship(g, x, lane)],
      [-150, (x) => this.carrier(g, x, lane + 4)],
      [-290, (x) => this.cruiser(g, x, lane + 7)],
      [-390, (x) => this.destroyer(g, x, lane + 10)],
      [-470, (x) => this.destroyer(g, x, lane + 12)],
    ];
    for (const [off, drawShip] of ships) {
      const x = head + off;
      if (x < -200 || x > CANVAS_W + 200) continue;
      // Wake: a fading streak behind the stern.
      g.fillStyle(0xcfe8ff, 0.12);
      g.fillTriangle(x - 40, lane + 2 + (off === 0 ? 0 : -off / 60), x - 180, lane - 1 + (off === 0 ? 0 : -off / 60), x - 180, lane + 6 + (off === 0 ? 0 : -off / 60));
      drawShip(x);
    }
  }

  private hull(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, hgt: number): void {
    g.fillStyle(0x07101f, 1);
    g.fillPoints([new Phaser.Math.Vector2(x - len / 2, y - hgt), new Phaser.Math.Vector2(x + len / 2 + 10, y - hgt), new Phaser.Math.Vector2(x + len / 2, y), new Phaser.Math.Vector2(x - len / 2 + 6, y)], true);
  }

  private battleship(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    this.hull(g, x, y, 120, 8);
    g.fillRect(x - 30, y - 22, 40, 14);
    g.fillRect(x - 6, y - 38, 10, 16);
    g.fillRect(x + 24, y - 14, 18, 6);
    g.fillRect(x - 52, y - 14, 18, 6);
  }

  private carrier(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    this.hull(g, x, y, 110, 6);
    g.fillRect(x - 58, y - 12, 120, 5);
    g.fillRect(x + 22, y - 24, 10, 12);
  }

  private cruiser(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    this.hull(g, x, y, 80, 6);
    g.fillRect(x - 16, y - 16, 24, 10);
    g.fillRect(x - 4, y - 26, 6, 10);
  }

  private destroyer(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    this.hull(g, x, y, 50, 4);
    g.fillRect(x - 8, y - 11, 14, 7);
  }
}

/** True when the OS asks for less motion (視差効果を減らす). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}
