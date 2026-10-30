import Phaser from 'phaser';
import { IS_PORTRAIT } from '@/config/GameConstants';
import { IResources, ITechNode, TechBranch } from '@/types/Progression';
import {
  branchNodes,
  branchProgress,
  canResearch,
  medalMet,
  prerequisitesMet,
  rankMet,
  regenMultiplier,
  researchModifiers,
  TECH_BRANCHES,
} from '@/systems/ResearchSystem';
import { describeModifiers } from '@/systems/CustomizationSystem';
import { medalName, researchMedal } from '@/systems/MedalGate';
import { canAfford, formatResources, scaleCost } from '@/systems/ResourceSystem';
import { RANKS } from '@/systems/RankSystem';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

export interface IResearchViewArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tabs per row: one row of 13 in landscape, two rows of 7 in portrait. */
const TAB_COLS = IS_PORTRAIT ? 7 : 13;
const TAB_H = IS_PORTRAIT ? 58 : 44;
const TAB_GAP = IS_PORTRAIT ? 6 : 8;
/** Node cards: ten levels a branch (#298) — two columns of five in portrait, five columns of two in landscape. */
const CARD_COLS = IS_PORTRAIT ? 2 : 5;
const CARD_GAP = IS_PORTRAIT ? 8 : 10;
const LEVEL_COL = IS_PORTRAIT ? 40 : 44;

/** The tab the player looked at last (kept while the game runs). */
let lastBranch: TechBranch = 'gunnery';

interface ICard {
  node: ITechNode;
  frame: Phaser.GameObjects.Graphics;
  state: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  requires: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  w: number;
  h: number;
}

/**
 * The research tree as branch tabs (砲術・水雷 … 建造) over the selected branch's projects, ordered by level.
 * Each card shows the level, effect, prerequisites (with the branch of cross-branch ones), cost and state.
 * Reads and writes research only through the callbacks, so the scene decides where progress lives.
 */
