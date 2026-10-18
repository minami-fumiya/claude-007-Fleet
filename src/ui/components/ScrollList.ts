import Phaser from 'phaser';
import { Colors } from '@/ui/theme';
import {
  canScroll,
  clampScroll,
  IPointerSample,
  isDrag,
  releaseVelocity,
  scrollIntoView,
  stepInertia,
  thumbMetrics,
  VELOCITY_WINDOW_MS,
} from '@/utils/ScrollMath';

export interface IScrollListOptions {
  /** Viewport, in world coordinates (the list scrolls with the camera like any other object). */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Called with the part of a drag or wheel turn the list cannot use because it is at an end
   * (or too short to scroll), in offset px, so an enclosing scrolling page can take it.
   */
  onOverscroll?: (dy: number) => void;
  /**
   * Screen band (game px) where the viewport is actually visible. Presses outside it, e.g. on
   * fixed header / footer bars drawn over a scrolling page, are not handled by the list.
   */
  screenClip?: { top: number; bottom: number };
  /** Draw the slim scrollbar on the right edge (default true) */
  scrollbar?: boolean;
}

interface IItem {
  obj: Phaser.GameObjects.Container;
  h: number;
}

const BAR_W = 4;
const BAR_INSET = 5;

/**
 * A masked, vertically scrolling list: touch drag with inertia, mouse wheel and a slim scrollbar.
 * Items are containers laid out from their top-left inside `content` (y = 0 is the top of the list).
 * Taps on items fire only when the press did not turn into a scroll drag, and only inside the viewport,
 * so rows scrolled out of view never catch taps meant for the controls around the list.
 */
export class ScrollList {
  /** Holds the rows; positioned so that content y = 0 sits at the top of the viewport. */
  readonly content: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly opts: IScrollListOptions;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly bar: Phaser.GameObjects.Graphics | null;
  private items: IItem[] = [];
  private contentH = 0;
  private scroll = 0;
  private velocity = 0;
  /** Current press started inside the viewport */
  private gesture = false;
  /** Current press has moved far enough to be a scroll, so it is not a tap */
  private dragging = false;
  /** Current press caught a gliding list: it only stops the glide, it is not a tap */
  private caughtGlide = false;
  private startX = 0;
  private startY = 0;
  private startOffset = 0;
  private overscrolled = 0;
  private samples: IPointerSample[] = [];
  private pressed: Phaser.GameObjects.Container | null = null;
  private destroyed = false;

  constructor(scene: Phaser.Scene, opts: IScrollListOptions) {
    this.scene = scene;
    this.opts = opts;
    this.content = scene.add.container(opts.x, opts.y);
    this.maskShape = scene.make.graphics({}, false);
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.fillRect(opts.x, opts.y, opts.w, opts.h);
    this.content.setMask(this.maskShape.createGeometryMask());
    this.bar = opts.scrollbar === false ? null : scene.add.graphics();

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', this.detach, this);
    this.layout();
  }

  get offset(): number {
    return this.scroll;
  }

  /** True while the current press is a scroll drag (taps should be ignored). */
  get isDragging(): boolean {
    return this.dragging;
  }

  /** Adds a non-interactive object to the content. */
  add(obj: Phaser.GameObjects.GameObject): this {
    this.content.add(obj);
    return this;
  }

  /**
   * Adds a row laid out from its top-left at content y = `obj.y`, `w` x `h` px, that calls `onTap`
   * when tapped (not dragged) inside the viewport.
   */
  addItem(obj: Phaser.GameObjects.Container, w: number, h: number, onTap: () => void): this {
    this.content.add(obj);
    this.items.push({ obj, h });
    obj.setSize(w, h);
    // Phaser centres a container's hit area on its position (see makeClickable), hence the shift.
    obj.setInteractive(
      new Phaser.Geom.Rectangle(w / 2, h / 2, w, h),
      (rect: Phaser.Geom.Rectangle, lx: number, ly: number) =>
        Phaser.Geom.Rectangle.Contains(rect, lx, ly) && this.insideViewportY(this.content.y + obj.y + ly - h / 2),
    );
    if (obj.input) obj.input.cursor = 'pointer';
    obj.on('pointerdown', () => {
      this.pressed = obj;
    });
    obj.on('pointerup', () => {
      const tapped = this.pressed === obj && !this.dragging && !this.caughtGlide;
      this.pressed = null;
      if (tapped) onTap();
    });
    this.layout();
    return this;
  }

  /** Total height of the rows; defaults to the bottom of the lowest item. */
  setContentHeight(h: number): this {
    this.contentH = h;
    this.setOffset(this.scroll);
    return this;
  }

  /** Removes (destroys) every row; the offset is kept and re-clamped on the next setContentHeight. */
  clear(): this {
    this.content.removeAll(true);
    this.items = [];
    this.pressed = null;
    return this;
  }

