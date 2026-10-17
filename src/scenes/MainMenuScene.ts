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

// Portrait means a phone (see Layout.ts), so the copy describes that device's controls.
const INFO_TILES: Array<{ title: string; body: string }> = [
  IS_PORTRAIT
    ? { title: '◎ 自動砲撃', body: '射程内の敵へ自動で撃つ' }
    : { title: '◎ 砲撃', body: '狙った地点へ主砲を放つ' },
  { title: '⚓ 陣形', body: '縦陣・複縦陣・輪形陣' },
  { title: '★ 勝利条件', body: '敵艦隊をすべて撃沈' },
];

const CONTROLS: Array<{ label: string; text: string }> = IS_PORTRAIT
  ? [
      { label: '移動', text: '海をタップした地点へ航行。左下のスティックでも操作できます' },
      { label: '目標', text: '敵艦をタップすると攻撃目標に指定' },
      { label: '砲撃', text: '射程内の目標へ自動で砲撃' },
      { label: 'AUTO', text: 'ON にすると自動で敵を追尾し、戦闘します' },
      { label: '魚雷', text: '魚雷ボタンで発射。射程内の目標へは自動でも発射します' },
      { label: '潜航', text: '潜水艦は潜航ボタンで潜航・浮上。潜航中は爆雷しか当たりません' },
    ]
  : [
      { label: '移動', text: 'W / S で前進・後退、A / D で旋回' },
      { label: '砲撃', text: 'マウスで照準、クリックで砲撃' },
      { label: 'AUTO', text: 'ボタンで自動航行・自動砲撃に切り替え' },
      { label: '魚雷', text: 'E キーまたはボタンで照準方向へ魚雷を発射' },
      { label: '潜航', text: 'Q キーで潜水艦が潜航・浮上 (潜航中は爆雷のみ有効)' },
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

    addHeroShip(this, cx, CARD.y + 270, 0.62);

    this.add.text(cx, CARD.y + 400, 'PACIFIC WAR  ×  NAVAL TACTICS', eyebrowStyle(13)).setOrigin(0.5);
    this.add.text(cx, CARD.y + 474, 'WW2 NAVAL', displayStyle(72, Css.text, { shadow: TITLE_SHADOW })).setOrigin(0.5);
    this.add
      .text(cx + 9, CARD.y + 580, 'FLEET', displayStyle(104, Css.gold, { letterSpacing: 18, shadow: FLEET_GLOW }))
      .setOrigin(0.5);
    this.add.text(cx, CARD.y + 682, TAGLINE, textStyle(22, '#c9d6ee', { fontStyle: 'bold' })).setOrigin(0.5);

    new UIButton(this, cx, CARD.y + 780, '出撃準備  →', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: 'primary',
      width: btnW,
      height: 80,
      fontSize: 26,
    });
    new UIButton(this, cx, CARD.y + 876, '操作方法', () => this.toggleHowTo(true), {
      variant: 'secondary',
      width: btnW,
      height: 68,
      fontSize: 22,
    });

    // Tiles stack as full-width rows so the enlarged phone text fits on one line.
    INFO_TILES.forEach((tile, i) => {
      const x = cx - btnW / 2;
      const y = CARD.y + 940 + i * 70;
      addPanel(this, x, y, btnW, 60, { radius: 14, fillAlpha: 0.55 });
      this.add.text(x + 20, y + 30, tile.title, textStyle(15, Css.gold, { fontStyle: 'bold' })).setOrigin(0, 0.5);
      this.add.text(x + btnW - 20, y + 30, tile.body, textStyle(12, Css.muted)).setOrigin(1, 0.5);
    });

    this.add.text(cx, CARD.y + CARD.h - 26, NATIONS, eyebrowStyle(10, Css.dim)).setOrigin(0.5);
  }

  private buildInfoTiles(left: number, y: number, w: number, h: number): void {
    INFO_TILES.forEach((tile, i) => {
      const x = left + i * (w + 14);
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
    const eyebrow = this.add.text(CANVAS_W / 2, y + 40, 'HOW TO PLAY', eyebrowStyle(13)).setOrigin(0.5);
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

    this.howToLayer = this.add.container(0, 0, [shade, panel, eyebrow, title, ...rows, close]).setDepth(50);
  }
}