export class ResearchView {
  private tabs: UIButton[] = [];
  private summary!: Phaser.GameObjects.Text;
  private cards: ICard[] = [];
  private cardLayer: Phaser.GameObjects.Container | null = null;
  private readonly cardsTop: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly area: IResearchViewArea,
    private readonly tree: ITechNode[],
    private readonly state: () => { done: string[]; resources: IResources; costMul?: number; medals?: string[]; rankIndex?: number },
    private readonly onResearch: (node: ITechNode) => void,
  ) {
    const rows = Math.ceil(TECH_BRANCHES.length / TAB_COLS);
    const tabW = (area.w - TAB_GAP * (TAB_COLS - 1)) / TAB_COLS;
    this.tabs = TECH_BRANCHES.map((b, i) => {
      const col = i % TAB_COLS;
      const row = Math.floor(i / TAB_COLS);
      return new UIButton(
        scene,
        area.x + col * (tabW + TAB_GAP) + tabW / 2,
        area.y + row * (TAB_H + TAB_GAP) + TAB_H / 2,
        b.name,
        () => this.select(b.id),
        { variant: 'secondary', width: tabW, height: TAB_H, fontSize: 13, caption: ' ' },
      );
    });
    const summaryY = area.y + rows * (TAB_H + TAB_GAP) + 4;
    this.summary = scene.add.text(area.x + 4, summaryY, '', textStyle(12, Css.muted, { wordWrap: { width: area.w - 8, useAdvancedWrap: true } }));
    this.cardsTop = summaryY + (IS_PORTRAIT ? 64 : 40);
    this.select(lastBranch);
  }

  private select(branch: TechBranch): void {
    lastBranch = branch;
    this.buildCards(branch);
    this.refresh();
  }

  private buildCards(branch: TechBranch): void {
    this.cardLayer?.destroy();
    this.cards = [];
    const nodes = branchNodes(this.tree, branch);
    const rows = Math.ceil(nodes.length / CARD_COLS);
    const w = (this.area.w - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS;
    const avail = this.area.y + this.area.h - this.cardsTop;
    const h = Math.min(IS_PORTRAIT ? 172 : 230, (avail - CARD_GAP * (rows - 1)) / rows);
    const layer = this.scene.add.container(0, 0);
    nodes.forEach((node, i) => {
      const x = this.area.x + (i % CARD_COLS) * (w + CARD_GAP);
      const y = this.cardsTop + Math.floor(i / CARD_COLS) * (h + CARD_GAP);
      const tx = LEVEL_COL + 6;
      const tw = w - tx - 10;
      const frame = this.scene.add.graphics();
      // "LV" sits on top of the number, never over it (#381: they touched on a phone).
      const lv = this.scene.add.text(LEVEL_COL / 2 + 4, h / 2 - 2, 'LV', eyebrowStyle(9, Css.muted)).setOrigin(0.5, 1);
      const level = this.scene.add
        .text(LEVEL_COL / 2 + 4, h / 2, String(node.level), textStyle(IS_PORTRAIT ? 18 : 20, Css.gold, { fontStyle: '900' }))
        .setOrigin(0.5, 0);
      // The state sits at the top right, beside the name, so a long requirement (rank, prerequisites and a medal) has
      // room under the effect (#336: it ran over the effect on a phone).
      const state = this.scene.add.text(w - 10, 12, '', eyebrowStyle(10, Css.cyan)).setOrigin(1, 0);
      // One line: a long name (ダメージコントロール VIII) shrinks beside the state instead of wrapping under it (#381).
      const name = this.scene.add.text(tx, 10, node.name, textStyle(13, Css.text, { fontStyle: 'bold' }));
      const desc = this.scene.add.text(tx, name.y + name.height + 4, node.description, textStyle(11, Css.muted, { wordWrap: { width: tw, useAdvancedWrap: true } }));
      const cost = this.scene.add.text(tx, h - 8, formatResources(scaleCost(node.cost, this.state().costMul ?? 1)), textStyle(10, Css.dim, { wordWrap: { width: tw, useAdvancedWrap: true } })).setOrigin(0, 1);
      const requires = this.scene.add
        .text(tx, cost.y - cost.height - 2, this.requiresText(node), textStyle(10, Css.dim, { wordWrap: { width: tw, useAdvancedWrap: true } }))
        .setOrigin(0, 1);
      const card = this.scene.add.container(x, y, [frame, lv, level, name, state, desc, requires, cost]);
      makeClickable(card, w, h);
      card.on('pointerup', () => this.onResearch(node));
      layer.add(card);
      this.cards.push({ node, frame, state, name, requires, desc, w, h });
    });
    this.cardLayer = layer;
  }

  /**
   * "少尉・前提 Lv2・電探 Lv1": the rank (#298), then each prerequisite by its level — of this branch, or of the branch
   * named (#381: the full names, ダメージコントロール IV and the like, ran to three lines on a phone).
   */
  private requiresText(node: ITechNode): string {
    const rank = node.rank ? RANKS[node.rank].name : '';
    if (node.requires.length === 0) return rank || '前提なし';
    const names = node.requires.map((id) => {
      const r = this.tree.find((n) => n.id === id);
      if (!r) return id;
      return r.branch === node.branch ? `Lv${r.level}` : `${TECH_BRANCHES.find((b) => b.id === r.branch)?.name ?? ''} Lv${r.level}`;
    });
    return `${rank ? `${rank}・` : ''}前提 ${names.join('・')}`;
  }

  refresh(): void {
    const { done, resources, costMul = 1, medals, rankIndex } = this.state();
    TECH_BRANCHES.forEach((b, i) => {
      const p = branchProgress(this.tree, b.id, done);
      const tab = this.tabs[i];
      // A finished branch is not a call to action (#269): it stays plain and says so.
      tab.setVariant(b.id === lastBranch ? 'primary' : 'secondary');
      tab.setCaption(p.done === p.total ? '✓ 完了' : `${p.done}/${p.total}`);
      // Finished branches read green at a glance (#283), apart from gold calls to action.
      if (p.done === p.total) tab.setCaptionColor(Css.success);
    });
    this.summary.setText(this.summaryText(done));
    for (const c of this.cards) {
      const finished = done.includes(c.node.id);
      const ready = canResearch(c.node, done, resources, costMul, medals, rankIndex);
      // A medal and a rank the project needs (#169 #298) count as prerequisites and are named with them.
      const medal = researchMedal(c.node.id);
      const medalOk = medalMet(c.node, medals);
      const rankOk = rankMet(c.node, rankIndex);
      const met = prerequisitesMet(c.node, done) && medalOk && rankOk;
      const label = finished ? '✓ 研究済' : !rankOk ? '要階級' : !medalOk ? '要勲章' : !met ? '前提未達' : canAfford(resources, scaleCost(c.node.cost, costMul)) ? '研究可 ›' : '資源不足';
      // 研究済 is green (#283): gold stays for what can be done now.
      c.state.setText(label).setColor(finished ? Css.success : ready ? Css.cyan : met ? Css.muted : Css.danger);
      const nameRoom = c.state.x - c.state.width - 8 - c.name.x;
      c.name.setScale(1);
      if (c.name.width > nameRoom) c.name.setScale(Math.max(0.6, nameRoom / c.name.width));
      c.requires.setText(finished ? this.requiresText(c.node) : [this.requiresText(c.node), ...(medal ? [medalName(medal)] : [])].join('・'));
      // The requirement grows upwards from the cost line; when it reaches the effect, the effect gives way to one
      // line (#336), and the requirement to two (#355: a rank, prerequisites and a medal ran over each other).
      c.desc.setText(c.node.description);
      if (c.requires.y - c.requires.height < c.desc.y + c.desc.height + 2) c.desc.setText(c.desc.getWrappedText(c.node.description)[0] ?? '');
      if (c.requires.y - c.requires.height < c.desc.y + c.desc.height + 2) {
        const lines = c.requires.getWrappedText(c.requires.text);
        if (lines.length > 2) c.requires.setText(`${lines[0]}${lines[1].slice(0, -1)}…`);
      }
      c.requires.setColor(finished || met ? Css.dim : Css.danger);
      c.frame.clear();
      drawPanel(c.frame, 0, 0, c.w, c.h, {
        radius: 16,
        fill: finished ? Colors.panelHi : Colors.panel,
        fillAlpha: finished ? 0.9 : ready ? 0.7 : 0.4,
        rim: finished ? Colors.success : Colors.cyan,
        rimAlpha: finished ? 0.7 : ready ? 0.6 : 0.15,
        glow: ready ? 0.6 : 0,
      });
      c.frame.lineStyle(1, finished ? Colors.success : Colors.cyan, 0.25);
      c.frame.lineBetween(LEVEL_COL + 4, 14, LEVEL_COL + 4, c.h - 14);
    }
  }

  /** "砲術 — 研究済 2 / 6 · 現在の効果: 砲火力 ×1.05 …" for the open branch. */
  private summaryText(done: string[]): string {
    const branch = TECH_BRANCHES.find((b) => b.id === lastBranch);
    const nodes = branchNodes(this.tree, lastBranch);
    const finished = nodes.filter((n) => done.includes(n.id));
    const head = `${branch?.name ?? ''}  ·  研究済 ${finished.length} / ${nodes.length}`;
    let effect: string[];
    if (lastBranch === 'logistics') {
      const m = regenMultiplier(finished.map((n) => n.id), this.tree);
      effect = m !== 1 ? [`資源の自然回復 ×${m.toFixed(2)}`] : [];
    } else if (lastBranch === 'shipbuilding' || lastBranch === 'shipbuilding_air') {
      effect = finished.map((n) => n.name);
    } else {
      effect = describeModifiers(researchModifiers(this.tree, finished.map((n) => n.id)));
    }
    return `${head}  ·  ${effect.length > 0 ? `現在の効果: ${effect.join('  ')}` : '未研究'}`;
  }
}
