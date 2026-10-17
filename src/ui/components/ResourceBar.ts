import Phaser from 'phaser';
import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS, RESOURCE_LABEL } from '@/systems/ResourceSystem';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawPanel } from '@/ui/components/UIKit';

const RESOURCE_COLOR: Record<keyof IResources, { color: number; css: string }> = {
  fuel: { color: Colors.success, css: Css.success },
  ammo: { color: Colors.gold, css: Css.gold },
  steel: { color: Colors.cyan, css: Css.cyan },
  bauxite: { color: 0xc58bff, css: '#c58bff' },
};

/** Four resource readouts in a row (or a 2×2 grid when `columns` is 2). Positioned by its top-left. */
export class ResourceBar {
  private values = new Map<keyof IResources, Phaser.GameObjects.Text>();

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, columns = 4, cellH = 52) {
    const gap = 8;
    const cw = (w - gap * (columns - 1)) / columns;
    RESOURCE_KEYS.forEach((k, i) => {
      const cx = x + (i % columns) * (cw + gap);
      const cy = y + Math.floor(i / columns) * (cellH + gap);
      const c = RESOURCE_COLOR[k];
      drawPanel(scene.add.graphics(), cx, cy, cw, cellH, { radius: 14, fillAlpha: 0.6, rim: c.color, rimAlpha: 0.35 });
      scene.add.text(cx + 14, cy + cellH / 2, RESOURCE_LABEL[k], eyebrowStyle(10, c.css)).setOrigin(0, 0.5);
      this.values.set(k, scene.add.text(cx + cw - 14, cy + cellH / 2, '', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0.5));
    });
  }

  refresh(r: IResources): void {
    for (const k of RESOURCE_KEYS) this.values.get(k)?.setText(String(r[k]));
  }
}
