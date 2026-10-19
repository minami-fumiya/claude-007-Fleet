import Phaser from 'phaser';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { NATION_INFO } from '@/config/NationInfo';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { BUILD_TECH, HEAVY_CRUISER_TECH, buildCostAt, buildDockCount, buildState, buildStateLabel, buildTimeMs, fastBuild, gradeRankName, ownedIds, shipGrade, startBuild } from '@/systems/ShipyardSystem';
import { clock } from '@/utils/TimeFormat';
import { availableShips, canResearch, prerequisitesMet, research } from '@/systems/ResearchSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { maxBuildGrade, rankOf } from '@/systems/RankSystem';
import { CLASS_JA, CLASS_ORDER, kindLabel } from '@/systems/EncyclopediaSystem';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { ITechNode } from '@/types/Progression';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import techTree from '@/data/tech-tree.json';
import campaignData from '@/data/campaign.json';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { baseOfProgress, researchMultiplier, scaleCost } from '@/systems/BaseSystem';
import { withQuestEvents } from '@/systems/QuestSystem';

const TREE = techTree.tech as ITechNode[];
const TECH_NAMES: Record<string, string> = Object.fromEntries(TREE.map((n) => [n.id, n.name]));
/** Campaign area names, for where a reward-only ship comes from (#39). */
const AREA_NAMES: Record<string, string> = Object.fromEntries(campaignData.areas.map((a) => [a.id, a.name]));

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, tabsY: 300, tabH: 56, info: { x: 16, y: 340, w: CANVAS_W - 32, h: 64 } as IRect, top: 416, cols: 2, cardH: 140, gap: 12, left: 16 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, tabsY: 178, tabH: 40, info: { x: 24, y: 206, w: CANVAS_W - 48, h: 46 } as IRect, top: 262, cols: 3, cardH: 100, gap: 10, left: 24 };
const CARD_W = (CANVAS_W - L.left * 2 - L.gap * (L.cols - 1)) / L.cols;
const ROWS = Math.max(1, Math.floor((CANVAS_H - 16 - L.top + L.gap) / (L.cardH + L.gap)));
const PAGE_SIZE = ROWS * L.cols;

/**
 * 工廠 › 建造 (#29): build ships of the current nation with resources, one of each. A class needs its construction
 * research (shown here, researchable in place) and a ship's grade needs the admiral's rank (#30).
 */
export class ShipyardScene extends Phaser.Scene {
  private guide!: TutorialGuide;
  private bar!: ResourceBar;
  private shipClass: ShipClass = ShipClass.Destroyer;
  private page = 0;
  private status = '';
  private tabs: UIButton[] = [];
  private layer: Phaser.GameObjects.GameObject[] = [];
  /** Countdown lines of ships under construction (#143), updated every frame */
  private timers: Array<{ text: Phaser.GameObjects.Text; endsAt: number; items: number }> = [];
  private building = 0;

  constructor() {
    super({ key: SceneKeys.SHIPYARD });
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    this.guide = new TutorialGuide(this);
    this.tabs = [];
    this.layer = [];
    this.page = 0;
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    addArsenalTabs(this, 'build');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, `工廠 — ${NATION_INFO[loadProgress().nation].jaShort}の艦を建造`, displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);

