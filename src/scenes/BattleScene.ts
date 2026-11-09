import Phaser from 'phaser';
import { battleMoodFor } from '@/systems/MusicScore';
import { improvedCatalog } from '@/systems/ImprovementSystem';
import { withSwaps } from '@/systems/GunSwapSystem';
import { fragmentNote, offerFor, rollFragment } from '@/systems/ForeignShipSystem';
import { isFavorite } from '@/systems/FavoriteSystem';
import { focusModifiers } from '@/systems/NationFocusSystem';
import { CAPTAIN_DROP_CHANCE, CAPTAIN_MIN_DEPTH, CAPTAIN_PROMOTION_RANK, DUPLICATE_CAPTAIN_XP, MAX_RECRUITS_PER_BATTLE, recruitCaptains } from '@/systems/CaptainRoster';
import { emitTutorial, TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_HUD, DEPTH_SHIPS, DEPTH_WATER_FX, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { baseOfProgress, baseReaches, nationBases, openBases, theaterFacility } from '@/systems/BaseSystem';
import { BaseProjectile } from '@/entities/weapons/BaseProjectile';
import { DEPTH_CHARGE_RADIUS } from '@/entities/weapons/DepthCharge';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem, aiSelf, AUTO_AIM_ERROR, CARRIER_STANDOFF, fireAt, IShipView, nearestDistance, shipView } from '@/systems/AISystem';
import { EscortAISystem } from '@/systems/EscortAISystem';
import { FLEET_LEASH } from '@/systems/EscortSteering';
import { AUTO_SEARCH_THROTTLE, autoEngageRange, autoSearchGoal } from '@/systems/AutoCaptain';
import { chooseTarget, FLAGSHIP_PRIORITY, TACTICS } from '@/systems/AIBrain';
import { FORMATION_ORDER, FORMATION_RULES, formationModifiers } from '@/systems/FormationRules';
import { EXPEDITIONS } from '@/systems/ExpeditionSystem';
import { aaGuns, AirOpsSystem } from '@/systems/AirOpsSystem';
import { airfieldRearmMs, REARM_MS } from '@/systems/AirWingSystem';
import { AircraftType } from '@/types/Aircraft';
import { FleetSystem } from '@/systems/FleetSystem';
import { FormationSystem } from '@/systems/FormationSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { exerciseEnemyCount, exerciseEnemyFleet, generateEnemyFleet, trainingEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { SELECTION_KEY } from '@/utils/FleetSelection';
import { canDive, createSubmarineState, updateSubmarine } from '@/systems/SubmarineSystem';
import { applyCritical, applyStatus, CRITICAL_LABEL, effectiveShell, LAND_CRITICAL_LABEL, nextShellMode, rollCriticalHit, rollStatus, SHELL_LABEL, statusDamage, STATUS_LABEL, damageReadout, weaponReadout } from '@/systems/DamageSystem';
import { depthChargeFalloff, isDetected, ISonarHunter, sonarRange } from '@/systems/SonarSystem';
import { AIRCRAFT_VISION, isVisible, shipVision, VisionSource } from '@/systems/VisionSystem';
import { ReconSystem } from '@/systems/ReconSystem';
import { FogOfWar } from '@/ui/FogOfWar';
import { drawMap } from '@/ui/MapView';
import { avoidHeading, clearSpawn, currentAt, inShoal, resolveMap, SHOAL_SPEED } from '@/systems/MapSystem';
import { anchorAt, colGap, findRoute, FUEL_MAX, homePort, IAnchorPlace, isSea, seaSectorAt, lonLatOf, wrapCol, placeName, samePlace, sectorAt, practiceGrounds, SECTOR_PX, WORLD_MAP, WORLD_PX, areaAt, areaCentre, baseAnchor, homeAnchor, placeFuel, theaterOf } from '@/systems/OpenSeaSystem';
import { IVoyageStop, OpenSeaVoyage } from '@/scenes/battle/OpenSeaVoyage';
import { markPlace, placeDanger, placeReady, placeReward, PLACE_FIGHT_RANGE, seaPlaces } from '@/systems/SeaPlaceSystem';
import { nearestDock } from '@/systems/AnchorageSystem';
import { setDamage } from '@/systems/DockSystem';
import { IResolvedMap } from '@/types/Map';
import { addMerit, addRankStats, meritFor, rankOf } from '@/systems/RankSystem';
import { costCap, fleetCost } from '@/systems/FleetCost';
import { allyArrived, defaultMission, FleetMission, missionFoes } from '@/systems/FleetGroups';
import { addMorale, battleMoraleDelta, IMoraleState, MORALE_HIGH, moraleModifiers, moraleOf } from '@/systems/MoraleSystem';
import { BATTLE_WORLD, CONVOY_START_X, convoyEscortStart, enemySpawnPoints, IPoint, lineAtSea, playerStart } from '@/systems/BattleLayout';
import { Minimap } from '@/ui/Minimap';
import { ShipTrails } from '@/entities/effects/ShipTrails';
import { audio } from '@/systems/AudioSystem';
import { enemyFormation } from '@/systems/EnemyFormation';
import { applyDrops, dropLine, rollDrops } from '@/systems/DropSystem';
import { addGroundKills, bombardLineup, GROUND_WEAPONS } from '@/systems/GroundSystem';
import { battleLine, bearingWord, outcomeLine, CommentaryKind, emptyCommentary, ICommentaryState, logLines, narrationLine, next as nextCommentary, raise, forget as forgetLines } from '@/systems/CommentarySystem';
import { voice } from '@/systems/VoiceSystem';
import { FeedbackEvent, shakeFor, vibrateFor } from '@/systems/FeedbackRules';
import { shipSize, sinkSound } from '@/systems/SoundRules';
import {
  AA_BARRAGE, aiConsumable, BOOST_SPEED, ConsumableKind, hiddenBySmoke, IConsumableSlot, isActive, ISmokeCloud, RADAR_VISION, repairPerSec, shipConsumables, slotLabel, SMOKE_RADIUS, useConsumable,
} from '@/systems/ConsumableSystem';
import { airfieldYear, baseAirPerf, eraLandPerf, eraWingPerf, FLYING_BOAT_SCOUT_MUL, flyingBoatOf, pilotAfterBattle, pilotMul, wingPerf } from '@/systems/AircraftSystem';
import { BRIDGE_AIM_MUL, newlyBroken, partsLine, PART_CRITICAL, PART_LABEL, eventGiantJoins, SUPERWEAPON_GOLD, superweaponOf, superweaponSeaOpen } from '@/systems/SuperweaponSystem';
import { battleDifficulty, DIFFICULTIES, IDifficulty } from '@/systems/DifficultySystem';
import { SoundKind } from '@/systems/SoundRules';
import { battleConditions, revealedByFlash, TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { ISeaSky, seaSky } from '@/systems/WorldClock';
import { arrivesAt, orderPatrol, orderPos, orderVoyage, patrolLoop, PatrolStance, RETURN_AT, ReturnRule, runMs, SIGHTING_MS, stopOrder } from '@/systems/FleetOrders';
import { recallExpedition } from '@/systems/ExpeditionSystem';
import { expeditionPlan, expeditionPos } from '@/systems/ExpeditionRoute';
import { fightNote, runFleetOrders } from '@/utils/FleetOrderRunner';
import type { IChartFleet } from '@/scenes/OpenSeaChartScene';
import { fleePoint, IGiantSea, IResident, IResidentPos, seaLine, meetResponse, MEET_PX, RESIDENT_CLEAR, ResidentKind, residentDay, residentsFor, residentsNear, worldGap } from '@/systems/WorldSim';
import { IBattleConditions, TimeOfDay, Weather } from '@/types/Weather';
import { primaryWeapon, selectWeapons, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { BattleMode } from '@/types/Battle';
import { Explosion } from '@/entities/effects/Explosion';
import { WaterSplash } from '@/entities/effects/WaterSplash';
import { HUD } from '@/ui/HUD';
import { VirtualJoystick } from '@/ui/components/VirtualJoystick';
import { addChip, addOceanWorld, addPanel, fitText, UIButton } from '@/ui/components/UIKit';
import { engageSteer, headingTo, hitTestTarget, inRange, pickTarget, waypointSteer, convoyGuardPoint, convoyGuardTarget } from '@/systems/AutoPilot';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { DataLoader } from '@/utils/DataLoader';
import { designLoadout } from '@/systems/DesignSystem';
import { angleBetween, edgePoint } from '@/utils/MathUtils';
import { IShipData, IShipStats, ShipSubtype } from '@/types/Ship';
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
import { afterBattle, resourceReward, spotWon, worldEnemyFleet, CONTROL_ENEMY_MUL, CONTROL_REWARD_MUL, emptyWorld, endVoyage, FORT_GOLD, FORT_NATION, FORT_REWARD, fortDanger, HISTORIC_GOLD, mustReturn, PORT_REPAIR, PATROL_ARRIVE_SEC, takeFort, winHistoric, winInRing, worldEnemyScale, worldGold, worldReward } from '@/systems/WorldSystem';
import { HAZARD_LABEL, hazardPlan, IHazard, inHazard, isSweeper, LANDING_DAMAGE, landingDue, mineChance, MINE_DAMAGE, netSpeedMul, placeHazards, sweep } from '@/systems/HazardSystem';
import { ANNIVERSARY_GOLD, ANNIVERSARY_PLACES, anniversariesOn, anniversaryKey, anniversaryRewardMul, fleetKeepsRule, IAnniversary, SPECIAL_ENEMY_SCALE, SPECIAL_GOLD, specialReward, specialState, weeklyArea, weeklyRule, winAnniversary, winSpecial } from '@/systems/SpecialOpsSystem';
import { awardEarnedMedals } from '@/utils/MedalContext';
import { newlyUnlocked, nationLocks } from '@/systems/NationUnlock';
import { recordLedger } from '@/systems/LedgerSystem';
import { battleRank, betterRank, RANK_MERIT_MUL, RANK_REWARD_MUL, rankBreakdown, rankShortfall, FLAWLESS_HP } from '@/systems/BattleRank';
import { NATION_INFO } from '@/config/NationInfo';
import { isExercise, openSweeps, settleBattle, startingHp } from '@/systems/ProgressionSystem';
import { grantShip, ownedIds, rewardShipFor } from '@/systems/ShipyardSystem';
import { researchModifiers, TECH_TREE } from '@/systems/ResearchSystem';
import { addResources, formatResources, gainResources, lostNote } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import campaignData from '@/data/campaign.json';
import type { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { campaignSide, enemyNationFor, enemyShips, firstSReward, isUnlocked, recordClear, theatersFor, TRAINING_SCALE } from '@/systems/CampaignSystem';
import { addBattle, addGiantBattle } from '@/systems/ShipRecordSystem';
import { COUNTER_HOURS, counterTargets, countSortie, defenseReward, emptySeaControl, retakeArea, settleDefense } from '@/systems/SeaControlSystem';
import { noteEnemies, PX_PER_NM, recordBattle } from '@/systems/RecordSystem';
import { techLevel, techModifiers, techPoints } from '@/systems/FleetTechSystem';
import { LAST_STAND_HP, lastStandArmor, luckChance, skillModifiers, skillOf } from '@/systems/ShipSkillSystem';
import { battleBanner, convoyHpRatio, evaluateObjective, goalThrottle, IObjectiveState, objectiveResult, objectiveStatus, outcomeReason, pauseLines } from '@/systems/ObjectiveSystem';
import { OBJECTIVE_LABEL, objectiveText } from '@/scenes/CampaignMapScene';
import { addProficiency, evadeChance, proficiencyGain, TRAINING_MANUAL_DROP_CHANCE } from '@/systems/ProficiencySystem';
import { Objective } from '@/types/Campaign';
import { Torpedo } from '@/entities/weapons/Torpedo';
import specialData from '@/data/special.json';
import { IScenario, IScenarioSide } from '@/types/Scenario';
import { historyComparison, inZone, IScenarioSetup, placeAt, setupFor, zoneRadius } from '@/systems/ScenarioSystem';
import { framePixel, framePoint, frameRadius, inFrameZone, ISeaFrame, seaFrame } from '@/systems/SeaFrame';
import { REFIT_TABLE, refitModifiers, refitName, refitShipData } from '@/systems/RefitSystem';
import { eventAppliesToBattle, eventEffects, eventLabel, IEventEffects, NO_EVENT } from '@/systems/EventSystem';
import { gameWeek, QuestEvent, withQuestEvents } from '@/systems/QuestSystem';
import { activeEvent } from '@/utils/GameClock';
import { HEAVY_DAMAGE, NODE_LABEL, sortieRoute } from '@/systems/SortieMapSystem';
import { endSortie, markSortieFought, takeSortieNotes } from '@/utils/SortieFlow';
import { areaDepth, enemyScale, fleetPower, isOpeningArea, OPENING_TORPEDO_MUL, scaleModifiers } from '@/systems/DifficultyCurve';
import { UNDERDOG_RATIO } from '@/systems/FleetPower';



const SHIP_ROTATE_SPEED = 120;
const JOYSTICK_POS = { x: IS_PORTRAIT ? 140 : 150, y: CANVAS_H - (IS_PORTRAIT ? 170 : 150) };
const JOYSTICK_RADIUS = IS_PORTRAIT ? 86 : 70;

// Touch / AUTO controls
/** A tap this close to an enemy's centre locks it as the target instead of setting a waypoint. */
const TAP_TARGET_RADIUS = 70;
const WAYPOINT_ARRIVE_RADIUS = 24;
/** AUTO mode holds the target at this fraction of the main gun's range. */
const AUTO_EDGE_MARGIN = 70;
const TOP_BUTTON = IS_PORTRAIT ? { y: 46, w: 172, h: 60 } : { y: 42, w: 130, h: 44 };
/** Torpedo / dive buttons sit above the bottom-right corner. */
const ACTION_BUTTON = IS_PORTRAIT ? { w: 172, h: 64, gap: 14, bottom: 120 } : { w: 150, h: 46, gap: 10, bottom: 90 };
/**
 * The sea is a 3200 px square in both orientations; the camera follows the flagship. The open sea (#445) is the
 * whole world: set at the start of each battle (the AI and the steering read these objects in place).
 */
const WORLD: { w: number; h: number } = { ...BATTLE_WORLD };
/** Class words for the commentary (#106): 戦艦・巡洋艦 … */
const CLASS_JA_SHORT: Partial<Record<ShipClass, string>> = {
  [ShipClass.Battleship]: '戦艦', [ShipClass.Cruiser]: '巡洋艦', [ShipClass.Destroyer]: '駆逐艦', [ShipClass.Carrier]: '空母', [ShipClass.Submarine]: '潜水艦',
};
const WORLD_BOUNDS = { width: WORLD.w, height: WORLD.h };

function setWorldSize(w: number, h: number): void {
  WORLD.w = w;
  WORLD.h = h;
  WORLD_BOUNDS.width = w;
  WORLD_BOUNDS.height = h;
}
/** 基地航空隊 (#373): how long the base's scouts show the enemy, and when its strikes fly (battle ms). */
const BASE_AIR_SCOUT_MS = 20_000;
const BASE_AIR_STRIKES_AT = [25_000, 70_000];
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
/** The island the batteries of an area at sea stand on (0.0.70; drawn, not solid). */
const SEA_ISLAND_R = 420;
/** How near an objective area's middle its fight starts at sea (0.0.70): about where a campaign battle begins. */
const SEA_SQUARE_ENTRY = 1900;
/** Player escorts and air strikes prefer the scenario's target ships by this much. */
const OBJECTIVE_PRIORITY = 0.5;
/** Enemy AI prefers convoy ships over warships by this much. */
const CONVOY_PRIORITY = 0.6;
/** Enemy air strikes hold back from the player's flagship (#328): on top of the formation's flagship priority. */
const AIR_FLAGSHIP_PRIORITY = -0.35;
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

/** A fleet fighting beside the one the player steers (#84 #64): its ships and their AIs; `owned` = the player's own. */
interface IFleetGroup {
  label: string;
  ships: BaseShip[];
  ais: AISystem[];
  owned: boolean;
  mission: FleetMission;
  /** Whose ships they are (友軍艦隊 of another navy leave its plans after a shared win, #386) */
  nation?: Nation;
}

/** 友軍艦隊 (#64) are tinted green. */
const ALLY_TINT = 0x9fe8b0;

export class BattleScene extends Phaser.Scene {
  private battleData: IBattleInitData | null = null;
  /** 本当のオープンワールド (#445): the battle screen sailing the world, and its screen-sized sea */
  private voyage: OpenSeaVoyage | null = null;
  /**
   * 海の上の交戦 (#445, 0.0.69): the fight going on at sea — a campaign area's (its block's middle) or a group met at
   * sea — settled in place when its enemies are gone or the fleet draws off. Areas fought stay quiet until left.
   */
  private engagement: ({ kind: 'area'; areaId: string; sw?: boolean; special?: boolean } | { kind: 'encounter'; spotId: string; danger: number; fort?: boolean; convoy?: boolean; drill?: boolean; resident?: ResidentKind; flee?: boolean; ally?: { name: string; nation: string; shipIds: string[] } }) & { x: number; y: number } | null = null;
  /** 住人 (0.0.72): the day's residents of the seas the navy sails, and those near the fleet (for the minimap) */
  private residents: IResident[] = [];
  private residentsDay = -1;
  private nearResidents: Array<{ r: IResident; pos: IResidentPos }> = [];
  /** Friendly patrols already called to a fight (once each) */
  private calledFriends = new Set<string>();
  /** When the fleets under orders are next brought up to now (0.0.72) */
  private ordersAt = 0;
  /** A drill's HP before it began (訓練・演習 at sea, 0.0.70): put back when it ends, as an exercise leaves no damage. */
  private drillHp: Map<BaseShip, number> | null = null;
  private engagedAreas = new Set<string>();
  /** Objective areas whose 'go to the middle' note was shown on entering (0.0.70). */
  private notedAreas = new Set<string>();
  private seaWon = new Set<string>();
  private seaCheckAt = 0;
  private settlingInPlace = false;
  private seaBanner: Phaser.GameObjects.GameObject[] = [];
  private oceanTile: Phaser.GameObjects.TileSprite | null = null;

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
  /** 世界の時計と天候 (0.0.72): the conditions chip and the storm's rain, redrawn when the sky over the fleet changes */
  private weatherChip: Phaser.GameObjects.Container | null = null;
  private stormFx: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private skyCheckAt = 0;
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
  /** 部位耐久 (#148): the giant's parts, over it */
  private superweaponParts: Phaser.GameObjects.Text | null = null;
  /** 消耗品 (#47): each ship's slots, its vision and AA before any effect, the smoke at sea and the flagship's buttons */
  private consumables = new Map<BaseShip, IConsumableSlot[]>();
  private baseVision = new Map<BaseShip, { vision: number; aa: number }>();
  private smoke: ISmokeCloud[] = [];
  private smokeGfx: Phaser.GameObjects.Graphics | null = null;
  private consumableBtns: UIButton[] = [];
  private consumableLabels: string[] = [];
  private consumableUses = 0;
  /** 戦闘実況 (#106): the queue, the subtitle line, who was alive last frame and who was already called 大破 */
  private commentary: ICommentaryState = emptyCommentary();
  private subtitle: Phaser.GameObjects.Text | null = null;
  private subtitleUntil = 0;
  private aliveLastFrame = new Set<BaseShip>();
  private calledHeavy = new Set<BaseShip>();
  private flagshipHpSeen = 1;
  private sonarPhase = 0;
  /** Enemy planes down so far, for the 撃墜 sound */
  private planesDownSeen = 0;
  private contactCalled = false;
  /** Fleets fighting beside the one the player steers (#84 支援艦隊, #64 友軍艦隊), each ship with its own AI */
  private groups: IFleetGroup[] = [];
  /** When the music's mood is looked at next (#383) */
  private musicCheckAt = 0;
  /** 友軍艦隊 still to arrive (#64) */
  private pendingAllies: Array<{ ships: IShipData[]; arriveSec: number; name: string; nation: Nation; at?: { x: number; y: number } }> = [];
  /** Name of the fleet the player steers now (第一艦隊 until a switch, #84) */
  private controlLabel = '第一艦隊';
  private switchBtn: UIButton | null = null;
  /** 動作情報 (#99): fps, objects and the time one frame of battle logic takes */
  private perfText: Phaser.GameObjects.Text | null = null;
  private perfFrames: number[] = [];
  private perfShownAt = 0;
  /** What enemy shells can hit and what land stops (arrays the colliders read in place, #64) */
  private friendlyTargets: BaseShip[] = [];
  private landColliders: BaseShip[] = [];
  /** Fires and floods the player's side started on enemy ships (#48) */
  private firesSet = 0;
  /** 通算の記録 (#92): hits by the player's ships' own shells and torpedoes, and how far their ships sailed (px) */
  private shellHits = 0;
  private torpedoHits = 0;
  private sailedPx = 0;
  /** 固有スキル (#58): how often the player's ships' skills worked this battle */
  private skillProcs = 0;
  /** 艦隊技術 (#56): levels by class this battle */
  private techLevels: Record<ShipClass, number> | null = null;
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
  /** How far the escaping target was from its zone at first, and how far it got (#421) */
  private escapeStart: number | null = null;
  private escapeProgress = 0;
  private landTargets: BaseShip[] = [];
  private objectiveText: Phaser.GameObjects.Text | null = null;
  /** 海の上の作戦の枠 (0.0.70): the objective's ground on the ocean while an area's fight lasts; null otherwise. */
  private frame: ISeaFrame | null = null;
  /** The battle's opening band, cleared early when a fight at sea brings its own (0.0.70). */
  private openingBanner: Phaser.GameObjects.GameObject[] = [];
  /** What the objective drew (zone ring, island) for a fight at sea, cleared when it is settled. */
  private frameGfx: Phaser.GameObjects.GameObject[] = [];
  /** Captains in command of player ships this battle */
  private captains = new Map<BaseShip, ICaptain>();
  /** Where ships have spawned this battle, so later ones keep clear of them */
  private spawnedAt: IPoint[] = [];

  private explosion!: Explosion;
  private splash!: WaterSplash;
  private hud!: HUD;
  /** The HUD of this battle is made (a restarted scene still holds the last one's until then) */
  private hudReady = false;

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
  /** 基地航空隊 (#373): the level at the forward base of this sea, its hidden airfield, and the strikes sent so far */
  private baseAirLevel = 0;
  private baseAirField: BaseShip | null = null;
  private baseAirSent = 0;
  /** How long the base's scouts show the enemy (longer with a flying boat, #408) */
  private baseScoutMs = BASE_AIR_SCOUT_MS;
  /** 海の障害 (#368): minefields and nets of this sea, their drawing, and what came of them */
  private hazards: IHazard[] = [];
  private hazardGfx: Phaser.GameObjects.Graphics | null = null;
  private hazardLabels: Phaser.GameObjects.Text[] = [];
  private minesStruck = 0;
  private fieldsSwept = 0;
  /** 上陸支援 (#368): landings made this battle */
  private landings = 0;
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
    audio.setNation(this.battleData?.playerFleet?.nation);
    audio.music('battle');
    this.gameOver = false;
    // Phaser reuses the scene instance: per-battle logs must be cleared here, not at declaration.
    this.damageLog.player = {};
    this.damageLog.enemy = {};
    this.escorts = [];
    this.enemies = [];
    this.aiSystems = [];
    this.escortAISystems = [];
    this.groups = [];
    this.hudReady = false;
    this.musicCheckAt = 0;
    this.pendingAllies = [];
    this.controlLabel = '第一艦隊';
    this.switchBtn = null;
    this.perfText = null;
    this.perfFrames = [];
    this.perfShownAt = 0;
    this.firesSet = 0;
    this.shellHits = 0;
    this.torpedoHits = 0;
    this.sailedPx = 0;
    this.skillProcs = 0;
    this.techLevels = null;
    this.superweapon = null;
    this.superweaponParts = null;
    this.consumables = new Map();
    this.baseVision = new Map();
    this.smoke = [];
    this.smokeGfx = null;
    this.consumableBtns = [];
    this.consumableLabels = [];
    this.consumableUses = 0;
    this.commentary = emptyCommentary();
    this.subtitle = null;
    this.subtitleUntil = 0;
    this.aliveLastFrame = new Set();
    this.calledHeavy = new Set();
    this.flagshipHpSeen = 1;
    this.contactCalled = false;
    this.sonarPhase = 0;
    this.planesDownSeen = 0;
    this.seenByEnemy = new Set();
    this.seenByPlayer = new Set();
    this.convoy = [];
    this.convoyEscaped = 0;
    this.escapeStart = null;
    this.escapeProgress = 0;
    this.landTargets = [];
    this.hazards = [];
    this.hazardGfx = null;
    this.hazardLabels = [];
    this.minesStruck = 0;
    this.fieldsSwept = 0;
    this.landings = 0;
    this.objectiveText = null;
    this.frame = null;
    this.frameGfx = [];
    this.openingBanner = [];
    this.drillHp = null;
    this.scenarioTargets = [];
    this.captains = new Map();
    this.spawnedAt = [];
    this.diveBtn = null;
    this.diveText = null;
    this.airText = null;
    this.strikeBtn = null;
    this.strikeReady = false;
    this.wantDive = false;

    const openSea = this.battleData?.openSea === true;
    this.voyage = null;
    this.engagement = null;
    this.engagedAreas = new Set();
    this.notedAreas = new Set();
    this.seaWon = new Set();
    this.seaCheckAt = 0;
    this.settlingInPlace = false;
    this.seaBanner = [];
    if (openSea) {
      // The open sea (#445): the world's sectors are loaded round the flagship as it sails (OpenSeaVoyage).
      setWorldSize(WORLD_PX.w, WORLD_PX.h);
      this.oceanTile = addOceanWorld(this, CANVAS_W, CANVAS_H, { screenFixed: true });
      this.map = { islands: [], shoals: [], currents: [] };
      this.islands = this.physics.add.staticGroup();
      const b = OpenSeaVoyage.bounds();
      this.physics.world.setBounds(b.x, b.y, b.w, b.h);
    } else {
      setWorldSize(BATTLE_WORLD.w, BATTLE_WORLD.h);
      this.oceanTile = null;
      addOceanWorld(this, WORLD.w, WORLD.h);
      this.map = resolveMap(DataLoader.getMap(this, this.battleData?.mapKey || 'open-sea'), WORLD.w, WORLD.h);
      this.islands = drawMap(this, this.map);
      this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    }
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
    // On the open sea (0.0.72) the sky is the world's: its clock and the weather front over the fleet's sector.
    const sky = openSea ? this.skyAt(OpenSeaVoyage.startPoint(this.battleData?.openSeaFrom ?? homeAnchor(playerFleet.nation))) : null;
    this.conditions = battleConditions(sky?.weather ?? this.battleData?.weather ?? Weather.Clear, sky?.time ?? this.battleData?.time ?? TimeOfDay.Day);
    this.playerNation = playerFleet.nation;
    this.enemyNation = enemyFleet.nation;

    this.playerWeapons = new WeaponSystem(this, (x, y, w, src) => this.onDepthCharge(x, y, w, this.enemies, src));
    this.enemyWeapons = new WeaponSystem(this, (x, y, w, src) => this.onDepthCharge(x, y, w, this.playerSide(), src));
    this.playerWeapons.aimError = this.conditions.aimError;
    this.enemyWeapons.aimError = this.conditions.aimError;
    const bomb = DataLoader.getWeaponById(this, 'aerial_bomb') ?? FALLBACK_WEAPON;
    const aerialTorpedo = DataLoader.getWeaponById(this, 'aerial_torpedo') ?? FALLBACK_WEAPON;
    const onBomb = (target: BaseShip, weapon: IWeaponData, dmg: number): void => {
      this.sound3d('bombDrop', target.x, target.y);
      this.explosion.play(target.x, target.y);
      this.sound3d('explosion', target.x, target.y);
      this.rollCritical(target, weapon, dmg);
    };
    this.playerAir = new AirOpsSystem(this, false, this.playerWeapons, bomb, aerialTorpedo, onBomb);
    this.enemyAir = new AirOpsSystem(this, true, this.enemyWeapons, bomb, aerialTorpedo, onBomb);
    // 発艦 (#104); the enemy's raid is called too (#106).
    this.playerAir.onLaunch = (x, y) => this.sound3d('launch', x, y);
    this.enemyAir.onLaunch = (x, y) => {
      this.sound3d('plane', x, y);
      this.comment('airRaid', {});
    };
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
    // The open sea (#445) is real: damage carries, rewards are full.
    this.exercise = !this.battleData?.openSea && isExercise({ areaId: this.battleData?.areaId, scenario: this.scenario ?? undefined, world: this.battleData?.world });
    this.difficulty = battleDifficulty(audio.settings.difficulty, this.scenario !== null);
    // 超兵器出現 (#148 #89): a main fleet in the event's theater brings its superweapon (not training areas).
    const event = eventEffects(activeEvent());
    // Not in the shallow seas (#430).
    this.bringsSuperweapon = this.battleData?.superweapon === true || (bossNode && battleArea !== undefined && eventGiantJoins(battleArea, areaDepth(campaignData as ICampaignData, battleArea, playerFleet.nation), event.superweaponTheater));
    this.objective = this.side?.objective ?? this.battleData?.objective ?? Objective.Annihilate;
    this.formation = formation;
    this.spawnPlayerFleet(playerFleet, formation);
    this.spawnSupportFleets(playerFleet.nation);
    this.queueAllies(battleArea);
    this.spawnEnemyFleet(enemyFleet);
    if (this.exercise && !this.scenario) (this.battleData?.enemySupport ?? []).forEach((g, i) => this.spawnEnemyGroup(g, i, enemyFleet.nation));
    if (this.objective === Objective.Convoy) this.spawnConvoy();
    if (this.objective === Objective.Bombard) this.spawnLandTargets();
    this.setupConsumables();
    this.setupBaseAir(battleArea);
    const startAngle = this.scenarioSetup?.player.positions[0]?.angle;
    if (startAngle !== undefined) for (const s of this.friendlies()) s.setAngle(startAngle);
    this.drawObjectiveZone();
    this.setupHazards(battleArea);

    const cam = this.cameras.main;
    if (openSea) {
      const b = OpenSeaVoyage.bounds();
      cam.setBounds(b.x, b.y, b.w, b.h);
    } else cam.setBounds(0, 0, WORLD.w, WORLD.h);
    cam.startFollow(this.flagship, true, CAMERA_LERP, CAMERA_LERP);

    this.explosion = new Explosion(this);
    this.splash = new WaterSplash(this);
    const torpedoMain = weaponKind(this.playerWeapon) === WeaponKind.Torpedo;
    this.hud = new HUD(this, this.flagship, this.enemies, this.escorts, torpedoMain ? '魚雷' : '主砲', this.convoy);
    for (const g of this.groups) this.hud.addAllies(this, g.ships, g.owned);
    this.hudReady = true;

    this.fog = new FogOfWar(this, this.conditions.fogColor, this.conditions.fogAlpha);
    this.trails = new ShipTrails(this);
    for (const s of [...this.playerSide(), ...this.enemies]) this.trails.add(s);
    const mm = IS_PORTRAIT ? { w: 150, x: CANVAS_W - 20 - 150, y: 252 } : { w: 200, x: CANVAS_W - 20 - 200, y: 80 };
    // On the open sea the minimap shows the 3 × 3 sectors round the flagship (#445); the chart shows the world.
    this.minimap = openSea ? new Minimap(this, mm.x, mm.y, mm.w, 3 * SECTOR_PX, 3 * SECTOR_PX) : new Minimap(this, mm.x, mm.y, mm.w, WORLD.w, WORLD.h);
    if (!openSea) this.minimap.drawIslands(this.map);
    if (openSea) this.startVoyage(mm.y + this.minimap.height);
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
      // 至近弾 (#104 #107): a splash right beside the flagship.
      if (this.flagship.isAlive && Phaser.Math.Distance.Between(x, y, this.flagship.x, this.flagship.y) < 70) {
        audio.play('nearMiss');
        this.feel('nearMiss', this.flagship);
      } else this.sound3d('splash', x, y);
    };
    const onFire = (w: IWeaponData, x: number, y: number): void => {
      const kind = weaponKind(w);
      if (kind === WeaponKind.Torpedo) this.sound3d('torpedoLaunch', x, y);
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
    const frameStart = this.perfText ? performance.now() : 0;
    this.battleUpdate(loopTime, delta);
    if (this.oceanTile && this.oceanTile.scrollFactorX === 0) {
      const cam = this.cameras.main;
      this.oceanTile.setTilePosition(cam.scrollX, cam.scrollY);
    }
    this.updateSuperweaponParts();
    this.updateMusicMood(loopTime);
    if (this.perfText) this.showPerf(performance.now() - frameStart);
  }

  /** The battle's music follows the fight (#383): the superweapon's theme, a crisis, the night. Checked every second. */
  private updateMusicMood(now: number): void {
    if (now < this.musicCheckAt || this.voyage) return;
    this.musicCheckAt = now + 1000;
    const own = this.friendlies().filter((s) => s);
    const max = own.reduce((sum, s) => sum + s.stats.maxHp, 0);
    const left = own.filter((s) => s.isAlive).reduce((sum, s) => sum + s.stats.currentHp, 0);
    audio.battleMood(battleMoodFor({
      boss: this.superweapon?.isAlive === true,
      night: this.conditions.time === TimeOfDay.Night,
      ownHpShare: max > 0 ? left / max : 1,
    }));
  }

  /** 航空機と搭乗員 (#87): the models the carrier flies and its pilots; scenarios fly the base planes. */
  private playerAirFor(data: IShipData): { perf?: ReturnType<typeof wingPerf>; pilot?: number } {
    if (this.scenario || !data.airWing) return {};
    const p = loadProgress();
    return { perf: wingPerf(p, data.id, data.nation), pilot: pilotMul(p.pilots[data.id]) };
  }

  /** 部位耐久 (#148): the giant's parts follow it while it is afloat and seen. */
  private updateSuperweaponParts(): void {
    const t = this.superweaponParts;
    const giant = this.superweapon;
    if (!t || !giant) return;
    if (!giant.isAlive) {
      t.destroy();
      this.superweaponParts = null;
      return;
    }
    t.setPosition(giant.x, giant.y - 80).setVisible(giant.visible);
    const line = partsLine(giant.stats.currentHp / Math.max(1, giant.stats.maxHp));
    if (t.text !== line) t.setText(line);
  }

  /** 動作情報 (#99): fps, ships, projectiles and the battle logic's time per frame, refreshed twice a second. */
  private showPerf(frameMs: number): void {
    this.perfFrames.push(frameMs);
    if (this.perfFrames.length > 60) this.perfFrames.shift();
    const now = performance.now();
    if (now - this.perfShownAt < 500) return;
    this.perfShownAt = now;
    const avg = this.perfFrames.reduce((a, b) => a + b, 0) / this.perfFrames.length;
    const ships = [...this.playerSide(), ...this.enemies].filter((s) => s.active).length;
    const shots = this.playerWeapons.projectiles.filter((p) => p.active).length + this.enemyWeapons.projectiles.filter((p) => p.active).length;
    this.perfText?.setText(`fps ${Math.round(this.game.loop.actualFps)}  ·  艦 ${ships}  ·  弾 ${shots}  ·  処理 ${avg.toFixed(1)} ms`);
  }

  private battleUpdate(loopTime: number, delta: number): void {
    // Everything in the battle runs on the battle clock, which stands still while paused (#79).
    const time = loopTime - this.pausedMs;
    if (this.battleStartedAt < 0) this.battleStartedAt = time;

    // Flagship may have been destroyed by a physics overlap callback in the previous frame.
    // Guard here before accessing .body in handleMovement to prevent a null-body crash.
    // The steered flagship lost: another of the player's fleets takes over (#84) before the battle is lost.
    if (!this.flagship.active || !this.flagship.isAlive) {
      if (!this.switchControl()) {
        this.loseAtSea();
        this.triggerGameOver(false);
        return;
      }
    }

    const dtSec = delta / 1000;
    this.arriveAllies((time - this.battleStartedAt) / 1000);
    this.burnAndFlood(delta);
    this.updateSubmarines(dtSec);
    this.playerRecon.update(time, delta, aaGuns(this.enemies), this.enemies);
    this.enemyRecon.update(time, delta, aaGuns(this.playerSide()), this.playerSide());
    this.updateConsumables(this.battleNow(), dtSec);
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
      this.loseAtSea();
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
    this.voyage?.update();
    if (this.voyage) this.updateSky(time);
    if (this.voyage) this.updateSeaFights(time);
    this.updateHazards(dtSec);
    this.updateConvoy(dtSec);
    // 航行距離 (#92): every ship of the player's own fleets, at the speed it is making.
    for (const s of this.friendlies()) if (s.isAlive && s.body) this.sailedPx += (s.body as Phaser.Physics.Arcade.Body).velocity.length() * dtSec;
    this.playerWeapons.update(time, delta);
    this.enemyWeapons.update(time, delta);
    this.updateAir(time, delta, playerView, enemyView);
    this.watchShips();
    this.updateCommentary();

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

    this.updateGroups(enemyView, time, delta);
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
    this.minimap.update(this.playerSide(), this.enemies, this.seenByPlayer, this.nearResidents.map(({ r, pos }) => ({ x: this.nearX(pos.x), y: pos.y, kind: r.kind })));
    // The open sea (#445): its fights are settled one by one (updateSeaFights), never the whole battle.
    if (!this.voyage) this.checkWinLoss();
  }

  /** The player's own ships: the fleet steered and its 支援艦隊 (#84), whose damage and experience carry over. */
  private friendlies(): BaseShip[] {
    return [this.flagship, ...this.escorts, ...this.groups.filter((g) => g.owned).flatMap((g) => g.ships)];
  }

  /** Everything on the player's side the enemy can shoot at: warships, the fleets beside them and the convoy at sea. */
  private playerSide(): BaseShip[] {
    return [this.flagship, ...this.escorts, ...this.groups.flatMap((g) => g.ships), ...this.convoy.filter((c) => c.active)];
  }

  // -------------------------------------------------------------------------
  // 支援艦隊 (#84) and 友軍艦隊 (#64)
  // -------------------------------------------------------------------------

  /** Where the n-th fleet beside the main one starts: alternately left and right of it, further out each pair. */
  private groupSpawn(n: number): { x: number; y: number } {
    const base = this.flagshipSpawn();
    const side = n % 2 === 0 ? -1 : 1;
    const step = Math.floor(n / 2) + 1;
    return { x: Math.max(80, Math.min(WORLD.w - 80, base.x + side * step * 320)), y: base.y + step * 60 };
  }

  /** An AI for a ship of a fleet beside the player's: escorts keep station on the steered flagship, the rest go hunting. */
  private groupAI(ship: BaseShip, mission: FleetMission, nation: Nation, slot: number, lead?: BaseShip): AISystem {
    const ai = new AISystem(this.playerWeapons, TACTICS[nation], WORLD_BOUNDS);
    ai.patrol = { x: ship.x, y: WORLD.h / 2 };
    if (mission === 'escort') {
      ai.station = { lead: this.flagship, offset: FormationSystem.getOffsets(Formation.Circle, slot + 6)[slot + 5] };
      ai.leash = FLEET_LEASH;
    } else if (lead && lead !== ship && slot > 0) {
      // The rest of a fleet keeps its line behind its own flagship and fights from there (#400).
      ai.station = { lead, offset: FormationSystem.getOffsets(Formation.LineAhead, slot)[slot - 1] };
      ai.leash = FLEET_LEASH;
    }
    return ai;
  }

  /** A fleet whose flagship sank closes up on the first ship still afloat (#400). */
  private regroup(g: IFleetGroup): void {
    const lead = g.ships.find((s) => s.isAlive);
    if (!lead) return;
    let slot = 0;
    g.ships.forEach((s, i) => {
      const ai = g.ais[i];
      if (!s.isAlive || g.mission === 'escort') return;
      if (s === lead) {
        ai.station = null;
        ai.leash = null;
        return;
      }
      slot++;
      ai.station = { lead, offset: FormationSystem.getOffsets(Formation.LineAhead, slot)[slot - 1] };
      ai.leash = FLEET_LEASH;
    });
  }

  private spawnGroup(ships: IShipData[], label: string, mission: FleetMission, owned: boolean, nation: Nation, captainIds: (string | null)[] = [], place?: { x: number; y: number }): void {
    const at = place ?? this.groupSpawn(this.groups.length);
    const offsets = FormationSystem.getOffsets(Formation.LineAhead, Math.max(0, ships.length - 1));
    const group: IFleetGroup = { label, ships: [], ais: [], owned, mission, nation };
    ships.forEach((raw, i) => {
      const data = owned ? this.rebuilt(raw) : raw;
      const pos = i === 0 ? at : FormationSystem.getWorldPositionFromValues(at.x, at.y, 0, offsets[i - 1]);
      const captainId = captainIds[i];
      const captainData = captainId ? DataLoader.getCaptains(this).find((c) => c.id === captainId) : undefined;
      const captain = owned && captainData ? withProgress(captainData, loadProgress().captainXp[captainData.id] ?? 0) : null;
      const ship = this.spawnShip(data, pos.x, pos.y, owned ? this.playerModifiers(data, captain, false) : NO_MODIFIERS);
      if (owned) {
        if (captain) this.captains.set(ship, captain);
        this.applyStartingDamage(ship);
        this.playerAir.register(ship, AirOpsSystem.wingFor(data, ship.mods, this.playerAirFor(data)));
      } else {
        ship.setTint(ALLY_TINT);
      }
      this.playerRecon.register(ship);
      group.ships.push(ship);
      group.ais.push(this.groupAI(ship, mission, nation, i, group.ships[0]));
    });
    if (group.ships.length > 0) this.groups.push(group);
    // Their HP on the field (#394), when the HUD is up (fleets placed before it are added when it is made).
    if (this.hudReady) this.hud.addAllies(this, group.ships, owned);
  }

  /** The player's 支援艦隊 (#84), each fighting by its mission. */
  private spawnSupportFleets(nation: Nation): void {
    if (this.scenario) return;
    (this.battleData?.support ?? []).forEach((g, i) => this.spawnGroup(g.ships, `第${i + 2}艦隊`, g.mission, true, nation, g.captainIds));
  }

  /** The area's 友軍艦隊 (#64): those there from the start join now, the others when their time comes. */
  private queueAllies(area: ICampaignArea | undefined): void {
    // 友軍の巡回 (#65 第 3 段階): the navy's patrol near the fight joins it after a while.
    const patrol = this.battleData?.world?.ally;
    if (patrol) {
      const registry = DataLoader.getRegistry(this);
      const ships = patrol.shipIds.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
      if (ships.length > 0) this.pendingAllies.push({ ships, arriveSec: PATROL_ARRIVE_SEC, name: patrol.name, nation: patrol.nation as Nation });
    }
    if (!area || this.exercise || this.scenario) return;
    const registry = DataLoader.getRegistry(this);
    for (const a of (area.allies ?? []).filter((x) => !x.for || x.for.includes(this.playerNation))) {
      const ships = a.ships.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
      if (ships.length === 0) continue;
      const entry = { ships, arriveSec: a.arriveSec ?? 0, name: a.name ?? '友軍艦隊', nation: a.nation as Nation };
      if (entry.arriveSec <= 0) this.spawnGroup(entry.ships, entry.name, defaultMission(entry.ships), false, entry.nation);
      else this.pendingAllies.push(entry);
    }
  }

  /** Allies whose time has come join the battle. */
  private arriveAllies(elapsedSec: number): void {
    const due = this.pendingAllies.filter((a) => allyArrived(a, elapsedSec));
    if (due.length === 0) return;
    this.pendingAllies = this.pendingAllies.filter((a) => !due.includes(a));
    for (const a of due) {
      const before = this.groups.length;
      this.spawnGroup(a.ships, a.name, defaultMission(a.ships), false, a.nation, [], a.at);
      for (const s of this.groups.slice(before).flatMap((g) => g.ships)) {
        this.trails.add(s);
        this.friendlyTargets.push(s);
        this.landColliders.push(s);
      }
      this.showToast(`友軍到着: ${a.name}`);
    }
  }

  /** Every fleet beside the player's fights by its mission. */
  private updateGroups(enemyView: IShipView[], time: number, delta: number): void {
    for (const g of this.groups) {
      const lead = g.ais.find((ai) => ai.station && g.mission !== 'escort')?.station?.lead;
      if (lead && !lead.isAlive) this.regroup(g);
      const foes = missionFoes(g.mission, enemyView.map((v, i) => ({ ...v, shipClass: this.enemies[i].stats.shipClass, alive: this.enemies[i].isAlive })));
      g.ships.forEach((ship, i) => {
        if (ship.isAlive) g.ais[i].update(ship, foes, time, delta);
      });
    }
  }

  /** The player takes the helm of another of their fleets (#84); the one steered so far fights on by itself. */
  private switchControl(): boolean {
    const next = this.groups.find((g) => g.owned && g.ships.some((s) => s.isAlive));
    if (!next) return false;
    const nation = this.playerNation;
    const old = [this.flagship, ...this.escorts].filter((s) => s.active && s.isAlive);
    this.groups = this.groups.filter((g) => g !== next);
    if (old.length > 0) {
      const g: IFleetGroup = { label: this.controlLabel, ships: old, ais: [], owned: true, mission: 'strike' };
      g.ais = old.map((s, i) => this.groupAI(s, 'strike', nation, i, old[0]));
      this.groups.push(g);
    }
    const alive = next.ships.filter((s) => s.isAlive);
    this.flagship = alive[0];
    this.escorts = alive.slice(1);
    const offsets = FormationSystem.getOffsets(this.formation, this.escorts.length);
    this.escortAISystems = this.escorts.map((_, i) => new EscortAISystem(this.playerWeapons, offsets[i], TACTICS[nation]));
    // Escorts of the fleets beside keep station on whichever flagship is steered now.
    for (const g of this.groups) g.ais.forEach((ai) => { if (ai.station) ai.station = { ...ai.station, lead: this.flagship }; });
    this.controlLabel = next.label;
    this.playerWeapon = primaryWeapon(this.flagship.loadout) ?? FALLBACK_WEAPON;
    this.cameras.main.startFollow(this.flagship, true, CAMERA_LERP, CAMERA_LERP);
    this.showToast(`${this.controlLabel}を操作`);
    this.refreshSwitchBtn();
    return true;
  }

  /** A line at the top of the screen for a few seconds: an ally arriving, the fleet now steered. */
  private showToast(text: string): void {
    const t = this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 170 : 110, text, textStyle(16, Css.gold, { fontStyle: 'bold' }))
      .setOrigin(0.5).setDepth(DEPTH_HUD + 3).setScrollFactor(0);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
  }

  private refreshSwitchBtn(): void {
    const others = this.groups.filter((g) => g.owned && g.ships.some((s) => s.isAlive));
    this.switchBtn?.setVisible(others.length > 0).setLabel(`艦隊切替 (${this.controlLabel})`);
  }

  /** Breakthrough / escape zone of a scenario: a dashed gold ring with its name. */
  private drawObjectiveZone(): void {
    const zone = this.side?.zone;
    if (!zone) return;
    const c = this.zonePoint(zone);
    const r = this.zoneRadiusHere(zone.r);
    const g = this.add.graphics().setDepth(DEPTH_WATER_FX);
    g.fillStyle(Colors.gold, 0.06);
    g.fillCircle(c.x, c.y, r);
    g.lineStyle(2, Colors.gold, 0.6);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      g.beginPath();
      g.arc(c.x, c.y, r, a, a + Math.PI / 36);
      g.strokePath();
    }
    const t = this.add.text(c.x, c.y, zone.label, textStyle(14, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0.5).setDepth(DEPTH_WATER_FX);
    if (this.frame) this.frameGfx.push(g, t);
  }

  /** A point of the battle square (0..1): the battle's own sea, or the objective's ground at sea (0.0.70). */
  private zonePoint(p: { x: number; y: number }): { x: number; y: number } {
    return this.frame ? framePoint(this.frame, p) : placeAt(p, WORLD.w, WORLD.h);
  }

  private zoneRadiusHere(r: number): number {
    return this.frame ? frameRadius(this.frame, r) : zoneRadius(r, WORLD.w, WORLD.h);
  }

  private inZoneHere(x: number, y: number, zone: { x: number; y: number; r: number }): boolean {
    return this.frame ? inFrameZone(this.frame, x, y, zone) : inZone(x, y, zone, WORLD.w, WORLD.h);
  }

  /** 海の障害 (#368): the sea's minefields and nets, by its depth and objective (none in exercises or scenarios). */
  private setupHazards(area: ICampaignArea | undefined): void {
    if (!area || this.exercise || this.scenario) return;
    const plan = hazardPlan(area, areaDepth(campaignData as ICampaignData, area, this.playerNation));
    const f = this.frame;
    if (f) {
      // At sea (0.0.70): laid out on the battle square, then turned onto the ocean.
      const core = { x: f.size / 2, y: f.size / 2, r: SEA_ISLAND_R };
      this.hazards = placeHazards(plan, area.id, { w: f.size, h: f.size }, this.objective === Objective.Bombard ? core : undefined).map((z) => ({ ...z, ...framePixel(f, z) }));
    } else {
      const island = [...this.map.islands].sort((a, b) => b.reduce((n, c) => n + c.r, 0) - a.reduce((n, c) => n + c.r, 0))[0]?.[0];
      this.hazards = placeHazards(plan, area.id, WORLD, this.objective === Objective.Bombard ? island : undefined);
    }
    if (this.hazards.length === 0) return;
    this.hazardGfx = this.add.graphics().setDepth(DEPTH_WATER_FX);
    this.hazardLabels = this.hazards.map((z) => this.add.text(z.x, z.y, HAZARD_LABEL[z.kind], textStyle(13, z.kind === 'minefield' ? Css.danger : Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0.5).setDepth(DEPTH_WATER_FX));
    this.drawHazards();
  }

  private drawHazards(): void {
    const g = this.hazardGfx;
    if (!g) return;
    g.clear();
    this.hazards.forEach((z, i) => {
      const live = z.charge > 0;
      this.hazardLabels[i]?.setVisible(live);
      if (!live) return;
      const color = z.kind === 'minefield' ? Colors.danger : Colors.gold;
      g.fillStyle(color, z.kind === 'minefield' ? 0.05 + 0.07 * z.charge : 0.04);
      g.fillCircle(z.x, z.y, z.r);
      g.lineStyle(2, color, 0.55);
      const step = z.kind === 'minefield' ? Math.PI / 14 : Math.PI / 30;
      for (let a = 0; a < Math.PI * 2; a += step) {
        g.beginPath();
        g.arc(z.x, z.y, z.r, a, a + step / 2);
        g.strokePath();
      }
    });
  }

  /** Mines struck and swept, nets for the submarines, and the landing parties (#368), every frame. */
  private updateHazards(dtSec: number): void {
    if (this.hazards.length > 0) {
      let changed = false;
      const own = this.playerSide().filter((s) => s.isAlive && !s.isConvoy);
      this.hazards = this.hazards.map((z) => {
        if (z.kind !== 'minefield' || z.charge <= 0) return z;
        const inside = own.filter((s) => inHazard(z, s.x, s.y));
        for (const s of inside) {
          const speed = (s.body as Phaser.Physics.Arcade.Body | null)?.velocity.length() ?? 0;
          if (Math.random() < mineChance(z, speed, dtSec, { submerged: s.submerged, sweeper: isSweeper(s.stats.shipClass) })) {
            s.takeDamage(Math.round(s.stats.maxHp * MINE_DAMAGE));
            this.minesStruck++;
            this.explosion.play(s.x, s.y);
            this.sound3d('explosion', s.x, s.y);
            if (s === this.flagship) this.showToast('触雷');
          }
        }
        const swept = sweep(z, inside.filter((s) => isSweeper(s.stats.shipClass)).length, dtSec);
        if (swept.charge !== z.charge) changed = true;
        if (swept.charge <= 0) {
          this.fieldsSwept++;
          this.showToast('掃海完了: 機雷原を除きました');
        }
        return swept;
      });
      if (changed) this.drawHazards();
    }
    // 上陸支援: the next landing party goes ashore when its time comes and a ship stands close to the island.
    if (this.objective !== Objective.Bombard || this.landTargets.length === 0) return;
    const alive = this.landTargets.filter((t) => t.isAlive);
    if (alive.length === 0) return;
    const own = this.playerSide().filter((s) => s.isAlive && !s.isConvoy);
    const near = (t: BaseShip): number => Math.min(...own.map((s) => Phaser.Math.Distance.Between(s.x, s.y, t.x, t.y)));
    const target = alive.reduce((best, t) => (near(t) < near(best) ? t : best), alive[0]);
    if (!landingDue(this.battleNow(), this.landings, near(target))) return;
    this.landings++;
    target.takeDamage(Math.round(target.stats.maxHp * LANDING_DAMAGE));
    this.explosion.play(target.x, target.y);
    this.sound3d('explosion', target.x, target.y);
    this.showToast(`上陸支援: 上陸部隊が ${target.stats.name} を攻撃`);
  }

  /** Convoy: three merchant ships start on the west edge with the escort fleet beside them. */
  private spawnConvoy(): void {
    const data = (specialData as unknown as ISpecialData).convoy as IShipData;
    const f = this.frame;
    for (const dy of [-90, 0, 90]) {
      // At sea (0.0.70) the convoy starts on the side the fleet came from and makes for the far side.
      const at = f ? framePixel(f, { x: CONVOY_START_X, y: f.size / 2 + dy }) : { x: CONVOY_START_X, y: WORLD.h / 2 + dy };
      const ship = this.spawnShip(data, at.x, at.y);
      ship.isConvoy = true;
      ship.setAngle(f ? headingTo(at, framePoint(f, { x: 1, y: 0.5 })) : 90);
      this.convoy.push(ship);
    }
  }

  /** Merchant ships sail east at their own pace; reaching the far edge counts as escaped. */
  private updateConvoy(dtSec: number): void {
    const f = this.frame;
    for (const ship of this.convoy) {
      if (!ship.isAlive) continue;
      if (f) {
        // The battle square's own coordinates (0..1): across it from its west side to its east.
        const dx = ship.x - f.cx;
        const dy = ship.y - f.cy;
        const lx = (dx * f.cos + dy * f.sin) / f.size + 0.5;
        const ly = (-dx * f.sin + dy * f.cos) / f.size + 0.5;
        if (lx >= 1 - CONVOY_EXIT_MARGIN / f.size) {
          this.convoyEscaped++;
          ship.setActive(false).setVisible(false);
          (ship.body as Phaser.Physics.Arcade.Body).enable = false;
          continue;
        }
        const s = waypointSteer(ship, framePoint(f, { x: 1.05, y: ly }), 10);
        if (s) ship.steer({ headingDeg: s.headingDeg, throttle: 1 }, dtSec, 40);
        continue;
      }
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
    const island = this.frame ? [this.seaIsland()] : [...this.map.islands].sort((a, b) => b.reduce((n, c) => n + c.r, 0) - a.reduce((n, c) => n + c.r, 0))[0];
    if (!island) return;
    const special = specialData as unknown as ISpecialData;
    const core = island[0];
    const spots = special.bombardLayout.map((_, i, all) => {
      const a = (i / all.length) * Math.PI * 2;
      return { x: core.x + Math.cos(a) * core.r * 0.55, y: core.y + Math.sin(a) * core.r * 0.55 };
    });
    // 地上兵器 (#251): the batteries are the enemy navy's own shore defences, heavier in the deeper seas.
    const area = (campaignData as ICampaignData).areas.find((a) => a.id === this.battleData?.areaId);
    const depth = area ? areaDepth(campaignData as ICampaignData, area, loadProgress().nation) : 0;
    bombardLineup(special.bombardLayout, area?.id ?? '', this.enemyNation, depth).forEach((id, i) => {
      const weapon = GROUND_WEAPONS.find((g) => g.id === id);
      const data = (weapon ?? special.landTargets.find((t) => t.id === id)) as IShipData | undefined;
      if (!data) return;
      const target = this.spawnShip(data, spots[i].x, spots[i].y, weapon?.mods ? combineModifiers(weapon.mods) : NO_MODIFIERS, false);
      target.isLand = true;
      target.setTint(0xffb0a0);
      (target.body as Phaser.Physics.Arcade.Body).setImmovable(true);
      this.enemies.push(target);
      this.landTargets.push(target);
      // 飛行場 (#83): its air group strikes the fleet until it is destroyed.
      // 陸上機 (#408): the airfield flies its navy's land planes of the sea's year.
      if (data.airWing) this.enemyAir.register(target, AirOpsSystem.wingFor(data, NO_MODIFIERS, { perf: eraLandPerf(this.enemyNation, airfieldYear(depth)) }));
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
    // The open sea (#445) starts with no enemy: they are met as the fleet sails.
    const enemies = this.battleData?.openSea ? [] : generateEnemyFleet(registry, Nation.USN, this.battleData?.mode ?? BattleMode.Surface);
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
    // 主砲 2 基 (#416): a design's two main guns share its turrets.
    return loadout.length > 0 ? designLoadout(shipData, loadout) : [FALLBACK_WEAPON];
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
    if (this.map.islands.length > 0 || this.battleData?.openSea) ship.avoid = (px, py, h) => avoidHeading(this.map, px, py, h);
    ship.mods = mods;
    ship.clock = () => this.battleNow();
    const night = this.conditions.time === TimeOfDay.Night;
    ship.visionMul = mods.visionMul * (night ? mods.nightVisionMul : 1);
    ship.aimErrorMul = night ? mods.nightAimMul : 1;
    ship.aaMul = mods.aaMul;
    // 潜水研究 (#426): longer dives and a quicker boat under water.
    if (ship.sub && (mods.diveMul !== 1 || mods.submergedSpeedMul !== 1)) ship.sub = createSubmarineState(false, mods.diveMul, mods.submergedSpeedMul);
    ship.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
    (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
    return ship;
  }

  /** A ship's 中分類 subtype from its data (#426). */
  /** 艦ごとの戦歴 (#416): sinkings by class, the battle and heavy damage for every owned ship; the giant's history. */
  private recordShips(progress: IProgress, fleet: BaseShip[], seconds: number): IProgress {
    const owned = fleet.filter((s) => s.dataId && progress.ships.includes(s.dataId));
    const shipRecords = { ...(progress.shipRecords ?? {}) };
    for (const ship of owned) {
      const sank = this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy && e.lastHitBy === ship).map((e) => e.stats.shipClass);
      const heavy = !ship.isAlive || ship.stats.currentHp / Math.max(1, ship.stats.maxHp) <= HEAVY_DAMAGE;
      shipRecords[ship.dataId!] = addBattle(shipRecords[ship.dataId!], sank, heavy);
    }
    const giant = this.superweapon?.dataId;
    const giantRecords = giant ? { ...(progress.giantRecords ?? {}), [giant]: addGiantBattle(progress.giantRecords?.[giant], !this.superweapon!.isAlive, seconds) } : progress.giantRecords ?? {};
    return { ...progress, shipRecords, giantRecords };
  }

  /** 制海権 (#50): what this campaign battle does to the seas held (see SeaControlSystem). */
  private seaAfterBattle(progress: IProgress, area: ICampaignArea, victory: boolean, now: number): { progress: IProgress; line: string } {
    let sea = progress.sea ?? emptySeaControl();
    const lines: string[] = [];
    if (this.battleData?.defense) {
      const held = sea.counter?.areaId === area.id;
      sea = settleDefense(sea, area.id, victory);
      if (victory && held) {
        const reward = defenseReward(area.reward);
        const g = gainResources(progress.resources, reward, holdCap(progress.facilities));
        progress = { ...progress, resources: g.resources, ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(reward, g.lost, -1), now), 'overflow', g.lost, now) };
        progress = withQuestEvents(progress, [['defenseWin', 1]], now);
        lines.push(`制海権を守りました: ${area.name}  防衛の報酬 ${formatResources(reward)}${lostNote(g.lost)}`);
      } else if (!victory && held) {
        lines.push(`制海権を失いました: ${area.name} (もう一度攻略すると取り返せます)`);
      }
    } else {
      if (victory && sea.lost.includes(area.id)) {
        sea = retakeArea(sea, area.id);
        progress = withQuestEvents(progress, [['seaRetake', 1]], now);
        lines.push(`制海権を取り返しました: ${area.name}`);
      }
      const data = campaignData as ICampaignData;
      const theaters = theatersFor(data, progress.nation).map((t) => t.id);
      const counted = countSortie(sea, counterTargets(data.areas, progress.campaign, sea, theaters), now);
      sea = counted.sea;
      const target = counted.started ? data.areas.find((a) => a.id === counted.started!.areaId) : undefined;
      if (target) lines.push(`敵の反攻: ${target.name} に敵艦隊が迫っています。${COUNTER_HOURS} 時間以内に作戦の地図から防衛戦へ`);
    }
    return { progress: { ...progress, sea }, line: lines.join('  ·  ') };
  }

  private subtypeOf(ship: BaseShip): ShipSubtype | undefined {
    return ship.dataId ? DataLoader.getRegistry(this).byId(ship.dataId)?.subtype : undefined;
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
    if (this.scenario) return combineModifiers(captainModifiers(captain, captainCtx, [], undefined, shipData.shipClass), formation, skillModifiers(skillOf(shipData.id), 0));
    const progress = loadProgress();
    // Every copy fitted counts (#55): a part taken from an enemy needs no research.
    // 装備改修 (#368): each upgrade at the navy's ★.
    const catalog = improvedCatalog(DataLoader.getUpgrades(this), progress.equipStars);
    const fitted = progress.upgrades[shipData.id] ?? [];
    const stage = progress.refits[shipData.id] ?? 0;
    return combineModifiers(
      upgradeModifiers(fitted, catalog, upgradeSlots(stage)),
      researchModifiers(TECH_TREE, progress.research),
      // 国家方針 (#49): the lasting bonus of the focuses done, for this class.
      focusModifiers(progress.nation, progress.focus, shipData.shipClass),
      refitModifiers(REFIT_TABLE, shipData, stage, progress.refitBranches[shipData.id]),
      // The captain's own speciality, learned skills, abilities and earned traits (#45), by aptitude for the ship (#131).
      captainModifiers(captain, captainCtx, captain ? progress.captainSkills[captain.id] ?? [] : [], captain ? progress.captainStats[captain.id] : undefined, shipData.shipClass,
        captain ? progress.captainBonus[captain.id] ?? [] : []),
      formation,
      // 固有スキル (#58)
      skillModifiers(skillOf(shipData.id), stage),
      // 艦隊技術 (#56): what collecting and raising the navy's ships of this class has earned.
      techModifiers(shipData.shipClass, this.techLevelOf(shipData.shipClass)),
      // 士気 (#54): a cheerful crew dodges and reloads a little better, a tired one worse.
      moraleModifiers(moraleOf(progress, shipData.id, Date.now())),
    );
  }

  /** The player's ship as remodelled (special refits swap weapons or embark aircraft); scenarios use the original build. */
  private rebuilt(shipData: IShipData): IShipData {
    if (this.scenario) return shipData;
    const progress = loadProgress();
    // 型の載せ替え (#368): the main guns swapped on the 改装 screen.
    return withSwaps(refitShipData(REFIT_TABLE, shipData, progress.refits[shipData.id] ?? 0), progress.gunSwaps[shipData.id]);
  }

  /** Damage carried over from earlier battles, and the crew's proficiency. */
  private applyStartingDamage(ship: BaseShip): void {
    // 固有スキル (#58): the ship's own skill, stronger from 改二 (scenarios sail the original build, stage 0).
    const skill = skillOf(ship.dataId);
    const stage = this.scenario ? 0 : loadProgress().refits[ship.dataId] ?? 0;
    ship.skill = skill ? { name: skill.name, luck: luckChance(skill, stage), lastStand: lastStandArmor(skill, stage) } : null;
    ship.lastStandOn = false;
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
    if (this.battleData?.openSea) return OpenSeaVoyage.startPoint(this.battleData.openSeaFrom ?? homeAnchor(this.playerNation));
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
    this.playerAir.register(this.flagship, AirOpsSystem.wingFor(flagshipData, this.flagship.mods, this.playerAirFor(flagshipData)));
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
      this.playerAir.register(escort, AirOpsSystem.wingFor(escortData, escort.mods, this.playerAirFor(escortData)));
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
    // 特別海域 (#416): one class of ship against the main fleet, which comes in a little weaker.
    // 外洋 (#65): the group's strength follows the danger of the water.
    const world = this.battleData?.world;
    const scaled = scaleModifiers((area && !this.exercise ? enemyScale(campaignData as ICampaignData, area, this.playerNation) : world ? worldEnemyScale(world.danger) * (world.controlled ? CONTROL_ENEMY_MUL : 1) : 1) * (this.battleData?.special ? SPECIAL_ENEMY_SCALE : 1));
    // A theater's first area (#433): its torpedoes hit softer still, so one spread doesn't decide the navy's first fight.
    const opening = area !== undefined && !this.exercise && isOpeningArea(area, areaDepth(campaignData as ICampaignData, area, this.playerNation));
    const reach = opening ? { ...scaled, torpedoPowerMul: (scaled.torpedoPowerMul ?? 1) * OPENING_TORPEDO_MUL } : scaled;
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
        this.superweaponParts = this.add.text(enemy.x, enemy.y - 80, partsLine(1), textStyle(12, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4 }))
          .setOrigin(0.5).setDepth(DEPTH_HUD - 3);
      }
      enemy.setAngle(placed ? placed.angle : 180);
      this.enemies.push(enemy);
      // 敵空母の機種 (#368): the planes of the carrier's own year.
      this.enemyAir.register(enemy, AirOpsSystem.wingFor(shipData, NO_MODIFIERS, { perf: eraWingPerf(shipData.nation, shipData.year) }));
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

  /**
   * 演習の敵の支援艦隊 (#404): the n-th fleet beside the enemy's main one, left and right of it in turn as the
   * player's are, in line ahead behind its own flagship until it has a target.
   */
  private spawnEnemyGroup(ships: IShipData[], n: number, nation: Nation): void {
    const main = this.enemies[0];
    if (!main || ships.length === 0) return;
    const side = n % 2 === 0 ? 1 : -1;
    const step = Math.floor(n / 2) + 1;
    const at = { x: Math.max(80, Math.min(WORLD.w - 80, main.x + side * step * 320)), y: Math.max(80, main.y - step * 60) };
    const offsets = FormationSystem.getOffsets(Formation.LineAhead, Math.max(0, ships.length - 1));
    let lead: BaseShip | null = null;
    ships.forEach((shipData, i) => {
      const pos = i === 0 ? at : FormationSystem.getWorldPositionFromValues(at.x, at.y, 180, offsets[i - 1]);
      const enemy = this.spawnShip(shipData, pos.x, pos.y, NO_MODIFIERS);
      enemy.aimErrorMul *= this.difficulty.aimMul;
      enemy.stats.maxHp = Math.round(enemy.stats.maxHp * this.difficulty.hpMul);
      enemy.stats.currentHp = enemy.stats.maxHp;
      enemy.setTint(0xdd4444);
      enemy.setAngle(180);
      this.enemies.push(enemy);
      this.enemyAir.register(enemy, AirOpsSystem.wingFor(shipData, NO_MODIFIERS, { perf: eraWingPerf(shipData.nation, shipData.year) }));
      this.enemyRecon.register(enemy);
      const ai = new AISystem(this.enemyWeapons, TACTICS[nation], WORLD_BOUNDS);
      ai.patrol = { x: enemy.x, y: WORLD.h / 2 };
      if (i === 0) lead = enemy;
      else if (lead) ai.station = { lead, offset: offsets[i - 1] };
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
      ship.envSpeedMul = this.conditions.speedMul * (inShoal(this.map, ship.x, ship.y) ? SHOAL_SPEED : 1)
        // 防潜網 (#368): the player's submarines crawl inside the enemy's nets.
        * (this.hazards.length > 0 && !this.enemies.includes(ship) ? netSpeedMul(this.hazards, ship.stats.shipClass, ship.x, ship.y) : 1);
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
    // 基地航空隊 (#373): the base's scouts show the whole enemy fleet for the first seconds of the battle.
    if (air === this.playerAir && this.baseAirLevel > 0 && this.battleNow() < this.baseScoutMs) {
      sources.push({ kind: 'circle', x: WORLD.w / 2, y: WORLD.h / 2, radius: Math.hypot(WORLD.w, WORLD.h) });
    }
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
      // 消耗品 (#47): smoke hides a ship from all but the closest; searching finds a boat under water.
      const seen = enemy.submerged
        ? isDetected(enemy, playerHunters) || this.heardBySearch(enemy, this.playerSide())
        : (isVisible(enemy.x, enemy.y, playerSight) && !this.inSmoke(enemy, this.playerSide())) || this.flashed(enemy, this.enemyWeapons, this.playerSide());
      if (seen) this.seenByPlayer.add(enemy);
      enemy.setVisible(seen).setAlpha(enemy.submerged ? SUBMERGED_ALPHA : 1);
    }
    for (const ship of this.playerSide()) {
      if (!ship.isAlive) continue;
      const seen = ship.submerged
        ? isDetected(ship, enemyHunters) || this.heardBySearch(ship, this.enemies)
        : (isVisible(ship.x, ship.y, enemySight) && !this.inSmoke(ship, this.enemies)) || this.flashed(ship, this.playerWeapons, this.enemies);
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
    // ソナー音 (#104): one ping as each sweep starts.
    if (phase < this.sonarPhase) audio.play('sonar');
    this.sonarPhase = phase;
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
    audio.play(this.wantDive ? 'dive' : 'surface');
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
    this.stormFx = null;
    this.weatherChip = null;
    // At sea the storm can come and go (0.0.72): the rain is made once and shown while the storm lasts.
    if (c.weather === Weather.Storm || this.battleData?.openSea) {
      this.stormFx = this.add
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
        .setDepth(DEPTH_HUD - 4)
        .setVisible(c.weather === Weather.Storm);
      if (c.weather !== Weather.Storm) this.stormFx.stop();
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
    this.drawWeatherChip();
  }

  private drawWeatherChip(): void {
    const c = this.conditions;
    this.weatherChip?.destroy();
    const label = `${WEATHER_LABEL[c.weather]}  ·  ${TIME_LABEL[c.time]}`;
    this.weatherChip = addChip(this, 20, IS_PORTRAIT ? 236 : 84, label, c.time === TimeOfDay.Night ? Colors.blue : Colors.cyan, c.time === TimeOfDay.Night ? Css.blue : Css.cyan)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 2);
  }

  /** The world's sky over a point of the open sea (世界の時計と天候, 0.0.72). */
  private skyAt(p: { x: number; y: number }, now = Date.now()): ISeaSky {
    const s = sectorAt(((p.x % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w, p.y);
    return seaSky(now, s.c, s.r, lonLatOf(s).lon, WORLD_MAP.cols, WORLD_MAP.rows);
  }

  /**
   * At sea the sky changes as the world's clock runs and the fronts drift (0.0.72): night falls, a storm comes on.
   * Every ship's sight, the guns' aim, the fog and the rain follow.
   */
  private updateSky(time: number): void {
    if (time < this.skyCheckAt || !this.flagship?.active) return;
    this.skyCheckAt = time + 2000;
    const sky = this.skyAt(this.flagship);
    const c = this.conditions;
    if (sky.weather === c.weather && sky.time === c.time) return;
    const before = c;
    this.conditions = battleConditions(sky.weather, sky.time);
    const now = this.conditions;
    const night = now.time === TimeOfDay.Night;
    this.playerWeapons.aimError = now.aimError;
    this.enemyWeapons.aimError = now.aimError;
    for (const ship of [...this.playerSide(), ...this.enemies]) {
      const m = ship.mods ?? NO_MODIFIERS;
      ship.visionMul = m.visionMul * (night ? m.nightVisionMul : 1);
      ship.aimErrorMul = night ? m.nightAimMul : 1;
    }
    this.fog.setLook(now.fogColor, now.fogAlpha);
    if (this.stormFx) {
      this.stormFx.setVisible(now.weather === Weather.Storm);
      if (now.weather === Weather.Storm) this.stormFx.start();
      else this.stormFx.stop();
    }
    this.drawWeatherChip();
    if (before.time !== now.time) this.seaNote(night ? '日が暮れました。夜は視界が狭くなります' : '夜が明けました');
    else this.seaNote(`天候が変わりました: ${WEATHER_LABEL[now.weather]}`);
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
    const playerAuto = (carrier: BaseShip): boolean => carrier !== this.baseAirField && (carrier !== this.flagship || this.isTouch || this.autoMode);
    this.updateBaseAir(enemyView);
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
      (carrier, foes) => {
        // Strikes spread out (#328): a ship already under attack draws fewer, and the flagship (the battle) less
        // still — every strike went for it and sank it in seconds before the guns had a say.
        const aimed = (ship: BaseShip): number => this.enemyAir.squadrons.filter((q) => q.alive && q.target === ship).length;
        const view = foes.map((f) => ({ ...f, attackers: (f.attackers ?? 0) + 2 * aimed(f.ship), priority: (f.priority ?? 0) + (f.ship === this.flagship ? AIR_FLAGSHIP_PRIORITY : 0) }));
        const chosen = pick(this.enemyNation)(carrier, view);
        return chosen ? foes.find((f) => f.ship === chosen.ship) ?? null : null;
      },
    );
  }

  /**
   * 基地航空隊 (#373): a campaign battle in a sea whose forward base has an air group. Lv1 scouts (the enemy shows for
   * the first seconds); Lv2 and Lv3 also send one or two strikes from an airfield out of sight, which follows the
   * flagship so the strike flies in from the fleet's side.
   */
  private setupBaseAir(area: ICampaignArea | undefined): void {
    // The scene is used again battle after battle: the last battle's base air must not carry over.
    this.baseAirLevel = 0;
    this.baseAirSent = 0;
    this.baseAirField = null;
    this.baseScoutMs = BASE_AIR_SCOUT_MS;
    if (!area || area.training || this.scenario) return;
    this.baseAirLevel = theaterFacility(loadProgress(), area.theater, 'baseAir');
    // 飛行艇 (#408): a flying boat developed keeps the scouts out longer.
    const boat = this.baseAirLevel > 0 ? flyingBoatOf(loadProgress(), this.playerNation) : undefined;
    this.baseScoutMs = BASE_AIR_SCOUT_MS * (boat ? FLYING_BOAT_SCOUT_MUL : 1);
    if (this.baseAirLevel < 2) return;
    const special = specialData as unknown as ISpecialData;
    const strip = special.landTargets.find((t) => t.airWing) as IShipData | undefined;
    if (!strip) return;
    const data: IShipData = { ...strip, nation: this.playerNation, airWing: { fighters: 0, diveBombers: 3, torpedoBombers: 2 } };
    const field = this.spawnShip(data, this.flagship.x, this.flagship.y, NO_MODIFIERS, false);
    field.setVisible(false);
    (field.body as Phaser.Physics.Arcade.Body).enable = false;
    this.baseAirField = field;
    // 陸上機 (#408): the base flies the navy's newest land planes developed.
    this.playerAir.register(field, AirOpsSystem.wingFor(data, NO_MODIFIERS, { perf: baseAirPerf(loadProgress(), this.playerNation) }));
  }

  /** Sends the base's strikes at their times, at the nearest visible foe in reach (#373). */
  private updateBaseAir(enemyView: IShipView[]): void {
    const field = this.baseAirField;
    if (!field || this.gameOver) return;
    if (this.flagship.isAlive) field.setPosition(this.flagship.x, this.flagship.y);
    const due = BASE_AIR_STRIKES_AT[this.baseAirSent];
    if (this.baseAirSent >= this.baseAirLevel - 1 || due === undefined || this.battleNow() < due) return;
    const target = chooseTarget(aiSelf(field), this.playerAir.strikeTargets(field, enemyView), TACTICS[this.playerNation]);
    if (!target || this.playerAir.launchStrike(field, target.ship) === 0) return;
    this.baseAirSent++;
    this.showToast('基地航空隊の攻撃隊が来援');
    this.sound3d('launch', this.flagship.x, this.flagship.y);
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
      CombatSystem.applyDamage(ship, dmg, source, 'charge');
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
    // 消耗品 (#47): the flagship's two slots.
    kb.on('keydown-ONE', () => !this.paused && this.useFlagshipConsumable(0));
    kb.on('keydown-TWO', () => !this.paused && this.useFlagshipConsumable(1));
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
    this.voyage?.clearRoute();
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
    // 船団護衛 (#416): the enemy nearest the merchantmen, not the escort.
    if (this.objective === Objective.Convoy) return convoyGuardTarget(this.flagship, candidates, this.convoy.filter((s) => s.isAlive && s.active), locked)?.ship ?? null;
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
    // Kept as fields: allies arriving later (#64) join these arrays, which the colliders read in place.
    this.friendlyTargets = this.playerSide();
    const friendlyObjs = this.friendlyTargets as unknown as Phaser.GameObjects.GameObject[];
    const hit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (p, s) => {
      this.onProjectileHit(p as unknown as BaseProjectile, s as unknown as BaseShip);
    };
    // The projectile arrays grow in place as new projectiles are created, so the colliders keep up.
    this.physics.add.overlap(this.playerWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], enemyObjs, hit);
    this.physics.add.overlap(this.enemyWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], friendlyObjs, hit);
    // Land stops ships and torpedoes; shells fly over it (so shore targets can be shelled).
    this.landColliders = [...this.playerSide(), ...this.enemies.filter((e) => !e.isLand)];
    this.physics.add.collider(this.landColliders as unknown as Phaser.GameObjects.GameObject[], this.islands);
    this.addLandColliders(this.islands);
  }

  /** Land stops ships and torpedoes (the battle's islands, or a sector of the open sea as it is loaded, #445). */
  private addLandColliders(land: Phaser.Physics.Arcade.StaticGroup, withShips = false): Phaser.Physics.Arcade.Collider[] {
    const intoLand: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (p) => {
      const projectile = p as unknown as BaseProjectile;
      if (!projectile.active || !(projectile instanceof Torpedo)) return;
      this.explosion.play(projectile.x, projectile.y);
      projectile.deactivate();
    };
    const out: Phaser.Physics.Arcade.Collider[] = [];
    if (withShips) out.push(this.physics.add.collider(this.landColliders as unknown as Phaser.GameObjects.GameObject[], land));
    for (const ws of [this.playerWeapons, this.enemyWeapons]) {
      out.push(this.physics.add.overlap(ws.projectiles as unknown as Phaser.GameObjects.GameObject[], land, intoLand));
    }
    return out;
  }

  /** The open sea (#445): the battle screen sails the world, its own buttons under the minimap. */
  private startVoyage(minimapBottom: number): void {
    const nation = this.playerNation ?? Nation.IJN;
    this.voyage = new OpenSeaVoyage({
      scene: this,
      map: this.map,
      flagship: () => this.flagship,
      ships: () => this.playerSide(),
      addLand: (group) => this.addLandColliders(group, true),
      shiftWorld: (dx) => this.shiftWorld(dx),
      minimap: this.minimap,
      openChart: () => this.openChart(),
      enterPort: (baseId) => this.endVoyage(baseId),
      callAt: (id) => this.callAtSeaPort(id),
      passBy: (id) => this.passResource(id),
      openSeparation: () => this.openSeparation(),
      startDrill: (kind) => this.startDrill(kind),
      startAnniversary: (id) => this.startAnniversary(id),
    }, nation, loadProgress().openSea, this.voyagePorts(), this.battleData?.openSeaFuel ?? placeFuel(loadProgress().openSea.anchors, this.battleData?.openSeaFrom ?? homeAnchor(nation)));
    // 画面の外の艦隊 (0.0.72): the fleets under orders are brought up to now as the voyage begins.
    this.runOrders();
    this.voyage.buildUi(minimapBottom);
    audio.music('map');
    // 作戦の一覧から (0.0.69): the route to the area is sailed at once.
    const route = this.battleData?.openSeaRoute;
    if (route && route.length > 1) {
      this.voyage.setRoute(route);
      // The HUD's buttons are made later in create(): the 自動 button reads the mode when it is made (0.0.69 review).
      this.autoMode = true;
      this.waypoint = null;
    }
  }

  /** Crossing the east-west join (#445): shells in flight are dropped, aircraft and marks move with the sea. */
  private shiftWorld(dx: number): void {
    for (const ws of [this.playerWeapons, this.enemyWeapons]) for (const p of ws.projectiles) if (p.active) p.deactivate();
    for (const air of [this.playerAir, this.enemyAir]) for (const sq of air.squadrons) sq.x += dx;
    if (this.waypoint) this.waypoint = { x: this.waypoint.x + dx, y: this.waypoint.y };
    this.aimTarget = { x: this.aimTarget.x + dx, y: this.aimTarget.y };
    for (const [k, v] of this.lastSeen) this.lastSeen.set(k, { ...v, x: v.x + dx });
  }

  /** The chart over the battle (#445): the world, the explored seas, and a destination to set. */
  /** The fleets under orders brought up to now, with a note for each fight on the way (0.0.72). */
  private runOrders(): void {
    const registry = DataLoader.getRegistry(this);
    const done = runFleetOrders(loadProgress(), registry, Date.now());
    if (!done) return;
    saveProgress(done.progress);
    for (const f of done.fights) this.seaNote(fightNote(f, registry), 5000);
  }

  /** The navy's fleets away from the home port as the chart lists them (0.0.72); -1 is the one steered. */
  private chartFleets(): IChartFleet[] {
    const p = loadProgress();
    const registry = DataLoader.getRegistry(this);
    const names = Object.fromEntries(nationBases(this.playerNation).map((b) => [b.id, b.name]));
    const now = Date.now();
    const steered: IChartFleet = {
      index: -1, label: `操作中 · ${this.flagship.stats.name.replace(/\s*\(.*\)\s*$/, '')}${this.friendlies().filter((s) => s.isAlive).length > 1 ? ` ほか ${this.friendlies().filter((s) => s.isAlive).length - 1} 隻` : ''}`,
      place: '', at: sectorAt(this.flagship.x, this.flagship.y), moving: false, minHp: Math.min(...this.friendlies().filter((s) => s.isAlive).map((s) => s.stats.currentHp / Math.max(1, s.stats.maxHp))),
      fuel: this.voyage?.fuel ?? 0, rule: p.openSea.returnAt ?? 'heavy',
    };
    const others = p.openSea.anchors.map((a, index): IChartFleet => {
      const lead = registry.byId(a.shipIds[0])?.name.replace(/\s*\(.*\)\s*$/, '') ?? a.shipIds[0];
      const pos = a.order ? orderPos(a.order, now) : a.at;
      const left = a.order ? Math.max(0, arrivesAt(a.order) - now) : 0;
      const place = a.order?.patrol ? `哨戒中 (${a.order.patrol.stance === 'chase' ? '見つけた敵を追う' : '知らせるだけ'})` : a.order ? `回航中 → ${placeName(a.order.dest, names)} (あと ${Math.ceil(left / 60000)} 分)` : placeName(a.at, names);
      return {
        index, label: `${lead}${a.shipIds.length > 1 ? ` ほか ${a.shipIds.length - 1} 隻` : ''}`, place, at: sectorAt(pos.x, pos.y), moving: !!a.order,
        minHp: Math.min(...a.shipIds.map((id) => p.damage[id] ?? 1)), fuel: a.fuel ?? FUEL_MAX, rule: a.returnAt ?? 'heavy',
      };
    });
    // 遠征の航路 (0.0.73): the expeditions on their routes, to be taken over too.
    const away = p.expeditions.flatMap((run): IChartFleet[] => {
      const exp = EXPEDITIONS.find((e) => e.id === run.id);
      const plan = exp ? expeditionPlan(p.nation, exp) : null;
      if (!exp || !plan || run.startedAt === undefined || run.endsAt <= now) return [];
      const pos = expeditionPos(plan, run.startedAt, now);
      const leg = run.cut ? '引き返し中' : pos.leg === 'out' ? '往路' : pos.leg === 'station' ? '現地で行動中' : '帰路';
      return [{
        index: -2, expedition: run.id, label: `遠征「${exp.name}」`, place: `${leg} · 帰還まで ${Math.ceil((run.endsAt - now) / 60000)} 分`, at: sectorAt(pos.x, pos.y), moving: true,
        minHp: Math.min(...run.shipIds.map((id) => p.damage[id] ?? 1)), fuel: FUEL_MAX * 0.6, rule: 'heavy',
      }];
    });
    return [steered, ...others, ...away];
  }

  /** Enemy residents within six sectors of any of the navy's fleets at sea (the chart shows them, 0.0.72). */
  private sightings(): Array<{ c: number; r: number; kind: string }> {
    const p = loadProgress();
    const now = Date.now();
    const world = p.world;
    const eyes = [{ x: this.flagship.x, y: this.flagship.y }, ...p.openSea.anchors.map((a) => (a.order ? orderPos(a.order, now) : a.at))];
    const seen = new Map<string, { c: number; r: number; kind: string }>();
    for (const e of eyes) {
      for (const { r, pos } of residentsNear(this.residentList(), e, now, SECTOR_PX * 6)) {
        if (r.kind === 'friend' || seen.has(r.id) || spotWon(world, r.id)) continue;
        seen.set(r.id, { ...sectorAt(pos.x, pos.y), kind: r.kind });
      }
    }
    // 哨戒 (0.0.73): what the patrols found in the last two world hours.
    for (const x of p.openSea.sightings ?? []) if (now - x.at <= SIGHTING_MS && !seen.has(x.id) && !spotWon(world, x.id)) seen.set(x.id, { c: x.c, r: x.r, kind: x.kind });
    return [...seen.values()];
  }

  /** 回航 (0.0.72): a fleet away is sent along a sea route to the chart's destination (a base of the navy there, else the sea). */
  private orderFleet(index: number, route: Array<{ c: number; r: number }>): string | null {
    const p = loadProgress();
    const fleet = p.openSea.anchors[index];
    if (!fleet || fleet.order) return '回航中の艦隊です';
    const end = route[route.length - 1];
    const base = openBases(p).find((b) => WORLD_MAP.bases[b.id]?.c === end?.c && WORLD_MAP.bases[b.id]?.r === end?.r);
    const dest = (base ? baseAnchor(base.id) : undefined) ?? { x: (end.c + 0.5) * SECTOR_PX, y: (end.r + 0.5) * SECTOR_PX };
    const ordered = orderVoyage(fleet, route, dest, Date.now());
    if (typeof ordered === 'string') return ordered;
    saveProgress({ ...p, openSea: { ...p.openSea, anchors: p.openSea.anchors.map((a, i) => (i === index ? ordered : a)) } });
    return null;
  }

  /** 哨戒 (0.0.73): a fleet away sails to a loop round `centre` and keeps it, chasing or only reporting what it finds. */
  private patrolFleet(index: number, centre: { c: number; r: number }, stance: PatrolStance): string | null {
    const p = loadProgress();
    const fleet = p.openSea.anchors[index];
    if (!fleet || fleet.order) return '回航中の艦隊です';
    const loop = patrolLoop(centre, isSea, seaLine);
    const here = sectorAt(fleet.at.x, fleet.at.y);
    const route = here.c === loop[0].c && here.r === loop[0].r ? [here] : findRoute(here, loop[0]);
    const ordered = orderPatrol(fleet, route, loop, stance, Date.now());
    if (typeof ordered === 'string') return ordered;
    saveProgress({ ...p, openSea: { ...p.openSea, anchors: p.openSea.anchors.map((a, i) => (i === index ? ordered : a)) } });
    return null;
  }

  /** 命令を解く (0.0.73): a fleet under way or on patrol stops and lies at sea where it is. */
  private stopFleet(index: number): void {
    const p = loadProgress();
    const fleet = p.openSea.anchors[index];
    if (!fleet?.order) return;
    saveProgress({ ...p, openSea: { ...p.openSea, anchors: p.openSea.anchors.map((a, i) => (i === index ? stopOrder(a, Date.now()) : a)) } });
  }

  /** 自動の帰投の基準 (0.0.72) of a fleet away, or (-1) of the one steered. */
  private setFleetRule(index: number, rule: ReturnRule): void {
    const p = loadProgress();
    if (index < 0) saveProgress({ ...p, openSea: { ...p.openSea, returnAt: rule } });
    else saveProgress({ ...p, openSea: { ...p.openSea, anchors: p.openSea.anchors.map((a, i) => (i === index ? { ...a, returnAt: rule } : a)) } });
  }

  /**
   * 指揮を移す (0.0.72): the helm goes to another fleet, where it is now (on its way, it stops there and the rest of its
   * way is sailed by the autopilot). The fleet steered so far lies at sea here — or, if it had a route, sails it on by
   * itself. Leaving a fight counts as a withdrawal (a loss), so a losing fight can't be left without cost.
   */
  private switchToFleet(index: number | { expedition: string }): void {
    const v = this.voyage;
    if (!v) return;
    const eng = this.engagement;
    if (eng && eng.kind === 'encounter' && eng.drill) this.dropSeaFight('演習を打ち切りました');
    else if (eng) this.settleSeaFight(false);
    const p = loadProgress();
    const now = Date.now();
    // The fleet taken over: an anchorage (lying or under way), or an expedition on its route (0.0.73: called off,
    // without its reward, and steered from where it is; the way home is left to sail).
    let target: { shipIds: string[]; from: IAnchorPlace; rest: Array<{ c: number; r: number }> | null; fuel: number } | null = null;
    let base = p;
    if (typeof index === 'number') {
      const a = p.openSea.anchors[index];
      if (a) {
        const pos = a.order ? orderPos(a.order, now) : a.at;
        const dest = a.order?.dest;
        target = { shipIds: a.shipIds, from: a.order ? { x: pos.x, y: pos.y } : a.at, rest: dest ? findRoute(sectorAt(pos.x, pos.y), sectorAt(dest.x, dest.y)) : null, fuel: a.fuel ?? FUEL_MAX };
        base = { ...p, openSea: { ...p.openSea, anchors: p.openSea.anchors.filter((_, i) => i !== index) } };
      }
    } else {
      const run = p.expeditions.find((x) => x.id === index.expedition);
      const exp = EXPEDITIONS.find((e) => e.id === index.expedition);
      const plan = exp ? expeditionPlan(p.nation, exp) : null;
      if (run && plan && run.startedAt !== undefined) {
        const pos = expeditionPos(plan, run.startedAt, now);
        target = { shipIds: run.shipIds, from: { x: pos.x, y: pos.y }, rest: findRoute(sectorAt(pos.x, pos.y), plan.start), fuel: FUEL_MAX * 0.6 };
        base = { ...p, expeditions: recallExpedition(p.expeditions, run.id) };
      }
    }
    if (!target) return;
    const registry = DataLoader.getRegistry(this);
    const ships = target.shipIds.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined).slice(0, 6);
    if (ships.length === 0) return;
    const { from, rest } = target;
    // The fleet steered so far: its HP kept, it lies here or sails on along its route.
    let next = base;
    const mine = this.friendlies().filter((s) => s.isAlive && s.dataId);
    for (const s of mine) next = { ...next, ...setDamage(next, s.dataId as string, s.stats.currentHp / Math.max(1, s.stats.maxHp)) };
    const ids = mine.map((s) => s.dataId as string);
    const here = v.seaPlace();
    let openSea = v.result(next.openSea, ids, here);
    const left = v.routeLeft;
    if (left.length > 1) {
      const end = left[left.length - 1];
      const group = openSea.anchors.findIndex((a) => !a.order && samePlace(a.at, here));
      if (group >= 0) {
        const ordered = orderVoyage(openSea.anchors[group], [...left], { x: (end.c + 0.5) * SECTOR_PX, y: (end.r + 0.5) * SECTOR_PX }, now);
        if (typeof ordered !== 'string') openSea = { ...openSea, anchors: openSea.anchors.map((a, i) => (i === group ? ordered : a)) };
      }
    }
    saveProgress(withQuestEvents({ ...next, openSea }, [['commandSwitch', 1]], now));
    this.voyage = null;
    const init: IBattleInitData = {
      playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', this.playerNation, ships, 0),
      enemyFleet: FleetSystem.createFleet('enemy-fleet', '—', this.playerNation, [], 0),
      mapKey: 'open-sea',
      formation: this.formation,
      captainIds: ships.map(() => null),
      openSea: true,
      openSeaFrom: from,
      openSeaFuel: target.fuel,
      ...(rest && rest.length > 1 ? { openSeaRoute: rest } : {}),
    };
    this.scene.stop(SceneKeys.OPEN_SEA_CHART);
    this.scene.restart(init);
  }

  private openChart(): void {
    if (!this.voyage) return;
    this.setPaused(true, false);
    const v = this.voyage;
    this.scene.launch(SceneKeys.OPEN_SEA_CHART, {
      nation: v.nation, explored: v.explored, at: v.here(), fuel: v.fuel, route: v.routeLeft,
      onRoute: (route: Array<{ c: number; r: number }>) => {
        v.setRoute(route);
        if (route.length > 1 && !this.autoMode) this.setAutoMode(true);
      },
      onClose: () => this.setPaused(false),
      // 艦隊の一覧 (0.0.72): the other fleets — 回航, 指揮を移す, 帰投の基準.
      fleets: () => this.chartFleets(),
      onOrder: (index: number, route: Array<{ c: number; r: number }>) => this.orderFleet(index, route),
      onSwitch: (index: number) => this.switchToFleet(index),
      onSwitchExpedition: (id: string) => this.switchToFleet({ expedition: id }),
      onPatrol: (index: number, centre: { c: number; r: number }, stance: PatrolStance) => this.patrolFleet(index, centre, stance),
      onStop: (index: number) => this.stopFleet(index),
      onRule: (index: number, rule: ReturnRule) => this.setFleetRule(index, rule),
      sightings: () => this.sightings(),
    });
  }

  // -------------------------------------------------------------------------
  // 海の上の交戦 (#445, 0.0.69)
  // -------------------------------------------------------------------------

  /** The seas the navy fights in that its bases reach (where areas and groups at sea are met). */
  private seaTheaters(): Set<string> {
    const progress = loadProgress();
    const reach = baseOfProgress(progress);
    return new Set(theatersFor(campaignData as ICampaignData, this.playerNation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id));
  }

  /** Twice a second: a fight under way is watched for its end; otherwise an area entered or a group near starts one. */
  private updateSeaFights(time: number): void {
    const v = this.voyage;
    if (!v || time < this.seaCheckAt) return;
    this.seaCheckAt = time + 500;
    this.refreshNearResidents();
    // 大破で自動の帰投 (0.0.70): a ship of the fleet (not the flagship) badly hurt leaves for the nearest dock and
    // can no longer be sunk.
    for (const ship of this.separable()) {
      // 自動の帰投の基準 (0.0.72): the steered fleet's own (大破 unless changed; なし keeps every ship in the fight).
      const rule = RETURN_AT[loadProgress().openSea.returnAt ?? 'heavy'];
      if (rule > 0 && ship.isAlive && ship.stats.currentHp / Math.max(1, ship.stats.maxHp) <= rule) this.separate(ship, 'home', true);
    }
    const eng = this.engagement;
    if (eng) {
      // An area's objective decides its fight (0.0.70); a group met at sea is over once it is sunk.
      if (eng.kind === 'area' || this.objective !== Objective.Annihilate) {
        const state = this.objectiveState();
        const status = objectiveStatus(this.objective, state);
        if (status && this.objectiveText && this.objectiveText.text !== status) this.objectiveText.setText(status);
        const outcome = evaluateObjective(this.objective, state);
        if (outcome) {
          this.settleSeaFight(outcome === 'victory');
          return;
        }
      } else if (!this.enemies.some((e) => e.isAlive && !e.isLand)) {
        this.settleSeaFight(true);
        return;
      }
      // 住人 (0.0.72): a fight with a resident moves with the enemy; a running fleet two and a half sectors clear of
      // ours has got away (a win if it lost ships, else no fight at all).
      if (eng.kind === 'encounter' && eng.resident) {
        const alive = this.enemies.filter((e) => e.isAlive && !e.isLand);
        if (alive.length > 0) {
          eng.x = alive.reduce((sum, e) => sum + e.x, 0) / alive.length;
          eng.y = alive.reduce((sum, e) => sum + e.y, 0) / alive.length;
        }
        if (eng.flee && alive.every((e) => worldGap(e, this.flagship) > SECTOR_PX * 2.5)) {
          const sunk = this.enemies.some((e) => !e.isAlive);
          if (sunk) this.settleSeaFight(true);
          else this.dropSeaFight('敵に逃げられました');
          return;
        }
      }
      // Drawing off: two and a half sectors from the fight ends it (a withdrawal, counted as a loss).
      const dx = Math.abs(this.flagship.x - eng.x) % WORLD_PX.w;
      if (Math.hypot(Math.min(dx, WORLD_PX.w - dx), this.flagship.y - eng.y) > SECTOR_PX * 2.5) this.settleSeaFight(false);
      return;
    }
    if (time >= this.ordersAt) {
      this.ordersAt = time + 5000;
      this.runOrders();
    }
    const here = v.here();
    const areaId = areaAt(here);
    for (const id of [...this.engagedAreas]) if (id !== areaId) this.engagedAreas.delete(id);
    for (const id of [...this.notedAreas]) if (id !== areaId) this.notedAreas.delete(id);
    const data = campaignData as ICampaignData;
    if (areaId && !this.engagedAreas.has(areaId)) {
      const area = data.areas.find((a) => a.id === areaId);
      const progress = loadProgress();
      if (area && !area.training && this.seaTheaters().has(area.theater) && isUnlocked(area, progress.campaign)) {
        // An objective with a clock or a ground (0.0.70) starts on its battle square, as near as a campaign battle's.
        const objective = area.objective ?? Objective.Annihilate;
        const plain = objective === Objective.Annihilate || objective === Objective.SinkTargets;
        const block = WORLD_MAP.areas[area.id];
        const c = block ? areaCentre(block) : null;
        const near = !c || Math.hypot(this.nearX(c.x) - this.flagship.x, c.y - this.flagship.y) <= SEA_SQUARE_ENTRY;
        if (plain || near) {
          this.engagedAreas.add(areaId);
          this.startAreaFight(area);
          return;
        }
        if (!this.notedAreas.has(areaId)) {
          this.notedAreas.add(areaId);
          this.seaNote(`作戦海域: ${area.name} — ${OBJECTIVE_LABEL[objective]}。中心へ進むと始まります`);
        }
      }
    }
    // 0.0.70: a convoy waiting at the start of its route, or the enemy's stronghold, within a sector and a half.
    const now = Date.now();
    const world0 = loadProgress().world;
    for (const place of seaPlaces(this.playerNation)) {
      if ((place.kind !== 'convoy' && place.kind !== 'fort') || this.seaWon.has(place.id) || !placeReady(world0, place, this.playerNation, now)) continue;
      const px = this.nearX((place.c + 0.5) * SECTOR_PX);
      if (Math.hypot(this.flagship.x - px, this.flagship.y - (place.r + 0.5) * SECTOR_PX) < PLACE_FIGHT_RANGE) {
        this.startPlaceFight(place, { x: px, y: (place.r + 0.5) * SECTOR_PX });
        return;
      }
    }
    // 特別海域 (0.0.72): this week's special sea, a ring beside its area.
    const special = this.specialSea();
    if (special && !this.seaWon.has(special.id)) {
      const px = this.nearX((special.c + 0.5) * SECTOR_PX);
      const py = (special.r + 0.5) * SECTOR_PX;
      if (Math.hypot(this.flagship.x - px, this.flagship.y - py) < PLACE_FIGHT_RANGE) {
        const rule = weeklyRule(Date.now());
        if (fleetKeepsRule(rule, this.friendlies().filter((sh) => sh.isAlive).map((sh) => sh.stats.shipClass))) {
          this.seaWon.add(special.id);
          this.startSpecial(special.area, { x: px, y: py });
          return;
        }
        if (!this.notedAreas.has(special.id)) {
          this.notedAreas.add(special.id);
          this.seaNote(`特別海域: 今週は${rule.name}。その艦種だけの艦隊で入ると戦えます`);
        }
      } else this.notedAreas.delete(special.id);
    }
    // 住人 (0.0.72): the enemy's patrols and convoys sail the sea; one within sight closes or runs (clear of the
    // harbours and the campaign areas, which keep their own fights).
    const ports = [...Object.values(WORLD_MAP.bases), ...Object.values(WORLD_MAP.places ?? {}), ...Object.values(WORLD_MAP.areas)];
    const harbour = ports.some((p) => colGap(p.c, here.c) < RESIDENT_CLEAR && Math.abs(p.r - here.r) < RESIDENT_CLEAR);
    const world = loadProgress().world;
    for (const { r, pos, dist } of residentsNear(this.residentList(), this.flagship, Date.now(), MEET_PX)) {
      if (r.kind === 'friend' || this.seaWon.has(r.id) || spotWon(world, r.id) || dist > MEET_PX) continue;
      // The giant patrols round its own area; the others keep clear of the harbours and the areas.
      if (r.kind === 'superweapon') {
        this.startGiant(r, pos);
        return;
      }
      if (harbour) continue;
      this.startResident(r, pos);
      return;
    }
  }

  /** The day's residents of the seas the navy sails (drawn again when the world's day turns). */
  private residentList(): IResident[] {
    const day = residentDay(Date.now());
    if (day !== this.residentsDay) {
      this.residentsDay = day;
      this.residents = residentsFor(this.playerNation, [...this.seaTheaters()], day, this.giantSeas());
    }
    return this.residents;
  }

  /** The navy's harbour (an open base or a port on the sea) nearest a point: where a convoy comes from (0.0.73). */
  private nearestHarbour(at: { x: number; y: number }): { x: number; y: number; name: string } | null {
    const p = loadProgress();
    const spots = [
      ...openBases(p).flatMap((b) => (WORLD_MAP.bases[b.id] ? [{ ...WORLD_MAP.bases[b.id], name: b.name }] : [])),
      ...seaPlaces(p.nation).filter((pl) => pl.kind === 'port').map((pl) => ({ c: pl.c, r: pl.r, name: pl.name })),
    ];
    let best: { x: number; y: number; name: string } | null = null;
    let bestD = Infinity;
    for (const s of spots) {
      const x = this.nearX((s.c + 0.5) * SECTOR_PX);
      const y = (s.r + 0.5) * SECTOR_PX;
      const d = Math.hypot(x - at.x, y - at.y);
      if (d > SECTOR_PX && d < bestD) {
        best = { x, y, name: s.name };
        bestD = d;
      }
    }
    return best;
  }

  /** 記念日 (0.0.73): today's anniversary battles of the navy not yet won this year, each a ring where it was fought. */
  private anniversarySeas(): Array<{ id: string; a: IAnniversary; c: number; r: number }> {
    const p = loadProgress();
    const now = Date.now();
    return anniversariesOn(now).flatMap((a) => {
      const at = ANNIVERSARY_PLACES[a.id];
      if (!a.scenario || !at || !a.nations.includes(this.playerNation) || p.specialOps.anniversaries.includes(anniversaryKey(a, now))) return [];
      const s = seaSectorAt(at[0], at[1]);
      return s ? [{ id: `anniv:${a.id}`, a, ...s }] : [];
    });
  }

  /**
   * 記念の海戦 (0.0.73): the fleet waits at sea where the battle was fought, and the day's historical scenario opens
   * (its own fleets, as the 史実 screen fights it).
   */
  private startAnniversary(id: string): void {
    const v = this.voyage;
    const hit = this.anniversarySeas().find((x) => x.id === id);
    if (!v || !hit || this.engagement) return;
    const progress = loadProgress();
    const shipIds = this.friendlies().filter((s) => s.isAlive).map((s) => s.dataId).filter((x): x is string => !!x);
    saveProgress({ ...progress, openSea: v.result(progress.openSea, shipIds, v.seaPlace()) });
    this.voyage = null;
    this.scene.start(SceneKeys.SCENARIO, { scenario: hit.a.scenario });
  }

  /** 特別海域 (0.0.72): this week's special sea, open and in a sea the navy sails — the sea sector just beside its area. */
  private specialSea(): { id: string; area: ICampaignArea; c: number; r: number } | null {
    const data = campaignData as ICampaignData;
    const p = loadProgress();
    const now = Date.now();
    const area = weeklyArea(data.areas, p.campaign, now);
    const block = area ? WORLD_MAP.areas[area.id] : undefined;
    if (!area || !block || specialState(p.specialOps, area, now) !== 'open' || !this.seaTheaters().has(area.theater)) return null;
    // Beside the area (outside its block, so the area's own fight doesn't start), on the sea.
    for (const [dc, dr] of [[block.size + 1, 0], [-2, 0], [0, block.size + 1], [0, -2], [block.size + 1, block.size + 1], [-2, -2]]) {
      const c = wrapCol(block.c + dc);
      const r2 = block.r + dr;
      if (r2 >= 0 && r2 < WORLD_MAP.rows && isSea(c, r2)) return { id: `special:${gameWeek(now)}:${area.id}`, area, c, r: r2 };
    }
    return null;
  }

  /** 超兵器 (0.0.72): the superweapon seas open to the navy, whose giants patrol round them on the world's sea. */
  private giantSeas(): IGiantSea[] {
    const data = campaignData as ICampaignData;
    const cleared = loadProgress().campaign;
    const seas = this.seaTheaters();
    return data.areas.flatMap((a) => {
      const block = WORLD_MAP.areas[a.id];
      if (!block || !seas.has(a.theater) || !superweaponSeaOpen(data, a, cleared) || !superweaponOf(enemyNationFor(data, a, this.playerNation))) return [];
      return [{ areaId: a.id, at: { c: block.c, r: block.r }, theater: a.theater }];
    });
  }

  /** Residents near the fleet for the minimap (0.0.72), refreshed with the sea checks. */
  private refreshNearResidents(): void {
    if (!this.voyage || !this.flagship?.active) {
      this.nearResidents = [];
      return;
    }
    const world = loadProgress().world;
    this.nearResidents = residentsNear(this.residentList(), this.flagship, Date.now())
      .filter(({ r }) => !this.seaWon.has(r.id) && !spotWon(world, r.id) && (this.engagement?.kind !== 'encounter' || this.engagement.spotId !== r.id));
  }

  /** The nearest copy across the east-west join of a world x. */
  private nearX(x: number): number {
    let best = x;
    for (const k of [-1, 1]) if (Math.abs(x + k * WORLD_PX.w - this.flagship.x) < Math.abs(best - this.flagship.x)) best = x + k * WORLD_PX.w;
    return best;
  }

  /**
   * A campaign area's fight at sea: its escorts (if its route has them) between the fleet and the area, its main fleet
   * in the middle. Its objective (0.0.70: all seven) is laid on the battle square turned to face the fleet (SeaFrame):
   * the zone, the escape point, the convoy's way, the batteries' island and the minefields.
   */
  private startAreaFight(area: ICampaignArea): void {
    const block = WORLD_MAP.areas[area.id];
    if (!block) return;
    const registry = DataLoader.getRegistry(this);
    const data = campaignData as ICampaignData;
    const nation = enemyNationFor(data, area, this.playerNation);
    const ships = enemyShips(area, registry, nation);
    if (ships.length === 0) return;
    const c = areaCentre(block);
    const centre = { x: this.nearX(c.x), y: c.y };
    const objective = area.objective ?? Objective.Annihilate;
    this.objective = objective;
    this.side = campaignSide(area);
    // 0.0.73: a convoy comes from the navy's nearest harbour and makes for the sea beyond (港から港へ); the enemy that
    // would escape runs for its own home port, so the fleet has to cut it off or chase it down.
    const harbour = objective === Objective.Convoy ? this.nearestHarbour(centre) : null;
    const enemyHome = objective === Objective.PreventEscape ? homePort(nation) : undefined;
    const homeAt = enemyHome ? { x: this.nearX((enemyHome.c + 0.5) * SECTOR_PX), y: (enemyHome.r + 0.5) * SECTOR_PX } : null;
    const facing = harbour ?? (homeAt ? { x: centre.x - (homeAt.x - centre.x), y: centre.y - (homeAt.y - centre.y) } : this.flagship);
    this.frame = seaFrame(centre, facing, objective === Objective.Convoy ? 'west' : 'south');
    if (harbour) this.seaNote(`船団は${harbour.name}の方から来て、向こうの海へ抜けます。守り抜いてください`, 5000);
    if (homeAt && enemyHome) this.seaNote(`敵は${enemyHome.name}の方へ逃げます。先回りするか追って沈めてください`, 5000);
    this.enemyNation = nation;
    const mods: IShipModifiers = { ...NO_MODIFIERS, ...scaleModifiers(enemyScale(data, area, this.playerNation)) };
    const route = sortieRoute(area, ships);
    // The escorts wait between the fleet and the main body; a supply cache or a whirlpool pays or costs on entry.
    const node = route.find((n) => n.kind !== 'boss');
    if (node?.kind === 'battle' && node.ships) {
      const ang = Math.atan2(this.flagship.y - centre.y, this.flagship.x - centre.x);
      const at = { x: centre.x + Math.cos(ang) * c.half * 0.55, y: centre.y + Math.sin(ang) * c.half * 0.55 };
      this.spawnSeaEnemies(node.ships.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined), nation, at, mods);
    } else if (node?.loot) {
      const progress = loadProgress();
      const sign = node.kind === 'whirlpool' ? -1 : 1;
      const g = gainResources(progress.resources, Object.fromEntries(Object.entries(node.loot).map(([k, v]) => [k, sign * (v ?? 0)])) as unknown as Parameters<typeof gainResources>[1], holdCap(progress.facilities));
      saveProgress({ ...progress, resources: g.resources });
      this.seaNote(node.kind === 'whirlpool' ? `渦潮を抜けました: ${formatResources(node.loot)} を失いました` : `補給の場所: ${formatResources(node.loot)} を得ました`);
    }
    // The plain fights keep 0.0.69's place (the middle); the others meet the enemy where the campaign's battle does.
    const plain = objective === Objective.Annihilate || objective === Objective.SinkTargets;
    const main = plain ? centre : this.zonePoint(this.mainSpawn(ships.length));
    this.spawnSeaEnemies(ships, nation, main, mods, true);
    if (objective === Objective.Convoy) this.spawnConvoy();
    if (objective === Objective.Bombard) this.spawnLandTargets();
    this.setupHazards(area);
    this.drawObjectiveZone();
    if (objective !== Objective.Annihilate) {
      this.objectiveText = this.add
        .text(IS_PORTRAIT ? 20 : 140, IS_PORTRAIT ? 316 : 84, '', textStyle(12, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 2);
    }
    this.beginSeaFight({ kind: 'area', areaId: area.id, ...centre }, `作戦海域: ${area.name}`, nation, plain ? '全艦を沈めると勝利' : objectiveText(area));
  }

  /** The middle of the enemy's starting line on the battle square (0..1), as the campaign's battle places it. */
  private mainSpawn(count: number): { x: number; y: number } {
    const line = enemySpawnPoints(count, BATTLE_WORLD);
    const p = line[Math.floor(line.length / 2)] ?? { x: BATTLE_WORLD.w / 2, y: BATTLE_WORLD.h * 0.25 };
    return { x: p.x / BATTLE_WORLD.w, y: p.y / BATTLE_WORLD.h };
  }

  /** The island an area's batteries stand on at sea (drawn on the water; the ships are not stopped by it). */
  private seaIsland(): { x: number; y: number; r: number } {
    const at = this.zonePoint({ x: 0.5, y: 0.5 });
    const g = this.add.graphics().setDepth(DEPTH_WATER_FX - 1);
    g.fillStyle(0x6b7a4e, 0.85);
    g.fillCircle(at.x, at.y, SEA_ISLAND_R);
    g.fillStyle(0xc9b27a, 0.9);
    g.fillCircle(at.x, at.y, SEA_ISLAND_R * 0.82);
    this.frameGfx.push(g);
    return { ...at, r: SEA_ISLAND_R };
  }

  /**
   * A resident met at sea (0.0.72): an enemy patrol closes on the fleet or, much weaker, runs; a convoy (merchants
   * and a light escort) always runs. A running fleet makes straight away from ours and gets away once it is two and a
   * half sectors clear; a friendly patrol near the fight joins it after a while.
   */
  private startResident(r: IResident, pos: IResidentPos): void {
    const registry = DataLoader.getRegistry(this);
    const theater = (campaignData as ICampaignData).theaters.find((t) => t.id === r.theater);
    const nation = (theater?.opponents?.[this.playerNation] ?? FORT_NATION[this.playerNation] ?? Nation.USN) as Nation;
    const mods: IShipModifiers = { ...NO_MODIFIERS, ...scaleModifiers(worldEnemyScale(r.danger)) };
    const at = { x: this.nearX(pos.x), y: pos.y };
    const warships = worldEnemyFleet(registry.byNation(nation), { id: r.id, danger: r.danger });
    if (warships.length === 0) {
      this.seaWon.add(r.id);
      return;
    }
    const convoy = r.kind === 'convoy';
    const ours = this.playerSide().filter((s) => s.isAlive).map((s) => registry.byId(s.dataId ?? '')).filter((s): s is IShipData => s !== undefined);
    const theirs = fleetPower(warships) * worldEnemyScale(r.danger);
    const flee = meetResponse(r.kind, theirs, fleetPower(ours)) === 'flee';
    this.objective = Objective.Annihilate;
    this.side = null;
    this.frame = null;
    this.enemyNation = nation;
    const before = this.enemies.length;
    if (convoy) {
      const merchant = (specialData as unknown as ISpecialData).convoy as IShipData;
      this.spawnSeaEnemies([merchant, merchant, merchant], nation, at, { ...NO_MODIFIERS });
      this.spawnSeaEnemies(warships.slice(0, 2), nation, { x: at.x + 500, y: at.y + 300 }, mods);
    } else this.spawnSeaEnemies(warships, nation, at, mods);
    if (flee) {
      const goal = fleePoint(at, this.flagship);
      for (const ai of this.aiSystems.slice(before)) {
        ai.goal = goal;
        ai.goalThrottle = 1;
      }
    }
    const title = convoy ? `敵の船団 (危険度 ${r.danger})` : `敵の巡回艦隊 (危険度 ${r.danger})${flee ? ' — 逃げ出した' : ''}`;
    const goalText = convoy ? '逃げる船団と護衛を沈めると積荷が入る' : flee ? '逃げ切られる前に沈める' : '全艦を沈めると勝利';
    this.beginSeaFight({ kind: 'encounter', spotId: r.id, danger: r.danger, resident: r.kind, flee, convoy: false, ...at }, title, nation, goalText);
    this.callFriends(at);
  }

  /**
   * 超兵器 (0.0.72): the giant met on its patrol, at the head of its sea's main fleet. Fought and settled as the
   * superweapon sea (its parts, its drops, its blueprints); it can be met again the next day.
   */
  private startGiant(r: IResident, pos: IResidentPos): void {
    const data = campaignData as ICampaignData;
    const area = data.areas.find((a) => a.id === r.areaId);
    if (!area) return;
    const nation = enemyNationFor(data, area, this.playerNation);
    const giant = superweaponOf(nation);
    if (!giant) return;
    this.seaWon.add(r.id);
    const registry = DataLoader.getRegistry(this);
    const at = { x: this.nearX(pos.x), y: pos.y };
    this.objective = Objective.Annihilate;
    this.side = null;
    this.frame = null;
    this.enemyNation = nation;
    const mods: IShipModifiers = { ...NO_MODIFIERS, ...scaleModifiers(enemyScale(data, area, this.playerNation)) };
    const before = this.enemies.length;
    this.spawnSeaEnemies([giant, ...enemyShips(area, registry, nation).slice(0, 4)], nation, at, mods);
    const head = this.enemies[before];
    if (head) {
      head.setScale(giant.scale ?? 1.6);
      this.superweapon = head;
      this.superweaponParts?.destroy();
      this.superweaponParts = this.add.text(head.x, head.y - 80, partsLine(1), textStyle(12, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4 }))
        .setOrigin(0.5).setDepth(DEPTH_HUD - 3);
    }
    this.beginSeaFight({ kind: 'area', areaId: area.id, sw: true, ...at }, `超兵器: ${giant.name.replace(/\s*\(.*\)\s*$/, '')} (${area.name}の海)`, nation, '超兵器と主力艦隊を沈めると勝利');
  }

  /**
   * 特別海域 (0.0.72): this week's special sea lies on the world's sea as a ring at its area; a fleet that keeps the
   * week's rule (one class of ship) and sails in fights its main fleet there, a little weaker, for the week's reward.
   */
  private startSpecial(area: ICampaignArea, at: { x: number; y: number }): void {
    const data = campaignData as ICampaignData;
    const registry = DataLoader.getRegistry(this);
    const nation = enemyNationFor(data, area, this.playerNation);
    this.objective = Objective.Annihilate;
    this.side = null;
    this.frame = null;
    this.enemyNation = nation;
    const mods: IShipModifiers = { ...NO_MODIFIERS, ...scaleModifiers(enemyScale(data, area, this.playerNation) * SPECIAL_ENEMY_SCALE) };
    this.spawnSeaEnemies(enemyShips(area, registry, nation), nation, at, mods);
    this.beginSeaFight({ kind: 'area', areaId: area.id, special: true, ...at }, `特別海域: ${area.name} (${weeklyRule(Date.now()).name})`, nation, '主力艦隊を沈めると今週の報酬');
  }

  /** The navy's own patrols within three sectors of a fight join it after a while (友軍の巡回, 0.0.72). */
  private callFriends(at: { x: number; y: number }): void {
    const eng = this.engagement;
    if (!eng || eng.kind !== 'encounter') return;
    const registry = DataLoader.getRegistry(this);
    for (const { r, pos } of residentsNear(this.residentList(), at, Date.now(), SECTOR_PX * 3)) {
      if (r.kind !== 'friend' || this.calledFriends.has(r.id)) continue;
      const ships = worldEnemyFleet(registry.byNation(this.playerNation), { id: r.id, danger: Math.max(2, r.danger) }).slice(0, 4);
      if (ships.length === 0) continue;
      this.calledFriends.add(r.id);
      const name = '友軍の巡回艦隊';
      this.pendingAllies.push({ ships, arriveSec: PATROL_ARRIVE_SEC, name, nation: this.playerNation, at: { x: this.nearX(pos.x), y: pos.y } });
      eng.ally = { name, nation: this.playerNation, shipIds: ships.map((s) => s.id) };
      this.seaNote(`近くの友軍の巡回艦隊が向かっています (${PATROL_ARRIVE_SEC} 秒ほど)`);
      return;
    }
  }

  /**
   * A place of the old chart fought in place (0.0.70): the convoy (merchant ships and a light escort, sunk for their
   * cargo) or the stronghold (batteries on its island and a garrison; destroyed batteries take it).
   */
  private startPlaceFight(place: ReturnType<typeof seaPlaces>[number], at: { x: number; y: number }): void {
    const registry = DataLoader.getRegistry(this);
    const danger = place.kind === 'fort' ? fortDanger() : placeDanger(this.playerNation, place);
    const theater = (campaignData as ICampaignData).theaters.find((t) => t.id === theaterOf(place.c, place.r));
    const nation = place.kind === 'fort' ? FORT_NATION[this.playerNation] : (theater?.opponents?.[this.playerNation] ?? FORT_NATION[this.playerNation]) as Nation;
    const mods: IShipModifiers = { ...NO_MODIFIERS, ...scaleModifiers(worldEnemyScale(danger)) };
    this.enemyNation = nation;
    this.side = null;
    if (place.kind === 'fort') {
      // The stronghold: its batteries round the island in the middle, the garrison off it towards the fleet.
      this.objective = Objective.Bombard;
      this.frame = seaFrame(at, this.flagship);
      this.spawnLandTargets();
      const garrison = worldEnemyFleet(registry.byNation(nation), { id: place.id, danger });
      this.spawnSeaEnemies(garrison, nation, this.zonePoint({ x: 0.5, y: 0.75 }), mods);
      this.objectiveText = this.add
        .text(IS_PORTRAIT ? 20 : 140, IS_PORTRAIT ? 316 : 84, '', textStyle(12, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 }))
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 2);
      this.beginSeaFight({ kind: 'encounter', spotId: place.id, danger, fort: true, ...at }, `敵の要塞: ${place.name}`, nation, '陣地を全て破壊すると攻略');
      return;
    }
    // The convoy: three merchant ships in line and an escort of the lighter kind.
    this.objective = Objective.Annihilate;
    this.frame = null;
    const merchant = (specialData as unknown as ISpecialData).convoy as IShipData;
    const escort = worldEnemyFleet(registry.byNation(nation), { id: place.id, danger: Math.max(1, danger - 3) }).slice(0, 2);
    this.spawnSeaEnemies([merchant, merchant, merchant], nation, at, { ...NO_MODIFIERS });
    if (escort.length > 0) this.spawnSeaEnemies(escort, nation, { x: at.x + 500, y: at.y + 300 }, mods);
    this.beginSeaFight({ kind: 'encounter', spotId: place.id, danger, convoy: true, ...at }, `敵の船団: ${place.name}`, nation, '輸送船と護衛を沈めると積荷が入る');
  }

  private beginSeaFight(eng: NonNullable<BattleScene['engagement']>, title: string, nation: Nation, goal: string): void {
    this.engagement = eng;
    this.enemyNation = nation;
    this.battleStartedAt = -1;
    this.voyage?.clearRoute();
    audio.music('battle');
    this.seaNote(`${title} — ${goal}。2 区画ほど離れると撤退`);
    this.comment('start', {});
  }

  /** Enemy ships at sea round `at`, in line ahead, with the battle's own AI, trails and sightings. */
  private spawnSeaEnemies(ships: IShipData[], nation: Nation, at: { x: number; y: number }, mods: IShipModifiers, main = false): void {
    const offsets = FormationSystem.getOffsets(Formation.LineAhead, Math.max(0, ships.length - 1));
    let lead: BaseShip | null = null;
    const heading = Phaser.Math.RadToDeg(Math.atan2(this.flagship.y - at.y, this.flagship.x - at.x)) + 90;
    ships.forEach((shipData, i) => {
      const pos = i === 0 ? at : FormationSystem.getWorldPositionFromValues(at.x, at.y, heading, offsets[i - 1]);
      const enemy = this.spawnShip(shipData, pos.x, pos.y, mods);
      enemy.aimErrorMul *= this.difficulty.aimMul;
      enemy.stats.maxHp = Math.round(enemy.stats.maxHp * this.difficulty.hpMul);
      enemy.stats.currentHp = enemy.stats.maxHp;
      enemy.setTint(0xdd4444);
      enemy.setAngle(heading);
      this.enemies.push(enemy);
      this.trails.add(enemy);
      this.enemyAir.register(enemy, AirOpsSystem.wingFor(shipData, mods, { perf: eraWingPerf(shipData.nation, shipData.year) }));
      this.enemyRecon.register(enemy);
      const ai = new AISystem(this.enemyWeapons, TACTICS[nation], WORLD_BOUNDS);
      ai.patrol = { x: enemy.x, y: enemy.y };
      if (i === 0) lead = enemy;
      else if (lead) ai.station = { lead, offset: offsets[i - 1] };
      // The area's main fleet carries its objective (0.0.70): the ship to sink, the one making for the zone.
      const side = this.side;
      if (main && side) {
        const target = (side.targets ?? []).includes(shipData.id) || (side.targetLead === true && i === 0);
        if (side.zone && side.enemyGoesForZone && (side.targets ?? []).includes(shipData.id)) ai.goal = this.zonePoint(side.zone);
        if (side.zone && side.enemyGoesForZone && target && side.targetLead) {
          ai.goal = this.zonePoint(side.zone);
          ai.goalThrottle = goalThrottle(Math.hypot(ai.goal.x - enemy.x, ai.goal.y - enemy.y), enemy.currentSpeed, side.arrivalSec);
        }
        if (target) this.scenarioTargets.push(enemy);
      }
      this.aiSystems.push(ai);
    });
  }

  /** Settles the fight at sea through the battle's own settlement (rewards, rank, quests, medals), screen kept. */
  private settleSeaFight(victory: boolean): void {
    const eng = this.engagement;
    if (!eng || !this.battleData) return;
    const keep = this.battleData;
    this.battleData = { ...keep, ...(eng.kind === 'area' ? { areaId: eng.areaId, ...(eng.sw ? { swArea: true } : {}), ...(eng.special ? { special: true } : {}) } : eng.drill ? {} : { world: { spotId: eng.spotId, danger: eng.danger, fort: eng.fort, convoy: eng.convoy, raid: eng.resident === 'convoy', chase: eng.resident === 'patrol' && eng.flee === true, ally: eng.ally } }) };
    this.settlingInPlace = true;
    this.triggerGameOver(victory);
    this.battleData = keep;
  }

  /** A fight that ends with no settlement (住人, 0.0.72): the enemy got away before a ship was lost on either side. */
  private dropSeaFight(note: string): void {
    this.finishSeaFight(false, null, note);
  }

  /** The flagship lost in a fight at sea: the fight is settled as lost before the results. */
  private loseAtSea(): void {
    const eng = this.engagement;
    if (!eng || !this.battleData) return;
    this.battleData = { ...this.battleData, ...(eng.kind === 'area' ? { areaId: eng.areaId } : { world: { spotId: eng.spotId, danger: eng.danger } }) };
  }

  /** After the settlement: the enemy gone, the battle's counts started afresh, the result on a band; sailing on. */
  private finishSeaFight(victory: boolean, result: IBattleResultData | null, note = ''): void {
    const eng = this.engagement;
    // A drill leaves no damage (0.0.70).
    if (this.drillHp) {
      for (const [ship, hp] of this.drillHp) if (ship.active) ship.stats.currentHp = Math.max(ship.stats.currentHp, hp);
      this.drillHp = null;
    }
    this.exercise = false;
    this.gameOver = false;
    this.engagement = null;
    if (eng?.kind === 'encounter' && victory) this.seaWon.add(eng.spotId);
    for (const e of this.enemies) if (e.active) e.destroy();
    this.enemies.length = 0;
    this.aiSystems.length = 0;
    // The objective's ground (0.0.70): convoy, batteries, zone, minefields, the line on the HUD.
    for (const c of this.convoy) if (c.active) c.destroy();
    this.convoy.length = 0;
    this.convoyEscaped = 0;
    this.landTargets = [];
    this.scenarioTargets = [];
    this.escapeStart = null;
    this.escapeProgress = 0;
    for (const o of this.frameGfx) o.destroy();
    this.frameGfx = [];
    this.hazards = [];
    this.hazardGfx?.destroy();
    this.hazardGfx = null;
    for (const t of this.hazardLabels) t.destroy();
    this.hazardLabels = [];
    this.objectiveText?.destroy();
    this.objectiveText = null;
    this.frame = null;
    this.side = null;
    this.objective = Objective.Annihilate;
    // 超兵器 at sea (0.0.72): its parts line goes with it.
    this.superweapon = null;
    this.superweaponParts?.destroy();
    this.superweaponParts = null;
    for (const ws of [this.playerWeapons, this.enemyWeapons]) {
      for (const p of ws.projectiles) if (p.active) p.deactivate();
      ws.fired.shells = 0;
      ws.fired.torpedoes = 0;
      ws.fired.charges = 0;
    }
    this.playerAir.resetLosses();
    this.enemyAir.resetLosses();
    this.damageLog.player = {};
    this.damageLog.enemy = {};
    this.firesSet = 0;
    this.shellHits = 0;
    this.torpedoHits = 0;
    this.sailedPx = 0;
    this.skillProcs = 0;
    this.consumableUses = 0;
    this.baseAirSent = 0;
    this.fieldsSwept = 0;
    this.landings = 0;
    this.commentary = emptyCommentary();
    this.seenByPlayer = new Set();
    this.seenByEnemy = new Set();
    this.lastSeen = new Map();
    this.lockedTarget = null;
    audio.music('map');
    if (!result) {
      this.seaNote(note, 5000);
      return;
    }
    const lines = [
      `${victory ? '勝利' : '撤退'}${result.rank ? `  評価 ${result.rank}` : ''}`,
      result.campaign ?? '',
      result.reward ? `報酬 ${result.reward}` : '',
      result.merit ?? '',
      result.recruits ?? '',
      result.medals && result.medals.length > 0 ? `勲章: ${result.medals.join('・')}` : '',
    ].filter((l) => l);
    this.seaNote(lines.join('\n'), 7000);
  }

  // -------------------------------------------------------------------------
  // 艦隊の分離 (#445, 0.0.70): 帰投・待機・合流
  // -------------------------------------------------------------------------

  /** The fleet's ships that can be sent off: the escorts and the player's other fleets' ships (not the flagship). */
  private separable(): BaseShip[] {
    return [...this.escorts, ...this.groups.filter((g) => g.owned).flatMap((g) => g.ships)].filter((s) => s.active && s !== this.flagship);
  }

  /**
   * A ship leaves the fleet: 帰投 (to the nearest base with a dock, there at once until the moving world, B1) or
   * 待機 (lying at sea where it is). Its damage is kept; it is out of the battle and can't be sunk.
   */
  private separate(ship: BaseShip, order: 'home' | 'wait', heavy = false): void {
    const v = this.voyage;
    const id = ship.dataId;
    if (!v || !id || ship === this.flagship) return;
    const i = this.escorts.indexOf(ship);
    if (i >= 0) {
      this.escorts.splice(i, 1);
      this.escortAISystems.splice(i, 1);
    } else {
      for (const g of this.groups) {
        const k = g.ships.indexOf(ship);
        if (k >= 0) {
          g.ships.splice(k, 1);
          g.ais.splice(k, 1);
        }
      }
    }
    ship.setActive(false).setVisible(false);
    const body = ship.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    const progress = loadProgress();
    const name = ship.stats.name.replace(/\s*\(.*\)\s*$/, '');
    const damaged = withQuestEvents({ ...progress, ...setDamage(progress, id, ship.stats.currentHp / Math.max(1, ship.stats.maxHp)) }, [['fleetDetached', 1]], Date.now());
    if (order === 'home') {
      const base = nearestDock(progress, v.here());
      const at = (base ? baseAnchor(base.id) : undefined) ?? homeAnchor(this.playerNation);
      // 画面の外の艦隊 (0.0.72): it sails home by itself in the world's time (it can't be sunk off-screen).
      const here = { x: ((ship.x % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w, y: ship.y };
      const route = findRoute(sectorAt(here.x, here.y), sectorAt(at.x, at.y));
      const lone = { shipIds: [id], at: here, fuel: FUEL_MAX, returnAt: 'none' as ReturnRule };
      const ordered = route && route.length > 1 ? orderVoyage(lone, route, at, Date.now()) : null;
      const anchors = ordered && typeof ordered !== 'string'
        ? [...progress.openSea.anchors.map((a) => ({ ...a, shipIds: a.shipIds.filter((x) => x !== id) })).filter((a) => a.shipIds.length > 0), ordered]
        : anchorAt(progress.openSea.anchors, [id], at, this.playerNation);
      saveProgress({ ...damaged, openSea: { ...progress.openSea, anchors } });
      this.seaNote(`${heavy ? '大破: ' : ''}${name}は${base?.name ?? '軍港'}へ帰投します${ordered && typeof ordered !== 'string' ? ` (着くまで約 ${Math.ceil(runMs(route ?? []) / 60000)} 分)` : ''}`);
    } else {
      const at = { x: ((ship.x % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w, y: ship.y };
      saveProgress({ ...damaged, openSea: { ...progress.openSea, anchors: anchorAt(progress.openSea.anchors, [id], at, this.playerNation, v.fuel) } });
      this.seaNote(`${name}はこの海で待機します (編成の停泊地から出せます)`);
    }
    this.refreshSeparation();
  }

  /** Ships lying at sea within a sector and a half (this navy's, waiting): they can join the fleet (合流). */
  private waitingNear(): Array<{ index: number; shipIds: string[] }> {
    const anchors = loadProgress().openSea.anchors;
    return anchors.flatMap((a, index) => {
      if (a.at.base) return [];
      const dx = Math.abs(this.flagship.x - a.at.x) % WORLD_PX.w;
      return Math.hypot(Math.min(dx, WORLD_PX.w - dx), this.flagship.y - a.at.y) <= SECTOR_PX * 1.5 ? [{ index, shipIds: a.shipIds }] : [];
    });
  }

  /** 合流: a group waiting nearby sails with the fleet as an escort fleet (and lies wherever the fleet lies after). */
  private joinWaiting(index: number): void {
    const progress = loadProgress();
    const group = progress.openSea.anchors[index];
    if (!group) return;
    const registry = DataLoader.getRegistry(this);
    const ships = group.shipIds.map((sid) => registry.byId(sid)).filter((x): x is IShipData => x !== undefined);
    saveProgress(withQuestEvents({ ...progress, openSea: { ...progress.openSea, anchors: progress.openSea.anchors.filter((_, k) => k !== index) } }, [['fleetJoined', 1]], Date.now()));
    if (ships.length > 0) this.spawnGroup(ships, '合流艦隊', 'escort', true, this.playerNation);
    this.seaNote(`${ships.length} 隻が合流しました`);
    this.refreshSeparation();
  }

  private separationSheet: Phaser.GameObjects.GameObject[] = [];

  /** The sheet of orders: each ship's 帰投 / 待機, and the groups waiting nearby to 合流. The battle stands still. */
  private openSeparation(): void {
    if (!this.voyage || this.separationSheet.length > 0) return;
    this.setPaused(true, false);
    this.refreshSeparation(true);
  }

  private closeSeparation(): void {
    for (const o of this.separationSheet) o.destroy();
    this.separationSheet = [];
    this.setPaused(false);
  }

  private refreshSeparation(open = false): void {
    if (!open && this.separationSheet.length === 0) return;
    for (const o of this.separationSheet) o.destroy();
    this.separationSheet = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH_HUD + 20);
      this.separationSheet.push(o);
      return o;
    };
    const ships = this.separable().slice(0, 8);
    const waiting = this.waitingNear().slice(0, 3);
    const w = Math.min(CANVAS_W - 40, 640);
    const rowH = IS_PORTRAIT ? 64 : 46;
    const rows = Math.max(1, ships.length) + waiting.length;
    const h = 110 + rows * (rowH + 8) + (IS_PORTRAIT ? 80 : 60);
    const x0 = CANVAS_W / 2 - w / 2;
    const y0 = Math.max(20, CANVAS_H / 2 - h / 2);
    add(this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.6).setInteractive());
    add(this.add.rectangle(x0, y0, w, h, Colors.panel, 0.97).setOrigin(0, 0).setStrokeStyle(2, Colors.rim));
    add(this.add.text(x0 + 24, y0 + 20, '艦隊の分離', textStyle(IS_PORTRAIT ? 20 : 18, Css.gold, { fontStyle: 'bold' })));
    add(this.add.text(x0 + 24, y0 + 56, '帰投: 入渠できる一番近い基地へ  ·  待機: この海に停泊', textStyle(IS_PORTRAIT ? 13 : 12, Css.muted)));
    let y = y0 + 100;
    const bw = IS_PORTRAIT ? 120 : 96;
    if (ships.length === 0) {
      add(this.add.text(x0 + 24, y + rowH / 2, '分けられる艦がありません (旗艦は分けられません)', textStyle(14, Css.muted)).setOrigin(0, 0.5));
      y += rowH + 8;
    }
    for (const ship of ships) {
      const pct = Math.round((ship.stats.currentHp / Math.max(1, ship.stats.maxHp)) * 100);
      const label = add(this.add.text(x0 + 24, y + rowH / 2, `${ship.stats.name.replace(/\s*\(.*\)\s*$/, '')}  耐久 ${pct}%`, textStyle(IS_PORTRAIT ? 15 : 14, pct <= 25 ? Css.danger : Css.text)).setOrigin(0, 0.5));
      fitText(label, w - 48 - bw * 2 - 24);
      add(new UIButton(this, x0 + w - 24 - bw * 1.5 - 8, y + rowH / 2, '帰投', () => this.separate(ship, 'home'), { variant: 'secondary', width: bw, height: rowH - 6, fontSize: 14 }));
      add(new UIButton(this, x0 + w - 24 - bw / 2, y + rowH / 2, '待機', () => this.separate(ship, 'wait'), { variant: 'secondary', width: bw, height: rowH - 6, fontSize: 14 }));
      y += rowH + 8;
    }
    for (const g of waiting) {
      add(this.add.text(x0 + 24, y + rowH / 2, `近くで待機中の艦 ${g.shipIds.length} 隻`, textStyle(IS_PORTRAIT ? 15 : 14, Css.cyan)).setOrigin(0, 0.5));
      add(new UIButton(this, x0 + w - 24 - bw / 2, y + rowH / 2, '合流', () => this.joinWaiting(g.index), { variant: 'primary', width: bw, height: rowH - 6, fontSize: 14 }));
      y += rowH + 8;
    }
    add(new UIButton(this, CANVAS_W / 2, y0 + h - (IS_PORTRAIT ? 44 : 34), '閉じる', () => this.closeSeparation(), { variant: 'secondary', width: 200, height: IS_PORTRAIT ? 56 : 44, fontSize: 15 }));
  }

  /** A band at the top of the screen for the fight's start and its result. */
  private seaNote(text: string, ms = 4000): void {
    for (const o of this.seaBanner) o.destroy();
    // A fight met just off the harbour: its band takes the opening band's place (0.0.70).
    for (const o of this.openingBanner) if (o.active) o.destroy();
    this.openingBanner = [];
    const w = Math.min(CANVAS_W - 40, 720);
    // Below the voyage's readout on the right (the chart button, the place and the fuel).
    const y = IS_PORTRAIT ? 640 : 150;
    const t = this.add.text(CANVAS_W / 2, y, text, textStyle(IS_PORTRAIT ? 15 : 14, Css.text, { align: 'center', lineSpacing: 6, wordWrap: { width: w - 40, useAdvancedWrap: true } }))
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH_HUD + 8);
    const band = this.add.rectangle(CANVAS_W / 2, y - 12, w, t.height + 24, Colors.bgDeep, 0.85).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH_HUD + 7);
    this.seaBanner = [band, t];
    this.time.delayedCall(ms, () => {
      if (this.seaBanner[1] === t) {
        band.destroy();
        t.destroy();
        this.seaBanner = [];
      }
    });
  }

  /** The navy's open bases, the home port first, where the fleet can put in (停泊, 0.0.69). */
  private voyagePorts(): IVoyageStop[] {
    const progress = loadProgress();
    const bases: IVoyageStop[] = openBases(progress).flatMap((b) => {
      const s = WORLD_MAP.bases[b.id];
      return s ? [{ id: b.id, name: b.name, kind: 'base' as const, ...s }] : [];
    });
    // 0.0.70: the navy's ports, oil fields and mines on the sea.
    // The enemy's convoy and stronghold too, drawn red with their danger, so the fleet sees them coming.
    const stops: IVoyageStop[] = seaPlaces(progress.nation).map((p) => ({
      id: p.id, kind: p.kind as 'port' | 'oil' | 'mine' | 'convoy' | 'fort', c: p.c, r: p.r,
      name: p.kind === 'fort' ? `${p.name} (敵の要塞・危険度 ${fortDanger()})` : p.kind === 'convoy' ? `${p.name} (敵の船団)` : p.name,
    }));
    // 訓練海域・演習場 (0.0.70): off the home port.
    const grounds = practiceGrounds(progress.nation);
    const drills: IVoyageStop[] = grounds
      ? [{ id: 'drill:training', name: '訓練海域', kind: 'training', ...grounds.training }, { id: 'drill:exercise', name: '演習場', kind: 'exercise', ...grounds.exercise }]
      : [];
    // 特別海域 (0.0.72): this week's, as a ring beside its area.
    const special = this.specialSea();
    const specials: IVoyageStop[] = special ? [{ id: special.id, name: `特別海域 (${weeklyRule(Date.now()).name})`, kind: 'special', c: special.c, r: special.r }] : [];
    // 記念日 (0.0.73): the day's historical battle where it was fought.
    const annivs: IVoyageStop[] = this.anniversarySeas().map((x) => ({ id: x.id, name: `${x.a.name} (記念日)`, kind: 'anniversary', c: x.c, r: x.r }));
    return [...bases, ...stops, ...drills, ...specials, ...annivs];
  }

  /**
   * 訓練海域・演習場 (0.0.70): an exercise fought where the fleet is, with the settings last chosen in the builder
   * (or the standard ones). The training ground brings the training enemy. Nothing is lost: the HP comes back after.
   */
  private startDrill(kind: 'training' | 'exercise'): void {
    if (!this.voyage || this.engagement) return;
    const registry = DataLoader.getRegistry(this);
    const sel = (this.registry.get(SELECTION_KEY) as Partial<Record<Nation, { enemyNation?: string; mode?: string; enemyCount?: number }>> | undefined)?.[this.playerNation];
    const theater = (campaignData as ICampaignData).theaters.find((t) => (t.opponents as Partial<Record<Nation, Nation>> | undefined)?.[this.playerNation]);
    const usual = ((theater?.opponents as Partial<Record<Nation, Nation>> | undefined)?.[this.playerNation]) ?? Nation.USN;
    const foes = Object.values(Nation).filter((n) => n !== this.playerNation);
    const nation = (sel?.enemyNation && sel.enemyNation !== 'random' ? sel.enemyNation : sel?.enemyNation === 'random' ? foes[Math.floor(Math.random() * foes.length)] : usual) as Nation;
    const modes = [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW];
    const mode = (sel?.mode && sel.mode !== 'random' ? sel.mode : sel?.mode === 'random' ? modes[Math.floor(Math.random() * modes.length)] : BattleMode.Surface) as BattleMode;
    const own = this.friendlies().filter((s) => s.isAlive);
    const ownData = own.map((s) => (s.dataId ? registry.byId(s.dataId) : undefined)).filter((d): d is IShipData => d !== undefined);
    const count = exerciseEnemyCount(sel?.enemyCount && sel.enemyCount > 0 ? sel.enemyCount : own.length);
    const ships = kind === 'training' ? trainingEnemyFleet(registry, nation, count) : exerciseEnemyFleet(registry, nation, mode, ownData, count);
    if (ships.length === 0) return;
    this.drillHp = new Map(own.map((s) => [s, s.stats.currentHp]));
    const ahead = Phaser.Math.DegToRad(this.flagship.angle - 90);
    const at = { x: this.flagship.x + Math.cos(ahead) * 1500, y: this.flagship.y + Math.sin(ahead) * 1500 };
    this.objective = Objective.Annihilate;
    this.side = null;
    this.frame = null;
    this.exercise = true;
    this.spawnSeaEnemies(ships, nation, at, { ...NO_MODIFIERS });
    this.beginSeaFight({ kind: 'encounter', spotId: `drill:${kind}:${Date.now()}`, danger: 1, drill: true, ...at }, kind === 'training' ? '訓練海域' : '演習場', nation, '全艦を沈めると勝利 (損傷は残らない)');
  }

  /** A port on the sea (0.0.70): a full tank, the ships patched to PORT_REPAIR; the voyage goes on. */
  private callAtSeaPort(id: string): void {
    const v = this.voyage;
    const place = seaPlaces(this.playerNation).find((p) => p.id === id);
    if (!v || !place || this.engagement) return;
    v.refuel();
    for (const s of this.friendlies()) if (s.isAlive) s.stats.currentHp = Math.max(s.stats.currentHp, Math.round(s.stats.maxHp * PORT_REPAIR));
    const now = Date.now();
    const progress = loadProgress();
    saveProgress(withQuestEvents({ ...progress, world: markPlace(progress.world ?? emptyWorld(), place, now) }, [['portCall', 1]], now));
    this.seaNote(`${place.name}で補給: 燃料 ${FUEL_MAX}・耐久 ${Math.round(PORT_REPAIR * 100)}% まで応急修理`);
  }

  /** An oil field or a mine sailed through (0.0.70): its resources, once a game hour. */
  private passResource(id: string): void {
    const place = seaPlaces(this.playerNation).find((p) => p.id === id);
    if (!place || this.engagement) return;
    const now = Date.now();
    const progress = loadProgress();
    const world = progress.world ?? emptyWorld();
    if (!placeReady(world, place, this.playerNation, now)) {
      this.seaNote(`${place.name}: この時間の積み込みは済んでいます (次の 1 時間に)`);
      return;
    }
    const reward = placeReward(place, this.playerNation);
    const g = gainResources(progress.resources, reward, holdCap(progress.facilities));
    saveProgress(withQuestEvents({ ...progress, resources: g.resources, world: markPlace(world, place, now), ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(reward, g.lost, -1), now), 'overflow', g.lost, now) }, [['resourceRun', 1]], now));
    this.seaNote(`${place.name}: ${formatResources(reward)} を積み込みました`);
  }

  /**
   * The voyage ends in a harbour (the fleet lies there) or from the pause sheet (it lies at sea where it stopped, 停泊):
   * what was explored and sailed is kept, back to the chart room.
   */
  private endVoyage(baseId?: string): void {
    const v = this.voyage;
    if (!v) return;
    const progress = loadProgress();
    const shipIds = this.friendlies().map((s) => s.dataId).filter((id): id is string => !!id);
    const at = (baseId ? baseAnchor(baseId) : undefined) ?? v.seaPlace();
    const away = baseId !== undefined && baseId !== homeAnchor(this.playerNation).base;
    saveProgress(withQuestEvents({ ...progress, openSea: v.result(progress.openSea, shipIds, at) }, [['anchoredAway', away ? 1 : 0]], Date.now()));
    this.voyage = null;
    // 0.0.70: the old 外洋 screen is gone; the voyage ends at the home port's screen.
    this.scene.start(SceneKeys.HOME);
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
    // 幸運艦 (#58): now and then a hit does nothing at all.
    if (target.skill && target.skill.luck > 0 && Math.random() < target.skill.luck) {
      projectile.deactivate();
      this.skillPopup(target, `${target.skill.name}: 被害なし`);
      return;
    }
    const fired = projectile.weapon ?? FALLBACK_WEAPON;
    // 弾種 (#48): a gun's shell is AP or HE by the firing ship's choice (AUTO picks by the target).
    const shell = effectiveShell(fired.type, projectile.source?.shellMode ?? 'auto', target.stats.shipClass);
    const weapon = shell === fired.type ? fired : { ...fired, type: shell };
    const dmg = CombatSystem.calculateDamage(weapon, target.stats.shipClass, target.stats.armor);
    const hpBefore = target.stats.currentHp / Math.max(1, target.stats.maxHp);
    CombatSystem.applyDamage(target, dmg, projectile.source, !projectile.fromShip ? 'air' : projectile instanceof Torpedo ? 'torpedo' : 'gun');
    if (target === this.superweapon) this.breakParts(target, hpBefore);
    this.wakeLastStand(target);
    this.rollCritical(target, weapon, dmg);
    this.rollFireOrFlood(target, weapon);
    if (projectile.fromShip && this.enemies.includes(target)) {
      if (projectile instanceof Torpedo) this.torpedoHits++;
      else this.shellHits++;
    }
    projectile.deactivate();
    this.explosion.play(projectile.x, projectile.y);
    // 命中 (#104): a torpedo's blast, a shell that went in, or one that glanced off the armour.
    const kind: SoundKind = projectile instanceof Torpedo ? 'torpedoHit' : dmg < weapon.firePower * 0.35 ? 'ricochet' : 'hit';
    this.sound3d(kind, projectile.x, projectile.y);
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

  /** 艦隊技術 (#56): the class's level for the navy being played, worked out once a battle. */
  private techLevelOf(shipClass: ShipClass): number {
    if (!this.techLevels) {
      const registry = DataLoader.getRegistry(this);
      const points = techPoints(loadProgress(), (id) => registry.byId(id)?.shipClass);
      this.techLevels = Object.fromEntries(Object.entries(points).map(([c, n]) => [c, techLevel(n)])) as Record<ShipClass, number>;
    }
    return this.techLevels[shipClass] ?? 0;
  }

  /** 不屈 (#58): once the ship is down to LAST_STAND_HP, its armour goes up for the rest of the battle. */
  private wakeLastStand(ship: BaseShip): void {
    if (!ship.skill || ship.skill.lastStand <= 0 || ship.lastStandOn || !ship.isAlive) return;
    if (ship.stats.currentHp / Math.max(1, ship.stats.maxHp) > LAST_STAND_HP) return;
    ship.lastStandOn = true;
    ship.stats.armor += ship.skill.lastStand;
    this.skillPopup(ship, `${ship.skill.name}: 装甲 +${ship.skill.lastStand}`);
  }

  /** A skill that just worked (#58): its name over the ship, and one more for the 固有スキル章. */
  private skillPopup(ship: BaseShip, text: string): void {
    this.skillProcs++;
    if (!ship.visible) return;
    const t = this.add
      .text(ship.x, ship.y - 58, text, textStyle(14, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4 }))
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD - 2);
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
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
      const goal = this.zonePoint(zone);
      this.flagship.steer({ headingDeg: headingTo(this.flagship, goal), throttle: 1 }, dtSec, SHIP_ROTATE_SPEED);
      return;
    }

    if (this.autoMode && target) {
      // A carrier fights with its aircraft and keeps well clear of the enemy's guns.
      const hp = this.flagship.stats.currentHp / Math.max(1, this.flagship.stats.maxHp);
      const range = autoEngageRange(this.playerWeapon.range, hp, this.playerAir.hasCarrier(this.flagship) ? CARRIER_STANDOFF : undefined);
      this.flagship.steer(engageSteer(this.flagship, target, range, WORLD_BOUNDS, AUTO_EDGE_MARGIN), dtSec, SHIP_ROTATE_SPEED);
      return;
    }

    // 船団護衛 (#416): with nothing in sight the escort keeps beside its convoy instead of going off to search.
    const guard = this.autoMode && this.objective === Objective.Convoy ? convoyGuardPoint(this.convoy.filter((s) => s.isAlive && s.active)) : null;
    if (guard) {
      const s = waypointSteer(this.flagship, guard, 120);
      if (s) this.flagship.steer(s, dtSec, SHIP_ROTATE_SPEED);
      return;
    }
    // The chart's route (#445): sector by sector to the destination, steering round the land on the way.
    const leg = this.voyage?.hasRoute ? this.voyage.waypoint() : null;
    if (leg) {
      const s = waypointSteer(this.flagship, leg, 200);
      if (s) {
        this.flagship.steer(s, dtSec, SHIP_ROTATE_SPEED);
        return;
      }
    }
    if (this.autoMode && !this.voyage) {
      // Nothing in sight (#400): search slowly towards where the enemy was last seen; hold once badly hurt.
      const hp = this.flagship.stats.currentHp / Math.max(1, this.flagship.stats.maxHp);
      const goal = autoSearchGoal(this.flagship, [...this.lastSeen.values()], { x: WORLD.w / 2, y: WORLD.h / 2 }, hp);
      const s = goal ? waypointSteer(this.flagship, goal, 200) : null;
      if (s) {
        this.flagship.steer({ ...s, throttle: Math.min(s.throttle, AUTO_SEARCH_THROTTLE) }, dtSec, SHIP_ROTATE_SPEED);
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

    this.autoBtn = new UIButton(this, CANVAS_W - 20 - b.w / 2, b.y, this.autoMode ? '自動  ON' : '自動  OFF', () => this.setAutoMode(!this.autoMode), {
      variant: this.autoMode ? 'primary' : 'secondary',
      width: b.w,
      height: b.h,
      fontSize: 15,
    });
    this.autoBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);

    this.buildActionButtons();
    // 艦隊切替 (#84): steer another of the player's fleets; the one steered so far fights on by itself.
    this.switchBtn = new UIButton(this, CANVAS_W - 20 - b.w / 2 - (IS_PORTRAIT ? 0 : b.w + 10), b.y + (IS_PORTRAIT ? b.h + 10 : 0), '艦隊切替', () => this.switchControl(), {
      variant: 'primary', width: IS_PORTRAIT ? b.w : b.w + 40, height: b.h, fontSize: IS_PORTRAIT ? 13 : 12,
    });
    this.switchBtn.setDepth(DEPTH_HUD + 2).setScrollFactor(0);
    this.refreshSwitchBtn();
    if (audio.settings.showFps || new URLSearchParams(window.location.search).has('fps')) {
      // Beside the sound button, clear of the objective banner below it (#336, #355: it touched the banner).
      this.perfText = this.add.text(140, IS_PORTRAIT ? 286 : 122, '', textStyle(12, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0, 0.5).setDepth(DEPTH_HUD + 3).setScrollFactor(0);
    }

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
      y -= a.h + a.gap;
    }
    // 消耗品 (#47): the flagship's slots, above the other actions.
    const slots = this.consumables.get(this.flagship) ?? [];
    for (let i = 0; i < 2; i++) {
      const btn = new UIButton(this, x, y, '', () => this.useFlagshipConsumable(i), { ...opts, fontSize: 14 });
      btn.setDepth(DEPTH_HUD + 2).setScrollFactor(0).setVisible(i < slots.length);
      this.consumableBtns.push(btn);
      y -= a.h + a.gap;
    }
    this.refreshConsumableUi();
  }

  /** 消耗品 (#47): slots for every warship — the player's by research, the enemy's one charge each. */
  private setupConsumables(): void {
    const research = this.scenario ? [] : loadProgress().research;
    for (const ship of this.friendlies()) if (!ship.isConvoy) this.consumables.set(ship, shipConsumables(ship.stats.shipClass, research));
    for (const ship of this.enemies) if (!ship.isLand && !ship.isConvoy) this.consumables.set(ship, shipConsumables(ship.stats.shipClass, 'enemy'));
    for (const ship of this.consumables.keys()) this.baseVision.set(ship, { vision: ship.visionMul, aa: ship.aaMul });
    this.smokeGfx = this.add.graphics().setDepth(DEPTH_SHIPS + 1);
  }

  private useFlagshipConsumable(i: number): void {
    const slot = this.consumables.get(this.flagship)?.[i];
    if (slot && this.useSlot(this.flagship, slot.kind)) this.consumableUses++;
    this.refreshConsumableUi();
  }

  /** Uses one of the ship's slots now; false when it can't. */
  private useSlot(ship: BaseShip, kind: ConsumableKind): boolean {
    const slots = this.consumables.get(ship);
    const now = this.battleNow();
    const i = slots?.findIndex((x) => x.kind === kind) ?? -1;
    const used = i >= 0 ? useConsumable(slots![i], now) : null;
    if (!slots || !used) return false;
    slots[i] = used;
    if (kind === 'repair') ship.status = {};
    if (kind === 'smoke') this.smoke.push({ x: ship.x, y: ship.y, until: used.activeUntil });
    if (kind === 'aa') this.sound3d('aaFire', ship.x, ship.y);
    if (ship.visible) {
      const t = this.add.text(ship.x, ship.y - 60, slotLabel(used, now).split(' ')[0], textStyle(14, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4 }))
        .setOrigin(0.5).setDepth(DEPTH_HUD - 2);
      this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
    return true;
  }

  /** Effects that run (repair, full power, AA barrage, search) and the AI's choices. */
  private updateConsumables(now: number, dtSec: number): void {
    const playerSide = this.playerSide();
    const raids = (enemySide: boolean): Array<{ alive: boolean; x: number; y: number }> => (enemySide ? this.playerAir.squadrons : this.enemyAir.squadrons);
    for (const [ship, slots] of this.consumables) {
      if (!ship.isAlive) continue;
      const enemySide = this.enemies.includes(ship);
      // The steered flagship uses its own from the buttons, unless on AUTO or touch AUTO fire.
      if (ship !== this.flagship || this.autoMode) {
        const foes = enemySide ? playerSide : this.enemies;
        const kind = aiConsumable(slots, {
          hpFraction: ship.stats.currentHp / Math.max(1, ship.stats.maxHp),
          seen: enemySide ? this.seenByPlayer.has(ship) : this.seenByEnemy.has(ship),
          raidNear: raids(enemySide).some((q) => q.alive && Math.hypot(q.x - ship.x, q.y - ship.y) < 400),
          hiddenFoes: foes.some((f) => f.isAlive && (f.submerged || !(enemySide ? this.seenByEnemy.has(f) : this.seenByPlayer.has(f)))),
          foesNear: foes.some((f) => f.isAlive && Math.hypot(f.x - ship.x, f.y - ship.y) < 600),
          burning: Object.keys(ship.status).length > 0,
        }, now);
        if (kind && this.useSlot(ship, kind) && !enemySide) this.consumableUses++;
      }
      if (isActive(slots, 'repair', now)) ship.stats.currentHp = Math.min(ship.stats.maxHp, ship.stats.currentHp + repairPerSec(ship.stats.maxHp) * dtSec);
      ship.boostMul = isActive(slots, 'boost', now) ? BOOST_SPEED : 1;
      const base = this.baseVision.get(ship);
      if (base) {
        ship.aaMul = base.aa * (isActive(slots, 'aa', now) ? AA_BARRAGE : 1);
        ship.visionMul = base.vision * (isActive(slots, 'radar', now) ? RADAR_VISION : 1);
      }
    }
    this.smoke = this.smoke.filter((c) => c.until > now);
    const g = this.smokeGfx;
    if (g) {
      g.clear();
      for (const c of this.smoke) {
        g.fillStyle(0xb8c0c8, 0.35 * Math.min(1, (c.until - now) / 4000));
        g.fillCircle(c.x, c.y, SMOKE_RADIUS);
      }
    }
    this.refreshConsumableUi();
  }

  /** A ship hidden in smoke from `viewers` (#47); a viewer searching with radar sees in. */
  private inSmoke(ship: BaseShip, viewers: BaseShip[]): boolean {
    if (this.smoke.length === 0) return false;
    const now = this.battleNow();
    if (viewers.some((v) => v.isAlive && isActive(this.consumables.get(v) ?? [], 'radar', now))) return false;
    return hiddenBySmoke(ship.x, ship.y, this.smoke, viewers.filter((v) => v.isAlive), now);
  }

  /** A submerged boat found by a ship searching with hydrophones (#47). */
  private heardBySearch(boat: BaseShip, hunters: BaseShip[]): boolean {
    const now = this.battleNow();
    return hunters.some((h) => h.isAlive && isActive(this.consumables.get(h) ?? [], 'radar', now) && Math.hypot(h.x - boat.x, h.y - boat.y) <= 450);
  }

  private refreshConsumableUi(): void {
    const slots = this.consumables.get(this.flagship) ?? [];
    const now = this.battleNow();
    const keys = !this.isTouch;
    this.consumableBtns.forEach((btn, i) => {
      const slot = slots[i];
      btn.setVisible(!!slot);
      if (!slot) return;
      const label = `${slotLabel(slot, now)}${keys ? `  [${i + 1}]` : ''}`;
      if (this.consumableLabels[i] !== label) {
        this.consumableLabels[i] = label;
        btn.setLabel(label);
      }
      btn.setEnabled(slot.left > 0 && now >= slot.readyAt && now >= slot.activeUntil);
    });
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
      landTargetsTotal: this.landTargets.length,
      targetsAlive: this.scenarioTargets.filter((t) => t.isAlive).length,
      targetsTotal: this.scenarioTargets.length,
      escapeProgress: this.trackEscape(),
      flagshipInZone: zone ? this.inZoneHere(this.flagship.x, this.flagship.y, zone) : false,
      enemyInZone: zone ? this.scenarioTargets.some((t) => t.isAlive && this.inZoneHere(t.x, t.y, zone)) : false,
      elapsedSec: this.elapsedSec(),
      timeLimitSec: this.side?.timeLimitSec ?? 0,
    };
  }

  /** How far the closest live objective ship has got toward its zone, 0..1 (#421); kept once it sinks. */
  private trackEscape(): number {
    const zone = this.side?.zone;
    if (!zone || (this.objective !== Objective.PreventEscape && this.objective !== Objective.Delay)) return 0;
    const c = this.zonePoint(zone);
    const r = this.zoneRadiusHere(zone.r);
    const alive = this.scenarioTargets.filter((t) => t.isAlive);
    if (alive.length === 0) return this.escapeProgress;
    const d = Math.max(0, Math.min(...alive.map((t) => Math.hypot(t.x - c.x, t.y - c.y))) - r);
    if (this.escapeStart === null) this.escapeStart = Math.max(1, d);
    this.escapeProgress = Math.min(1, Math.max(this.escapeProgress, 1 - d / this.escapeStart));
    return this.escapeProgress;
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
      const big = own.filter((e) => e.stats.shipClass === ShipClass.Battleship || e.stats.shipClass === ShipClass.Carrier).length;
      captainStats[captain.id] = addBattleStats(captainStats[captain.id], {
        night, sunk: own.length, subsSunk: ownSubs, heavySurvival, victory, flagship: ship === this.flagship,
        hpLeft: ship.isAlive ? ship.stats.currentHp / Math.max(1, ship.stats.maxHp) : 0,
        torpedoSinks: own.filter((e) => e.lastHitKind === 'torpedo').length, airSinks: own.filter((e) => e.lastHitKind === 'air').length, bigSinks: big,
      });
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
    fitText(kindText, w - 64);
    const campaign = this.battleData?.areaId !== undefined && !this.scenario;
    const lines = this.voyage
      ? [this.engagement ? '交戦中 — 全艦を沈めると勝利、2 区画ほど離れると撤退' : '航海中 — 海図で行き先を決めると自動航行で走ります', '作戦海域に入るか敵艦隊に近づくと、その場で交戦になります', '航海を終えると、艦隊はこの海の上で待機します (基地の円で入港すると、その基地に停泊)']
      : [
        ...pauseLines(this.objective, this.goalText(), this.objectiveState(), { alive: fleet.filter((f) => f.isAlive).length, total: fleet.length }),
        ...(campaign ? ['撤退すると、この出撃は終わります (それまでの報酬は残ります)'] : []),
      ];
    add(this.add.text(x + 32, y + 96, lines.join('\n'), textStyle(IS_PORTRAIT ? 15 : 14, Css.text, { lineSpacing: 8, wordWrap: { width: w - 64, useAdvancedWrap: true } })));
    const bh = IS_PORTRAIT ? 72 : 56;
    const retreatH = bh - 8;
    const retreatY = y + h - retreatH / 2 - 28;
    add(new UIButton(this, CANVAS_W / 2, retreatY - retreatH / 2 - 16 - bh / 2, '再開  ▶', () => this.setPaused(false), { variant: 'gold', width: w - 64, height: bh, fontSize: 20 }));
    add(new UIButton(this, CANVAS_W / 2, retreatY, this.voyage ? '航海を終える' : '撤退する', () => this.retreat(), { variant: 'secondary', width: w - 64, height: retreatH, fontSize: 16 }));
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
    const [kind, goal] = this.battleData?.openSea ? ['外洋 · 航海', '海図で行き先を決めて、世界の海を走れます'] : battleBanner({
      areaName: area?.name, sortie: area ? this.battleData?.sortie : undefined, exercise: this.exercise && !area,
      scenarioName: this.scenario?.name, goal: this.goalText(), timeLimitSec: this.side?.timeLimitSec,
    });
    const y = IS_PORTRAIT ? CANVAS_H * 0.32 : CANVAS_H * 0.28;
    const w = Math.min(CANVAS_W - 32, 760);
    const band = this.add.rectangle(CANVAS_W / 2, y, w, IS_PORTRAIT ? 110 : 92, Colors.bgDeep, 0.78).setScrollFactor(0).setDepth(DEPTH_HUD + 6);
    const t1 = this.add.text(CANVAS_W / 2, y - (IS_PORTRAIT ? 22 : 18), kind, textStyle(IS_PORTRAIT ? 20 : 20, Css.gold, { fontStyle: 'bold' })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 7);
    const t2 = this.add.text(CANVAS_W / 2, y + (IS_PORTRAIT ? 22 : 18), goal, textStyle(IS_PORTRAIT ? 14 : 15, Css.text, { align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true } })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_HUD + 7);
    for (const t of [t1, t2]) fitText(t, w - 24);
    this.openingBanner = [band, t1, t2];
    this.time.delayedCall(3000, () => this.tweens.add({ targets: [band, t1, t2], alpha: 0, duration: 500, onComplete: () => [band, t1, t2].forEach((o) => o.destroy()) }));
    // ナレーション (#106): the area and its goal read out; then the battle's first call.
    voice.say(narrationLine('areaStart', { area: area?.name ?? this.scenario?.name ?? kind, objective: this.goalText() }), 'narration');
    this.comment('start', {});
  }

  /** 撤退 (#279): a full withdrawal. The saved sortie ends (no 続きから), the fleet comes home and can be docked. */
  private retreat(): void {
    this.setPaused(false);
    if (this.voyage) {
      this.endVoyage();
      return;
    }
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

  // -------------------------------------------------------------------------
  // 音・実況・揺れ (#104 #106 #107)
  // -------------------------------------------------------------------------

  /** Ships that went down or were badly hurt since the last frame: their sound, line, shake and buzz. */
  private watchShips(): void {
    const own = new Set(this.friendlies());
    for (const ship of [...this.playerSide(), ...this.enemies]) {
      const wasAlive = this.aliveLastFrame.has(ship);
      if (ship.isAlive) {
        this.aliveLastFrame.add(ship);
        const frac = ship.stats.currentHp / Math.max(1, ship.stats.maxHp);
        if (frac <= 0.25 && !this.calledHeavy.has(ship) && !ship.isLand && !ship.isConvoy) {
          this.calledHeavy.add(ship);
          if (own.has(ship)) {
            this.comment('ownHeavy', { name: this.shortName(ship) }, ship);
            audio.play('alarm');
            this.feel('ownHeavy', ship);
          } else if (this.seenByPlayer.has(ship)) {
            this.comment('enemyHeavy', { class: CLASS_JA_SHORT[ship.stats.shipClass] ?? '艦' }, ship);
          }
        }
        continue;
      }
      if (!wasAlive) continue;
      this.aliveLastFrame.delete(ship);
      if (ship.isLand || ship.isConvoy) continue;
      const mine = own.has(ship);
      this.commentary = forgetLines(this.commentary, ship);
      this.sound3d(sinkSound(ship.stats.shipClass, mine), ship.x, ship.y);
      this.feel(mine ? 'ownSunk' : 'enemySunk', ship);
      this.comment(mine ? 'ownSunk' : 'enemySunk', { name: this.shortName(ship), class: CLASS_JA_SHORT[ship.stats.shipClass] ?? '艦' });
    }
    // The flagship's own hits, and the call when it is in danger.
    if (this.flagship.isAlive) {
      const frac = this.flagship.stats.currentHp / Math.max(1, this.flagship.stats.maxHp);
      if (frac < this.flagshipHpSeen - 0.04) {
        this.comment('ownHit', { name: this.shortName(this.flagship) }, this.flagship);
        this.feel('ownHit', this.flagship);
      }
      if (frac <= 0.35 && this.flagshipHpSeen > 0.35) this.comment('flagshipDanger', {});
      this.flagshipHpSeen = Math.min(this.flagshipHpSeen, frac);
    }
    // 撃墜 (#104): enemy planes shot down since the last frame.
    const down = this.enemyAir.totalLost();
    if (down > this.planesDownSeen) audio.play('planeDown');
    this.planesDownSeen = down;
    // 敵艦隊発見: the first enemy seen.
    if (!this.contactCalled) {
      const seen = this.enemies.find((e) => this.seenByPlayer.has(e) && !e.isLand);
      if (seen) {
        this.contactCalled = true;
        this.comment('contact', { bearing: bearingWord(this.flagship.x, this.flagship.y, seen.x, seen.y) });
      }
    }
  }

  private shortName(ship: BaseShip): string {
    return ship.stats.name.replace(/\s*\(.*\)\s*$/, '');
  }

  /** Raises a battle line (#106) in the player's navy's words. */
  private comment(kind: CommentaryKind, vars: Record<string, string>, subject?: BaseShip): void {
    if (this.scenario && kind === 'start') return;
    this.commentary = raise(this.commentary, { kind, text: battleLine(kind, this.playerNation, vars), at: this.elapsedSec(), subject }, audio.settings.commentaryRate);
  }

  /** Says the next line and shows it as a subtitle (#106). */
  private updateCommentary(): void {
    const now = this.elapsedSec();
    const r = nextCommentary(this.commentary, now);
    this.commentary = r.state;
    if (r.line) {
      voice.say(r.line.text, 'commentary');
      this.showSubtitle(r.line.text, now);
    }
    if (this.subtitle && now > this.subtitleUntil) this.subtitle.setVisible(false);
  }

  private showSubtitle(text: string, now: number): void {
    if (!audio.settings.subtitles) return;
    if (!this.subtitle) {
      const w = IS_PORTRAIT ? CANVAS_W - 2 * (172 + 36) : 560;
      this.subtitle = this.add.text(CANVAS_W / 2, CANVAS_H - (IS_PORTRAIT ? 300 : 120), '', textStyle(IS_PORTRAIT ? 15 : 14, Css.text, {
        fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 4, align: 'center', wordWrap: { width: w, useAdvancedWrap: true },
      })).setOrigin(0.5, 1).setDepth(DEPTH_HUD + 1).setScrollFactor(0);
    }
    this.subtitle.setText(text).setVisible(true);
    this.subtitleUntil = now + 3;
  }

  /** The camera shake and the phone's buzz for what happened (#107). */
  private feel(event: FeedbackEvent, ship: BaseShip): void {
    const v = this.cameras.main.worldView;
    const shake = shakeFor(event, shipSize(ship.stats.shipClass), Phaser.Math.Distance.Between(ship.x, ship.y, v.centerX, v.centerY), audio.settings.shake);
    if (shake) this.cameras.main.shake(shake.durationMs, shake.intensity);
    const buzz = vibrateFor(event, shipSize(ship.stats.shipClass), audio.settings.vibrate && !audio.muted);
    if (buzz && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(buzz);
      } catch {
        // iOS Safari and desktops: nothing.
      }
    }
  }

  private triggerGameOver(victory: boolean): void {
    if (this.gameOver) return;
    this.gameOver = true;
    // 勝敗 (#104 #106): the jingle and the last line, said at once.
    audio.play(victory ? 'victory' : 'defeat');
    // 作戦目標ごとの台詞 (#394): a withdrawal covered is not 「敵艦隊を撃滅」.
    const last = outcomeLine(victory, this.objective, this.playerNation, !this.flagship?.isAlive);
    voice.say(last, 'commentary');
    if (this.commentary) this.commentary = { ...this.commentary, log: [...this.commentary.log, { kind: victory ? 'victory' : 'defeat', text: last, at: this.elapsedSec() }] };
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
      reason: outcomeReason(this.objective, this.objectiveState(), victory),
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
      // 戦闘ログ (#106): everything the commentary said.
      log: logLines(this.commentary.log),
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
      // 船団護衛 (#421): an S keeps the convoy whole too.
      convoyHp: this.objective === Objective.Convoy && this.convoy.length > 0 ? convoyHpRatio(this.objectiveState()) : undefined,
    };
    const rank = battleRank(rankInput);
    // The objective's own numbers (#421) on the results' cards and under the rank.
    const objResult = objectiveResult(this.objective, this.objectiveState(), { alive: result.survivors, total: result.fleetSize });
    result.objectiveStats = objResult.stats;
    result.achievement = objResult.achievement;
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
    }, { exercise: this.exercise, event: this.battleEvent, theater: area?.theater, rankMul: RANK_REWARD_MUL[rank] * (area?.training ? TRAINING_SCALE : 1) * this.difficulty.rewardMul
      // 記念日 (#416): the navies of the day's battle earn more from the campaign.
      * (area && !area.training ? anniversaryRewardMul(this.playerNation, Date.now()) : 1) });
    if (this.scenario) {
      // Historical scenarios are exhibitions: no rewards, damage or crew experience carry over. The record keeps
      // their results apart (#177), out of the career totals.
      const before = loadProgress();
      let after = this.updateRecord(before, victory, fleet.filter((s) => !s.isAlive).length, result);
      // A side's first win pays a little gold (#200 #183); scenarios stay exhibitions otherwise.
      const force = this.scenarioSetup?.side.force;
      const firstWin = victory && force !== undefined && (before.record.scenarios?.[this.scenario.id]?.wins[force] ?? 0) === 0;
      if (firstWin) after = { ...after, wallet: addGold(walletOf(after), GOLD_SCENARIO_FIRST) };
      // 記念日 (#416): the battle won on its own day pays gold, once a year.
      const anniv = victory ? winAnniversary(after.specialOps, this.scenario.id, Date.now()) : null;
      if (anniv) after = { ...after, specialOps: anniv.ops, wallet: addGold(walletOf(after), ANNIVERSARY_GOLD) };
      // 任務 (#314): a historical win counts for the history quest, and only that (no other quest or reward).
      if (victory) after = withQuestEvents(after, [['scenarioWin', 1], ['anniversaryWin', anniv ? 1 : 0]], Date.now());
      saveProgress(after);
      result.reward = undefined;
      result.cost = undefined;
      result.campaign = `シナリオ: ${this.scenario.name}  ${victory ? '勝利' : '敗北'}${firstWin ? `  ·  初勝利 ゴールド ${GOLD_SCENARIO_FIRST}` : ''}${anniv ? `  ·  記念日 (${anniv.anniversary.name}) ゴールド ${ANNIVERSARY_GOLD}` : ''}`;
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
    // 士気 (#54): a campaign battle tires the ships that fought; a win lifts them again.
    const moraleBefore: IMoraleState = { morale: progress.morale, moraleAt: progress.moraleAt };
    if (area && !area.training) progress = addMorale(progress, fleet.map((s) => s.dataId).filter((id): id is string => !!id), battleMoraleDelta(victory, rank), now);
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
      // 陣形章 (#345): a win in each formation.
      [`win${this.formation}` as QuestEvent, won(true)],
      ['landKill', this.enemies.filter((e) => e.isLand && !e.isAlive).length],
      // 寡兵の勝利 (#280): a campaign win with a fleet at most UNDERDOG_RATIO of the enemy's strength.
      ['underdogWin', won(!!area && this.underdog())],
      // 出撃コスト (#306): a campaign win with the fleet's cost right at the rank's cap, or at half of it or less.
      // 複数艦隊 (#84) and 友軍艦隊 (#64)
      ['multiFleetWin', won(!!area && (this.groups.some((g) => g.owned) || this.controlLabel !== '第一艦隊'))], ['allyWin', won(this.groups.some((g) => !g.owned))],
      ['sparkleWin', won(!!area && sailed.length > 0 && sailed.every((s) => moraleOf(moraleBefore, s.id, now) >= MORALE_HIGH))],
      ['fullCostWin', won(!!area && fleetCostNow === costCapNow)], ['lightCostWin', won(!!area && fleetCostNow * 2 <= costCapNow)],
      // 無傷の完勝 (#295): no loss and 95% of the fleet's HP left.
      ['flawlessWin', won(rankInput.shipsLost === 0 && rankInput.hpRatio >= FLAWLESS_HP)],
      // #158: rank, losses, purpose, fleet and theater of the win; sinkings of every class.
      ['hardWin', won(this.difficulty === DIFFICULTIES.hard)], ['fireSet', this.firesSet], ['airfieldDown', this.landTargets.filter((t) => !t.isAlive && this.enemyAir.hasCarrier(t)).length], ['baseAirStrike', this.baseAirSent], ['skillProc', this.skillProcs], ['superweaponSunk', this.superweapon && !this.superweapon.isAlive ? 1 : 0], ['superweaponWin', won(this.superweapon !== null)], ['winS', won(rank === 'S')], ['winA', won(rank === 'S' || rank === 'A')], ['perfectWin', won(rankInput.shipsLost === 0)],
      ['campaignWin', won(!!area)], ['objectiveWin', won(!!area && this.objective !== Objective.Annihilate)], ['exerciseWin', won(this.exercise)], ['fleetExerciseWin', won(this.exercise && (this.battleData?.enemySupport?.length ?? 0) >= 2 && this.groups.filter((g) => g.owned).length >= 2)],
      ['convoyWin', won(this.objective === Objective.Convoy && !this.exercise)],
      // Enemy planes shot down, by guns or fighters (#185).
      ['planesDown', this.enemyAir.totalLost()],
      // 消耗品 (#47): used by the player's ships.
      ['consumableUse', this.consumableUses],
      ['ddFlagWin', won(this.flagship?.stats.shipClass === ShipClass.Destroyer)], ['favoriteFlagWin', won(!!this.flagship?.dataId && isFavorite(progress.favorites, this.flagship.dataId))],
      // 0.0.61 (#426): what the submarines sank, and wins with the new kinds.
      ['subSink', sunk.filter((e) => e.lastHitBy?.stats.shipClass === ShipClass.Submarine && fleet.includes(e.lastHitBy)).length],
      ['tenderWin', won(fleet.some((s) => this.subtypeOf(s) === ShipSubtype.SeaplaneTender))],
      ['largeCarrierFlagWin', won(!!this.flagship && this.subtypeOf(this.flagship) === ShipSubtype.LargeCarrier)], ...(theaterEvent && !area?.training ? [[theaterEvent, won(true)] as [QuestEvent, number]] : []),
      ['trainingWin', won(this.exercise && this.battleData?.training === true)],
      // 本当のオープンワールド (#445, 0.0.69): fights on the open sea.
      ['seaAreaWin', won(!!this.voyage && !!area)], ['seaGroupWin', won(!!this.voyage && !!this.battleData?.world)],
      ['seaObjectiveWin', won(!!this.voyage && !!area && this.objective !== Objective.Annihilate)], ['drillWin', won(!!this.voyage && this.drillHp !== null)],
      // 海の障害と上陸支援 (#368)
      ['mineSwept', this.fieldsSwept], ['landingStrike', this.landings],
      ['sinkDestroyer', sunkOf(ShipClass.Destroyer)], ['sinkCruiser', sunkOf(ShipClass.Cruiser)],
      ['sinkCarrier', sunkOf(ShipClass.Carrier)], ['sinkSubmarine', sunkOf(ShipClass.Submarine)], ['sinkBattleship', sunkOf(ShipClass.Battleship)],
      // A win under each kind of event counts for the イベント巡り章 (#218).
      ...(event ? [[`event_${event.kind}`, won(true)] as [QuestEvent, number]] : []),
    ], Date.now());
    // 艦ごとの戦歴 (#416): each of the admiral's own ships, and the superweapon met.
    if (!this.scenario) progress = this.recordShips(progress, fleet, result.durationSec ?? 0);
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
    } else if (this.battleData?.world) {
      // 外洋 (#65): the group's reward by the danger of the water; a defeat, or every ship badly hurt, brings the fleet home.
      const w = this.battleData.world;
      let world = afterBattle(progress.world ?? emptyWorld(), w.spotId, w.danger, victory);
      let line = `外洋 (危険度 ${w.danger}): ${victory ? '勝利' : '敗北'}`;
      if (victory) {
        // 制海権 (#65 第 3 段階): a ring the navy holds pays more; every win counts towards holding it.
        const base = worldReward(w.danger);
        const extra = w.controlled ? { fuel: Math.round(base.fuel * CONTROL_REWARD_MUL), ammo: Math.round(base.ammo * CONTROL_REWARD_MUL), steel: Math.round(base.steel * CONTROL_REWARD_MUL), bauxite: Math.round(base.bauxite * CONTROL_REWARD_MUL) } : base;
        const ring = winInRing(world, w.danger, now);
        world = ring.world;
        if (ring.took) progress = withQuestEvents(progress, [['worldControl', 1]], now);
        if (w.ally) progress = withQuestEvents(progress, [['patrolWin', 1]], now);
        // 住人 (0.0.72): a running patrol caught, a convoy raided (its cargo by the danger of the water).
        if (w.chase) progress = withQuestEvents(progress, [['chaseWin', 1]], now);
        if (w.raid) {
          const cargo = resourceReward('convoy', w.danger);
          const g4 = gainResources(progress.resources, cargo, holdCap(progress.facilities));
          progress = withQuestEvents({ ...progress, resources: g4.resources, ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(cargo, g4.lost, -1), now), 'overflow', g4.lost, now) }, [['convoyRaid', 1]], now);
          lost = addResources(lost, g4.lost);
          line += `  ·  船団の積荷 ${formatResources(cargo)}`;
        }
        if (w.historic) {
          world = winHistoric(world, now);
          progress = withQuestEvents({ ...progress, wallet: addGold(walletOf(progress), HISTORIC_GOLD) }, [['historicWin', 1]], now);
        }
        const g = gainResources(progress.resources, extra, holdCap(progress.facilities));
        progress = { ...progress, resources: g.resources, wallet: addGold(walletOf(progress), worldGold(w.danger)), ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(extra, g.lost, -1), now), 'overflow', g.lost, now) };
        lost = addResources(lost, g.lost);
        progress = withQuestEvents(progress, [['worldWin', 1]], now);
        line += `  ·  外洋の報酬 ${formatResources(extra)}・ゴールド ${worldGold(w.danger)}${ring.took ? `  ·  危険度 ${w.danger} の輪の制海権を取りました` : ''}${w.historic ? `  ·  史実の海戦 ゴールド ${HISTORIC_GOLD}` : ''}`;
        // 敵の船団 (0.0.70): its cargo, once a game hour.
        const convoyPlace = w.convoy ? seaPlaces(this.playerNation).find((p) => p.id === w.spotId) : undefined;
        if (convoyPlace) {
          const cargo = placeReward(convoyPlace, this.playerNation);
          world = markPlace(world, convoyPlace, now);
          const g3 = gainResources(progress.resources, cargo, holdCap(progress.facilities));
          progress = withQuestEvents({ ...progress, resources: g3.resources, ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(cargo, g3.lost, -1), now), 'overflow', g3.lost, now) }, [['resourceRun', 1]], now);
          lost = addResources(lost, g3.lost);
          line += `  ·  船団の積荷 ${formatResources(cargo)}`;
        }
        // 敵の要塞 (#65 第 2 段階): taken, it pays its own reward and makes the water round it safer this week.
        if (w.fort) {
          world = takeFort(world, w.spotId, now);
          const g2 = gainResources(progress.resources, FORT_REWARD, holdCap(progress.facilities));
          progress = withQuestEvents({ ...progress, resources: g2.resources, wallet: addGold(walletOf(progress), FORT_GOLD), ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(FORT_REWARD, g2.lost, -1), now), 'overflow', g2.lost, now) }, [['fortTaken', 1]], now);
          lost = addResources(lost, g2.lost);
          line += `  ·  要塞を攻略: ${formatResources(FORT_REWARD)}・ゴールド ${FORT_GOLD} (今週はまわりの敵が弱くなる)`;
        }
      }
      if (mustReturn(victory, fleet.map((s) => (s.isAlive ? s.stats.currentHp / Math.max(1, s.stats.maxHp) : 0)), HEAVY_DAMAGE)) {
        world = endVoyage(world);
        line += victory ? '  ·  全艦が大破したため帰港' : '  ·  帰港しました';
      }
      progress = { ...progress, world };
      result.campaign = line;
      result.returnScene = SceneKeys.WORLD;
    } else if (this.exercise) {
      result.campaign = '演習: 損傷なし・資源報酬は半分';
    }
    if (area && this.battleData?.swArea) result.campaign = `超兵器海域: ${area.name}  ${victory ? '勝利' : '敗北'}`;
    // 制海権 (#50): a defence settles the counterattack; a main-fleet win takes a lost sea back; every main-fleet
    // battle counts towards the next counterattack.
    // 特別海域 (#416): its win pays once a week; it leaves the seas held as they are.
    if (area && this.battleData?.special) {
      const ops = victory ? winSpecial(progress.specialOps, now) : null;
      if (ops) {
        const reward = specialReward(area.reward);
        const g = gainResources(progress.resources, reward, holdCap(progress.facilities));
        progress = { ...progress, specialOps: ops, resources: g.resources, wallet: addGold(walletOf(progress), SPECIAL_GOLD), ledger: recordLedger(recordLedger(progress.ledger, 'battle', addResources(reward, g.lost, -1), now), 'overflow', g.lost, now) };
        progress = withQuestEvents(progress, [['specialWin', 1]], now);
        lost = addResources(lost, g.lost);
      }
      result.campaign = `特別海域: ${area.name}  ${victory ? '勝利' : '敗北'}${ops ? `  ·  報酬 ${formatResources(specialReward(area.reward))}・ゴールド ${SPECIAL_GOLD}` : victory ? '  ·  今週の報酬は受け取り済み' : ''}`;
    }
    if (area && !skirmish && !this.battleData?.swArea && !this.battleData?.special && !area.training) {
      const sea = this.seaAfterBattle(progress, area, victory, now);
      progress = sea.progress;
      if (sea.line) result.sea = sea.line;
      if (this.battleData?.defense) result.campaign = `${victory ? '防衛成功' : '防衛失敗'}: ${area.name}`;
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
    // A formation that comes with the new rank (#345) is named with the promotion.
    const newFormations = promoted.promotedTo ? FORMATION_ORDER.filter((f) => FORMATION_RULES[f].minRank > before.index && FORMATION_RULES[f].minRank <= after.index).map((f) => FORMATION_RULES[f].ja) : [];
    // And the expeditions it opens (#359).
    const newExpeditions = promoted.promotedTo ? EXPEDITIONS.filter((e) => e.rank > before.index && e.rank <= after.index).map((e) => e.name) : [];
    if (merit > 0 || promoted.promotedTo) result.merit = `戦功 +${merit}${promoted.promotedTo ? `  ·  昇進: ${before.name} → ${promoted.promotedTo.name}` : ''}${newFormations.length > 0 ? `  ·  新しい陣形: ${newFormations.join('・')}` : ''}${newExpeditions.length > 0 ? `  ·  新しい遠征: ${newExpeditions.join('・')}` : ''}`;
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
    // 地上兵器 (#251): the shore defences destroyed, by kind, for the book and the medals.
    const groundDown = this.landTargets.filter((t) => !t.isAlive).map((t) => t.dataId);
    if (!this.scenario && groundDown.length > 0) progress = { ...progress, groundKills: addGroundKills(progress.groundKills, groundDown) };
    // 搭乗員 (#87): every carrier that flew grows its pilots; shooting enough planes down brings an ace.
    if (!this.scenario) {
      let pilots = progress.pilots;
      const aces: string[] = [];
      for (const ship of fleet) {
        const wing = ship.dataId ? this.playerAir.wing(ship) : undefined;
        if (!wing || !ship.dataId) continue;
        const next = pilotAfterBattle(pilots[ship.dataId], { kills: this.playerAir.killsBy(ship), lost: wing.lost }, progress.nation, pilots);
        pilots = { ...pilots, [ship.dataId]: next.pilot };
        if (next.aceBorn) aces.push(`${next.aceBorn} (${ship.stats.name.replace(/\s*\(.*\)\s*$/, '')})`);
      }
      progress = withQuestEvents({ ...progress, pilots }, [['aceBorn', aces.length]], now);
      if (aces.length > 0) recruitLines.push(`エース誕生: ${aces.join('・')}`);
    }
    // 部品と設計図 (#150): enemies sunk in a campaign battle leave pieces now and then; a superweapon always does.
    if (area && !area.training && !this.exercise) {
      const catalog = DataLoader.getUpgrades(this);
      const enemyNation = this.voyage ? this.enemyNation : (this.battleData?.enemyFleet?.nation ?? progress.nation);
      const swArea = this.battleData?.swArea === true;
      const drops = rollDrops(catalog, sunk.map((e) => ({ shipClass: e.stats.shipClass, nation: enemyNation })), rank, victory, { giantSunk, giantArea: swArea }, Math.random);
      progress = withQuestEvents(applyDrops(progress, drops), [['partDrop', drops.parts.length], ['blueprint', drops.blueprints], ['swAreaWin', won(swArea)]], now);
      const line = dropLine(catalog, drops, progress.blueprints);
      if (line) recruitLines.push(line);
      // 他国の設計図 (#368 #420): the plans of a ship like one sunk, counted for that ship alone.
      const all = DataLoader.getRegistry(this).all();
      const dataOf = (s: BaseShip): Pick<IShipData, 'id' | 'shipClass' | 'subtype'> => all.find((d) => d.id === s.dataId) ?? { id: s.dataId ?? '', shipClass: s.stats.shipClass };
      const gainPlans = (from: Nation, offer: IShipData, ally: boolean): void => {
        const before = progress.foreignFragments[offer.id] ?? 0;
        progress = withQuestEvents({ ...progress, foreignFragments: { ...progress.foreignFragments, [offer.id]: before + 1 } }, [['foreignFragment', 1], ['allyFragment', ally ? 1 : 0]], now);
        recruitLines.push(`${ally ? '友軍 ' : ''}${NATION_INFO[from]?.jaShort ?? from}: ${fragmentNote(offer, before, before + 1)}`);
      };
      const plans = enemyNation !== progress.nation ? rollFragment(all, enemyNation as Nation, sunk.map(dataOf), rank, victory, Math.random) : null;
      if (plans) gainPlans(enemyNation as Nation, plans, false);
      // 友軍の設計図 (#386): a navy that fought beside the player shares a ship's plans now and then after a win (史実の供与艦).
      const allies = [...new Set(this.groups.filter((g) => !g.owned && g.nation && g.nation !== progress.nation).map((g) => g.nation as Nation))];
      for (const ally of allies) {
        const theirs = this.groups.filter((g) => !g.owned && g.nation === ally).flatMap((g) => g.ships).map(dataOf);
        const eligible = theirs.filter((d) => offerFor(all, ally, d));
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        const got = pick ? rollFragment(all, ally, [pick], rank, victory, Math.random) : null;
        if (got) gainPlans(ally, got, true);
      }
    }
    if (recruitLines.length > 0) result.recruits = recruitLines.join('\n');
    progress = this.updateRecord(progress, victory, fleet.filter((s) => !s.isAlive).length, result);
    // The sortie's battle is settled (#138): reopening the game offers the advance, not this battle again. A
    // superweapon sea (#148) is fought outside any sortie.
    if (area && this.battleData?.swArea !== true && !this.voyage) progress = markSortieFought(progress);
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
    // 海の上の交戦 (0.0.69): settled in place, the voyage goes on.
    if (this.settlingInPlace) {
      this.settlingInPlace = false;
      this.finishSeaFight(victory, result);
      return;
    }
    // The flagship lost at sea: the survivors are towed home (they lie at the home port again), back to the 外洋 screen.
    if (this.voyage) {
      const v = this.voyage;
      const p = loadProgress();
      const ids = fleet.filter((s) => s.isAlive && s.dataId).map((s) => s.dataId as string);
      saveProgress({ ...p, openSea: v.result(p.openSea, ids, homeAnchor(this.playerNation)) });
      this.voyage = null;
      result.returnScene = SceneKeys.WORLD;
    }
    this.time.delayedCall(1200, () => this.scene.start(SceneKeys.RESULTS, result));
  }

  /** Adds this battle to the service record and awards any medals it earned. */
  private updateRecord(progress: IProgress, victory: boolean, shipsLost: number, result: IBattleResultData): IProgress {
    let record = recordBattle(progress.record, {
      victory,
      sunkClasses: this.enemies.filter((e) => !e.isAlive && !e.isLand && !e.isConvoy).map((e) => e.stats.shipClass),
      damageDealt: Object.values(this.damageLog.player).reduce((a, n) => a + n, 0),
      shipsLost,
      career: {
        distanceNm: this.sailedPx / PX_PER_NM,
        shellsFired: this.playerWeapons.fired.shells,
        shellHits: this.shellHits,
        torpedoesFired: this.playerWeapons.fired.torpedoes,
        torpedoHits: this.torpedoHits,
        chargesDropped: this.playerWeapons.fired.charges,
        planesDown: this.enemyAir.totalLost(),
        damageTaken: Object.values(this.damageLog.enemy).reduce((a, n) => a + n, 0),
        battleSec: this.elapsedSec(),
      },
    }, this.scenario ? 'scenario' : this.exercise ? 'exercise' : 'campaign',
    this.scenario && this.scenarioSetup ? { id: this.scenario.id, force: this.scenarioSetup.side.force } : undefined);
    // 図鑑 (#384): every enemy met opens its page; the ships sunk are counted (the shore defences have groundKills).
    record = noteEnemies(record, this.enemies.filter((e) => !e.isConvoy).map((e) => ({ id: e.dataId, sunk: !e.isAlive && !e.isLand })));
    // Medals look at every nation's progress too (#92): the save as it will be written.
    const awarded = awardEarnedMedals(withSaveProgress(loadSave(), { ...progress, record }));
    const medals = awarded.medals;
    record = awarded.save.record;
    if (medals.length > 0) result.medals = medals.map((m) => m.name);
    // Medals bring gold (#183): the purse goes back with the record.
    return { ...progress, record, wallet: awarded.save.wallet };
  }

}
