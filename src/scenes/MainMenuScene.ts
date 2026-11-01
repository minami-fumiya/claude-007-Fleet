import Phaser from 'phaser';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CONTROLS } from '@/config/Controls';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, fitText, UIButton } from '@/ui/components/UIKit';
import { continueLabel, titleTiles } from '@/systems/TitleCopy';
import { prefersReducedMotion, TitleSea } from '@/ui/components/TitleSea';
import { drawFlag } from '@/ui/components/NavalFlags';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { rankOf } from '@/systems/RankSystem';
import { isStarted } from '@/utils/ProgressStore';
import { CHANGELOG, IChangelogEntry, unseenEntries } from '@/systems/Changelog';
import { withQuestEvents } from '@/systems/QuestSystem';
import { ScrollList } from '@/ui/components/ScrollList';
import { loadProgress, loadSave, saveProgress } from '@/utils/ProgressStore';
import { sevenSeasWon } from '@/systems/CampaignSystem';
import { ICampaignData } from '@/types/Campaign';
import campaignData from '@/data/campaign.json';

const CARD = IS_PORTRAIT
  ? { x: 32, y: 48, w: CANVAS_W - 64, h: CANVAS_H - 96 }
  : { x: 70, y: 56, w: CANVAS_W - 140, h: CANVAS_H - 112 };
const LEFT_X = CARD.x + 72;

const FLEET_GLOW = { offsetX: 0, offsetY: 0, color: 'rgba(255,201,74,0.55)', blur: 24, fill: true };
/** Title (#70): seven navies on the world's seas, not just the Pacific. */
const TITLE = '七海艦隊';
const SUBTITLE = '第二次世界大戦  ×  艦隊戦術';
const TAGLINE = '艦隊を編成し、七つの海の制海権を握れ。';
/** English line over the title (#198) */
const EN_TITLE = 'SEVEN  SEAS  FLEET';


/** "v0.0.17-alpha", plus "preview" on a Vercel PR preview (its own saves). */
export function versionLabel(host: string): string {
  const preview = host.endsWith('.vercel.app') && host.includes('-git-');
  return `v${__APP_VERSION__}${preview ? '  preview' : ''}`;
}

export class MainMenuScene extends Phaser.Scene {
  private howToLayer: Phaser.GameObjects.Container | null = null;
  /** The 更新内容 sheet (#205) */
  private changesLayer: Phaser.GameObjects.GameObject[] = [];
  private changesList?: ScrollList;
  /** The moving sea behind everything (#198) */
  private sea?: TitleSea;

  constructor() {
    super({ key: SceneKeys.MAIN_MENU });
  }

  create(): void {
    // The screen explains itself on the first visit (#316), once everything is drawn.
    this.events.once(Phaser.Scenes.Events.CREATE, () => showScreenHelp(this));
    audio.music('title');
    this.howToLayer = null;
    addBackdrop(this, 'menu').setDepth(-40);
    // The sea, the searchlights and a fleet crossing (#198); still when the OS asks for less motion.
    this.sea = new TitleSea(this, IS_PORTRAIT ? 330 : 250, prefersReducedMotion());
    addPanel(this, CARD.x, CARD.y, CARD.w, CARD.h, { radius: 32, fillAlpha: 0.18, glow: 0.6 });
    const corner = IS_PORTRAIT ? { w: 112, h: 56 } : { w: 112, h: 40 };
    new UIButton(this, CARD.x + CARD.w - 20 - corner.w / 2, CARD.y + 20 + corner.h / 2, '設定', () => this.scene.start(SceneKeys.SETTINGS, { returnTo: SceneKeys.MAIN_MENU }), {
      variant: 'secondary', width: corner.w, height: corner.h, fontSize: 14,
    });

    if (IS_PORTRAIT) {
      this.buildPortrait();
    } else {
      this.buildLandscape();
    }
    // Version, bottom right (#136); a PR preview says so, since its saves are kept apart from the real game's.
    // Tapping it opens every version's changes (#205).
    this.add.text(CANVAS_W - 16, CANVAS_H - 12, `${versionLabel(location.hostname)}  ·  更新内容`, textStyle(12, Css.dim)).setOrigin(1, 1)
      .setInteractive({ useHandCursor: true }).on('pointerup', () => this.showChanges(CHANGELOG, false));
    // A new version opened for the first time shows what changed since the last one seen (#205).
    this.changesLayer = [];
    const fresh = loadSave().record.sorties === 0;
    const unseen = unseenEntries(CHANGELOG, audio.settings.lastSeenVersion, __APP_VERSION__, fresh);
    if (unseen.length > 0) this.showChanges(unseen, true);
    else if (audio.settings.lastSeenVersion !== __APP_VERSION__) audio.update({ lastSeenVersion: __APP_VERSION__ });
  }

