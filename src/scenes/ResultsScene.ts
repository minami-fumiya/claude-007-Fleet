import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { IBattleResultData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, UIButton } from '@/ui/components/UIKit';

// Portrait text is enlarged (see uiFontSize), so the card and its stat tiles grow with it.
const CARD_W = IS_PORTRAIT ? 664 : 620;
const CARD_H = IS_PORTRAIT ? 680 : 560;
const STAT = IS_PORTRAIT ? { w: 202, h: 104, gap: 12 } : { w: 168, h: 72, gap: 14 };
const REPORT_LINE_H = IS_PORTRAIT ? 34 : 24;
const BUTTONS = IS_PORTRAIT ? { y1: 480, h1: 80, y2: 584, h2: 68 } : { y1: 430, h1: 60, y2: 504, h2: 52 };

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.RESULTS });
  }

  create(data: IBattleResultData): void {
    const victory = data?.victory ?? false;
    const accent = victory ? Colors.gold : Colors.danger;
    const accentCss = victory ? Css.gold : Css.danger;

    addBackdrop(this, 'menu');
    // Tint the scene toward the outcome colour
    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, accent, 0.05).setOrigin(0, 0);

    // Captain XP lines push the buttons down and grow the card.
    const reports = data?.captainReports ?? [];
    const rewardLines = [data?.campaign ?? '', data?.reward ? `獲得  ${data.reward}` : '', data?.cost ? `艦載機補充  −${data.cost}` : ''].filter((l) => l);
    const lineCount = reports.length + rewardLines.length;
    const reportH = lineCount > 0 ? 18 + lineCount * REPORT_LINE_H : 0;
    const cardH = CARD_H + reportH;
    const x = (CANVAS_W - CARD_W) / 2;
    const y = (CANVAS_H - cardH) / 2;
    addPanel(this, x, y, CARD_W, cardH, { radius: 32, fillAlpha: 0.7, rim: accent, rimAlpha: 0.45, glow: 1 });

    this.drawEmblem(CANVAS_W / 2, y + 84, accent, victory);

    this.add.text(CANVAS_W / 2, y + 160, 'BATTLE REPORT', eyebrowStyle(13, Css.cyan)).setOrigin(0.5);
    this.add
      .text(CANVAS_W / 2, y + 210, victory ? 'VICTORY' : 'DEFEAT', displayStyle(64, accentCss, {
        letterSpacing: 10,
        shadow: { offsetX: 0, offsetY: 0, color: victory ? 'rgba(255,201,74,0.5)' : 'rgba(255,95,122,0.5)', blur: 24, fill: true },
      }))
      .setOrigin(0.5);
    this.add
      .text(CANVAS_W / 2, y + 262, victory ? '敵艦隊を殲滅した！' : '旗艦が撃沈された…', textStyle(18, Css.text, { fontStyle: 'bold' }))
      .setOrigin(0.5);

    const sunk = data?.enemiesSunk ?? 0;
    const total = data?.enemiesTotal ?? 0;
    const survivors = data?.survivors ?? 0;
    const fleetSize = data?.fleetSize ?? 0;
    const seconds = Math.max(0, Math.round(data?.durationSec ?? 0));
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

    const cardW = STAT.w;
    const gap = STAT.gap;
    const startX = CANVAS_W / 2 - (cardW * 3 + gap * 2) / 2;
    addStatCard(this, startX, y + 300, cardW, STAT.h, '撃沈 SUNK', `${sunk} / ${total}`, Css.gold);
    addStatCard(this, startX + cardW + gap, y + 300, cardW, STAT.h, '残存 AFLOAT', `${survivors} / ${fleetSize}`, Css.success);
    addStatCard(this, startX + (cardW + gap) * 2, y + 300, cardW, STAT.h, '戦闘時間 TIME', time, Css.cyan);

    rewardLines.forEach((line, i) => {
      this.add
        .text(CANVAS_W / 2, y + 300 + STAT.h + 22 + i * REPORT_LINE_H, line, textStyle(14, Css.cyan, { fontStyle: 'bold' }))
        .setOrigin(0.5, 0);
    });
    reports.forEach((r, j) => {
      const i = j + rewardLines.length;
      const ry = y + 300 + STAT.h + 22 + i * REPORT_LINE_H;
      const up = r.leveledUp ? '  ▲ LEVEL UP' : '';
      this.add
        .text(CANVAS_W / 2, ry, `艦長 ${r.name}  Lv ${r.level}  +${r.gained} XP${up}`, textStyle(14, r.leveledUp ? Css.gold : Css.muted, { fontStyle: 'bold' }))
        .setOrigin(0.5, 0);
    });

    new UIButton(this, CANVAS_W / 2, y + reportH + BUTTONS.y1, '再出撃', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: victory ? 'gold' : 'primary',
      width: CARD_W - 96,
      height: BUTTONS.h1,
      fontSize: 22,
      caption: 'RETRY',
    });
    new UIButton(this, CANVAS_W / 2, y + reportH + BUTTONS.y2, data?.campaign ? '作戦地図へ戻る' : '鎮守府へ戻る', () => this.scene.start(data?.campaign ? SceneKeys.CAMPAIGN : SceneKeys.HOME), {
      variant: 'secondary',
      width: CARD_W - 96,
      height: BUTTONS.h2,
      fontSize: 17,
    });
  }

  private drawEmblem(cx: number, cy: number, color: number, victory: boolean): void {
    const g = this.add.graphics();
    g.fillStyle(color, 0.12);
    g.fillCircle(cx, cy, 48);
    g.lineStyle(2, color, 0.8);
    g.strokeCircle(cx, cy, 48);
    g.lineStyle(1, color, 0.3);
    g.strokeCircle(cx, cy, 60);

    // Anchor glyph
    g.lineStyle(4, color, 1);
    g.strokeCircle(cx, cy - 22, 6);
    g.lineBetween(cx, cy - 16, cx, cy + 24);
    g.lineBetween(cx - 16, cy - 6, cx + 16, cy - 6);
    g.beginPath();
    g.arc(cx, cy + 4, 22, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
    g.strokePath();

    this.tweens.add({
      targets: g,
      alpha: victory ? 0.75 : 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
