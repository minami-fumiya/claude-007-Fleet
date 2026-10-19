import Phaser from 'phaser';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { research, TECH_TREE } from '@/systems/ResearchSystem';
import { ITechNode } from '@/types/Progression';
import { displayStyle } from '@/ui/theme';
import { addBackdrop, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { ResearchView } from '@/ui/components/ResearchView';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { baseOfProgress, researchMultiplier } from '@/systems/BaseSystem';
import { withQuestEvents } from '@/systems/QuestSystem';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, view: { x: 16, y: 282, w: CANVAS_W - 32, h: CANVAS_H - 282 - 24 } }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, view: { x: 24, y: 160, w: CANVAS_W - 48, h: CANVAS_H - 160 - 20 } };

/**
 * 工廠: the research tree by branch (砲術 … 建造, levels I–V). Tap an available project to pay for it;
 * finished research strengthens every ship, unlocks refit upgrades and ship construction.
 */
export class ArsenalScene extends Phaser.Scene {
  private guide!: TutorialGuide;
  private bar!: ResourceBar;
  private view!: ResearchView;

  constructor() {
    super({ key: SceneKeys.ARSENAL });
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    this.guide = new TutorialGuide(this);
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 技術研究', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, IS_PORTRAIT ? 2 : 4);
    addArsenalTabs(this, 'research');
    this.view = new ResearchView(
      this,
      L.view,
      TECH_TREE,
      () => {
        const p = loadProgress();
        return { done: p.research, resources: p.resources, costMul: researchMultiplier(baseOfProgress(p)) };
      },
      (node) => this.research(node),
    );
    this.bar.refresh(loadProgress().resources);
  }

  private research(node: ITechNode): void {
    const progress = loadProgress();
    const result = research(node, progress.research, progress.resources, researchMultiplier(baseOfProgress(progress)));
    if (!result) return;
    saveProgress(withQuestEvents({ ...progress, research: result.done, resources: result.resources }, [['research', 1]], Date.now()), 'research');
    if (emitTutorial('research', this.registry).advanced) this.guide.refresh();
    this.bar.refresh(result.resources);
    this.view.refresh();
  }
}