  /** The 更新内容 sheet (#205): `entries` newest first; `isNew` marks this version seen when closed. */
  showChanges(entries: readonly IChangelogEntry[], isNew: boolean): void {
    this.closeChanges();
    const depth = 200;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
      this.changesLayer.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.8).setOrigin(0, 0).setInteractive());
    const r = IS_PORTRAIT ? { x: 24, y: 160, w: CANVAS_W - 48, h: CANVAS_H - 320 } : { x: 240, y: 70, w: 800, h: 580 };
    add(addPanel(this, r.x, r.y, r.w, r.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(r.x + 26, r.y + 22, isNew ? '新しい版になりました' : 'これまでの更新', eyebrowStyle(11, Css.cyan)));
    add(this.add.text(r.x + 26, r.y + 44, '更新内容', displayStyle(IS_PORTRAIT ? 24 : 22)));
    const top = r.y + (IS_PORTRAIT ? 96 : 86);
    const bottom = r.y + r.h - (IS_PORTRAIT ? 92 : 72);
    const list = new ScrollList(this, { x: r.x + 22, y: top, w: r.w - 40, h: bottom - top });
    list.setDepth(depth + 1);
    this.changesList = list;
    const w = r.w - 60;
    let y = 0;
    for (const e of entries) {
      const head = this.add.text(0, 0, `${e.version}  ${e.title}`, textStyle(IS_PORTRAIT ? 17 : 15, Css.gold, { fontStyle: 'bold' }));
      const body = this.add.text(0, head.height + 8, e.items.map((i) => `・${i}`).join('\n'), textStyle(IS_PORTRAIT ? 14 : 13, Css.text, {
        wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 5,
      }));
      const h = head.height + 8 + body.height;
      list.addItem(this.add.container(0, y, [head, body]), w, h, () => undefined);
      y += h + 22;
    }
    list.setContentHeight(Math.max(0, y - 22));
    add(new UIButton(this, r.x + r.w / 2, r.y + r.h - (IS_PORTRAIT ? 46 : 36), '閉じる', () => {
      this.closeChanges();
      if (isNew) {
        audio.update({ lastSeenVersion: __APP_VERSION__ });
        // Each new version met counts for the 古参章 (#205).
        saveProgress(withQuestEvents(loadProgress(), [['versionUpdate', 1]], Date.now()));
      }
    }, { variant: 'secondary', width: 220, height: IS_PORTRAIT ? 56 : 44, fontSize: 15 }));
  }

  private closeChanges(): void {
    for (const o of this.changesLayer) o.destroy();
    this.changesLayer = [];
    this.changesList?.destroy();
    this.changesList = undefined;
  }

  update(_time: number, delta: number): void {
    this.sea?.update(delta, this.game.loop.actualFps);
  }

  /** The main button's label (#198): the nation and rank to go back to, for a save in progress. */
  private continueText(): string {
    const save = loadSave();
    if (!isStarted(save, save.current)) return continueLabel(null, null);
    return continueLabel(NATION_INFO[save.current].jaShort, rankOf(loadProgress()).name);
  }

  /**
   * The title (#198): gold with a darker lower half and a thin dark edge; a light runs across it once when the
   * screen opens (not with less motion).
   */
  private addTitle(x: number, y: number, size: number, originX: number): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, TITLE, displayStyle(size, Css.gold, { letterSpacing: 12, shadow: FLEET_GLOW })).setOrigin(originX, 0.5);
    t.setStroke('#4a3208', 3);
    t.setTint(0xfff4cc, 0xfff4cc, 0xd99a2b, 0xb8801e);
    if (this.sea?.moving) {
      const b = t.getBounds();
      const shine = this.add.rectangle(b.x - 80, b.centerY, 60, b.height * 1.4, 0xffffff, 0.45).setAngle(18).setBlendMode(Phaser.BlendModes.ADD);
      const shape = this.make.graphics({}, false).fillRect(b.x, b.y, b.width, b.height);
      shine.setMask(shape.createGeometryMask());
      this.tweens.add({ targets: shine, x: b.right + 80, duration: 1400, delay: 300, ease: 'Sine.easeInOut', onComplete: () => shine.destroy() });
    }
    return t;
  }

  /** The seven ensigns (#198), the nation being played in front with its name under it. */
  private addFlags(cx: number, y: number, fw: number, fh: number, gap: number): void {
    const save = loadSave();
    const current = isStarted(save, save.current) ? save.current : null;
    const total = PLAYABLE_NATIONS.length * fw + (PLAYABLE_NATIONS.length - 1) * gap;
    const g = this.add.graphics();
    PLAYABLE_NATIONS.forEach((n, i) => {
      const x = cx - total / 2 + i * (fw + gap);
      const on = n === current;
      g.setAlpha(1);
      drawFlag(g, n, x, y, fw, fh);
      if (!on && current) {
        g.fillStyle(Colors.bgDeep, 0.45);
        g.fillRect(x, y, fw, fh);
      }
      if (on) {
        g.lineStyle(2, Colors.gold, 1);
        g.strokeRect(x - 3, y - 3, fw + 6, fh + 6);
      }
      this.add.text(x + fw / 2, y + fh + 6, NATION_INFO[n].jaShort, textStyle(11, on ? Css.gold : Css.muted, on ? { fontStyle: 'bold' } : {})).setOrigin(0.5, 0);
    });
  }

  /** Two columns: copy, flags and buttons on the left; the fleet crosses the sea behind. */
  private buildLandscape(): void {
    this.add.text(LEFT_X, CARD.y + 66, EN_TITLE, eyebrowStyle(14, Css.cyan));
    this.addTitle(LEFT_X - 6, CARD.y + 168, 116, 0);
    this.add.text(LEFT_X, CARD.y + 250, SUBTITLE, eyebrowStyle(13));
    this.add.text(LEFT_X, CARD.y + 282, TAGLINE, textStyle(20, '#c9d6ee', { fontStyle: 'bold' }));
    this.addFlags(LEFT_X + 260, CARD.y + 334, 52, 34, 22);

    new UIButton(this, LEFT_X + 180, CARD.y + 446, this.continueText(), () => this.scene.start(SceneKeys.HOME), {
      variant: 'gold',
      width: 360,
      height: 72,
      fontSize: 22,
    });
    new UIButton(this, LEFT_X + 470, CARD.y + 446, '操作方法', () => this.toggleHowTo(true), {
      variant: 'secondary',
      width: 180,
      height: 60,
      fontSize: 18,
    });

    this.buildInfoStrip(LEFT_X, CARD.y + 520, 660, 56);
  }

  /** One centred column for phones: the sea and fleet on top, then the title, flags, the main button and a strip. */
  private buildPortrait(): void {
    const cx = CANVAS_W / 2;
    const btnW = CARD.w - 96;

    this.add.text(cx, CARD.y + 420, EN_TITLE, eyebrowStyle(15, Css.cyan)).setOrigin(0.5);
    this.addTitle(cx + 6, CARD.y + 520, 128, 0.5);
    this.add.text(cx, CARD.y + 622, SUBTITLE, eyebrowStyle(14)).setOrigin(0.5);
    this.add.text(cx, CARD.y + 666, TAGLINE, textStyle(22, '#c9d6ee', { fontStyle: 'bold' })).setOrigin(0.5);
    this.addFlags(cx, CARD.y + 724, 60, 40, 14);

    new UIButton(this, cx, CARD.y + 866, this.continueText(), () => this.scene.start(SceneKeys.HOME), {
      variant: 'gold',
      width: btnW,
      height: 92,
      fontSize: 26,
    });
    new UIButton(this, cx, CARD.y + 968, '操作方法', () => this.toggleHowTo(true), {
      variant: 'secondary',
      width: btnW,
      height: 64,
      fontSize: 20,
    });

    this.buildInfoStrip(cx - btnW / 2, CARD.y + 1036, btnW, 84);
  }

  /** The three info tiles as one strip (#198): the title and the sea come first. */
  private buildInfoStrip(x: number, y: number, w: number, h: number): void {
    addPanel(this, x, y, w, h, { radius: 14, fillAlpha: 0.5 });
    const tiles = titleTiles(IS_PORTRAIT, sevenSeasWon(campaignData as unknown as ICampaignData, loadSave().nations));
    const cw = w / tiles.length;
    tiles.forEach((tile, i) => {
      const tx = x + i * cw + cw / 2;
      this.add.text(tx, y + h / 2 - (IS_PORTRAIT ? 14 : 10), tile.title, textStyle(IS_PORTRAIT ? 14 : 13, Css.gold, { fontStyle: 'bold' })).setOrigin(0.5);
      const body = this.add.text(tx, y + h / 2 + (IS_PORTRAIT ? 14 : 12), tile.body, textStyle(11, Css.muted)).setOrigin(0.5);
      fitText(body, cw - 12);
    });
  }

  private toggleHowTo(show: boolean): void {
    if (!show) {
      this.howToLayer?.destroy();
      this.howToLayer = null;
      return;
    }
    if (this.howToLayer) return;

    const rowH = IS_PORTRAIT ? 104 : 64;
    const w = IS_PORTRAIT ? 660 : 640;
    const h = 210 + CONTROLS.length * (rowH + 12);
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;

    const shade = this.add
      .rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72)
      .setOrigin(0, 0)
      .setInteractive();
    shade.on('pointerup', () => this.toggleHowTo(false));

    const panel = addPanel(this, x, y, w, h, { radius: 28, fill: Colors.panelHi, fillAlpha: 0.96, glow: 1 });
        const title = this.add.text(CANVAS_W / 2, y + 80, '操作方法', displayStyle(30)).setOrigin(0.5);

    // Landscape puts label and text side by side; portrait stacks them so long lines can wrap.
    const rows: Phaser.GameObjects.GameObject[] = [];
    CONTROLS.forEach((c, i) => {
      const ry = y + 120 + i * (rowH + 12);
      rows.push(addPanel(this, x + 30, ry, w - 60, rowH, { radius: 16, fillAlpha: 0.6 }));
      if (IS_PORTRAIT) {
        rows.push(this.add.text(x + 54, ry + 14, c.label, eyebrowStyle(13, Css.gold)));
        rows.push(this.add.text(x + 54, ry + 44, c.text, textStyle(14, Css.text, { wordWrap: { width: w - 108, useAdvancedWrap: true } })));
      } else {
        rows.push(this.add.text(x + 54, ry + rowH / 2, c.label, eyebrowStyle(13, Css.gold)).setOrigin(0, 0.5));
        rows.push(this.add.text(x + 150, ry + rowH / 2, c.text, textStyle(15, Css.text)).setOrigin(0, 0.5));
      }
    });

    const close = new UIButton(this, CANVAS_W / 2, y + h - 52, 'OK', () => this.toggleHowTo(false), {
      variant: 'primary',
      width: w - 60,
      height: IS_PORTRAIT ? 68 : 56,
    });

    this.howToLayer = this.add.container(0, 0, [shade, panel, title, ...rows, close]).setDepth(50);
  }
}
