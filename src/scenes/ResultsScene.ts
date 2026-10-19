import Phaser from 'phaser';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { IBattleResultData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, UIButton } from '@/ui/components/UIKit';
import { advanceSortie, endSortie } from '@/utils/SortieFlow';

// Portrait text is enlarged (see uiFontSize), so the card and its stat tiles grow with it.
const CARD_W = IS_PORTRAIT ? 664 : 620;
const CARD_H = IS_PORTRAIT ? 680 : 560;
const STAT = IS_PORTRAIT ? { w: 202, h: 104, gap: 12 } : { w: 168, h: 72, gap: 14 };
const BACK_LABEL: Record<string, string> = {
  [SceneKeys.HOME]: '鎮守府へ戻る',
  [SceneKeys.CAMPAIGN]: '作戦地図へ戻る',
  [SceneKeys.SCENARIO]: 'シナリオ選択へ戻る',
};
/** Landscape: 8 lines (campaign, reward, cost, medals, merit, 3 captains) must still fit in 720 px. */
const REPORT_LINE_H = IS_PORTRAIT ? 34 : 20;
/** Landscape: more than 3 captains (fleets of up to 8) go in two columns so the card still fits. */
const REPORT_COLS_FROM = 4;
const BUTTONS = IS_PORTRAIT ? { y1: 480, h1: 80, y2: 584, h2: 68 } : { y1: 430, h1: 60, y2: 504, h2: 52 };

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.RESULTS });
  }

  create(data: IBattleResultData): void {
    // First-play tutorial (#90): drawn above the screen, so it can be made first.
    new TutorialGuide(this);
    const victory = data?.victory ?? false;
    const accent = victory ? Colors.gold : Colors.danger;
    const accentCss = victory ? Css.gold : Css.danger;

    addBackdrop(this, 'menu');
    // Tint the scene toward the outcome colour
    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, accent, 0.05).setOrigin(0, 0);

    // Captain XP lines push the buttons down and grow the card.
    const reports = data?.captainReports ?? [];
    // The campaign line ("海域攻略: … 初回報酬 …") is split at its reward so neither half runs off the card (#69).
    const campaignLines = (data?.campaign ?? '').split(/\s{2,}(?=初回報酬)/);
    const rewardLines = [data?.route ?? '', ...campaignLines, data?.reward ? `獲得  ${data.reward}` : '', data?.event ?? '', data?.cost ? `艦載機補充  −${data.cost}` : '', data?.medals?.length ? `勲章授与  ${data.medals.join('・')}` : '', data?.merit ?? '', data?.recruits ?? '', data?.advanceNote ?? ''].filter((l) => l);
    // Long lines wrap inside the card; their measured heights size the report area.
    const rewardTexts = rewardLines.map((line) =>
      this.add.text(CANVAS_W / 2, 0, line, textStyle(14, Css.cyan, { fontStyle: 'bold', align: 'center', wordWrap: { width: CARD_W - 56, useAdvancedWrap: true } })).setOrigin(0.5, 0),
    );
    // A new captain stands out (#179).
    rewardTexts.forEach((t, i) => {
      if (data?.recruits && rewardLines[i] === data.recruits) t.setColor(Css.gold);
    });
    const rewardH = rewardTexts.reduce((sum, t) => sum + Math.max(REPORT_LINE_H, t.height + 6), 0);
    const reportCols = !IS_PORTRAIT && reports.length >= REPORT_COLS_FROM ? 2 : 1;
    const reportLines = Math.ceil(reports.length / reportCols);
    const reportH = reportLines + rewardTexts.length > 0 ? 18 + rewardH + reportLines * REPORT_LINE_H : 0;
    const cardH = CARD_H + reportH;
    const x = (CANVAS_W - CARD_W) / 2;
    const y = (CANVAS_H - cardH) / 2;
    addPanel(this, x, y, CARD_W, cardH, { radius: 32, fillAlpha: 0.7, rim: accent, rimAlpha: 0.45, glow: 1 });

    this.drawEmblem(CANVAS_W / 2, y + 84, accent, victory);

    this.add.text(CANVAS_W / 2, y + 160, '戦闘結果', eyebrowStyle(13, Css.cyan)).setOrigin(0.5);
    this.add
      .text(CANVAS_W / 2, y + 210, victory ? '勝利' : '敗北', displayStyle(64, accentCss, {
        letterSpacing: 24,
        shadow: { offsetX: 0, offsetY: 0, color: victory ? 'rgba(255,201,74,0.5)' : 'rgba(255,95,122,0.5)', blur: 24, fill: true },
      }))
      .setOrigin(0.5);
    if (data?.rank) {
      // Battle rank (#149) beside the outcome.
      const rankCss: Record<string, string> = { S: Css.gold, A: Css.cyan, B: Css.text, C: Css.muted, D: Css.danger };
      const rx = CANVAS_W / 2 + (IS_PORTRAIT ? 200 : 190);
      this.add.text(rx, y + 168, '評価', eyebrowStyle(11, Css.muted)).setOrigin(0.5);
      this.add.text(rx, y + 212, data.rank, displayStyle(56, rankCss[data.rank] ?? Css.text)).setOrigin(0.5);
      // What the stat cards don't show: damage taken and ships lost.
      if (data.rankNote) this.add.text(rx, y + 250, data.rankNote, textStyle(11, Css.muted)).setOrigin(0.5, 0);
    }
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
    addStatCard(this, startX, y + 300, cardW, STAT.h, '撃沈', `${sunk} / ${total}`, Css.gold);
    addStatCard(this, startX + cardW + gap, y + 300, cardW, STAT.h, '残存', `${survivors} / ${fleetSize}`, Css.success);
    addStatCard(this, startX + (cardW + gap) * 2, y + 300, cardW, STAT.h, '戦闘時間', time, Css.cyan);

    let ty = y + 300 + STAT.h + 22;
    for (const t of rewardTexts) {
      t.setY(ty).setDepth(1);
      ty += Math.max(REPORT_LINE_H, t.height + 6);
    }
    const colW = (CARD_W - 40) / reportCols;
    reports.forEach((r, j) => {
      const ry = ty + Math.floor(j / reportCols) * REPORT_LINE_H;
      const cx = reportCols === 1 ? CANVAS_W / 2 : x + 20 + colW * (j % reportCols) + colW / 2;
      const up = r.leveledUp ? (reportCols === 1 ? '  ▲ 昇級' : '  ▲') : '';
      const t = this.add
        .text(cx, ry, r.maxed ? `艦長 ${r.name}  Lv ${r.level} (最大)` : `艦長 ${r.name}  Lv ${r.level}  +${r.gained} XP${up}`, textStyle(reportCols === 1 ? 14 : 12, r.leveledUp ? Css.gold : Css.muted, { fontStyle: 'bold' }))
        .setOrigin(0.5, 0);
      if (t.width > colW - 8) t.setScale((colW - 8) / t.width);
    });

    // Mid-sortie (#53): advance to the next node, or withdraw keeping what was won.
    const advance = data?.advance === true;
    // A campaign battle that can't advance (the main fleet, a defeat, everyone 大破) ends the sortie (#138).
    if (!advance && data?.returnScene === SceneKeys.CAMPAIGN) endSortie(this);
    const by1 = y + reportH + BUTTONS.y1;
    if (advance) {
      new UIButton(this, CANVAS_W / 2, by1, '進撃  ›', () => {
        const next = advanceSortie(this);
        if (next) this.scene.start(SceneKeys.BATTLE, next.init);
        else this.scene.start(SceneKeys.CAMPAIGN);
      }, { variant: victory ? 'gold' : 'primary', width: CARD_W - 96, height: BUTTONS.h1, fontSize: 22 });
    } else if (data?.retry) {
      // Historical scenarios replay their fixed setup.
      new UIButton(this, CANVAS_W / 2, by1, '再出撃', () => this.scene.start(SceneKeys.BATTLE, data.retry), {
        variant: victory ? 'gold' : 'primary', width: CARD_W - 96, height: BUTTONS.h1, fontSize: 22,
      });
    } else {
      // Two ways to go again (#135): straight back in with the same fleet, or via the fleet builder.
      const gap = 12;
      const half = (CARD_W - 96 - gap) / 2;
      new UIButton(this, CANVAS_W / 2 - gap / 2 - half / 2, by1, 'そのまま連戦', () => {
        endSortie(this);
        this.scene.start(SceneKeys.FLEET_BUILDER, { rematch: true });
      }, { variant: victory ? 'gold' : 'primary', width: half, height: BUTTONS.h1, fontSize: 19 });
      new UIButton(this, CANVAS_W / 2 + gap / 2 + half / 2, by1, '編成して再出撃', () => {
        endSortie(this);
        this.scene.start(SceneKeys.FLEET_BUILDER);
      }, { variant: 'primary', width: half, height: BUTTONS.h1, fontSize: 17 });
    }
    new UIButton(this, CANVAS_W / 2, y + reportH + BUTTONS.y2, advance ? '撤退 (報酬はそのまま)' : BACK_LABEL[data?.returnScene ?? SceneKeys.HOME] ?? '鎮守府へ戻る', () => {
      endSortie(this);
      this.scene.start(data?.returnScene ?? SceneKeys.HOME);
    }, {
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
