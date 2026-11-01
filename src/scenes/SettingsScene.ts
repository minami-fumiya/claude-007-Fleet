import Phaser from 'phaser';
import { reloadAt } from '@/utils/OrientationWatch';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { askText } from '@/ui/components/TextInputSheet';
import { DIFFICULTIES, nextDifficulty } from '@/systems/DifficultySystem';
import { ledgerText } from '@/systems/LedgerSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { ORIENTATION_CHOICES, ORIENTATION_LABEL, RUBY_LABEL, RUBY_LEVELS, THEME_CHOICES, THEME_LABEL, clampVolume, COMMENTARY_RATE_LABEL, COMMENTARY_RATES, frameLimitLabel, ISettings, nextChoice, nextFrameLimit, SHAKE_LABEL, SHAKE_LEVELS, stepVolume } from '@/systems/SettingsSystem';
import { voice } from '@/systems/VoiceSystem';
import { shortVoiceName } from '@/systems/SpeechStyle';
import { applyFrameLimit } from '@/utils/FrameLimit';
import { decodeSave, encodeSave } from '@/systems/SaveCodec';
import { backupStoredSave, emptySave, listBackups, loadProgress, loadSave, resetNation, restoreBackup, saveSave } from '@/utils/ProgressStore';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { Nation } from '@/types/Nation';
import { backupLabel, ISaveBackup } from '@/utils/SaveBackup';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, fitText, UIButton } from '@/ui/components/UIKit';

/** Landscape lays the settings out in two columns (sound / controls / builder | save data), so nothing runs off the bottom. */
const P = IS_PORTRAIT ? { x: 16, y: 140, w: CANVAS_W - 32, h: CANVAS_H - 156 } : { x: 40, y: 96, w: CANVAS_W - 80, h: 604 };
const COL_GAP = 48;
const ROW_H = IS_PORTRAIT ? 80 : 64;
const BTN_H = IS_PORTRAIT ? 64 : 48;

