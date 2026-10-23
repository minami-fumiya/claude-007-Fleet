import Phaser from 'phaser';
import { CAPTAIN_DROP_CHANCE, CAPTAIN_MIN_DEPTH, CAPTAIN_PROMOTION_RANK, DUPLICATE_CAPTAIN_XP, MAX_RECRUITS_PER_BATTLE, recruitCaptains } from '@/systems/CaptainRoster';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_HUD, DEPTH_SHIPS, DEPTH_WATER_FX, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { BaseProjectile } from '@/entities/weapons/BaseProjectile';
import { DEPTH_CHARGE_RADIUS } from '@/entities/weapons/DepthCharge';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem, aiSelf, AUTO_AIM_ERROR, CARRIER_STANDOFF, fireAt, IShipView, nearestDistance, shipView } from '@/systems/AISystem';
import { EscortAISystem } from '@/systems/EscortAISystem';
import { chooseTarget, FLAGSHIP_PRIORITY, TACTICS } from '@/systems/AIBrain';
import { FORMATION_RULES, formationModifiers } from '@/systems/FormationRules';
import { aaGuns, AirOpsSystem } from '@/systems/AirOpsSystem';
import { airfieldRearmMs, REARM_MS } from '@/systems/AirWingSystem';
import { AircraftType } from '@/types/Aircraft';
import { FleetSystem } from '@/systems/FleetSystem';
import { FormationSystem } from '@/systems/FormationSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { generateEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { canDive, updateSubmarine } from '@/systems/SubmarineSystem';
import { applyCritical, applyStatus, CRITICAL_LABEL, effectiveShell, LAND_CRITICAL_LABEL, nextShellMode, rollCriticalHit, rollStatus, SHELL_LABEL, statusDamage, STATUS_LABEL, damageReadout, weaponReadout } from '@/systems/DamageSystem';
import { depthChargeFalloff, isDetected, ISonarHunter, sonarRange } from '@/systems/SonarSystem';
import { AIRCRAFT_VISION, isVisible, shipVision, VisionSource } from '@/systems/VisionSystem';
import { ReconSystem } from '@/systems/ReconSystem';
import { FogOfWar } from '@/ui/FogOfWar';
import { drawMap } from '@/ui/MapView';
import { avoidHeading, clearSpawn, currentAt, inShoal, resolveMap, SHOAL_SPEED } from '@/systems/MapSystem';
import { IResolvedMap } from '@/types/Map';
import { addMerit, addRankStats, meritFor, rankOf } from '@/systems/RankSystem';
import { costCap, fleetCost } from '@/systems/FleetCost';
import { BATTLE_WORLD, CONVOY_START_X, convoyEscortStart, enemySpawnPoints, IPoint, lineAtSea, playerStart } from '@/systems/BattleLayout';
import { Minimap } from '@/ui/Minimap';
import { ShipTrails } from '@/entities/effects/ShipTrails';
import { audio } from '@/systems/AudioSystem';
import { enemyFormation } from '@/systems/EnemyFormation';
import { BRIDGE_AIM_MUL, newlyBroken, PART_CRITICAL, PART_LABEL, SUPERWEAPON_GOLD, superweaponOf } from '@/systems/SuperweaponSystem';
import { battleDifficulty, DIFFICULTIES, IDifficulty } from '@/systems/DifficultySystem';
import { SoundKind } from '@/systems/SoundRules';
import { battleConditions, revealedByFlash, TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { IBattleConditions, TimeOfDay, Weather } from '@/types/Weather';
import { primaryWeapon, selectWeapons, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { BattleMode } from '@/types/Battle';
import { Explosion } from '@/entities/effects/Explosion';
import { WaterSplash } from '@/entities/effects/WaterSplash';
import { HUD } from '@/ui/HUD';
import { VirtualJoystick } from '@/ui/components/VirtualJoystick';
import { addChip, addOceanWorld, addPanel, UIButton } from '@/ui/components/UIKit';
import { engageSteer, headingTo, hitTestTarget, inRange, pickTarget, waypointSteer } from '@/systems/AutoPilot';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { DataLoader } from '@/utils/DataLoader';
import { angleBetween, edgePoint } from '@/utils/MathUtils';
import { IShipData, IShipStats } from '@/types/Ship';
import { midModifiers } from '@/systems/ShipKind';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { IFleet } from '@/types/Fleet';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData, IBattleResultData, ICaptainReport } from '@/types/Scene';
import { ICaptain } from '@/types/Captain';
import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { applyToStats, applyToWeapons, combineModifiers, upgradeModifiers, upgradeSlots } from '@/systems/CustomizationSystem';
import { addBattleStats, awardXp, battleXp, captainModifiers, earnedTraits, levelUpNotes, MAX_LEVEL, SKILL_LABEL, withProgress } from '@/systems/CaptainSystem';
import { ShipClass } from '@/types/ShipClass';
import { IProgress, loadProgress, loadSave, saveProgress, walletOf, withProgress as withSaveProgress } from '@/utils/ProgressStore';
import { addGold, battleGold, GOLD_SCENARIO_FIRST } from '@/systems/GoldSystem';
import { awardEarnedMedals } from '@/utils/MedalContext';
import { newlyUnlocked, nationLocks } from '@/systems/NationUnlock';
import { recordLedger } from '@/systems/LedgerSystem';
import { battleRank, betterRank, RANK_MERIT_MUL, RANK_REWARD_MUL, rankBreakdown, rankShortfall, FLAWLESS_HP } from '@/systems/BattleRank';
import { NATION_INFO } from '@/config/NationInfo';
import { isExercise, openSweeps, settleBattle, startingHp } from '@/systems/ProgressionSystem';
import { grantShip, ownedIds, rewardShipFor } from '@/systems/ShipyardSystem';
import { researchModifiers, TECH_TREE, unlockedUpgrades } from '@/systems/ResearchSystem';
import { addResources, formatResources, gainResources, lostNote } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import campaignData from '@/data/campaign.json';
import type { ICampaignData } from '@/types/Campaign';
import { campaignSide, firstSReward, recordClear, TRAINING_SCALE } from '@/systems/CampaignSystem';
import { recordBattle } from '@/systems/RecordSystem';
import { battleBanner, evaluateObjective, goalThrottle, IObjectiveState, objectiveStatus, pauseLines } from '@/systems/ObjectiveSystem';
import { OBJECTIVE_LABEL, objectiveText } from '@/scenes/CampaignMapScene';
import { addProficiency, evadeChance, proficiencyGain, TRAINING_MANUAL_DROP_CHANCE } from '@/systems/ProficiencySystem';
import { Objective } from '@/types/Campaign';
import { Torpedo } from '@/entities/weapons/Torpedo';
import specialData from '@/data/special.json';
import { IScenario, IScenarioSide } from '@/types/Scenario';
import { historyComparison, inZone, IScenarioSetup, placeAt, setupFor, zoneRadius } from '@/systems/ScenarioSystem';
import { REFIT_TABLE, refitModifiers, refitName, refitShipData } from '@/systems/RefitSystem';
import { eventAppliesToBattle, eventEffects, eventLabel, IEventEffects, NO_EVENT } from '@/systems/EventSystem';
import { QuestEvent, withQuestEvents } from '@/systems/QuestSystem';
import { activeEvent } from '@/utils/GameClock';
import { HEAVY_DAMAGE, NODE_LABEL } from '@/systems/SortieMapSystem';
import { endSortie, markSortieFought, takeSortieNotes } from '@/utils/SortieFlow';
import { areaDepth, enemyScale, fleetPower, scaleModifiers } from '@/systems/DifficultyCurve';
import { UNDERDOG_RATIO } from '@/systems/FleetPower';



const SHIP_ROTATE_SPEED = 120;
const JOYSTICK_POS = { x: IS_PORTRAIT ? 140 : 150, y: CANVAS_H - (IS_PORTRAIT ? 170 : 150) };
const JOYSTICK_RADIUS = IS_PORTRAIT ? 86 : 70;

// Touch / AUTO controls
/** A tap this close to an enemy's centre locks it as the target instead of setting a waypoint. */
const TAP_TARGET_RADIUS = 70;
const WAYPOINT_ARRIVE_RADIUS = 24;
/** AUTO mode holds the target at this fraction of the main gun's range. */
const AUTO_RANGE_FRACTION = 0.75;
const AUTO_EDGE_MARGIN = 70;
const TOP_BUTTON = IS_PORTRAIT ? { y: 46, w: 172, h: 60 } : { y: 42, w: 130, h: 44 };
/** Torpedo / dive buttons sit above the bottom-right corner. */
const ACTION_BUTTON = IS_PORTRAIT ? { w: 172, h: 64, gap: 14, bottom: 120 } : { w: 150, h: 46, gap: 10, bottom: 90 };
/** The sea is a 3200 px square in both orientations; the camera follows the flagship. */
const WORLD = BATTLE_WORLD;
const WORLD_BOUNDS = { width: WORLD.w, height: WORLD.h };
const CAMERA_LERP = 0.12;
/** Ships spawn at least this far apart (line-ahead spacing is 90 px). */
const SPAWN_GAP = 80;
/** Screen area where enemies count as visible; outside it they get an edge marker. Excludes the HUD strip. */
const VIEW_INSET = { left: 26, right: CANVAS_W - 26, top: IS_PORTRAIT ? 244 : 96, bottom: CANVAS_H - 26 };

/** Alpha of a submerged boat: own boats stay faintly visible, enemy boats only while on sonar. */
const SUBMERGED_ALPHA = 0.45;
/** One sonar sweep (an expanding ring around each hunter) takes this long. */
const SONAR_PING_MS = 2200;

/** Convoy route: merchant ships enter on the west edge (CONVOY_START_X) and escape off the east edge. */
const CONVOY_EXIT_MARGIN = 90;
/** Player escorts and air strikes prefer the scenario's target ships by this much. */
const OBJECTIVE_PRIORITY = 0.5;
/** Enemy AI prefers convoy ships over warships by this much. */
const CONVOY_PRIORITY = 0.6;
/** A lost contact's last known position stays marked this long (ms, #98). */
const LAST_SEEN_MS = 30_000;

interface ISpecialData {
  convoy: IShipData;
  landTargets: IShipData[];
  bombardLayout: string[];
}

const FALLBACK_WEAPON: IWeaponData = {
  id: 'fallback',
  name: 'Main Gun',
  type: WeaponType.ShellAP,
  firePower: 50,
  range: 450,
  reloadTime: 1500,
  projectileSpeed: 550,
};

export class BattleScene extends Phaser.Scene {
  private battleData: IBattleInitData | null = null;

  private flagship!: BaseShip;
  private escorts: BaseShip[] = [];
  private enemies: BaseShip[] = [];
  private playerNation: Nation = Nation.IJN;

  /** Weapon the player fires by clicking / that the HUD reload meter shows */
  private playerWeapon: IWeaponData = FALLBACK_WEAPON;

  private playerWeapons!: WeaponSystem;
  private enemyWeapons!: WeaponSystem;
  private playerAir!: AirOpsSystem;
  private enemyAir!: AirOpsSystem;
  private playerRecon!: ReconSystem;
  private enemyRecon!: ReconSystem;
  private fog!: FogOfWar;
  private map!: IResolvedMap;
  private islands!: Phaser.Physics.Arcade.StaticGroup;
  private trails!: ShipTrails;
  private muteBtn: UIButton | null = null;
  private minimap!: Minimap;
  private conditions: IBattleConditions = battleConditions(Weather.Clear, TimeOfDay.Day);
  private airText: Phaser.GameObjects.Text | null = null;
  private strikeBtn: UIButton | null = null;
  private strikeReady = false;
  private enemyNation: Nation = Nation.USN;

  private aiSystems: AISystem[] = [];
  /** The player fleet's formation (its effects and flagship screening, #59) */
  private formation: Formation = Formation.LineAhead;
  private escortAISystems: EscortAISystem[] = [];

  /** Player ships the enemy currently has on sonar (submerged boats only matter) */
  private seenByEnemy = new Set<BaseShip>();
  /** Enemy ships the player currently sees */
  private seenByPlayer = new Set<BaseShip>();
  private objective: Objective = Objective.Annihilate;
  private scenario: IScenario | null = null;
  /** Free battle (演習, #15): starts at full HP and keeps no damage */
  private exercise = false;
  /** 超兵器 (#148): whether the enemy brings one, and the one on the sea */
  private bringsSuperweapon = false;
  private superweapon: BaseShip | null = null;
  /** Fires and floods the player's side started on enemy ships (#48) */
  private firesSet = 0;
  /** The enemy fleet's formation (#82) */
  private enemyFormation: Formation = Formation.LineAhead;
  /** 難易度 (#100) of this battle: scenarios always 普通 */
  private difficulty: IDifficulty = DIFFICULTIES.normal;
  private scenarioSetup: IScenarioSetup | null = null;
  /** Objective details: the scenario side's, or the campaign area's (#40) */
  private side: (IScenarioSide & { targetLead?: boolean; arrivalSec?: number }) | null = null;
  private scenarioTargets: BaseShip[] = [];
  private convoy: BaseShip[] = [];
  private convoyEscaped = 0;
  private landTargets: BaseShip[] = [];
  private objectiveText: Phaser.GameObjects.Text | null = null;
  /** Captains in command of player ships this battle */
  private captains = new Map<BaseShip, ICaptain>();
  /** Where ships have spawned this battle, so later ones keep clear of them */
  private spawnedAt: IPoint[] = [];

  private explosion!: Explosion;
  private splash!: WaterSplash;
  private hud!: HUD;

  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private joystick: VirtualJoystick | null = null;
  private aimTarget = { x: CANVAS_W / 2, y: 0 };

  /** Touch devices get tap-to-move, tap-to-target and auto-fire. */
  private isTouch = false;
  /** AUTO: the flagship chooses a target, manoeuvres and fires on its own. */
  private autoMode = false;
  private autoBtn!: UIButton;
  private diveBtn: UIButton | null = null;
  private diveText: Phaser.GameObjects.Text | null = null;
  /** The player's wish for a submarine flagship to be submerged */
  private wantDive = false;
  private lockedTarget: BaseShip | null = null;
  private waypoint: { x: number; y: number } | null = null;

  private reticle!: Phaser.GameObjects.Graphics;
  private sonarRings!: Phaser.GameObjects.Graphics;
  /** Screen-space arrows pointing at enemies outside the camera view */
  private edgeMarkers!: Phaser.GameObjects.Graphics;
  /** Game-loop time of the first battle frame (-1 until then); the HUD clock and results count from it */
  private battleStartedAt = -1;
  /** Pause (#79): while paused nothing advances; the battle clock is the game-loop time minus all paused time */
  private paused = false;
  private pauseStartedAt = 0;
  private pausedMs = 0;
  private pauseLayer: Phaser.GameObjects.GameObject[] = [];
  /** Where each enemy was last seen (battle clock), drawn as a fading ring after contact is lost (#98) */
  private lastSeen = new Map<BaseShip, { x: number; y: number; at: number }>();
  private lastSeenMarks!: Phaser.GameObjects.Graphics;

  private aimAngle = 0;
  private gameOver = false;
  /** Event effects for this battle's rewards (#89); set when the battle ends */
  private battleEvent: IEventEffects = NO_EVENT;

  constructor() {
    super({ key: SceneKeys.BATTLE });
  }

  init(data: IBattleInitData): void {
    this.battleData = data ?? null;
  }

  create(): void {
    audio.music('battle');
    this.gameOver = false;
    // Phaser reuses the scene instance: per-battle logs must be cleared here, not at declaration.
    this.damageLog.player = {};
    this.damageLog.enemy = {};
    this.escorts = [];
    this.enemies = [];
    this.aiSystems = [];
    this.escortAISystems = [];
    this.firesSet = 0;
    this.superweapon = null;
    this.seenByEnemy = new Set();
    this.seenByPlayer = new Set();
    this.convoy = [];
    this.convoyEscaped = 0;
    this.landTargets = [];
    this.objectiveText = null;
    this.scenarioTargets = [];
    this.captains = new Map();
    this.spawnedAt = [];
    this.diveBtn = null;
    this.diveText = null;
    this.airText = null;
    this.strikeBtn = null;
    this.strikeReady = false;
    this.wantDive = false;

    addOceanWorld(this, WORLD.w, WORLD.h);
    this.map = resolveMap(DataLoader.getMap(this, this.battleData?.mapKey || 'open-sea'), WORLD.w, WORLD.h);
    this.islands = drawMap(this, this.map);
    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    // Set on the first update with the game-loop time: the scene clock in create() can be stale, which once made the
    // battle clock start at the time the page had been open (e.g. 14 minutes).
    this.battleStartedAt = -1;
    this.paused = false;
    this.pausedMs = 0;
    this.pauseLayer = [];
    this.lastSeen = new Map();
    this.aimTarget = { x: playerStart().x, y: playerStart().y - 300 };
    this.isTouch = this.sys.game.device.input.touch;
    this.autoMode = false;
    this.lockedTarget = null;
    this.waypoint = null;

    const { playerFleet, enemyFleet, formation } = this.resolveFleets(DataLoader.getRegistry(this));
    this.conditions = battleConditions(this.battleData?.weather ?? Weather.Clear, this.battleData?.time ?? TimeOfDay.Day);
    this.playerNation = playerFleet.nation;
    this.enemyNation = enemyFleet.nation;

    this.playerWeapons = new WeaponSystem(this, (x, y, w, src) => this.onDepthCharge(x, y, w, this.enemies, src));
    this.enemyWeapons = new WeaponSystem(this, (x, y, w, src) => this.onDepthCharge(x, y, w, this.playerSide(), src));
    this.playerWeapons.aimError = this.conditions.aimError;
    this.enemyWeapons.aimError = this.conditions.aimError;
    const bomb = DataLoader.getWeaponById(this, 'aerial_bomb') ?? FALLBACK_WEAPON;
    const aerialTorpedo = DataLoader.getWeaponById(this, 'aerial_torpedo') ?? FALLBACK_WEAPON;
    const onBomb = (target: BaseShip, weapon: IWeaponData, dmg: number): void => {
      this.explosion.play(target.x, target.y);
      this.sound3d('explosion', target.x, target.y);
      this.rollCritical(target, weapon, dmg);
    };
    this.playerAir = new AirOpsSystem(this, false, this.playerWeapons, bomb, aerialTorpedo, onBomb);
    this.enemyAir = new AirOpsSystem(this, true, this.enemyWeapons, bomb, aerialTorpedo, onBomb);
    this.playerAir.onLaunch = (x, y) => this.sound3d('plane', x, y);
    this.enemyAir.onLaunch = (x, y) => this.sound3d('plane', x, y);
    this.playerRecon = new ReconSystem(this, false);
    this.enemyRecon = new ReconSystem(this, true);

    const sc = this.battleData?.scenario;
    const scenario = sc ? DataLoader.getScenarios(this).find((s) => s.id === sc.id) : undefined;
    this.scenario = scenario ?? null;
    this.scenarioSetup = scenario && sc ? setupFor(scenario, sc.side) : null;
    // Zone, time limit and target: the scenario side's, or a campaign area's (#40).
    const battleArea = (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId);
    // A skirmish before a campaign area's boss is a plain fight (#53).
    const bossNode = this.battleData?.sortie?.boss ?? true;
    this.side = this.scenarioSetup?.side ?? (bossNode ? campaignSide(battleArea) : null);
    this.exercise = isExercise({ areaId: this.battleData?.areaId, scenario: this.scenario ?? undefined });
    this.difficulty = battleDifficulty(audio.settings.difficulty, this.scenario !== null);
    // 超兵器出現 (#148 #89): a main fleet in the event's theater brings its superweapon (not training areas).
    const event = eventEffects(activeEvent());
    this.bringsSuperweapon = this.battleData?.superweapon === true || (bossNode && battleArea !== undefined && !battleArea.training && event.superweaponTheater === battleArea.theater);
    this.objective = this.side?.objective ?? this.battleData?.objective ?? Objective.Annihilate;
    this.formation = formation;
    this.spawnPlayerFleet(playerFleet, formation);
    this.spawnEnemyFleet(enemyFleet);
    if (this.objective === Objective.Convoy) this.spawnConvoy();
    if (this.objective === Objective.Bombard) this.spawnLandTargets();
    const startAngle = this.scenarioSetup?.player.positions[0]?.angle;
    if (startAngle !== undefined) for (const s of this.friendlies()) s.setAngle(startAngle);
    this.drawObjectiveZone();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.w, WORLD.h);
    cam.startFollow(this.flagship, true, CAMERA_LERP, CAMERA_LERP);

    this.explosion = new Explosion(this);
    this.splash = new WaterSplash(this);
    const torpedoMain = weaponKind(this.playerWeapon) === WeaponKind.Torpedo;
    this.hud = new HUD(this, this.flagship, this.enemies, this.escorts, torpedoMain ? '魚雷' : '主砲', this.convoy);

    this.fog = new FogOfWar(this, this.conditions.fogColor, this.conditions.fogAlpha);
    this.trails = new ShipTrails(this);
    for (const s of [...this.playerSide(), ...this.enemies]) this.trails.add(s);
    const mm = IS_PORTRAIT ? { w: 150, x: CANVAS_W - 20 - 150, y: 252 } : { w: 200, x: CANVAS_W - 20 - 200, y: 80 };
    this.minimap = new Minimap(this, mm.x, mm.y, mm.w, WORLD.w, WORLD.h);
    this.minimap.drawIslands(this.map);
    const splashAt = (x: number, y: number): void => {
      // Only splashes the player could see.
      if (isVisible(x, y, this.visionSources(this.playerSide(), this.playerRecon, this.playerAir))) this.splash.play(x, y, 0.8);
    };
    this.playerWeapons.onSplash = (x, y) => {
      splashAt(x, y);
      this.sound3d('splash', x, y);
    };
    this.enemyWeapons.onSplash = (x, y) => {
      splashAt(x, y);
      this.sound3d('splash', x, y);
    };
    const onFire = (w: IWeaponData, x: number, y: number): void => {
      const kind = weaponKind(w);
      if (kind === WeaponKind.Torpedo) this.sound3d('torpedo', x, y);
      else if (kind === WeaponKind.Gun) this.sound3d(w.firePower >= 90 ? 'bigGun' : 'gun', x, y);
    };
    this.playerWeapons.onFire = onFire;
    this.enemyWeapons.onFire = onFire;
    this.addWeatherEffects();
    this.setupInput();
    this.buildOverlayUi();
    this.setupClickFire();
    this.setupOverlaps();
    this.showBattleBanner();
    // First-play tutorial (#90): the battle waits while its explanation is open (not in historical scenarios).
    if (!this.scenario) {
      new TutorialGuide(this, { chip: false, onOpen: () => this.setPaused(true, false), onClose: () => this.setPaused(false) });
    }
  }

  update(loopTime: number, delta: number): void {
    if (this.gameOver || this.paused) return;
    // Everything in the battle runs on the battle clock, which stands still while paused (#79).
    const time = loopTime - this.pausedMs;
    if (this.battleStartedAt < 0) this.battleStartedAt = time;

    // Flagship may have been destroyed by a physics overlap callback in the previous frame.
    // Guard here before accessing .body in handleMovement to prevent a null-body crash.
    if (!this.flagship.active) {
      this.triggerGameOver(false);
      return;
    }

    const dtSec = delta / 1000;
    this.burnAndFlood(delta);
    this.updateSubmarines(dtSec);
    this.playerRecon.update(time, delta, aaGuns(this.enemies), this.enemies);
    this.enemyRecon.update(time, delta, aaGuns(this.playerSide()), this.playerSide());
    this.updateDetection();
    const playerView = this.playerSide().map((s) => ({
      ...shipView(s, this.seenByEnemy.has(s)),
      priority: s.isConvoy ? CONVOY_PRIORITY : s === this.flagship ? FLAGSHIP_PRIORITY + FORMATION_RULES[this.formation].flagshipPriority + this.difficulty.flagshipPriority : 0,
    }));
    // The enemy flagship is screened by its formation (#82) as the player's is.
    const enemyView = this.enemies.map((s, i) => ({ ...shipView(s, this.seenByPlayer.has(s)), priority: this.scenarioTargets.includes(s) ? OBJECTIVE_PRIORITY : i === 0 ? FORMATION_RULES[this.enemyFormation].flagshipPriority : 0 }));

    if (!this.isTouch) {
      // Re-project the cursor every frame: the camera moves even when the mouse doesn't.
      const p = this.input.activePointer;
      this.aimTarget = this.cameras.main.getWorldPoint(p.x, p.y);
    }
    // Fire, flooding or a submarine this frame may have sunk the flagship too (found by the battle simulator, #320).
    if (!this.flagship.active) {
      this.triggerGameOver(false);
      return;
    }
    const target = this.currentTarget();
    this.handleMovement(delta, target);
    this.updateAim();
    if (target && (this.isTouch || this.autoMode)) this.autoFire(target, enemyView, time);
    else if (target) this.autoSecondaries(target, enemyView, time);
    this.autoDepthCharge(enemyView, time);

    this.applySea(dtSec);
    this.updateConvoy(dtSec);
    this.playerWeapons.update(time, delta);
    this.enemyWeapons.update(time, delta);
    this.updateAir(time, delta, playerView, enemyView);

    // Who the enemy is attacking, kept current as each ship decides so they spread their fire (#34).
    const attackers = new Map<BaseShip, number>();
    const count = (s: BaseShip | null, n: number): void => {
      if (s) attackers.set(s, (attackers.get(s) ?? 0) + n);
    };
    this.enemies.forEach((e, i) => e.isAlive && count(this.aiSystems[i].targetShip, 1));
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.isAlive) continue;
      const ai = this.aiSystems[i];
      const before = ai.targetShip;
      ai.update(enemy, playerView, time, delta, attackers);
      count(before, -1);
      count(ai.targetShip, 1);
    }

    for (let i = 0; i < this.escorts.length; i++) {
      if (this.escorts[i].isAlive) {
        this.escortAISystems[i].update(this.escorts[i], this.flagship, enemyView, time, delta);
        this.escorts[i].aiNote = this.escortAISystems[i].hunting ? '対潜攻撃' : '';
      }
    }

    this.hud.update(this.flagship, this.enemies, this.escorts, {
      reload: this.playerWeapons.reloadProgress(this.flagship, this.playerWeapon, time),
      elapsedSec: (time - this.battleStartedAt) / 1000,
      weapons: weaponReadout(this.weaponStates(time)),
      damage: damageReadout(this.flagship.criticals, this.flagship.status, this.battleNow()),
    });
    this.refreshDiveUi();
    this.refreshAirUi();
    this.drawReticle();
    this.drawSonar(time);
    this.drawEdgeMarkers();
    this.trails.update();
    this.minimap.update(this.playerSide(), this.enemies, this.seenByPlayer);
    this.checkWinLoss();
  }

  private friendlies(): BaseShip[] {
    return [this.flagship, ...this.escorts];
  }

  /** Everything on the player's side the enemy can shoot at: warships plus the convoy still at sea. */
  private playerSide(): BaseShip[] {
    return [this.flagship, ...this.escorts, ...this.convoy.filter((c) => c.active)];
  }

  /** Breakthrough / escape zone of a scenario: a dashed gold ring with its name. */
  private drawObjectiveZone(): void {
    const zone = this.side?.zone;
    if (!zone) return;
    const c = placeAt(zone, WORLD.w, WORLD.h);
    const r = zoneRadius(zone.r, WORLD.w, WORLD.h);
    const g = this.add.graphics().setDepth(DEPTH_WATER_FX);
    g.fillStyle(Colors.gold, 0.06);
    g.fillCircle(c.x, c.y, r);
    g.lineStyle(2, Colors.gold, 0.6);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      g.beginPath();
      g.arc(c.x, c.y, r, a, a + Math.PI / 36);
      g.strokePath();
    }
    this.add.text(c.x, c.y, zone.label, textStyle(14, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0.5).setDepth(DEPTH_WATER_FX);
  }

  /** Convoy: three merchant ships start on the west edge with the escort fleet beside them. */
  private spawnConvoy(): void {
    const data = (specialData as unknown as ISpecialData).convoy as IShipData;
    for (const dy of [-90, 0, 90]) {
      const ship = this.spawnShip(data, CONVOY_START_X, WORLD.h / 2 + dy);
      ship.isConvoy = true;
      ship.setAngle(90);
      this.convoy.push(ship);
    }
  }

  /** Merchant ships sail east at their own pace; reaching the far edge counts as escaped. */
  private updateConvoy(dtSec: number): void {
    for (const ship of this.convoy) {
      if (!ship.isAlive) continue;
      if (ship.x >= WORLD.w - CONVOY_EXIT_MARGIN) {
        this.convoyEscaped++;
        ship.setActive(false).setVisible(false);
        (ship.body as Phaser.Physics.Arcade.Body).enable = false;
        continue;
      }
      const s = waypointSteer(ship, { x: WORLD.w, y: ship.y }, 10);
      if (s) ship.steer({ headingDeg: 90 + (s.headingDeg - 90) * 0.2, throttle: 1 }, dtSec, 40);
    }
  }

  /** Bombardment: batteries, a harbour and an airfield spread over the biggest island. */
  private spawnLandTargets(): void {
    const island = [...this.map.islands].sort((a, b) => b.reduce((n, c) => n + c.r, 0) - a.reduce((n, c) => n + c.r, 0))[0];
    if (!island) return;
    const special = specialData as unknown as ISpecialData;
    const core = island[0];
    const spots = special.bombardLayout.map((_, i, all) => {
      const a = (i / all.length) * Math.PI * 2;
      return { x: core.x + Math.cos(a) * core.r * 0.55, y: core.y + Math.sin(a) * core.r * 0.55 };
    });
    special.bombardLayout.forEach((id, i) => {
      const data = special.landTargets.find((t) => t.id === id) as IShipData | undefined;
      if (!data) return;
      const target = this.spawnShip(data, spots[i].x, spots[i].y, NO_MODIFIERS, false);
      target.isLand = true;
      target.setTint(0xffb0a0);
      (target.body as Phaser.Physics.Arcade.Body).setImmovable(true);
      this.enemies.push(target);
      this.landTargets.push(target);
      // 飛行場 (#83): its air group strikes the fleet until it is destroyed.
      if (data.airWing) this.enemyAir.register(target, AirOpsSystem.wingFor(data));
      this.aiSystems.push(new AISystem(this.enemyWeapons, TACTICS[this.enemyNation], WORLD_BOUNDS));
    });
  }

  /** Uses the Fleet Builder's fleets, or Yamato against a USN surface group when started directly. */
  private resolveFleets(
    registry: ShipRegistry,
  ): { playerFleet: IFleet; enemyFleet: IFleet; formation: Formation } {
    if (this.battleData?.playerFleet && FleetSystem.isValid(this.battleData.playerFleet)) {
      return {
        playerFleet: this.battleData.playerFleet,
        enemyFleet: this.battleData.enemyFleet,
        formation: this.battleData.formation ?? Formation.LineAhead,
      };
    }
    const yamato = registry.byId('yamato') ?? registry.byNation(Nation.IJN)[0];
    const enemies = generateEnemyFleet(registry, Nation.USN, this.battleData?.mode ?? BattleMode.Surface);
    return {
      playerFleet: FleetSystem.createFleet('default', '大和隊', Nation.IJN, [yamato], 0),
      enemyFleet: FleetSystem.createFleet('enemy', 'Enemy', Nation.USN, enemies, 0),
      formation: Formation.LineAhead,
    };
  }

  private loadoutOf(shipData: IShipData): IWeaponData[] {
    const loadout = shipData.weapons
      .map((id) => DataLoader.getWeaponById(this, id))
      .filter((w): w is IWeaponData => w !== undefined);
    return loadout.length > 0 ? loadout : [FALLBACK_WEAPON];
  }

  private spawnShip(shipData: IShipData, wantX: number, wantY: number, mods: IShipModifiers = NO_MODIFIERS, avoidLand = true): BaseShip {
    const { x, y } = avoidLand ? clearSpawn(this.map, wantX, wantY, 60, this.spawnedAt, SPAWN_GAP) : { x: wantX, y: wantY };
    if (avoidLand) this.spawnedAt.push({ x, y });
    const loadout = applyToWeapons(this.loadoutOf(shipData), mods);
    const stats = applyToStats(this.shipDataToStats(shipData, primaryWeapon(loadout)), mods);
    const ship = new BaseShip(this, x, y, shipData.spriteKey, stats);
    ship.loadout = loadout;
    ship.dataId = shipData.id;
    ship.envSpeedMul = this.conditions.speedMul;
    if (this.map.islands.length > 0) ship.avoid = (px, py, h) => avoidHeading(this.map, px, py, h);
    ship.mods = mods;
    ship.clock = () => this.battleNow();
    const night = this.conditions.time === TimeOfDay.Night;
    ship.visionMul = mods.visionMul * (night ? mods.nightVisionMul : 1);
    ship.aimErrorMul = night ? mods.nightAimMul : 1;
    ship.aaMul = mods.aaMul;
    ship.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
    (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
    return ship;
  }

  /** Captain of fleet slot `index`, with saved progress. */
  private captainFor(index: number): ICaptain | null {
    const id = this.battleData?.captainIds?.[index];
    const data = id ? DataLoader.getCaptains(this).find((c) => c.id === id) : undefined;
    return data ? withProgress(data, loadProgress().captainXp[data.id] ?? 0) : null;
  }

  /** Unlocked upgrades fitted to the ship, finished research, its captain's bonus and the fleet's formation (#59). */
  private playerModifiers(shipData: IShipData, captain: ICaptain | null, isFlagship: boolean): IShipModifiers {
    // Scenarios are exhibitions: the save's upgrades, research and refits don't apply.
    const captainCtx = { night: this.conditions.time === TimeOfDay.Night };
    // What the 中分類 is good at (#260), on the player's ships only: the enemy's strength is set by the difficulty
    // curve, which knows nothing of it (enemy AA cruisers at ×1.5 halved the win rate in the simulator).
    const formation = combineModifiers(formationModifiers(this.formation, isFlagship), midModifiers(shipData));
    if (this.scenario) return combineModifiers(captainModifiers(captain, captainCtx, [], undefined, shipData.shipClass), formation);
    const progress = loadProgress();
    const catalog = unlockedUpgrades(DataLoader.getUpgrades(this), progress.research);
    const fitted = progress.upgrades[shipData.id] ?? [];
    const stage = progress.refits[shipData.id] ?? 0;
    return combineModifiers(
      upgradeModifiers(fitted, catalog, upgradeSlots(stage)),
      researchModifiers(TECH_TREE, progress.research),
      refitModifiers(REFIT_TABLE, shipData, stage, progress.refitBranches[shipData.id]),
      // The captain's own speciality, learned skills, abilities and earned traits (#45), by aptitude for the ship (#131).
      captainModifiers(captain, captainCtx, captain ? progress.captainSkills[captain.id] ?? [] : [], captain ? progress.captainStats[captain.id] : undefined, shipData.shipClass,
        captain ? progress.captainBonus[captain.id] ?? [] : []),
      formation,
    );
  }

  /** The player's ship as remodelled (special refits swap weapons or embark aircraft); scenarios use the original build. */
  private rebuilt(shipData: IShipData): IShipData {
    if (this.scenario) return shipData;
    return refitShipData(REFIT_TABLE, shipData, loadProgress().refits[shipData.id] ?? 0);
  }

  /** Damage carried over from earlier battles, and the crew's proficiency. */
  private applyStartingDamage(ship: BaseShip): void {
    // Scenarios start every ship fresh: full HP, green crew, original build.
    if (this.scenario) return;
    const progress = loadProgress();
    ship.stats.proficiency = progress.proficiency[ship.dataId] ?? 0;
    ship.stats.name = refitName(REFIT_TABLE, ship.stats.name, { id: ship.dataId, shipClass: ship.stats.shipClass }, progress.refits[ship.dataId] ?? 0, progress.refitBranches[ship.dataId]);
    const f = startingHp(progress, ship.dataId, this.exercise);
    ship.stats.currentHp = Math.max(1, Math.round(ship.stats.maxHp * f));
  }

  /** Convoy escorts start beside the convoy on the west edge; everything else from the south. */
  private flagshipSpawn(): { x: number; y: number } {
    const placed = this.scenarioSetup?.player.positions[0];
    if (placed) return placeAt(placed, WORLD.w, WORLD.h);
    return this.objective === Objective.Convoy ? convoyEscortStart(WORLD) : playerStart(WORLD);
  }

  private spawnPlayerFleet(fleet: IFleet, formation: Formation): void {
    const flagshipBase = FleetSystem.getFlagship(fleet);
    if (!flagshipBase) return;
    const flagshipData = this.rebuilt(flagshipBase);

    const flagCaptain = this.captainFor(fleet.flagshipIndex);
    const spawn = this.flagshipSpawn();
    this.flagship = this.spawnShip(flagshipData, spawn.x, spawn.y, this.playerModifiers(flagshipData, flagCaptain, true));
    if (flagCaptain) this.captains.set(this.flagship, flagCaptain);
    this.applyStartingDamage(this.flagship);
    this.playerAir.register(this.flagship, AirOpsSystem.wingFor(flagshipData, this.flagship.mods));
    this.playerRecon.register(this.flagship);
    this.playerWeapon = primaryWeapon(this.flagship.loadout) ?? FALLBACK_WEAPON;

    const profile = TACTICS[fleet.nation];
    const escortSlots = fleet.slots.filter((s, i) => i !== fleet.flagshipIndex && s.shipData !== null);
    const offsets = FormationSystem.getOffsets(formation, escortSlots.length);
    escortSlots.forEach((slot, i) => {
      const escortData = this.rebuilt(slot.shipData as IShipData);
      const offset = offsets[i];
      const placed = this.scenarioSetup?.player.positions[i + 1];
      const spawnPos = placed ? placeAt(placed, WORLD.w, WORLD.h) : FormationSystem.getWorldPositionFromValues(spawn.x, spawn.y, 0, offset);
      const captain = this.captainFor(slot.slotIndex);
      const escort = this.spawnShip(escortData, spawnPos.x, spawnPos.y, this.playerModifiers(escortData, captain, false));
      if (captain) this.captains.set(escort, captain);
      this.applyStartingDamage(escort);
      this.playerAir.register(escort, AirOpsSystem.wingFor(escortData, escort.mods));
      this.playerRecon.register(escort);
      this.escorts.push(escort);
      this.escortAISystems.push(new EscortAISystem(this.playerWeapons, offset, profile));
    });
  }

  private spawnEnemyFleet(fleet: IFleet): void {
    const profile = TACTICS[fleet.nation];
    // The superweapon (#148) sails at the head of the fleet.
    const giant = this.bringsSuperweapon ? superweaponOf(fleet.nation) : undefined;
    const ships = giant ? [giant, ...FleetSystem.getShips(fleet)] : FleetSystem.getShips(fleet);
    // 敵の陣形 (#82): chosen by the situation unless the area or scenario names one; its effects apply as for the
    // player, the first ship leads and the others keep their slots until they have a target (散開).
    const named = this.scenarioSetup?.enemy.formation ?? (this.battleData?.areaId ? (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId)?.enemy.formation : undefined);
    this.enemyFormation = enemyFormation({
      nation: fleet.nation, enemy: ships.map((s) => s.shipClass), player: this.playerSide().map((s) => s.stats.shipClass),
      night: this.conditions.time === TimeOfDay.Night, named,
    });
    const offsets = FormationSystem.getOffsets(this.enemyFormation, Math.max(0, ships.length - 1));
    // A sea further along the player's order meets a stronger enemy (#293).
    const area = this.battleData?.areaId ? (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId) : undefined;
    const reach = scaleModifiers(area && !this.exercise ? enemyScale(campaignData as ICampaignData, area, this.playerNation) : 1);
    // The flagship starts in the middle of a line north of the centre (moved off any island), the rest in formation.
    const line = lineAtSea(this.map, enemySpawnPoints(ships.length, WORLD));
    const lead = line[Math.floor(line.length / 2)];
    let flagship: BaseShip | null = null;
    ships.forEach((shipData, i) => {
      const placed = this.scenarioSetup?.enemy.positions[i];
      const slot = i === 0 ? lead : FormationSystem.getWorldPositionFromValues(lead.x, lead.y, 180, offsets[i - 1]);
      const pos = placed ? placeAt(placed, WORLD.w, WORLD.h) : slot;
      const enemy = this.spawnShip(shipData, pos.x, pos.y, combineModifiers(formationModifiers(this.enemyFormation, i === 0), reach));
      // 難易度 (#100): how well the enemy aims and how much it takes.
      enemy.aimErrorMul *= this.difficulty.aimMul;
      enemy.stats.maxHp = Math.round(enemy.stats.maxHp * this.difficulty.hpMul);
      enemy.stats.currentHp = enemy.stats.maxHp;
      enemy.setTint(0xdd4444);
      if (giant && i === 0) {
        enemy.setScale(giant.scale);
        this.superweapon = enemy;
      }
      enemy.setAngle(placed ? placed.angle : 180);
      this.enemies.push(enemy);
      this.enemyAir.register(enemy, AirOpsSystem.wingFor(shipData));
      this.enemyRecon.register(enemy);
      const ai = new AISystem(this.enemyWeapons, profile, WORLD_BOUNDS);
      // Searching ships sweep towards the middle in their own lane instead of all meeting at one point.
      ai.patrol = { x: enemy.x, y: WORLD.h / 2 };
      if (i === 0) flagship = enemy;
      else if (flagship && !placed) ai.station = { lead: flagship, offset: offsets[i - 1] };
      const side = this.side;
      if (side?.zone && side.enemyGoesForZone && (side.targets ?? []).includes(shipData.id)) ai.goal = placeAt(side.zone, WORLD.w, WORLD.h);
      const target = (side?.targets ?? []).includes(shipData.id) || (side?.targetLead === true && i === 0);
      if (side?.zone && side.enemyGoesForZone && target && side.targetLead) {
        ai.goal = placeAt(side.zone, WORLD.w, WORLD.h);
        // Slow enough to reach the zone in `arrivalSec` at the earliest, so intercepting it matters (#40).
        ai.goalThrottle = goalThrottle(Math.hypot(ai.goal.x - enemy.x, ai.goal.y - enemy.y), enemy.currentSpeed, side.arrivalSec);
      }
      if (target) this.scenarioTargets.push(enemy);
      this.aiSystems.push(ai);
    });
  }

  private shipDataToStats(shipData: IShipData, weapon?: IWeaponData): IShipStats {
    return {
      name: shipData.name,
      maxHp: shipData.hp,
      currentHp: shipData.hp,
      armor: shipData.armor,
      speed: shipData.speed,
      firePower: weapon?.firePower ?? 30,
      shipClass: shipData.shipClass,
      subtype: shipData.subtype,
    };
  }

  // -------------------------------------------------------------------------
  // Submarines and sonar
  // -------------------------------------------------------------------------

  /** Advances every boat's dive state: the player's wish for the flagship, AI decisions for the rest. */
  private updateSubmarines(dtSec: number): void {
    const playerFoes = this.enemies.map((s) => shipView(s, this.seenByPlayer.has(s)));
    const enemyFoes = this.playerSide().map((s) => shipView(s, this.seenByEnemy.has(s)));
    const all: Array<[BaseShip, boolean]> = [
      [this.flagship, this.wantDive],
      ...this.escorts.map((s): [BaseShip, boolean] => [s, this.aiSystemsWantDive(s, playerFoes)]),
      ...this.enemies.map((s, i): [BaseShip, boolean] => [s, this.aiSystems[i].wantsDive(s, enemyFoes)]),
    ];
    for (const [ship, want] of all) {
      if (!ship.sub || !ship.isAlive) continue;
      ship.sub = updateSubmarine(ship.sub, dtSec, want);
    }
    if (this.flagship.sub?.forcedSurface) this.wantDive = false;
  }

  /** Escort boats dive when enemies are near, like enemy boats do. */
  private aiSystemsWantDive(ship: BaseShip, foes: IShipView[]): boolean {
    if (!ship.sub) return false;
    const d = nearestDistance(ship, foes);
    return d < 750 && (ship.sub.submerged ? ship.sub.air > 0.12 : ship.sub.air >= 0.5);
  }

  private hunters(ships: BaseShip[]): ISonarHunter[] {
    return ships
      .filter((s) => s.isAlive && !s.submerged && !s.isConvoy && !s.isLand)
      .map((s) => ({ x: s.x, y: s.y, sonarRange: sonarRange(s.stats.shipClass) * s.mods.sonarMul }));
  }

  /** Currents push every ship; shoal water slows it. */
  private applySea(dtSec: number): void {
    for (const ship of [...this.playerSide(), ...this.enemies]) {
      if (!ship.isAlive) continue;
      ship.envSpeedMul = this.conditions.speedMul * (inShoal(this.map, ship.x, ship.y) ? SHOAL_SPEED : 1);
      const c = currentAt(this.map, ship.x, ship.y);
      if (c.vx !== 0 || c.vy !== 0) {
        ship.x += c.vx * dtSec;
        ship.y += c.vy * dtSec;
      }
    }
  }

  /** Everything one side sees with: ship vision circles, recon cones and its aircraft. */
  private visionSources(ships: BaseShip[], recon: ReconSystem, air: AirOpsSystem): VisionSource[] {
    const sources: VisionSource[] = [];
    const env = this.conditions.visionMul;
    for (const s of ships) {
      if (s.isAlive) sources.push({ kind: 'circle', x: s.x, y: s.y, radius: shipVision(s.stats.shipClass, s.submerged) * s.visionMul * env });
    }
    sources.push(...recon.cones(env));
    for (const sq of air.squadrons) {
      if (sq.alive) sources.push({ kind: 'circle', x: sq.x, y: sq.y, radius: AIRCRAFT_VISION * env });
    }
    return sources;
  }

  /** Fading rings where enemies were last seen, for LAST_SEEN_MS after contact is lost (#98). */
  private drawLastSeen(): void {
    const now = this.battleNow();
    const g = this.lastSeenMarks;
    g.clear();
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) {
        this.lastSeen.delete(enemy);
        continue;
      }
      if (this.seenByPlayer.has(enemy)) {
        this.lastSeen.set(enemy, { x: enemy.x, y: enemy.y, at: now });
        continue;
      }
      const seen = this.lastSeen.get(enemy);
      if (!seen) continue;
      const age = now - seen.at;
      if (age > LAST_SEEN_MS) {
        this.lastSeen.delete(enemy);
        continue;
      }
      const alpha = 0.6 * (1 - age / LAST_SEEN_MS);
      g.lineStyle(2, Colors.danger, alpha);
      g.strokeCircle(seen.x, seen.y, 34);
      g.lineBetween(seen.x - 10, seen.y - 10, seen.x + 10, seen.y + 10);
      g.lineBetween(seen.x - 10, seen.y + 10, seen.x + 10, seen.y - 10);
    }
  }

  /** At night a ship that just fired is seen by any enemy within the flash range. */
  private flashed(ship: BaseShip, weapons: WeaponSystem, observers: BaseShip[]): boolean {
    const last = weapons.lastFiredAt(ship);
    if (last === undefined) return false;
    let nearest = Infinity;
    for (const o of observers) if (o.isAlive) nearest = Math.min(nearest, Phaser.Math.Distance.Between(ship.x, ship.y, o.x, o.y));
    return revealedByFlash(this.conditions.time, last, this.battleNow(), nearest);
  }

  /**
   * Who can see whom (fog of war): a surfaced ship is seen inside the other side's vision, a
   * submerged boat only on its sonar. Hidden enemies are not drawn and can't be targeted.
   */
  private updateDetection(): void {
    const playerHunters = this.hunters(this.playerSide());
    const enemyHunters = this.hunters(this.enemies);
    const playerSight = this.visionSources(this.playerSide(), this.playerRecon, this.playerAir);
    const enemySight = this.visionSources(this.enemies, this.enemyRecon, this.enemyAir);
    this.seenByPlayer.clear();
    this.seenByEnemy.clear();

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const seen = enemy.submerged
        ? isDetected(enemy, playerHunters)
        : isVisible(enemy.x, enemy.y, playerSight) || this.flashed(enemy, this.enemyWeapons, this.playerSide());
      if (seen) this.seenByPlayer.add(enemy);
      enemy.setVisible(seen).setAlpha(enemy.submerged ? SUBMERGED_ALPHA : 1);
    }
    for (const ship of this.playerSide()) {
      if (!ship.isAlive) continue;
      const seen = ship.submerged
        ? isDetected(ship, enemyHunters)
        : isVisible(ship.x, ship.y, enemySight) || this.flashed(ship, this.playerWeapons, this.enemies);
      if (seen) this.seenByEnemy.add(ship);
      ship.setAlpha(ship.submerged ? SUBMERGED_ALPHA : 1);
    }
    if (this.lockedTarget && !this.seenByPlayer.has(this.lockedTarget)) this.lockedTarget = null;
    this.drawLastSeen();
    this.fog.update(playerSight);
  }

  /** Expanding sonar rings around player hunters while an enemy boat is submerged. */
  private drawSonar(time: number): void {
    const g = this.sonarRings;
    g.clear();
    if (!this.enemies.some((e) => e.isAlive && e.submerged)) return;
    const phase = (time % SONAR_PING_MS) / SONAR_PING_MS;
    for (const ship of this.friendlies()) {
      const range = sonarRange(ship.stats.shipClass) * ship.mods.sonarMul;
      if (!ship.isAlive || ship.submerged || range <= 0) continue;
      g.lineStyle(1.5, Colors.cyan, 0.35 * (1 - phase));
      g.strokeCircle(ship.x, ship.y, range * phase);
      g.lineStyle(1, Colors.cyan, 0.12);
      g.strokeCircle(ship.x, ship.y, range);
    }
  }

  private toggleDive(): void {
    const sub = this.flagship.sub;
    if (!sub) return;
    if (!this.wantDive && !canDive(sub)) return;
    this.wantDive = !this.wantDive;
  }

  private refreshDiveUi(): void {
    const sub = this.flagship.sub;
    if (!sub || !this.diveBtn || !this.diveText) return;
    this.diveBtn.setLabel(sub.submerged ? '浮上' : '潜航').setVariant(sub.submerged ? 'primary' : 'secondary');
    this.diveBtn.setEnabled(sub.submerged || canDive(sub));
    const air = Math.round(sub.air * 100);
    const state = sub.submerged ? '潜航中' : sub.forcedSurface ? '緊急浮上 · 換気中' : '浮上';
    this.diveText.setText(`${state}  ·  酸素 ${air}%`).setColor(sub.air < 0.25 ? Css.danger : Css.cyan);
  }

  /** Rain in storms, and a chip naming the conditions. */
  private addWeatherEffects(): void {
    const c = this.conditions;
    if (c.weather === Weather.Storm) {
      this.add
        .particles(0, 0, 'particle', {
          x: { min: -100, max: CANVAS_W + 100 },
          y: -20,
          angle: 105,
          speed: { min: 700, max: 900 },
          lifespan: IS_PORTRAIT ? 1700 : 1000,
          scaleX: 0.4,
          scaleY: 3,
          alpha: { start: 0.35, end: 0.1 },
          tint: 0xbfd6ee,
          quantity: 3,
          frequency: 16,
        })
        .setScrollFactor(0)
        .setDepth(DEPTH_HUD - 4);
    }
    this.muteBtn = new UIButton(this, 20 + 50, IS_PORTRAIT ? 286 : 122, '', () => this.toggleMute(), {
      variant: 'secondary', width: 100, height: IS_PORTRAIT ? 44 : 30, fontSize: 12,
    });
    this.muteBtn.setScrollFactor(0).setDepth(DEPTH_HUD + 2);
    this.refreshMute();
    if (this.objective !== Objective.Annihilate) {
      this.objectiveText = this.add
        .text(IS_PORTRAIT ? 20 : 140, IS_PORTRAIT ? 316 : 84, '', textStyle(12, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH_HUD + 2);
    }
    const label = `${WEATHER_LABEL[c.weather]}  ·  ${TIME_LABEL[c.time]}`;
    addChip(this, 20, IS_PORTRAIT ? 236 : 84, label, c.time === TimeOfDay.Night ? Colors.blue : Colors.cyan, c.time === TimeOfDay.Night ? Css.blue : Css.cyan)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 2);
  }

  private toggleMute(): void {
    audio.setMuted(!audio.muted);
    this.refreshMute();
  }

  private refreshMute(): void {
    this.muteBtn?.setLabel(audio.muted ? (this.isTouch ? '音 OFF' : '音 OFF [M]') : this.isTouch ? '音 ON' : '音 ON  [M]');
  }

  // -------------------------------------------------------------------------
  // Carrier aviation
  // -------------------------------------------------------------------------

  private updateAir(time: number, delta: number, playerView: IShipView[], enemyView: IShipView[]): void {
    const pick = (nation: Nation) => (carrier: BaseShip, foes: IShipView[]): IShipView | null =>
      chooseTarget(aiSelf(carrier), foes, TACTICS[nation]);
    // The player's own carrier strikes on command, unless touch / AUTO play is handling the fighting.
    const playerAuto = (carrier: BaseShip): boolean => carrier !== this.flagship || this.isTouch || this.autoMode;
    this.playerAir.update(
      time,
      delta,
      { foes: enemyView, foeSquadrons: this.enemyAir.squadrons, foeGuns: aaGuns(this.enemies) },
      playerAuto,
      (carrier, foes) => {
        // Only a target the player locked overrides the choice (AUTO's nearest ship is often just an escort).
        if (carrier === this.flagship) {
          const locked = foes.find((f) => f.ship === this.lockedTarget);
          if (locked) return locked;
        }
        // With target ships to sink, strikes go for them when they are in sight; otherwise strike what is
        // visible rather than hold (holding let the enemy's carriers strike first, #23).
        if (this.scenarioTargets.length > 0) {
          const wanted = foes.filter((f) => this.scenarioTargets.includes(f.ship));
          if (wanted.length > 0) return pick(this.playerNation)(carrier, wanted);
        }
        return pick(this.playerNation)(carrier, foes);
      },
    );
    // A damaged airfield re-arms slower (#83).
    for (const t of this.landTargets) {
      const wing = this.enemyAir.wing(t);
      if (wing) wing.rearmMs = airfieldRearmMs(REARM_MS, t.stats.currentHp / Math.max(1, t.stats.maxHp));
    }
    this.enemyAir.update(
      time,
      delta,
      { foes: playerView, foeSquadrons: this.playerAir.squadrons, foeGuns: aaGuns(this.playerSide()) },
      () => true,
      pick(this.enemyNation),
    );
  }

  /** F / strike button: send the flagship's ready bombers at the current target. */
  private launchPlayerStrike(): void {
    if (this.gameOver || !this.playerAir.hasCarrier(this.flagship)) return;
    const enemyView = this.enemies.map((s) => shipView(s, this.seenByPlayer.has(s)));
    const targets = this.playerAir.strikeTargets(this.flagship, enemyView);
    const target =
      targets.find((t) => t.ship === this.currentTarget()) ?? chooseTarget(aiSelf(this.flagship), targets, TACTICS[this.playerNation]);
    if (target) this.playerAir.launchStrike(this.flagship, target.ship);
  }

  private refreshAirUi(): void {
    const wing = this.playerAir.wing(this.flagship);
    if (!wing || !this.airText || !this.strikeBtn) return;
    const r = wing.ready;
    const rearming = wing.rearming.reduce((n, x) => n + x.count, 0);
    const extra = rearming > 0 ? `  ·  再装備 ${rearming}` : '';
    this.airText.setText(`戦 ${r[AircraftType.Fighter]}  爆 ${r[AircraftType.DiveBomber]}  攻 ${r[AircraftType.TorpedoBomber]}${extra}`);
    const bombers = r[AircraftType.DiveBomber] + r[AircraftType.TorpedoBomber];
    this.strikeBtn.setEnabled(bombers > 0);
    // Light the button up when a strike can actually go: bombers ready and an enemy in strike range.
    const view = this.enemies.map((s) => shipView(s, this.seenByPlayer.has(s)));
    const canStrike = bombers > 0 && !this.playerAir.strikeAloft(this.flagship) && this.playerAir.strikeTargets(this.flagship, view).length > 0;
    if (canStrike !== this.strikeReady) {
      this.strikeReady = canStrike;
      this.strikeBtn.setVariant(canStrike ? 'gold' : 'secondary');
    }
  }

  /** A depth charge went off: area damage to every ship of the target side in the blast. */
  private onDepthCharge(x: number, y: number, weapon: IWeaponData, targets: BaseShip[], source: BaseShip | null = null): void {
    this.splash.play(x, y, 1.6);
    this.sound3d('depthCharge', x, y);
    for (const ship of targets) {
      if (!ship.isAlive) continue;
      const f = depthChargeFalloff(Phaser.Math.Distance.Between(x, y, ship.x, ship.y), DEPTH_CHARGE_RADIUS);
      if (f <= 0) continue;
      const dmg = CombatSystem.calculateDamage(weapon, ship.stats.shipClass, ship.stats.armor) * f;
      CombatSystem.applyDamage(ship, dmg, source);
      this.rollCritical(ship, weapon, dmg);
      this.explosion.play(ship.x, ship.y);
    }
  }

  // -------------------------------------------------------------------------
  // Player input
  // -------------------------------------------------------------------------

  private setupInput(): void {
    // The stick can be turned off in the settings (#46); sea taps and AUTO still move the flagship.
    this.joystick = this.isTouch && audio.settings.joystick ? new VirtualJoystick(this, JOYSTICK_POS.x, JOYSTICK_POS.y, JOYSTICK_RADIUS) : null;

    const kb = this.input.keyboard!;
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    kb.on('keydown-Q', () => !this.paused && this.toggleDive());
    kb.on('keydown-E', () => !this.paused && this.fireTorpedoes());
    kb.on('keydown-F', () => !this.paused && this.launchPlayerStrike());
    kb.on('keydown-P', () => this.setPaused(!this.paused));
    kb.on('keydown-ESC', () => this.setPaused(!this.paused));
    // Leaving the tab or locking the phone pauses the battle (#79).
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this));
    kb.on('keydown-M', () => this.toggleMute());
  }

  private setupClickFire(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // Taps on HUD buttons or the stick are not commands.
      if (over.length > 0 || this.joystick?.owns(pointer)) return;
      if (pointer.wasTouch) {
        this.onSeaTap(pointer.worldX, pointer.worldY);
        return;
      }
      if (!pointer.leftButtonDown()) return;
      // Mouse: aim tracks the cursor, click fires.
      this.aimTarget = { x: pointer.worldX, y: pointer.worldY };
      this.updateAim();
      if (this.flagship.submerged && weaponKind(this.playerWeapon) !== WeaponKind.Torpedo) return;
      this.playerWeapons.fireWeapon(this.flagship, this.playerWeapon, this.aimAngle, this.battleNow());
    });
  }

  /** E / torpedo button: launch every torpedo mount toward the aim point (or the target on touch). */
  private fireTorpedoes(): void {
    const torpedoes = this.flagship.loadout.filter((w) => weaponKind(w) === WeaponKind.Torpedo);
    if (torpedoes.length === 0 || this.gameOver) return;
    const target = this.isTouch || this.autoMode ? this.currentTarget() : null;
    // Torpedoes run on the water (#278): a land target is no aim for them.
    if (target?.isLand) return;
    const angle = target ? angleBetween(this.flagship.x, this.flagship.y, target.x, target.y) : this.aimAngle;
    for (const w of torpedoes) this.playerWeapons.fireWeapon(this.flagship, w, angle, this.battleNow());
  }

  /** Touch: tapping an enemy locks it as the target; tapping open sea sails there (and leaves AUTO). */
  private onSeaTap(x: number, y: number): void {
    const hit = hitTestTarget({ x, y }, this.targetCandidates(), TAP_TARGET_RADIUS);
    if (hit) {
      this.lockedTarget = hit.ship;
      return;
    }
    this.waypoint = { x, y };
    if (this.autoMode) this.setAutoMode(false);
  }

  /** Enemies the player can currently see (submerged boats off sonar are not candidates). */
  private targetCandidates(): Array<{ x: number; y: number; alive: boolean; ship: BaseShip }> {
    return this.enemies.map((ship) => ({ x: ship.x, y: ship.y, alive: ship.isAlive && this.seenByPlayer.has(ship), ship }));
  }

  /** The locked enemy while it lives, otherwise the nearest one. */
  private currentTarget(): BaseShip | null {
    if (this.lockedTarget && !this.lockedTarget.isAlive) this.lockedTarget = null;
    const candidates = this.targetCandidates();
    const locked = candidates.find((c) => c.ship === this.lockedTarget) ?? null;
    return pickTarget(this.flagship, candidates, locked)?.ship ?? null;
  }

  /** Touch / AUTO: every weapon that can engage the target fires on its own. */
  private autoFire(target: BaseShip, enemyView: IShipView[], time: number): void {
    const view = enemyView.find((v) => v.ship === target);
    if (view) fireAt(this.playerWeapons, this.flagship, view, TACTICS[this.playerNation].torpedoEagerness, time, AUTO_AIM_ERROR);
  }

  /** Mouse play: the click fires the main gun, secondary guns engage the nearest target on their own. */
  private autoSecondaries(target: BaseShip, enemyView: IShipView[], time: number): void {
    const view = enemyView.find((v) => v.ship === target);
    if (!view || this.flagship.submerged) return;
    const distance = Phaser.Math.Distance.Between(this.flagship.x, this.flagship.y, target.x, target.y);
    for (const w of this.flagship.loadout) {
      if (w === this.playerWeapon || weaponKind(w) !== WeaponKind.Gun || distance > w.range) continue;
      this.playerWeapons.fireWeapon(this.flagship, w, angleBetween(this.flagship.x, this.flagship.y, target.x, target.y), time);
    }
  }

  /** Depth charges always roll automatically when the flagship passes over a detected boat. */
  private autoDepthCharge(enemyView: IShipView[], time: number): void {
    for (const v of enemyView) {
      if (!v.alive || !v.detected || !v.submerged) continue;
      const distance = Phaser.Math.Distance.Between(this.flagship.x, this.flagship.y, v.x, v.y);
      const charges = selectWeapons(this.flagship.loadout, { distance, targetSubmerged: true, shooterSubmerged: this.flagship.submerged });
      for (const w of charges) this.playerWeapons.fireWeapon(this.flagship, w, 0, time);
    }
  }

  private setAutoMode(on: boolean): void {
    this.autoMode = on;
    if (on) this.waypoint = null;
    this.autoBtn.setLabel(on ? '自動  ON' : '自動  OFF').setVariant(on ? 'primary' : 'secondary');
  }

  private setupOverlaps(): void {
    const enemyObjs = this.enemies as unknown as Phaser.GameObjects.GameObject[];
    const friendlyObjs = this.playerSide() as unknown as Phaser.GameObjects.GameObject[];
    const hit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (p, s) => {
      this.onProjectileHit(p as unknown as BaseProjectile, s as unknown as BaseShip);
    };
    // The projectile arrays grow in place as new projectiles are created, so the colliders keep up.
    this.physics.add.overlap(this.playerWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], enemyObjs, hit);
    this.physics.add.overlap(this.enemyWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], friendlyObjs, hit);
    // Land stops ships and torpedoes; shells fly over it (so shore targets can be shelled).
    const ships = [...this.playerSide(), ...this.enemies.filter((e) => !e.isLand)] as unknown as Phaser.GameObjects.GameObject[];
    this.physics.add.collider(ships, this.islands);
    const intoLand: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (p) => {
      const projectile = p as unknown as BaseProjectile;
      if (!projectile.active || !(projectile instanceof Torpedo)) return;
      this.explosion.play(projectile.x, projectile.y);
      projectile.deactivate();
    };
    for (const ws of [this.playerWeapons, this.enemyWeapons]) {
      this.physics.add.overlap(ws.projectiles as unknown as Phaser.GameObjects.GameObject[], this.islands, intoLand);
    }
  }

  private onProjectileHit(projectile: BaseProjectile, target: BaseShip): void {
    // Shells and torpedoes pass over a submerged boat; torpedoes can't reach shore targets.
    if (!projectile.active || !target.isAlive || target.submerged) return;
    if (target.isLand && projectile instanceof Torpedo) return;
    // A practised crew dodges some shots: roll once per projectile and ship.
    if (projectile.missed.has(target)) return;
    if (Math.random() < evadeChance(target.stats.proficiency ?? 0) + target.mods.evadeAdd) {
      projectile.missed.add(target);
      return;
    }
    const fired = projectile.weapon ?? FALLBACK_WEAPON;
    // 弾種 (#48): a gun's shell is AP or HE by the firing ship's choice (AUTO picks by the target).
    const shell = effectiveShell(fired.type, projectile.source?.shellMode ?? 'auto', target.stats.shipClass);
    const weapon = shell === fired.type ? fired : { ...fired, type: shell };
    const dmg = CombatSystem.calculateDamage(weapon, target.stats.shipClass, target.stats.armor);
    const hpBefore = target.stats.currentHp / Math.max(1, target.stats.maxHp);
    CombatSystem.applyDamage(target, dmg, projectile.source);
    if (target === this.superweapon) this.breakParts(target, hpBefore);
    this.rollCritical(target, weapon, dmg);
    this.rollFireOrFlood(target, weapon);
    projectile.deactivate();
    this.explosion.play(projectile.x, projectile.y);
    this.sound3d('explosion', projectile.x, projectile.y);
  }

  /** Plays a sound attenuated by its distance from the middle of the screen. */
  private sound3d(kind: SoundKind, x: number, y: number): void {
    const v = this.cameras.main.worldView;
    audio.play(kind, Phaser.Math.Distance.Between(x, y, v.centerX, v.centerY));
  }

  /** Damage dealt per weapon id this battle, by side (balance tuning, read by dev smoke tests). */
  readonly damageLog: Record<'player' | 'enemy', Record<string, number>> = { player: {}, enemy: {} };

  private logDamage(target: BaseShip, weapon: IWeaponData, dmg: number): void {
    const side = this.enemies.includes(target) ? 'player' : 'enemy';
    this.damageLog[side][weapon.id] = (this.damageLog[side][weapon.id] ?? 0) + Math.round(dmg);
  }

  /** 超兵器 (#148): parts give way as it is worn down, each for the rest of the battle. */
  private breakParts(ship: BaseShip, hpBefore: number): void {
    if (!ship.isAlive) return;
    for (const part of newlyBroken(hpBefore, ship.stats.currentHp / Math.max(1, ship.stats.maxHp))) {
      const crit = PART_CRITICAL[part];
      if (crit) ship.criticals = { ...ship.criticals, [crit]: Number.POSITIVE_INFINITY };
      else ship.aimErrorMul *= BRIDGE_AIM_MUL;
      const t = this.add
        .text(ship.x, ship.y - 70, PART_LABEL[part], textStyle(16, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4 }))
        .setOrigin(0.5)
        .setDepth(DEPTH_HUD - 2);
      this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
  }

  /** 火災・浸水 (#48): a hit may start a fire (HE, bombs) or flooding (torpedoes); damage control shortens them. */
  private rollFireOrFlood(target: BaseShip, weapon: IWeaponData): void {
    if (!target.isAlive || target.isLand) return;
    const kind = rollStatus(weapon.type, Math.random, target.mods.fireFloodMul);
    if (!kind) return;
    target.status = applyStatus(target.status, kind, this.battleNow(), target.mods.fireFloodMul);
    const friendly = this.playerSide().includes(target);
    if (!friendly) this.firesSet++;
    if (!target.visible) return;
    const t = this.add
      .text(target.x, target.y - 46, STATUS_LABEL[kind], textStyle(13, friendly ? Css.danger : Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD - 2);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Fires and flooding burn every ship each frame (#48), credited to whoever caused them. */
  private burnAndFlood(delta: number): void {
    const now = this.battleNow();
    for (const s of [...this.playerSide(), ...this.enemies]) {
      if (!s.isAlive || s.isLand) continue;
      const dmg = statusDamage(s.status, now, delta, s.stats.maxHp);
      if (dmg > 0) s.takeDamage(dmg);
    }
  }

  /** Each kind of weapon the flagship carries and how far it has reloaded (#81): 主砲 / 副砲 / 魚雷 / 爆雷. */
  private weaponStates(time: number): Array<{ label: string; progress: number }> {
    const out: Array<{ label: string; progress: number }> = [];
    let guns = 0;
    for (const w of this.flagship.loadout) {
      const kind = weaponKind(w);
      const label = kind === WeaponKind.Gun ? (guns++ === 0 ? '主砲' : '副砲') : kind === WeaponKind.Torpedo ? '魚雷' : kind === WeaponKind.DepthCharge ? '爆雷' : '';
      if (!label || out.some((o) => o.label === label)) continue;
      out.push({ label, progress: this.playerWeapons.reloadProgress(this.flagship, w, time) });
    }
    return out;
  }

  /** 弾種 (#48): AUTO → 徹甲弾 → 榴弾; the guns reload when the shells change. */
  cycleShells(): void {
    if (!this.flagship?.isAlive) return;
    this.flagship.shellMode = nextShellMode(this.flagship.shellMode);
    this.playerWeapons.restartReload(this.flagship, this.flagship.loadout, this.battleNow());
    for (const e of this.escorts) e.shellMode = this.flagship.shellMode;
  }

  /** A hit may knock out a component; show it over the ship. */
  private rollCritical(target: BaseShip, weapon: IWeaponData, dmg: number): void {
    this.logDamage(target, weapon, dmg);
    if (!target.isAlive) return;
    const crit = rollCriticalHit(weapon.type, dmg, target.stats.maxHp, Math.random, target.isLand);
    if (!crit) return;
    target.criticals = applyCritical(target.criticals, crit, this.battleNow());
    if (!target.visible) return;
    const friendly = this.playerSide().includes(target);
    const t = this.add
      .text(target.x, target.y - 30, target.isLand ? LAND_CRITICAL_LABEL : CRITICAL_LABEL[crit], textStyle(13, friendly ? Css.danger : Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD - 2);
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /**
   * Priority: joystick > keyboard > AUTO > tap waypoint > coast. Manual input cancels a waypoint but
   * leaves AUTO on, so a quick dodge with the stick hands control back afterwards.
   */
  private handleMovement(delta: number, target: BaseShip | null): void {
    const body = this.flagship.body as Phaser.Physics.Arcade.Body;
    const dtSec = delta / 1000;
    const spd = this.flagship.currentSpeed;

    const stick = this.joystick?.value;
    if (stick && stick.magnitude > 0) {
      // Touch: steer toward the stick direction, throttle by how far it is pushed.
      this.waypoint = null;
      const targetDeg = Phaser.Math.RadToDeg(Math.atan2(stick.y, stick.x)) + 90;
      // The stick is direct control: no automatic land avoidance.
      this.flagship.steer({ headingDeg: targetDeg, throttle: stick.magnitude }, dtSec, SHIP_ROTATE_SPEED, false);
      return;
    }

    const keys = this.wasd;
    if (keys.W.isDown || keys.A.isDown || keys.S.isDown || keys.D.isDown) {
      this.waypoint = null;
      const turn = SHIP_ROTATE_SPEED * this.flagship.critEffects().turnMul * dtSec;
      if (keys.A.isDown) {
        this.flagship.angle -= turn;
      } else if (keys.D.isDown) {
        this.flagship.angle += turn;
      }
      const rad = Phaser.Math.DegToRad(this.flagship.angle - 90);
      if (keys.W.isDown) {
        body.setVelocity(Math.cos(rad) * spd, Math.sin(rad) * spd);
      } else if (keys.S.isDown) {
        body.setVelocity(-Math.cos(rad) * spd * 0.5, -Math.sin(rad) * spd * 0.5);
      }
      return;
    }

    const zone = this.side?.zone;
    if (this.autoMode && zone && this.objective === Objective.Breakthrough) {
      // Breakthrough: AUTO makes for the zone and fights on the way.
      const goal = placeAt(zone, WORLD.w, WORLD.h);
      this.flagship.steer({ headingDeg: headingTo(this.flagship, goal), throttle: 1 }, dtSec, SHIP_ROTATE_SPEED);
      return;
    }

    if (this.autoMode && target) {
      // A carrier fights with its aircraft and keeps well clear of the enemy's guns.
      const range = this.playerAir.hasCarrier(this.flagship) ? CARRIER_STANDOFF : this.playerWeapon.range * AUTO_RANGE_FRACTION;
      this.flagship.steer(engageSteer(this.flagship, target, range, WORLD_BOUNDS, AUTO_EDGE_MARGIN), dtSec, SHIP_ROTATE_SPEED);
      return;
    }

    if (this.autoMode) {
      // Nothing in sight: search towards the middle of the sea.
      const centre = { x: WORLD.w / 2, y: WORLD.h / 2 };
      const s = waypointSteer(this.flagship, centre, 200);
      if (s) {
        this.flagship.steer({ ...s, throttle: Math.min(s.throttle, 0.7) }, dtSec, SHIP_ROTATE_SPEED);
        return;
      }
    }

    if (this.waypoint) {
      const s = waypointSteer(this.flagship, this.waypoint, WAYPOINT_ARRIVE_RADIUS);
      if (s) {
        this.flagship.steer(s, dtSec, SHIP_ROTATE_SPEED);
        return;
      }
      this.waypoint = null;
    }

    body.setVelocity(body.velocity.x * (1 - 5 * dtSec), body.velocity.y * (1 - 5 * dtSec));
  }

  // -------------------------------------------------------------------------
  // Overlay UI
  // -------------------------------------------------------------------------

  private onHidden(): void {
    this.setPaused(true);
  }

  private buildOverlayUi(): void {
    const b = TOP_BUTTON;
    const pw = IS_PORTRAIT ? 140 : 110;
    // Portrait: top centre between 撤退 and 自動; landscape: next to 撤退, clear of the status bar in the middle.
    const px = IS_PORTRAIT ? CANVAS_W / 2 : 20 + b.w + 10 + pw / 2;
    new UIButton(this, px, b.y, this.isTouch ? '一時停止' : '一時停止 [P]', () => this.setPaused(true), {
      variant: 'secondary', width: pw, height: b.h, fontSize: IS_PORTRAIT ? 15 : 13,
    }).setDepth(DEPTH_HUD + 2).setScrollFactor(0);
    // 撤退 asks first (#279): it ends the whole sortie, so it goes through the pause sheet.
    new UIButton(this, 20 + b.w / 2, b.y, '‹  撤退', () => this.setPaused(true), {
      variant: 'secondary',
      width: b.w,
      height: b.h,
      fontSize: 15,
    }).setDepth(DEPTH_HUD + 2).setScrollFactor(0);

    this.autoBtn = new UIButton(this, CANVAS_W - 20 - b.w / 2, b.y, '自動  OFF', () => this.setAutoMode(!this.autoMode), {
      variant: 'secondary',
      width: b.w,
      height: b.h,
      fontSize: 15,
    });
    this.autoBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);

    this.buildActionButtons();

    if (this.isTouch) {
      const hint = addChip(this, 0, CANVAS_H - 36, '敵をタップ: 目標  /  海をタップ: 移動', Colors.cyan, Css.cyan);
      hint.setX(CANVAS_W - 20 - hint.getBounds().width).setDepth(DEPTH_HUD).setScrollFactor(0);
    }

    this.sonarRings = this.add.graphics().setDepth(DEPTH_WATER_FX);
    this.lastSeenMarks = this.add.graphics().setDepth(DEPTH_WATER_FX + 1);
    this.reticle = this.add.graphics().setDepth(DEPTH_HUD - 1);
    this.edgeMarkers = this.add.graphics().setDepth(DEPTH_HUD - 1).setScrollFactor(0);
  }

  /** Torpedo button when the flagship carries torpedoes, dive button and air readout for a submarine. */
  private buildActionButtons(): void {
    const a = ACTION_BUTTON;
    const x = CANVAS_W - 20 - a.w / 2;
    let y = CANVAS_H - a.bottom - a.h / 2;
    const keyHint = !this.isTouch;
    const opts = { variant: 'secondary' as const, width: a.w, height: a.h, fontSize: 15 };

    if (this.flagship.loadout.some((w) => weaponKind(w) === WeaponKind.Torpedo)) {
      new UIButton(this, x, y, keyHint ? '魚雷  [E]' : '魚雷', () => this.fireTorpedoes(), opts)
        .setDepth(DEPTH_HUD + 2)
        .setScrollFactor(0);
      y -= a.h + a.gap;
    }
    if (this.playerAir.hasCarrier(this.flagship)) {
      this.strikeBtn = new UIButton(this, x, y, keyHint ? '攻撃隊  [F]' : '攻撃隊発艦', () => this.launchPlayerStrike(), opts);
      this.strikeBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);
      this.airText = this.add
        .text(x + a.w / 2, y - a.h / 2 - 8, '', textStyle(12, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
        .setOrigin(1, 1)
        .setDepth(DEPTH_HUD + 2)
        .setScrollFactor(0);
      y -= a.h + a.gap;
    }
    // 弾種 (#48): ships with guns can force AP or HE (AUTO picks by the target).
    if (!this.flagship.sub && this.flagship.loadout.some((w) => weaponKind(w) === WeaponKind.Gun)) {
      const shellBtn = new UIButton(this, x, y, SHELL_LABEL[this.flagship.shellMode], () => {
        this.cycleShells();
        shellBtn.setLabel(SHELL_LABEL[this.flagship.shellMode]);
      }, opts);
      shellBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);
      y -= a.h + a.gap;
    }
    if (this.flagship.sub) {
      this.diveBtn = new UIButton(this, x, y, '潜航', () => this.toggleDive(), opts);
      this.diveBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);
      this.diveText = this.add
        .text(x + a.w / 2, y - a.h / 2 - 8, '', textStyle(12, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
        .setOrigin(1, 1)
        .setDepth(DEPTH_HUD + 2)
        .setScrollFactor(0);
      if (keyHint) this.diveBtn.setLabel('潜航  [Q]');
    }
  }

  /** Red arrows on the screen border pointing at enemies the camera can't see. */
  private drawEdgeMarkers(): void {
    const g = this.edgeMarkers;
    g.clear();
    const view = this.cameras.main.worldView;
    const size = IS_PORTRAIT ? 18 : 13;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive || !this.seenByPlayer.has(enemy)) continue;
      const edge = edgePoint(enemy.x - view.x, enemy.y - view.y, VIEW_INSET);
      if (!edge) continue;
      const { x, y, angle } = edge;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      g.fillStyle(enemy === this.lockedTarget ? Colors.gold : Colors.danger, 0.9);
      g.fillTriangle(
        x + cos * size, y + sin * size,
        x - cos * size * 0.6 - sin * size * 0.7, y - sin * size * 0.6 + cos * size * 0.7,
        x - cos * size * 0.6 + sin * size * 0.7, y - sin * size * 0.6 - cos * size * 0.7,
      );
    }
  }

  /** Mouse: crosshair at the cursor. Touch / AUTO: brackets on the target and the waypoint marker. */
  private drawReticle(): void {
    const g = this.reticle;
    g.clear();
    const ready = this.playerWeapons.reloadProgress(this.flagship, this.playerWeapon, this.battleNow()) >= 1;

    if (!this.isTouch) {
      const { x, y } = this.aimTarget;
      const color = ready ? Colors.cyan : Colors.muted;
      g.lineStyle(1.5, color, ready ? 0.9 : 0.5);
      g.strokeCircle(x, y, 14);
      g.lineBetween(x - 22, y, x - 8, y);
      g.lineBetween(x + 8, y, x + 22, y);
      g.lineBetween(x, y - 22, x, y - 8);
      g.lineBetween(x, y + 8, x, y + 22);
      g.fillStyle(color, 0.9);
      g.fillCircle(x, y, 2);
    }

    if (this.isTouch || this.autoMode) {
      const target = this.currentTarget();
      if (target) {
        const locked = target === this.lockedTarget;
        const inGunRange = inRange(this.flagship, target, this.playerWeapon.range);
        const color = locked ? Colors.gold : Colors.danger;
        const r = Math.max(target.displayWidth, target.displayHeight) / 2 + 10;
        const arm = 10;
        g.lineStyle(locked ? 3 : 2, color, inGunRange ? 1 : 0.5);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const cx = target.x + sx * r;
          const cy = target.y + sy * r;
          g.lineBetween(cx, cy, cx - sx * arm, cy);
          g.lineBetween(cx, cy, cx, cy - sy * arm);
        }
      }
    }

    if (this.waypoint) {
      const { x, y } = this.waypoint;
      g.lineStyle(1.5, Colors.cyan, 0.25);
      g.lineBetween(this.flagship.x, this.flagship.y, x, y);
      g.lineStyle(2, Colors.cyan, 0.9);
      g.strokeCircle(x, y, 16);
      g.fillStyle(Colors.cyan, 0.9);
      g.fillCircle(x, y, 3);
    }
  }

  private updateAim(): void {
    this.aimAngle = angleBetween(this.flagship.x, this.flagship.y, this.aimTarget.x, this.aimTarget.y);
  }

  private objectiveState(): IObjectiveState {
    const zone = this.side?.zone;
    const warships = this.enemies.filter((e) => !e.isLand);
    return {
      flagshipAlive: this.flagship.isAlive,
      enemiesAlive: warships.filter((e) => e.isAlive).length,
      enemiesTotal: warships.length,
      convoyTotal: this.convoy.length,
      convoyEscaped: this.convoyEscaped,
      convoyLost: this.convoy.filter((c) => c.stats.currentHp <= 0).length,
      convoyHp: this.convoy.reduce((n, c) => n + Math.max(0, c.stats.currentHp), 0),
      convoyMaxHp: this.convoy.reduce((n, c) => n + c.stats.maxHp, 0),
      landTargetsAlive: this.landTargets.filter((t) => t.isAlive).length,
      targetsAlive: this.scenarioTargets.filter((t) => t.isAlive).length,
      flagshipInZone: zone ? inZone(this.flagship.x, this.flagship.y, zone, WORLD.w, WORLD.h) : false,
      enemyInZone: zone ? this.scenarioTargets.some((t) => t.isAlive && inZone(t.x, t.y, zone, WORLD.w, WORLD.h)) : false,
      elapsedSec: this.elapsedSec(),
      timeLimitSec: this.side?.timeLimitSec ?? 0,
    };
  }

  private checkWinLoss(): void {
    const state = this.objectiveState();
    const status = objectiveStatus(this.objective, state);
    if (status && this.objectiveText && this.objectiveText.text !== status) this.objectiveText.setText(status);
    const outcome = evaluateObjective(this.objective, state);
    if (outcome) this.triggerGameOver(outcome === 'victory');
  }

  /** Gives every captain in the fleet their battle XP and saves it. */
  private awardCaptains(victory: boolean, enemiesSunk: number): ICaptainReport[] {
    if (this.captains.size === 0) return [];
    const progress = loadProgress();
    const captainXp = { ...progress.captainXp };
    const captainStats = { ...progress.captainStats };
    const reports: ICaptainReport[] = [];
    let levels = 0;
    const night = this.conditions.time === TimeOfDay.Night;
    for (const [ship, captain] of this.captains) {
      // What this captain's own ship sank (#199): the fleet's other kills no longer count for them.
      const own = this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy && e.lastHitBy === ship);
      const ownSubs = own.filter((e) => e.stats.shipClass === ShipClass.Submarine).length;
      // 熟練度ブースト (#89) raises captain XP too.
      const gained = Math.round(battleXp({ victory, enemiesSunk, flagship: ship === this.flagship, survived: ship.isAlive }) * this.battleEvent.xpMul);
      const award = awardXp(captain, gained);
      captainXp[captain.id] = award.captain.xp;
      levels += award.captain.level - captain.level;
      // What traits count (#45): the fleet's sinks, and coming home 大破.
      const heavySurvival = ship.isAlive && ship.stats.maxHp > 0 && ship.stats.currentHp / ship.stats.maxHp <= 0.25;
      const before = earnedTraits(captainStats[captain.id]).length;
      captainStats[captain.id] = addBattleStats(captainStats[captain.id], { night, sunk: own.length, subsSunk: ownSubs, heavySurvival });
      const traits = earnedTraits(captainStats[captain.id]);
      const newTrait = traits.length > before ? traits[traits.length - 1] : undefined;
      const notes = [...levelUpNotes(captain, award.captain), ...(newTrait ? [`特性「${newTrait.name}」獲得`] : [])];
      reports.push({
        name: `${captain.name}${own.length > 0 ? ` 撃沈 ${own.length}` : ''}${notes.length > 0 ? ` (${notes.join('・')})` : ''}`,
        level: award.captain.level, gained, leveledUp: award.leveledUp, maxed: captain.level >= MAX_LEVEL,
      });
    }
    // Historical scenarios are exhibitions: nothing carries over.
    if (!this.scenario) saveProgress(withQuestEvents({ ...progress, captainXp, captainStats }, [['captainLevel', levels]], Date.now()));
    return reports;
  }

  /** The battle clock (ms): game-loop time without the time spent paused (#79). */
  private battleNow(): number {
    return (this.paused ? this.pauseStartedAt : this.game.loop.time) - this.pausedMs;
  }

  /** Seconds since the first battle frame, on the battle clock. */
  private elapsedSec(): number {
    return this.battleStartedAt < 0 ? 0 : (this.battleNow() - this.battleStartedAt) / 1000;
  }

  /** Stops (or resumes) the battle: physics, tweens, timers, AI and the battle clock (#79). */
  /** `menu` false pauses without the pause menu (another sheet, e.g. the tutorial, is on screen). */
  private setPaused(paused: boolean, menu = true): void {
    if (paused === this.paused || this.gameOver) return;
    if (paused) {
      this.pauseStartedAt = this.game.loop.time;
      this.paused = true;
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      if (menu) this.showPauseMenu();
    } else {
      this.pausedMs += this.game.loop.time - this.pauseStartedAt;
      this.paused = false;
      this.physics.world.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      for (const o of this.pauseLayer) o.destroy();
      this.pauseLayer = [];
    }
  }

  private showPauseMenu(): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH_HUD + 20);
      this.pauseLayer.push(o);
      return o;
    };
    // Swallows taps so the sea and HUD underneath don't react.
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.6).setOrigin(0, 0).setInteractive());
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 520;
    const h = IS_PORTRAIT ? 520 : 440;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.95, glow: 0.8 }));
    add(this.add.text(CANVAS_W / 2, y + 44, '一時停止中', displayStyle(IS_PORTRAIT ? 30 : 26)).setOrigin(0.5));
    // The objective and how the battle stands (#189).
    const fleet = this.friendlies();
    const area = (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId);
    // Which battle this is (#279), under the title; the objective lines follow as before.
    const [kind] = battleBanner({ areaName: area?.name, sortie: area ? this.battleData?.sortie : undefined, exercise: this.exercise && !area, scenarioName: this.scenario?.name, goal: '' });
    const kindText = add(this.add.text(CANVAS_W / 2, y + 72, kind, eyebrowStyle(11, Css.gold)).setOrigin(0.5, 0));
    if (kindText.width > w - 64) kindText.setScale((w - 64) / kindText.width);
    const campaign = this.battleData?.areaId !== undefined && !this.scenario;
    const lines = [
      ...pauseLines(this.objective, this.goalText(), this.objectiveState(), { alive: fleet.filter((f) => f.isAlive).length, total: fleet.length }),
      ...(campaign ? ['撤退すると、この出撃は終わります (それまでの報酬は残ります)'] : []),
    ];
    add(this.add.text(x + 32, y + 96, lines.join('\n'), textStyle(IS_PORTRAIT ? 15 : 14, Css.text, { lineSpacing: 8, wordWrap: { width: w - 64, useAdvancedWrap: true } })));
    const bh = IS_PORTRAIT ? 72 : 56;
    const retreatH = bh - 8;
    const retreatY = y + h - retreatH / 2 - 28;
    add(new UIButton(this, CANVAS_W / 2, retreatY - retreatH / 2 - 16 - bh / 2, '再開  ▶', () => this.setPaused(false), { variant: 'gold', width: w - 64, height: bh, fontSize: 20 }));
    add(new UIButton(this, CANVAS_W / 2, retreatY, '撤退する', () => this.retreat(), { variant: 'secondary', width: w - 64, height: retreatH, fontSize: 16 }));
  }

  /** The fleet as it sailed, weighed against the enemy's ships like the map does (#280). */
  private underdog(): boolean {
    const weigh = (ships: BaseShip[]): number => fleetPower(ships.map((s) => ({ hp: s.stats.maxHp, armor: s.stats.armor })));
    const enemy = weigh(this.enemies.filter((e) => !e.isLand));
    return enemy > 0 && weigh(this.friendlies()) <= enemy * UNDERDOG_RATIO;
  }

  /** Which battle this is and how it is won, for a few seconds as it opens (#279). */
  private showBattleBanner(): void {
    const area = (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId);
    const [kind, goal] = battleBanner({
      areaName: area?.name, sortie: area ? this.battleData?.sortie : undefined, exercise: this.exercise && !area,
      scenarioName: this.scenario?.name, goal: this.goalText(), timeLimitSec: this.side?.timeLimitSec,
    });
    const y = IS_PORTRAIT ? CANVAS_H * 0.32 : CANVAS_H * 0.28;
    const w = Math.min(CANVAS_W - 32, 760);
    const band = this.add.rectangle(CANVAS_W / 2, y, w, IS_PORTRAIT ? 110 : 92, Colors.bgDeep, 0.78).setScrollFactor(0).setDepth(DEPTH_HUD + 6);
    const t1 = this.add.text(CANVAS_W / 2, y - (IS_PORTRAIT ? 22 : 18), kind, textStyle(IS_PORTRAIT ? 20 : 20, Css.gold, { fontStyle: 'bold' })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 7);
    const t2 = this.add.text(CANVAS_W / 2, y + (IS_PORTRAIT ? 22 : 18), goal, textStyle(IS_PORTRAIT ? 14 : 15, Css.text, { align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true } })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 7);
    for (const t of [t1, t2]) if (t.width > w - 24) t.setScale((w - 24) / t.width);
    this.time.delayedCall(3000, () => this.tweens.add({ targets: [band, t1, t2], alpha: 0, duration: 500, onComplete: () => [band, t1, t2].forEach((o) => o.destroy()) }));
  }

  /** 撤退 (#279): a full withdrawal. The saved sortie ends (no 続きから), the fleet comes home and can be docked. */
  private retreat(): void {
    this.setPaused(false);
    const campaign = this.battleData?.areaId !== undefined && !this.scenario;
    endSortie(this);
    this.scene.start(campaign ? SceneKeys.CAMPAIGN : SceneKeys.FLEET_BUILDER);
  }

  /** The objective in the map's words (#189): the area's, a scenario side's with its brief, or a plain fight's. */
  private goalText(): string {
    if (this.scenarioSetup) return `${OBJECTIVE_LABEL[this.objective]} — ${this.scenarioSetup.side.brief}`;
    const area = (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId);
    if (area && this.side && (this.battleData?.sortie?.boss ?? true)) return objectiveText(area);
    return OBJECTIVE_LABEL[this.objective];
  }

  private triggerGameOver(victory: boolean): void {
    if (this.gameOver) return;
    this.gameOver = true;
    const fleet = this.friendlies();
    // Ships and land targets are counted apart (#278): 撃沈, 全滅 and 「6 隻以上に S」 count ships only.
    const enemyShips = this.enemies.filter((e) => !e.isLand);
    const enemiesSunk = enemyShips.filter((e) => !e.isAlive).length;
    const landKills = this.enemies.filter((e) => e.isLand && !e.isAlive).length;
    const areaId = this.battleData?.areaId;
    const area = areaId ? (campaignData as ICampaignData).areas.find((a) => a.id === areaId) : undefined;
    // The event running as the battle ends (#89).
    const event = this.scenario ? null : activeEvent();
    this.battleEvent = eventEffects(event);
    const result: IBattleResultData = {
      victory,
      score: 0,
      turnsElapsed: 0,
      enemiesSunk,
      enemiesTotal: enemyShips.length,
      landKills,
      landTotal: this.enemies.length - enemyShips.length,
      survivors: fleet.filter((s) => s.isAlive).length,
      fleetSize: fleet.length,
      durationSec: this.elapsedSec(),
      captainReports: this.awardCaptains(victory, enemiesSunk + landKills),
    };
    // Battle rank (#149): losses, damage taken and time.
    const maxHp = fleet.reduce((sum, s) => sum + s.stats.maxHp, 0);
    const rankInput = {
      victory,
      fleetSize: fleet.length,
      shipsLost: fleet.filter((s) => !s.isAlive).length,
      hpRatio: maxHp > 0 ? fleet.reduce((sum, s) => sum + (s.isAlive ? Math.max(0, s.stats.currentHp) : 0), 0) / maxHp : 0,
      durationSec: this.elapsedSec(),
      minShipHp: Math.min(1, ...fleet.filter((s) => s.isAlive && s.stats.maxHp > 0).map((s) => s.stats.currentHp / s.stats.maxHp)),
      timeLimitSec: this.side?.timeLimitSec ?? 0,
      timeWins: this.objective === Objective.Delay,
    };
    const rank = battleRank(rankInput);
    result.rank = rank;
    result.rankNote = rankBreakdown(rankInput);
    result.rankShortfall = rankShortfall(rankInput);
    const settlement = settleBattle(loadProgress(), {
      victory,
      // Spoils still come from land targets too.
      enemiesSunk: enemiesSunk + landKills,
      planesLost: this.playerAir.totalLost(),
      sunkClasses: this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy).map((e) => e.stats.shipClass),
      ships: fleet.map((s) => ({ shipId: s.dataId, hpFraction: s.stats.maxHp > 0 ? s.stats.currentHp / s.stats.maxHp : 0, sunk: !s.isAlive })),
    }, { exercise: this.exercise, event: this.battleEvent, theater: area?.theater, rankMul: RANK_REWARD_MUL[rank] * (area?.training ? TRAINING_SCALE : 1) * this.difficulty.rewardMul });
    if (this.scenario) {
      // Historical scenarios are exhibitions: no rewards, damage or crew experience carry over. The record keeps
      // their results apart (#177), out of the career totals.
      const before = loadProgress();
      let after = this.updateRecord(before, victory, fleet.filter((s) => !s.isAlive).length, result);
      // A side's first win pays a little gold (#200 #183); scenarios stay exhibitions otherwise.
      const force = this.scenarioSetup?.side.force;
      const firstWin = victory && force !== undefined && (before.record.scenarios?.[this.scenario.id]?.wins[force] ?? 0) === 0;
      if (firstWin) after = { ...after, wallet: addGold(walletOf(after), GOLD_SCENARIO_FIRST) };
      // 任務 (#314): a historical win counts for the history quest, and only that (no other quest or reward).
      if (victory) after = withQuestEvents(after, [['scenarioWin', 1]], Date.now());
      saveProgress(after);
      result.reward = undefined;
      result.cost = undefined;
      result.campaign = `シナリオ: ${this.scenario.name}  ${victory ? '勝利' : '敗北'}${firstWin ? `  ·  初勝利 ゴールド ${GOLD_SCENARIO_FIRST}` : ''}`;
      // 史実との比較 (#200), on its own line.
      const cmp = force ? historyComparison(this.scenario, force, { victory, sunk: enemiesSunk, lost: fleet.filter((s) => !s.isAlive).length }) : null;
      if (cmp) result.event = cmp.text;
      result.returnScene = SceneKeys.SCENARIO;
      result.retry = this.battleData ?? undefined;
      this.time.delayedCall(1200, () => this.scene.start(SceneKeys.RESULTS, result));
      return;
    }
    // Ledger (#137): the battle's reward in, replacement aircraft out.
    const now = Date.now();
    // Only what fit under the holding cap counts as income; the rest is logged as lost (#221).
    let lost = settlement.lost;
    const received = addResources(settlement.reward, lost, -1);
    let progress: IProgress = { ...settlement.progress, ledger: recordLedger(recordLedger(recordLedger(settlement.progress.ledger, 'battle', received, now), 'aircraft', settlement.aircraftCost, now), 'overflow', lost, now) };
    const proficiency = { ...progress.proficiency };
    for (const s of fleet) {
      const current = proficiency[s.dataId] ?? 0;
      proficiency[s.dataId] = addProficiency(current, Math.round(proficiencyGain({ victory, enemiesSunk: enemiesSunk + landKills, survived: s.isAlive, current }) * this.battleEvent.xpMul * (area?.training ? TRAINING_SCALE : 1)));
    }
    progress = { ...progress, proficiency };
    let firstClear = false;
    // An area's S rank brings one reward (#247): its reward-only ship, else (the first S) a captain; training none.
    let firstS = false;
    const routeNotes = takeSortieNotes(this);
    if (routeNotes.length > 0) result.route = routeNotes.join('  ·  ');
    // A skirmish before the boss (#53) never clears the area; a win lets the fleet advance.
    const node = this.battleData?.sortie;
    const skirmish = area !== undefined && node !== undefined && !node.boss;
    // An S on the area's main fleet lets it be swept from now on (#57 / #149); the area keeps its best rank.
    if (area && !skirmish) {
      const roster = DataLoader.getRegistry(this).byNation(progress.nation);
      const reward = firstSReward(area, { rewardShip: rewardShipFor(roster, ownedIds(progress, roster), area.id), perfect: progress.perfect, captainsLeft: Number.POSITIVE_INFINITY, depth: areaDepth(campaignData as ICampaignData, area, progress.nation), minDepth: CAPTAIN_MIN_DEPTH });
      if (rank === 'S' && victory && reward?.kind === 'captain') firstS = true;
      // The first S opens sweeping at 0, one more each hour (#181).
      if (rank === 'S' && !progress.perfect.includes(area.id)) progress = openSweeps({ ...progress, perfect: [...progress.perfect, area.id] }, area.id, Date.now());
      const best = betterRank(progress.areaRanks[area.id], rank);
      if (best && best !== progress.areaRanks[area.id]) progress = { ...progress, areaRanks: { ...progress.areaRanks, [area.id]: best } };
    }
    // The fleet's sortie cost against the cap of the rank it sailed at (#306).
    const sailed = (this.battleData?.playerFleet?.slots ?? []).map((s) => s.shipData).filter((s): s is IShipData => s !== null);
    const fleetCostNow = fleetCost(sailed, progress.refits);
    const costCapNow = costCap(rankOf(progress).index);
    // 任務 (#52): the sortie, the win and what was sunk.
    const sunk = this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy);
    const sunkOf = (c: ShipClass): number => sunk.filter((e) => e.stats.shipClass === c).length;
    const night = this.conditions.time === TimeOfDay.Night;
    const won = (b: boolean): number => (victory && b ? 1 : 0);
    const theaterWin: Partial<Record<string, QuestEvent>> = { pacific: 'winPacific', atlantic: 'winAtlantic', mediterranean: 'winMediterranean', baltic: 'winBaltic', blacksea: 'winBlackSea',
      north_pacific: 'winNorthPacific', south_atlantic: 'winSouthAtlantic', indian: 'winIndian', arctic: 'winArctic' };
    const theaterEvent = area ? theaterWin[area.theater] : undefined;
    progress = withQuestEvents(progress, [
      ['sortie', 1], ['win', won(true)], ['nightWin', won(night)], ['dayWin', won(!night)], ['sink', sunk.length],
      ['landKill', this.enemies.filter((e) => e.isLand && !e.isAlive).length],
      // 寡兵の勝利 (#280): a campaign win with a fleet at most UNDERDOG_RATIO of the enemy's strength.
      ['underdogWin', won(!!area && this.underdog())],
      // 出撃コスト (#306): a campaign win with the fleet's cost right at the rank's cap, or at half of it or less.
      ['fullCostWin', won(!!area && fleetCostNow === costCapNow)], ['lightCostWin', won(!!area && fleetCostNow * 2 <= costCapNow)],
      // 無傷の完勝 (#295): no loss and 95% of the fleet's HP left.
      ['flawlessWin', won(rankInput.shipsLost === 0 && rankInput.hpRatio >= FLAWLESS_HP)],
      // #158: rank, losses, purpose, fleet and theater of the win; sinkings of every class.
      ['hardWin', won(this.difficulty === DIFFICULTIES.hard)], ['fireSet', this.firesSet], ['airfieldDown', this.landTargets.filter((t) => !t.isAlive && this.enemyAir.hasCarrier(t)).length], ['superweaponSunk', this.superweapon && !this.superweapon.isAlive ? 1 : 0], ['winS', won(rank === 'S')], ['winA', won(rank === 'S' || rank === 'A')], ['perfectWin', won(rankInput.shipsLost === 0)],
      ['campaignWin', won(!!area)], ['objectiveWin', won(!!area && this.objective !== Objective.Annihilate)], ['exerciseWin', won(this.exercise)],
      ['convoyWin', won(this.objective === Objective.Convoy && !this.exercise)],
      // Enemy planes shot down, by guns or fighters (#185).
      ['planesDown', this.enemyAir.totalLost()],
      ['ddFlagWin', won(this.flagship?.stats.shipClass === ShipClass.Destroyer)], ...(theaterEvent && !area?.training ? [[theaterEvent, won(true)] as [QuestEvent, number]] : []),
      ['trainingWin', won(!!area?.training)],
      ['sinkDestroyer', sunkOf(ShipClass.Destroyer)], ['sinkCruiser', sunkOf(ShipClass.Cruiser)],
      ['sinkCarrier', sunkOf(ShipClass.Carrier)], ['sinkSubmarine', sunkOf(ShipClass.Submarine)], ['sinkBattleship', sunkOf(ShipClass.Battleship)],
      // A win under each kind of event counts for the イベント巡り章 (#218).
      ...(event ? [[`event_${event.kind}`, won(true)] as [QuestEvent, number]] : []),
    ], Date.now());
    if (skirmish) {
      result.campaign = `${area.name}  ${NODE_LABEL.battle} ${victory ? '勝利' : '敗北'} (${node.node} / ${node.battles})`;
      result.returnScene = SceneKeys.CAMPAIGN;
      // 大破 ships (judged on this battle's damage) drop out of the advance.
      const dropped = fleet.filter((s) => !s.isAlive || s.stats.currentHp / Math.max(1, s.stats.maxHp) <= HEAVY_DAMAGE).map((s) => s.stats.name.replace(/\s*\(.*\)\s*$/, ''));
      result.advance = victory && dropped.length < fleet.length;
      if (victory) result.advanceNote = dropped.length === fleet.length ? '全艦が大破したため進撃できません' : dropped.length > 0 ? `大破で離脱: ${dropped.join('・')}` : '次は敵の主力艦隊です';
    } else if (area && victory) {
      const rec = recordClear(progress.campaign, area.id);
      firstClear = rec.firstClear;
      progress = { ...progress, campaign: rec.cleared };
      let newShip = '';
      if (rec.firstClear) {
        const g = gainResources(progress.resources, area.reward, holdCap(progress.facilities));
        progress = { ...progress, resources: g.resources, ledger: recordLedger(recordLedger(progress.ledger, 'firstClear', addResources(area.reward, g.lost, -1), now), 'overflow', g.lost, now) };
        lost = addResources(lost, g.lost);
      }
      // The area's reward-only ship (#39 #160) joins on an S-rank win, the first clear or any later one.
      const roster = DataLoader.getRegistry(this).byNation(progress.nation);
      const ship = area.training ? undefined : rewardShipFor(roster, ownedIds(progress, roster), area.id);
      if (ship && rank === 'S') {
        progress = grantShip(progress, roster, ship.id);
        newShip = `  新しい艦: ${ship.name.replace(/\s*\(.*\)\s*$/, '')}`;
      } else if (ship) {
        newShip = `  (S 評価で ${ship.name.replace(/\s*\(.*\)\s*$/, '')} が手に入ります)`;
      }
      result.campaign = `海域攻略: ${area.name}${rec.firstClear ? `  初回報酬 ${formatResources(area.reward)}` : ''}${newShip}`;
      result.returnScene = SceneKeys.CAMPAIGN;
    } else if (area) {
      result.campaign = `作戦失敗: ${area.name}`;
      result.returnScene = SceneKeys.CAMPAIGN;
    } else if (this.exercise) {
      result.campaign = '演習: 損傷なし・資源報酬は半分';
    }
    // Merit (戦功, #36): first clears count most; the rank (and slots, docks, ship grades) follow from it.
    const before = rankOf(progress);
    // Promotion missions (#142) count campaign battles; finishing one can promote as surely as merit.
    if (area) {
      progress = addRankStats(progress, {
        campaignWin: victory ? 1 : 0, sink: sunk.length, nightWin: victory && this.conditions.time === TimeOfDay.Night ? 1 : 0,
        sinkCarrier: sunkOf(ShipClass.Carrier), sinkSubmarine: sunkOf(ShipClass.Submarine), sinkBattleship: sunkOf(ShipClass.Battleship),
        objectiveWin: victory && campaignSide(area) ? 1 : 0, areaClear: firstClear ? 1 : 0, bigS: rank === 'S' && this.enemies.filter((e) => !e.isLand).length >= 6 ? 1 : 0,
      });
    }
    const merit = Math.round(meritFor({ victory, campaign: area !== undefined, firstClear, enemiesSunk: enemiesSunk + landKills }) * RANK_MERIT_MUL[rank] * (area?.training ? TRAINING_SCALE : 1));
    progress = addMerit(progress, merit).progress;
    // ゴールド (#183): campaign wins by rank, more on a first clear.
    // Sinking a superweapon (#148) pays extra gold.
    const giantSunk = this.superweapon !== null && !this.superweapon.isAlive;
    const gold = Math.round(battleGold({ victory, campaign: area !== undefined, rank, firstClear, training: area?.training }) * this.difficulty.rewardMul) + (giantSunk ? SUPERWEAPON_GOLD : 0);
    if (gold > 0) progress = { ...progress, wallet: addGold(walletOf(progress), gold) };
    const after = rankOf(progress);
    const promoted = { promotedTo: after.index > before.index ? after : null };
    if (merit > 0 || promoted.promotedTo) result.merit = `戦功 +${merit}${promoted.promotedTo ? `  ·  昇進: ${before.name} → ${promoted.promotedTo.name}` : ''}`;
    // New captains (#44, S ranks only since #215): an area's first S, each promotion, now and then an S win.
    const sWin = victory && rank === 'S';
    // At most one a battle (#303: an area's first S that also promoted brought two, three with the random one).
    const recruits = Math.min(MAX_RECRUITS_PER_BATTLE, [firstS, (promoted.promotedTo?.index ?? 0) >= CAPTAIN_PROMOTION_RANK, sWin && Math.random() < CAPTAIN_DROP_CHANCE].filter(Boolean).length);
    // Captains go to the classes the fleet is shortest of (#159 #210): one class entry per owned ship. Once everyone
    // has joined (#131), a recruit becomes a 艦長教本 the player uses on a captain of their choice (#199).
    const roster = DataLoader.getRegistry(this).byNation(progress.nation);
    const classes = ownedIds(progress, roster).map((id) => roster.find((s) => s.id === id)?.shipClass).filter((c): c is ShipClass => c !== undefined);
    const rec = recruitCaptains(progress, recruits, classes);
    progress = rec.progress;
    const joined = rec.joined.map((c) => `${c.name} (${SKILL_LABEL[c.skill]})`);
    const books = rec.books;
    if (joined.length > 0) progress = withQuestEvents(progress, [['captainJoin', joined.length]], Date.now());
    const recruitLines = [
      joined.length > 0 ? `新しい艦長: ${joined.join('・')}` : '',
      books > 0 ? `艦長教本 +${books} (艦長画面で好きな艦長に使えます: 経験値 +${DUPLICATE_CAPTAIN_XP})` : '',
    ].filter((l) => l);
    // 訓練教範 (#305): now and then an S win.
    if (sWin && Math.random() < TRAINING_MANUAL_DROP_CHANCE) {
      progress = { ...progress, items: { ...progress.items, trainingManual: (progress.items.trainingManual ?? 0) + 1 } };
      recruitLines.push('訓練教範 +1 (改装の画面で艦の練度を上げられます)');
    }
    if (recruitLines.length > 0) result.recruits = recruitLines.join('\n');
    progress = this.updateRecord(progress, victory, fleet.filter((s) => !s.isAlive).length, result);
    // The sortie's battle is settled (#138): reopening the game offers the advance, not this battle again.
    if (area) progress = markSortieFought(progress);
    // Nations opened by this battle (#134) are announced with the recruits.
    const locksBefore = nationLocks(loadSave().nations, loadSave().record);
    saveProgress(progress);
    const opened = newlyUnlocked(locksBefore, nationLocks(loadSave().nations, loadSave().record));
    if (opened.length > 0) {
      const line = `新しい国が着任可能: ${opened.map((n) => NATION_INFO[n].jaShort).join('・')}`;
      result.recruits = result.recruits ? `${result.recruits}\n${line}` : line;
    }
    // Tutorial (#90): any battle moves the battle step on; a first clear finishes the campaign step.
    emitTutorial('battleEnd', this.registry);
    if (firstClear) emitTutorial('firstClear', this.registry);
    result.reward = `${formatResources(settlement.reward)}${gold > 0 ? `・ゴールド ${gold}` : ''}${lostNote(lost)}`;
    // On its own line under the reward (it ran into the reward and wrapped mid-word).
    if (eventAppliesToBattle(event, area?.theater)) result.event = `イベント: ${eventLabel(event)}`;
    if (giantSunk) result.event = [result.event ?? '', `超兵器撃沈: ${this.superweapon?.stats.name ?? ''}`].filter((l) => l).join('  ·  ');
    result.cost = formatResources(settlement.aircraftCost);
    this.time.delayedCall(1200, () => this.scene.start(SceneKeys.RESULTS, result));
  }

  /** Adds this battle to the service record and awards any medals it earned. */
  private updateRecord(progress: IProgress, victory: boolean, shipsLost: number, result: IBattleResultData): IProgress {
    let record = recordBattle(progress.record, {
      victory,
      sunkClasses: this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy).map((e) => e.stats.shipClass),
      damageDealt: Object.values(this.damageLog.player).reduce((a, n) => a + n, 0),
      shipsLost,
    }, this.scenario ? 'scenario' : this.exercise ? 'exercise' : 'campaign',
    this.scenario && this.scenarioSetup ? { id: this.scenario.id, force: this.scenarioSetup.side.force } : undefined);
    // Medals look at every nation's progress too (#92): the save as it will be written.
    const awarded = awardEarnedMedals(withSaveProgress(loadSave(), { ...progress, record }));
    const medals = awarded.medals;
    record = awarded.save.record;
    if (medals.length > 0) result.medals = medals.map((m) => m.name);
    // Medals bring gold (#183): the purse goes back with the record.
    return { ...progress, record, wallet: awarded.save.wallet };
  }

}
