import Phaser from 'phaser';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { NATION_INFO } from '@/config/NationInfo';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { buildCostAt, buildDockCount, buildsHere, docksInUse, buildState, buildStateLabel, buildTimeMs, completeBuilds, fastBuild, gradeRankName, ownedIds, shipGrade, startBuild } from '@/systems/ShipyardSystem';
import { clock } from '@/utils/TimeFormat';
import { holdCap } from '@/systems/FacilitySystem';
import { availableShips, canResearch, medalMet, MID_BUILD_TECH, prerequisitesMet, rankMet, research } from '@/systems/ResearchSystem';
import { medalName, researchMedal } from '@/systems/MedalGate';
import { formatResources, shortfall } from '@/systems/ResourceSystem';
import { maxBuildGrade, RANKS, rankOf } from '@/systems/RankSystem';
import { MID_CLASSES } from '@/systems/ShipKind';
import { CLASS_JA, CLASS_ORDER, kindLabel } from '@/systems/EncyclopediaSystem';
import { IShipData } from '@/types/Ship';
import { shipOrder, hullNumber } from '@/systems/ShipOrder';
import { filterShips, kindsOf } from '@/systems/ListFilter';
import { shipSearchNames } from '@/utils/SearchHistory';
import { FilterBar } from '@/ui/components/FilterBar';
import { BUILT_KEY } from './HomeScene';
import { formatNo } from '@/systems/Numbering';
import { buildLook, buildNameShown, hiddenShipName } from '@/systems/RevealSystem';
import { ShipClass } from '@/types/ShipClass';
import { ITechNode } from '@/types/Progression';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import techTree from '@/data/tech-tree.json';
import campaignData from '@/data/campaign.json';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { baseOfProgress, fleetBuildTimeMul, researchMultiplier, scaleCost } from '@/systems/BaseSystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { SCRAP_BLOCK_LABEL, scrapBlock, scrapRefund, scrapShip } from '@/systems/ScrapSystem';
import { selectedShipIds } from '@/utils/FleetSelection';

