import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { applyTutorialEvent, currentStep, TUTORIAL_ENABLED, ITutorialResult, skipTutorial, stepLabel, TUTORIAL_REWARD, TutorialEvent } from '@/systems/TutorialSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { loadSave, saveSave } from '@/utils/ProgressStore';
import { Colors, Css, displayStyle, textStyle } from '@/ui/theme';
import { addPanel, drawPanel, UIButton } from '@/ui/components/UIKit';

/** Above every scene's own sheets and HUD. */
const DEPTH = 400;
/** Registry keys: the last step whose sheet opened by itself, and a finish waiting to be announced. */
const SEEN_KEY = 'tutorial.seen';
const FINISHED_KEY = 'tutorial.finished';

/**
 * Records a tutorial event (#90) in the stored save. `registry` (the game's) remembers a finish so the next screen
 * with a guide can announce the promotion.
 */
export function emitTutorial(event: TutorialEvent, registry?: Phaser.Data.DataManager): ITutorialResult {
  if (!TUTORIAL_ENABLED) return { save: loadSave(), advanced: false, finished: false };
  const result = applyTutorialEvent(loadSave(), event);
  if (result.advanced) saveSave(result.save);
  if (result.finished) registry?.set(FINISHED_KEY, true);
  return result;
}

export interface ITutorialGuideOptions {
  /** Show the small "チュートリアル n/9" chip at the top (default true) */
  chip?: boolean;
  /** Called when the sheet opens / closes (the battle pauses meanwhile) */
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * The tutorial on a screen (#90): a chip at the top naming the current step, and a sheet with its explanation
 * that opens by itself the first time a step is shown. 次へ moves on the steps that only explain; the others move
 * on when the player does what they say. スキップ (tapped twice) ends the tutorial without the promotion.
 */
export class TutorialGuide {
  private readonly scene: Phaser.Scene;
  private readonly opts: ITutorialGuideOptions;
  private chipObjs: Phaser.GameObjects.GameObject[] = [];
  private sheet: Phaser.GameObjects.GameObject[] = [];
  private skipArmed = false;

  constructor(scene: Phaser.Scene, opts: ITutorialGuideOptions = {}) {
    this.scene = scene;
    this.opts = opts;
    this.refresh();
  }

  /** Redraws after the save changed (an event on this screen); opens a step's sheet the first time it shows. */
  refresh(): void {
    this.clearChip();
    if (!TUTORIAL_ENABLED) return;
    const registry = this.scene.registry;
    if (registry.get(FINISHED_KEY)) {
      registry.remove(FINISHED_KEY);
      this.openFinished();
      return;
    }
    const state = loadSave().tutorial;
    const step = currentStep(state);
    if (!step) return;
    if (this.opts.chip !== false) this.drawChip(`チュートリアル ${stepLabel(state)}: ${step.title}  ›`);
    if (registry.get(SEEN_KEY) !== state.step) {
      registry.set(SEEN_KEY, state.step);
      this.open();
    }
  }

  private pin<T extends Phaser.GameObjects.GameObject>(o: T, list: Phaser.GameObjects.GameObject[]): T {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH);
    list.push(o);
    return o;
  }

  private drawChip(label: string): void {
    const text = this.scene.add.text(0, 0, label, textStyle(IS_PORTRAIT ? 12 : 11, Css.ink, { fontStyle: 'bold' })).setOrigin(0.5);
    const w = Math.min(IS_PORTRAIT ? 300 : 340, text.width + 28);
    if (text.width > w - 20) text.setScale((w - 20) / text.width);
    const h = 22;
    const g = this.scene.add.graphics();
    g.fillStyle(Colors.gold, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    const chip = this.scene.add.container(CANVAS_W / 2, 13, [g, text]);
    chip.setSize(w, h).setInteractive({ cursor: 'pointer' });
    chip.on('pointerup', () => this.open());
    this.pin(chip, this.chipObjs);
  }

  private clearChip(): void {
    for (const o of this.chipObjs) o.destroy();
    this.chipObjs = [];
  }

  private closeSheet(): void {
    const wasOpen = this.sheet.length > 0;
    for (const o of this.sheet) o.destroy();
    this.sheet = [];
    this.skipArmed = false;
    if (wasOpen) this.opts.onClose?.();
  }

  /** The current step's sheet. */
  open(): void {
    const state = loadSave().tutorial;
    const step = currentStep(state);
    if (!step) return;
    const buttons: Array<[string, () => void, 'gold' | 'primary' | 'secondary' | 'danger']> = [];
    if (step.advance === 'next') buttons.push(['次へ  ▶', () => this.next(), 'gold']);
    buttons.push(['閉じる', () => this.closeSheet(), step.advance === 'next' ? 'secondary' : 'primary']);
    buttons.push([this.skipArmed ? 'もう一度押すとスキップ' : 'スキップ', () => this.skip(), this.skipArmed ? 'danger' : 'secondary']);
    this.showSheet(`チュートリアル ${stepLabel(state)}`, step.title, step.text, buttons);
  }

  private openFinished(): void {
    this.showSheet('チュートリアル完了', '少尉に昇進しました', `お疲れさまでした。出撃枠が 2 隻になり、報酬 (${formatResources(TUTORIAL_REWARD)}) を受け取りました。この先は作戦で海域を攻略して戦功を貯め、昇進を目指しましょう。ヘルプからいつでも見直せます。`, [
      ['閉じる', () => this.closeSheet(), 'gold'],
    ]);
  }

  private showSheet(eyebrow: string, title: string, body: string, buttons: Array<[string, () => void, 'gold' | 'primary' | 'secondary' | 'danger']>): void {
    const reopen = this.sheet.length > 0;
    for (const o of this.sheet) o.destroy();
    this.sheet = [];
    if (!reopen) this.opts.onOpen?.();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => this.pin(o, this.sheet);
    const s = this.scene;
    // Swallows taps so the screen underneath doesn't react while the sheet is open.
    add(s.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.55).setOrigin(0, 0).setInteractive());
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 640;
    const pad = 28;
    const bodyText = s.add.text(0, 0, body, textStyle(IS_PORTRAIT ? 16 : 15, Css.text, { wordWrap: { width: w - pad * 2, useAdvancedWrap: true }, lineSpacing: 6 }));
    const bh = IS_PORTRAIT ? 60 : 46;
    const cols = IS_PORTRAIT ? 1 : buttons.length;
    const gap = 10;
    const h = 120 + bodyText.height + 24 + Math.ceil(buttons.length / cols) * (bh + gap) + 14;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    add(addPanel(s, x, y, w, h, { radius: 24, fillAlpha: 0.97, glow: 0.9, rim: Colors.gold, rimAlpha: 0.6 }));
    const strip = add(s.add.graphics());
    drawPanel(strip, x + pad, y + 22, 8, 8, { radius: 4, fill: Colors.gold, fillAlpha: 1, rimAlpha: 0 });
    add(s.add.text(x + pad + 16, y + 26, eyebrow, textStyle(12, Css.gold, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    add(s.add.text(x + pad, y + 50, title, displayStyle(IS_PORTRAIT ? 24 : 22)));
    // Measured before the panel was drawn, so lift it above the panel.
    add(bodyText.setPosition(x + pad, y + 104)).setDepth(DEPTH + 1);
    const by = y + 104 + bodyText.height + 24;
    const bw = (w - pad * 2 - gap * (cols - 1)) / cols;
    buttons.forEach(([label, fn, variant], i) => {
      add(new UIButton(s, x + pad + (i % cols) * (bw + gap) + bw / 2, by + Math.floor(i / cols) * (bh + gap) + bh / 2, label, fn, {
        variant, width: bw, height: bh, fontSize: IS_PORTRAIT ? 17 : 15,
      }));
    });
  }

  private next(): void {
    emitTutorial('next', this.scene.registry);
    this.closeSheet();
    this.refresh();
  }

  private skip(): void {
    if (!this.skipArmed) {
      this.skipArmed = true;
      this.open();
      return;
    }
    saveSave(skipTutorial(loadSave()));
    this.closeSheet();
    this.clearChip();
  }
}
