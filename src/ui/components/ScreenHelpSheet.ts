import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { markHelpSeen, pageLabel, unseenHelp } from '@/systems/ScreenHelp';
import { withQuestEvents } from '@/systems/QuestSystem';
import { isStarted, loadProgress, loadSave, saveProgress, saveSave } from '@/utils/ProgressStore';
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
  const style = textStyle(IS_PORTRAIT ? 16 : 15, Css.text, { wordWrap: { width: w - pad * 2, useAdvancedWrap: true }, lineSpacing: 6 });
  // Pages (#421): the sheet is as tall as its tallest page, so ‹ › never move.
  const pages = help.pages;
  const bodies = pages.map((pg) => scene.add.text(0, 0, pg.text, style).setVisible(false));
  const bodyH = Math.max(...bodies.map((b) => b.height));
  const bh = IS_PORTRAIT ? 60 : 46;
  const headH = 136;
  const h = headH + bodyH + 24 + bh + 24;
  const x = (CANVAS_W - w) / 2;
  const y = (CANVAS_H - h) / 2;
  add(addPanel(scene, x, y, w, h, { radius: 24, fillAlpha: 0.97, glow: 0.9, rim: Colors.cyan, rimAlpha: 0.6 }));
  const strip = add(scene.add.graphics());
  drawPanel(strip, x + pad, y + 22, 8, 8, { radius: 4, fill: Colors.cyan, fillAlpha: 1, rimAlpha: 0 });
  add(scene.add.text(x + pad + 16, y + 26, 'はじめての画面', textStyle(12, Css.cyan, { fontStyle: 'bold' })).setOrigin(0, 0.5));
  add(scene.add.text(x + pad, y + 50, help.title, displayStyle(IS_PORTRAIT ? 24 : 22)));
  const heading = add(scene.add.text(x + pad, y + 96, '', textStyle(15, Css.gold, { fontStyle: 'bold' })), DEPTH + 1);
  // Measured before the panel was drawn, so lift them above the panel.
  for (const b of bodies) add(b.setPosition(x + pad, y + headH), DEPTH + 1);
  const by = y + headH + bodyH + 24 + bh / 2;
  const navW = IS_PORTRAIT ? 140 : 110;
  let page = 0;
  // Read on to the end (#425): ‹ back, and one button that reads 次へ › until the last page, then 閉じる; ✕ in the
  // corner closes early (the help stays 未読 in ヘルプ › 画面).
  const prev = pages.length > 1 ? add(new UIButton(scene, x + pad + navW / 2, by, '‹ 前へ', () => show(page - 1), { variant: 'secondary', width: navW, height: bh, fontSize: 16 })) : null;
  const mainW = IS_PORTRAIT ? (pages.length > 1 ? w - pad * 2 - navW - 12 : w - pad * 2) : 240;
  const mainX = pages.length > 1 && IS_PORTRAIT ? x + pad + navW + 12 + mainW / 2 : pages.length > 1 ? x + w - pad - mainW / 2 : CANVAS_W / 2;
  const main = add(new UIButton(scene, mainX, by, '', () => (page < pages.length - 1 ? show(page + 1) : close()), { variant: 'gold', width: mainW, height: bh, fontSize: IS_PORTRAIT ? 18 : 16 }));
  const xs = IS_PORTRAIT ? 52 : 40;
  add(new UIButton(scene, x + w - pad / 2 - xs / 2 - 4, y + 26, '✕', close, { variant: 'secondary', width: xs, height: xs, fontSize: 15 }));
  const counter = pages.length > 1 ? add(scene.add.text(x + w - pad - xs - 12, y + 50, '', textStyle(14, Css.muted, { fontStyle: 'bold' })).setOrigin(1, 0)) : null;
  function show(i: number): void {
    page = Math.max(0, Math.min(pages.length - 1, i));
    bodies.forEach((b, j) => b.setVisible(j === page));
    heading.setText(pages[page].title);
    counter?.setText(pageLabel(page, pages.length));
    prev?.setEnabled(page > 0);
    const last = page === pages.length - 1;
    main.setLabel(last ? '閉じる' : '次へ  ›').setVariant(last ? 'gold' : 'primary');
    // Read to the end (#425): remembered once, and it counts for 熟読章.
    if (last) markHelpRead(id);
  }
  show(0);
  return true;
}

/** Remembers a screen's help as read to its last page (#425), counting it once for 熟読章. */
export function markHelpRead(id: string): void {
  const save = loadSave();
  if (save.helpRead.includes(id)) return;
  saveSave({ ...save, helpRead: [...save.helpRead, id] });
  const after = loadSave();
  if (isStarted(after, after.current)) saveProgress(withQuestEvents(loadProgress(), [['helpRead', 1]], Date.now()));
}
