import Phaser from 'phaser';
import { skillOf, skillText } from '@/systems/ShipSkillSystem';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { exerciseEnemyCount, exerciseEnemyFleet, trainingEnemyFleet, MAX_EXERCISE_ENEMIES } from '@/systems/EnemyFleetGenerator';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { BattleMode } from '@/types/Battle';
import { ICampaignArea, ICampaignData, Objective } from '@/types/Campaign';
import { areaMode, enemyNationFor, enemyShips } from '@/systems/CampaignSystem';
import { CAMPAIGN_AREA_KEY, OBJECTIVE_LABEL, SW_AREA_KEY } from '@/scenes/CampaignMapScene';
import campaignData from '@/data/campaign.json';
import { TimeOfDay, Weather } from '@/types/Weather';
import { randomTime, randomWeather, TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { ICaptain, ICaptainData } from '@/types/Captain';
import { aptitudeFor, assignCaptains, captainFit, SKILL_LABEL, withProgress } from '@/systems/CaptainSystem';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { askShipName } from '@/ui/components/FilterBar';
import { shipSearchNames } from '@/utils/SearchHistory';
import { availableShips } from '@/systems/ResearchSystem';
import { ISortieOptions, isFreeSortie, paySortie, sortieBlockers, sortieCostFor } from '@/systems/ProgressionSystem';
import { supplyMul } from '@/systems/BaseSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { ownedShips } from '@/systems/ShipyardSystem';
import { costCap, costText, fitsCost, fleetCost, shipCost } from '@/systems/FleetCost';
import { MORALE_TIRED, MORALE_WARN, moraleLabel, moraleMood, moraleOf } from '@/systems/MoraleSystem';
import { autoFleet } from '@/systems/AutoFleet';
import { withQuestEvents } from '@/systems/QuestSystem';
import { fleetSlots, needText, nextSlotRank, RANKS, rankOf } from '@/systems/RankSystem';
import { completeRepairs, hpFraction, isDocked } from '@/systems/DockSystem';
import { HEAVY_DAMAGE } from '@/systems/SortieMapSystem';
import { proficiencyLabel } from '@/systems/ProficiencySystem';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { filterAndSort, isHeavyCruiser, KIND_FILTERS, KindFilter, kindBreakdown, kindGroups, kindShort, ShipSort, SORT_LABEL } from '@/systems/ShipKind';
import { FORMATION_ORDER, FORMATION_RULES, formationUnlocked, usableFormation } from '@/systems/FormationRules';
import { applyPreset, IFleetPreset, PRESET_COUNT, presetLabel, withPreset } from '@/systems/PresetSystem';
import { filterShips, NO_FILTER } from '@/systems/ListFilter';
import { filterEntries, kindLabel, summarizeWeapons } from '@/systems/EncyclopediaSystem';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { actionVariant, addBackdrop, addChip, addPanel, drawMeter, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { beginSortie } from '@/utils/SortieFlow';
import { SELECTION_KEY } from '@/utils/FleetSelection';
import { fleetPowerBreakdown, IPowerBreakdown, POWER_SOURCE_LABEL, POWER_SOURCES, strengthMark } from '@/systems/FleetPower';
import { ISupportChoice, MISSION_LABEL, MISSION_NOTE, MISSIONS, resolveSupport, sailingIds, supportSlots } from '@/systems/FleetGroups';
import { EXPEDITIONS, shipsAway } from '@/systems/ExpeditionSystem';
import { inDorm } from '@/systems/DormSystem';
import { enemyScale, fleetPower } from '@/systems/DifficultyCurve';


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
/** Ship detail and ship picker sheets draw above the page and its fixed bars. */
const SHEET_DEPTH = 80;

interface IRect { x: number; y: number; w: number; h: number }

interface IBuilderLayout {
  /** Landscape only: the permanent ship list (portrait picks ships from a sheet, #77) */
  ships: IRect;
  shipItemH: number;
  /** Height of the info line at the top of the ship list */
  tabH: number;
  /** Height of the kind-filter and sort rows above a ship list (#33) */
  filterH: number;
  fleet: IRect;
  /** Fleet preset buttons row (#33) */
  presetH: number;
  slotH: number;
  /** Formation and opponent settings (#77); its height grows with the open group in portrait */
  settings: IRect;
  /** Height of a collapsed settings row / of one radio option */
  settingRowH: number;
  optionH: number;
  footer: IRect;
}

const ITEM_GAP = IS_PORTRAIT ? 8 : 6;
const CARD_GAP = 10;

const P_SHIP_ITEM_H = 120;
const P_TAB_H = 48;
const P_FILTER_H = 52;
/** Portrait slot cards stay in one column; the tallest card when the fleet is small (#33). */
const P_SLOT_MAX_H = 168;
/** Below this height a portrait card drops its main-armament line; below the tiny one everything shrinks. */
const P_SLOT_FULL_H = 150;
const P_SLOT_TINY_H = 120;
const P_PRESET_H = 56;
const P_HINT_H = 64;
const L_FLEET_H = 512;

/**
 * Landscape: ships | fleet | settings in three columns, everything on one screen.
 * Portrait: the fleet fills the first screen (its cards shrink to fit up to 8 slots, so swapping ships and the
 * sortie need no scrolling, #77); the settings follow below it.
 */
function builderLayout(slotCount: number, promotionHint: boolean): IBuilderLayout {
  if (IS_PORTRAIT) {
    const fleetTop = HEADER_BAR_H + 12;
    const hintH = promotionHint ? CARD_GAP + P_HINT_H : 0;
    const room = CANVAS_H - FOOTER_BAR_H - 12 - fleetTop - PANEL_HEADER_H - P_PRESET_H - 12 - 14 - hintH;
    const slotH = Math.min(P_SLOT_MAX_H, Math.floor((room - (slotCount - 1) * CARD_GAP) / slotCount));
    const fleetH = PANEL_HEADER_H + P_PRESET_H + 12 + slotCount * slotH + (slotCount - 1) * CARD_GAP + hintH + 14;
    const fleet = { x: 16, y: fleetTop, w: CANVAS_W - 32, h: fleetH };
    return {
      ships: { x: 16, y: 0, w: CANVAS_W - 32, h: 0 },
      shipItemH: P_SHIP_ITEM_H,
      tabH: P_TAB_H,
      filterH: P_FILTER_H,
      fleet,
      presetH: P_PRESET_H,
      slotH,
      settings: { x: 16, y: fleet.y + fleet.h + 16, w: CANVAS_W - 32, h: 0 },
      settingRowH: 64,
      optionH: 56,
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
    settings: { x: 872, y: 92, w: 384, h: L_FLEET_H },
    settingRowH: 34,
    optionH: 30,
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
type Choice<T> = T | typeof RANDOM;
const WEATHER_CHOICES: Array<Choice<Weather>> = [RANDOM, Weather.Clear, Weather.Overcast, Weather.Storm, Weather.Fog];
const TIME_CHOICES: Array<Choice<TimeOfDay>> = [RANDOM, TimeOfDay.Day, TimeOfDay.Night];

const BATTLE_MODES: BattleMode[] = [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW];
const MODE_CHOICES: Array<Choice<BattleMode>> = [RANDOM, ...BATTLE_MODES];
const MODE_LABEL: Record<BattleMode, string> = {
  [BattleMode.Surface]: '水上戦',
  [BattleMode.CarrierStrike]: '機動部隊',
  [BattleMode.ASW]: '対潜戦',
};
/** Free battle enemy count (#78): 0 = as many as the player's fleet, otherwise 1 to MAX_EXERCISE_ENEMIES ships. */
const SAME_COUNT = 0;

/** Exercise opponent, battle type, weather, time and enemy count. */
interface IExerciseChoices {
  enemyNation: Choice<Nation>;
  mode: Choice<BattleMode>;
  weather: Choice<Weather>;
  time: Choice<TimeOfDay>;
  count: number;
  /** 訓練 (#343) */
  training?: boolean;
}

/** The standard exercise: the nation's first campaign opponent, a surface battle on a clear day, as many ships. */
function standardExercise(nation: Nation): IExerciseChoices {
  const theater = (campaignData as ICampaignData).theaters.find((t) => (t.opponents as Partial<Record<Nation, Nation>>)[nation]);
  const foe = (theater?.opponents as Partial<Record<Nation, Nation>> | undefined)?.[nation] ?? PLAYABLE_NATIONS.find((n) => n !== nation) ?? RANDOM;
  return { enemyNation: foe, mode: BattleMode.Surface, weather: Weather.Clear, time: TimeOfDay.Day, count: SAME_COUNT, training: false };
}

/** 全てランダム: every choice drawn at sortie (the enemy count stays as set). */
const ALL_RANDOM: Omit<IExerciseChoices, 'count'> = { enemyNation: RANDOM, mode: RANDOM, weather: RANDOM, time: RANDOM };

function choiceLabel<T extends string>(c: Choice<T>, labels: Record<T, string>): string {
  return c === RANDOM ? 'ランダム' : labels[c];
}

/**
 * Fleet Builder setups by nation, kept in the game registry for the session: leaving the builder any way (sortie,
 * refit, back) and coming back restores the fleet, formation and settings (#77).
 */
export { SELECTION_KEY };
export interface ISelection {
  nation: Nation;
  enemyNation: Choice<Nation>;
  mode: Choice<BattleMode>;
  formation: Formation;
  slotIds: (string | null)[];
  captainIds?: (string | null)[];
  weather?: Choice<Weather>;
  time?: Choice<TimeOfDay>;
  /** Free battle enemy count, SAME_COUNT = as many as the player (#78) */
  enemyCount?: number;
  /** 敵の強さ: 訓練 (#343) */
  training?: boolean;
}

/** The setup last used with `nation`'s fleet in this session. */
export function selectionFor(registry: Phaser.Data.DataManager, nation: Nation): ISelection | undefined {
  const all = registry.get(SELECTION_KEY) as Partial<Record<Nation, ISelection>> | undefined;
  return all?.[nation];
}

interface ISlotView {
  frame: Phaser.GameObjects.Graphics;
  content: Phaser.GameObjects.Container | null;
  emptyLabel: Phaser.GameObjects.Text;
}

/** One radio option in a settings group. */
interface IOption {
  label: string;
  selected: boolean;
  enabled: boolean;
  pick: () => void;
}

/** A collapsible settings row (#77): its current value on one line, radio options when open. */
interface ISettingGroup {
  key: string;
  title: string;
  value: string;
  options: IOption[];
  cols: number;
  /** Extra line under the open options (e.g. the chosen formation's trade-off) */
  note?: string;
  /** A one-line − / + stepper with a 同数 toggle instead of radio options (enemy count, up to 20 ships) */
  stepper?: IStepper;
}

interface IStepper {
  /** Opens the 1-20 list (#108) */
  pick: () => void;
  /** Line under the row (how to type the number) */
  hint?: string;
  same: boolean;
  toggleSame: () => void;
  step: (delta: number) => void;
  canDec: boolean;
  canInc: boolean;
}

/** Kind filter + sort toggle rows above a ship list. */
interface IListControls {
  filters: UIButton[];
  sorts: UIButton[];
}

const SORTS = [ShipSort.Default, ShipSort.Hp, ShipSort.Speed, ShipSort.Morale];

export class FleetBuilderScene extends Phaser.Scene {
  private shipRegistry!: ShipRegistry;
  private ships: IShipData[] = [];
  /** Owned ships based elsewhere (#145): offered after the base's own, brought over for fuel */
  private slots: (IShipData | null)[] = [null];
  /** The fleet's cost cap at the admiral's rank (#306) */
  private costCap = 0;
  /** Fleet slots the admiral's rank allows (#25 / #30) */
  private slotCount = 1;
  /** Free battle enemy count (#78) */
  private enemyCount = SAME_COUNT;
  /** 演習の訓練 (#343): the enemy's weakest ships */
  private training = false;
  private formation: Formation = Formation.LineAhead;
  private nation: Nation = Nation.IJN;
  /** Captain id assigned to each slot */
  private captainIds: (string | null)[] = [null];
  private captainData: ICaptainData[] = [];
  /** Campaign operation being prepared (null = free battle) */
  private area: ICampaignArea | null = null;
  /** 超兵器海域 (#148): the area is fought once against its giant, outside any sortie */
  private swArea = false;
  private enemyNation: Choice<Nation> = RANDOM;
  private mode: Choice<BattleMode> = RANDOM;
  private weatherChoice: Choice<Weather> = RANDOM;
  private timeChoice: Choice<TimeOfDay> = RANDOM;

  /** Landscape only: the permanent ship list */
  private shipList: ScrollList | null = null;
  private shipCountText: Phaser.GameObjects.Text | null = null;
  private titleText!: Phaser.GameObjects.Text;
  private nationChip: Phaser.GameObjects.Container | null = null;

  private slotViews: ISlotView[] = [];
  private shipCards: Array<{ id: string; card: Phaser.GameObjects.Container }> = [];
  private summaryText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private maxStats = { hp: 1, armor: 1, speed: 1 };
  /** Portrait scrolling: true while the current pointer gesture is a drag, so taps are ignored */
  private dragging = false;
  /** Layout for this fleet size */
  private L!: IBuilderLayout;
  /** Admiral rank index: unlocks formations (#59) */
  private rankIndex = 0;
  /** Ship list filter and order (#33), shared by the landscape list and the picker sheet */
  private kindFilter: KindFilter = KindFilter.All;
  private sort: ShipSort = ShipSort.Default;
  /** Name search over the ship list (#263) */
  private query = '';
  private listControls: IListControls | null = null;
  /** Preset buttons; while `saveArmed` the next preset tapped is overwritten with the current fleet */
  private presetButtons: UIButton[] = [];
  private presetSaveBtn: UIButton | null = null;
  private saveArmed = false;
  /** Open ship detail sheet (#33) */
  private detail: Phaser.GameObjects.GameObject[] = [];
  /** Open ship picker sheet (#77): its objects, list, controls and the slot it fills */
  private picker: Phaser.GameObjects.GameObject[] = [];
  /** 支援艦隊 (#84): the button above the slots and its sheet */
  private supportBtn: UIButton | null = null;
  private supportSheet: Phaser.GameObjects.GameObject[] = [];
  private pickerList: ScrollList | null = null;
  private pickerControls: IListControls | null = null;
  private pickerSlot = -1;
  /** Page scroll before the picker opened (the sheet is laid out at scroll 0) */
  private pickerScroll = 0;
  /** Settings panel objects (rebuilt when a value changes or a group opens) and the open group */
  private settingsObjs: Phaser.GameObjects.GameObject[] = [];
  private openGroup: string | null = null;
  /** Opened from the home menu's 編成 (#109) */
  private organizeOnly = false;
  private rematch = false;
  /** Digits typed for the enemy count (#108) and when the last one came */
  private keyBuffer = '';
  private keyAt = 0;

  constructor() {
    super({ key: SceneKeys.FLEET_BUILDER });
  }

  /** `organize`: opened from the home menu's 編成 (#109): fleet only, then 作戦へ / 演習へ instead of a sortie. */
  /** `rematch` (#135): sortie again with the last fleet straight away (ships that can't go are left out). */
  init(data?: { organize?: boolean; rematch?: boolean }): void {
    this.organizeOnly = data?.organize === true;
    this.rematch = data?.rematch === true;
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    audio.music('menu');
    this.shipRegistry = DataLoader.getRegistry(this);
    const progress = loadProgress();
    // The fleet is always the current nation's (switched at the home port); each nation keeps its own setup.
    this.nation = progress.nation;
    const saved = selectionFor(this.registry, this.nation);
    const enemy = saved?.enemyNation;
    // Exercises start from a standard setup (the campaign's usual opponent, surface battle, clear day, as many
    // ships as the fleet): all-random was too hard early on. 全てランダム is one tap away.
    const standard = standardExercise(this.nation);
    this.enemyNation = enemy && enemy !== this.nation ? enemy : standard.enemyNation;
    this.enemyCount = saved?.enemyCount ?? SAME_COUNT;
    this.training = saved?.training ?? false;
    this.slotCount = fleetSlots(progress);
    this.costCap = costCap(rankOf(progress).index);
    this.rankIndex = rankOf(progress).index;
    this.L = builderLayout(this.slotCount, nextSlotRank(progress) !== null && IS_PORTRAIT);
    // Free battles default to random everything (#78) until the player picks something.
    this.mode = saved?.mode ?? standard.mode;
    this.weatherChoice = saved?.weather ?? standard.weather;
    this.timeChoice = saved?.time ?? standard.time;
    // Setting off (#108): every visit starts the exercise settings from random again; the fleet is still kept.
    if (!audio.settings.keepExercise) this.applyExercise(standard);
    this.splitByBase();
    const used = new Set<string>();
    this.slots = Array.from({ length: this.slotCount }, (_, i) => {
      // Only ships still available (a reset or imported save can take away a ship), each once (#76).
      const id = saved?.slotIds[i];
      const ship = id && !used.has(id) ? this.ships.find((s) => s.id === id) ?? null : null;
      if (ship) used.add(ship.id);
      return ship;
    });
    this.formation = usableFormation(saved?.formation, this.rankIndex);
    this.captainData = DataLoader.getCaptains(this);
    const areaId = this.registry.get(CAMPAIGN_AREA_KEY) as string | undefined;
    this.area = (campaignData as ICampaignData).areas.find((a) => a.id === areaId) ?? null;
    this.swArea = this.area !== null && this.registry.get(SW_AREA_KEY) === true;
    if (this.area) this.organizeOnly = false;
    this.keyBuffer = '';
    this.keyAt = 0;
    this.captainIds = Array.from({ length: this.slotCount }, (_, i) => {
      const id = saved?.captainIds?.[i] ?? null;
      return id && progress.captains.includes(id) ? id : null;
    });
    this.slotViews = [];
    this.shipCards = [];
    this.shipList = null;
    this.shipCountText = null;
    this.listControls = null;
    this.nationChip = null;
    this.dragging = false;
    this.presetButtons = [];
    this.presetSaveBtn = null;
    this.saveArmed = false;
    this.detail = [];
    this.picker = [];
    this.pickerList = null;
    this.pickerControls = null;
    this.pickerSlot = -1;
    this.settingsObjs = [];
    this.openGroup = null;
    // Meters share one scale across nations so ships compare fairly between tabs.
    const all = this.shipRegistry.all();
    this.maxStats = {
      hp: Math.max(1, ...all.map((s) => s.hp)),
      armor: Math.max(1, ...all.map((s) => s.armor)),
      speed: Math.max(1, ...all.map((s) => s.speed)),
    };

    addBackdrop(this, 'menu').setScrollFactor(0);
    this.buildHeader();
    const rank = rankOf(progress);
    this.buildPanelFrame(this.L.fleet, `艦隊編成 — ${rank.name} · 出撃枠 ${this.slotCount}`);
    this.buildRefitButton();
    if (!IS_PORTRAIT) {
      this.buildPanelFrame(this.L.ships, '利用可能な艦');
      this.buildNationTabs();
      this.buildShipCount();
      this.listControls = this.addListControls(this.L.ships.x + PANEL_PAD, this.filterRowY(0), this.L.ships.w - PANEL_PAD * 2, 0, () => this.rebuildShipList());
      this.createShipList();
      this.buildShipList();
    }
    this.buildPresetRow();
    this.buildSlotPanel();
    this.buildFooter();
    this.refresh();
    if (IS_PORTRAIT) this.setupScrolling();
    this.setupCountKeys();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.saveSelection());
    new TutorialGuide(this);
    if (this.rematch && !this.organizeOnly) this.startRematch();
  }

  /** Wraps a tap handler so it does nothing at the end of a scroll drag. */
  private onTap(fn: () => void): () => void {
    return () => {
      if (!this.dragging) fn();
    };
  }

  private sheetOpen(): boolean {
    return this.detail.length > 0 || this.picker.length > 0;
  }

  /** Bottom of the page content, so the settings scroll clear of the fixed footer. */
  private updateScrollBounds(): void {
    if (!IS_PORTRAIT) return;
    const s = this.L.settings;
    const contentBottom = Math.max(CANVAS_H - FOOTER_BAR_H, s.y + s.h + 24);
    this.cameras.main.setBounds(0, 0, CANVAS_W, contentBottom + FOOTER_BAR_H);
  }

  private setupScrolling(): void {
    const cam = this.cameras.main;
    this.updateScrollBounds();
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = false;
      startY = p.y;
      startScroll = cam.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.sheetOpen()) return;
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
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.sheetOpen()) return;
      cam.setScroll(0, cam.scrollY + dy);
    });
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private leave(): void {
    this.scene.start(this.area ? SceneKeys.CAMPAIGN : SceneKeys.HOME);
  }

  private buildHeader(): void {
    const fixed: Phaser.GameObjects.GameObject[] = [];
    if (IS_PORTRAIT) {
      // Interactive so taps on the bar don't reach cards scrolled underneath it.
      fixed.push(this.add.rectangle(0, 0, CANVAS_W, HEADER_BAR_H, Colors.bgDeep, 0.94).setOrigin(0, 0).setInteractive());
    }
    const label = this.area ? '‹  作戦' : '‹  鎮守府';
    const back = IS_PORTRAIT
      ? new UIButton(this, 100, 46, label, () => this.leave(), { variant: 'secondary', width: 172, height: 60, fontSize: 15 })
      : new UIButton(this, 92, 44, label, () => this.leave(), { variant: 'secondary', width: 136, height: 44, fontSize: 15 });
    fixed.push(back);
    this.titleText = this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 56, '', displayStyle(24)).setOrigin(0.5);
    fixed.push(this.titleText);
    this.pin(fixed, 60);
    this.refreshHeader();
  }

  private refreshHeader(): void {
    this.titleText.setText(`${NATION_INFO[this.nation].ja} — 艦隊を編成せよ`);
    this.nationChip?.destroy();
    const chip = addChip(this, 0, IS_PORTRAIT ? 46 : 44, NATION_INFO[this.nation].jaShort, Colors.gold, Css.gold);
    // The chip's width is its label + padding (a container's bounds leave out the graphics' rounded box).
    chip.setX(CANVAS_W - 20 - ((chip.list[1] as Phaser.GameObjects.Text).width + 18));
    this.pin([chip], 60);
    this.nationChip = chip;
  }

  private static setToggle(buttons: UIButton[], selected: number): void {
    buttons.forEach((b, i) => b.setVariant(i === selected ? 'primary' : 'secondary'));
  }

  /** Owned ships of the current nation (#18), with fictional designs still gated by their research. */
  private offeredShips(): IShipData[] {
    const progress = loadProgress();
    // By kind, then class by class oldest first, hulls in order (#246).
    return filterEntries(availableShips(ownedShips(progress, this.shipRegistry.byNation(this.nation)), progress.research), null);
  }

  /** Every owned ship is at hand: ships no longer belong to a base (#281). */
  private splitByBase(): void {
    this.ships = this.offeredShips();
  }

  /** The row above the ship list: how many ships the nation owns and where more come from. */
  private buildNationTabs(): void {
    const p = this.L.ships;
    this.add
      .text(p.x + PANEL_PAD + 8, p.y + PANEL_HEADER_H + this.L.tabH / 2, `保有艦 ${this.ships.length} 隻  ·  新しい艦は工廠の建造・作戦の初回報酬で入手`, textStyle(12, Css.muted, { wordWrap: { width: p.w - PANEL_PAD * 2 - 16, useAdvancedWrap: true } }))
      .setOrigin(0, 0.5);
  }

  /** "12 隻" in the ship panel header. */
  private buildShipCount(): void {
    const p = this.L.ships;
    this.shipCountText = this.add
      .text(p.x + p.w - PANEL_PAD - 8, p.y + 32, '', textStyle(13, Css.muted, { fontStyle: 'bold' }))
      .setOrigin(1, 0.5);
  }

  /** The masked, scrolling viewport under the filter rows (#20); landscape only. */
  private createShipList(): void {
    const p = this.L.ships;
    const top = this.filterRowY(1) + this.L.filterH + 6;
    this.shipList = new ScrollList(this, { x: p.x + PANEL_PAD, y: top, w: p.w - PANEL_PAD * 2 + 4, h: p.y + p.h - 10 - top });
  }

  /** Top of filter row 0 (kinds) / 1 (sort) above the landscape ship list. */
  private filterRowY(row: number): number {
    const p = this.L.ships;
    return p.y + PANEL_HEADER_H + this.L.tabH + row * (this.L.filterH + 6);
  }

  /**
   * Kind filter (全て / 戦艦 / 空母 / 重巡 / 軽巡 / 駆逐 / 潜水) and sort toggles (#33 / #37), two rows from `y`.
   * `depth` > 0 draws them on a sheet.
   */
  private addListControls(x: number, y: number, w: number, depth: number, onChange: () => void): IListControls {
    const h = this.L.filterH;
    const gap = IS_PORTRAIT ? 6 : 4;
    const rowGap = IS_PORTRAIT ? 10 : 6;
    const row = (ry: number, labels: string[], onSelect: (i: number) => void): UIButton[] => {
      const bw = (w - gap * (labels.length - 1)) / labels.length;
      return labels.map((label, i) => {
        const b = new UIButton(this, x + i * (bw + gap) + bw / 2, ry + h / 2, label, this.onTap(() => onSelect(i)), {
          variant: 'secondary', width: bw, height: h, fontSize: IS_PORTRAIT ? 14 : 11,
        });
        if (depth > 0) b.setDepth(depth);
        return b;
      });
    };
    const controls: IListControls = {
      filters: row(y, KIND_FILTERS.map((k) => k.label), (i) => {
        this.kindFilter = KIND_FILTERS[i].id;
        onChange();
      }),
      // The sort row ends with a name search (#263).
      sorts: row(y + h + rowGap, [...SORTS.map((k, i) => (i === 0 ? `並び: ${SORT_LABEL[k]}` : SORT_LABEL[k])), '名前で検索'], (i) => {
        if (i < SORTS.length) this.sort = SORTS[i];
        else {
          void askShipName(this.query, shipSearchNames(this.ships)).then((query) => {
            if (query === null) return;
            this.query = query;
            onChange();
          });
          return;
        }
        onChange();
      }),
    };
    this.refreshListControls(controls);
    return controls;
  }

  private refreshListControls(c: IListControls | null): void {
    if (!c) return;
    FleetBuilderScene.setToggle(c.filters, KIND_FILTERS.findIndex((k) => k.id === this.kindFilter));
    FleetBuilderScene.setToggle(c.sorts, SORTS.indexOf(this.sort));
    const search = c.sorts[SORTS.length];
    search?.setLabel(this.query ? `検索: ${this.query}` : '名前で検索').setVariant(this.query ? 'primary' : 'secondary');
  }

  /** The kind filter, the sort and the name search (#263) over `ships`. */
  private listed(ships: IShipData[]): IShipData[] {
    // 士気順 (#357) reads the morale as it stands now.
    const progress = loadProgress();
    const now = Date.now();
    return filterShips(filterAndSort(ships, this.kindFilter, this.sort, (id) => moraleOf(progress, id, now)), { ...NO_FILTER, query: this.query }, { owned: [], roster: this.shipRegistry.byNation(this.nation) });
  }

  private rebuildShipList(): void {
    if (!this.shipList) return;
    this.shipList.clear();
    this.shipCards = [];
    this.buildShipList();
    this.shipList.setOffset(0);
    this.refreshListControls(this.listControls);
    this.refreshListControls(this.pickerControls);
  }

  /** Keeps objects in place while the portrait page scrolls underneath them. */
  private pin(objects: Phaser.GameObjects.GameObject[], depth: number): void {
    for (const o of objects) {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
    }
  }

  private buildPanelFrame(p: IRect, title: string): Phaser.GameObjects.GameObject[] {
    // Japanese titles only (#70).
    return [
      addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 }),
      this.add.text(p.x + 22, p.y + (IS_PORTRAIT ? 26 : 18), title, textStyle(IS_PORTRAIT ? 17 : 15, Css.text, { fontStyle: 'bold' })),
    ];
  }

  /** Rotates a bow-up ship sprite to lie bow-right and scales it to fit `maxLen`. */
  private addShipIcon(x: number, y: number, key: string, maxLen: number, maxScale: number): Phaser.GameObjects.Image {
    const icon = this.add.image(x, y, key).setAngle(90);
    return icon.setScale(Math.min(maxScale, maxLen / Math.max(1, icon.height)));
  }

  /** Slot holding `ship` (-1 when it is not in the fleet). */
  private slotOf(ship: IShipData): number {
    return this.slots.findIndex((s) => s?.id === ship.id);
  }

  /**
   * One ship row for a list: icon, name and kind badge, HP / armour / speed meters and a + (or a 編成中 tag for a
   * ship already in the fleet, which can't be added twice, #76).
   */
  private shipRow(ship: IShipData, w: number, itemH: number, tag: string | null, tagCss: string = Css.gold): Phaser.GameObjects.Container {
    const statX = IS_PORTRAIT ? 100 : 74;
    const plusR = IS_PORTRAIT ? 26 : 17;
    const plusX = w - plusR - 13;
    // A tag takes the place of the + button; the stats make room for it (#357: a long tag ran over 速力).
    const tagText = tag ? this.add.text(plusX + plusR, itemH / 2, tag, textStyle(IS_PORTRAIT ? 13 : 11, tagCss, { fontStyle: 'bold' })).setOrigin(1, 0.5) : null;
    const statSpacing = (w - statX - Math.max(plusR * 2 + 30, (tagText?.width ?? 0) + 24)) / 3;
    const bg = drawPanel(this.add.graphics(), 0, 0, w, itemH, { radius: 16, fill: Colors.panelHi, fillAlpha: 0.55 });
    const hover = this.add.graphics();
    drawPanel(hover, 0, 0, w, itemH, { radius: 16, fill: Colors.cyan, fillAlpha: 0.08, rimAlpha: 0.7 });
    hover.setVisible(false);

    const icon = this.addShipIcon(statX / 2, itemH / 2, ship.spriteKey, statX - 20, 1.2);
    const name = this.add.text(statX, itemH * 0.12, ship.name, textStyle(15, Css.text, { fontStyle: 'bold' }));
    const kc = kindColor(ship);
    const badge = addChip(this, 0, name.y + name.height / 2, kindShort(ship), kc.color, kc.css);
    // The ship's sortie cost (#306) and morale (#54) next to its kind.
    const p = loadProgress();
    const morale = moraleOf(p, ship.id, Date.now());
    const mood = moraleMood(morale);
    const costChip = addChip(this, 0, name.y + name.height / 2, `コスト ${shipCost(ship, p.refits[ship.id] ?? 0)} · ${moraleLabel(morale)}`,
      mood === 'tired' ? Colors.danger : Colors.gold, mood === 'tired' ? Css.danger : Css.gold);
    // Long names drop their English part so the kind badge clears the + button.
    fitName(name, ship.name, w - statX - plusR * 2 - 30 - chipWidth(badge) - chipWidth(costChip) - 16);
    badge.setX(statX + name.displayWidth + 10);
    costChip.setX(badge.x + chipWidth(badge) + 6);

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

    const end: Phaser.GameObjects.GameObject[] = [];
    if (tagText) {
      end.push(tagText);
    } else {
      const plus = this.add.graphics();
      plus.fillStyle(Colors.cyan, 0.15);
      plus.fillCircle(plusX, itemH / 2, plusR);
      plus.lineStyle(1.5, Colors.cyan, 0.7);
      plus.strokeCircle(plusX, itemH / 2, plusR);
      end.push(plus, this.add.text(plusX, itemH / 2 - 1, '+', textStyle(22, Css.cyan, { fontStyle: 'bold' })).setOrigin(0.5));
    }
    const card = this.add.container(0, 0, [bg, hover, icon, name, badge, costChip, meters, ...statLabels, ...end]);
    card.on('pointerover', () => hover.setVisible(true));
    card.on('pointerout', () => hover.setVisible(false));
    return card;
  }

  /** Landscape ship list: tap adds the ship to the first empty slot. */
  private buildShipList(): void {
    const list = this.shipList;
    if (!list) return;
    const itemH = this.L.shipItemH;
    // Rows leave a gutter on the right for the scrollbar.
    const w = this.L.ships.w - PANEL_PAD * 2 - 12;
    const shown = this.listed(this.ships);
    shown.forEach((ship, i) => {
      const card = this.shipRow(ship, w, itemH, null).setY(i * (itemH + ITEM_GAP));
      list.addItem(card, w, itemH, this.onTap(() => this.addShipToFleet(ship)));
      this.shipCards.push({ id: ship.id, card });
    });
    list.setContentHeight(Math.max(0, shown.length * (itemH + ITEM_GAP) - ITEM_GAP));
    this.shipCountText?.setText(shown.length === this.ships.length ? `${this.ships.length} 隻` : `${shown.length} / ${this.ships.length} 隻`);
    this.refreshShipCards();
  }

  /** Dims list rows whose ship is already in the fleet, or would take the fleet past its cost cap (#306). */
  private refreshShipCards(): void {
    const fleet = this.slots.filter((s): s is IShipData => s !== null);
    const inFleet = new Set(fleet.map((s) => s.id));
    const refits = loadProgress().refits;
    const full = fleet.length >= this.slotCount;
    for (const { id, card } of this.shipCards) {
      const ship = this.ships.find((s) => s.id === id);
      const heavy = !full && ship !== undefined && !inFleet.has(id) && !fitsCost(ship, fleet, this.costCap, refits);
      card.setAlpha(inFleet.has(id) ? 0.4 : heavy ? 0.5 : 1);
    }
  }

  // -------------------------------------------------------------------------
  // Ship picker sheet (#77)
  // -------------------------------------------------------------------------

  /** Opens the ship list for slot `slot`: tapping a ship puts it there (replacing the one there). */
  private openPicker(slot: number): void {
    this.closeDetail();
    this.closePicker();
    this.pickerSlot = slot;
    const cam = this.cameras.main;
    this.pickerScroll = cam.scrollY;
    // The sheet and its list are laid out in world space at scroll 0, so the list's mask and taps line up.
    cam.setScroll(0, 0);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.picker.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive())
      .on('pointerup', () => this.closePicker());
    const d = IS_PORTRAIT ? { x: 16, y: 96, w: CANVAS_W - 32, h: CANVAS_H - 112 } : { x: 444, y: 60, w: 812, h: 640 };
    // The panel itself swallows taps so only the dim backdrop closes the sheet.
    add(addPanel(this, d.x, d.y, d.w, d.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.zone(d.x, d.y, d.w, d.h).setOrigin(0, 0).setInteractive());
    const role = slot === 0 ? '旗艦' : `護衛 ${slot}`;
    add(this.add.text(d.x + 24, d.y + (IS_PORTRAIT ? 30 : 20), `${role}の艦を選ぶ`, displayStyle(IS_PORTRAIT ? 24 : 20)));
    const closeW = IS_PORTRAIT ? 150 : 120;
    add(new UIButton(this, d.x + d.w - 20 - closeW / 2, d.y + (IS_PORTRAIT ? 44 : 34), '閉じる', () => this.closePicker(), {
      variant: 'secondary', width: closeW, height: IS_PORTRAIT ? 56 : 40, fontSize: 15,
    }));
    const x = d.x + PANEL_PAD + 8;
    const w = d.w - (PANEL_PAD + 8) * 2;
    const top = d.y + (IS_PORTRAIT ? 92 : 70);
    this.pickerControls = this.addListControls(x, top, w, SHEET_DEPTH + 1, () => this.fillPicker());
    for (const b of [...this.pickerControls.filters, ...this.pickerControls.sorts]) this.picker.push(b);
    const listTop = top + 2 * this.L.filterH + (IS_PORTRAIT ? 10 : 6) + 12;
    this.pickerList = new ScrollList(this, { x, y: listTop, w: w + 4, h: d.y + d.h - 16 - listTop }).setDepth(SHEET_DEPTH + 1);
    this.fillPicker();
  }

  private fillPicker(): void {
    const list = this.pickerList;
    if (!list) return;
    list.clear();
    const itemH = this.L.shipItemH;
    const w = (IS_PORTRAIT ? CANVAS_W - 32 : 812) - (PANEL_PAD + 8) * 2 - 12;
    const shown = this.listed(this.ships);
    shown.forEach((ship, i) => {
      const at = this.slotOf(ship);
      // A ship already in another slot swaps places with this one (#147); it is never in two slots (#76).
      // A ship that would take the fleet past its cost cap (#306) says by how much.
      const fleet = this.slots.filter((s): s is IShipData => s !== null);
      const refits = loadProgress().refits;
      const heavy = at === -1 && !fitsCost(ship, fleet, this.costCap, refits, this.slots[this.pickerSlot]);
      const short = heavy ? fleetCost([...fleet.filter((s) => s.id !== this.slots[this.pickerSlot]?.id), ship], refits) - this.costCap : 0;
      // Which group holds the ship (#357): this fleet in gold, an expedition in green with its name, the dorm in grey.
      const progress = loadProgress();
      const run = (progress.expeditions ?? []).find((r) => r.shipIds.includes(ship.id));
      const dorm = inDorm(progress.dorm, 'ship', ship.id);
      const elsewhere = run ? `遠征中: ${EXPEDITIONS.find((e) => e.id === run.id)?.name ?? '遠征'}` : dorm ? '寮舎で訓練中' : null;
      const tag = heavy ? `コストが ${short} 足りません` : at === -1 ? elsewhere : at === this.pickerSlot ? '第 1 艦隊: 選択中' : `第 1 艦隊: ${at === 0 ? '旗艦' : `護衛 ${at}`}と入れ替え`;
      const tagCss = at === -1 && !heavy && run ? Css.success : at === -1 && !heavy && dorm ? Css.muted : Css.gold;
      const card = this.shipRow(ship, w, itemH, tag, tagCss).setY(i * (itemH + ITEM_GAP));
      if (heavy) card.setAlpha(0.5);
      else if (at !== -1 && at !== this.pickerSlot) card.setAlpha(0.8);
      list.addItem(card, w, itemH, () => this.pickShip(ship));
    });
    list.setContentHeight(Math.max(0, shown.length * (itemH + ITEM_GAP) - ITEM_GAP));
    list.setOffset(0);
    this.refreshListControls(this.pickerControls);
    this.refreshListControls(this.listControls);
  }

  private pickShip(ship: IShipData): void {
    const slot = this.pickerSlot;
    if (slot < 0) return;
    const at = this.slotOf(ship);
    if (at !== -1 && at !== slot) {
      this.swapSlots(at, slot);
    } else {
      this.slots[slot] = ship;
    }
    this.closePicker();
    this.refresh();
  }

  /** Moves a ship one slot up (#147); the ship above (or the empty slot) takes its place. */
  private moveUp(i: number): void {
    if (i <= 0) return;
    this.swapSlots(i, i - 1);
    this.refresh();
  }

  /** Swaps two slots (#147): ships and their captains change places together. */
  private swapSlots(a: number, b: number): void {
    if (a === b || a < 0 || b < 0) return;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    [this.captainIds[a], this.captainIds[b]] = [this.captainIds[b], this.captainIds[a]];
  }

  /** 支援艦隊 (#84) as they would sail now: the chosen setups' ships the rank allows, none twice or unavailable. */
  private supportFleets(): ReturnType<typeof resolveSupport> {
    const progress = loadProgress();
    const now = Date.now();
    const exercise = this.sortieOptions().exercise === true;
    const away = shipsAway(progress.expeditions);
    const sailing = new Set(sailingIds(progress.sortie));
    const unavailable = (id: string): boolean => away.has(id) || sailing.has(id) || inDorm(progress.dorm, 'ship', id)
      || (!exercise && (isDocked(completeRepairs(progress, now), id) || hpFraction(progress, id) <= HEAVY_DAMAGE));
    const main = this.slots.filter((s): s is IShipData => s !== null).map((s) => s.id);
    return resolveSupport(progress.support, progress.presets, this.ships, main, supportSlots(this.rankIndex), unavailable);
  }

  /** The 支援艦隊 sheet: for each place the rank opens, which saved setup sails and with what mission. */
  private openSupport(): void {
    this.closeSupport();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.supportSheet.push(o);
      return o;
    };
    const cam = this.cameras.main;
    add(this.add.rectangle(cam.scrollX, cam.scrollY, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive()).on('pointerup', () => this.closeSupport());
    const p = IS_PORTRAIT;
    const d = { x: cam.scrollX + (p ? 16 : 240), y: cam.scrollY + (p ? 260 : 120), w: p ? CANVAS_W - 32 : 800, h: p ? 640 : 460 };
    add(addPanel(this, d.x, d.y, d.w, d.h, { radius: 24, fillAlpha: 0.97, glow: 0.8 }));
    add(this.add.zone(d.x, d.y, d.w, d.h).setOrigin(0, 0).setInteractive());
    add(this.add.text(d.x + 24, d.y + 20, '支援艦隊', displayStyle(p ? 22 : 20)));
    add(this.add.text(d.x + 24, d.y + (p ? 58 : 52), '保存した編成を第 2 艦隊以降として一緒に出撃させます。任務どおりに自動で戦い、戦闘中に操作を切り替えられます。', textStyle(12, Css.muted, { wordWrap: { width: d.w - 48, useAdvancedWrap: true } })));
    const progress = loadProgress();
    const slots = supportSlots(this.rankIndex);
    const resolved = this.supportFleets();
    const rowH = p ? 120 : 84;
    const presets = progress.presets;
    for (let i = 0; i < PRESET_COUNT; i++) {
      const y = d.y + (p ? 120 : 100) + i * (rowH + 10);
      const open = i < slots;
      const choice = progress.support[i];
      add(this.add.text(d.x + 24, y, `第${i + 2}艦隊`, textStyle(16, open ? Css.text : Css.dim, { fontStyle: 'bold' })));
      if (!open) {
        add(this.add.text(d.x + 24, y + 28, `要階級: ${RANKS[[6, 9, 12][i]].name}`, textStyle(13, Css.dim)));
        continue;
      }
      const ships = resolved.find((r) => r.preset === choice?.preset)?.ships ?? [];
      const presetLabel = choice ? `編成 ${choice.preset + 1}${presets[choice.preset] ? '' : ' (空)'}` : 'なし';
      const bw = p ? 200 : 180;
      add(new UIButton(this, d.x + 24 + bw / 2, y + 44, `${presetLabel}  ›`, () => this.cycleSupport(i, 'preset'), { variant: choice ? 'primary' : 'secondary', width: bw, height: p ? 48 : 36, fontSize: 14 }));
      if (choice) {
        add(new UIButton(this, d.x + 24 + bw + 12 + bw / 2, y + 44, `任務: ${MISSION_LABEL[choice.mission]}  ›`, () => this.cycleSupport(i, 'mission'), { variant: 'primary', width: bw, height: p ? 48 : 36, fontSize: 14 }));
        const names = ships.map((s) => shortName(s.name)).join('・') || '出せる艦がありません';
        add(this.add.text(d.x + 24, y + (p ? 74 : 66), `${MISSION_NOTE[choice.mission]}  ·  ${names}`, textStyle(12, ships.length > 0 ? Css.muted : Css.danger, { wordWrap: { width: d.w - 48, useAdvancedWrap: true } })));
      }
    }
    add(new UIButton(this, d.x + d.w / 2, d.y + d.h - (p ? 44 : 34), '閉じる', () => this.closeSupport(), { variant: 'secondary', width: p ? 240 : 200, height: p ? 56 : 40, fontSize: 15 }));
  }

  /** Steps one 支援艦隊 place through なし → 編成 1〜3, or through the missions. */
  private cycleSupport(index: number, what: 'preset' | 'mission'): void {
    const progress = loadProgress();
    const support = [...progress.support];
    const cur = support[index];
    if (what === 'preset') {
      const next = cur ? cur.preset + 1 : 0;
      if (next >= PRESET_COUNT) support.splice(index, 1);
      else support[index] = { preset: next, mission: cur?.mission ?? 'strike' };
    } else if (cur) {
      support[index] = { ...cur, mission: MISSIONS[(MISSIONS.indexOf(cur.mission) + 1) % MISSIONS.length] };
    }
    saveProgress({ ...progress, support: support.filter((c): c is ISupportChoice => !!c) });
    this.openSupport();
    this.refresh();
  }

  private closeSupport(): void {
    for (const o of this.supportSheet) o.destroy();
    this.supportSheet = [];
  }

  private closePicker(): void {
    if (this.picker.length === 0) return;
    for (const o of this.picker) o.destroy();
    this.picker = [];
    this.pickerList?.destroy();
    this.pickerList = null;
    this.pickerControls = null;
    this.pickerSlot = -1;
    this.cameras.main.setScroll(0, this.pickerScroll);
    // The landscape list shares the filter; keep it in step with what the sheet showed.
    this.rebuildShipList();
  }

  // -------------------------------------------------------------------------
  // Settings (#77 / #78)
  // -------------------------------------------------------------------------

  private settingGroups(): ISettingGroup[] {
    const p = IS_PORTRAIT;
    const rule = FORMATION_RULES[this.formation];
    const groups: ISettingGroup[] = [{
      key: 'formation',
      title: '陣形',
      value: rule.ja,
      cols: p ? 3 : 2,
      note: rule.summary,
      options: FORMATION_ORDER.map((f) => {
        const open = formationUnlocked(f, this.rankIndex);
        const r = FORMATION_RULES[f];
        return {
          label: open ? r.ja : `${r.ja} 要${RANKS[Math.min(r.minRank, RANKS.length - 1)].name}`,
          selected: f === this.formation,
          enabled: open,
          pick: () => { this.formation = f; },
        };
      }),
    }];
    if (this.area || this.organizeOnly) return groups;
    const foes: Array<Choice<Nation>> = [RANDOM, ...PLAYABLE_NATIONS.filter((n) => n !== this.nation)];
    const radio = <T>(choices: T[], current: T, label: (c: T) => string, set: (c: T) => void): IOption[] =>
      choices.map((c) => ({ label: label(c), selected: c === current, enabled: true, pick: () => set(c) }));
    const nationLabel = (n: Choice<Nation>): string => (n === RANDOM ? 'ランダム' : NATION_INFO[n].jaShort);
    const fleetSize = Math.max(1, this.fleetShips().length);
    const count = this.enemyCount === SAME_COUNT ? fleetSize : this.enemyCount;
    groups.push(
      { key: 'enemy', title: '交戦相手', value: nationLabel(this.enemyNation), cols: 4, options: radio(foes, this.enemyNation, nationLabel, (c) => { this.enemyNation = c; }) },
      // 訓練 (#343): the old 訓練海域 — the enemy's weakest ships, to try new ships and captains on.
      { key: 'strength', title: '敵の強さ', value: this.training ? '訓練 (弱い敵)' : '標準', cols: 2, options: radio([false, true], this.training, (c) => (c ? '訓練 (弱い敵)' : '標準'), (c) => { this.training = c; }) },
      { key: 'mode', title: '戦闘の種類', value: choiceLabel(this.mode, MODE_LABEL), cols: p ? 4 : 2, options: radio(MODE_CHOICES, this.mode, (c) => choiceLabel(c, MODE_LABEL), (c) => { this.mode = c; }) },
      { key: 'weather', title: '天候', value: choiceLabel(this.weatherChoice, WEATHER_LABEL), cols: p ? 5 : 3, options: radio(WEATHER_CHOICES, this.weatherChoice, (c) => choiceLabel(c, WEATHER_LABEL), (c) => { this.weatherChoice = c; }) },
      { key: 'time', title: '時間', value: choiceLabel(this.timeChoice, TIME_LABEL), cols: 3, options: radio(TIME_CHOICES, this.timeChoice, (c) => choiceLabel(c, TIME_LABEL), (c) => { this.timeChoice = c; }) },
      {
        key: 'count',
        title: '敵の数',
        value: `${count} 隻`,
        cols: 1,
        options: [],
        // − / + from the current number; leaving 同数 starts from the fleet's size.
        stepper: {
          pick: () => this.openCountPicker(),
          hint: !IS_PORTRAIT ? '数字をタップで一覧 · PC は数字キーで入力、↑↓ で増減' : '数字をタップすると一覧から選べます',
          same: this.enemyCount === SAME_COUNT,
          toggleSame: () => { this.enemyCount = this.enemyCount === SAME_COUNT ? fleetSize : SAME_COUNT; },
          step: (delta) => { this.enemyCount = exerciseEnemyCount(count + delta); },
          canDec: count > 1,
          canInc: count < MAX_EXERCISE_ENEMIES,
        },
      },
    );
    return groups;
  }

  /** Redraws the settings panel: one row per group, the open one with its radio options. */
  private buildSettings(): void {
    for (const o of this.settingsObjs) o.destroy();
    this.settingsObjs = [];
    const s = this.L.settings;
    const p = IS_PORTRAIT;
    const x = s.x + PANEL_PAD;
    const w = s.w - PANEL_PAD * 2;
    const rowH = this.L.settingRowH;
    const optH = this.L.optionH;
    const gap = p ? 10 : 6;
    const objs: Phaser.GameObjects.GameObject[] = [];
    let y = s.y + PANEL_HEADER_H + (p ? 4 : 0);
    if (!this.area && !this.organizeOnly) y += this.addPresetButtons(x, y, w, objs);

    for (const g of this.settingGroups()) {
      if (g.stepper) {
        objs.push(this.addStepperRow(x, y, w, rowH, g.title, g.value, g.stepper));
        y += rowH + gap;
        if (g.stepper.hint) {
          const hint = this.add.text(x + 8, y - (p ? 2 : 3), g.stepper.hint, textStyle(p ? 12 : 10, Css.dim));
          objs.push(hint);
          y += hint.height + gap;
        }
        continue;
      }
      const open = this.openGroup === g.key;
      const frame = drawPanel(this.add.graphics(), 0, 0, w, rowH, { radius: p ? 16 : 12, fill: open ? Colors.panelHi : Colors.panel, fillAlpha: open ? 0.9 : 0.55, rimAlpha: open ? 0.7 : 0.25 });
      const title = this.add.text(p ? 20 : 12, rowH / 2, g.title, textStyle(p ? 15 : 13, Css.muted, { fontStyle: 'bold' })).setOrigin(0, 0.5);
      const value = this.add.text(w - (p ? 52 : 34), rowH / 2, g.value, textStyle(p ? 17 : 14, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0.5);
      const room = w - (p ? 52 : 34) - title.x - title.width - 16;
      if (value.width > room) value.setScale(room / value.width);
      const arrow = this.add.text(w - (p ? 22 : 14), rowH / 2, open ? '－' : '＋', textStyle(p ? 18 : 14, Css.cyan, { fontStyle: 'bold' })).setOrigin(0.5);
      const row = this.add.container(x, y, [frame, title, value, arrow]);
      makeClickable(row, w, rowH);
      row.on('pointerup', this.onTap(() => {
        this.openGroup = open ? null : g.key;
        this.buildSettings();
      }));
      objs.push(row);
      y += rowH + gap;
      if (!open) continue;

      const cols = Math.min(g.cols, g.options.length);
      const ow = (w - gap * (cols - 1)) / cols;
      g.options.forEach((o, i) => {
        const ox = x + (i % cols) * (ow + gap);
        const oy = y + Math.floor(i / cols) * (optH + gap);
        objs.push(this.addRadio(ox, oy, ow, optH, o));
      });
      y += Math.ceil(g.options.length / cols) * (optH + gap);
      if (g.note) {
        const note = this.add.text(x + 8, y, g.note, textStyle(p ? 12 : 10, Css.muted, { wordWrap: { width: w - 16, useAdvancedWrap: true } }));
        objs.push(note);
        y += note.height + gap;
      }
      y += gap;
    }

    if (this.area) y = this.buildCampaignBriefing(this.area, x, y + gap, w, objs);
    if (p) this.L.settings.h = y - s.y + 14;
    const frame = this.buildPanelFrame(this.L.settings, this.organizeOnly ? '陣形' : this.area ? '出撃設定 — 作戦' : '出撃設定 — 演習');
    // The frame is drawn last (its height depends on the rows), so the rows are lifted above it.
    for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(1);
    this.settingsObjs = [...frame, ...objs];
    this.updateScrollBounds();
  }

  private applyExercise(c: Partial<IExerciseChoices>): void {
    if (c.enemyNation !== undefined) this.enemyNation = c.enemyNation;
    if (c.mode !== undefined) this.mode = c.mode;
    if (c.weather !== undefined) this.weatherChoice = c.weather;
    if (c.time !== undefined) this.timeChoice = c.time;
    if (c.count !== undefined) this.enemyCount = c.count;
    if (c.training !== undefined) this.training = c.training;
  }

  /** 全てランダム / 標準に戻す above the exercise settings. Returns the height used. */
  private addPresetButtons(x: number, y: number, w: number, objs: Phaser.GameObjects.GameObject[]): number {
    const p = IS_PORTRAIT;
    const h = p ? 52 : 28;
    const gap = p ? 10 : 6;
    const bw = (w - gap) / 2;
    const apply = (c: Partial<IExerciseChoices>) => this.onTap(() => {
      this.applyExercise(c);
      this.openGroup = null;
      this.buildSettings();
      this.refreshFooter();
    });
    objs.push(
      new UIButton(this, x + bw / 2, y + h / 2, '全てランダム', apply(ALL_RANDOM), { variant: 'secondary', width: bw, height: h, fontSize: p ? 15 : 12 }),
      new UIButton(this, x + bw + gap + bw / 2, y + h / 2, '標準に戻す', apply(standardExercise(this.nation)), { variant: 'secondary', width: bw, height: h, fontSize: p ? 15 : 12 }),
    );
    return h + gap;
  }

  /** A settings row with 同数 and − value + controls on the right; changes apply at once. */
  private addStepperRow(x: number, y: number, w: number, h: number, titleText: string, valueText: string, st: IStepper): Phaser.GameObjects.Container {
    const p = IS_PORTRAIT;
    const frame = drawPanel(this.add.graphics(), 0, 0, w, h, { radius: p ? 16 : 12, fill: Colors.panel, fillAlpha: 0.55, rimAlpha: 0.25 });
    const title = this.add.text(p ? 20 : 12, h / 2, titleText, textStyle(p ? 15 : 13, Css.muted, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    const bh = h - (p ? 14 : 6);
    const stepW = p ? 64 : 36;
    const valueW = p ? 96 : 64;
    const sameW = p ? 104 : 56;
    const font = p ? 15 : 12;
    const apply = (fn: () => void) => this.onTap(() => {
      fn();
      this.buildSettings();
      this.refreshFooter();
    });
    let right = w - (p ? 10 : 6);
    const plus = new UIButton(this, right - stepW / 2, h / 2, '+', apply(() => st.step(1)), { variant: 'secondary', width: stepW, height: bh, fontSize: font + 4 }).setEnabled(st.canInc);
    right -= stepW;
    // The number opens the 1-20 list (#108).
    const valueBg = drawPanel(this.add.graphics(), right - valueW + 4, (h - bh) / 2, valueW - 8, bh, { radius: p ? 12 : 8, fill: Colors.panelHi, fillAlpha: 0.8, rimAlpha: 0.5 });
    const value = this.add.text(right - valueW / 2, h / 2, `${valueText} ▾`, textStyle(p ? 17 : 13, Css.text, { fontStyle: 'bold' })).setOrigin(0.5);
    if (value.width > valueW - 14) value.setScale((valueW - 14) / value.width);
    const valueHit = this.add.zone(right - valueW + 4, (h - bh) / 2, valueW - 8, bh).setOrigin(0, 0).setInteractive({ cursor: 'pointer' });
    valueHit.on('pointerup', this.onTap(st.pick));
    right -= valueW;
    const minus = new UIButton(this, right - stepW / 2, h / 2, '−', apply(() => st.step(-1)), { variant: 'secondary', width: stepW, height: bh, fontSize: font + 4 }).setEnabled(st.canDec);
    right -= stepW + (p ? 12 : 8);
    const same = new UIButton(this, right - sameW / 2, h / 2, '同数', apply(st.toggleSame), { variant: st.same ? 'primary' : 'secondary', width: sameW, height: bh, fontSize: font });
    return this.add.container(x, y, [frame, title, same, minus, valueBg, value, valueHit, plus]);
  }

  /** The enemy-count list (#108): 同数 and 1-20 in a grid; picking one closes it. */
  private openCountPicker(): void {
    this.closeDetail();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.detail.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive()).on('pointerup', () => this.closeDetail());
    const p = IS_PORTRAIT;
    const cols = p ? 4 : 7;
    const bh = p ? 64 : 44;
    const gap = 10;
    const w = p ? CANVAS_W - 64 : 640;
    const rows = Math.ceil((MAX_EXERCISE_ENEMIES + 1) / cols);
    const h = 90 + rows * (bh + gap) + 20;
    const d = { x: (CANVAS_W - w) / 2, y: (CANVAS_H - h) / 2, w, h };
    add(addPanel(this, d.x, d.y, d.w, d.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.zone(d.x, d.y, d.w, d.h).setOrigin(0, 0).setInteractive());
    add(this.add.text(d.x + 24, d.y + 26, '敵の数', displayStyle(p ? 22 : 20)));
    add(new UIButton(this, d.x + d.w - 80, d.y + 40, '閉じる', () => this.closeDetail(), { variant: 'secondary', width: 120, height: p ? 52 : 40, fontSize: 14 }));
    const bw = (d.w - 48 - gap * (cols - 1)) / cols;
    [SAME_COUNT, ...Array.from({ length: MAX_EXERCISE_ENEMIES }, (_, i) => i + 1)].forEach((n, i) => {
      const bx = d.x + 24 + (i % cols) * (bw + gap) + bw / 2;
      const by = d.y + 90 + Math.floor(i / cols) * (bh + gap) + bh / 2;
      add(new UIButton(this, bx, by, n === SAME_COUNT ? '同数' : `${n} 隻`, () => this.setEnemyCount(n), {
        variant: n === this.enemyCount ? 'primary' : 'secondary', width: bw, height: bh, fontSize: p ? 16 : 13,
      }));
    });
  }

  private setEnemyCount(n: number): void {
    this.enemyCount = n === SAME_COUNT ? SAME_COUNT : exerciseEnemyCount(n);
    this.closeDetail();
    this.buildSettings();
    this.refreshFooter();
  }

  /** PC (#108): digits type the enemy count ("1" then "5" within a second = 15), ↑ / ↓ step it. */
  private setupCountKeys(): void {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.area || this.organizeOnly || this.picker.length > 0) return;
      const fleetSize = Math.max(1, this.fleetShips().length);
      const current = this.enemyCount === SAME_COUNT ? fleetSize : this.enemyCount;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        this.enemyCount = exerciseEnemyCount(current + (e.key === 'ArrowUp' ? 1 : -1));
      } else if (/^[0-9]$/.test(e.key)) {
        const now = this.time.now;
        const joined = now - this.keyAt < 1000 ? this.keyBuffer + e.key : e.key;
        // A number past the limit starts over from this digit.
        this.keyBuffer = Number(joined) > MAX_EXERCISE_ENEMIES ? e.key : joined;
        this.keyAt = now;
        const n = Number(this.keyBuffer);
        if (n < 1) return;
        this.enemyCount = exerciseEnemyCount(n);
      } else {
        return;
      }
      this.closeDetail();
      this.buildSettings();
      this.refreshFooter();
    });
  }

  /** A radio option: ring (filled when selected) and label; disabled options are dimmed and inert. */
  private addRadio(x: number, y: number, w: number, h: number, o: IOption): Phaser.GameObjects.Container {
    const p = IS_PORTRAIT;
    const g = drawPanel(this.add.graphics(), 0, 0, w, h, {
      radius: p ? 14 : 10,
      fill: o.selected ? Colors.panelHi : Colors.panel,
      fillAlpha: o.selected ? 0.95 : 0.4,
      rim: o.selected ? Colors.cyan : undefined,
      rimAlpha: o.selected ? 0.85 : 0.2,
    });
    const r = p ? 9 : 6;
    const cx = (p ? 14 : 10) + r;
    g.lineStyle(2, o.selected ? Colors.cyan : Colors.muted, 0.9);
    g.strokeCircle(cx, h / 2, r);
    if (o.selected) {
      g.fillStyle(Colors.cyan, 1);
      g.fillCircle(cx, h / 2, r - (p ? 4 : 3));
    }
    const label = this.add.text(cx + r + (p ? 10 : 6), h / 2, o.label, textStyle(p ? 14 : 11, o.selected ? Css.text : Css.muted, { fontStyle: o.selected ? 'bold' : 'normal' })).setOrigin(0, 0.5);
    const room = w - label.x - 6;
    if (label.width > room) label.setScale(room / label.width);
    const c = this.add.container(x, y, [g, label]).setAlpha(o.enabled ? 1 : 0.4);
    makeClickable(c, w, h);
    c.on('pointerup', this.onTap(() => {
      if (!o.enabled) return;
      o.pick();
      this.buildSettings();
      this.refreshFooter();
    }));
    return c;
  }

  /** Campaign sortie: the opponent comes from the operation, so the panel shows its briefing. Returns the next y. */
  private buildCampaignBriefing(area: ICampaignArea, x: number, top: number, w: number, objs: Phaser.GameObjects.GameObject[]): number {
    const p = IS_PORTRAIT;
    let y = top;
    const enemyNation = enemyNationFor(campaignData as ICampaignData, area, this.nation);
    const enemy = enemyShips(area, this.shipRegistry, enemyNation);
    // Enemy kinds first, then each kind's ships (#68).
    const lineup = kindGroups(enemy.map((s) => ({ ...s, name: shortName(s.name) }))).map((g) => `${g.kind} ${g.names.join('・')}`).join(' / ');
    const lines = [
      this.swArea ? `超兵器海域  ${area.name}` : `作戦  ${area.name}`,
      `${OBJECTIVE_LABEL[area.objective]}  ·  ${NATION_INFO[enemyNation].jaShort} ${enemy.length} 隻 — ${kindBreakdown(enemy)}`,
      lineup,
      `${DataLoader.getMap(this, area.map).name}  ·  ${WEATHER_LABEL[area.weather]}  ·  ${TIME_LABEL[area.time]}`,
    ];
    lines.forEach((line, i) => {
      const t = this.add.text(x + 8, y, line, textStyle(i === 0 ? 15 : 12, i === 0 ? Css.gold : Css.text, { fontStyle: i === 0 ? 'bold' : 'normal', wordWrap: { width: w - 16, useAdvancedWrap: true } }));
      objs.push(t);
      y += t.height + (p ? 10 : 6);
    });
    const bh = p ? 56 : 32;
    // Landscape: the button sits at the bottom of the fixed panel; portrait: right under the briefing.
    const by = p ? y + 8 + bh / 2 : this.L.settings.y + this.L.settings.h - 14 - bh / 2;
    objs.push(new UIButton(this, x + w / 2, by, '作戦を中止して演習にする', this.onTap(() => {
      this.registry.remove(CAMPAIGN_AREA_KEY);
      this.registry.remove(SW_AREA_KEY);
      this.scene.restart();
    }), { variant: 'secondary', width: w, height: bh, fontSize: 12 }));
    return p ? by + bh / 2 + 8 : y;
  }

  // -------------------------------------------------------------------------
  // Fleet slots
  // -------------------------------------------------------------------------

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
      // Tapping a card (empty, or its body around the buttons) opens the ship picker for that slot (#77).
      this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0, 0).setInteractive({ cursor: 'pointer' })
        .on('pointerup', this.onTap(() => this.openPicker(i)));
      const frame = this.add.graphics().setPosition(r.x, r.y);
      const hint = this.gridSlots ? 'タップして艦を選ぶ' : IS_PORTRAIT ? '＋  タップして艦を選ぶ' : '＋  タップ または左の一覧から追加';
      const emptyLabel = this.add.text(r.x + r.w / 2, r.y + r.h / 2 + 10, hint, textStyle(14, Css.dim)).setOrigin(0.5);
      const role = i === 0 ? '旗艦' : `護衛 ${i}`;
      this.add.text(r.x + 18, r.y + (IS_PORTRAIT ? 12 : this.gridSlots ? 8 : 16), role, eyebrowStyle(10, i === 0 ? Css.gold : Css.cyan));
      this.slotViews.push({ frame, content: null, emptyLabel });
    }
    // How to get more slots (#30): under the cards in portrait, in the unused room in landscape.
    const next = nextSlotRank(loadProgress());
    if (!next) return;
    const text = `${next.rank.name}に昇進すると出撃枠 ${next.rank.slots}\n(${needText(next)})`;
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
    // 支援艦隊 (#84): the setups that sail with this fleet.
    const supW = IS_PORTRAIT ? 130 : 76;
    const bw = (w - saveW - supW - gap * (PRESET_COUNT + 1)) / PRESET_COUNT;
    const font = IS_PORTRAIT ? 13 : 10;
    this.supportBtn = new UIButton(this, x + w - saveW - gap - supW / 2, y, '支援', this.onTap(() => this.openSupport()), { variant: 'secondary', width: supW, height: h, fontSize: font });
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
    const n = this.supportFleets().length;
    this.supportBtn?.setLabel(n > 0 ? `支援 ${n}` : '支援').setVariant(n > 0 ? 'primary' : 'secondary');
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
    const used = new Set<string>();
    this.slots = placed.slotIds.map((id) => {
      const ship = id && !used.has(id) ? this.ships.find((s) => s.id === id) ?? null : null;
      if (ship) used.add(ship.id);
      return ship;
    });
    this.captainIds = placed.captainIds.map((id) => (id && progress.captains.includes(id) ? id : null));
    this.formation = usableFormation(preset.formation, this.rankIndex);
    this.refresh();
  }

  private buildFooter(): void {
    const f = this.L.footer;
    const onStart = this.onTap(() => {
      if (this.canStart()) this.startBattle();
    });
    const btn = { variant: 'gold' as const, fontSize: 24 };

    if (this.organizeOnly) {
      this.buildOrganizeFooter();
      return;
    }

    if (IS_PORTRAIT) {
      // Fixed bar: count + summary on one line, full-width deploy button below.
      const bar = this.add
        .rectangle(0, CANVAS_H - FOOTER_BAR_H, CANVAS_W, FOOTER_BAR_H, Colors.bgDeep, 0.94)
        .setOrigin(0, 0)
        .setInteractive();
      const panel = addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.95 });
      this.countText = this.add.text(f.x + 24, f.y + 12, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
      this.summaryText = this.add.text(f.x + f.w - 24, f.y + 10, '', textStyle(13, Css.muted, { align: 'right', lineSpacing: 2, wordWrap: { width: f.w - 170, useAdvancedWrap: true } })).setOrigin(1, 0).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPowerDetail());
      this.startBtn = new UIButton(this, CANVAS_W / 2, f.y + f.h - 38, '出撃  ▶', onStart, { ...btn, width: f.w - 32, height: 64 });
      this.pin([bar, panel, this.countText, this.summaryText, this.startBtn], 60);
      return;
    }

    addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
    this.add.text(f.x + 28, f.y + 22, '艦隊', eyebrowStyle(10, Css.muted));
    this.countText = this.add.text(f.x + 28, f.y + 42, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
    this.summaryText = this.add.text(f.x + 176, f.y + 26, '', textStyle(14, Css.muted, { lineSpacing: 6, wordWrap: { width: f.w - 176 - 340, useAdvancedWrap: true } })).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPowerDetail());
    this.startBtn = new UIButton(this, f.x + f.w - 172, f.y + f.h / 2, '出撃  ▶', onStart, { ...btn, width: 300, height: 60 });
  }

  /** 編成 from the home menu (#109): 作戦へ / 演習へ instead of 出撃. The fleet is kept either way (#77). */
  private buildOrganizeFooter(): void {
    const f = this.L.footer;
    const toCampaign = this.onTap(() => this.scene.start(SceneKeys.CAMPAIGN));
    const toExercise = this.onTap(() => {
      this.registry.remove(CAMPAIGN_AREA_KEY);
      this.scene.start(SceneKeys.FLEET_BUILDER, { organize: false });
    });
    if (IS_PORTRAIT) {
      const bar = this.add.rectangle(0, CANVAS_H - FOOTER_BAR_H, CANVAS_W, FOOTER_BAR_H, Colors.bgDeep, 0.94).setOrigin(0, 0).setInteractive();
      const panel = addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.95 });
      this.countText = this.add.text(f.x + 24, f.y + 12, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
      this.summaryText = this.add.text(f.x + f.w - 24, f.y + 10, '', textStyle(13, Css.muted, { align: 'right', lineSpacing: 2, wordWrap: { width: f.w - 170, useAdvancedWrap: true } })).setOrigin(1, 0).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPowerDetail());
      const bw = (f.w - 32 - 12) / 2;
      this.startBtn = new UIButton(this, f.x + 16 + bw / 2, f.y + f.h - 38, '作戦へ  ›', toCampaign, { variant: 'gold', width: bw, height: 64, fontSize: 22 });
      const ex = new UIButton(this, f.x + f.w - 16 - bw / 2, f.y + f.h - 38, '演習へ  ›', toExercise, { variant: 'primary', width: bw, height: 64, fontSize: 22 });
      this.pin([bar, panel, this.countText, this.summaryText, this.startBtn, ex], 60);
      return;
    }
    addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
    this.add.text(f.x + 28, f.y + 22, '艦隊', eyebrowStyle(10, Css.muted));
    this.countText = this.add.text(f.x + 28, f.y + 42, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
    this.summaryText = this.add.text(f.x + 176, f.y + 26, '', textStyle(14, Css.muted, { lineSpacing: 6, wordWrap: { width: f.w - 176 - 340, useAdvancedWrap: true } })).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPowerDetail());
    this.startBtn = new UIButton(this, f.x + f.w - 172 - 300 - 16, f.y + f.h / 2, '作戦へ  ›', toCampaign, { variant: 'gold', width: 300, height: 60, fontSize: 22 });
    new UIButton(this, f.x + f.w - 172, f.y + f.h / 2, '演習へ  ›', toExercise, { variant: 'primary', width: 300, height: 60, fontSize: 22 });
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private fleetShips(): IShipData[] {
    return this.slots.filter((s): s is IShipData => s !== null);
  }

  /** Landscape list: the first empty slot; a ship already in the fleet is not added twice (#76). */
  private addShipToFleet(ship: IShipData): void {
    if (this.slotOf(ship) !== -1) return;
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

  private refresh(): void {
    this.refreshSlots();
    this.refreshShipCards();
    this.buildSettings();
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

  /** "士気 72 ★" as a chip coloured by mood (#357). */
  private moraleChip(ship: IShipData, x: number, y: number): Phaser.GameObjects.Container {
    const m = moraleOf(loadProgress(), ship.id, Date.now());
    const mood = moraleMood(m);
    const [color, css] = mood === 'high' ? [Colors.gold, Css.gold] : mood === 'tired' ? [Colors.danger, Css.danger] : [Colors.rim, Css.muted];
    return addChip(this, x, y, moraleLabel(m), color, css);
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
   * armament (when the card is tall enough), then the captain, detail and remove buttons. Used for every slot in
   * portrait (#33).
   */
  private wideSlotParts(ship: IShipData, i: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
    const p = IS_PORTRAIT;
    const full = !p || h >= P_SLOT_FULL_H;
    // Portrait with 7-8 slots (#36): the cards get short, so everything moves up and the buttons shrink.
    const tiny = p && h < P_SLOT_TINY_H;
    const nameX = p ? 124 : 100;
    const kc = kindColor(ship);
    const rowY = p ? (full ? 52 : tiny ? 24 : 40) : 44;
    const badge = addChip(this, nameX, rowY, kindShort(ship), kc.color, kc.css);
    const nameLeft = nameX + chipWidth(badge) + 8;
    const name = this.add.text(nameLeft, rowY, ship.name, textStyle(p && !tiny ? 18 : 16, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    // Leave room for the move-up and remove buttons on the right.
    fitName(name, ship.name, w - nameLeft - (i > 0 ? (p ? 152 : 112) : (p ? 84 : 64)));
    const status = this.add.text(nameX, rowY + (tiny ? 13 : p ? 18 : 16), this.slotStatus(ship), textStyle(tiny ? 12 : 13, this.isDamaged(ship) ? Css.danger : Css.muted));
    const texts = [status];
    if (full) texts.push(this.add.text(nameX, status.y + status.height + 4, `主兵装  ${this.mainArmament(ship)}`, textStyle(12, Css.muted)));
    const room = w - nameX - 16;
    for (const t of texts) if (t.width > room) t.setScale(room / t.width);

    const captain = this.captainOf(i);
    const captainLabel = captain ? `艦長 ${captain.name}  Lv${captain.level} ${SKILL_LABEL[captain.skill]}  適性${aptitudeFor(captain, ship.shipClass)}` : '艦長を任命  ›';
    const btnH = p ? (full ? 40 : tiny ? 30 : 36) : 24;
    const btnY = h - (p ? (full ? 26 : tiny ? 19 : 22) : 18);
    const detailW = p ? 110 : 64;
    const captainW = Math.min(p ? 320 : 220, w - nameX - detailW - 24);
    const captainBtn = new UIButton(this, nameX + captainW / 2, btnY, captainLabel, this.onTap(() => this.openCaptainPicker(i)), {
      variant: captain ? 'primary' : 'secondary', width: captainW, height: btnH, fontSize: 11,
    });
    const detailBtn = new UIButton(this, nameX + captainW + 10 + detailW / 2, btnY, '詳細  ›', this.onTap(() => this.openDetail(ship, i)), {
      variant: 'secondary', width: detailW, height: btnH, fontSize: 11,
    });
    const remove = new UIButton(this, p ? w - 44 : w - 34, p ? (tiny ? 28 : 40) : 30, '✕', this.onTap(() => this.removeShipFromSlot(i)), {
      variant: 'secondary', width: p ? 60 : 40, height: p ? (tiny ? 38 : 48) : 36, fontSize: 15,
    });
    const parts: Phaser.GameObjects.GameObject[] = [captainBtn, detailBtn, remove];
    if (i > 0) {
      // ▲ swaps with the slot above (#147), so the flagship is one tap away.
      parts.push(new UIButton(this, p ? w - 112 : w - 80, p ? (tiny ? 28 : 40) : 30, '▲', this.onTap(() => this.moveUp(i)), {
        variant: 'secondary', width: p ? 60 : 40, height: p ? (tiny ? 38 : 48) : 36, fontSize: 15,
      }));
    }
    const icon = p ? this.addShipIcon(62, h * 0.55, ship.spriteKey, tiny ? 80 : 92, 1.3) : this.addShipIcon(54, h * 0.55, ship.spriteKey, 76, 1.3);
    // The crew's morale under the ship (#357): gold when high, red when tired.
    const morale = this.moraleChip(ship, 12, h - (p ? (tiny ? 16 : 20) : 14));
    return [icon, morale, badge, name, ...texts, ...parts];
  }

  /** A two-column slot card (landscape, more than three slots): badge and name, short stats, captain and detail buttons. */
  private narrowSlotParts(ship: IShipData, i: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
    const nameX = 62;
    const kc = kindColor(ship);
    const badge = addChip(this, nameX, 36, kindShort(ship), kc.color, kc.css);
    const nameLeft = nameX + chipWidth(badge) + 6;
    const name = this.add.text(nameLeft, 36, ship.name, textStyle(13, Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    fitName(name, ship.name, w - nameLeft - (i > 0 ? 64 : 36));
    const status = this.add.text(nameX, 47, this.slotStatus(ship, true), textStyle(11, this.isDamaged(ship) ? Css.danger : Css.muted));
    if (status.width > w - nameX - 8) status.setScale((w - nameX - 8) / status.width);
    const captain = this.captainOf(i);
    const btnH = Math.min(24, h - 70);
    const detailW = 48;
    const captainBtn = new UIButton(this, (w - detailW - 6) / 2, h - btnH / 2 - 6, captain ? `${captain.name} Lv${captain.level} ${aptitudeFor(captain, ship.shipClass)}` : '艦長 ›', this.onTap(() => this.openCaptainPicker(i)), {
      variant: captain ? 'primary' : 'secondary', width: w - detailW - 22, height: btnH, fontSize: 10,
    });
    const detailBtn = new UIButton(this, w - 8 - detailW / 2, h - btnH / 2 - 6, '詳細', this.onTap(() => this.openDetail(ship, i)), {
      variant: 'secondary', width: detailW, height: btnH, fontSize: 10,
    });
    const remove = new UIButton(this, w - 18, 16, '✕', this.onTap(() => this.removeShipFromSlot(i)), {
      variant: 'secondary', width: 26, height: 22, fontSize: 12,
    });
    const parts: Phaser.GameObjects.GameObject[] = [captainBtn, detailBtn, remove];
    if (i > 0) {
      parts.push(new UIButton(this, w - 48, 16, '▲', this.onTap(() => this.moveUp(i)), { variant: 'secondary', width: 26, height: 22, fontSize: 12 }));
    }
    return [this.addShipIcon(32, 42, ship.spriteKey, 44, 1), badge, name, status, ...parts];
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
    // 艦の固有スキル (#58)
    const own = skillOf(ship.id);
    if (own) {
      add(this.add.text(x, y, `固有スキル「${own.name}」`, eyebrowStyle(11, Css.gold)));
      y += 22;
      const t = add(this.add.text(x, y, skillText(own, loadProgress().refits[ship.id] ?? 0), textStyle(14, Css.text, wrap)));
      y += t.height + 14;
    }

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

  /** 総戦力 (#342): the fleet with its refits, research, captains, crews, morale and formation. */
  private powerOf(ships: IShipData[]): IPowerBreakdown {
    const captains = this.slots.flatMap((s, i) => (s ? [this.captainOf(i)] : []));
    return fleetPowerBreakdown(ships, loadProgress(), DataLoader.getUpgrades(this), { captains, formation: this.formation });
  }

  /** The area's enemy as the difficulty curve weighs it, or null off a campaign area. */
  private enemyPower(): number | null {
    if (!this.area) return null;
    const data = campaignData as ICampaignData;
    return Math.round(fleetPower(enemyShips(this.area, this.shipRegistry, enemyNationFor(data, this.area, this.nation))) * enemyScale(data, this.area, this.nation));
  }

  /** "総戦力 2,340 (敵 1,560 ×1.50) ▸" — tap for the breakdown. */
  private powerLabel(ships: IShipData[]): string {
    const own = this.powerOf(ships).total;
    const enemy = this.enemyPower();
    const n = (v: number): string => v.toLocaleString('en-US');
    return enemy === null ? `総戦力 ${n(own)} ▸` : `総戦力 ${n(own)} (敵 ${n(enemy)} ×${(own / Math.max(1, enemy)).toFixed(2)} ${strengthMark(own / Math.max(1, enemy))}) ▸`;
  }

  /** The breakdown of 総戦力 (#342): the ships as built, then what each source adds. */
  private openPowerDetail(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    if (ships.length === 0) return;
    this.closeDetail();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(80);
      this.detail.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive().on('pointerup', () => this.closeDetail()));
    const b = this.powerOf(ships);
    const enemy = this.enemyPower();
    const n = (v: number): string => Math.round(v).toLocaleString('en-US');
    const rows: Array<[string, string]> = [
      ['艦の素の戦力 (耐久 × 装甲)', n(b.base)],
      ...POWER_SOURCES.map((k): [string, string] => [POWER_SOURCE_LABEL[k], `${b.steps[k] >= 0 ? '+' : '−'}${(Math.abs(b.steps[k]) * 100).toFixed(1)}%`]),
      ['総戦力', n(b.total)],
      ...(enemy !== null ? [['この海域の敵', `${n(enemy)}  (×${(b.total / Math.max(1, enemy)).toFixed(2)})`] as [string, string]] : []),
    ];
    const rowH = IS_PORTRAIT ? 52 : 34;
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 560;
    const h = 120 + rows.length * rowH + (IS_PORTRAIT ? 90 : 60);
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '総戦力の内訳', eyebrowStyle(11, Css.cyan)));
    add(this.add.text(x + 28, y + 46, '改装・研究・艦長・練度・士気・陣形を、戦闘での効き目で数えています。', textStyle(12, Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    rows.forEach(([label, value], i) => {
      const ry = y + 110 + i * rowH;
      const strong = i === 0 || label === '総戦力';
      add(this.add.text(x + 28, ry, label, textStyle(IS_PORTRAIT ? 16 : 14, strong ? Css.text : Css.muted, { fontStyle: strong ? 'bold' : 'normal' })));
      add(this.add.text(x + w - 28, ry, value, textStyle(IS_PORTRAIT ? 16 : 14, label === '総戦力' ? Css.gold : Css.text, { fontStyle: 'bold' })).setOrigin(1, 0));
    });
    add(new UIButton(this, x + w / 2, y + h - (IS_PORTRAIT ? 44 : 30), '閉じる', () => this.closeDetail(), {
      variant: 'secondary', width: IS_PORTRAIT ? 240 : 180, height: IS_PORTRAIT ? 52 : 36, fontSize: 15,
    }).setScrollFactor(0).setDepth(81));
  }

  private refreshFooter(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    this.countText.setText(`${ships.length} / ${this.slotCount} 隻`);
    if (ships.length === 0) {
      this.summaryText.setText(IS_PORTRAIT ? '艦を選ぶと出撃できます' : '艦を 1 隻以上選ぶと出撃できます');
    } else if (this.organizeOnly) {
      const formation = FORMATION_RULES[this.formation].ja;
      const weight = costText(fleetCost(ships, loadProgress().refits), this.costCap);
      const over = fleetCost(ships, loadProgress().refits) > this.costCap;
      this.summaryText.setText(IS_PORTRAIT ? `${this.powerLabel(ships)}\n${formation} · ${weight}` : `${this.powerLabel(ships)}   艦隊速力 ${Math.min(...ships.map((s) => s.speed))}   陣形 ${formation}\n${weight}   編成を終えたら、作戦か演習へ進みます`).setColor(over ? Css.danger : Css.muted);
    } else {
      const minSpeed = Math.min(...ships.map((s) => s.speed));
      const formation = FORMATION_RULES[this.formation].ja;
      const opts = this.sortieOptions();
      const all = this.allShips(ships);
      const blockers = sortieBlockers(loadProgress(), all, Date.now(), this.sortieOptions(ships));
      const depot = (opts.supply ?? 1) < 1 ? ` (補給 −${Math.round((1 - (opts.supply ?? 1)) * 100)}%)` : '';
      const price = isFreeSortie(opts) ? (opts.exercise ? '無料 (演習)' : '無料 (最初の海域)') : `${formatResources(sortieCostFor(all, opts))}${depot}`;
      // The fleet's cost against the rank's cap (#306), then what the sortie spends.
      const weight = costText(fleetCost(ships, loadProgress().refits), this.costCap);
      const cost = `${weight}   消費  ${price}`;
      // 士気 (#54): a ship too tired still sails, with a warning.
      const progress = loadProgress();
      const morale = ships.map((s) => moraleOf(progress, s.id, Date.now()));
      const tired = ships.filter((_, k) => morale[k] < MORALE_WARN).map((s) => s.name.replace(/\s*\(.*\)\s*$/, ''));
      const avgMorale = Math.round(morale.reduce((a, m) => a + m, 0) / ships.length);
      const second = blockers.length > 0 ? `⚠ ${blockers.join(' / ')}` : tired.length > 0 ? `⚠ 士気が低い: ${tired.join('・')}  (出撃はできます)` : cost;
      this.summaryText
        .setText(
          IS_PORTRAIT
            ? blockers.length > 0 ? second : `${this.powerLabel(ships)}\n${tired.length > 0 ? `⚠ 士気が低い: ${tired.join('・')}` : `${formation} · ${weight} · ${price}`}`
            : `${this.powerLabel(ships)}   艦隊速力 ${minSpeed}   陣形 ${formation}   士気 平均 ${avgMorale}\n${second}`,
        )
        .setColor(blockers.length > 0 ? Css.danger : Css.muted);
    }
    // In organize mode the buttons only move on, so they stay enabled.
    if (!this.organizeOnly) this.startBtn.setEnabled(this.canStart()).setVariant(actionVariant(this.canStart()));
  }

  /**
   * そのまま連戦 (#135): the same fleet again. Ships in the dock or 大破 stay home; if nobody can go or the sortie
   * can't be paid, the builder stays open with the reason in its footer.
   */
  private startRematch(): void {
    this.rematch = false;
    const progress = loadProgress();
    const opts = this.sortieOptions();
    // Exercises take any ship (no damage kept); a campaign sortie leaves docked and 大破 ships behind.
    this.slots = this.slots.map((s) => (s && (opts.exercise || (!isDocked(progress, s.id) && hpFraction(progress, s.id) > HEAVY_DAMAGE)) ? s : null));
    // A gap at the front would leave the flagship slot empty: close ranks, keeping each ship's captain.
    const kept = this.slots.map((s, i) => ({ s, c: this.captainIds[i] })).filter((x) => x.s !== null);
    this.slots = Array.from({ length: this.slotCount }, (_, i) => kept[i]?.s ?? null);
    this.captainIds = Array.from({ length: this.slotCount }, (_, i) => kept[i]?.c ?? null);
    this.refresh();
    if (this.canStart()) this.startBattle();
  }

  /** 演習 (no campaign area) is free and may use docked ships (#15); the first area of a theater is free (#28). */
  /** With the main fleet's ships, also the fleets for the cost check (#306): the main one and each 支援艦隊 (#84). */
  private sortieOptions(ships?: IShipData[]): ISortieOptions {
    const fleets = ships ? [ships, ...this.supportFleets().map((g) => g.ships)] : undefined;
    // 補給廠 (#373): the forward base of the area's sea makes the sortie cheaper.
    return { exercise: this.area === null, area: this.area, fleets, supply: supplyMul(loadProgress(), this.area?.theater) };
  }

  /** The main fleet's ships and those of its 支援艦隊 (#84). */
  private allShips(ships: IShipData[]): IShipData[] {
    return [...ships, ...this.supportFleets().flatMap((g) => g.ships)];
  }

  private canStart(): boolean {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    return ships.length > 0 && sortieBlockers(loadProgress(), this.allShips(ships), Date.now(), this.sortieOptions(ships)).length === 0;
  }

  private isDamaged(ship: IShipData): boolean {
    return hpFraction(loadProgress(), ship.id) < 1;
  }

  /** "HP 210/500 · 入渠中" for damaged ships, plain stats otherwise; `short` for two-column cards. */
  private slotStatus(ship: IShipData, short = false): string {
    const progress = { ...loadProgress(), ...completeRepairs(loadProgress(), Date.now()) };
    const f = hpFraction(progress, ship.id);
    const p = progress.proficiency[ship.id] ?? 0;
    // Out on an expedition or in the dorm (#337): said first, it can't sail.
    const away = shipsAway(progress.expeditions).has(ship.id) ? '遠征中' : inDorm(progress.dorm, 'ship', ship.id) ? '寮舎' : '';
    if (away) return short ? `${away}  HP ${Math.round(ship.hp * f)}/${ship.hp}` : `${away}   HP ${Math.round(ship.hp * f)} / ${ship.hp}`;
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

  /** Captains shown in the picker: the best fits for the ship (#209: 30 per nation are too many to cycle through). */
  static readonly PICKER_CAPTAINS = 8;

  /**
   * Tap: a sheet of this nation's free captains, the best fit for this ship first (#164 #209), plus 外す. Only captains
   * the nation has (#44); one commanding another slot is left out.
   */
  openCaptainPicker(slot: number): void {
    this.closeDetail();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.detail.push(o);
      return o;
    };
    const taken = new Set(this.captainIds.filter((id, i) => id && i !== slot));
    const ship = this.slots[slot];
    const free = this.ownedCaptains()
      .filter((c) => !taken.has(c.id))
      .sort((a, b) => (ship ? captainFit(b, ship.shipClass) - captainFit(a, ship.shipClass) : b.level - a.level));
    const shown = free.slice(0, FleetBuilderScene.PICKER_CAPTAINS);
    const current = free.find((c) => c.id === this.captainIds[slot]);
    if (current && !shown.includes(current)) shown.push(current);
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive()).on('pointerup', () => this.closeDetail());
    const rowH = IS_PORTRAIT ? 56 : 40;
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 640;
    const h = 120 + (shown.length + 1) * (rowH + 6) + 60;
    const d = { x: (CANVAS_W - w) / 2, y: Math.max(16, (CANVAS_H - h) / 2), w, h };
    add(addPanel(this, d.x, d.y, d.w, d.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 })).setInteractive();
    add(this.add.text(d.x + 26, d.y + 22, ship ? `${ship.name.replace(/\s*\(.*\)\s*$/, '')} の艦長` : '艦長', eyebrowStyle(11, Css.cyan)));
    add(this.add.text(d.x + 26, d.y + 44, '適性の高い順', displayStyle(20)));
    const more = free.length - shown.length;
    add(this.add.text(d.x + d.w - 26, d.y + 50, more > 0 ? `ほか ${more} 名 (艦長画面で絞り込み)` : `${free.length} 名`, textStyle(12, Css.muted)).setOrigin(1, 0));
    let y = d.y + 92;
    const pick = (id: string | null): void => {
      this.captainIds[slot] = id;
      this.closeDetail();
      this.refreshSlots();
    };
    for (const c of shown) {
      const apt = ship ? aptitudeFor(c, ship.shipClass) : 'A';
      const label = `${c.name}  Lv${c.level}  ${SKILL_LABEL[c.skill]}  ·  適性 ${apt}${c.id === this.captainIds[slot] ? '  (配属中)' : ''}`;
      add(new UIButton(this, d.x + d.w / 2, y + rowH / 2, label, () => pick(c.id), {
        variant: c.id === this.captainIds[slot] ? 'primary' : apt === 'S' ? 'gold' : 'secondary', width: d.w - 52, height: rowH, fontSize: IS_PORTRAIT ? 14 : 13,
      }));
      y += rowH + 6;
    }
    add(new UIButton(this, d.x + d.w / 2, y + rowH / 2, '艦長を外す', () => pick(null), { variant: 'secondary', width: d.w - 52, height: rowH, fontSize: 13 }));
    add(new UIButton(this, d.x + d.w / 2, d.y + d.h - 34, '閉じる', () => this.closeDetail(), { variant: 'secondary', width: 200, height: IS_PORTRAIT ? 52 : 40, fontSize: 15 }));
  }

  /** This nation's captains the player has, with their levels. */
  private ownedCaptains(): ICaptain[] {
    const progress = loadProgress();
    return this.captainData
      .filter((c) => c.nation === this.nation && progress.captains.includes(c.id))
      .map((c) => withProgress(c, progress.captainXp[c.id] ?? 0));
  }

  /** 自動編成 (#357): ships only, ships and captains, or captains only (#164). */
  private openAutoSheet(): void {
    this.closeDetail();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(80);
      this.detail.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.72).setOrigin(0, 0).setInteractive().on('pointerup', () => this.closeDetail()));
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 520;
    const bh = IS_PORTRAIT ? 64 : 44;
    const h = IS_PORTRAIT ? 470 : 330;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '自動編成', eyebrowStyle(11, Css.cyan)));
    add(this.add.text(x + 28, y + 46, '出撃できる艦から、コストの上限まで強い艦を選びます (遠征中・入渠中・疲労の艦は除く)。', textStyle(12, Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    const choices: Array<[string, () => void]> = [
      ['艦だけ', () => this.autoShips(false)],
      ['艦と艦長', () => this.autoShips(true)],
      ['艦長だけ', () => this.autoCaptains()],
    ];
    choices.forEach(([label, run], i) => {
      add(new UIButton(this, x + w / 2, y + (IS_PORTRAIT ? 150 : 120) + i * (bh + 16), label, () => { this.closeDetail(); run(); }, {
        variant: i === 1 ? 'gold' : 'secondary', width: w - 56, height: bh, fontSize: 16,
      }).setScrollFactor(0).setDepth(81));
    });
    add(new UIButton(this, x + w / 2, y + h - (IS_PORTRAIT ? 40 : 28), '閉じる', () => this.closeDetail(), {
      variant: 'secondary', width: IS_PORTRAIT ? 200 : 160, height: IS_PORTRAIT ? 48 : 34, fontSize: 14,
    }).setScrollFactor(0).setDepth(81));
  }

  /** Fills the fleet with the strongest ships that can sail now (#357), then the captains when asked. */
  private autoShips(captains: boolean): void {
    const progress = { ...loadProgress(), ...completeRepairs(loadProgress(), Date.now()) };
    const now = Date.now();
    const exercise = this.area === null;
    const away = new Set([...sailingIds(progress.sortie), ...shipsAway(progress.expeditions)]);
    const catalog = DataLoader.getUpgrades(this);
    const candidates = this.ships
      .filter((s) => !away.has(s.id) && !inDorm(progress.dorm, 'ship', s.id) && moraleOf(progress, s.id, now) >= MORALE_TIRED)
      // An exercise sails at full HP; a campaign leaves the docked and the badly hurt at home.
      .filter((s) => exercise || (!isDocked(progress, s.id) && hpFraction(progress, s.id) > 0.25))
      .map((ship) => ({ ship, cost: shipCost(ship, progress.refits[ship.id] ?? 0), power: fleetPowerBreakdown([ship], progress, catalog, { now }).total }));
    const fleet = autoFleet(candidates, this.slotCount, this.costCap, this.enemyPower());
    if (fleet.length === 0) return;
    this.slots = Array.from({ length: this.slotCount }, (_, i) => fleet[i] ?? null);
    this.captainIds = Array.from({ length: this.slotCount }, () => null);
    if (captains) this.captainIds = assignCaptains(this.slots.map((s) => s?.shipClass ?? null), this.ownedCaptains());
    // 自動編成章 (#357).
    saveProgress(withQuestEvents(loadProgress(), [['autoFleet', 1]], now));
    this.refresh();
  }

  /** 艦長を自動配属 (#164): the best-fitting captain for every ship, flagship first. */
  autoCaptains(): void {
    this.captainIds = assignCaptains(this.slots.map((s) => s?.shipClass ?? null), this.ownedCaptains());
    this.refreshSlots();
  }

  /** 改装: refit the ships of this fleet (upgrade slots); 艦長自動 beside it. */
  private buildRefitButton(): void {
    const p = this.L.fleet;
    // Landscape keeps both buttons clear of the panel title.
    const bw = IS_PORTRAIT ? 150 : 78;
    const bh = IS_PORTRAIT ? 52 : 32;
    new UIButton(
      this,
      p.x + p.w - PANEL_PAD - bw / 2,
      p.y + (IS_PORTRAIT ? 42 : 32),
      '改装  ›',
      this.onTap(() => {
        this.saveSelection();
        this.scene.start(SceneKeys.CUSTOMIZATION, { returnTo: SceneKeys.FLEET_BUILDER, scope: 'fleet' });
      }),
      { variant: 'secondary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 14 : 12 },
    );
    new UIButton(this, p.x + p.w - PANEL_PAD - bw * 1.5 - 8, p.y + (IS_PORTRAIT ? 42 : 32), '自動編成', this.onTap(() => this.openAutoSheet()), {
      variant: 'secondary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 14 : 12,
    });
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
      enemyCount: this.enemyCount,
      training: this.training,
    };
    const all = (this.registry.get(SELECTION_KEY) as Partial<Record<Nation, ISelection>> | undefined) ?? {};
    this.registry.set(SELECTION_KEY, { ...all, [this.nation]: selection });
  }

  private startBattle(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    // 支援艦隊 (#84) pay their sortie too and sail with the main fleet.
    const support = this.supportFleets();
    const paid = paySortie(loadProgress(), this.allShips(ships), this.sortieOptions());
    if (!paid) return;
    saveProgress(paid, 'sortie');
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
    // ランダム choices are rolled now, so every sortie with them is a new draw (#78).
    const foes = PLAYABLE_NATIONS.filter((n) => n !== this.nation);
    const enemyNation = area
      ? enemyNationFor(campaignData as ICampaignData, area, this.nation)
      : this.enemyNation === RANDOM ? foes[Math.floor(Math.random() * foes.length)] : this.enemyNation;
    const mode = this.mode === RANDOM ? BATTLE_MODES[Math.floor(Math.random() * BATTLE_MODES.length)] : this.mode;
    const count = exerciseEnemyCount(this.enemyCount === SAME_COUNT ? ships.length : this.enemyCount);
    const enemyShipsList = area
      ? enemyShips(area, this.shipRegistry, enemyNation)
      : this.training ? trainingEnemyFleet(this.shipRegistry, enemyNation, count) : exerciseEnemyFleet(this.shipRegistry, enemyNation, mode, ships, count);
    const enemyFleet = FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', enemyNation, enemyShipsList, 0);

    const initData: IBattleInitData = {
      playerFleet,
      enemyFleet,
      mapKey: area?.map ?? '',
      formation: this.formation,
      mode: area ? areaMode(enemyShipsList) : mode,
      weather: area ? area.weather : this.weatherChoice === RANDOM ? randomWeather() : this.weatherChoice,
      time: area ? area.time : this.timeChoice === RANDOM ? randomTime() : this.timeChoice,
      captainIds: this.captainIds.map((id, i) => (this.slots[i] ? id : null)),
      areaId: area?.id,
      training: !area && this.training,
      objective: area?.objective ?? Objective.Annihilate,
      support: support.map((g) => ({ ships: g.ships, captainIds: g.captainIds, mission: g.mission })),
    };

    emitTutorial('sortie', this.registry);
    // 超兵器海域 (#148): one battle against the area's fleet and its giant, outside any sortie.
    if (area && this.swArea) {
      this.scene.start(SceneKeys.BATTLE, { ...initData, superweapon: true, swArea: true, objective: Objective.Annihilate });
      return;
    }
    // A campaign area is fought node by node (#53); the first battle may be its escorts.
    const sortie = area
      ? beginSortie(this, area, this.slots, initData.captainIds ?? [], this.formation, this.nation, enemyNation, enemyShipsList,
        support.map((g) => ({ shipIds: g.ships.map((s) => s.id), captainIds: g.captainIds, mission: g.mission })))
      : null;
    // An exercise leaves a campaign sortie in progress alone (#138): it can still be continued from the map.
    this.scene.start(SceneKeys.BATTLE, sortie ?? initData);
  }
}