  setOffset(offset: number): this {
    this.scroll = clampScroll(offset, this.contentH, this.opts.h);
    this.layout();
    return this;
  }

  /** Scrolls the least amount that shows the row at content y `top` (height `h`) in full. */
  reveal(top: number, h: number): this {
    return this.setOffset(scrollIntoView(this.scroll, top, h, this.contentH, this.opts.h));
  }

  /** Draws the rows and scrollbar at `depth`, e.g. inside an overlay sheet. */
  setDepth(depth: number): this {
    this.content.setDepth(depth);
    this.bar?.setDepth(depth + 1);
    return this;
  }

  /** Whether a pointer is over the visible part of the viewport. */
  contains(pointer: Phaser.Input.Pointer): boolean {
    const clip = this.opts.screenClip;
    if (clip && (pointer.y < clip.top || pointer.y > clip.bottom)) return false;
    const p = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const o = this.opts;
    return p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h;
  }

  /** True when the current press started in the list, so an enclosing page should leave it alone. */
  ownsGesture(): boolean {
    return this.gesture;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.detach();
    this.content.clearMask(true);
    this.content.destroy();
    this.bar?.destroy();
  }

  /** Drops the input / update listeners (on scene shutdown the scene destroys the objects itself). */
  private detach(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('wheel', this.onWheel, this);
    this.scene.events.off('update', this.tick, this);
    this.scene.events.off('shutdown', this.detach, this);
    // Not on the display list, so the scene would not destroy it.
    this.maskShape.destroy();
  }

  // -------------------------------------------------------------------------

  private insideViewportY(worldY: number): boolean {
    return worldY >= this.opts.y && worldY <= this.opts.y + this.opts.h;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.dragging = false;
    this.gesture = this.contains(pointer);
    this.caughtGlide = this.gesture && Math.abs(this.velocity) > 0.1;
    if (!this.gesture) return;
    this.velocity = 0;
    this.startX = pointer.x;
    this.startY = pointer.y;
    this.startOffset = this.scroll;
    this.overscrolled = 0;
    this.samples = [{ t: pointer.downTime, y: pointer.y }];
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.gesture || !pointer.isDown) return;
    const now = pointer.moveTime;
    this.samples.push({ t: now, y: pointer.y });
    this.samples = this.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS * 2);
    if (!this.dragging) {
      if (!isDrag(pointer.x - this.startX, pointer.y - this.startY)) return;
      // Start scrolling from here so the list does not jump by the threshold.
      this.dragging = true;
      this.pressed = null;
      this.startY = pointer.y;
      this.startOffset = this.scroll;
    }
    const desired = this.startOffset - (pointer.y - this.startY);
    this.setOffset(desired);
    // Hand the part the list cannot use to the page around it.
    const excess = desired - this.scroll;
    if (this.opts.onOverscroll && excess !== this.overscrolled) this.opts.onOverscroll(excess - this.overscrolled);
    this.overscrolled = excess;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (this.gesture && this.dragging) {
      this.velocity = releaseVelocity(this.samples, pointer.upTime);
    }
    this.gesture = false;
    this.samples = [];
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!this.contains(pointer)) return;
    this.velocity = 0;
    const desired = this.scroll + dy;
    this.setOffset(desired);
    const excess = desired - this.scroll;
    if (excess !== 0) this.opts.onOverscroll?.(excess);
  }

  private tick(_time: number, delta: number): void {
    if (this.velocity === 0 || this.gesture) return;
    const step = stepInertia(this.scroll, this.velocity, delta, this.contentH, this.opts.h);
    this.velocity = step.velocity;
    this.setOffset(step.offset);
  }

  private layout(): void {
    const o = this.opts;
    this.content.setY(o.y - this.scroll);
    // Skip rendering rows that are fully out of view.
    for (const { obj, h } of this.items) {
      obj.setVisible(obj.y + h > this.scroll && obj.y < this.scroll + o.h);
    }
    if (!this.bar) return;
    this.bar.clear();
    if (!canScroll(this.contentH, o.h)) return;
    const trackH = o.h - BAR_INSET * 2;
    const x = o.x + o.w - BAR_INSET - BAR_W;
    const thumb = thumbMetrics(this.scroll, this.contentH, o.h, trackH);
    this.bar.fillStyle(0xffffff, 0.06);
    this.bar.fillRoundedRect(x, o.y + BAR_INSET, BAR_W, trackH, BAR_W / 2);
    this.bar.fillStyle(Colors.cyan, this.dragging || this.velocity !== 0 ? 0.9 : 0.55);
    this.bar.fillRoundedRect(x, o.y + BAR_INSET + thumb.y, BAR_W, thumb.h, BAR_W / 2);
  }
}
