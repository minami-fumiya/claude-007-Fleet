import Phaser from 'phaser';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { IBattleResultData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, fitText, UIButton } from '@/ui/components/UIKit';
import { advanceSortie, endSortie } from '@/utils/SortieFlow';
import { ScrollList } from '@/ui/components/ScrollList';
import { voice } from '@/systems/VoiceSystem';
import { narrationLine } from '@/systems/CommentarySystem';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { withQuestEvents } from '@/systems/QuestSystem';

// Portrait text is enlarged (see uiFontSize), so the card and its stat tiles grow with it.
const CARD_W = IS_PORTRAIT ? 664 : 620;
const CARD_H = IS_PORTRAIT ? 710 : 590;
/** The card never runs past the screen (#421): lines that don't fit go behind a 詳細 button. */
const SCREEN_MARGIN = 12;
/** Where the header's rows sit (#421): the rank's note, the reason and the objective's achievement each have their own. */
const HEAD = { rankNote: 232, reason: 272, achievement: 302, stats: 330 };
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
const BUTTONS = IS_PORTRAIT ? { y1: 510, h1: 80, y2: 614, h2: 68 } : { y1: 460, h1: 60, y2: 534, h2: 52 };

/** 戦闘ログ (#106) */
const LOG_BUTTON_W = IS_PORTRAIT ? 170 : 150;
const LOG_DEPTH = 400;

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.RESULTS });
  }

  create(data: IBattleResultData): void {
    // The screen explains itself on the first visit (#316), once everything is drawn.
    this.events.once(Phaser.Scenes.Events.CREATE, () => showScreenHelp(this));
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
    // Why a win missed an S (#295) leads the report, in muted grey.
    const rewardLines = [data?.rankShortfall ?? '', data?.route ?? '', ...campaignLines, data?.reward ? `獲得  ${data.reward}` : '', data?.event ?? '', data?.cost ? `艦載機補充  −${data.cost}` : '', data?.medals?.length ? `勲章授与  ${data.medals.join('・')}` : '', data?.merit ?? '', data?.recruits ?? '', data?.advanceNote ?? ''].filter((l) => l);
    // Long lines wrap inside the card; their measured heights size the report area.
    const rewardTexts = rewardLines.map((line) =>
      this.add.text(CANVAS_W / 2, 0, line, textStyle(14, Css.cyan, { fontStyle: 'bold', align: 'center', wordWrap: { width: CARD_W - 56, useAdvancedWrap: true } })).setOrigin(0.5, 0),
    );
    // A new captain stands out (#179).
    rewardTexts.forEach((t, i) => {
      if (data?.recruits && rewardLines[i] === data.recruits) t.setColor(Css.gold);
      if (data?.rankShortfall && rewardLines[i] === data.rankShortfall) t.setColor(Css.muted).setFontSize(12);
    });
    const reportCols = !IS_PORTRAIT && reports.length >= REPORT_COLS_FROM ? 2 : 1;
    const captainLine = (r: (typeof reports)[number], short: boolean): string => {
      const up = r.leveledUp ? (short ? '  ▲' : '  ▲ 昇級') : '';
      return r.maxed ? `艦長 ${r.name}  Lv ${r.level} (最大)` : `艦長 ${r.name}  Lv ${r.level}  +${r.gained} XP${up}`;
    };
    // What fits under the stat cards (#421): the report lines in order while they fit, the rest (and the captains)
    // behind 詳細; nothing runs past the screen or into the buttons.
    const lineH = (t: Phaser.GameObjects.Text): number => Math.max(REPORT_LINE_H, t.height + 6);
    const budget = CANVAS_H - SCREEN_MARGIN * 2 - CARD_H - 18;
    const fullH = rewardTexts.reduce((sum, t) => sum + lineH(t), 0) + Math.ceil(reports.length / reportCols) * REPORT_LINE_H;
    let shownTexts = rewardTexts;
    let shownReports = reports;
    let hidden: string[] = [];
    if (fullH > budget) {
      let used = REPORT_LINE_H + 8;
      const keep = rewardTexts.findIndex((t) => (used += lineH(t)) > budget);
      const cut = keep === -1 ? rewardTexts.length : keep;
      shownTexts = rewardTexts.slice(0, cut);
      for (const t of rewardTexts.slice(cut)) t.destroy();
      hidden = [...rewardLines.slice(cut), ...reports.map((r) => captainLine(r, false))];
      shownReports = [];
    }
    const rewardH = shownTexts.reduce((sum, t) => sum + lineH(t), 0);
    const reportLines = Math.ceil(shownReports.length / reportCols);
    const moreH = hidden.length > 0 ? REPORT_LINE_H + 8 : 0;
    const reportH = reportLines + shownTexts.length > 0 || moreH > 0 ? 18 + rewardH + reportLines * REPORT_LINE_H + moreH : 0;
    const cardH = CARD_H + reportH;
    const x = (CANVAS_W - CARD_W) / 2;
    const y = Math.max(SCREEN_MARGIN, (CANVAS_H - cardH) / 2);
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
      this.add.text(rx, y + 136, '評価', eyebrowStyle(11, Css.muted)).setOrigin(0.5);
      this.add.text(rx, y + 190, data.rank, displayStyle(56, rankCss[data.rank] ?? Css.text)).setOrigin(0.5);
      // What the stat cards don't show: damage taken and ships lost.
      if (data.rankNote) fitText(this.add.text(rx, y + HEAD.rankNote, data.rankNote, textStyle(11, Css.muted)).setOrigin(0.5, 0), 210);
    }
    fitText(this.add
      .text(CANVAS_W / 2, y + HEAD.reason, data?.reason ?? (victory ? '敵艦隊を殲滅した！' : '旗艦が撃沈された…'), textStyle(18, Css.text, { fontStyle: 'bold' }))
      .setOrigin(0.5), CARD_W - 56);
    // How far the objective was achieved (#421), on its own row under the reason.
    if (data?.achievement) fitText(this.add.text(CANVAS_W / 2, y + HEAD.achievement, `達成度  ${data.achievement}`, textStyle(13, Css.gold, { fontStyle: 'bold' })).setOrigin(0.5), CARD_W - 56);

    const sunk = data?.enemiesSunk ?? 0;
    const total = data?.enemiesTotal ?? 0;
    const survivors = data?.survivors ?? 0;
    const fleetSize = data?.fleetSize ?? 0;
    const seconds = Math.max(0, Math.round(data?.durationSec ?? 0));
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

    const cardW = STAT.w;
    const gap = STAT.gap;
    const startX = CANVAS_W / 2 - (cardW * 3 + gap * 2) / 2;
    // Land targets show beside the ships, not in their count (#278).
    const land = data?.landTotal ? `  陸 ${data.landKills ?? 0}/${data.landTotal}` : '';
    // The objective's own numbers (#421), else the ships sunk, those left and the time.
    const cards = data?.objectiveStats?.length === 3 ? data.objectiveStats : [{ label: '撃沈', value: `${sunk} / ${total}` }, { label: '残存', value: `${survivors} / ${fleetSize}` }, { label: '戦闘時間', value: time }];
    const cardCss = [Css.gold, Css.success, Css.cyan];
    cards.forEach((c, i) => {
      const value = c.label === '撃沈' ? `${c.value}${land}` : c.value;
      addStatCard(this, startX + (cardW + gap) * i, y + HEAD.stats, cardW, STAT.h, c.label, value, cardCss[i]);
    });

    let ty = y + HEAD.stats + STAT.h + 22;
    for (const t of shownTexts) {
      t.setY(ty).setDepth(1);
      ty += Math.max(REPORT_LINE_H, t.height + 6);
    }
    const colW = (CARD_W - 40) / reportCols;
    shownReports.forEach((r, j) => {
      const ry = ty + Math.floor(j / reportCols) * REPORT_LINE_H;
      const cx = reportCols === 1 ? CANVAS_W / 2 : x + 20 + colW * (j % reportCols) + colW / 2;
      const t = this.add
        .text(cx, ry, captainLine(r, reportCols !== 1), textStyle(reportCols === 1 ? 14 : 12, r.leveledUp ? Css.gold : Css.muted, { fontStyle: 'bold' }))
        .setOrigin(0.5, 0);
      fitText(t, colW - 8);
    });
    ty += reportLines * REPORT_LINE_H;
    if (hidden.length > 0) {
      new UIButton(this, CANVAS_W / 2, ty + REPORT_LINE_H / 2, `詳細 (ほか ${hidden.length} 件)  ›`, () => this.openList('結果の詳細', hidden), {
        variant: 'secondary', width: IS_PORTRAIT ? 300 : 240, height: REPORT_LINE_H + 4, fontSize: 13,
      });
    }

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
    // 戦闘ログ (#106) shares the last row with the way back.
    const logs = data?.log ?? [];
    const backW = logs.length > 0 ? CARD_W - 96 - 12 - LOG_BUTTON_W : CARD_W - 96;
    new UIButton(this, CANVAS_W / 2 - (CARD_W - 96) / 2 + backW / 2, y + reportH + BUTTONS.y2, advance ? '撤退 (報酬はそのまま)' : BACK_LABEL[data?.returnScene ?? SceneKeys.HOME] ?? '鎮守府へ戻る', () => {
      endSortie(this);
      this.scene.start(data?.returnScene ?? SceneKeys.HOME);
    }, {
      variant: 'secondary',
      width: backW,
      height: BUTTONS.h2,
      fontSize: 17,
    });
    if (logs.length > 0) {
      new UIButton(this, CANVAS_W / 2 + (CARD_W - 96) / 2 - LOG_BUTTON_W / 2, y + reportH + BUTTONS.y2, '戦闘ログ', () => this.openLog(logs), {
        variant: 'secondary', width: LOG_BUTTON_W, height: BUTTONS.h2, fontSize: 15,
      });
    }
    // ナレーション (#106): the outcome and its rank, then a promotion.
    const promoted = /昇進: .+ → (\S+)/.exec(data?.merit ?? '')?.[1];
    voice.say([narrationLine(victory ? 'victory' : 'defeat', { rank: data?.rank ?? '' }), promoted ? narrationLine('promotion', { rank: promoted }) : ''].filter((l) => l).join('。'), 'narration');
  }

  /** 戦闘ログ (#106): what the commentary said, in a scrolling sheet. */
  private openLog(lines: string[]): void {
    // 戦闘記録章 (#106) counts the logs read.
    saveProgress(withQuestEvents(loadProgress(), [['logView', 1]], Date.now()));
    this.openList(`戦闘ログ (${lines.length})`, lines);
  }

  /** A scrolling sheet of lines (the battle log, or the results that did not fit the card, #421). */
  private openList(title: string, lines: string[]): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(LOG_DEPTH);
      layer.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const r = IS_PORTRAIT ? { x: 24, y: 120, w: CANVAS_W - 48, h: CANVAS_H - 240 } : { x: 240, y: 60, w: 800, h: 600 };
    add(addPanel(this, r.x, r.y, r.w, r.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(r.x + 24, r.y + 20, title, eyebrowStyle(11, Css.cyan)));
    const top = r.y + 56;
    const bottom = r.y + r.h - (IS_PORTRAIT ? 90 : 70);
    const list = new ScrollList(this, { x: r.x + 20, y: top, w: r.w - 40, h: bottom - top });
    list.setDepth(LOG_DEPTH + 1);
    // Long lines (the recruits, #421) wrap and take the room they need.
    const rowH = IS_PORTRAIT ? 34 : 28;
    let ly = 0;
    for (const line of lines) {
      const t = this.add.text(0, ly, line, textStyle(13, Css.text, { wordWrap: { width: r.w - 48, useAdvancedWrap: true } })).setOrigin(0, 0);
      list.add(t);
      ly += Math.max(rowH, t.height + 8);
    }
    list.setContentHeight(ly);
    add(new UIButton(this, r.x + r.w / 2, r.y + r.h - (IS_PORTRAIT ? 44 : 34), '閉じる', () => {
      list.destroy();
      layer.forEach((o) => o.destroy());
    }, { variant: 'secondary', width: 200, height: IS_PORTRAIT ? 52 : 40, fontSize: 15 }));
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
