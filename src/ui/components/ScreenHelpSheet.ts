import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { markHelpSeen, unseenHelp } from '@/systems/ScreenHelp';
import { loadSave, saveSave } from '@/utils/ProgressStore';
import { Colors, Css, displayStyle, textStyle } from '@/ui/theme';
import { addPanel, drawPanel, UIButton } from '@/ui/components/UIKit';

/** Above the screen's own sheets and overlays. */
const DEPTH = 390;

/**
 * Shows a screen's first-visit help (#61) the first time it opens, and records it as seen when closed.
 * Returns true when the sheet opened.
 */
export function showScreenHelp(scene: Phaser.Scene, id: string = scene.scene.key): boolean {
  const help = unseenHelp(loadSave().seenHelp, id);
  if (!help) return false;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T, depth = DEPTH): T => {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
    objs.push(o);
    return o;
  };
  const close = (): void => {
    for (const o of objs) o.destroy();
    const save = loadSave();
    saveSave({ ...save, seenHelp: markHelpSeen(save.seenHelp, id) });
  };
  // Swallows taps so the screen underneath doesn't react while the sheet is open.
  add(scene.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.55).setOrigin(0, 0).setInteractive());
  const w = IS_PORTRAIT ? CANVAS_W - 48 : 640;
  const pad = 28;
  const body = scene.add.text(0, 0, help.text, textStyle(IS_PORTRAIT ? 16 : 15, Css.text, { wordWrap: { width: w - pad * 2, useAdvancedWrap: true }, lineSpacing: 6 }));
  const bh = IS_PORTRAIT ? 60 : 46;
  const h = 104 + body.height + 24 + bh + 24;
  const x = (CANVAS_W - w) / 2;
  const y = (CANVAS_H - h) / 2;
  add(addPanel(scene, x, y, w, h, { radius: 24, fillAlpha: 0.97, glow: 0.9, rim: Colors.cyan, rimAlpha: 0.6 }));
  const strip = add(scene.add.graphics());
  drawPanel(strip, x + pad, y + 22, 8, 8, { radius: 4, fill: Colors.cyan, fillAlpha: 1, rimAlpha: 0 });
  add(scene.add.text(x + pad + 16, y + 26, 'はじめての画面', textStyle(12, Css.cyan, { fontStyle: 'bold' })).setOrigin(0, 0.5));
  add(scene.add.text(x + pad, y + 50, help.title, displayStyle(IS_PORTRAIT ? 24 : 22)));
  // Measured before the panel was drawn, so lift it above the panel.
  add(body.setPosition(x + pad, y + 104), DEPTH + 1);
  add(new UIButton(scene, CANVAS_W / 2, y + 104 + body.height + 24 + bh / 2, 'わかった', close, {
    variant: 'gold', width: IS_PORTRAIT ? w - pad * 2 : 240, height: bh, fontSize: IS_PORTRAIT ? 18 : 16,
  }));
  return true;
}
