import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { canResearch, prerequisitesMet, research, techTier } from '@/systems/ResearchSystem';
import { isBuildTech } from '@/systems/ShipyardSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { ITechNode } from '@/types/Progression';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import techTree from '@/data/tech-tree.json';

// Construction research (build_*) is shown on the 建造 tab next to the ships it unlocks.
const TREE = (techTree.tech as ITechNode[]).filter((n) => !isBuildTech(n.id));

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, cols: 2, top: 290, cardW: (CANVAS_W - 32 - 12) / 2, cardH: 150, gapX: 12, gapY: 12, left: 16 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, cols: 3, top: 170, cardW: (CANVAS_W - 48 - 24) / 3, cardH: 108, gapX: 12, gapY: 10, left: 24 };

/**
 * 工廠: research projects grouped by tier (prerequisite depth). Tap an available project to pay for it;
 * finished research strengthens every ship and unlocks refit upgrades.
 */
export class ArsenalScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private cards: Array<{ node: ITechNode; frame: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Text; w: number; h: number }> = [];

  constructor() {
    super({ key: SceneKeys.ARSENAL });
  }

  create(): void {
    this.cards = [];
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'ARSENAL', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 技術研究', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, IS_PORTRAIT ? 2 : 4);
    addArsenalTabs(this, 'research');

    // Order by tier so prerequisites come first.
    const ordered = [...TREE].sort((a, b) => techTier(TREE, a.id) - techTier(TREE, b.id));
    ordered.forEach((node, i) => {
      const col = i % L.cols;
      const row = Math.floor(i / L.cols);
      const x = L.left + col * (L.cardW + L.gapX);
      const y = L.top + row * (L.cardH + L.gapY);
      const frame = this.add.graphics();
      const tier = techTier(TREE, node.id);
      const parts: Phaser.GameObjects.GameObject[] = [
        frame,
        this.add.text(16, 12, `TIER ${tier + 1}`, eyebrowStyle(9, Css.muted)),
        this.add.text(16, IS_PORTRAIT ? 36 : 30, node.name, textStyle(15, Css.text, { fontStyle: 'bold' })),
        this.add.text(16, IS_PORTRAIT ? 70 : 56, node.description, textStyle(11, Css.muted, { wordWrap: { width: L.cardW - 32, useAdvancedWrap: true } })),
        this.add.text(16, L.cardH - (IS_PORTRAIT ? 30 : 22), formatResources(node.cost), textStyle(11, Css.dim)),
      ];
      const state = this.add.text(L.cardW - 16, 12, '', eyebrowStyle(10, Css.cyan)).setOrigin(1, 0);
      parts.push(state);
      const card = this.add.container(x, y, parts);
      makeClickable(card, L.cardW, L.cardH);
      card.on('pointerup', () => this.research(node));
      this.cards.push({ node, frame, state, w: L.cardW, h: L.cardH });
    });
    this.refresh();
  }

  private research(node: ITechNode): void {
    const progress = loadProgress();
    const result = research(node, progress.research, progress.resources);
    if (!result) return;
    saveProgress({ ...progress, research: result.done, resources: result.resources });
    this.refresh();
  }

  private refresh(): void {
    const progress = loadProgress();
    this.bar.refresh(progress.resources);
    for (const c of this.cards) {
      const done = progress.research.includes(c.node.id);
      const ready = canResearch(c.node, progress.research, progress.resources);
      const label = done
        ? '研究済'
        : !prerequisitesMet(c.node, progress.research)
          ? '前提未達'
          : canAfford(progress.resources, c.node.cost)
            ? '研究可 ›'
            : '資源不足';
      c.state.setText(label).setColor(done ? Css.gold : ready ? Css.cyan : Css.dim);
      c.frame.clear();
      drawPanel(c.frame, 0, 0, c.w, c.h, {
        radius: 16,
        fill: done ? Colors.panelHi : Colors.panel,
        fillAlpha: done ? 0.9 : ready ? 0.7 : 0.4,
        rim: done ? Colors.gold : Colors.cyan,
        rimAlpha: done ? 0.7 : ready ? 0.6 : 0.15,
        glow: ready ? 0.6 : 0,
      });
    }
  }
}
