import Phaser from 'phaser';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';

// ---------------------------------------------------------------------------
// Canvas-drawn textures (gradients and glows work in both WebGL and Canvas renderers)
// ---------------------------------------------------------------------------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

export type BackdropVariant = 'menu' | 'ocean';

/** Full-screen background: deep gradient, soft glows and a faint dot / chart grid. */
export function addBackdrop(scene: Phaser.Scene, variant: BackdropVariant = 'menu'): Phaser.GameObjects.Image {
  const key = makeCanvasTexture(scene, `ui-backdrop-${variant}`, CANVAS_W, CANVAS_H, (ctx) => {
    const w = CANVAS_W;
    const h = CANVAS_H;

    const base = ctx.createLinearGradient(0, 0, 0, h);
    if (variant === 'menu') {
      base.addColorStop(0, '#05142c');
      base.addColorStop(1, Css.bgDeep);
    } else {
      base.addColorStop(0, '#072447');
      base.addColorStop(1, '#03142b');
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const glow = (gx: number, gy: number, r: number, rgba: string): void => {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, rgba);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    if (variant === 'menu') {
      glow(w * 0.72, h * 0.42, 560, 'rgba(97,231,255,0.16)');
      glow(w * 0.12, h * 0.95, 480, 'rgba(79,140,255,0.14)');

      // Faint concentric "sonar" rings around the hero glow
      ctx.strokeStyle = 'rgba(97,231,255,0.06)';
      ctx.lineWidth = 2;
      for (const r of [220, 340, 470, 610]) {
        ctx.beginPath();
        ctx.arc(w * 0.72, h * 0.42, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(180,220,255,0.10)';
      for (let x = 16; x < w; x += 32) {
        for (let y = 16; y < h; y += 32) ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else {
      glow(w * 0.5, h * 0.55, 700, 'rgba(97,231,255,0.07)');

      // Nautical chart grid
      for (let x = 0; x <= w; x += 80) {
        ctx.strokeStyle = x % 320 === 0 ? 'rgba(160,210,255,0.10)' : 'rgba(160,210,255,0.045)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 80) {
        ctx.strokeStyle = y % 320 === 0 ? 'rgba(160,210,255,0.10)' : 'rgba(160,210,255,0.045)';
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }

      // Light surface ripples
      ctx.strokeStyle = 'rgba(200,235,255,0.05)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 140; i++) {
        const rx = Math.random() * w;
        const ry = Math.random() * h;
        const len = 10 + Math.random() * 26;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(rx + len / 2, ry - 4, rx + len, ry);
        ctx.stroke();
      }
    }

    // Vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  });

  return scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-10);
}

// ---------------------------------------------------------------------------
// Glass panel
// ---------------------------------------------------------------------------

export interface IPanelOptions {
  radius?: number;
  fill?: number;
  fillAlpha?: number;
  rim?: number;
  rimAlpha?: number;
  /** Outer glow strength 0..1 */
  glow?: number;
  dashed?: boolean;
}

/** Rounded translucent panel with a thin rim and optional outer glow. Drawn at (x, y) top-left. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: IPanelOptions = {},
): Phaser.GameObjects.Graphics {
  const r = opts.radius ?? 20;
  const rim = opts.rim ?? Colors.rim;
  const glow = opts.glow ?? 0;

  for (let i = 3; i >= 1 && glow > 0; i--) {
    g.lineStyle(i * 4, rim, 0.05 * glow);
    g.strokeRoundedRect(x - i, y - i, w + i * 2, h + i * 2, r + i);
  }

  g.fillStyle(opts.fill ?? Colors.panel, opts.fillAlpha ?? 0.72);
  g.fillRoundedRect(x, y, w, h, r);

  if (opts.dashed) {
    drawDashedRoundRect(g, x, y, w, h, r, rim, opts.rimAlpha ?? 0.3);
  } else {
    g.lineStyle(1.5, rim, opts.rimAlpha ?? 0.28);
    g.strokeRoundedRect(x, y, w, h, r);
  }
  return g;
}

function drawDashedRoundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: number,
  alpha: number,
): void {
  g.lineStyle(1.5, color, alpha);
  const dash = 8;
  const gap = 6;
  const seg = (x1: number, y1: number, x2: number, y2: number): void => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.floor(len / (dash + gap));
    for (let i = 0; i <= steps; i++) {
      const t1 = (i * (dash + gap)) / len;
      const t2 = Math.min(1, (i * (dash + gap) + dash) / len);
      g.lineBetween(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1, x1 + (x2 - x1) * t2, y1 + (y2 - y1) * t2);
    }
  };
  seg(x + r, y, x + w - r, y);
  seg(x + r, y + h, x + w - r, y + h);
  seg(x, y + r, x, y + h - r);
  seg(x + w, y + r, x + w, y + h - r);
  const corner = (cx: number, cy: number, start: number): void => {
    g.beginPath();
    g.arc(cx, cy, r, start, start + Math.PI / 2);
    g.strokePath();
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
}

export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: IPanelOptions = {},
): Phaser.GameObjects.Graphics {
  return drawPanel(scene.add.graphics(), x, y, w, h, opts);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'danger';

const BTN_PAD = 24;

const BUTTON_GRADIENTS: Record<ButtonVariant, [string, string] | null> = {
  primary: ['#7ff3ff', '#4f8cff'],
  gold: ['#ffd76a', '#ff9d3c'],
  danger: ['#ff8a9c', '#e0405e'],
  secondary: null,
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: Css.ink,
  gold: '#2a1600',
  danger: '#ffffff',
  secondary: Css.text,
};

function buttonTexture(scene: Phaser.Scene, variant: ButtonVariant, w: number, h: number): string {
  const r = Math.min(18, h / 2);
  return makeCanvasTexture(scene, `ui-btn-${variant}-${w}x${h}`, w + BTN_PAD * 2, h + BTN_PAD * 2, (ctx) => {
    const x = BTN_PAD;
    const y = BTN_PAD;
    const grad = BUTTON_GRADIENTS[variant];

    if (grad) {
      ctx.save();
      ctx.shadowColor = grad[1];
      ctx.shadowBlur = 22;
      const fill = ctx.createLinearGradient(x, y, x + w, y + h);
      fill.addColorStop(0, grad[0]);
      fill.addColorStop(1, grad[1]);
      ctx.fillStyle = fill;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.restore();

      // Glossy top highlight
      const gloss = ctx.createLinearGradient(0, y, 0, y + h);
      gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
      gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(11,29,56,0.85)';
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(97,231,255,0.35)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
      ctx.stroke();
    }
  });
}

export interface IButtonOptions {
  variant?: ButtonVariant;
  width?: number;
  height?: number;
  fontSize?: number;
  /** Optional small letter-spaced line under the label, e.g. an English caption */
  caption?: string;
}

/** Pill button with gradient fill, glow and press feedback. Positioned by its centre. */
export class UIButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private enabledState = true;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: IButtonOptions = {}) {
    super(scene, x, y);
    const variant = opts.variant ?? 'primary';
    const w = opts.width ?? 240;
    const h = opts.height ?? 60;

    this.bg = scene.add.image(0, 0, buttonTexture(scene, variant, w, h));
    this.label = scene.add
      .text(0, opts.caption ? -7 : 0, text, textStyle(opts.fontSize ?? 20, BUTTON_TEXT[variant], { fontStyle: 'bold' }))
      .setOrigin(0.5);
    this.add([this.bg, this.label]);

    if (opts.caption) {
      const cap = scene.add
        .text(0, 14, opts.caption, eyebrowStyle(10, BUTTON_TEXT[variant]))
        .setOrigin(0.5)
        .setAlpha(0.75);
      this.add(cap);
    }

    this.setSize(w, h);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => this.enabledState && this.setScale(1.03));
    this.on('pointerout', () => {
      this.pressed = false;
      this.setScale(1);
    });
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      this.pressed = true;
      this.setScale(0.97);
    });
    this.on('pointerup', () => {
      if (!this.enabledState || !this.pressed) return;
      this.pressed = false;
      this.setScale(1);
      onClick();
    });

    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this.enabledState = enabled;
    this.setAlpha(enabled ? 1 : 0.38);
    if (!enabled) this.setScale(1);
    return this;
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }
}

