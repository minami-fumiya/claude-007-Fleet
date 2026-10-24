import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { ITEMS } from '@/systems/GoldSystem';
import { loadProgress, saveProgress, walletOf } from '@/utils/ProgressStore';
import { useSupplyShip } from '@/systems/MoraleSystem';
import { withQuestEvents } from '@/systems/QuestSystem';
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
    const gap = IS_PORTRAIT ? 14 : 10;
    // Two columns in landscape: five items no longer fit one under another (#305).
    const cols = IS_PORTRAIT ? 1 : 2;
    const w = (CANVAS_W - left * 2 - gap * (cols - 1)) / cols;
    const minH = IS_PORTRAIT ? 170 : 150;
    const top = IS_PORTRAIT ? 160 : 100;
    const bw = IS_PORTRAIT ? 170 : 160;
    const textW = w - 40 - bw - 16;
    const wrap = { wordWrap: { width: textW, useAdvancedWrap: true } };
    // Each card is as tall as its text (#355: the gold card's three lines of sources ran past its bottom edge); a row
    // of two cards in landscape takes the taller one.
    const cards = ITEMS.map((item) => {
      const count = item.id === 'gold' ? walletOf(p).gold : p.items[item.id] ?? 0;
      const name = this.add.text(0, 0, item.name, textStyle(18, Css.text, { fontStyle: 'bold' }));
      const num = this.add.text(0, 0, `${count.toLocaleString('en-US')}${item.id === 'gold' ? ' G' : ' 個'}`, textStyle(18, count > 0 ? Css.gold : Css.dim, { fontStyle: 'bold' })).setOrigin(1, 0);
      const desc = this.add.text(0, 0, item.description, textStyle(13, Css.muted, wrap));
      const src = this.add.text(0, 0, `入手: ${item.sources.join('・')}`, textStyle(12, Css.cyan, wrap));
      const h = Math.max(minH, 14 + 34 + desc.height + 10 + src.height + 16);
      return { item, count, name, num, desc, src, h };
    });
    const rows: number[] = [];
    cards.forEach((c, i) => { const r = Math.floor(i / cols); rows[r] = Math.max(rows[r] ?? 0, c.h); });
    cards.forEach(({ item, count, name, num, desc, src }, i) => {
      const r = Math.floor(i / cols);
      const rowH = rows[r];
      const y = top + rows.slice(0, r).reduce((s, h) => s + h + gap, 0);
      const x = left + (i % cols) * (w + gap);
      const frame = drawPanel(this.add.graphics(), x, y, w, rowH, { radius: 16, fillAlpha: 0.6, rim: count > 0 ? Colors.gold : undefined, rimAlpha: count > 0 ? 0.5 : 0.15 });
      const tx = x + 20;
      name.setPosition(tx, y + 14);
      num.setPosition(tx + textW, y + 14);
      desc.setPosition(tx, y + 48);
      src.setPosition(tx, y + rowH - 16 - src.height);
      [name, num, desc, src].forEach((o) => o.setDepth(frame.depth + 1));
      // 給糧艦 (#54) is used right here, on every ship of the navy.
      const use = item.id === 'supplyShip' ? () => this.useSupplyShip() : () => this.scene.start(item.scene, { returnTo: SceneKeys.ITEMS });
      const btn = new UIButton(this, x + w - 20 - bw / 2, y + rowH / 2, item.use, use, {
        variant: 'primary', width: bw, height: IS_PORTRAIT ? 56 : 44, fontSize: 15,
      });
      if (item.id === 'supplyShip') btn.setEnabled(count > 0);
    });
  }

  private useSupplyShip(): void {
    const p = loadProgress();
    const now = Date.now();
    const next = useSupplyShip(p, p.ships, now);
    if (!next) return;
    saveProgress(withQuestEvents(next, [['supplyUse', 1]], now));
    this.scene.restart();
  }
}