const TREE = techTree.tech as ITechNode[];
const TECH_NAMES: Record<string, string> = Object.fromEntries(TREE.map((n) => [n.id, n.name]));
/** Campaign area names, for where a reward-only ship comes from (#39). */
const AREA_NAMES: Record<string, string> = Object.fromEntries(campaignData.areas.map((a) => [a.id, a.name]));

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, tabsY: 300, tabH: 56, tabsW: CANVAS_W - 32, info: { x: 16, y: 340, w: CANVAS_W - 32, h: 112 } as IRect, filter: { x: 16, y: 464, w: CANVAS_W - 32, h: 48 }, top: 524, cols: 2, cardH: 140, gap: 12, left: 16 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, tabsY: 178, tabH: 40, tabsW: 740, info: { x: 24, y: 206, w: CANVAS_W - 48, h: 46 } as IRect, filter: { x: 776, y: 158, w: CANVAS_W - 24 - 776, h: 40 }, top: 262, cols: 3, cardH: 100, gap: 10, left: 24 };
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
  /** Status in red (a refusal or a pending scrap) rather than green */
  private statusBad = false;
  /** 解体 (#42): the ship the next tap scraps (the first tap only asks) */
  private scrapArmed: string | null = null;
  private tabs: UIButton[] = [];
  private layer: Phaser.GameObjects.GameObject[] = [];
  /** Countdown lines of ships under construction (#143), updated every frame */
  private filterBar!: FilterBar;
  private timers: Array<{ text: Phaser.GameObjects.Text; endsAt: number; items: number }> = [];
  private building = 0;

  constructor() {
    super({ key: SceneKeys.SHIPYARD });
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    awardPendingMedals();
    // The home screen's 建造完了 notice (#264) is read once the shipyard is open.
    this.registry.remove(BUILT_KEY);
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

    // Landscape: the class tabs leave the right side to the filter (#263); portrait: the filter has a row of its own.
    const w = L.tabsW;
    const gap = 8;
    const bw = (w - gap * (CLASS_ORDER.length - 1)) / CLASS_ORDER.length;
    this.tabs = CLASS_ORDER.map(
      (c, i) =>
        new UIButton(this, L.left + i * (bw + gap) + bw / 2, L.tabsY, CLASS_JA[c], () => {
          this.shipClass = c;
          this.page = 0;
          this.status = '';
          this.filterBar.fitKinds();
          this.refresh();
        }, { variant: 'secondary', width: bw, height: L.tabH, fontSize: 14 }),
    );
    // 一覧の絞り込み (#263): what can be built now first, the kind and a name search.
    this.filterBar = new FilterBar(this, L.filter, {
      key: 'shipyard', states: ['buildable', 'all', 'owned', 'unowned'], initial: { state: 'buildable' },
      kinds: () => kindsOf(this.classRoster()),
      // Suggestions come from the ships owned, so unseen ships stay hidden (#245 #308).
      names: () => {
        const progress = loadProgress();
        const roster = DataLoader.getRegistry(this).byNation(progress.nation);
        const owned = ownedIds(progress, roster);
        return shipSearchNames(roster.filter((s) => owned.includes(s.id)));
      },
      onChange: () => {
        this.page = 0;
        this.refresh();
      },
    });
    this.refresh();
  }

  update(): void {
    // Natural regeneration keeps running while the player browses; finished builds join the fleet (#143).
    const progress = loadProgress();
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    const now = Date.now();
    // A build that reaches 0:00 while the yard is open is finished here too (#275), not only on the home screen.
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const built = completeBuilds(progress, roster, now);
    if (built.done.length > 0) {
      saveProgress(built.progress);
      const names = built.done.map((id) => roster.find((s) => s.id === id)?.name ?? id).map((n) => n.replace(/\s*\(.*\)\s*$/, ''));
      this.status = `${names.join('・')} が竣工しました`;
      this.refresh();
      return;
    }
    if (progress.builds.length < this.building) {
      this.status = '建造が完了しました';
      this.refresh();
      return;
    }
    for (const t of this.timers) t.text.setText(this.buildingLine(t.endsAt - now, t.items));
  }

  private buildingLine(left: number, items: number): string {
    return `建造中  残り ${clock(Math.max(0, left))}${items > 0 ? `  ·  タップで高速建造 (高速建造材 ${items})` : ''}`;
  }

  /** The nation's ships of the selected class (fictional ones only once their research is done), in list order. */
  private classRoster(): IShipData[] {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    // Class by class, oldest first, hulls in order (#246).
    return shipOrder(availableShips(roster, progress.research).filter((s) => s.shipClass === this.shipClass));
  }

  /** The tab's ships that pass the filter bar (#263). */
  private classShips(): IShipData[] {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    return filterShips(this.classRoster(), this.filterBar.filter, {
      owned: ownedIds(progress, roster), roster,
      // A ship on the slip stays listed: tapping it again finishes it with a 高速建造材.
      buildable: (s) => ['ready', 'building'].includes(buildState(progress, roster, s)),
      nameKnown: (s) => buildNameShown(buildState(progress, roster, s)),
    });
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
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    CLASS_ORDER.forEach((c, i) => {
      const all = availableShips(roster, progress.research).filter((s) => s.shipClass === c);
      const have = all.filter((s) => owned.includes(s.id)).length;
      this.tabs[i].setLabel(`${CLASS_JA[c]} ${have}/${all.length}`).setVariant(c === this.shipClass ? 'primary' : 'secondary');
    });

    // Info strip: the class's construction research and the rank limit.
    const info = L.info;
    add(drawPanel(this.add.graphics(), info.x, info.y, info.w, info.h, { radius: 16, fillAlpha: 0.55 }));
    const rank = rankOf(progress);
    // The tab's 中分類 in research order (#260 #298): show the first one still missing.
    const techs = TREE.filter((n) => MID_CLASSES[this.shipClass].some((m) => MID_BUILD_TECH[m] === n.id)).sort((a, b) => a.level - b.level).map((n) => n.id);
    const techId = techs.find((t) => !progress.research.includes(t)) ?? techs[techs.length - 1];
    const node = techId ? TREE.find((n) => n.id === techId) : undefined;
    // Builds share the base's docks with repairs (#211).
    const rankLine = `階級 ${rank.name}: 格 ${maxBuildGrade(rank.index)} の艦まで  ·  ドック ${docksInUse(progress)} / ${buildDockCount(progress)} (建造 ${buildsHere(progress).length})`;
    // Portrait: the rank line on top and the research button below it; landscape: side by side (#182).
    const bw = IS_PORTRAIT ? info.w - 32 : 440;
    const lineY = IS_PORTRAIT ? info.y + 26 : info.y + info.h / 2;
    // Every dock taken (#356): said in red where the eye is, with when the next one frees up.
    const full = docksInUse(progress) >= buildDockCount(progress);
    const ends = [...(progress.builds ?? []).map((b) => b.endsAt), ...progress.docks.map((d) => d.endsAt)].filter((e) => e > Date.now());
    const fullLine = `ドック満杯 ${docksInUse(progress)} / ${buildDockCount(progress)}${ends.length > 0 ? `  ·  次の空き ${clock(Math.min(...ends) - Date.now())} 後` : ''}  ·  入渠か建造が終わると建造できます`;
    const lineCss = this.status ? (this.statusBad || this.status.startsWith('ドック') ? Css.danger : Css.success) : full ? Css.danger : Css.muted;
    const line = add(this.add.text(info.x + 16, lineY, this.status || (full ? fullLine : rankLine), textStyle(12, lineCss, { fontStyle: this.status || full ? 'bold' : 'normal' })).setOrigin(0, 0.5));
    const room = IS_PORTRAIT ? info.w - 32 : info.w - bw - 46;
    if (line.width > room) line.setScale(room / line.width);
    const buttonY = IS_PORTRAIT ? info.y + 76 : info.y + info.h / 2;
    const buttonH = IS_PORTRAIT ? 52 : info.h - 12;
    if (node && !progress.research.includes(node.id)) {
      const costMul = researchMultiplier(baseOfProgress(progress));
      const ready = canResearch(node, progress.research, progress.resources, costMul, progress.record.medals, rank.index);
      const pre = prerequisitesMet(node, progress.research);
      // A medal the build research needs (#169) shows instead of the cost until it is earned.
      const medal = medalMet(node, progress.record.medals) ? undefined : researchMedal(node.id);
      const label = !pre ? `${node.name}: 前提 ${node.requires.map((r) => TECH_NAMES[r] ?? r).join('・')}`
        : !rankMet(node, rank.index) ? `${node.name}: 要階級 ${RANKS[node.rank ?? 0].name}`
        : medal ? `${node.name}: 要勲章「${medalName(medal)}」`
          : `${node.name}を研究  ${formatResources(scaleCost(node.cost, costMul))}`;
      add(new UIButton(this, info.x + info.w - 16 - bw / 2, buttonY, label, () => this.research(node), {
        variant: ready ? 'gold' : 'secondary', width: bw, height: buttonH, fontSize: 12,
      })).setEnabled(ready);
    } else if (node) {
      add(this.add.text(info.x + info.w - 16, buttonY, `${node.name} 研究済`, eyebrowStyle(10, Css.gold)).setOrigin(1, 0.5));
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
    if (ships.length === 0) {
      // Every dock busy empties the 建造できる list: say why rather than blame the filter (0.0.39 review).
      const progress = loadProgress();
      const full = docksInUse(progress) >= buildDockCount(progress);
      const why = this.classRoster().length === 0 ? 'この艦種の艦はありません'
        : full ? 'ドックが空いていません (入渠か建造が終わると、また建造できます)' : 'この条件の艦はありません (上の絞り込みを変えてください)';
      add(this.add.text(CANVAS_W / 2, L.top + 60, why, textStyle(15, Css.dim)).setOrigin(0.5));
    }
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
    // Only what can be built now is drawn in colour (#262): short of resources or docks is grey too.
    const look = buildLook(state);
    const lit = look === 'owned' || look === 'ready' || look === 'building';
    const frame = drawPanel(this.add.graphics(), 0, 0, r.w, r.h, {
      radius: 16,
      fill: owned ? Colors.panelHi : Colors.panel,
      fillAlpha: owned ? 0.9 : lit ? 0.7 : 0.2,
      rim: owned ? Colors.gold : lit ? Colors.cyan : Colors.dim,
      rimAlpha: owned ? 0.7 : lit ? 0.6 : 0.15,
      glow: ready ? 0.6 : 0,
    });
    const grade = shipGrade(ship);
    const pad = 16;
    // Out of reach for now (#245): grey, the name hidden; what it needs is all the card says.
    const shown = buildNameShown(state);
    const ownedList = ownedIds(progress, roster);
    const hull = hullNumber(roster, ship);
    const title = shown ? ship.name : hiddenShipName(roster, ship, ownedList);
    const name = this.add.text(pad, 10, title, textStyle(15, lit ? Css.text : Css.dim, { fontStyle: 'bold' }));
    const stateText = this.add.text(r.w - pad, 12, buildStateLabel(state, ship, TECH_NAMES, AREA_NAMES, progress.record, roster, progress.blueprints), eyebrowStyle(10, owned ? Css.gold : ready ? Css.cyan : Css.dim)).setOrigin(1, 0);
    const room = r.w - pad * 3 - stateText.width;
    if (name.width > room) name.setText(title.replace(/\s*\(.*\)\s*$/, ''));
    if (name.width > room) name.setScale(room / name.width);
    const lineH = IS_PORTRAIT ? 30 : 22;
    // The class and hull number (#246) once the name is known: "長門型 2 番艦".
    const classLine = `${shown && ship.no ? `${formatNo(ship.no)} · ` : ''}${shown && hull.of > 1 ? `${hull.className} ${hull.number} 番艦 · ` : ''}`;
    // An owned ship can be scrapped (#42): the card says what it gives back.
    const costLine = owned ? (this.scrapArmed === ship.id ? 'もう一度タップで解体' : `保有中  ·  タップで解体 (返却 ${formatResources(scrapRefund(ship, progress.refits[ship.id] ?? 0, progress.refitBranches[ship.id]))})`)
      : state === 'reward' ? '報酬限定艦 — 作戦の S 評価で入手'
        : !shown ? ''
          // Short of resources (#262): what is missing, in red.
          : state === 'resources' ? `不足: ${formatResources(shortfall(progress.resources, buildCostAt(progress, ship)))}`
            : `建造 ${formatResources(buildCostAt(loadProgress(), ship))}  ·  ${clock(buildTimeMs(ship, fleetBuildTimeMul(progress)))}`;
    const parts: Phaser.GameObjects.GameObject[] = [
      frame,
      name,
      stateText,
      this.fitWidth(this.add.text(pad, 10 + lineH + 4, `${classLine}${kindLabel(ship)} · 格 ${grade} (${gradeRankName(grade)})${ship.fictional && shown ? ' · 架空艦' : ''}`, textStyle(11, ship.fictional && shown ? Css.gold : Css.muted)), r.w - pad * 2),
      this.add.text(pad, 10 + lineH * 2 + 4, shown ? `HP ${ship.hp}  装甲 ${ship.armor}  速力 ${ship.speed}` : '', textStyle(11, Css.muted)),
      // Reward-only ships (#39) show where they come from instead of a build cost.
      this.fitWidth(this.add.text(pad, r.h - (IS_PORTRAIT ? 30 : 22), costLine, textStyle(11, owned || state === 'reward' ? Css.gold : state === 'resources' ? Css.danger : Css.dim)), r.w - pad * 2),
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
    const icon = this.add.image(r.w - (IS_PORTRAIT ? 70 : 56), r.h - (IS_PORTRAIT ? 48 : 36), ship.spriteKey).setAngle(90).setAlpha(lit ? 1 : 0.45);
    if (!shown) icon.setTintFill(0x101a2c).setAlpha(0.7);
    else if (!lit) icon.setTint(0x6a7890);
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
    this.statusBad = false;
    if (ownedIds(progress, roster).includes(ship.id)) {
      this.scrap(ship, short);
      return;
    }
    this.scrapArmed = null;
    if (progress.builds.some((b) => b.shipId === ship.id)) {
      // Tapping a ship under construction spends a 高速建造材 (#143).
      const done = fastBuild(progress, roster, ship.id, Date.now());
      if (!done) return;
      saveProgress(done);
      this.status = `高速建造材で ${short} が完成しました`;
      this.refresh();
      return;
    }
    if (buildState(progress, roster, ship) === 'dock') {
      // A tap on a full yard says so rather than doing nothing (#356).
      this.status = 'ドックが空いていません (入渠か建造が終わると建造できます)';
      this.refresh();
      return;
    }
    const now = Date.now();
    // The base's workshop (#146) shortens construction.
    const next = startBuild(progress, roster, ship, now, fleetBuildTimeMul(progress));
    if (!next) return;
    saveProgress(withQuestEvents(next, [['build', 1]], now), 'build');
    this.status = `${short} を起工しました (完成まで ${clock(buildTimeMs(ship, fleetBuildTimeMul(progress)))})`;
    this.refresh();
    if (emitTutorial('build', this.registry).advanced) this.guide.refresh();
  }

  /** 解体 (#42): the first tap says what it returns (or why it can't), the second scraps. */
  private scrap(ship: IShipData, short: string): void {
    const progress = loadProgress();
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const flagship = selectedShipIds(this.registry, progress.nation)[0];
    const block = scrapBlock(progress, roster, ship, flagship);
    if (block) {
      this.scrapArmed = null;
      this.statusBad = true;
      this.status = `${short}: ${SCRAP_BLOCK_LABEL[block]}`;
      this.refresh();
      return;
    }
    if (this.scrapArmed !== ship.id) {
      this.scrapArmed = ship.id;
      this.statusBad = true;
      const fitted = (progress.upgrades[ship.id] ?? []).length;
      this.status = `${short} を解体しますか? もう一度タップで解体 (返却 ${formatResources(scrapRefund(ship, progress.refits[ship.id] ?? 0, progress.refitBranches[ship.id]))}${fitted > 0 ? `・装備 ${fitted} 個は倉庫へ` : ''})`;
      this.refresh();
      return;
    }
    this.scrapArmed = null;
    const done = scrapShip(progress, roster, ship, Date.now(), flagship);
    if (!done) return;
    saveProgress(done.progress);
    this.status = `${short} を解体しました (${formatResources(done.refund)})`;
    this.refresh();
  }

  private research(node: ITechNode): void {
    const progress = loadProgress();
    const result = research(node, progress.research, progress.resources, researchMultiplier(baseOfProgress(progress)), progress.record.medals, rankOf(progress).index);
    if (!result) return;
    saveProgress(withQuestEvents({ ...progress, research: result.done, resources: result.resources }, [['research', 1]], Date.now()), 'research');
    if (emitTutorial('research', this.registry).advanced) this.guide.refresh();
    this.status = `${node.name}を研究しました`;
    this.refresh();
  }
}
