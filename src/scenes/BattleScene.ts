import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_HUD, DEPTH_SHIPS, DEPTH_WATER_FX, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { BaseProjectile } from '@/entities/weapons/BaseProjectile';
import { DEPTH_CHARGE_RADIUS } from '@/entities/weapons/DepthCharge';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem, aiSelf, fireAt, IShipView, nearestDistance, shipView } from '@/systems/AISystem';
import { EscortAISystem } from '@/systems/EscortAISystem';
import { chooseTarget, TACTICS } from '@/systems/AIBrain';
import { aaGuns, AirOpsSystem } from '@/systems/AirOpsSystem';
import { AircraftType } from '@/types/Aircraft';
import { FleetSystem } from '@/systems/FleetSystem';
import { FormationSystem } from '@/systems/FormationSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { generateEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { canDive, updateSubmarine } from '@/systems/SubmarineSystem';
import { depthChargeFalloff, isDetected, ISonarHunter, sonarRange } from '@/systems/SonarSystem';
import { AIRCRAFT_VISION, isVisible, shipVision, VisionSource } from '@/systems/VisionSystem';
import { ReconSystem } from '@/systems/ReconSystem';
import { FogOfWar } from '@/ui/FogOfWar';
import { primaryWeapon, selectWeapons, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { BattleMode } from '@/types/Battle';
import { Explosion } from '@/entities/effects/Explosion';
import { WaterSplash } from '@/entities/effects/WaterSplash';
import { HUD } from '@/ui/HUD';
import { VirtualJoystick } from '@/ui/components/VirtualJoystick';
import { addChip, addOceanWorld, UIButton } from '@/ui/components/UIKit';
import { engageSteer, hitTestTarget, inRange, pickTarget, waypointSteer } from '@/systems/AutoPilot';
import { Colors, Css, textStyle } from '@/ui/theme';
import { DataLoader } from '@/utils/DataLoader';
import { angleBetween, edgePoint } from '@/utils/MathUtils';
import { IShipData, IShipStats } from '@/types/Ship';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { IFleet } from '@/types/Fleet';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData, IBattleResultData } from '@/types/Scene';

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
const AUTO_CARRIER_STANDOFF = 850;
const TOP_BUTTON = IS_PORTRAIT ? { y: 46, w: 172, h: 60 } : { y: 42, w: 130, h: 44 };
/** Torpedo / dive buttons sit above the bottom-right corner. */
const ACTION_BUTTON = IS_PORTRAIT ? { w: 172, h: 64, gap: 14, bottom: 120 } : { w: 150, h: 46, gap: 10, bottom: 90 };
/** The sea is about twice the screen in each direction; the camera follows the flagship. */
const WORLD = IS_PORTRAIT ? { w: 1440, h: 2240 } : { w: 2400, h: 1440 };
const WORLD_BOUNDS = { width: WORLD.w, height: WORLD.h };
const CAMERA_LERP = 0.12;
// Player fleet starts near the bottom (room behind for escorts in line-ahead), enemies near the top.
const FLAGSHIP_SPAWN = { x: WORLD.w / 2, y: WORLD.h - 260 };
const ENEMY_TOP = 220;
const ENEMY_SPAWN_POSITIONS = [
  { x: WORLD.w * 0.25, y: ENEMY_TOP + 40 },
  { x: WORLD.w * 0.75, y: ENEMY_TOP + 40 },
  { x: WORLD.w / 2, y: ENEMY_TOP },
];
/** Screen area where enemies count as visible; outside it they get an edge marker. Excludes the HUD strip. */
const VIEW_INSET = { left: 26, right: CANVAS_W - 26, top: IS_PORTRAIT ? 244 : 96, bottom: CANVAS_H - 26 };