    const w = CANVAS_W - L.left * 2;
    const gap = 8;
    const bw = (w - gap * (CLASS_ORDER.length - 1)) / CLASS_ORDER.length;
    this.tabs = CLASS_ORDER.map(
      (c, i) =>
        new UIButton(this, L.left + i * (bw + gap) + bw / 2, L.tabsY, CLASS_JA[c], () => {
          this.shipClass = c;
          this.page = 0;
          this.status = '';
          this.refresh();
        }, { variant: 'secondary', width: bw, height: L.tabH, fontSize: 14 }),
    );
    this.refresh();
  }

  update(): void {
    // Natural regeneration keeps running while the player browses; finished builds join the fleet (#143).
    const progress = loadProgress();
    this.bar.refresh(progress.resources);
    if (progress.builds.length < this.building) {
      this.status = '建造が完了しました';
      this.refresh();
      return;
    }
    const now = Date.now();
    for (const t of this.timers) t.text.setText(this.buildingLine(t.endsAt - now, t.items));
  }

  private buildingLine(left: number, items: number): string {
    return `建造中  残り ${clock(Math.max(0, left))}${items > 0 ? `  ·  タップで高速建造 (高速建造材 ${items})` : ''}`;
  }

  /** The nation's ships of the selected class (fictional ones only once their research is done). */
  private classShips(): IShipData[] {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    return availableShips(roster, progress.research).filter((s) => s.shipClass === this.shipClass);
  }

  private refresh(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.layer.push(o);
      return o;
    };
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const owned = ownedIds(progress, roster);
    this.timers = [];
    this.building = progress.builds.length;
    this.bar.refresh(progress.resources);
    CLASS_ORDER.forEach((c, i) => {
      const all = availableShips(roster, progress.research).filter((s) => s.shipClass === c);
      const have = all.filter((s) => owned.includes(s.id)).length;
      this.tabs[i].setLabel(`${CLASS_JA[c]} ${have}/${all.length}`).setVariant(c === this.shipClass ? 'primary' : 'secondary');
    });

    // Info strip: the class's construction research and the rank limit.
    const info = L.info;
    add(drawPanel(this.add.graphics(), info.x, info.y, info.w, info.h, { radius: 16, fillAlpha: 0.55 }));
    const rank = rankOf(progress);
    // Cruisers: light first, then heavy (#37) — show whichever is still missing.
    const techs = this.shipClass === ShipClass.Cruiser ? [BUILD_TECH[ShipClass.Cruiser], HEAVY_CRUISER_TECH] : [BUILD_TECH[this.shipClass]];
    const techId = techs.find((t) => t && !progress.research.includes(t)) ?? techs[techs.length - 1];
    const node = techId ? TREE.find((n) => n.id === techId) : undefined;
    const rankLine = `階級 ${rank.name}: 格 ${maxBuildGrade(rank.index)} の艦まで  ·  建造ドック ${progress.builds.length} / ${buildDockCount(progress)}`;
    add(this.add.text(info.x + 16, info.y + info.h / 2, this.status || rankLine, textStyle(12, this.status ? Css.success : Css.muted, { fontStyle: this.status ? 'bold' : 'normal' })).setOrigin(0, 0.5));
    if (node && !progress.research.includes(node.id)) {
      const costMul = researchMultiplier(baseOfProgress(progress));
      const ready = canResearch(node, progress.research, progress.resources, costMul);
      const pre = prerequisitesMet(node, progress.research);
      const label = pre ? `${node.name}を研究  ${formatResources(scaleCost(node.cost, costMul))}` : `${node.name}: 前提 ${node.requires.map((r) => TECH_NAMES[r] ?? r).join('・')}`;
      const bw = IS_PORTRAIT ? 400 : 440;
      add(new UIButton(this, info.x + info.w - 10 - bw / 2, info.y + info.h / 2, label, () => this.research(node), {
        variant: ready ? 'gold' : 'secondary', width: bw, height: info.h - 12, fontSize: 12,
      })).setEnabled(ready);
    } else if (node) {
      add(this.add.text(info.x + info.w - 16, info.y + info.h / 2, `${node.name} 研究済`, eyebrowStyle(10, Css.gold)).setOrigin(1, 0.5));
    }

    const ships = this.classShips();
    // More ships than one screen: the last row holds the pager instead.
    const size = ships.length > PAGE_SIZE ? Math.max(L.cols, PAGE_SIZE - L.cols) : PAGE_SIZE;
    const pages = Math.max(1, Math.ceil(ships.length / size));
    this.page = Math.min(this.page, pages - 1);
    ships.slice(this.page * size, (this.page + 1) * size).forEach((ship, i) => {
      const r: IRect = {
        x: L.left + (i % L.cols) * (CARD_W + L.gap),
        y: L.top + Math.floor(i / L.cols) * (L.cardH + L.gap),
        w: CARD_W,
        h: L.cardH,
      };
      add(this.card(ship, r));
    });
    if (ships.length === 0) add(this.add.text(CANVAS_W / 2, L.top + 60, 'この艦種の艦はありません', textStyle(15, Css.dim)).setOrigin(0.5));
    if (pages > 1) {
      const y = L.top + (ROWS - 1) * (L.cardH + L.gap) + L.cardH / 2;
      const bh = IS_PORTRAIT ? 56 : 36;
      const prev = add(new UIButton(this, CANVAS_W / 2 - 110, y, '‹', () => this.turn(-1), { variant: 'secondary', width: 80, height: bh, fontSize: 18 }));
      const next = add(new UIButton(this, CANVAS_W / 2 + 110, y, '›', () => this.turn(1), { variant: 'secondary', width: 80, height: bh, fontSize: 18 }));
      add(this.add.text(CANVAS_W / 2, y, `${this.page + 1} / ${pages}`, textStyle(13, Css.muted)).setOrigin(0.5));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
    }
  }

  private card(ship: IShipData, r: IRect): Phaser.GameObjects.Container {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const state = buildState(progress, roster, ship);
    const owned = state === 'owned';
    const ready = state === 'ready';
    const frame = drawPanel(this.add.graphics(), 0, 0, r.w, r.h, {
      radius: 16,
      fill: owned ? Colors.panelHi : Colors.panel,
      fillAlpha: owned ? 0.9 : ready ? 0.7 : 0.4,
      rim: owned ? Colors.gold : Colors.cyan,
      rimAlpha: owned ? 0.7 : ready ? 0.6 : 0.15,
      glow: ready ? 0.6 : 0,
    });
    const grade = shipGrade(ship);
    const pad = 16;
    const name = this.add.text(pad, 10, ship.name, textStyle(15, owned || ready ? Css.text : Css.muted, { fontStyle: 'bold' }));
    const stateText = this.add.text(r.w - pad, 12, buildStateLabel(state, ship, TECH_NAMES, AREA_NAMES), eyebrowStyle(10, owned ? Css.gold : ready ? Css.cyan : Css.dim)).setOrigin(1, 0);
    const room = r.w - pad * 3 - stateText.width;
    if (name.width > room) name.setText(ship.name.replace(/\s*\(.*\)\s*$/, ''));
    if (name.width > room) name.setScale(room / name.width);
    const lineH = IS_PORTRAIT ? 30 : 22;
    const parts: Phaser.GameObjects.GameObject[] = [
      frame,
      name,
      stateText,
      this.add.text(pad, 10 + lineH + 4, `${kindLabel(ship)} · 格 ${grade} (${gradeRankName(grade)})${ship.fictional ? ' · 架空艦' : ''}`, textStyle(11, ship.fictional ? Css.gold : Css.muted)),
      this.add.text(pad, 10 + lineH * 2 + 4, `HP ${ship.hp}  装甲 ${ship.armor}  速力 ${ship.speed}`, textStyle(11, Css.muted)),
      // Reward-only ships (#39) show where they come from instead of a build cost.
      this.fitWidth(this.add.text(pad, r.h - (IS_PORTRAIT ? 30 : 22), owned ? '保有中' : state === 'reward' ? '報酬限定艦 — 建造不可 (作戦の初回攻略で入手)' : `建造 ${formatResources(buildCostAt(loadProgress(), ship))}  ·  ${clock(buildTimeMs(ship))}`, textStyle(11, owned ? Css.gold : state === 'reward' ? Css.gold : Css.dim)), r.w - pad * 2),
    ];
    const job = progress.builds.find((b) => b.shipId === ship.id);
    if (job) {
      // Under construction (#143): a countdown in place of the cost line.
      const last = parts[parts.length - 1] as Phaser.GameObjects.Text;
      last.setScale(1).setColor(Css.cyan);
      this.timers.push({ text: last, endsAt: job.endsAt, items: progress.items.fastBuild });
      last.setText(this.buildingLine(job.endsAt - Date.now(), progress.items.fastBuild));
      this.fitWidth(last, r.w - pad * 2);
    }
    const icon = this.add.image(r.w - (IS_PORTRAIT ? 70 : 56), r.h - (IS_PORTRAIT ? 48 : 36), ship.spriteKey).setAngle(90).setAlpha(owned || ready ? 1 : 0.5);
    icon.setScale(Math.min(1, (IS_PORTRAIT ? 100 : 80) / Math.max(1, icon.height)));
    parts.splice(1, 0, icon);
    const card = this.add.container(r.x, r.y, parts);
    makeClickable(card, r.w, r.h);
    card.on('pointerup', () => this.build(ship));
    return card;
  }

  private fitWidth(text: Phaser.GameObjects.Text, room: number): Phaser.GameObjects.Text {
    if (text.width > room) text.setScale(room / text.width);
    return text;
  }

  private turn(step: number): void {
    this.page = Math.max(0, this.page + step);
    this.refresh();
  }

  private build(ship: IShipData): void {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const short = ship.name.replace(/\s*\(.*\)\s*$/, '');
    if (progress.builds.some((b) => b.shipId === ship.id)) {
      // Tapping a ship under construction spends a 高速建造材 (#143).
      const done = fastBuild(progress, roster, ship.id, Date.now());
      if (!done) return;
      saveProgress(done);
      this.status = `高速建造材で ${short} が完成しました`;
      this.refresh();
      return;
    }
    const now = Date.now();
    const next = startBuild(progress, roster, ship, now);
    if (!next) return;
    saveProgress(withQuestEvents(next, [['build', 1]], now));
    this.status = `${short} を起工しました (完成まで ${clock(buildTimeMs(ship))})`;
    this.refresh();
    if (emitTutorial('build', this.registry).advanced) this.guide.refresh();
  }

  private research(node: ITechNode): void {
    const progress = loadProgress();
    const result = research(node, progress.research, progress.resources, researchMultiplier(baseOfProgress(progress)));
    if (!result) return;
    saveProgress(withQuestEvents({ ...progress, research: result.done, resources: result.resources }, [['research', 1]], Date.now()));
    if (emitTutorial('research', this.registry).advanced) this.guide.refresh();
    this.status = `${node.name}を研究しました`;
    this.refresh();
  }
}
