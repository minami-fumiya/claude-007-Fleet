import Phaser from 'phaser';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { ScrollList } from '@/ui/components/ScrollList';
import { filterShips, NO_FILTER } from '@/systems/ListFilter';
import { CLASS_JA, CLASS_ORDER, filterEntries, kindLabel } from '@/systems/EncyclopediaSystem';
import { ShipClass } from '@/types/ShipClass';
import { selectionFor } from '@/scenes/FleetBuilderScene';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { askShipName } from '@/ui/components/FilterBar';
import { shipSearchNames } from '@/utils/SearchHistory';
import { applyToStats, applyToWeapons, combineModifiers, customizeShips, describeModifiers, toggleUpgrade, upgradeModifiers, upgradeSlots } from '@/systems/CustomizationSystem';
import { primaryWeapon, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { IShipData, IShipStats } from '@/types/Ship';
import { IUpgradeData } from '@/types/Modifiers';
import { IWeaponData } from '@/types/Weapon';
import { ITechNode } from '@/types/Progression';
import { unlockedUpgrades } from '@/systems/ResearchSystem';
import techTree from '@/data/tech-tree.json';
import { branchesFor, canRefit, currentStage, maxStage, nextStage, refit, REFIT_TABLE, refitModifiers, refitName, refitShipData, stagesFor, switchBranch, switchCost } from '@/systems/RefitSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { ownedShips } from '@/systems/ShipyardSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { actionVariant, addBackdrop, addPanel, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { QuestEvent, withQuestEvents } from '@/systems/QuestSystem';

interface IRect { x: number; y: number; w: number; h: number }

/** Landscape: tabs on top, stats on the left, upgrade cards in a 2-column grid. Portrait: stacked. */
/** Space at the bottom of the status panel for the remodel line and button. */
const REFIT_H = IS_PORTRAIT ? 140 : 124;
const SHEET_DEPTH = 300;
const shortName = (name: string): string => name.replace(/\s*\(.*\)\s*$/, '');

const L = IS_PORTRAIT
  ? {
      tabsY: 170, tabH: 60,
      stats: { x: 16, y: 220, w: CANVAS_W - 32, h: 410 } as IRect,
      grid: { x: 16, y: 646, w: CANVAS_W - 32 } as { x: number; y: number; w: number },
      cols: 1, cardH: 70, gap: 6,
    }
  : {
      tabsY: 118, tabH: 44,
      stats: { x: 24, y: 160, w: 400, h: 440 } as IRect,
      grid: { x: 444, y: 160, w: 812 } as { x: number; y: number; w: number },
      cols: 2, cardH: 100, gap: 10,
    };

/**
 * 改装: fit upgrades to each ship of the current fleet (2 slots, 3 after 改, 4 after 改二) and remodel it.
 * Fitted upgrades are saved with the player's progress and applied at battle start.
 */
export class CustomizationScene extends Phaser.Scene {
  private ships: IShipData[] = [];
  private refitText!: Phaser.GameObjects.Text;
  private refitBtn!: UIButton;
  private readonly refitTable = REFIT_TABLE;
  private readonly tech = techTree.tech as ITechNode[];
  private selected = 0;
  private catalog: IUpgradeData[] = [];
  private pickerName?: Phaser.GameObjects.Text;
  private pickerRoom = 0;
  private fleetIds: string[] = [];
  /** List every owned ship, not just the fleet (#144) */
  private showAll = true;
  private sheet: Phaser.GameObjects.GameObject[] = [];
  private sheetList?: ScrollList;
  /** Name search over the ship list sheet (#263) */
  private query = '';
  private cardFrames: Phaser.GameObjects.Graphics[] = [];
  private cardMarks: Phaser.GameObjects.Text[] = [];
  private statsText: Phaser.GameObjects.Text[] = [];
  private slotText!: Phaser.GameObjects.Text;
  private shipName!: Phaser.GameObjects.Text;
  private specialText!: Phaser.GameObjects.Text;
  private extrasText!: Phaser.GameObjects.Text;

  /** Scene the back button returns to (the Fleet Builder or the home port) */
  private returnTo: string = SceneKeys.FLEET_BUILDER;
  private unlocked = new Set<string>();
  /** Ship to open on (#178: from the 図鑑) */
  private startShipId?: string;

  constructor() {
    super({ key: SceneKeys.CUSTOMIZATION });
  }

  init(data: { returnTo?: string; scope?: 'fleet' | 'all'; shipId?: string }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.FLEET_BUILDER;
    this.startShipId = data?.shipId;
    // From the Fleet Builder: its fleet; from the home port: the last choice (#144).
    this.showAll = data?.scope ? data.scope === 'all' : audio.settings.customizeAll;
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    // First-play tutorial (#90): drawn above the screen, so it can be made first.
    new TutorialGuide(this);
    const selection = selectionFor(this.registry, loadProgress().nation);
    const registry = DataLoader.getRegistry(this);
    // Only the current nation's own ships (#18 / #27): the selection may be from another nation's fleet.
    // In list order (#246): by kind, then class by class, hulls in order.
    const owned = filterEntries(ownedShips(loadProgress(), registry.byNation(loadProgress().nation)), null);
    this.fleetIds = (selection?.slotIds ?? []).filter((id): id is string => !!id);
    this.ships = customizeShips(owned, this.fleetIds, this.showAll);
    // A ship asked for by id (#178) is shown even when it is not in the fleet.
    if (this.startShipId && !this.ships.some((s) => s.id === this.startShipId) && owned.some((s) => s.id === this.startShipId)) {
      this.showAll = true;
      this.ships = customizeShips(owned, this.fleetIds, true);
    }
    this.catalog = DataLoader.getUpgrades(this);
    this.unlocked = new Set(unlockedUpgrades(this.catalog, loadProgress().research).map((u) => u.id));
    this.selected = Math.max(0, this.ships.findIndex((s) => s.id === this.startShipId));
    this.pickerName = undefined;
    this.sheet = [];
    this.sheetList = undefined;
    this.cardFrames = [];
    this.cardMarks = [];
    this.statsText = [];

    addBackdrop(this, 'menu');
    this.buildHeader();
    if (this.ships.length === 0) {
      this.add
        .text(CANVAS_W / 2, IS_PORTRAIT ? 400 : 320, '艦隊に艦を追加すると改装できます', textStyle(18, Css.muted, { fontStyle: 'bold' }))
        .setOrigin(0.5);
      this.buildScopeToggle();
      return;
    }
    this.buildEncyclopediaLink();
    this.buildTabs();
    this.buildStatsPanel();
    this.buildCards();
    this.refresh();
  }

  private buildHeader(): void {
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  戻る', () => this.scene.start(this.returnTo), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '改装 — 装備を換装せよ', displayStyle(24)).setOrigin(0.5);
  }

  /** 図鑑 › (#178): the selected ship's encyclopedia page; its back button comes back here on the same ship. */
  private buildEncyclopediaLink(): void {
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, CANVAS_W - back.x, back.y, '図鑑  ›', () => {
      const shipId = this.ships[this.selected]?.id;
      this.scene.start(SceneKeys.ENCYCLOPEDIA, {
        tab: 'ships', id: shipId,
        back: { scene: SceneKeys.CUSTOMIZATION, data: { returnTo: this.returnTo, scope: this.showAll ? 'all' : 'fleet', shipId } },
      });
    }, { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
  }

  /** 艦隊のみ / すべて (#144), remembered in the settings. */
  private buildScopeToggle(): UIButton {
    const w = IS_PORTRAIT ? 150 : 120;
    return new UIButton(this, L.stats.x + w / 2, L.tabsY, this.showAll ? 'すべての艦' : '艦隊のみ', () => {
      this.showAll = !this.showAll;
      audio.update({ customizeAll: this.showAll });
      this.scene.restart({ returnTo: this.returnTo, scope: this.showAll ? 'all' : 'fleet' });
    }, { variant: 'secondary', width: w, height: L.tabH - 6, fontSize: 13 });
  }

  /** Scope, ‹ ship › and 一覧 (#144): the ship list can be long, so it steps or opens a picker. */
  private buildTabs(): void {
    const h = L.tabH - 6;
    const x0 = L.stats.x;
    const right = CANVAS_W - x0;
    const scopeW = IS_PORTRAIT ? 150 : 120;
    const listW = IS_PORTRAIT ? 110 : 90;
    const stepW = IS_PORTRAIT ? 60 : 48;
    const gap = 8;
    this.buildScopeToggle();
    const prevX = x0 + scopeW + gap + stepW / 2;
    const nextX = right - listW - gap - stepW / 2;
    new UIButton(this, prevX, L.tabsY, '‹', () => this.step(-1), { variant: 'secondary', width: stepW, height: h, fontSize: 18 });
    new UIButton(this, nextX, L.tabsY, '›', () => this.step(1), { variant: 'secondary', width: stepW, height: h, fontSize: 18 });
    new UIButton(this, right - listW / 2, L.tabsY, '一覧', () => this.openShipList(), { variant: 'primary', width: listW, height: h, fontSize: 14 });
    const mid = (prevX + nextX) / 2;
    this.pickerName = this.add.text(mid, L.tabsY, '', textStyle(15, Css.text, { fontStyle: 'bold' })).setOrigin(0.5);
    this.pickerRoom = nextX - prevX - stepW - 12;
  }

  private step(d: number): void {
    const n = this.ships.length;
    this.selected = (this.selected + d + n) % n;
    this.refresh();
  }

  private closeShipList(): void {
    for (const o of this.sheet) o.destroy();
    this.sheet = [];
    this.sheetList?.destroy();
    this.sheetList = undefined;
  }

  /** Every listed ship by class, as a scrolling sheet; tap one to customise it. */
  openShipList(filter: ShipClass | null = null): void {
    this.closeShipList();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.sheet.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.75).setOrigin(0, 0).setInteractive());
    const r = IS_PORTRAIT ? { x: 24, y: 150, w: CANVAS_W - 48, h: CANVAS_H - 300 } : { x: 240, y: 60, w: 800, h: 600 };
    add(addPanel(this, r.x, r.y, r.w, r.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(r.x + 24, r.y + 20, this.showAll ? 'すべての艦' : '艦隊の艦', eyebrowStyle(11, Css.cyan)));
    const tabH = IS_PORTRAIT ? 48 : 36;
    const filters: Array<ShipClass | null> = [null, ...CLASS_ORDER];
    const tw = (r.w - 48 - 6 * (filters.length - 1)) / filters.length;
    filters.forEach((c, i) => {
      add(new UIButton(this, r.x + 24 + i * (tw + 6) + tw / 2, r.y + 52 + tabH / 2, c === null ? '全' : CLASS_JA[c].slice(0, 2), () => this.openShipList(c), {
        variant: c === filter ? 'primary' : 'secondary', width: tw, height: tabH, fontSize: 13,
      }));
    });
    const top = r.y + 64 + tabH;
    const bottom = r.y + r.h - (IS_PORTRAIT ? 90 : 70);
    const list = new ScrollList(this, { x: r.x + 20, y: top, w: r.w - 36, h: bottom - top });
    list.setDepth(SHEET_DEPTH + 1);
    this.sheetList = list;
    const rowH = IS_PORTRAIT ? 56 : 44;
    const rowW = r.w - 52;
    const refits = loadProgress().refits;
    // The class tabs and a name search (#263).
    const matching = new Set(filterShips(this.ships, { ...NO_FILTER, query: this.query }, { owned: [], roster: this.ships }).map((s) => s.id));
    const shown = this.ships.map((s, i) => ({ s, i })).filter(({ s }) => (filter === null || s.shipClass === filter) && matching.has(s.id));
    shown.forEach(({ s, i }, row) => {
      const on = i === this.selected;
      const frame = drawPanel(this.add.graphics(), 0, 0, rowW, rowH, { radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.5, rimAlpha: on ? 0.8 : 0.15 });
      const label = shortName(refitName(this.refitTable, s.name, s, refits[s.id] ?? 0, loadProgress().refitBranches[s.id]));
      const name = this.add.text(16, rowH / 2, `${label}${this.fleetIds.includes(s.id) ? '  ⚑' : ''}`, textStyle(15, on ? Css.text : Css.muted)).setOrigin(0, 0.5);
      const sub = this.add.text(rowW - 14, rowH / 2, kindLabel(s), eyebrowStyle(10, Css.dim)).setOrigin(1, 0.5);
      list.addItem(this.add.container(0, row * (rowH + 6), [frame, name, sub]), rowW, rowH, () => {
        this.selected = i;
        this.closeShipList();
        this.refresh();
      });
    });
    list.setContentHeight(Math.max(0, shown.length * (rowH + 6) - 6));
    list.reveal(Math.max(0, shown.findIndex(({ i }) => i === this.selected)) * (rowH + 6), rowH);
    add(this.add.text(r.x + 24, bottom + 8, '⚑ = 艦隊の艦', textStyle(11, Css.dim)));
    const sw = IS_PORTRAIT ? 240 : 200;
    add(new UIButton(this, r.x + r.w - 24 - sw / 2, bottom + (IS_PORTRAIT ? 20 : 16), this.query ? `検索: ${this.query}` : '名前で検索', () => {
      void askShipName(this.query, shipSearchNames(this.ships)).then((query) => {
        if (query === null) return;
        this.query = query;
        this.openShipList(filter);
      });
    }, { variant: this.query ? 'primary' : 'secondary', width: sw, height: IS_PORTRAIT ? 40 : 30, fontSize: 13 }));
    add(new UIButton(this, r.x + r.w / 2, r.y + r.h - (IS_PORTRAIT ? 40 : 32), '閉じる', () => this.closeShipList(), {
      variant: 'secondary', width: 200, height: IS_PORTRAIT ? 52 : 40, fontSize: 15,
    }));
  }

  private buildStatsPanel(): void {
    const p = L.stats;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, '艦の状態', eyebrowStyle(11));
    this.shipName = this.add.text(p.x + 22, p.y + (IS_PORTRAIT ? 46 : 36), '', textStyle(17, Css.text, { fontStyle: 'bold' }));
    this.slotText = this.add.text(p.x + p.w - 22, p.y + 18, '', eyebrowStyle(11, Css.gold)).setOrigin(1, 0);
    this.specialText = this.add.text(p.x + 22, this.shipName.y + this.shipName.height + 2, '', textStyle(11, Css.gold));
    // Six stat lines (two columns in portrait), then the other bonuses (vision, AA, aviation, ASW, night), wrapped.
    const cols = IS_PORTRAIT ? 2 : 1;
    const statRows = Math.ceil(6 / cols);
    const top = p.y + (IS_PORTRAIT ? 104 : 92);
    const extrasH = IS_PORTRAIT ? 66 : 48;
    const rowH = (p.h - (top - p.y) - REFIT_H - extrasH) / statRows;
    const colW = (p.w - 44) / cols;
    for (let i = 0; i < 6; i++) {
      const x = p.x + 22 + (i % cols) * colW;
      this.statsText.push(this.add.text(x, top + Math.floor(i / cols) * rowH, '', textStyle(14, Css.muted)));
    }
    this.extrasText = this.add.text(p.x + 22, top + statRows * rowH, '', textStyle(11, Css.cyan, { wordWrap: { width: p.w - 44, useAdvancedWrap: true } }));
    const ry = p.y + p.h - REFIT_H + 8;
    this.add.text(p.x + 22, ry, '改造', eyebrowStyle(10, Css.gold));
    this.refitText = this.add.text(p.x + 22, ry + (IS_PORTRAIT ? 26 : 20), '', textStyle(12, Css.muted, { wordWrap: { width: p.w - 44, useAdvancedWrap: true } }));
    this.refitBtn = new UIButton(this, p.x + p.w / 2, p.y + p.h - (IS_PORTRAIT ? 34 : 28), '改造', () => this.remodel(), {
      variant: 'gold', width: p.w - 44, height: IS_PORTRAIT ? 48 : 36, fontSize: 14,
    });
  }

  private cardRect(i: number): IRect {
    const cw = (L.grid.w - L.gap * (L.cols - 1)) / L.cols;
    const col = i % L.cols;
    const row = Math.floor(i / L.cols);
    return { x: L.grid.x + col * (cw + L.gap), y: L.grid.y + row * (L.cardH + L.gap), w: cw, h: L.cardH };
  }

  private buildCards(): void {
    this.catalog.forEach((u, i) => {
      const r = this.cardRect(i);
      const frame = this.add.graphics();
      const mark = this.add.text(r.w - 20, r.h / 2, '', textStyle(18, Css.cyan, { fontStyle: 'bold' })).setOrigin(1, 0.5);
      const name = this.add.text(18, IS_PORTRAIT ? 12 : 18, u.name, textStyle(16, Css.text, { fontStyle: 'bold' }));
      const desc = this.add.text(18, IS_PORTRAIT ? 44 : 54, u.description, textStyle(12, Css.muted));
      const card = this.add.container(r.x, r.y, [frame, name, desc, mark]);
      makeClickable(card, r.w, r.h);
      card.on('pointerup', () => this.toggle(u.id));
      this.cardFrames.push(frame);
      this.cardMarks.push(mark);
    });
  }

  private fitted(): string[] {
    return loadProgress().upgrades[this.ships[this.selected].id] ?? [];
  }

  /** Upgrade slots of the selected ship (they grow with its remodel stage). */
  private slots(): number {
    return upgradeSlots(loadProgress().refits[this.ships[this.selected].id] ?? 0);
  }

  /** A ship out on an unfinished sortie (#138) keeps its fit until it comes home. */
  private away(shipId: string): boolean {
    return (loadProgress().sortie?.shipIds ?? []).includes(shipId);
  }

  private toggle(upgradeId: string): void {
    if (!this.unlocked.has(upgradeId)) return;
    const ship = this.ships[this.selected];
    if (this.away(ship.id)) return;
    const progress = loadProgress();
    const next = toggleUpgrade(progress.upgrades[ship.id] ?? [], upgradeId, this.slots());
    saveProgress({ ...progress, upgrades: { ...progress.upgrades, [ship.id]: next } });
    this.refresh();
  }

  private remodel(): void {
    const ship = this.ships[this.selected];
    if (this.away(ship.id)) return;
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    // The last stage takes a direction (#86): reaching it, or changing it later, goes through the branch sheet.
    if (branchesFor(this.refitTable, ship).length > 0 && stage >= maxStage(this.refitTable, ship) - 1) {
      this.openBranches();
      return;
    }
    const r = refit(this.refitTable, ship, stage, progress.proficiency[ship.id] ?? 0, progress.resources);
    if (!r) return;
    saveProgress(withQuestEvents({ ...progress, resources: r.resources, refits: { ...progress.refits, [ship.id]: r.stage } }, [['refit', 1]], Date.now()), 'refit');
    this.refresh();
  }

  /** The directions of the last stage (#86): 標準 and the class's branches, each with what it changes. */
  openBranches(): void {
    const ship = this.ships[this.selected];
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    const last = maxStage(this.refitTable, ship);
    const reached = stage >= last;
    const current = progress.refitBranches[ship.id] ?? 'standard';
    const standard = stagesFor(this.refitTable, ship)[last - 1];
    const options = [
      { id: 'standard', suffix: standard.suffix, label: '標準: 全体を少しずつ強化する', effects: standard.effects },
      ...branchesFor(this.refitTable, ship),
    ];
    this.closeShipList();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.sheet.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.75).setOrigin(0, 0).setInteractive());
    const rowH = IS_PORTRAIT ? 92 : 64;
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 760;
    const h = 130 + options.length * (rowH + 8) + 60;
    const r = { x: (CANVAS_W - w) / 2, y: Math.max(16, (CANVAS_H - h) / 2), w, h };
    add(addPanel(this, r.x, r.y, r.w, r.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(r.x + 24, r.y + 20, `${shortName(ship.name)}  ·  ${standard.suffix}の方向`, eyebrowStyle(11, Css.cyan)));
    const can = reached ? canAfford(progress.resources, switchCost(this.refitTable, ship)) : canRefit(this.refitTable, ship, stage, progress.proficiency[ship.id] ?? 0, progress.resources);
    add(this.add.text(r.x + 24, r.y + 42, reached ? `変更には ${formatResources(switchCost(this.refitTable, ship))} (改造の半分)` : `${formatResources(standard.cost)}  ·  熟練 ${progress.proficiency[ship.id] ?? 0} / ${standard.minProficiency}`, textStyle(13, can ? Css.muted : Css.danger)));
    let y = r.y + 76;
    for (const o of options) {
      const on = reached && o.id === current;
      add(drawPanel(this.add.graphics(), r.x + 20, y, r.w - 40, rowH, { radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.5, rimAlpha: on ? 0.8 : 0.2 }));
      add(this.add.text(r.x + 36, y + 10, `${o.suffix}  ${o.label}`, textStyle(IS_PORTRAIT ? 14 : 13, Css.text, { fontStyle: 'bold', wordWrap: { width: r.w - 220, useAdvancedWrap: true } })));
      const fx = add(this.add.text(r.x + 36, y + rowH - 10, describeModifiers(o.effects).join('  '), textStyle(11, Css.cyan)).setOrigin(0, 1));
      if (fx.width > r.w - 220) fx.setScale((r.w - 220) / fx.width);
      add(new UIButton(this, r.x + r.w - 100, y + rowH / 2, on ? '選択中' : reached ? '変更' : '改造', () => this.chooseBranch(o.id), {
        variant: on ? 'secondary' : actionVariant(can), width: 140, height: IS_PORTRAIT ? 52 : 40, fontSize: 14,
      })).setEnabled(!on && can);
      y += rowH + 8;
    }
    add(new UIButton(this, r.x + r.w / 2, r.y + r.h - (IS_PORTRAIT ? 40 : 32), 'やめる', () => this.closeShipList(), {
      variant: 'secondary', width: 200, height: IS_PORTRAIT ? 52 : 40, fontSize: 15,
    }));
  }

  /** Remodels to the last stage in direction `id`, or switches a finished ship to it for the stage's cost (#86). */
  chooseBranch(id: string): void {
    const ship = this.ships[this.selected];
    if (this.away(ship.id)) return;
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    const branches = { ...progress.refitBranches };
    if (id === 'standard') delete branches[ship.id];
    else branches[ship.id] = id;
    if (stage >= maxStage(this.refitTable, ship)) {
      const left = switchBranch(this.refitTable, ship, stage, progress.refitBranches[ship.id], id, progress.resources);
      if (!left) return;
      saveProgress(withQuestEvents({ ...progress, resources: left, refitBranches: branches }, [['refitRebranch', 1]], Date.now()), 'refit');
    } else {
      const r = refit(this.refitTable, ship, stage, progress.proficiency[ship.id] ?? 0, progress.resources);
      if (!r) return;
      // A direction on a special refit (大和・長門 …, #277) counts toward 匠の改装章.
      const special = stagesFor(this.refitTable, ship)[maxStage(this.refitTable, ship) - 1]?.special === true && id !== 'standard';
      const events: Array<[QuestEvent, number]> = [['refit', 1], ['refitBranch', 1], ...(special ? [['specialBranch', 1] as [QuestEvent, number]] : [])];
      saveProgress(withQuestEvents({ ...progress, resources: r.resources, refits: { ...progress.refits, [ship.id]: r.stage }, refitBranches: branches }, events, Date.now()), 'refit');
    }
    this.closeShipList();
    this.refresh();
  }

  private refresh(): void {
    if (this.pickerName) {
      this.pickerName.setScale(1).setText(`${shortName(this.ships[this.selected].name)}  ${this.selected + 1} / ${this.ships.length}`);
      if (this.pickerName.width > this.pickerRoom) this.pickerName.setScale(this.pickerRoom / this.pickerName.width);
    }
    const fitted = this.fitted();
    const slots = this.slots();
    this.catalog.forEach((u, i) => {
      const r = this.cardRect(i);
      const on = fitted.includes(u.id);
      const full = !on && fitted.length >= slots;
      this.cardFrames[i].clear();
      drawPanel(this.cardFrames[i], 0, 0, r.w, r.h, {
        radius: 16,
        fill: on ? Colors.panelHi : Colors.panel,
        fillAlpha: on ? 0.9 : 0.5,
        rimAlpha: on ? 0.85 : 0.2,
        glow: on ? 1 : 0,
      });
      const locked = !this.unlocked.has(u.id);
      const required = this.tech.find((t) => t.id === u.requires)?.name ?? '';
      this.cardMarks[i]
        .setText(on ? '装備中' : locked ? `要研究: ${required}` : slots === 0 ? '要改造' : full ? '—' : '+')
        .setColor(on ? Css.gold : locked ? Css.dim : Css.cyan)
        .setFontSize(locked || slots === 0 ? 12 : 18);
    });
    this.refreshStats(fitted, slots);
  }

  private loadout(weaponIds: string[]): IWeaponData[] {
    return weaponIds.map((id) => DataLoader.getWeaponById(this, id)).filter((w): w is IWeaponData => w !== undefined);
  }

  private refreshStats(fitted: string[], slots: number): void {
    const ship = this.ships[this.selected];
    const loadout = this.loadout(ship.weapons);
    const base: IShipStats = {
      name: ship.name,
      maxHp: ship.hp,
      currentHp: ship.hp,
      armor: ship.armor,
      speed: ship.speed,
      firePower: 0,
      shipClass: ship.shipClass,
    };
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    const branch = progress.refitBranches[ship.id];
    const mods = combineModifiers(upgradeModifiers(fitted, this.catalog, slots), refitModifiers(this.refitTable, ship, stage, branch));
    const after = applyToStats(base, mods);
    // Special refits may swap weapons (e.g. secondaries replaced by AA guns).
    const weaponsAfter = applyToWeapons(this.loadout(refitShipData(this.refitTable, ship, stage).weapons), mods);
    const gunBefore = primaryWeapon(loadout.filter((w) => weaponKind(w) === WeaponKind.Gun));
    const gunAfter = primaryWeapon(weaponsAfter.filter((w) => weaponKind(w) === WeaponKind.Gun));
    const torpBefore = loadout.find((w) => weaponKind(w) === WeaponKind.Torpedo);
    const torpAfter = weaponsAfter.find((w) => weaponKind(w) === WeaponKind.Torpedo);

    const line = (label: string, a: number | undefined, b: number | undefined, lowerIsBetter = false): string => {
      if (a === undefined || b === undefined) return `${label}   —`;
      const ra = Math.round(a);
      const rb = Math.round(b);
      if (ra === rb) return `${label}   ${ra}`;
      const better = lowerIsBetter ? rb < ra : rb > ra;
      return `${label}   ${ra}  →  ${rb}  ${better ? '▲' : '▼'}`;
    };
    const lines = [
      line('耐久', base.maxHp, after.maxHp),
      line('装甲', base.armor, after.armor),
      line('速力', base.speed, after.speed),
      line('砲火力', gunBefore?.firePower, gunAfter?.firePower),
      line('砲装填 (ms)', gunBefore?.reloadTime, gunAfter?.reloadTime, true),
      line('魚雷火力', torpBefore?.firePower, torpAfter?.firePower),
    ];
    const extras = describeModifiers({ visionMul: mods.visionMul, aaMul: mods.aaMul, airPowerMul: mods.airPowerMul, planesAdd: mods.planesAdd, rearmMul: mods.rearmMul, sonarMul: mods.sonarMul, depthChargeMul: mods.depthChargeMul, nightAimMul: mods.nightAimMul, nightVisionMul: mods.nightVisionMul });
    const afterIds = refitShipData(this.refitTable, ship, stage).weapons;
    const removed = loadout.filter((w) => !afterIds.includes(w.id)).map((w) => w.name);
    const added = this.loadout(afterIds.filter((id) => !ship.weapons.includes(id))).map((w) => w.name);
    if (removed.length > 0 || added.length > 0) extras.push(`兵装 ${removed.join('・') || '—'} → ${added.join('・') || '撤去'}`);
    this.extrasText.setText(extras.join('  '));
    this.statsText.forEach((t, i) => t.setText(lines[i] ?? '').setColor(lines[i]?.includes('→') ? Css.text : Css.muted));
    this.shipName.setText(refitName(this.refitTable, ship.name, ship, stage, branch));
    const reached = currentStage(this.refitTable, ship, stage, branch);
    this.specialText.setText(reached?.special && reached.label ? `特別改装: ${reached.label}` : branch && reached?.label ? `改造の方向: ${reached.label}` : '');
    const next = nextStage(this.refitTable, ship, stage);
    const prof = progress.proficiency[ship.id] ?? 0;
    const branched = branchesFor(this.refitTable, ship).length > 0;
    if (!next && branched) {
      // Finished, but the direction of the last stage can still change (#86).
      const cost = switchCost(this.refitTable, ship);
      this.refitText.setText(`改造完了 (最終段階)  ·  方向はいつでも変えられます (${formatResources(cost)})`);
      this.refitBtn.setLabel(`${reached?.suffix ?? ''} の方向を変更`).setEnabled(true).setVariant(actionVariant(canAfford(progress.resources, cost)));
    } else if (!next) {
      this.refitText.setText('改造完了 (最終段階)');
      this.refitBtn.setLabel('改造完了').setEnabled(false).setVariant('secondary');
    } else if (branched && stage === maxStage(this.refitTable, ship) - 1) {
      const slotsNext = upgradeSlots(stage + 1) > slots ? `  ·  装備枠 ${upgradeSlots(stage + 1)}` : '';
      this.refitText.setText(`次: ${next.suffix} (方向を選ぶ: 標準・${branchesFor(this.refitTable, ship).map((b) => b.suffix).join('・')})  ·  熟練 ${prof} / ${next.minProficiency}${slotsNext}  ·  ${formatResources(next.cost)}`);
      this.refitBtn.setLabel(`${next.suffix} の方向を選ぶ`).setEnabled(true).setVariant(actionVariant(canRefit(this.refitTable, ship, stage, prof, progress.resources)));
    } else {
      const special = next.special && next.label ? `【特別改装】${next.label}\n` : '';
      const slotsNext = upgradeSlots(stage + 1) > slots ? `  ·  装備枠 ${upgradeSlots(stage + 1)}` : '';
      this.refitText.setText(`${special}次: ${next.suffix}  ·  熟練 ${prof} / ${next.minProficiency}${slotsNext}  ·  ${formatResources(next.cost)}`);
      const ready = canRefit(this.refitTable, ship, stage, prof, progress.resources);
      this.refitBtn.setLabel(`${next.suffix} に改造`).setEnabled(ready).setVariant(actionVariant(ready));
    }
    // Unremodelled ships have no upgrade slots (#72): point at the remodel that opens them.
    this.slotText.setText(slots > 0 ? `装備 ${fitted.length} / ${slots}` : `装備枠なし — 改に改造すると ${upgradeSlots(1)} 枠`);
    if (this.away(ship.id)) {
      this.refitBtn.setLabel('出撃中 — 帰投後に改装できます').setEnabled(false).setVariant('secondary');
      this.slotText.setText('出撃中');
    }
  }
}