/** Alpha of a submerged boat: own boats stay faintly visible, enemy boats only while on sonar. */
const SUBMERGED_ALPHA = 0.45;
/** One sonar sweep (an expanding ring around each hunter) takes this long. */
const SONAR_PING_MS = 2200;

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
  private airText: Phaser.GameObjects.Text | null = null;
  private strikeBtn: UIButton | null = null;
  private enemyNation: Nation = Nation.USN;

  private aiSystems: AISystem[] = [];
  private escortAISystems: EscortAISystem[] = [];

  /** Player ships the enemy currently has on sonar (submerged boats only matter) */
  private seenByEnemy = new Set<BaseShip>();
  /** Enemy ships the player currently sees */
  private seenByPlayer = new Set<BaseShip>();

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
  private battleStartedAt = 0;

  private aimAngle = 0;
  private gameOver = false;

  constructor() {
    super({ key: SceneKeys.BATTLE });
  }

  init(data: IBattleInitData): void {
    this.battleData = data ?? null;
  }

  create(): void {
    this.gameOver = false;
    this.escorts = [];
    this.enemies = [];
    this.aiSystems = [];
    this.escortAISystems = [];
    this.seenByEnemy = new Set();
    this.seenByPlayer = new Set();
    this.diveBtn = null;
    this.diveText = null;
    this.airText = null;
    this.strikeBtn = null;
    this.wantDive = false;

    addOceanWorld(this, WORLD.w, WORLD.h);
    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.battleStartedAt = this.time.now;
    this.aimTarget = { x: FLAGSHIP_SPAWN.x, y: FLAGSHIP_SPAWN.y - 300 };
    this.isTouch = this.sys.game.device.input.touch;
    this.autoMode = false;
    this.lockedTarget = null;
    this.waypoint = null;

    const { playerFleet, enemyFleet, formation } = this.resolveFleets(DataLoader.getRegistry(this));
    this.playerNation = playerFleet.nation;
    this.enemyNation = enemyFleet.nation;

    this.playerWeapons = new WeaponSystem(this, (x, y, w) => this.onDepthCharge(x, y, w, this.enemies));
    this.enemyWeapons = new WeaponSystem(this, (x, y, w) => this.onDepthCharge(x, y, w, this.friendlies()));
    const bomb = DataLoader.getWeaponById(this, 'aerial_bomb') ?? FALLBACK_WEAPON;
    const aerialTorpedo = DataLoader.getWeaponById(this, 'aerial_torpedo') ?? FALLBACK_WEAPON;
    const onBomb = (x: number, y: number): void => this.explosion.play(x, y);
    this.playerAir = new AirOpsSystem(this, false, this.playerWeapons, bomb, aerialTorpedo, onBomb);
    this.enemyAir = new AirOpsSystem(this, true, this.enemyWeapons, bomb, aerialTorpedo, onBomb);
    this.playerRecon = new ReconSystem(this, false);
    this.enemyRecon = new ReconSystem(this, true);

    this.spawnPlayerFleet(playerFleet, formation);
    this.spawnEnemyFleet(enemyFleet);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.w, WORLD.h);
    cam.startFollow(this.flagship, true, CAMERA_LERP, CAMERA_LERP);

    this.explosion = new Explosion(this);
    this.splash = new WaterSplash(this);
    const torpedoMain = weaponKind(this.playerWeapon) === WeaponKind.Torpedo;
    this.hud = new HUD(this, this.flagship, this.enemies, this.escorts, torpedoMain ? '魚雷' : '主砲');

    this.fog = new FogOfWar(this);
    this.setupInput();
    this.buildOverlayUi();
    this.setupClickFire();
    this.setupOverlaps();
  }

  update(time: number, delta: number): void {
    if (this.gameOver) return;

    // Flagship may have been destroyed by a physics overlap callback in the previous frame.
    // Guard here before accessing .body in handleMovement to prevent a null-body crash.
    if (!this.flagship.active) {
      this.triggerGameOver(false);
      return;
    }

    const dtSec = delta / 1000;
    this.updateSubmarines(dtSec);
    this.playerRecon.update(time, delta, aaGuns(this.enemies));
    this.enemyRecon.update(time, delta, aaGuns(this.friendlies()));
    this.updateDetection();
    const playerView = this.friendlies().map((s) => shipView(s, this.seenByEnemy.has(s)));
    const enemyView = this.enemies.map((s) => shipView(s, this.seenByPlayer.has(s)));

    if (!this.isTouch) {
      // Re-project the cursor every frame: the camera moves even when the mouse doesn't.
      const p = this.input.activePointer;
      this.aimTarget = this.cameras.main.getWorldPoint(p.x, p.y);
    }
    const target = this.currentTarget();
    this.handleMovement(delta, target);
    this.updateAim();
    if (target && (this.isTouch || this.autoMode)) this.autoFire(target, enemyView, time);
    else if (target) this.autoSecondaries(target, enemyView, time);
    this.autoDepthCharge(enemyView, time);

    this.playerWeapons.update(time, delta);
    this.enemyWeapons.update(time, delta);
    this.updateAir(time, delta, playerView, enemyView);

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.isAlive) this.aiSystems[i].update(enemy, playerView, time, delta);
    }

    for (let i = 0; i < this.escorts.length; i++) {
      if (this.escorts[i].isAlive) {
        this.escortAISystems[i].update(this.escorts[i], this.flagship, enemyView, time, delta);
      }
    }

    this.hud.update(this.flagship, this.enemies, this.escorts, {
      reload: this.playerWeapons.reloadProgress(this.flagship, this.playerWeapon, time),
      elapsedSec: (time - this.battleStartedAt) / 1000,
    });
    this.refreshDiveUi();
    this.refreshAirUi();
    this.drawReticle();
    this.drawSonar(time);
    this.drawEdgeMarkers();
    this.checkWinLoss();
  }

  private friendlies(): BaseShip[] {
    return [this.flagship, ...this.escorts];
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

  private spawnShip(shipData: IShipData, x: number, y: number): BaseShip {
    const loadout = this.loadoutOf(shipData);
    const ship = new BaseShip(this, x, y, shipData.spriteKey, this.shipDataToStats(shipData, primaryWeapon(loadout)));
    ship.loadout = loadout;
    ship.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
    (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
    return ship;
  }

  private spawnPlayerFleet(fleet: IFleet, formation: Formation): void {
    const flagshipData = FleetSystem.getFlagship(fleet);
    if (!flagshipData) return;

    this.flagship = this.spawnShip(flagshipData, FLAGSHIP_SPAWN.x, FLAGSHIP_SPAWN.y);
    this.playerAir.register(this.flagship, AirOpsSystem.wingFor(flagshipData));
    this.playerRecon.register(this.flagship);
    this.playerWeapon = primaryWeapon(this.flagship.loadout) ?? FALLBACK_WEAPON;

    const offsets = FormationSystem.getOffsets(formation);
    const profile = TACTICS[fleet.nation];
    FleetSystem.getEscorts(fleet).forEach((escortData, i) => {
      const offset = offsets[Math.min(i, offsets.length - 1)];
      const spawnPos = FormationSystem.getWorldPositionFromValues(FLAGSHIP_SPAWN.x, FLAGSHIP_SPAWN.y, 0, offset);
      const escort = this.spawnShip(escortData, spawnPos.x, spawnPos.y);
      this.playerAir.register(escort, AirOpsSystem.wingFor(escortData));
      this.playerRecon.register(escort);
      this.escorts.push(escort);
      this.escortAISystems.push(new EscortAISystem(this.playerWeapons, offset, profile));
    });
  }

  private spawnEnemyFleet(fleet: IFleet): void {
    const profile = TACTICS[fleet.nation];
    FleetSystem.getShips(fleet).forEach((shipData, i) => {
      const pos = ENEMY_SPAWN_POSITIONS[i] ?? { x: WORLD.w / 2, y: ENEMY_TOP };
      const enemy = this.spawnShip(shipData, pos.x, pos.y);
      enemy.setTint(0xdd4444);
      enemy.setAngle(180);
      this.enemies.push(enemy);
      this.enemyAir.register(enemy, AirOpsSystem.wingFor(shipData));
      this.enemyRecon.register(enemy);
      this.aiSystems.push(new AISystem(this.enemyWeapons, profile, WORLD_BOUNDS));
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
    };
  }

  // -------------------------------------------------------------------------
  // Submarines and sonar
  // -------------------------------------------------------------------------

  /** Advances every boat's dive state: the player's wish for the flagship, AI decisions for the rest. */
  private updateSubmarines(dtSec: number): void {
    const playerFoes = this.enemies.map((s) => shipView(s, this.seenByPlayer.has(s)));
    const enemyFoes = this.friendlies().map((s) => shipView(s, this.seenByEnemy.has(s)));
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
      .filter((s) => s.isAlive && !s.submerged)
      .map((s) => ({ x: s.x, y: s.y, sonarRange: sonarRange(s.stats.shipClass) }));
  }

  /** Everything one side sees with: ship vision circles, recon cones and its aircraft. */
  private visionSources(ships: BaseShip[], recon: ReconSystem, air: AirOpsSystem): VisionSource[] {
    const sources: VisionSource[] = [];
    for (const s of ships) {
      if (s.isAlive) sources.push({ kind: 'circle', x: s.x, y: s.y, radius: shipVision(s.stats.shipClass, s.submerged) });
    }
    sources.push(...recon.cones());
    for (const sq of air.squadrons) {
      if (sq.alive) sources.push({ kind: 'circle', x: sq.x, y: sq.y, radius: AIRCRAFT_VISION });
    }
    return sources;
  }

  /**
   * Who can see whom (fog of war): a surfaced ship is seen inside the other side's vision, a
   * submerged boat only on its sonar. Hidden enemies are not drawn and can't be targeted.
   */
  private updateDetection(): void {
    const playerHunters = this.hunters(this.friendlies());
    const enemyHunters = this.hunters(this.enemies);
    const playerSight = this.visionSources(this.friendlies(), this.playerRecon, this.playerAir);
    const enemySight = this.visionSources(this.enemies, this.enemyRecon, this.enemyAir);
    this.seenByPlayer.clear();
    this.seenByEnemy.clear();

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const seen = enemy.submerged ? isDetected(enemy, playerHunters) : isVisible(enemy.x, enemy.y, playerSight);
      if (seen) this.seenByPlayer.add(enemy);
      enemy.setVisible(seen).setAlpha(enemy.submerged ? SUBMERGED_ALPHA : 1);
    }
    for (const ship of this.friendlies()) {
      if (!ship.isAlive) continue;
      const seen = ship.submerged ? isDetected(ship, enemyHunters) : isVisible(ship.x, ship.y, enemySight);
      if (seen) this.seenByEnemy.add(ship);
      ship.setAlpha(ship.submerged ? SUBMERGED_ALPHA : 1);
    }
    if (this.lockedTarget && !this.seenByPlayer.has(this.lockedTarget)) this.lockedTarget = null;
    this.fog.update(playerSight);
  }

  /** Expanding sonar rings around player hunters while an enemy boat is submerged. */
  private drawSonar(time: number): void {
    const g = this.sonarRings;
    g.clear();
    if (!this.enemies.some((e) => e.isAlive && e.submerged)) return;
    const phase = (time % SONAR_PING_MS) / SONAR_PING_MS;
    for (const ship of this.friendlies()) {
      const range = sonarRange(ship.stats.shipClass);
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
        if (carrier === this.flagship) {
          const locked = foes.find((f) => f.ship === this.currentTarget());
          if (locked) return locked;
        }
        return pick(this.playerNation)(carrier, foes);
      },
    );
    this.enemyAir.update(
      time,
      delta,
      { foes: playerView, foeSquadrons: this.playerAir.squadrons, foeGuns: aaGuns(this.friendlies()) },
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
    this.strikeBtn.setEnabled(r[AircraftType.DiveBomber] + r[AircraftType.TorpedoBomber] > 0);
  }

  /** A depth charge went off: area damage to every ship of the target side in the blast. */
  private onDepthCharge(x: number, y: number, weapon: IWeaponData, targets: BaseShip[]): void {
    this.splash.play(x, y);
    for (const ship of targets) {
      if (!ship.isAlive) continue;
      const f = depthChargeFalloff(Phaser.Math.Distance.Between(x, y, ship.x, ship.y), DEPTH_CHARGE_RADIUS);
      if (f <= 0) continue;
      const dmg = CombatSystem.calculateDamage(weapon, ship.stats.shipClass, ship.stats.armor) * f;
      CombatSystem.applyDamage(ship, dmg);
      this.explosion.play(ship.x, ship.y);
    }
  }

  // -------------------------------------------------------------------------
  // Player input
  // -------------------------------------------------------------------------

  private setupInput(): void {
    this.joystick = this.isTouch ? new VirtualJoystick(this, JOYSTICK_POS.x, JOYSTICK_POS.y, JOYSTICK_RADIUS) : null;

    const kb = this.input.keyboard!;
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    kb.on('keydown-Q', () => this.toggleDive());
    kb.on('keydown-E', () => this.fireTorpedoes());
    kb.on('keydown-F', () => this.launchPlayerStrike());
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
      this.playerWeapons.fireWeapon(this.flagship, this.playerWeapon, this.aimAngle, this.time.now);
    });
  }

  /** E / torpedo button: launch every torpedo mount toward the aim point (or the target on touch). */
  private fireTorpedoes(): void {
    const torpedoes = this.flagship.loadout.filter((w) => weaponKind(w) === WeaponKind.Torpedo);
    if (torpedoes.length === 0 || this.gameOver) return;
    const target = this.isTouch || this.autoMode ? this.currentTarget() : null;
    const angle = target ? angleBetween(this.flagship.x, this.flagship.y, target.x, target.y) : this.aimAngle;
    for (const w of torpedoes) this.playerWeapons.fireWeapon(this.flagship, w, angle, this.time.now);
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
    if (view) fireAt(this.playerWeapons, this.flagship, view, TACTICS[this.playerNation].torpedoEagerness, time);
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
    this.autoBtn.setLabel(on ? 'AUTO  ON' : 'AUTO  OFF').setVariant(on ? 'primary' : 'secondary');
  }

  private setupOverlaps(): void {
    const enemyObjs = this.enemies as unknown as Phaser.GameObjects.GameObject[];
    const friendlyObjs = this.friendlies() as unknown as Phaser.GameObjects.GameObject[];
    const hit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (p, s) => {
      this.onProjectileHit(p as unknown as BaseProjectile, s as unknown as BaseShip);
    };
    // The projectile arrays grow in place as new projectiles are created, so the colliders keep up.
    this.physics.add.overlap(this.playerWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], enemyObjs, hit);
    this.physics.add.overlap(this.enemyWeapons.projectiles as unknown as Phaser.GameObjects.GameObject[], friendlyObjs, hit);
  }

  private onProjectileHit(projectile: BaseProjectile, target: BaseShip): void {
    // Shells and torpedoes pass over a submerged boat.
    if (!projectile.active || !target.isAlive || target.submerged) return;
    const weapon = projectile.weapon ?? FALLBACK_WEAPON;
    const dmg = CombatSystem.calculateDamage(weapon, target.stats.shipClass, target.stats.armor);
    CombatSystem.applyDamage(target, dmg);
    projectile.deactivate();
    this.explosion.play(projectile.x, projectile.y);
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
      this.flagship.steer({ headingDeg: targetDeg, throttle: stick.magnitude }, dtSec, SHIP_ROTATE_SPEED);
      return;
    }

    const keys = this.wasd;
    if (keys.W.isDown || keys.A.isDown || keys.S.isDown || keys.D.isDown) {
      this.waypoint = null;
      if (keys.A.isDown) {
        this.flagship.angle -= SHIP_ROTATE_SPEED * dtSec;
      } else if (keys.D.isDown) {
        this.flagship.angle += SHIP_ROTATE_SPEED * dtSec;
      }
      const rad = Phaser.Math.DegToRad(this.flagship.angle - 90);
      if (keys.W.isDown) {
        body.setVelocity(Math.cos(rad) * spd, Math.sin(rad) * spd);
      } else if (keys.S.isDown) {
        body.setVelocity(-Math.cos(rad) * spd * 0.5, -Math.sin(rad) * spd * 0.5);
      }
      return;
    }

    if (this.autoMode && target) {
      // A carrier fights with its aircraft and keeps well clear of the enemy's guns.
      const range = this.playerAir.hasCarrier(this.flagship) ? AUTO_CARRIER_STANDOFF : this.playerWeapon.range * AUTO_RANGE_FRACTION;
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

  private buildOverlayUi(): void {
    const b = TOP_BUTTON;
    new UIButton(this, 20 + b.w / 2, b.y, '‹  撤退', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: 'secondary',
      width: b.w,
      height: b.h,
      fontSize: 15,
    }).setDepth(DEPTH_HUD + 2).setScrollFactor(0);

    this.autoBtn = new UIButton(this, CANVAS_W - 20 - b.w / 2, b.y, 'AUTO  OFF', () => this.setAutoMode(!this.autoMode), {
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
    const ready = this.playerWeapons.reloadProgress(this.flagship, this.playerWeapon, this.time.now) >= 1;

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

  private checkWinLoss(): void {
    if (!this.flagship.isAlive) {
      this.triggerGameOver(false);
      return;
    }
    if (this.enemies.length > 0 && this.enemies.every((e) => !e.isAlive)) {
      this.triggerGameOver(true);
    }
  }

  private triggerGameOver(victory: boolean): void {
    if (this.gameOver) return;
    this.gameOver = true;
    const fleet = this.friendlies();
    const result: IBattleResultData = {
      victory,
      score: 0,
      turnsElapsed: 0,
      enemiesSunk: this.enemies.filter((e) => !e.isAlive).length,
      enemiesTotal: this.enemies.length,
      survivors: fleet.filter((s) => s.isAlive).length,
      fleetSize: fleet.length,
      durationSec: (this.time.now - this.battleStartedAt) / 1000,
    };
    this.time.delayedCall(1200, () => this.scene.start(SceneKeys.RESULTS, result));
  }
}
