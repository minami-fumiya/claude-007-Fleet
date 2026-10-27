import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { canDevelop, develop, developable, developCost, developRandom, heldCount, randomDevelopCost, stockOf } from '@/systems/EquipmentSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { IUpgradeData } from '@/types/Modifiers';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { ScrollList } from '@/ui/components/ScrollList';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { formatNo } from '@/systems/Numbering';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, status: 300, random: { y: 350, h: 60 }, list: { x: 16, y: 400 }, rowH: 128, gap: 10 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, status: 168, random: { y: 200, h: 44 }, list: { x: 24, y: 236 }, rowH: 96, gap: 8 };

/**
 * 工廠 › 開発 (#55): equipment is made here with resources — a chosen one at its price, or 「おまかせ」 (a random one the
 * research has opened) for less. What is made goes into the stock and is fitted on the 改装 screen.
 */
export class DevelopScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private list?: ScrollList;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusBad = false;

  constructor() {
    super({ key: SceneKeys.DEVELOP });
  }

  create(): void {
    showScreenHelp(this);
    awardPendingMedals();
    this.layer = [];
    this.list = undefined;
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    addArsenalTabs(this, 'develop');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 装備の開発', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    this.list = new ScrollList(this, { x: L.list.x, y: L.list.y, w: CANVAS_W - L.list.x * 2, h: CANVAS_H - 16 - L.list.y });
    this.draw();
  }

  update(): void {
    const p = loadProgress();
    this.bar.refresh(p.resources, holdCap(p.facilities));
  }

  private catalog(): IUpgradeData[] {
    return DataLoader.getUpgrades(this);
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.layer.push(o);
      return o;
    };
    const p = loadProgress();
    this.bar.refresh(p.resources, holdCap(p.facilities));
    const pool = developable(this.catalog(), p.research, p.nation);
    const line = this.status || (pool.length === 0 ? '研究で装備の開発が開きます (工廠 › 研究)' : `開発できる装備 ${pool.length} 種  ·  作った装備は改装の画面で艦に付けます`);
    add(this.add.text(L.list.x, L.status, line, textStyle(13, this.status ? (this.statusBad ? Css.danger : Css.success) : Css.muted, { fontStyle: this.status ? 'bold' : 'normal', wordWrap: { width: CANVAS_W - L.list.x * 2, useAdvancedWrap: true } })));
    const randomCost = randomDevelopCost(pool);
    const ready = pool.length > 0 && canAfford(p.resources, randomCost);
    add(new UIButton(this, CANVAS_W / 2, L.random.y, pool.length > 0 ? `おまかせ開発  ${formatResources(randomCost)}` : 'おまかせ開発', () => this.developRandom(), {
      variant: ready ? 'gold' : 'secondary', width: CANVAS_W - L.list.x * 2, height: L.random.h, fontSize: 14,
    })).setEnabled(ready);

    const list = this.list!;
    const keep = list.offset;
    list.clear();
    const w = CANVAS_W - L.list.x * 2 - 12;
    pool.forEach((u, i) => {
      const cost = developCost(u);
      const can = canDevelop(p, this.catalog(), u.id, p.nation);
      const frame = drawPanel(this.add.graphics(), 0, 0, w, L.rowH, { radius: 14, fill: Colors.panel, fillAlpha: can ? 0.7 : 0.35, rimAlpha: can ? 0.5 : 0.15 });
      const name = this.add.text(16, 10, u.name, textStyle(15, can ? Css.text : Css.dim, { fontStyle: 'bold' }));
      const no = this.add.text(w - 16, 12, `${formatNo(u.no)}  所持 ${stockOf(p, u.id)} / 計 ${heldCount(p, u.id)}`, eyebrowStyle(10, Css.muted)).setOrigin(1, 0);
      const desc = this.add.text(16, IS_PORTRAIT ? 40 : 36, u.description, textStyle(12, Css.muted, { wordWrap: { width: w - 32, useAdvancedWrap: true } }));
      const price = this.add.text(16, L.rowH - (IS_PORTRAIT ? 30 : 24), `開発 ${formatResources(cost)}  ·  タップで開発`, textStyle(12, can ? Css.cyan : Css.danger, { fontStyle: 'bold' }));
      list.addItem(this.add.container(0, i * (L.rowH + L.gap), [frame, name, no, desc, price]), w, L.rowH, () => this.develop(u));
    });
    list.setContentHeight(Math.max(0, pool.length * (L.rowH + L.gap) - L.gap));
    list.setOffset(keep);
  }

  private develop(u: IUpgradeData): void {
    const p = loadProgress();
    const next = develop(p, this.catalog(), u.id, p.nation);
    if (!next) {
      this.status = `${u.name}: 資源が足りません`;
      this.statusBad = true;
      this.draw();
      return;
    }
    saveProgress(withQuestEvents(next, [['develop', 1]], Date.now()));
    this.statusBad = false;
    this.status = `${u.name} を開発しました (所持 ${stockOf(next, u.id)})`;
    this.draw();
  }

  private developRandom(): void {
    const p = loadProgress();
    const out = developRandom(p, this.catalog(), p.nation, Math.random());
    if (!out) return;
    saveProgress(withQuestEvents(out.holder, [['develop', 1]], Date.now()));
    const name = this.catalog().find((u) => u.id === out.id)?.name ?? out.id;
    this.statusBad = false;
    this.status = `おまかせ開発: ${name} ができました`;
    this.draw();
  }
}
