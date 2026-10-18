import Phaser from 'phaser';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { EXERCISE_EXTRA_CHOICES, exerciseEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { BattleMode } from '@/types/Battle';
import { ICampaignArea, ICampaignData, Objective } from '@/types/Campaign';
import { areaMode, enemyNationFor, enemyShips } from '@/systems/CampaignSystem';
import { CAMPAIGN_AREA_KEY, OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import campaignData from '@/data/campaign.json';
import { TimeOfDay, Weather } from '@/types/Weather';
import { randomTime, randomWeather, TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { ICaptain, ICaptainData } from '@/types/Captain';
import { SKILL_LABEL, withProgress } from '@/systems/CaptainSystem';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { availableShips } from '@/systems/ResearchSystem';
import { ISortieOptions, isFreeSortie, paySortie, sortieBlockers, sortieCostFor } from '@/systems/ProgressionSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { ownedShips } from '@/systems/ShipyardSystem';
import { fleetSlots, nextRank, RANKS, rankOf } from '@/systems/RankSystem';
import { completeRepairs, hpFraction, isDocked } from '@/systems/DockSystem';
import { proficiencyLabel } from '@/systems/ProficiencySystem';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { filterAndSort, isHeavyCruiser, KIND_FILTERS, KindFilter, kindShort, ShipSort, SORT_LABEL } from '@/systems/ShipKind';
import { FORMATION_ORDER, FORMATION_RULES, formationUnlocked, usableFormation } from '@/systems/FormationRules';
import { applyPreset, IFleetPreset, PRESET_COUNT, presetLabel, withPreset } from '@/systems/PresetSystem';
import { kindLabel, summarizeWeapons } from '@/systems/EncyclopediaSystem';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addChip, addPanel, drawMeter, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';

/** Landscape: up to this many slots in one column; a bigger fleet is laid out in two columns. */
const COLUMN_SLOTS = 3;
const PANEL_PAD = 14;
/** Space for a panel's eyebrow + title; taller in portrait where text is enlarged. */
const PANEL_HEADER_H = IS_PORTRAIT ? 84 : 58;
/** Portrait only: fixed bars above and below the scrolling content. */
const HEADER_BAR_H = 124;
const FOOTER_BAR_H = 160;
/** A drag longer than this scrolls the page instead of counting as a tap. */
const DRAG_THRESHOLD = 12;

interface IRect { x: number; y: number; w: number; h: number }

interface IBuilderLayout {
  ships: IRect;
  shipItemH: number;
  /** Height of the info line at the top of the ship list */
  tabH: number;
  /** Height of the kind-filter and sort rows above the ship list (#33) */
  filterH: number;
  fleet: IRect;
  /** Fleet preset buttons row (#33) */
  presetH: number;
  slotH: number;
  formations: IRect;
  formationCardH: number;
  /** Opponent nation + battle mode toggles */
  enemy: IRect;
  enemyButtonH: number;
  footer: IRect;
}

/** Nation toggles wrap after this many per row, so long Japanese names stay readable (#21). */
const NATION_COLS = 4;
const NATION_ROWS = Math.ceil(PLAYABLE_NATIONS.length / NATION_COLS);
/** Gap between wrapped toggle rows */
const TOGGLE_ROW_GAP = IS_PORTRAIT ? 12 : 6;
/** With more nations than fit one row, the opponent toggles drop the 敵 prefix (the panel says 交戦相手). */
const ENEMY_PREFIX = PLAYABLE_NATIONS.length > NATION_COLS ? '' : '敵 ';

const ITEM_GAP = IS_PORTRAIT ? 8 : 6;
const CARD_GAP = 10;
/** Formation cards: two columns, three rows (#59). */
const FORMATION_COLS = 2;

const P_SHIP_ITEM_H = 120;
const P_TAB_H = 48;
const P_FILTER_H = 52;
/** Portrait ship list viewport: five and a half rows, so the cut-off row hints that it scrolls (#20). */
const P_LIST_VIEW_H = Math.round(5.5 * (P_SHIP_ITEM_H + 8));
/** Portrait slot cards stay in one column whatever the fleet size, so every card shows its stats (#33). */
const P_SLOT_H = 168;
const P_PRESET_H = 56;
const P_HINT_H = 64;
const P_FORMATION_CARD_H = 128;
/** Free-battle opponent rows: nation (may wrap), mode, weather, time, size */
const P_ENEMY_ROWS = NATION_ROWS + 4;
/** Landscape: wrapped opponent rows take room from the formation cards above them. */
const L_FORMATIONS_H = NATION_ROWS > 1 ? 226 : 262;
const L_FLEET_H = 512;

/**
 * Landscape: ships | fleet | formations in three columns, everything on one screen.
 * Portrait: fleet, ships, formations stacked on a page that scrolls between a fixed header and footer; the fleet
 * panel grows with the number of slots (up to 8).
 */
function builderLayout(slotCount: number, promotionHint: boolean): IBuilderLayout {
  if (IS_PORTRAIT) {
    const fleetH = PANEL_HEADER_H + P_PRESET_H + 12 + slotCount * P_SLOT_H + (slotCount - 1) * CARD_GAP + (promotionHint ? CARD_GAP + P_HINT_H : 0) + 14;
    const fleet = { x: 16, y: HEADER_BAR_H + 12, w: CANVAS_W - 32, h: fleetH };
    const shipsY = fleet.y + fleet.h + 16;
    const shipsH = PANEL_HEADER_H + P_TAB_H + 2 * (P_FILTER_H + 10) + 4 + P_LIST_VIEW_H + 14;
    const formationsY = shipsY + shipsH + 18;
    const formationsH = PANEL_HEADER_H + 3 * P_FORMATION_CARD_H + 2 * CARD_GAP + 14;
    const enemyY = formationsY + formationsH + 18;
    return {
      fleet,
      presetH: P_PRESET_H,
      slotH: P_SLOT_H,
      ships: { x: 16, y: shipsY, w: CANVAS_W - 32, h: shipsH },
      shipItemH: P_SHIP_ITEM_H,
      tabH: P_TAB_H,
      filterH: P_FILTER_H,
      formations: { x: 16, y: formationsY, w: CANVAS_W - 32, h: formationsH },
      formationCardH: P_FORMATION_CARD_H,
      enemy: { x: 16, y: enemyY, w: CANVAS_W - 32, h: 84 + P_ENEMY_ROWS * 60 + (P_ENEMY_ROWS - 1) * 12 + 18 },
      enemyButtonH: 60,
      footer: { x: 16, y: CANVAS_H - FOOTER_BAR_H + 6, w: CANVAS_W - 32, h: FOOTER_BAR_H - 18 },
    };
  }
  const presetH = 30;
  const rows = slotCount <= COLUMN_SLOTS ? COLUMN_SLOTS : Math.ceil(slotCount / 2);
  const slotRoom = L_FLEET_H - PANEL_HEADER_H - presetH - 8 - 14;
  return {
    ships: { x: 24, y: 92, w: 404, h: 512 },
    shipItemH: 62,
    tabH: 30,
    filterH: 26,
    fleet: { x: 444, y: 92, w: 412, h: L_FLEET_H },
    presetH,
    slotH: Math.min(136, Math.floor((slotRoom - (rows - 1) * CARD_GAP) / rows)),
    formations: { x: 872, y: 92, w: 384, h: L_FORMATIONS_H },
    formationCardH: Math.floor((L_FORMATIONS_H - PANEL_HEADER_H - 14 - 2 * 8) / 3),
    enemy: { x: 872, y: 92 + L_FORMATIONS_H + 12, w: 384, h: 604 - (92 + L_FORMATIONS_H + 12) },
    enemyButtonH: NATION_ROWS > 1 ? 26 : 30,
    footer: { x: 24, y: 616, w: CANVAS_W - 48, h: 92 },
  };
}

/** Width of an addChip badge (its container bounds leave out the pill's padding). */
function chipWidth(chip: Phaser.GameObjects.Container): number {
  return (chip.list[1] as Phaser.GameObjects.Text).width + 18;
}

/** Badge colour by class; cruisers split heavy (cyan) / light (blue) (#37). */
function kindColor(ship: IShipData): { color: number; css: string } {
  if (isHeavyCruiser(ship)) return { color: Colors.cyan, css: Css.cyan };
  switch (ship.shipClass) {
    case ShipClass.Battleship: return { color: Colors.gold, css: Css.gold };
    case ShipClass.Cruiser: return { color: Colors.blue, css: Css.blue };
    case ShipClass.Destroyer: return { color: Colors.success, css: Css.success };
    case ShipClass.Carrier: return { color: 0xc58bff, css: '#c58bff' };
    default: return { color: Colors.muted, css: Css.muted };
  }
}

/** "大和 (Yamato)" → "大和": the Japanese part of a display name. */
function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, '');
}

/** Fits a ship name into `room` px: first drop the English part, then shrink the text. */
function fitName(text: Phaser.GameObjects.Text, name: string, room: number): void {
  if (text.width <= room) return;
  text.setText(shortName(name));
  if (text.width > room) text.setScale(room / text.width);
}

const RANDOM = 'random' as const;
const WEATHER_CHOICES: Array<Weather | typeof RANDOM> = [RANDOM, Weather.Clear, Weather.Overcast, Weather.Storm, Weather.Fog];
const TIME_CHOICES: Array<TimeOfDay | typeof RANDOM> = [RANDOM, TimeOfDay.Day, TimeOfDay.Night];

const BATTLE_MODES: BattleMode[] = [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW];
const EXTRA_LABEL = ['同数', '+1 隻', '+2 隻'];
const MODE_LABEL: Record<BattleMode, string> = {
  [BattleMode.Surface]: '水上戦',
  [BattleMode.CarrierStrike]: '機動部隊',
  [BattleMode.ASW]: '対潜戦',
};

/** Last Fleet Builder setup, kept in the game registry so RETRY / 撤退 come back to the same fleet. */
export const SELECTION_KEY = 'fleetBuilder.selection';
export interface ISelection {
  nation: Nation;
  enemyNation: Nation;
  mode: BattleMode;
  formation: Formation;
  slotIds: (string | null)[];
  captainIds?: (string | null)[];
  weather?: Weather | typeof RANDOM;
  time?: TimeOfDay | typeof RANDOM;
  /** Free battle: enemy ships beyond the player's count (#25) */
  extra?: number;
}

interface ISlotView {
  frame: Phaser.GameObjects.Graphics;
  content: Phaser.GameObjects.Container | null;
  emptyLabel: Phaser.GameObjects.Text;
}

export class FleetBuilderScene extends Phaser.Scene {
  private shipRegistry!: ShipRegistry;
  private ships: IShipData[] = [];
  private slots: (IShipData | null)[] = [null];
  /** Fleet slots the admiral's rank allows (#25 / #30) */
  private slotCount = 1;
  /** Free battle: enemy ships beyond the player's count */
  private extra = 0;
  private extraButtons: UIButton[] = [];
  private formation: Formation = Formation.LineAhead;
  private nation: Nation = Nation.IJN;
  /** Captain id assigned to each slot */
  private captainIds: (string | null)[] = [null];
  private captainData: ICaptainData[] = [];
  /** Campaign operation being prepared (null = free battle) */
  private area: ICampaignArea | null = null;
  private enemyNation: Nation = Nation.USN;
  private mode: BattleMode = BattleMode.Surface;

  private shipList!: ScrollList;
  private shipCountText!: Phaser.GameObjects.Text;
  private enemyNationButtons: UIButton[] = [];
  private modeButtons: UIButton[] = [];
  private weatherButtons: UIButton[] = [];
  private timeButtons: UIButton[] = [];
  private weatherChoice: Weather | typeof RANDOM = RANDOM;
  private timeChoice: TimeOfDay | typeof RANDOM = TimeOfDay.Day;
  private titleText!: Phaser.GameObjects.Text;
  private nationChip: Phaser.GameObjects.Container | null = null;

  private slotViews: ISlotView[] = [];
  private formationFrames: Phaser.GameObjects.Graphics[] = [];
  private shipCards: Phaser.GameObjects.Container[] = [];
  private summaryText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private maxStats = { hp: 1, armor: 1, speed: 1 };
  /** Portrait scrolling: true while the current pointer gesture is a drag, so taps are ignored */
  private dragging = false;
  /** Layout for this fleet size (the portrait fleet panel grows with the slots) */
  private L!: IBuilderLayout;
  /** Admiral rank index: unlocks formations (#59) */
  private rankIndex = 0;
  /** Ship list filter and order (#33) */
  private kindFilter: KindFilter = KindFilter.All;
  private sort: ShipSort = ShipSort.Default;
  private filterButtons: UIButton[] = [];
  private sortButtons: UIButton[] = [];
  /** Preset buttons; while `saveArmed` the next preset tapped is overwritten with the current fleet */
  private presetButtons: UIButton[] = [];
  private presetSaveBtn: UIButton | null = null;
  private saveArmed = false;
  /** Open ship detail sheet (#33) */
  private detail: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.FLEET_BUILDER });
  }

  create(): void {
    audio.music('menu');
    this.shipRegistry = DataLoader.getRegistry(this);
    const progress = loadProgress();
    // The fleet is always the current nation's (switched at the home port); a selection from another nation is dropped.
    this.nation = progress.nation;
    const restored = this.registry.get(SELECTION_KEY) as ISelection | undefined;
    const saved = restored?.nation === this.nation ? restored : undefined;
    this.enemyNation = restored?.enemyNation ?? PLAYABLE_NATIONS.find((n) => n !== this.nation) ?? Nation.USN;
    this.extra = saved?.extra ?? 0;
    this.slotCount = fleetSlots(progress);
    this.rankIndex = rankOf(progress).index;
    this.L = builderLayout(this.slotCount, IS_PORTRAIT && nextRank(progress) !== null);
    this.mode = saved?.mode ?? BattleMode.Surface;
    this.weatherChoice = saved?.weather ?? RANDOM;
    this.timeChoice = saved?.time ?? TimeOfDay.Day;
    this.ships = this.offeredShips();
    this.slots = Array.from({ length: this.slotCount }, (_, i) => {
      // Only ships still available (a reset or imported save can take away a ship).
      const id = saved?.slotIds[i];
      return id ? this.ships.find((s) => s.id === id) ?? null : null;
    });
    this.formation = usableFormation(saved?.formation, this.rankIndex);
    this.captainData = DataLoader.getCaptains(this);
    const areaId = this.registry.get(CAMPAIGN_AREA_KEY) as string | undefined;
    this.area = (campaignData as ICampaignData).areas.find((a) => a.id === areaId) ?? null;
    this.captainIds = Array.from({ length: this.slotCount }, (_, i) => saved?.captainIds?.[i] ?? null);
    this.slotViews = [];
    this.formationFrames = [];
    this.shipCards = [];
    this.enemyNationButtons = [];
    this.extraButtons = [];
    this.modeButtons = [];
    this.weatherButtons = [];
    this.timeButtons = [];
    this.nationChip = null;
    this.dragging = false;
    this.filterButtons = [];
    this.sortButtons = [];
    this.presetButtons = [];
    this.presetSaveBtn = null;
    this.saveArmed = false;
    this.detail = [];
    // Meters share one scale across nations so ships compare fairly between tabs.
    const all = this.shipRegistry.all();
    this.maxStats = {
      hp: Math.max(1, ...all.map((s) => s.hp)),
      armor: Math.max(1, ...all.map((s) => s.armor)),
      speed: Math.max(1, ...all.map((s) => s.speed)),
    };

    addBackdrop(this, 'menu').setScrollFactor(0);
    this.buildHeader();
    this.buildPanelFrame(this.L.ships, 'AVAILABLE SHIPS', '利用可能な艦');
    const rank = rankOf(progress);
    this.buildPanelFrame(this.L.fleet, 'YOUR FLEET', `艦隊編成 — ${rank.name} · 出撃枠 ${this.slotCount}`);
    this.buildRefitButton();
    this.buildPanelFrame(this.L.formations, 'FORMATION', '陣形');
    this.buildPanelFrame(this.L.enemy, 'OPPONENT', '交戦相手');
    this.buildNationTabs();
    this.buildShipCount();
    this.buildListControls();
    this.createShipList();
    this.buildShipList();
    this.buildPresetRow();
    this.buildSlotPanel();
    this.buildFormationPanel();
    this.buildEnemyPanel();
    this.buildFooter();
    this.refresh();
    if (IS_PORTRAIT) this.setupScrolling();
  }

  /** Wraps a tap handler so it does nothing at the end of a scroll drag. */
  private onTap(fn: () => void): () => void {
    return () => {
      if (!this.dragging) fn();
    };
  }

  private setupScrolling(): void {
    const contentBottom = this.L.enemy.y + this.L.enemy.h + 24;
    // Let the last panel scroll clear of the fixed footer.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, CANVAS_W, contentBottom + FOOTER_BAR_H);

    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = false;
      startY = p.y;
      startScroll = cam.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Drags that start on the ship list scroll the list; it passes back what it cannot use.
      if (!p.isDown || this.shipList.ownsGesture() || this.detail.length > 0) return;
      const dy = p.y - startY;
      if (!this.dragging && Math.abs(dy) < DRAG_THRESHOLD) return;
      this.dragging = true;
      cam.setScroll(0, startScroll - dy);
    });
    // Game-object pointerup handlers run before this scene-level one, so they still see `dragging`.
    this.input.on('pointerup', () => {
      this.time.delayedCall(0, () => {
        this.dragging = false;
      });
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.shipList.contains(p)) return;
      cam.setScroll(0, cam.scrollY + dy);
    });
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private buildHeader(): void {
    const fixed: Phaser.GameObjects.GameObject[] = [];
    if (IS_PORTRAIT) {
      // Interactive so taps on the bar don't reach cards scrolled underneath it.
      fixed.push(this.add.rectangle(0, 0, CANVAS_W, HEADER_BAR_H, Colors.bgDeep, 0.94).setOrigin(0, 0).setInteractive());
    }
    const back = IS_PORTRAIT
      ? new UIButton(this, 100, 46, this.area ? '‹  作戦' : '‹  鎮守府', () => this.scene.start(this.area ? SceneKeys.CAMPAIGN : SceneKeys.HOME), {
          variant: 'secondary', width: 172, height: 60, fontSize: 15,
        })
      : new UIButton(this, 92, 44, this.area ? '‹  作戦' : '‹  鎮守府', () => this.scene.start(this.area ? SceneKeys.CAMPAIGN : SceneKeys.HOME), {
          variant: 'secondary', width: 136, height: 44, fontSize: 15,
        });
    fixed.push(back);
    fixed.push(this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'FLEET BUILDER', eyebrowStyle(12)).setOrigin(0.5));
    this.titleText = this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 56, '', displayStyle(24)).setOrigin(0.5);
    fixed.push(this.titleText);
    this.pin(fixed, 60);
    this.refreshHeader();
  }

  private refreshHeader(): void {
    this.titleText.setText(`${NATION_INFO[this.nation].ja} — 艦隊を編成せよ`);
    this.nationChip?.destroy();
    const chip = addChip(this, 0, IS_PORTRAIT ? 46 : 44, `NATION · ${NATION_INFO[this.nation].jaShort}`, Colors.gold, Css.gold);
    chip.setX(CANVAS_W - 20 - chip.getBounds().width);
    this.pin([chip], 60);
    this.nationChip = chip;
  }

  /**
   * Equal-width toggle buttons filling `w`, the first row centred vertically on `cy`. More than
   * `maxCols` labels wrap onto further rows `h + TOGGLE_ROW_GAP` apart.
   */
  private addToggleRow(
    x: number,
    cy: number,
    w: number,
    h: number,
    labels: string[],
    onSelect: (index: number) => void,
    maxCols: number = labels.length,
  ): UIButton[] {
    const gap = 8;
    const cols = Math.min(maxCols, labels.length);
    const bw = Math.floor((w - gap * (cols - 1)) / cols);
    return labels.map(
      (label, i) =>
        new UIButton(this, x + (i % cols) * (bw + gap) + bw / 2, cy + Math.floor(i / cols) * (h + TOGGLE_ROW_GAP), label, this.onTap(() => onSelect(i)), {
          variant: 'secondary',
          width: bw,
          height: h,
          fontSize: IS_PORTRAIT ? 15 : 13,
        }),
    );
  }

  private static setToggle(buttons: UIButton[], selected: number): void {
    buttons.forEach((b, i) => b.setVariant(i === selected ? 'primary' : 'secondary'));
  }

  /** Owned ships of the current nation (#18), with fictional designs still gated by their research. */
  private offeredShips(): IShipData[] {
    const progress = loadProgress();
    return availableShips(ownedShips(progress, this.shipRegistry.byNation(this.nation)), progress.research);
  }

  /** The row above the ship list: how many ships the nation owns and where more come from. */
  private buildNationTabs(): void {
    const p = this.L.ships;
    this.add
      .text(p.x + PANEL_PAD + 8, p.y + PANEL_HEADER_H + this.L.tabH / 2, `保有艦 ${this.ships.length} 隻  ·  新しい艦は工廠の建造・作戦の初回報酬で入手`, textStyle(12, Css.muted, { wordWrap: { width: p.w - PANEL_PAD * 2 - 16, useAdvancedWrap: true } }))
      .setOrigin(0, 0.5);
  }

  /** Campaign sortie: the opponent comes from the operation, so the panel shows its briefing instead. */
  private buildCampaignPanel(area: ICampaignArea): void {
    const p = this.L.enemy;
    const x = p.x + PANEL_PAD + 8;
    let y = p.y + PANEL_HEADER_H + (IS_PORTRAIT ? 4 : 0);
    const enemyNation = enemyNationFor(campaignData as ICampaignData, area, this.nation);
    const ships = enemyShips(area, this.shipRegistry, enemyNation).map((s) => s.name.replace(/\s*\(.*\)\s*$/, '')).join('・');
    const lines = [
      `作戦  ${area.name}`,
      `${OBJECTIVE_LABEL[area.objective]}  ·  ${NATION_INFO[enemyNation].jaShort} ${ships}`,
      `${DataLoader.getMap(this, area.map).name}  ·  ${WEATHER_LABEL[area.weather]}  ·  ${TIME_LABEL[area.time]}`,
    ];
    lines.forEach((line, i) => {
      const t = this.add.text(x, y, line, textStyle(i === 0 ? 15 : 12, i === 0 ? Css.gold : Css.text, { fontStyle: i === 0 ? 'bold' : 'normal', wordWrap: { width: p.w - PANEL_PAD * 2 - 16, useAdvancedWrap: true } }));
      y += t.height + (IS_PORTRAIT ? 10 : 6);
    });
    new UIButton(this, p.x + p.w / 2, p.y + p.h - (IS_PORTRAIT ? 46 : 26), '作戦を中止して演習にする', this.onTap(() => {
      this.registry.remove(CAMPAIGN_AREA_KEY);
      this.scene.restart();
    }), { variant: 'secondary', width: p.w - PANEL_PAD * 2, height: IS_PORTRAIT ? 56 : 32, fontSize: 12 });
  }

  private buildEnemyPanel(): void {
    if (this.area) {
      this.buildCampaignPanel(this.area);
      return;
    }
    const p = this.L.enemy;
    const h = this.L.enemyButtonH;
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const rowGap = TOGGLE_ROW_GAP;
    const top = p.y + PANEL_HEADER_H + (IS_PORTRAIT ? 4 : 0);
    const enemyRows = NATION_ROWS;
    this.enemyNationButtons = this.addToggleRow(
      x,
      top + h / 2,
      w,
      h,
      PLAYABLE_NATIONS.map((n) => `${ENEMY_PREFIX}${NATION_INFO[n].jaShort}`),
      (i) => {
        this.enemyNation = PLAYABLE_NATIONS[i];
        this.refreshEnemyPanel();
      },
      NATION_COLS,
    );
    const rowY = (row: number): number => top + (enemyRows + row) * (h + rowGap) + h / 2;
    this.modeButtons = this.addToggleRow(x, rowY(0), w, h, BATTLE_MODES.map((m) => MODE_LABEL[m]), (i) => {
      this.mode = BATTLE_MODES[i];
      this.refreshEnemyPanel();
    });
    this.weatherButtons = this.addToggleRow(x, rowY(1), w, h, WEATHER_CHOICES.map((c) => (c === RANDOM ? 'ランダム' : WEATHER_LABEL[c])), (i) => {
      this.weatherChoice = WEATHER_CHOICES[i];
      this.refreshEnemyPanel();
    });
    this.timeButtons = this.addToggleRow(x, rowY(2), w, h, TIME_CHOICES.map((c) => (c === RANDOM ? 'ランダム' : TIME_LABEL[c])), (i) => {
      this.timeChoice = TIME_CHOICES[i];
      this.refreshEnemyPanel();
    });
    this.extraButtons = this.addToggleRow(x, rowY(3), w, h, EXTRA_LABEL.map((l) => `敵 ${l}`), (i) => {
      this.extra = EXERCISE_EXTRA_CHOICES[i];
      this.refreshEnemyPanel();
    });
    this.refreshEnemyPanel();
  }

  private refreshEnemyPanel(): void {
    if (this.area) return;
    FleetBuilderScene.setToggle(this.enemyNationButtons, PLAYABLE_NATIONS.indexOf(this.enemyNation));
    FleetBuilderScene.setToggle(this.modeButtons, BATTLE_MODES.indexOf(this.mode));
    FleetBuilderScene.setToggle(this.weatherButtons, WEATHER_CHOICES.indexOf(this.weatherChoice));
    FleetBuilderScene.setToggle(this.timeButtons, TIME_CHOICES.indexOf(this.timeChoice));
    FleetBuilderScene.setToggle(this.extraButtons, EXERCISE_EXTRA_CHOICES.indexOf(this.extra as 0 | 1 | 2));
  }

  /** "12 隻" in the ship panel header, where the page buttons used to be. */
  private buildShipCount(): void {
    const p = this.L.ships;
    this.shipCountText = this.add
      .text(p.x + p.w - PANEL_PAD - 8, p.y + (IS_PORTRAIT ? 42 : 32), '', textStyle(13, Css.muted, { fontStyle: 'bold' }))
      .setOrigin(1, 0.5);
  }

  /** The masked, scrolling viewport under the nation tabs (#20). */
  private createShipList(): void {
    const p = this.L.ships;
    const top = this.shipListTop();
    this.shipList = new ScrollList(this, {
      x: p.x + PANEL_PAD,
      y: top,
      w: p.w - PANEL_PAD * 2 + 4,
      h: p.y + p.h - (IS_PORTRAIT ? 14 : 10) - top,
      // Portrait: drags past either end of the list carry on scrolling the page.
      onOverscroll: IS_PORTRAIT ? (dy) => this.cameras.main.setScroll(0, this.cameras.main.scrollY + dy) : undefined,
      screenClip: IS_PORTRAIT ? { top: HEADER_BAR_H, bottom: CANVAS_H - FOOTER_BAR_H } : undefined,
    });
  }

  private shipListTop(): number {
    // One info line (owned ships), then the kind filter and sort rows (#33).
    return this.filterRowY(1) + this.L.filterH + (IS_PORTRAIT ? 12 : 6);
  }

  /** Top of filter row 0 (kinds) / 1 (sort) above the ship list. */
  private filterRowY(row: number): number {
    const p = this.L.ships;
    return p.y + PANEL_HEADER_H + this.L.tabH + row * (this.L.filterH + (IS_PORTRAIT ? 10 : 6));
  }

  /** Kind filter (全て / 戦艦 / 空母 / 重巡 / 軽巡 / 駆逐 / 潜水) and sort toggles above the ship list (#33 / #37). */
  private buildListControls(): void {
    const p = this.L.ships;
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const h = this.L.filterH;
    const small = { fontSize: IS_PORTRAIT ? 14 : 11 };
    const row = (y: number, labels: string[], onSelect: (i: number) => void): UIButton[] => {
      const gap = IS_PORTRAIT ? 6 : 4;
      const bw = (w - gap * (labels.length - 1)) / labels.length;
      return labels.map((label, i) =>
        new UIButton(this, x + i * (bw + gap) + bw / 2, y + h / 2, label, this.onTap(() => onSelect(i)), { variant: 'secondary', width: bw, height: h, ...small }),
      );
    };
    this.filterButtons = row(this.filterRowY(0), KIND_FILTERS.map((k) => k.label), (i) => {
      this.kindFilter = KIND_FILTERS[i].id;
      this.rebuildShipList();
    });
    const sorts = [ShipSort.Default, ShipSort.Hp, ShipSort.Speed];
    this.sortButtons = row(this.filterRowY(1), sorts.map((k) => `並び: ${SORT_LABEL[k]}`), (i) => {
      this.sort = sorts[i];
      this.rebuildShipList();
    });
    this.refreshListControls();
  }

  private refreshListControls(): void {
    FleetBuilderScene.setToggle(this.filterButtons, KIND_FILTERS.findIndex((k) => k.id === this.kindFilter));
    FleetBuilderScene.setToggle(this.sortButtons, [ShipSort.Default, ShipSort.Hp, ShipSort.Speed].indexOf(this.sort));
  }

  private rebuildShipList(): void {
    this.shipList.clear();
    this.shipCards = [];
    this.buildShipList();
    this.shipList.setOffset(0);
    this.refreshListControls();
  }

  /** Keeps objects in place while the portrait page scrolls underneath them. */
  private pin(objects: Phaser.GameObjects.GameObject[], depth: number): void {
    for (const o of objects) {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
    }
  }

  private buildPanelFrame(p: { x: number; y: number; w: number; h: number }, eyebrow: string, title: string): void {
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, eyebrow, eyebrowStyle(11));
    this.add.text(p.x + 22, p.y + (IS_PORTRAIT ? 46 : 34), title, textStyle(15, Css.text, { fontStyle: 'bold' }));
  }

  /** Rotates a bow-up ship sprite to lie bow-right and scales it to fit `maxLen`. */
  private addShipIcon(x: number, y: number, key: string, maxLen: number, maxScale: number): Phaser.GameObjects.Image {
    const icon = this.add.image(x, y, key).setAngle(90);
    return icon.setScale(Math.min(maxScale, maxLen / Math.max(1, icon.height)));
  }

  private buildShipList(): void {
    const p = this.L.ships;
    const itemH = this.L.shipItemH;
    // Rows leave a gutter on the right for the scrollbar.
    const w = p.w - PANEL_PAD * 2 - 12;
    const statX = IS_PORTRAIT ? 100 : 74;
    const plusR = IS_PORTRAIT ? 26 : 17;
    const statSpacing = (w - statX - plusR * 2 - 30) / 3;
    const shown = filterAndSort(this.ships, this.kindFilter, this.sort);

    shown.forEach((ship, i) => {
      const y = i * (itemH + ITEM_GAP);
      const bg = drawPanel(this.add.graphics(), 0, 0, w, itemH, { radius: 16, fill: Colors.panelHi, fillAlpha: 0.55 });
      const hover = this.add.graphics();
      drawPanel(hover, 0, 0, w, itemH, { radius: 16, fill: Colors.cyan, fillAlpha: 0.08, rimAlpha: 0.7 });
      hover.setVisible(false);

      const icon = this.addShipIcon(statX / 2, itemH / 2, ship.spriteKey, statX - 20, 1.2);
      const name = this.add.text(statX, itemH * 0.12, ship.name, textStyle(15, Css.text, { fontStyle: 'bold' }));
      const kc = kindColor(ship);
      const badge = addChip(this, 0, name.y + name.height / 2, kindShort(ship), kc.color, kc.css);
      // Long names drop their English part so the kind badge clears the + button.
      const nameRoom = w - statX - plusR * 2 - 30 - badge.getBounds().width - 10;
      fitName(name, ship.name, nameRoom);
      badge.setX(statX + name.displayWidth + 10);

      const meters = this.add.graphics();
      const stats: Array<[string, number, number, number]> = [
        ['耐久', ship.hp, this.maxStats.hp, Colors.success],
        ['装甲', ship.armor, this.maxStats.armor, Colors.gold],
        ['速力', ship.speed, this.maxStats.speed, Colors.cyan],
      ];
      const statLabels: Phaser.GameObjects.Text[] = [];
      stats.forEach(([label, value, max, color], si) => {
        const mx = statX + si * statSpacing;
        statLabels.push(this.add.text(mx, itemH * 0.5, `${label} ${value}`, textStyle(11, Css.muted)));
        drawMeter(meters, mx, itemH * 0.8, statSpacing - 12, IS_PORTRAIT ? 8 : 5, value / max, color);
      });

      const plus = this.add.graphics();
      plus.fillStyle(Colors.cyan, 0.15);
      const plusX = w - plusR - 13;
      plus.fillCircle(plusX, itemH / 2, plusR);
      plus.lineStyle(1.5, Colors.cyan, 0.7);
      plus.strokeCircle(plusX, itemH / 2, plusR);
      const plusLabel = this.add.text(plusX, itemH / 2 - 1, '+', textStyle(22, Css.cyan, { fontStyle: 'bold' })).setOrigin(0.5);

      const card = this.add.container(0, y, [bg, hover, icon, name, badge, meters, ...statLabels, plus, plusLabel]);
      this.shipList.addItem(card, w, itemH, this.onTap(() => this.addShipToFleet(ship)));
      card.on('pointerover', () => hover.setVisible(true));
      card.on('pointerout', () => hover.setVisible(false));
      this.shipCards.push(card);
    });
    this.shipList.setContentHeight(Math.max(0, shown.length * (itemH + ITEM_GAP) - ITEM_GAP));
    this.shipCountText.setText(shown.length === this.ships.length ? `${this.ships.length} 隻` : `${shown.length} / ${this.ships.length} 隻`);
  }

  /** Landscape only: more slots than one column holds go in two narrower columns. Portrait stays one column (#33). */
  private get gridSlots(): boolean {
    return !IS_PORTRAIT && this.slotCount > COLUMN_SLOTS;
  }

  /** Top of the first slot card, under the preset row. */
  private slotsTop(): number {
    return this.L.fleet.y + PANEL_HEADER_H + this.L.presetH + (IS_PORTRAIT ? 12 : 8);
  }

  private slotRect(i: number): IRect {
    const p = this.L.fleet;
    const top = this.slotsTop();
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const h = this.L.slotH;
    if (!this.gridSlots) return { x, y: top + i * (h + CARD_GAP), w, h };
    const cw = (w - CARD_GAP) / 2;
    return { x: x + (i % 2) * (cw + CARD_GAP), y: top + Math.floor(i / 2) * (h + CARD_GAP), w: cw, h };
  }

  private buildSlotPanel(): void {
    for (let i = 0; i < this.slotCount; i++) {
      const r = this.slotRect(i);
      const frame = this.add.graphics().setPosition(r.x, r.y);
      const hint = this.gridSlots ? '艦を追加' : IS_PORTRAIT ? '↓ 下の一覧から艦を追加' : '← 左の一覧から艦を追加';
      const emptyLabel = this.add.text(r.x + r.w / 2, r.y + r.h / 2 + 10, hint, textStyle(14, Css.dim)).setOrigin(0.5);
      const role = i === 0 ? 'FLAGSHIP · 旗艦' : this.gridSlots ? `ESCORT ${i}` : `ESCORT ${i} · 護衛`;
      this.add.text(r.x + 18, r.y + (IS_PORTRAIT ? 12 : this.gridSlots ? 8 : 16), role, eyebrowStyle(10, i === 0 ? Css.gold : Css.cyan));
      this.slotViews.push({ frame, content: null, emptyLabel });
    }
    // How to get more slots (#30): under the cards in portrait, in the unused room in landscape.
    const next = nextRank(loadProgress());
    if (!next) return;
    const text = `${next.rank.name}に昇進すると出撃枠 ${next.rank.slots}\n(作戦 あと ${next.clearsNeeded} 海域攻略)`;
    const last = this.slotRect(this.slotCount - 1);
    if (IS_PORTRAIT) {
      this.add.text(last.x + last.w / 2, last.y + last.h + CARD_GAP + P_HINT_H / 2, text, textStyle(13, Css.dim, { align: 'center' })).setOrigin(0.5);
    } else if (this.slotCount < COLUMN_SLOTS) {
      this.add.text(last.x + last.w / 2, last.y + last.h + CARD_GAP + this.L.slotH / 2, text, textStyle(13, Css.dim, { align: 'center' })).setOrigin(0.5);
    }
  }

  /** 編成 1-3 buttons and 保存 above the slots (#33): tap a preset to load it; 保存 then a preset to overwrite it. */
  private buildPresetRow(): void {
    const p = this.L.fleet;
    const h = this.L.presetH;
    const y = p.y + PANEL_HEADER_H + h / 2;
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const gap = 8;
    const saveW = IS_PORTRAIT ? 130 : 76;
    const bw = (w - saveW - gap * PRESET_COUNT) / PRESET_COUNT;
    const font = IS_PORTRAIT ? 13 : 10;
    this.presetButtons = Array.from({ length: PRESET_COUNT }, (_, i) =>
      new UIButton(this, x + i * (bw + gap) + bw / 2, y, '', this.onTap(() => this.onPreset(i)), { variant: 'secondary', width: bw, height: h, fontSize: font }),
    );
    this.presetSaveBtn = new UIButton(this, x + w - saveW / 2, y, '保存', this.onTap(() => {
      this.saveArmed = !this.saveArmed;
      this.refreshPresets();
    }), { variant: 'secondary', width: saveW, height: h, fontSize: font });
    this.refreshPresets();
  }


  private refreshPresets(): void {
    const presets = loadProgress().presets;
    const nameOf = (id: string): string | undefined => {
      const ship = this.shipRegistry.byId(id);
      return ship ? shortName(ship.name) : undefined;
    };
    this.presetButtons.forEach((b, i) => {
      const preset = presets[i] ?? null;
      b.setLabel(this.saveArmed ? `${i + 1}: ここに保存` : `${i + 1}: ${presetLabel(preset, nameOf)}`);
      b.setVariant(this.saveArmed ? 'gold' : preset ? 'primary' : 'secondary');
      b.setEnabled(this.saveArmed || preset !== null);
    });
    this.presetSaveBtn?.setLabel(this.saveArmed ? 'やめる' : '保存').setVariant(this.saveArmed ? 'gold' : 'secondary');
  }

  private onPreset(index: number): void {
    const progress = loadProgress();
    if (this.saveArmed) {
      const preset: IFleetPreset = {
        slotIds: this.slots.map((s) => s?.id ?? null),
        captainIds: this.captainIds.map((id, i) => (this.slots[i] ? id : null)),
        formation: this.formation,
      };
      saveProgress({ ...progress, presets: withPreset(progress.presets, index, preset) });
      this.saveArmed = false;
      this.refreshPresets();
      return;
    }
    const preset = progress.presets[index];
    if (!preset) return;
    const placed = applyPreset(preset, this.ships.map((s) => s.id), this.slotCount);
    this.slots = placed.slotIds.map((id) => (id ? this.ships.find((s) => s.id === id) ?? null : null));
    this.captainIds = placed.captainIds;
    this.formation = usableFormation(preset.formation, this.rankIndex);
    this.refresh();
  }

  private formationCardRect(i: number): IRect {
    const p = this.L.formations;
    const top = p.y + PANEL_HEADER_H + 4;
    const gap = IS_PORTRAIT ? CARD_GAP : 8;
    const w = (p.w - PANEL_PAD * 2 - gap * (FORMATION_COLS - 1)) / FORMATION_COLS;
    const h = this.L.formationCardH;
    return { x: p.x + PANEL_PAD + (i % FORMATION_COLS) * (w + gap), y: top + Math.floor(i / FORMATION_COLS) * (h + gap), w, h };
  }

  /** Six formation cards (#59): name, its trade-off in one line and a small diagram; locked ones show the rank needed. */
  private buildFormationPanel(): void {
    FORMATION_ORDER.forEach((formation, i) => {
      const r = this.formationCardRect(i);
      const rule = FORMATION_RULES[formation];
      const open = formationUnlocked(formation, this.rankIndex);
      const frame = this.add.graphics();
      this.formationFrames.push(frame);
      const p = IS_PORTRAIT;
      const textW = r.w - (p ? 120 : 64);
      const parts: Phaser.GameObjects.GameObject[] = [
        frame,
        this.add.text(p ? 18 : 12, p ? 14 : 5, rule.ja, p ? displayStyle(22) : textStyle(15, Css.text, { fontStyle: 'bold' })),
      ];
      const sub = open ? rule.summary : `要 ${RANKS[Math.min(rule.minRank, RANKS.length - 1)].name}`;
      const subText = this.add.text(p ? 18 : 12, p ? 56 : r.h - 18, sub, textStyle(p ? 12 : 9, open ? Css.muted : Css.danger, {
        wordWrap: p ? { width: textW, useAdvancedWrap: true } : undefined,
      }));
      if (!p && subText.width > r.w - 24) subText.setScale((r.w - 24) / subText.width);
      parts.push(subText);
      // Landscape cards are too short for a diagram next to the text.
      if (p) {
        const diagram = this.add.graphics();
        this.drawFormationDiagram(diagram, formation, r.w - 56, r.h / 2, 0.8);
        parts.push(diagram);
      }

      const card = this.add.container(r.x, r.y, parts).setAlpha(open ? 1 : 0.45);
      makeClickable(card, r.w, r.h);
      card.on('pointerup', this.onTap(() => open && this.selectFormation(formation)));
    });
  }

  private drawFormationDiagram(g: Phaser.GameObjects.Graphics, formation: Formation, cx: number, cy: number, k: number): void {
    g.fillStyle(Colors.cyan, 0.06);
    g.fillCircle(cx, cy, 50 * k);
    g.lineStyle(1, Colors.cyan, 0.2);
    g.strokeCircle(cx, cy, 50 * k);

    const ship = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx + (dx - 4) * k, cy + (dy - 10) * k, 8 * k, 20 * k, 4 * k);
    };
    const flag = Colors.gold;
    const esc = Colors.cyan;
    switch (formation) {
      case Formation.LineAhead:
        ship(0, -32, flag); ship(0, 0, esc); ship(0, 32, esc);
        break;
      case Formation.DoubleLine:
        ship(0, -22, flag); ship(-14, 14, esc); ship(14, 14, esc); ship(-14, 40, esc); ship(14, 40, esc);
        break;
      case Formation.Circle:
        ship(0, 0, flag); ship(0, -34, esc); ship(-30, 14, esc); ship(30, 14, esc); ship(0, 34, esc);
        break;
      case Formation.Echelon:
        ship(-24, -28, flag); ship(-8, -6, esc); ship(8, 16, esc); ship(24, 38, esc);
        break;
      case Formation.LineAbreast:
        ship(0, 0, flag); ship(-20, 0, esc); ship(20, 0, esc); ship(-40, 0, esc); ship(40, 0, esc);
        break;
      case Formation.Vanguard:
        ship(-14, -34, esc); ship(14, -34, esc); ship(0, 4, flag); ship(-14, 32, esc); ship(14, 32, esc);
        break;
    }
  }

  private buildFooter(): void {
    const f = this.L.footer;
    const onStart = this.onTap(() => {
      if (this.canStart()) this.startBattle();
    });
    const btn = { variant: 'gold' as const, fontSize: 22, caption: 'START BATTLE' };

    if (IS_PORTRAIT) {
      // Fixed bar: count + summary on one line, full-width deploy button below.
      const bar = this.add
        .rectangle(0, CANVAS_H - FOOTER_BAR_H, CANVAS_W, FOOTER_BAR_H, Colors.bgDeep, 0.94)
        .setOrigin(0, 0)
        .setInteractive();
      const panel = addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
      this.countText = this.add.text(f.x + 24, f.y + 12, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
      this.summaryText = this.add.text(f.x + f.w - 24, f.y + 20, '', textStyle(14, Css.muted)).setOrigin(1, 0);
      this.startBtn = new UIButton(this, CANVAS_W / 2, f.y + f.h - 46, '出撃  ▶', onStart, { ...btn, width: f.w - 32, height: 76 });
      this.pin([bar, panel, this.countText, this.summaryText, this.startBtn], 60);
      return;
    }

    addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
    this.add.text(f.x + 28, f.y + 22, 'FLEET SUMMARY', eyebrowStyle(10, Css.muted));
    this.countText = this.add.text(f.x + 28, f.y + 42, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
    this.summaryText = this.add.text(f.x + 176, f.y + 26, '', textStyle(14, Css.muted, { lineSpacing: 6 }));
    this.startBtn = new UIButton(this, f.x + f.w - 172, f.y + f.h / 2, '出撃  ▶', onStart, { ...btn, width: 300, height: 60 });
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private addShipToFleet(ship: IShipData): void {
    const emptyIndex = this.slots.findIndex((s) => s === null);
    if (emptyIndex === -1) return;
    this.slots[emptyIndex] = ship;
    this.refresh();
  }

  private removeShipFromSlot(index: number): void {
    this.slots[index] = null;
    this.captainIds[index] = null;
    this.refresh();
  }

  private selectFormation(formation: Formation): void {
    this.formation = formation;
    this.refreshFormations();
    this.refreshFooter();
  }

  private refresh(): void {
    this.refreshSlots();
    this.refreshFormations();
    this.refreshFooter();
  }

  private refreshSlots(): void {
    this.slots.forEach((ship, i) => {
      const { w, h } = this.slotRect(i);
      const view = this.slotViews[i];
      view.frame.clear();
      view.content?.destroy();
      view.content = null;

      if (!ship) {
        drawPanel(view.frame, 0, 0, w, h, { radius: 18, fillAlpha: 0.25, dashed: true, rimAlpha: 0.35 });
        view.emptyLabel.setVisible(true);
        return;
      }

      const isFlag = i === 0 || this.slots.findIndex((s) => s !== null) === i;
      drawPanel(view.frame, 0, 0, w, h, {
        radius: 18,
        fill: Colors.panelHi,
        fillAlpha: 0.75,
        rim: isFlag ? Colors.gold : Colors.cyan,
        rimAlpha: 0.6,
        glow: 0.8,
      });
      view.emptyLabel.setVisible(false);
      const parts = this.gridSlots ? this.narrowSlotParts(ship, i, w, h) : this.wideSlotParts(ship, i, w, h);
      view.content = this.add.container(view.frame.x, view.frame.y, parts);
    });
  }

  /** "41cm 連装砲 ×4": the ship's first (main) weapon. */
  private mainArmament(ship: IShipData): string {
    const first = summarizeWeapons(ship.weapons)[0];
    if (!first) return ship.airWing ? '艦載機' : '—';
    const name = DataLoader.getWeaponById(this, first.id)?.name ?? first.id;
    return `${name}${first.count > 1 ? ` ×${first.count}` : ''}`;
  }

  /**
   * A full-width slot card: kind badge and name, HP / armour / speed (or damage) with crew proficiency, main
   * armament, then the captain, detail and remove buttons. Used for every slot in portrait (#33).
   */
  private wideSlotParts(ship: IShipData, i: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
    const p = IS_PORTRAIT;
    const nameX = p ? 124 : 100;
    const kc = kindColor(ship);
    const rowY = p ? 52 : 44;
    const badge = addChip(this, nameX, rowY, kindShort(ship), kc.color, kc.css);
    const nameLeft = nameX + chipWidth(badge) + 8;
    const name = this.add.text(nameLeft, rowY, ship.name, textStyle(p ? 18 : 16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    // Leave room for the remove button on the right.
    fitName(name, ship.name, w - nameLeft - (p ? 84 : 64));
    const status = this.add.text(nameX, rowY + (p ? 20 : 16), this.slotStatus(ship), textStyle(13, this.isDamaged(ship) ? Css.danger : Css.muted));
    const arm = this.add.text(nameX, status.y + status.height + 4, `主兵装  ${this.mainArmament(ship)}`, textStyle(12, Css.muted));
    const room = w - nameX - 16;
    for (const t of [status, arm]) if (t.width > room) t.setScale(room / t.width);

    const captain = this.captainOf(i);
    const captainLabel = captain ? `艦長 ${captain.name}  Lv${captain.level} ${SKILL_LABEL[captain.skill]}` : '艦長を任命  ›';
    const btnH = p ? 40 : 24;
    const btnY = h - (p ? 26 : 18);
    const detailW = p ? 110 : 64;
    const captainW = Math.min(p ? 320 : 220, w - nameX - detailW - 24);
    const captainBtn = new UIButton(this, nameX + captainW / 2, btnY, captainLabel, this.onTap(() => this.cycleCaptain(i)), {
      variant: captain ? 'primary' : 'secondary', width: captainW, height: btnH, fontSize: 11,
    });
    const detailBtn = new UIButton(this, nameX + captainW + 10 + detailW / 2, btnY, '詳細  ›', this.onTap(() => this.openDetail(ship, i)), {
      variant: 'secondary', width: detailW, height: btnH, fontSize: 11,
    });
    const remove = new UIButton(this, p ? w - 44 : w - 34, p ? 44 : 30, '✕', this.onTap(() => this.removeShipFromSlot(i)), {
      variant: 'secondary', width: p ? 60 : 40, height: p ? 52 : 36, fontSize: 15,
    });
    const icon = p ? this.addShipIcon(62, h * 0.55, ship.spriteKey, 92, 1.3) : this.addShipIcon(54, h * 0.55, ship.spriteKey, 76, 1.3);
    return [icon, badge, name, status, arm, captainBtn, detailBtn, remove];
  }

  /** A two-column slot card (landscape, more than three slots): badge and name, short stats, captain and detail buttons. */
  private narrowSlotParts(ship: IShipData, i: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
    const nameX = 62;
    const kc = kindColor(ship);
    const badge = addChip(this, nameX, 36, kindShort(ship), kc.color, kc.css);
    const nameLeft = nameX + chipWidth(badge) + 6;
    const name = this.add.text(nameLeft, 36, ship.name, textStyle(13, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    fitName(name, ship.name, w - nameLeft - 8);
    const status = this.add.text(nameX, 47, this.slotStatus(ship, true), textStyle(11, this.isDamaged(ship) ? Css.danger : Css.muted));
    if (status.width > w - nameX - 8) status.setScale((w - nameX - 8) / status.width);
    const captain = this.captainOf(i);
    const btnH = Math.min(24, h - 70);
    const detailW = 48;
    const captainBtn = new UIButton(this, (w - detailW - 6) / 2, h - btnH / 2 - 6, captain ? `${captain.name} Lv${captain.level}` : '艦長 ›', this.onTap(() => this.cycleCaptain(i)), {
      variant: captain ? 'primary' : 'secondary', width: w - detailW - 22, height: btnH, fontSize: 10,
    });
    const detailBtn = new UIButton(this, w - 8 - detailW / 2, h - btnH / 2 - 6, '詳細', this.onTap(() => this.openDetail(ship, i)), {
      variant: 'secondary', width: detailW, height: btnH, fontSize: 10,
    });
    const remove = new UIButton(this, w - 18, 16, '✕', this.onTap(() => this.removeShipFromSlot(i)), {
      variant: 'secondary', width: 26, height: 22, fontSize: 12,
    });
    return [this.addShipIcon(32, 42, ship.spriteKey, 44, 1), badge, name, status, captainBtn, detailBtn, remove];
  }

  /**
   * Detail sheet for a fleet ship (#33): kind, stats, every weapon, aircraft, crew, damage and captain. Covers the
   * screen (fixed to the camera) until closed.
   */
  private openDetail(ship: IShipData, slot: number): void {
    this.closeDetail();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(80);
      this.detail.push(o);
      return o;
    };
    // Swallows taps so nothing underneath reacts while the sheet is open.
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive());
    const d = IS_PORTRAIT ? { x: 16, y: 150, w: CANVAS_W - 32, h: CANVAS_H - 300 } : { x: 240, y: 70, w: 800, h: 580 };
    add(addPanel(this, d.x, d.y, d.w, d.h, { radius: 24, fillAlpha: 0.95, glow: 0.8 }));
    const x = d.x + 28;
    const w = d.w - 56;
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true } };
    add(this.add.text(x, d.y + 22, `${NATION_INFO[ship.nation].ja}  ·  ${kindLabel(ship)}${ship.fictional ? '  ·  架空艦' : ''}`, eyebrowStyle(11, Css.cyan)));
    const title = add(this.add.text(x, d.y + 46, ship.name, displayStyle(IS_PORTRAIT ? 26 : 24)));
    const icon = add(this.add.image(d.x + d.w - 40, d.y + 30, ship.spriteKey).setOrigin(1, 0));
    icon.setScale(Math.min(2, (IS_PORTRAIT ? 150 : 120) / Math.max(1, icon.height)));

    let y = title.y + title.height + 20;
    const meters = add(this.add.graphics());
    const rows: Array<[string, number, number, number]> = [
      ['耐久', ship.hp, this.maxStats.hp, Colors.success],
      ['装甲', ship.armor, this.maxStats.armor, Colors.gold],
      ['速力', ship.speed, this.maxStats.speed, Colors.cyan],
    ];
    const meterW = Math.min(IS_PORTRAIT ? w - 230 : 360, w - 200);
    for (const [label, v, max, color] of rows) {
      add(this.add.text(x, y, label, eyebrowStyle(11, Css.muted)));
      drawMeter(meters, x + 60, y + 4, meterW, 9, v / max, color);
      add(this.add.text(x + 74 + meterW, y - 3, String(v), textStyle(15, Css.text, { fontStyle: 'bold' })));
      y += 30;
    }
    y += 8;
    add(this.add.text(x, y, '状態', eyebrowStyle(11, Css.gold)));
    y += 22;
    const state = add(this.add.text(x, y, this.slotStatus(ship), textStyle(14, this.isDamaged(ship) ? Css.danger : Css.text, wrap)));
    y += state.height + 14;

    add(this.add.text(x, y, '兵装', eyebrowStyle(11, Css.gold)));
    y += 22;
    const lines = summarizeWeapons(ship.weapons).map(({ id, count }) => {
      const wd = DataLoader.getWeaponById(this, id);
      return `${wd?.name ?? id}${count > 1 ? ` ×${count}` : ''}`;
    });
    if (ship.airWing) {
      const a = ship.airWing;
      lines.push(`艦載機  戦闘機 ${a.fighters} / 艦爆 ${a.diveBombers} / 艦攻 ${a.torpedoBombers}`);
    }
    const arm = add(this.add.text(x, y, lines.join('\n') || '—', textStyle(14, Css.text, { ...wrap, lineSpacing: 4 })));
    y += arm.height + 14;

    const captain = this.captainOf(slot);
    add(this.add.text(x, y, '艦長', eyebrowStyle(11, Css.gold)));
    y += 22;
    add(this.add.text(x, y, captain ? `${captain.name}  Lv${captain.level}  ${SKILL_LABEL[captain.skill]}` : '未任命 (カードの「艦長を任命」で選べます)', textStyle(14, captain ? Css.text : Css.muted, wrap)));

    const closeW = IS_PORTRAIT ? d.w - 56 : 240;
    add(new UIButton(this, d.x + d.w / 2, d.y + d.h - (IS_PORTRAIT ? 50 : 40), '閉じる', () => this.closeDetail(), {
      variant: 'secondary', width: closeW, height: IS_PORTRAIT ? 64 : 48, fontSize: 16,
    }));
  }

  private closeDetail(): void {
    for (const o of this.detail) o.destroy();
    this.detail = [];
  }

  private refreshFormations(): void {
    FORMATION_ORDER.forEach((f, i) => {
      const { w, h } = this.formationCardRect(i);
      const selected = f === this.formation;
      const g = this.formationFrames[i];
      g.clear();
      drawPanel(g, 0, 0, w, h, {
        radius: IS_PORTRAIT ? 18 : 12,
        fill: selected ? Colors.panelHi : Colors.panel,
        fillAlpha: selected ? 0.9 : 0.45,
        rimAlpha: selected ? 0.85 : 0.2,
        glow: selected ? 1 : 0,
      });
      if (selected) {
        g.fillStyle(Colors.cyan, 1);
        g.fillCircle(w - (IS_PORTRAIT ? 18 : 10), IS_PORTRAIT ? 18 : 10, IS_PORTRAIT ? 5 : 3);
      }
    });
  }

  private refreshFooter(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    this.countText.setText(`${ships.length} / ${this.slotCount} 隻`);
    if (ships.length === 0) {
      this.summaryText.setText(IS_PORTRAIT ? '艦を選ぶと出撃できます' : '艦を 1 隻以上選ぶと出撃できます');
    } else {
      const totalHp = ships.reduce((sum, s) => sum + s.hp, 0);
      const minSpeed = Math.min(...ships.map((s) => s.speed));
      const formation = FORMATION_RULES[this.formation].ja;
      const opts = this.sortieOptions();
      const blockers = sortieBlockers(loadProgress(), ships, Date.now(), opts);
      const price = isFreeSortie(opts) ? (opts.exercise ? '無料 (演習)' : '無料 (最初の海域)') : formatResources(sortieCostFor(ships, opts));
      const cost = `出撃コスト  ${price}`;
      const second = blockers.length > 0 ? `⚠ ${blockers.join(' / ')}` : cost;
      this.summaryText
        .setText(
          IS_PORTRAIT
            ? blockers.length > 0 ? second : `${formation} · ${price}`
            : `総耐久 ${totalHp}   艦隊速力 ${minSpeed}   陣形 ${formation}\n${second}`,
        )
        .setColor(blockers.length > 0 ? Css.danger : Css.muted);
    }
    this.startBtn.setEnabled(this.canStart());
  }

  /** 演習 (no campaign area) is free and may use docked ships (#15); the first area of a theater is free (#28). */
  private sortieOptions(): ISortieOptions {
    return { exercise: this.area === null, area: this.area };
  }

  private canStart(): boolean {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    return ships.length > 0 && sortieBlockers(loadProgress(), ships, Date.now(), this.sortieOptions()).length === 0;
  }

  private isDamaged(ship: IShipData): boolean {
    return hpFraction(loadProgress(), ship.id) < 1;
  }

  /** "HP 210/500 · 入渠中" for damaged ships, plain stats otherwise; `short` for two-column cards. */
  private slotStatus(ship: IShipData, short = false): string {
    const progress = { ...loadProgress(), ...completeRepairs(loadProgress(), Date.now()) };
    const f = hpFraction(progress, ship.id);
    const p = progress.proficiency[ship.id] ?? 0;
    if (f >= 1) return short ? `HP ${ship.hp} 装 ${ship.armor} 速 ${ship.speed}` : `HP ${ship.hp}  装甲 ${ship.armor}  速力 ${ship.speed}  ·  ${proficiencyLabel(p)} ${p}`;
    const tag = isDocked(progress, ship.id) ? '入渠中' : f <= 0.25 ? '大破' : f <= 0.5 ? '中破' : '小破';
    // Exercises start at full HP, so the damage only matters for a campaign sortie.
    const note = this.area ? '' : ' (演習は満タン)';
    return short ? `HP ${Math.round(ship.hp * f)}/${ship.hp} ${tag}` : `HP ${Math.round(ship.hp * f)} / ${ship.hp}   ${tag}${note}`;
  }

  private captainOf(slot: number): ICaptain | null {
    const data = this.captainData.find((c) => c.id === this.captainIds[slot]);
    return data ? withProgress(data, loadProgress().captainXp[data.id] ?? 0) : null;
  }

  /** Tap: next captain of this nation not commanding another slot, then none. */
  private cycleCaptain(slot: number): void {
    const taken = new Set(this.captainIds.filter((id, i) => id && i !== slot));
    const options: (string | null)[] = [
      null,
      ...this.captainData.filter((c) => c.nation === this.nation && !taken.has(c.id)).map((c) => c.id),
    ];
    const at = options.indexOf(this.captainIds[slot]);
    this.captainIds[slot] = options[(at + 1) % options.length];
    this.refreshSlots();
  }

  /** 改装: refit the ships of this fleet (upgrade slots). */
  private buildRefitButton(): void {
    const p = this.L.fleet;
    const bw = IS_PORTRAIT ? 150 : 110;
    const bh = IS_PORTRAIT ? 52 : 32;
    new UIButton(
      this,
      p.x + p.w - PANEL_PAD - bw / 2,
      p.y + (IS_PORTRAIT ? 42 : 32),
      '改装  ›',
      this.onTap(() => {
        this.saveSelection();
        this.scene.start(SceneKeys.CUSTOMIZATION, { returnTo: SceneKeys.FLEET_BUILDER });
      }),
      { variant: 'secondary', width: bw, height: bh, fontSize: 14 },
    );
  }

  private saveSelection(): void {
    const selection: ISelection = {
      nation: this.nation,
      enemyNation: this.enemyNation,
      mode: this.mode,
      formation: this.formation,
      slotIds: this.slots.map((s) => s?.id ?? null),
      captainIds: this.captainIds.map((id, i) => (this.slots[i] ? id : null)),
      weather: this.weatherChoice,
      time: this.timeChoice,
      extra: this.extra,
    };
    this.registry.set(SELECTION_KEY, selection);
  }

  private startBattle(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    const paid = paySortie(loadProgress(), ships, this.sortieOptions());
    if (!paid) return;
    saveProgress(paid);
    this.saveSelection();
    const flagshipIndex = this.slots.findIndex((s) => s !== null);

    const playerFleet = FleetSystem.createFleet(
      'player-fleet',
      '第一艦隊',
      this.nation,
      this.slots,
      flagshipIndex,
    );

    const area = this.area;
    const enemyShipsList = area
      ? enemyShips(area, this.shipRegistry, enemyNationFor(campaignData as ICampaignData, area, this.nation))
      : exerciseEnemyFleet(this.shipRegistry, this.enemyNation, this.mode, ships, this.extra);
    const enemyFleet = FleetSystem.createFleet(
      'enemy-fleet',
      'Enemy Fleet',
      area ? enemyNationFor(campaignData as ICampaignData, area, this.nation) : this.enemyNation,
      enemyShipsList,
      0,
    );

    const initData: IBattleInitData = {
      playerFleet,
      enemyFleet,
      mapKey: area?.map ?? '',
      formation: this.formation,
      mode: area ? areaMode(enemyShipsList) : this.mode,
      weather: area ? area.weather : this.weatherChoice === RANDOM ? randomWeather() : this.weatherChoice,
      time: area ? area.time : this.timeChoice === RANDOM ? randomTime() : this.timeChoice,
      captainIds: this.captainIds.map((id, i) => (this.slots[i] ? id : null)),
      areaId: area?.id,
      objective: area?.objective ?? Objective.Annihilate,
    };

    this.scene.start(SceneKeys.BATTLE, initData);
  }
}
