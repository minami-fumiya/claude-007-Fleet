import Phaser from 'phaser';
import { DEPTH_HUD } from '@/config/GameConstants';
import { IStickVector, stickVector, distanceBetween } from '@/utils/MathUtils';

const BASE_COLOR = 0xffffff;
const BASE_ALPHA = 0.15;
const THUMB_ALPHA = 0.4;

/**
 * On-screen analog stick for touch devices.
 * Claims the first pointer that lands inside its activation zone and tracks it until release.
 */
export class VirtualJoystick {
  private readonly thumb: Phaser.GameObjects.Arc;
  private readonly cx: number;
  private readonly cy: number;
  private readonly radius: number;
  private readonly zoneRadius: number;
  private pointerId: number | null = null;
  private vector: IStickVector = { x: 0, y: 0, magnitude: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, radius = 70) {
    this.cx = x;
    this.cy = y;
    this.radius = radius;
    this.zoneRadius = radius * 1.8;

    scene.add
      .circle(x, y, radius, BASE_COLOR, BASE_ALPHA)
      .setStrokeStyle(2, BASE_COLOR, 0.35)
      .setDepth(DEPTH_HUD)
      .setScrollFactor(0);
    this.thumb = scene.add
      .circle(x, y, radius * 0.45, BASE_COLOR, THUMB_ALPHA)
      .setDepth(DEPTH_HUD + 1)
      .setScrollFactor(0);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  get value(): IStickVector {
    return this.vector;
  }

  /** True if the given pointer is driving (or would start driving) this joystick. */
  owns(pointer: Phaser.Input.Pointer): boolean {
    return pointer.id === this.pointerId || this.inZone(pointer);
  }

  private inZone(pointer: Phaser.Input.Pointer): boolean {
    return distanceBetween(this.cx, this.cy, pointer.x, pointer.y) <= this.zoneRadius;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId !== null || !this.inZone(pointer)) return;
    this.pointerId = pointer.id;
    this.track(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.pointerId) this.track(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector = { x: 0, y: 0, magnitude: 0 };
    this.thumb.setPosition(this.cx, this.cy);
  }

  private track(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.cx;
    const dy = pointer.y - this.cy;
    this.vector = stickVector(dx, dy, this.radius);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const k = dist > this.radius ? this.radius / dist : 1;
    this.thumb.setPosition(this.cx + dx * k, this.cy + dy * k);
  }
}
