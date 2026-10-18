import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { clampVolume, ISettings, stepVolume } from '@/systems/SettingsSystem';
import { decodeSave, encodeSave } from '@/systems/SaveCodec';
import { backupStoredSave, emptySave, listBackups, loadSave, restoreBackup, saveSave } from '@/utils/ProgressStore';
import { backupLabel, ISaveBackup } from '@/utils/SaveBackup';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, UIButton } from '@/ui/components/UIKit';

/** Landscape lays the settings out in two columns (sound / controls / builder | save data), so nothing runs off the bottom. */
const P = IS_PORTRAIT ? { x: 16, y: 140, w: CANVAS_W - 32, h: CANVAS_H - 156 } : { x: 40, y: 96, w: CANVAS_W - 80, h: 604 };
const COL_GAP = 48;
const ROW_H = IS_PORTRAIT ? 84 : 64;
const BTN_H = IS_PORTRAIT ? 64 : 48;

/** 設定: sound volumes and mute, and save data transfer / reset. */
export class SettingsScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.HOME;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private resetArmed = false;
  private backupsOpen = false;
  private status = '';
  private statusCss: string = Css.muted;

  constructor() {
    super({ key: SceneKeys.SETTINGS });
  }

  init(data?: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.HOME;
  }

  create(): void {
    audio.music('menu');
    this.dynamic = [];
    this.resetArmed = false;
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    const backLabel = this.returnTo === SceneKeys.MAIN_MENU ? '‹  タイトル' : '‹  鎮守府';
    new UIButton(this, back.x, back.y, backLabel, () => this.scene.start(this.returnTo), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '設定', displayStyle(24)).setOrigin(0.5);
    addPanel(this, P.x, P.y, P.w, P.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.refresh();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o);
    return o;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const colW = IS_PORTRAIT ? P.w - 56 : (P.w - 56 - COL_GAP) / 2;
    let x = P.x + 28;
    let w = colW;
    const s = audio.settings;
    let y = P.y + 24;

    this.track(this.add.text(x, y, 'サウンド', eyebrowStyle(11)));
    y += 34;
    this.volumeRow(x, y, w, 'BGM', s.bgm, (v) => audio.update({ bgm: v }));
    y += ROW_H;
    this.volumeRow(x, y, w, '効果音', s.sfx, (v) => audio.update({ sfx: v }));
    y += ROW_H;
    this.track(this.add.text(x, y + BTN_H / 2, 'ミュート', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    const muteW = IS_PORTRAIT ? 220 : 180;
    this.track(
      new UIButton(this, x + w - muteW / 2, y + BTN_H / 2, s.muted ? '音 OFF' : '音 ON', () => this.change({ muted: !s.muted }), {
        variant: s.muted ? 'secondary' : 'primary', width: muteW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + (IS_PORTRAIT ? 44 : 32);

    this.track(this.add.text(x, y, '操作', eyebrowStyle(11)));
    y += 34;
    this.track(this.add.text(x, y + BTN_H / 2, '移動スティック (タッチ)', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(
      new UIButton(this, x + w - muteW / 2, y + BTN_H / 2, s.joystick ? '表示' : '非表示', () => this.change({ joystick: !s.joystick }), {
        variant: s.joystick ? 'primary' : 'secondary', width: muteW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + 6;
    this.track(this.add.text(x, y, '非表示にすると、海面のタップと AUTO で移動します。', textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += IS_PORTRAIT ? 44 : 32;

    this.track(this.add.text(x, y, '編成', eyebrowStyle(11)));
    y += 34;
    this.track(this.add.text(x, y + BTN_H / 2, '演習の設定を引き継ぐ', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(
      new UIButton(this, x + w - muteW / 2, y + BTN_H / 2, s.keepExercise ? '引き継ぐ' : '毎回 標準', () => this.change({ keepExercise: !s.keepExercise }), {
        variant: s.keepExercise ? 'primary' : 'secondary', width: muteW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + 6;
    this.track(this.add.text(x, y, '交戦相手・戦闘の種類・天候・時間・敵の数。「毎回 標準」にすると、編成画面を開くたびに標準 (戦域の相手国・水上戦・晴天・昼・同数) から始まります。', textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += IS_PORTRAIT ? 60 : 32;

    if (!IS_PORTRAIT) {
      x = P.x + 28 + colW + COL_GAP;
      y = P.y + 24;
    }
    this.track(this.add.text(x, y, '進行データ', eyebrowStyle(11)));
    y += 30;
    this.track(this.add.text(x, y, 'セーブコードで別の端末やブラウザへ進行状況を移せます。', textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += IS_PORTRAIT ? 48 : 30;
    const buttons: Array<[string, () => void, 'primary' | 'secondary' | 'danger']> = [
      ['セーブコードをコピー', () => this.exportSave(), 'primary'],
      ['セーブコードを読み込む', () => this.importSave(), 'secondary'],
      [this.resetArmed ? 'もう一度押すとリセット' : '進行データをリセット', () => this.resetSave(), this.resetArmed ? 'danger' : 'secondary'],
    ];
    const cols = 1;
    const gap = 12;
    const bw = (w - gap * (cols - 1)) / cols;
    buttons.forEach(([label, fn, variant], i) => {
      const bx = x + (i % cols) * (bw + gap) + bw / 2;
      const by = y + Math.floor(i / cols) * (BTN_H + gap) + BTN_H / 2;
      this.track(new UIButton(this, bx, by, label, fn, { variant, width: bw, height: BTN_H, fontSize: 14 }));
    });
    y += Math.ceil(buttons.length / cols) * (BTN_H + gap) + 10;
    // Backups taken before updates, imports and resets: tap one to restore it (#114).
    const backups = listBackups();
    this.track(new UIButton(this, x + w / 2, y + BTN_H / 2, this.backupsOpen ? 'バックアップを閉じる' : `バックアップから復元 (${backups.length})`, () => {
      this.backupsOpen = !this.backupsOpen;
      this.refresh();
    }, { variant: 'secondary', width: w, height: BTN_H, fontSize: 14 })).setEnabled(backups.length > 0);
    y += BTN_H + gap;
    if (this.backupsOpen) {
      for (const b of backups) {
        this.track(new UIButton(this, x + w / 2, y + BTN_H / 2, backupLabel(b), () => this.restore(b), { variant: 'primary', width: w, height: BTN_H - 8, fontSize: 13 }));
        y += BTN_H - 8 + 6;
      }
      y += 4;
    }
    if (this.status) this.track(this.add.text(x, y, this.status, textStyle(14, this.statusCss, { wordWrap: { width: w, useAdvancedWrap: true } })));
  }

  private volumeRow(x: number, y: number, w: number, label: string, value: number, set: (v: number) => void): void {
    const btn = IS_PORTRAIT ? 64 : 48;
    const labelW = IS_PORTRAIT ? 110 : 120;
    const valueW = 56;
    const meterX = x + labelW + btn + 12;
    const meterW = w - labelW - btn * 2 - 24 - valueW;
    const cy = y + btn / 2;
    this.track(this.add.text(x, cy, label, textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(new UIButton(this, x + labelW + btn / 2, cy, '−', () => this.setVolume(set, stepVolume(value, -1)), { variant: 'secondary', width: btn, height: btn, fontSize: 20 }));
    this.track(new UIButton(this, meterX + meterW + 12 + btn / 2, cy, '+', () => this.setVolume(set, stepVolume(value, 1)), { variant: 'secondary', width: btn, height: btn, fontSize: 20 }));
    const g = this.track(this.add.graphics());
    drawMeter(g, meterX, cy - 6, meterW, 12, value / 100, Colors.cyan);
    // Tap anywhere on the bar to jump there (in steps of 5).
    const hit = this.track(this.add.zone(meterX + meterW / 2, cy, meterW, btn).setInteractive({ useHandCursor: true }));
    hit.on('pointerup', (p: Phaser.Input.Pointer) => this.setVolume(set, clampVolume(Math.round(((p.x - meterX) / meterW) * 20) * 5)));
    this.track(this.add.text(x + w, cy, String(value), textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0.5));
  }

  private setVolume(set: (v: number) => void, v: number): void {
    this.resetArmed = false;
    set(v);
    audio.play('ui');
    this.refresh();
  }

  private change(patch: Partial<ISettings>): void {
    this.resetArmed = false;
    audio.update(patch);
    this.refresh();
  }

  private say(text: string, css: string = Css.success): void {
    this.status = text;
    this.statusCss = css;
    this.refresh();
  }

  private exportSave(): void {
    this.resetArmed = false;
    const code = encodeSave(loadSave());
    const fallback = (): void => {
      window.prompt('このセーブコードをコピーしてください', code);
      this.say('セーブコードを表示しました');
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(code).then(() => this.say(`セーブコードをコピーしました (${code.length} 文字)`), fallback);
  }

  private importSave(): void {
    this.resetArmed = false;
    const text = window.prompt('セーブコードを貼り付けてください');
    if (!text) return;
    const save = decodeSave(text);
    if (!save) return this.say('セーブコードが正しくありません。読み込みを中止しました。', Css.danger);
    backupStoredSave('import');
    saveSave(save);
    this.say('セーブコードを読み込みました (前のデータはバックアップに残っています)');
  }

  private restore(b: ISaveBackup): void {
    this.resetArmed = false;
    this.backupsOpen = false;
    if (!restoreBackup(b)) return this.say('このバックアップは読み込めませんでした。', Css.danger);
    this.say(`バックアップ (${backupLabel(b)}) を復元しました`);
  }

  private resetSave(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.say('全ての国の進行データ (資源・保有艦・研究・攻略状況・戦績など) が消えます。', Css.danger);
      return;
    }
    this.resetArmed = false;
    backupStoredSave('reset');
    saveSave(emptySave());
    this.say('進行データをリセットしました (バックアップから戻せます)');
  }
}
