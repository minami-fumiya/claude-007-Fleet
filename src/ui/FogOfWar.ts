import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, DEPTH_HUD } from '@/config/GameConstants';
import { conePolygon, VisionSource } from '@/systems/VisionSystem';

const FOG_COLOR = 0x020814;
const FOG_ALPHA = 0.55;
const BRUSH_KEY = 'fog-brush';
const BRUSH_SIZE = 256;

/**
 * Screen-space fog: a darkened layer over the sea with the player's vision (ship circles, recon
 * cones, aircraft) cut out of it every frame. Draws under the HUD and above the ships.
 */
export class FogOfWar {
  private rt: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;
  private cone: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly color = FOG_COLOR,
    private readonly alpha = FOG_ALPHA,
  ) {
    if (!scene.textures.exists(BRUSH_KEY)) {
      const tex = scene.textures.createCanvas(BRUSH_KEY, BRUSH_SIZE, BRUSH_SIZE)!;
      const ctx = tex.getContext();
      const r = BRUSH_SIZE / 2;
      // Soft edge: fully clear in the middle, fading out over the outer 25%.
      const grad = ctx.createRadialGradient(r, r, r * 0.75, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
      tex.refresh();
    }
    this.rt = scene.add.renderTexture(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH_HUD - 5);
    this.brush = scene.make.image({ key: BRUSH_KEY, add: false });
    this.cone = scene.make.graphics({}, false);
  }

  update(sources: VisionSource[]): void {
    const view = this.scene.cameras.main.worldView;
    this.rt.clear();
    this.rt.fill(this.color, this.alpha);
    this.cone.clear();
    this.cone.fillStyle(0xffffff, 1);
    for (const s of sources) {
      if (s.kind === 'circle') {
        this.brush.setPosition(s.x - view.x, s.y - view.y).setScale((s.radius * 2) / BRUSH_SIZE);
        this.rt.erase(this.brush);
      } else {
        const pts = conePolygon(s).map((p) => new Phaser.Math.Vector2(p.x - view.x, p.y - view.y));
        this.cone.fillPoints(pts, true);
      }
    }
    this.rt.erase(this.cone);
  }

  destroy(): void {
    this.rt.destroy();
    this.brush.destroy();
    this.cone.destroy();
  }
}
