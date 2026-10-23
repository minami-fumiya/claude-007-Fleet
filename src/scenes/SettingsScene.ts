import Phaser from 'phaser';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { askText } from '@/ui/components/TextInputSheet';
import { DIFFICULTIES, nextDifficulty } from '@/systems/DifficultySystem';
import { ledgerText } from '@/systems/LedgerSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { clampVolume, ISettings, stepVolume } from '@/systems/SettingsSystem';
import { decodeSave, encodeSave } from '@/systems/SaveCodec';
import { backupStoredSave, emptySave, listBackups, loadProgress, loadSave, resetNation, restoreBackup, saveSave } from '@/utils/ProgressStore';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { Nation } from '@/types/Nation';
import { backupLabel, ISaveBackup } from '@/utils/SaveBackup';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, UIButton } from '@/ui/components/UIKit';

/** Landscape lays the settings out in two columns (sound / controls / builder | save data), so nothing runs off the bottom. */
const P = IS_PORTRAIT ? { x: 16, y: 140, w: CANVAS_W - 32, h: CANVAS_H - 156 } : { x: 40, y: 96, w: CANVAS_W - 80, h: 604 };
const COL_GAP = 48;
const ROW_H = IS_PORTRAIT ? 80 : 64;
const BTN_H = IS_PORTRAIT ? 64 : 48;

/** 設定: sound volumes and mute, and save data transfer / reset. */
/** Sheets drawn over the settings (nation reset). */
const SHEET_DEPTH = 300;