/**
 * Makes a container whose children are laid out from its top-left corner clickable over (0,0)-(w,h).
 * Phaser centres a container's hit area on its position, so the rectangle is shifted by half its size.
 */
export function makeClickable(container: Phaser.GameObjects.Container, w: number, h: number): void {
  container.setSize(w, h);
  container.setInteractive(new Phaser.Geom.Rectangle(w / 2, h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  if (container.input) container.input.cursor = 'pointer';
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** Rounded pill badge. Positioned by its left edge / vertical centre. */
export function addChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number,
  cssColor: string,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, text, eyebrowStyle(10, cssColor)).setOrigin(0, 0.5);
  const w = label.width + 18;
  const h = 20;
  const g = scene.add.graphics();
  g.fillStyle(color, 0.14);
  g.fillRoundedRect(0, -h / 2, w, h, h / 2);
  g.lineStyle(1, color, 0.45);
  g.strokeRoundedRect(0, -h / 2, w, h, h / 2);
  label.setX(9);
  return scene.add.container(x, y, [g, label]);
}

export interface IStatCard {
  container: Phaser.GameObjects.Container;
  value: Phaser.GameObjects.Text;
}

/** Glass card with a small caps label and a large value. Top-left anchored. */
export function addStatCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: string = Css.text,
): IStatCard {
  const g = drawPanel(scene.add.graphics(), 0, 0, w, h, { radius: 14, fillAlpha: 0.78 });
  const l = scene.add.text(14, 10, label, eyebrowStyle(10, Css.muted));
  const v = scene.add.text(14, h - 10, value, textStyle(22, valueColor, { fontStyle: 'bold' })).setOrigin(0, 1);
  const container = scene.add.container(x, y, [g, l, v]);
  return { container, value: v };
}

/** Horizontal rounded meter, used for ship stats. */
export function drawMeter(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
  color: number,
): void {
  const f = Phaser.Math.Clamp(fraction, 0, 1);
  g.fillStyle(0xffffff, 0.08);
  g.fillRoundedRect(x, y, w, h, h / 2);
  if (f > 0) {
    g.fillStyle(color, 0.95);
    g.fillRoundedRect(x, y, Math.max(h, w * f), h, h / 2);
  }
}
