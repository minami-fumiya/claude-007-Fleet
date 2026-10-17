import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, UIButton } from '@/ui/components/UIKit';
import { addHeroShip } from '@/ui/components/HeroShip';

const CARD = IS_PORTRAIT
  ? { x: 32, y: 48, w: CANVAS_W - 64, h: CANVAS_H - 96 }
  : { x: 70, y: 56, w: CANVAS_W - 140, h: CANVAS_H - 112 };
const LEFT_X = CARD.x + 72;

const TITLE_SHADOW = { offsetX: 0, offsetY: 6, color: 'rgba(0,0,0,0.6)', blur: 12, fill: true };
const FLEET_GLOW = { offsetX: 0, offsetY: 0, color: 'rgba(255,201,74,0.55)', blur: 24, fill: true };
const TAGLINE = '艦隊を編成し、太平洋の制海権を握れ。';
const NATIONS = 'IJN · USN · KRIEGSMARINE · ROYAL NAVY';

const INFO_TILES: Array<{ title: string; body: string }> = [
  { title: '◎ 砲撃', body: '狙った地点へ主砲を放つ' },
  { title: '⚓ 陣形', body: '縦陣・複縦陣・輪形陣' },
  { title: '★ 勝利条件', body: '敵艦隊をすべて撃沈' },
];

const CONTROLS: Array<{ device: string; move: string; fire: string }> = [
  { device: 'PC', move: 'W / S で前進・後退、A / D で旋回', fire: 'マウスで照準、クリックで砲撃' },
  { device: 'スマホ', move: '左下のスティックで進みたい方向へ', fire: '画面をタップした地点へ砲撃' },
];