export class SettingsScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.HOME;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private resetArmed = false;
  private backupsOpen = false;
  /** Backup row tapped once (#157); -1 = none */
  private restoreArmed = -1;
  /** Nation reset (#129): the list is open, and which nation was tapped once */
  private nationResetOpen = false;
  private nationResetArmed: Nation | null = null;
  private status = '';
  private statusCss: string = Css.muted;

  constructor() {
    super({ key: SceneKeys.SETTINGS });
  }

  init(data?: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.HOME;
  }

  create(): void {
    // The screen explains itself on the first visit (#316), once everything is drawn.
    this.events.once(Phaser.Scenes.Events.CREATE, () => showScreenHelp(this));
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
    y += BTN_H + (IS_PORTRAIT ? 30 : 32);

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
    y += IS_PORTRAIT ? 36 : 32;

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
    y += IS_PORTRAIT ? 84 : 32;
    // 難易度 (#100): taps cycle 易しい → 普通 → 難しい.
    const diff = DIFFICULTIES[s.difficulty];
    this.track(this.add.text(x, y + BTN_H / 2, '難易度', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(
      new UIButton(this, x + w - muteW / 2, y + BTN_H / 2, diff.label, () => this.change({ difficulty: nextDifficulty(s.difficulty) }), {
        variant: s.difficulty === 'normal' ? 'secondary' : 'primary', width: muteW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + 6;
    this.track(this.add.text(x, y, `作戦と演習の敵の強さ。報酬 ×${diff.rewardMul}・敵の耐久 ×${diff.hpMul} (史実は常に普通)`, textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += IS_PORTRAIT ? 36 : 32;
    if (!IS_PORTRAIT) {
      x = P.x + 28 + colW + COL_GAP;
      y = P.y + 24;
    }
    // 動作情報 (#99): fps, objects and frame time over the battle.
    this.track(this.add.text(x, y + BTN_H / 2, '動作情報 (戦闘中の fps)', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(
      new UIButton(this, x + w - muteW / 2, y + BTN_H / 2, s.showFps ? '表示' : '非表示', () => this.change({ showFps: !s.showFps }), {
        variant: s.showFps ? 'primary' : 'secondary', width: muteW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + (IS_PORTRAIT ? 16 : 20);

    this.track(this.add.text(x, y, '進行データ', eyebrowStyle(11)));
    y += 30;
    this.track(this.add.text(x, y, `セーブコードで別の端末やブラウザへ進行状況を移せます。  (v${__APP_VERSION__})`, textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += IS_PORTRAIT ? 48 : 30;
    const buttons: Array<[string, () => void, 'primary' | 'secondary' | 'danger']> = [
      ['セーブコードをコピー', () => this.exportSave(), 'primary'],
      ['セーブコードを読み込む', () => void this.importSave(), 'secondary'],
      // First-visit help (#61) shows again on every screen.
      ['画面の説明をもう一度表示', () => this.resetHelp(), 'secondary'],
      // The resource ledger as text (#137), for bug reports and balance work.
      ['資源の収支をコピー', () => this.exportLedger(), 'secondary'],
      ['国を選んでリセット', () => {
        this.nationResetOpen = true;
        this.nationResetArmed = null;
        this.refresh();
      }, 'secondary'],
      [this.resetArmed ? 'もう一度押すと全部リセット' : '全部リセット', () => this.resetSave(), this.resetArmed ? 'danger' : 'secondary'],
    ];
    // Three per row on a phone so the section fits (and the backups below it), two in the landscape column.
    const cols = IS_PORTRAIT ? 3 : 2;
    const gap = 12;
    const bw = (w - gap * (cols - 1)) / cols;
    buttons.forEach(([label, fn, variant], i) => {
      const bx = x + (i % cols) * (bw + gap) + bw / 2;
      const by = y + Math.floor(i / cols) * (BTN_H + gap) + BTN_H / 2;
      this.track(new UIButton(this, bx, by, label, fn, { variant, width: bw, height: BTN_H, fontSize: 14 }));
    });
    y += Math.ceil(buttons.length / cols) * (BTN_H + gap) + 10;
    if (this.nationResetOpen) this.drawNationReset();
    // Backups taken before updates, imports and resets: tap one to restore it (#114).
    const backups = listBackups();
    // Opens a sheet over the page (#157): the list no longer runs off the bottom.
    this.track(new UIButton(this, x + w / 2, y + BTN_H / 2, `バックアップから復元 (${backups.length})`, () => {
      this.backupsOpen = true;
      this.restoreArmed = -1;
      this.refresh();
    }, { variant: 'secondary', width: w, height: BTN_H, fontSize: 14 })).setEnabled(backups.length > 0);
    y += BTN_H + gap;
    if (this.backupsOpen) this.drawBackups(backups);
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

  private resetHelp(): void {
    saveSave({ ...loadSave(), seenHelp: [] });
    this.say('各画面の説明を、次に開いた時にもう一度表示します。');
  }

  private exportSave(): void {
    this.resetArmed = false;
    const code = encodeSave(loadSave());
    // Without the clipboard, the code is shown in the game's own box to copy by hand (#308).
    const fallback = (): void => {
      void askText({ title: 'セーブコード', hint: '全部を選んでコピーし、別の端末の「セーブコードを読み込む」に貼り付けます', value: code, multiline: true, readonly: true });
      this.say('セーブコードを表示しました');
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(code).then(() => this.say(`セーブコードをコピーしました (${code.length} 文字)`), fallback);
  }

  private exportLedger(): void {
    this.resetArmed = false;
    const text = ledgerText(loadProgress().ledger, Date.now());
    const fallback = (): void => {
      void askText({ title: '資源の収支 (直近 24 時間)', hint: '全部を選んでコピーします', value: text, multiline: true, readonly: true });
      this.say('収支を表示しました');
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => this.say('資源の収支 (直近 24 時間) をコピーしました'), fallback);
  }

  private async importSave(): Promise<void> {
    this.resetArmed = false;
    const text = await askText({ title: 'セーブコードを読み込む', hint: '別の端末でコピーしたセーブコードを貼り付けます。今のデータはバックアップに残ります', multiline: true, confirmLabel: '読み込む', placeholder: 'セーブコード' });
    if (!text) return;
    const save = decodeSave(text);
    if (!save) return this.say('セーブコードが正しくありません。読み込みを中止しました。', Css.danger);
    backupStoredSave('import');
    saveSave(save);
    this.say('セーブコードを読み込みました (前のデータはバックアップに残っています)');
  }

  /** Sheet of the backups (#157): the first tap arms a row, the second restores it. */
  private drawBackups(backups: ISaveBackup[]): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      return this.track(o);
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const bh = BTN_H - 4;
    const gap = 10;
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 640;
    const h = (IS_PORTRAIT ? 190 : 150) + backups.length * (bh + gap) + bh + 40;
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(16, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, 'バックアップから復元', eyebrowStyle(11)));
    const note = this.restoreArmed >= 0
      ? 'もう一度押すと、今の進行をこのバックアップで置き換えます (今の進行もバックアップに残ります)。'
      : '更新・読み込み・リセットの前に自動で残したセーブです (最新 5 件)。選ぶと確認のあと復元します。';
    add(this.add.text(x + 28, y + 52, note, textStyle(13, this.restoreArmed >= 0 ? Css.danger : Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    const top = y + (IS_PORTRAIT ? 140 : 108);
    backups.forEach((b, i) => {
      const armed = this.restoreArmed === i;
      add(new UIButton(this, x + w / 2, top + i * (bh + gap) + bh / 2, armed ? `もう一度で復元: ${backupLabel(b)}` : backupLabel(b), () => {
        if (this.restoreArmed !== i) {
          this.restoreArmed = i;
          this.refresh();
          return;
        }
        this.restore(b);
      }, { variant: armed ? 'danger' : 'primary', width: w - 56, height: bh, fontSize: 13 }));
    });
    add(new UIButton(this, x + w / 2, y + h - 20 - bh / 2, '閉じる', () => {
      this.backupsOpen = false;
      this.restoreArmed = -1;
      this.refresh();
    }, { variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: bh, fontSize: 15 }));
  }

  private restore(b: ISaveBackup): void {
    this.resetArmed = false;
    this.backupsOpen = false;
    this.restoreArmed = -1;
    if (!restoreBackup(b)) return this.say('このバックアップは読み込めませんでした。', Css.danger);
    this.say(`バックアップ (${backupLabel(b)}) を復元しました`);
  }

  /** Sheet listing the started nations; tapping one twice resets just that nation (#129). */
  private drawNationReset(): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      return this.track(o);
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const save = loadSave();
    const started = PLAYABLE_NATIONS.filter((n) => save.nations[n] !== undefined);
    const cols = IS_PORTRAIT ? 1 : 2;
    const bh = BTN_H - 4;
    const gap = 10;
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 640;
    const rows = Math.max(1, Math.ceil(started.length / cols));
    const h = (IS_PORTRAIT ? 200 : 160) + rows * (bh + gap) + bh + 40;
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(16, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '国を選んでリセット', eyebrowStyle(11)));
    const note = this.nationResetArmed
      ? `もう一度押すと${NATION_INFO[this.nationResetArmed].jaShort}の資源・保有艦・研究・攻略・艦長・任務が消えます。`
      : '選んだ国だけを最初からやり直します。戦績 (勲章) と他の国は残り、リセット前のデータはバックアップから戻せます。';
    add(this.add.text(x + 28, y + 52, note, textStyle(13, this.nationResetArmed ? Css.danger : Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    const top = y + (IS_PORTRAIT ? 150 : 116);
    if (started.length === 0) add(this.add.text(x + 28, top, 'リセットできる国がありません。', textStyle(13, Css.muted)));
    const bw = (w - 56 - gap * (cols - 1)) / cols;
    started.forEach((n, i) => {
      const armed = this.nationResetArmed === n;
      add(new UIButton(this, x + 28 + (i % cols) * (bw + gap) + bw / 2, top + Math.floor(i / cols) * (bh + gap) + bh / 2,
        armed ? `もう一度で ${NATION_INFO[n].jaShort} をリセット` : `${NATION_INFO[n].jaShort} をリセット`, () => this.resetOneNation(n), {
          variant: armed ? 'danger' : 'secondary', width: bw, height: bh, fontSize: 14,
        }));
    });
    add(new UIButton(this, x + w / 2, y + h - 20 - bh / 2, '閉じる', () => {
      this.nationResetOpen = false;
      this.nationResetArmed = null;
      this.refresh();
    }, { variant: 'primary', width: IS_PORTRAIT ? 260 : 200, height: bh, fontSize: 15 }));
  }

  private resetOneNation(nation: Nation): void {
    if (this.nationResetArmed !== nation) {
      this.nationResetArmed = nation;
      this.refresh();
      return;
    }
    this.nationResetArmed = null;
    this.nationResetOpen = false;
    backupStoredSave('reset');
    saveSave(resetNation(loadSave(), nation));
    this.say(`${NATION_INFO[nation].jaShort}をリセットしました (バックアップから戻せます)`);
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
