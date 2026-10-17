import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_HUD, DEPTH_SHIPS, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem } from '@/systems/AISystem';
import { EscortAISystem } from '@/systems/EscortAISystem';
import { FleetSystem } from '@/systems/FleetSystem';
import { FormationSystem } from '@/systems/FormationSystem';
import { Explosion } from '@/entities/effects/Explosion';
import { HUD } from '@/ui/HUD';
import { VirtualJoystick } from '@/ui/components/VirtualJoystick';
import { addChip, addOceanWorld, UIButton } from '@/ui/components/UIKit';
import { engageSteer, hitTestTarget, inRange, ISteer, pickTarget, waypointSteer } from '@/systems/AutoPilot';
import { Colors, Css } from '@/ui/theme';
import { DataLoader } from '@/utils/DataLoader';
import { angleBetween, edgePoint, rotateTowardsDegrees } from '@/utils/MathUtils';
import { IShipData, IShipStats } from '@/types/Ship';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { IFleet } from '@/types/Fleet';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData, IBattleResultData } from '@/types/Scene';
import { Shell } from '@/entities/weapons/Shell';

type BattleInitData = IBattleInitData & { formation?: Formation };

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
/** The sea is about twice the screen in each direction; the camera follows the flagship. */
const WORLD = IS_PORTRAIT ? { w: 1440, h: 2240 } : { w: 2400, h: 1440 };
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