export class MainMenuScene extends Phaser.Scene {
  private howToLayer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SceneKeys.MAIN_MENU });
  }

  create(): void {
    this.howToLayer = null;
    addBackdrop(this, 'menu');
    addPanel(this, CARD.x, CARD.y, CARD.w, CARD.h, { radius: 32, fillAlpha: 0.45, glow: 1 });

    if (IS_PORTRAIT) {
      this.buildPortrait();
    } else {
      this.buildLandscape();
    }
  }

  /** Two columns: copy and buttons on the left, the hero ship on the right. */
  private buildLandscape(): void {
    addHeroShip(this, CARD.x + CARD.w - 330, CARD.y + 330, 0.95);

    this.add.text(LEFT_X, CARD.y + 70, 'PACIFIC WAR  ×  NAVAL TACTICS', eyebrowStyle(13));
    this.add.text(LEFT_X - 4, CARD.y + 92, 'WW2 NAVAL', displayStyle(78, Css.text, { shadow: TITLE_SHADOW }));
    this.add.text(LEFT_X - 2, CARD.y + 180, 'FLEET', displayStyle(96, Css.gold, { letterSpacing: 18, shadow: FLEET_GLOW }));
    this.add.text(LEFT_X, CARD.y + 300, TAGLINE, textStyle(20, '#c9d6ee', { fontStyle: 'bold' }));

    new UIButton(this, LEFT_X + 140, CARD.y + 386, '出撃準備  →', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: 'primary',
      width: 280,
      height: 64,
      fontSize: 22,
    });
    new UIButton(this, LEFT_X + 400, CARD.y + 386, '操作方法', () => this.toggleHowTo(true), {
      variant: 'secondary',
      width: 200,
      height: 64,
      fontSize: 20,
    });

    this.buildInfoTiles(LEFT_X, CARD.y + 462, 196, 76);

    this.add
      .text(CARD.x + CARD.w - 40, CARD.y + CARD.h - 28, NATIONS, eyebrowStyle(10, Css.dim))
      .setOrigin(1, 0.5);
  }

  /** One centred column for phones: hero ship, title, full-width buttons, tiles. */
  private buildPortrait(): void {
    const cx = CANVAS_W / 2;
    const btnW = CARD.w - 96;

    addHeroShip(this, cx, CARD.y + 300, 0.62);

    this.add.text(cx, CARD.y + 430, 'PACIFIC WAR  ×  NAVAL TACTICS', eyebrowStyle(13)).setOrigin(0.5);
    this.add.text(cx, CARD.y + 504, 'WW2 NAVAL', displayStyle(72, Css.text, { shadow: TITLE_SHADOW })).setOrigin(0.5);
    this.add
      .text(cx + 9, CARD.y + 610, 'FLEET', displayStyle(104, Css.gold, { letterSpacing: 18, shadow: FLEET_GLOW }))
      .setOrigin(0.5);
    this.add.text(cx, CARD.y + 712, TAGLINE, textStyle(22, '#c9d6ee', { fontStyle: 'bold' })).setOrigin(0.5);

    new UIButton(this, cx, CARD.y + 810, '出撃準備  →', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: 'primary',
      width: btnW,
      height: 80,
      fontSize: 26,
    });
    new UIButton(this, cx, CARD.y + 910, '操作方法', () => this.toggleHowTo(true), {
      variant: 'secondary',
      width: btnW,
      height: 68,
      fontSize: 22,
    });

    const tileW = (btnW - 24) / 3;
    this.buildInfoTiles(cx - btnW / 2, CARD.y + 980, tileW, 96);

    this.add.text(cx, CARD.y + CARD.h - 36, NATIONS, eyebrowStyle(10, Css.dim)).setOrigin(0.5);
  }

  private buildInfoTiles(left: number, y: number, w: number, h: number): void {
    INFO_TILES.forEach((tile, i) => {
      const x = left + i * (w + (IS_PORTRAIT ? 12 : 14));
      addPanel(this, x, y, w, h, { radius: 14, fillAlpha: 0.55 });
      this.add.text(x + 16, y + 14, tile.title, textStyle(15, Css.gold, { fontStyle: 'bold' }));
      this.add.text(x + 16, y + 44, tile.body, textStyle(12, Css.muted));
    });
  }

  private toggleHowTo(show: boolean): void {
    if (!show) {
      this.howToLayer?.destroy();
      this.howToLayer = null;
      return;
    }
    if (this.howToLayer) return;

    const w = 640;
    const h = 420;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;

    const shade = this.add
      .rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72)
      .setOrigin(0, 0)
      .setInteractive();
    shade.on('pointerup', () => this.toggleHowTo(false));

    const panel = addPanel(this, x, y, w, h, { radius: 28, fill: Colors.panelHi, fillAlpha: 0.96, glow: 1 });
    const eyebrow = this.add.text(CANVAS_W / 2, y + 40, 'HOW TO PLAY', eyebrowStyle(13)).setOrigin(0.5);
    const title = this.add.text(CANVAS_W / 2, y + 78, '操作方法', displayStyle(30)).setOrigin(0.5);

    const rows: Phaser.GameObjects.GameObject[] = [];
    CONTROLS.forEach((c, i) => {
      const ry = y + 120 + i * 92;
      rows.push(addPanel(this, x + 36, ry, w - 72, 78, { radius: 16, fillAlpha: 0.6 }));
      rows.push(this.add.text(x + 60, ry + 39, c.device, eyebrowStyle(14)).setOrigin(0, 0.5));
      rows.push(this.add.text(x + 170, ry + 22, `移動  ${c.move}`, textStyle(14, Css.text)));
      rows.push(this.add.text(x + 170, ry + 46, `砲撃  ${c.fire}`, textStyle(14, Css.muted)));
    });

    const close = new UIButton(this, CANVAS_W / 2, y + h - 52, 'OK', () => this.toggleHowTo(false), {
      variant: 'primary',
      width: w - 72,
      height: 56,
    });

    this.howToLayer = this.add.container(0, 0, [shade, panel, eyebrow, title, ...rows, close]).setDepth(50);
  }
}