/** 設定: sound volumes and mute, and save data transfer / reset. */
type SettingsTab = 'sound' | 'play' | 'display' | 'data';
const TAB_LABEL: Record<SettingsTab, string> = { sound: '音', play: '操作', display: '表示', data: 'データ' };
const TABS: SettingsTab[] = ['sound', 'play', 'display', 'data'];
const TAB_H = IS_PORTRAIT ? 56 : 40;

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
  /** 音・操作・データ (#105): the page shown */
  private tab: SettingsTab = 'sound';

  constructor() {
    super({ key: SceneKeys.SETTINGS });
  }

  init(data?: { returnTo?: string; tab?: SettingsTab }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.HOME;
    this.tab = data?.tab ?? 'sound';
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
    // The tabs (#105): sound, controls and display, save data.
    const tw = (P.w - 56 - 12 * (TABS.length - 1)) / TABS.length;
    TABS.forEach((t, i) => {
      this.track(new UIButton(this, P.x + 28 + i * (tw + 12) + tw / 2, P.y + 20 + TAB_H / 2, TAB_LABEL[t], () => {
        this.tab = t;
        this.status = '';
        this.resetArmed = false;
        this.refresh();
      }, { variant: this.tab === t ? 'primary' : 'secondary', width: tw, height: TAB_H, fontSize: 15 }));
    });
    const top = P.y + 20 + TAB_H + (IS_PORTRAIT ? 24 : 18);
    if (this.tab === 'sound') this.drawSound(top);
    else if (this.tab === 'play') this.drawPlay(top);
    else if (this.tab === 'display') this.drawDisplay(top);
    else this.drawData(top);
  }

  /** A label on the left and a toggle-style button on the right. */
  private toggleRow(x: number, y: number, w: number, label: string, value: string, on: boolean, onTap: () => void): void {
    const bw = IS_PORTRAIT ? 200 : 170;
    this.track(this.add.text(x, y + BTN_H / 2, label, textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(new UIButton(this, x + w - bw / 2, y + BTN_H / 2, value, onTap, { variant: on ? 'primary' : 'secondary', width: bw, height: BTN_H, fontSize: 15 }));
  }

  private note(x: number, y: number, w: number, text: string): number {
    const t = this.track(this.add.text(x, y, text, textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    return t.height;
  }

  /** 音 (#105): the four channels, each with its volume and on / off; then the music and the commentary. */
  private drawSound(top: number): void {
    const s = audio.settings;
    const x = P.x + 28;
    const w = P.w - 56;
    const colW = IS_PORTRAIT ? w : (w - COL_GAP) / 2;
    let y = top;
    const rowH = IS_PORTRAIT ? ROW_H : ROW_H - 6;
    this.volumeRow(x, y, colW, 'BGM', s.bgm, (v) => audio.update({ bgm: v }), s.bgmOn, () => this.change({ bgmOn: !s.bgmOn }));
    y += rowH;
    this.volumeRow(x, y, colW, '効果音', s.sfx, (v) => audio.update({ sfx: v }), s.sfxOn, () => this.change({ sfxOn: !s.sfxOn }));
    y += rowH;
    this.volumeRow(x, y, colW, 'ナレーション', s.voice, (v) => audio.update({ voice: v }), s.voiceOn, () => this.change({ voiceOn: !s.voiceOn }));
    y += rowH;
    this.volumeRow(x, y, colW, '戦闘実況', s.commentary, (v) => audio.update({ commentary: v }), s.commentaryOn, () => this.change({ commentaryOn: !s.commentaryOn }));
    y += rowH + 4;
    this.toggleRow(x, y, colW, 'ミュート (全部)', s.muted ? '音 OFF' : '音 ON', !s.muted, () => this.change({ muted: !s.muted }));
    y += BTN_H + (IS_PORTRAIT ? 24 : 18);
    let x2 = x;
    if (!IS_PORTRAIT) {
      x2 = x + colW + COL_GAP;
      y = top;
    }
    this.toggleRow(x2, y, colW, 'BGM の曲', s.nationalBgm ? '国別の海軍の曲' : '従来の曲', s.nationalBgm, () => this.change({ nationalBgm: !s.nationalBgm }));
    y += BTN_H + 6;
    y += this.note(x2, y, colW, '国別: 鎮守府・出撃・戦闘で、遊んでいる国の曲 (著作権の切れた行進曲と本作の曲) を流します。夜戦・劣勢・超兵器では専用の曲に変わります。') + (IS_PORTRAIT ? 18 : 14);
    this.toggleRow(x2, y, colW, '実況の頻度', COMMENTARY_RATE_LABEL[s.commentaryRate], s.commentaryRate !== 'few', () => this.change({ commentaryRate: nextChoice(COMMENTARY_RATES, s.commentaryRate) }));
    y += BTN_H + (IS_PORTRAIT ? 14 : 12);
    this.toggleRow(x2, y, colW, '字幕', s.subtitles ? '表示' : '非表示', s.subtitles, () => this.change({ subtitles: !s.subtitles }));
    y += BTN_H + 6;
    y += this.note(x2, y, colW, 'ナレーションと実況を画面の下にも文字で出します。声は端末の音声合成を使い、日本語の声が無い端末では字幕だけになります。') + (IS_PORTRAIT ? 14 : 10);
    // 声の種類 (#383): taps go through the device's Japanese voices; 自動 picks the most natural one.
    const voices = ['', ...voice.voices()];
    const at = Math.max(0, voices.indexOf(s.voiceName));
    this.toggleRow(x2, y, colW, '声の種類', s.voiceName && voices.includes(s.voiceName) ? shortVoiceName(s.voiceName) : '自動 (自然な声)', s.voiceName !== '', () => this.change({ voiceName: voices[(at + 1) % voices.length] }));
    y += BTN_H + (IS_PORTRAIT ? 14 : 10);
    this.track(new UIButton(this, x2 + colW / 2, y + BTN_H / 2, '声を試す', () => voice.say('敵艦隊見ゆ。全艦、戦闘配置につけ', 'narration'), {
      variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: BTN_H, fontSize: 15,
    }));
  }

  /** 操作・表示: the stick, the builder's defaults, difficulty, fps, and the shake and buzz (#107). */
  private drawPlay(top: number): void {
    const s = audio.settings;
    const x = P.x + 28;
    const w = P.w - 56;
    const colW = IS_PORTRAIT ? w : (w - COL_GAP) / 2;
    let y = top;
    this.toggleRow(x, y, colW, '移動スティック (タッチ)', s.joystick ? '表示' : '非表示', s.joystick, () => this.change({ joystick: !s.joystick }));
    y += BTN_H + 6;
    y += this.note(x, y, colW, '非表示にすると、海面のタップと AUTO で移動します。') + (IS_PORTRAIT ? 18 : 14);
    this.toggleRow(x, y, colW, '演習の設定を引き継ぐ', s.keepExercise ? '引き継ぐ' : '毎回 標準', s.keepExercise, () => this.change({ keepExercise: !s.keepExercise }));
    y += BTN_H + 6;
    y += this.note(x, y, colW, '交戦相手・戦闘の種類・天候・時間・敵の数。「毎回 標準」にすると、編成画面を開くたびに標準 (戦域の相手国・水上戦・晴天・昼・同数) から始まります。') + (IS_PORTRAIT ? 18 : 14);
    // 難易度 (#100): taps cycle 易しい → 普通 → 難しい.
    const diff = DIFFICULTIES[s.difficulty];
    this.toggleRow(x, y, colW, '難易度', diff.label, s.difficulty !== 'normal', () => this.change({ difficulty: nextDifficulty(s.difficulty) }));
    y += BTN_H + 6;
    y += this.note(x, y, colW, `作戦と演習の敵の強さ。報酬 ×${diff.rewardMul}・敵の耐久 ×${diff.hpMul} (史実は常に普通)`) + (IS_PORTRAIT ? 18 : 14);
    let x2 = x;
    if (!IS_PORTRAIT) {
      x2 = x + colW + COL_GAP;
      y = top;
    }
    // 動作情報 (#99): fps, objects and frame time over the battle; and the frame limit (#336), 30 to save the battery.
    const fpsW = IS_PORTRAIT ? 170 : 130;
    this.track(this.add.text(x2, y + BTN_H / 2, '動作情報 (fps)', textStyle(16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    this.track(
      new UIButton(this, x2 + colW - fpsW * 1.5 - 10, y + BTN_H / 2, frameLimitLabel(s.frameLimit), () => {
        const frameLimit = nextFrameLimit(s.frameLimit);
        this.change({ frameLimit });
        applyFrameLimit(this.game, frameLimit);
      }, { variant: s.frameLimit === 0 ? 'secondary' : 'primary', width: fpsW, height: BTN_H, fontSize: 15 }),
    );
    this.track(
      new UIButton(this, x2 + colW - fpsW / 2, y + BTN_H / 2, s.showFps ? '表示' : '非表示', () => this.change({ showFps: !s.showFps }), {
        variant: s.showFps ? 'primary' : 'secondary', width: fpsW, height: BTN_H, fontSize: 16,
      }),
    );
    y += BTN_H + (IS_PORTRAIT ? 24 : 18);
    // 画面の揺れとスマホの振動 (#107)
    this.toggleRow(x2, y, colW, '画面の揺れ', SHAKE_LABEL[s.shake], s.shake !== 'off', () => this.change({ shake: nextChoice(SHAKE_LEVELS, s.shake) }));
    y += BTN_H + 6;
    y += this.note(x2, y, colW, '大きな艦の撃沈や自分の艦の大破で画面が揺れます。酔いやすい時は「なし」に。') + (IS_PORTRAIT ? 18 : 14);
    this.toggleRow(x2, y, colW, '振動 (スマホ)', s.vibrate ? 'ON' : 'OFF', s.vibrate, () => this.change({ vibrate: !s.vibrate }));
    y += BTN_H + 6;
    this.note(x2, y, colW, '自分の艦の被弾・大破・撃沈で短く振動します (対応している端末だけ。iPhone は振動しません)。');
  }

  /**
   * 表示 (#94 #95): the colour theme, readings after hard words and which way up the screen is. The theme and the
   * orientation take a reload, which this screen does at once (the settings are saved first).
   */
  private drawDisplay(top: number): void {
    const s = audio.settings;
    const x = P.x + 28;
    const w = P.w - 56;
    let y = top;
    const gap = IS_PORTRAIT ? 18 : 14;
    this.toggleRow(x, y, w, 'テーマ', THEME_LABEL[s.theme], s.theme !== 'dark', () => {
      audio.update({ theme: nextChoice(THEME_CHOICES, s.theme) });
      this.reloadInPlace();
    });
    y += BTN_H + 6;
    y += this.note(x, y, w, 'ダーク (夜の海) と ライト (明るい画面) を切り替えます。「端末に合わせる」は端末のダークモードの設定に従います。切り替えると画面を読み込み直します。') + gap;
    this.toggleRow(x, y, w, 'ふりがな', RUBY_LABEL[s.ruby], s.ruby !== 'off', () => {
      audio.update({ ruby: nextChoice(RUBY_LEVELS, s.ruby) });
      this.reloadInPlace();
    });
    y += BTN_H + 6;
    y += this.note(x, y, w, '艦名・艦長名・地名・階級・用語の後ろに、小さく読みを付けます (例: 陸奥〈むつ〉)。「難しい語のみ」は読みにくい語だけに付けます。') + gap;
    this.toggleRow(x, y, w, '画面の向き', ORIENTATION_LABEL[s.orientation], s.orientation !== 'auto', () => {
      audio.update({ orientation: nextChoice(ORIENTATION_CHOICES, s.orientation) });
      this.reloadInPlace();
    });
    y += BTN_H + 6;
    y += this.note(x, y, w, '「自動」では、スマホを横にすると横画面、縦にすると縦画面になります (戦闘中は戦闘の後に切り替わります)。パソコンは横画面です。') + gap;
    this.note(x, y, w, '色だけで分かる表示には、記号も添えています (▲ 有利・▼ 不利・✓ 研究済・満 など)。');
  }

  /** Reloads the game on this screen (#94 #95): the theme and the layout are read once at start-up. */
  private reloadInPlace(): void {
    reloadAt(SceneKeys.SETTINGS);
  }

  /** データ: save codes, help, the ledger, resets and backups. */
  private drawData(top: number): void {
    const x = P.x + 28;
    const w = P.w - 56;
    let y = top;
    this.track(this.add.text(x, y, '進行データ', eyebrowStyle(11)));
    y += 30;
    y += this.note(x, y, w, `セーブコードで別の端末やブラウザへ進行状況を移せます。  (v${__APP_VERSION__})`) + (IS_PORTRAIT ? 18 : 14);
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
    const cols = IS_PORTRAIT ? 2 : 3;
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

  /** −, a bar to tap, +, the value and (#105) the channel's on / off. */
  private volumeRow(x: number, y: number, w: number, label: string, value: number, set: (v: number) => void, on = true, toggle?: () => void): void {
    const btn = IS_PORTRAIT ? 56 : 44;
    const labelW = IS_PORTRAIT ? 150 : 128;
    const valueW = 44;
    const onW = toggle ? (IS_PORTRAIT ? 84 : 64) : 0;
    const meterX = x + labelW + btn + 10;
    const meterW = w - labelW - btn * 2 - 20 - valueW - (onW ? onW + 10 : 0);
    const cy = y + btn / 2;
    const name = this.track(this.add.text(x, cy, label, textStyle(16, on ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    fitText(name, labelW - 8);
    this.track(new UIButton(this, x + labelW + btn / 2, cy, '−', () => this.setVolume(set, stepVolume(value, -1)), { variant: 'secondary', width: btn, height: btn, fontSize: 20 }));
    this.track(new UIButton(this, meterX + meterW + 10 + btn / 2, cy, '+', () => this.setVolume(set, stepVolume(value, 1)), { variant: 'secondary', width: btn, height: btn, fontSize: 20 }));
    const g = this.track(this.add.graphics());
    drawMeter(g, meterX, cy - 6, meterW, 12, value / 100, on ? Colors.cyan : Colors.dim);
    // Tap anywhere on the bar to jump there (in steps of 5).
    const hit = this.track(this.add.zone(meterX + meterW / 2, cy, meterW, btn).setInteractive({ useHandCursor: true }));
    hit.on('pointerup', (p: Phaser.Input.Pointer) => this.setVolume(set, clampVolume(Math.round(((p.x - meterX) / meterW) * 20) * 5)));
    this.track(this.add.text(meterX + meterW + 10 + btn + 8 + valueW, cy, String(value), textStyle(15, on ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(1, 0.5));
    if (toggle) this.track(new UIButton(this, x + w - onW / 2, cy, on ? 'ON' : 'OFF', toggle, { variant: on ? 'primary' : 'secondary', width: onW, height: btn, fontSize: 14 }));
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