const GENERIC_ENEMY_WEAPON: IWeaponData = {
  id: 'generic-enemy',
  name: 'Enemy Gun',
  type: WeaponType.ShellAP,
  firePower: 70,
  range: 450,
  reloadTime: 2000,
  projectileSpeed: 500,
};

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
  private battleData: BattleInitData | null = null;

  private flagship!: BaseShip;
  private escorts: BaseShip[] = [];
  private enemies: BaseShip[] = [];

  private playerWeapon: IWeaponData = FALLBACK_WEAPON;
  private escortWeapons: IWeaponData[] = [];

  private playerWeaponSystem!: WeaponSystem;
  private escortWeaponSystems: WeaponSystem[] = [];
  private enemyWeaponSystem!: WeaponSystem;

  private aiSystems: AISystem[] = [];
  private escortAISystems: EscortAISystem[] = [];

  private explosion!: Explosion;
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
  private lockedTarget: BaseShip | null = null;
  private waypoint: { x: number; y: number } | null = null;

  private reticle!: Phaser.GameObjects.Graphics;
  /** Screen-space arrows pointing at enemies outside the camera view */
  private edgeMarkers!: Phaser.GameObjects.Graphics;
  private battleStartedAt = 0;

  private aimAngle = 0;
  private gameOver = false;

  constructor() {
    super({ key: SceneKeys.BATTLE });
  }

  init(data: BattleInitData): void {
    this.battleData = data ?? null;
  }

  create(): void {
    this.gameOver = false;
    this.escorts = [];
    this.enemies = [];
    this.aiSystems = [];
    this.escortAISystems = [];
    this.escortWeapons = [];
    this.escortWeaponSystems = [];

    addOceanWorld(this, WORLD.w, WORLD.h);
    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.battleStartedAt = this.time.now;
    this.aimTarget = { x: FLAGSHIP_SPAWN.x, y: FLAGSHIP_SPAWN.y - 300 };
    this.isTouch = this.sys.game.device.input.touch;
    this.autoMode = false;
    this.lockedTarget = null;
    this.waypoint = null;

    const ijnShips = DataLoader.getShips(this, 'ijn');
    const { playerFleet, enemyFleet, formation } = this.resolveFleets(ijnShips);

    this.playerWeaponSystem = new WeaponSystem(this);
    this.enemyWeaponSystem = new WeaponSystem(this);

    this.spawnPlayerFleet(playerFleet, formation);
    this.spawnEnemyFleet(enemyFleet);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.w, WORLD.h);
    cam.startFollow(this.flagship, true, CAMERA_LERP, CAMERA_LERP);

    this.explosion = new Explosion(this);
    this.hud = new HUD(this, this.flagship, this.enemies, this.escorts);

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

    if (!this.isTouch) {
      // Re-project the cursor every frame: the camera moves even when the mouse doesn't.
      const p = this.input.activePointer;
      this.aimTarget = this.cameras.main.getWorldPoint(p.x, p.y);
    }
    const target = this.currentTarget();
    this.handleMovement(delta, target);
    this.updateAim();
    if (target && (this.isTouch || this.autoMode)) this.autoFire(target, time);

    this.playerWeaponSystem.update(time, delta);
    this.enemyWeaponSystem.update(time, delta);
    for (const ws of this.escortWeaponSystems) ws.update(time, delta);

    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].isAlive) {
        this.aiSystems[i].update(this.enemies[i], this.flagship, time, delta);
      }
    }

    for (let i = 0; i < this.escorts.length; i++) {
      if (this.escorts[i].isAlive) {
        this.escortAISystems[i].update(this.escorts[i], this.flagship, this.enemies, time, delta);
      }
    }

    this.hud.update(this.flagship, this.enemies, this.escorts, {
      reload: this.playerWeaponSystem.reloadProgress(this.flagship, this.playerWeapon, time),
      elapsedSec: (time - this.battleStartedAt) / 1000,
    });
    this.drawReticle();
    this.drawEdgeMarkers();
    this.checkWinLoss();
  }

  private resolveFleets(
    ijnShips: IShipData[],
  ): { playerFleet: IFleet; enemyFleet: IFleet; formation: Formation } {
    if (this.battleData?.playerFleet && FleetSystem.isValid(this.battleData.playerFleet)) {
      return {
        playerFleet: this.battleData.playerFleet,
        enemyFleet: this.battleData.enemyFleet,
        formation: this.battleData.formation ?? Formation.LineAhead,
      };
    }
    const yamato = ijnShips.find((s) => s.id === 'yamato') ?? ijnShips[0];
    const musashi = ijnShips.find((s) => s.id === 'musashi') ?? ijnShips[0];
    const takao = ijnShips.find((s) => s.id === 'takao') ?? ijnShips[0];
    return {
      playerFleet: FleetSystem.createFleet('default', '大和隊', Nation.IJN, [yamato], 0),
      enemyFleet: FleetSystem.createFleet('enemy', 'Enemy', Nation.IJN, [musashi, takao, takao], 0),
      formation: Formation.LineAhead,
    };
  }

  private spawnPlayerFleet(fleet: IFleet, formation: Formation): void {
    const flagshipData = FleetSystem.getFlagship(fleet);
    if (!flagshipData) return;

    const weapon = DataLoader.getWeaponById(this, flagshipData.weapons[0]) ?? FALLBACK_WEAPON;
    this.playerWeapon = weapon;
    this.flagship = new BaseShip(
      this,
      FLAGSHIP_SPAWN.x,
      FLAGSHIP_SPAWN.y,
      flagshipData.spriteKey,
      this.shipDataToStats(flagshipData, weapon),
    );
    this.flagship.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
    (this.flagship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);

    const escortDataList = FleetSystem.getEscorts(fleet);
    const offsets = FormationSystem.getOffsets(formation);

    escortDataList.forEach((escortData, i) => {
      const offset = offsets[Math.min(i, offsets.length - 1)];
      const spawnPos = FormationSystem.getWorldPositionFromValues(FLAGSHIP_SPAWN.x, FLAGSHIP_SPAWN.y, 0, offset);
      const escortWeapon = DataLoader.getWeaponById(this, escortData.weapons[0]) ?? FALLBACK_WEAPON;

      const escort = new BaseShip(
        this,
        spawnPos.x,
        spawnPos.y,
        escortData.spriteKey,
        this.shipDataToStats(escortData, escortWeapon),
      );
      escort.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
      (escort.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);

      const ws = new WeaponSystem(this);
      this.escorts.push(escort);
      this.escortWeapons.push(escortWeapon);
      this.escortWeaponSystems.push(ws);
      this.escortAISystems.push(new EscortAISystem(ws, escortWeapon, offset));
    });
  }

  private spawnEnemyFleet(fleet: IFleet): void {
    const enemyShips = FleetSystem.getShips(fleet);

    enemyShips.forEach((shipData, i) => {
      const pos = ENEMY_SPAWN_POSITIONS[i] ?? { x: WORLD.w / 2, y: ENEMY_TOP };
      const weapon = DataLoader.getWeaponById(this, shipData.weapons[0]) ?? GENERIC_ENEMY_WEAPON;
      const stats = this.shipDataToStats(shipData, weapon);

      const enemy = new BaseShip(this, pos.x, pos.y, shipData.spriteKey, stats);
      enemy.setDepth(DEPTH_SHIPS).setOrigin(0.5, 0.5);
      enemy.setTint(0xdd4444);
      enemy.setAngle(180);
      (enemy.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);

      this.enemies.push(enemy);
      this.aiSystems.push(new AISystem(this.enemyWeaponSystem, weapon));
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

  private setupInput(): void {
    this.joystick = this.isTouch ? new VirtualJoystick(this, JOYSTICK_POS.x, JOYSTICK_POS.y, JOYSTICK_RADIUS) : null;

    const kb = this.input.keyboard!;
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
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
      this.playerWeaponSystem.fireWeapon(this.flagship, this.playerWeapon, this.aimAngle, this.time.now);
    });
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

  private targetCandidates(): Array<{ x: number; y: number; alive: boolean; ship: BaseShip }> {
    return this.enemies.map((ship) => ({ x: ship.x, y: ship.y, alive: ship.isAlive, ship }));
  }

  /** The locked enemy while it lives, otherwise the nearest one. */
  private currentTarget(): BaseShip | null {
    if (this.lockedTarget && !this.lockedTarget.isAlive) this.lockedTarget = null;
    const candidates = this.targetCandidates();
    const locked = candidates.find((c) => c.ship === this.lockedTarget) ?? null;
    return pickTarget(this.flagship, candidates, locked)?.ship ?? null;
  }

  private autoFire(target: BaseShip, time: number): void {
    if (!inRange(this.flagship, target, this.playerWeapon.range)) return;
    const angle = angleBetween(this.flagship.x, this.flagship.y, target.x, target.y);
    this.playerWeaponSystem.fireWeapon(this.flagship, this.playerWeapon, angle, time);
  }

  private setAutoMode(on: boolean): void {
    this.autoMode = on;
    if (on) this.waypoint = null;
    this.autoBtn.setLabel(on ? 'AUTO  ON' : 'AUTO  OFF').setVariant(on ? 'primary' : 'secondary');
  }

  private setupOverlaps(): void {
    const enemyObjs = this.enemies as unknown as Phaser.GameObjects.GameObject[];
    const friendlyObjs = [this.flagship, ...this.escorts] as unknown as Phaser.GameObjects.GameObject[];

    this.physics.add.overlap(
      this.playerWeaponSystem.shells as unknown as Phaser.GameObjects.GameObject[],
      enemyObjs,
      (shellObj, enemyObj) => {
        this.onShellHit(shellObj as Shell, enemyObj as BaseShip, this.playerWeapon);
      },
    );

    this.escortWeaponSystems.forEach((ws, i) => {
      const weapon = this.escortWeapons[i];
      this.physics.add.overlap(
        ws.shells as unknown as Phaser.GameObjects.GameObject[],
        enemyObjs,
        (shellObj, enemyObj) => {
          this.onShellHit(shellObj as Shell, enemyObj as BaseShip, weapon);
        },
      );
    });

    this.physics.add.overlap(
      this.enemyWeaponSystem.shells as unknown as Phaser.GameObjects.GameObject[],
      friendlyObjs,
      (shellObj, friendlyObj) => {
        this.onShellHit(shellObj as Shell, friendlyObj as BaseShip, GENERIC_ENEMY_WEAPON);
      },
    );
  }

  private onShellHit(shell: Shell, target: BaseShip, weapon: IWeaponData): void {
    if (!shell.active || !target.isAlive) return;
    const dmg = CombatSystem.calculateDamage(weapon, target.stats.shipClass, target.stats.armor);
    CombatSystem.applyDamage(target, dmg);
    shell.deactivate();
    this.explosion.play(shell.x, shell.y);
  }

  /**
   * Priority: joystick > keyboard > AUTO > tap waypoint > coast. Manual input cancels a waypoint but
   * leaves AUTO on, so a quick dodge with the stick hands control back afterwards.
   */
  private handleMovement(delta: number, target: BaseShip | null): void {
    const body = this.flagship.body as Phaser.Physics.Arcade.Body;
    const dtSec = delta / 1000;
    const spd = this.flagship.stats.speed;

    const stick = this.joystick?.value;
    if (stick && stick.magnitude > 0) {
      // Touch: steer toward the stick direction, throttle by how far it is pushed.
      this.waypoint = null;
      const targetDeg = Phaser.Math.RadToDeg(Math.atan2(stick.y, stick.x)) + 90;
      this.steer({ headingDeg: targetDeg, throttle: stick.magnitude }, dtSec);
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
      const range = this.playerWeapon.range * AUTO_RANGE_FRACTION;
      this.steer(engageSteer(this.flagship, target, range, { width: WORLD.w, height: WORLD.h }, AUTO_EDGE_MARGIN), dtSec);
      return;
    }

    if (this.waypoint) {
      const s = waypointSteer(this.flagship, this.waypoint, WAYPOINT_ARRIVE_RADIUS);
      if (s) {
        this.steer(s, dtSec);
        return;
      }
      this.waypoint = null;
    }

    body.setVelocity(body.velocity.x * (1 - 5 * dtSec), body.velocity.y * (1 - 5 * dtSec));
  }

  /** Turns toward the requested heading at the ship's turn rate and moves along its current bow. */
  private steer(s: ISteer, dtSec: number): void {
    const body = this.flagship.body as Phaser.Physics.Arcade.Body;
    const spd = this.flagship.stats.speed * s.throttle;
    this.flagship.angle = rotateTowardsDegrees(this.flagship.angle, s.headingDeg, SHIP_ROTATE_SPEED * dtSec);
    const heading = Phaser.Math.DegToRad(this.flagship.angle - 90);
    body.setVelocity(Math.cos(heading) * spd, Math.sin(heading) * spd);
  }

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

    if (this.isTouch) {
      const hint = addChip(this, 0, CANVAS_H - 36, '敵をタップ: 目標  /  海をタップ: 移動', Colors.cyan, Css.cyan);
      hint.setX(CANVAS_W - 20 - hint.getBounds().width).setDepth(DEPTH_HUD).setScrollFactor(0);
    }

    this.reticle = this.add.graphics().setDepth(DEPTH_HUD - 1);
    this.edgeMarkers = this.add.graphics().setDepth(DEPTH_HUD - 1).setScrollFactor(0);
  }

  /** Red arrows on the screen border pointing at enemies the camera can't see. */
  private drawEdgeMarkers(): void {
    const g = this.edgeMarkers;
    g.clear();
    const view = this.cameras.main.worldView;
    const size = IS_PORTRAIT ? 18 : 13;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
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
    const ready = this.playerWeaponSystem.reloadProgress(this.flagship, this.playerWeapon, this.time.now) >= 1;

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
    const fleet = [this.flagship, ...this.escorts];
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
