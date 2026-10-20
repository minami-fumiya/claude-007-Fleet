import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { ITEMS } from '@/systems/GoldSystem';
import { loadProgress, walletOf } from '@/utils/ProgressStore';
import { Colors, Css, displayStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

/**
 * アイテム (#184): everything the admiral holds, from items.json — how many, what for, how they come, and a button
 * to where each is used.
 */
export class ItemScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.ITEMS });
  }

  create(): void {
    showScreenHelp(this);
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, 'アイテム', displayStyle(24)).setOrigin(0.5);
    const p = loadProgress();
    const left = IS_PORTRAIT ? 16 : 24;
    const w = CANVAS_W - left * 2;
    const rowH = IS_PORTRAIT ? 170 : 120;
    const gap = IS_PORTRAIT ? 14 : 10;
    const top = IS_PORTRAIT ? 160 : 100;
    const bw = IS_PORTRAIT ? 170 : 160;
    ITEMS.forEach((item, i) => {
      const y = top + i * (rowH + gap);
      const count = item.id === 'gold' ? walletOf(p).gold : p.items[item.id] ?? 0;
      drawPanel(this.add.graphics(), left, y, w, rowH, { radius: 16, fillAlpha: 0.6, rim: count > 0 ? Colors.gold : undefined, rimAlpha: count > 0 ? 0.5 : 0.15 });
      const tx = left + 20;
      const textW = w - 40 - bw - 16;
      this.add.text(tx, y + 14, item.name, textStyle(18, Css.text, { fontStyle: 'bold' }));
      this.add.text(tx + textW, y + 14, `${count.toLocaleString('en-US')}${item.id === 'gold' ? ' G' : ' 個'}`, textStyle(18, count > 0 ? Css.gold : Css.dim, { fontStyle: 'bold' })).setOrigin(1, 0);
      const wrap = { wordWrap: { width: textW, useAdvancedWrap: true } };
      this.add.text(tx, y + (IS_PORTRAIT ? 48 : 44), item.description, textStyle(13, Css.muted, wrap));
      this.add.text(tx, y + rowH - (IS_PORTRAIT ? 48 : 30), `入手: ${item.sources.join('・')}`, textStyle(12, Css.cyan, wrap));
      new UIButton(this, left + w - 20 - bw / 2, y + rowH / 2, item.use, () => this.scene.start(item.scene, { returnTo: SceneKeys.ITEMS }), {
        variant: 'primary', width: bw, height: IS_PORTRAIT ? 56 : 44, fontSize: 15,
      });
    });
  }
}
