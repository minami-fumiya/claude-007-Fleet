import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_SHIPS } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem } from '@/systems/AISystem';
import { EscortAISystem } from '@/systems/EscortAISystem';
import { FleetSystem } from '@/systems/FleetSystem';
import { FormationSystem } from '@/systems/FormationSystem';
import { Explosion } from '@/entities/effects/Explosion';
import { HUD } from '@/ui/HUD';
import { DataLoader } from '@/utils/DataLoader';
import { angleBetween } from '@/utils/MathUtils';
import { IShipData, IShipStats } from '@/types/Ship';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { IFleet } from '@/types/Fleet';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData, IBattleResultData } from '@/types/Scene';
import { Shell } from '@/entities/weapons/Shell';

type BattleInitData = IBattleInitData & { formation?: Formation };

const SHIP_ROTATE_SPEED = 120;
const FLAGSHIP_SPAWN = { x: CANVAS_W / 2, y: CANVAS_H - 150 };
const ENEMY_SPAWN_POSITIONS = [
  { x: 160, y: 120 },
  { x: CANVAS_W - 160, y: 120 },
  { x: CANVAS_W / 2, y: 100 },
];

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

    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x0a2a4a);

    const ijnShips = DataLoader.getShips(this, 'ijn');
    const { playerFleet, enemyFleet, formation } = this.resolveFleets(ijnShips);

    this.playerWeaponSystem = new WeaponSystem(this);
    this.enemyWeaponSystem = new WeaponSystem(this);

    this.spawnPlayerFleet(playerFleet, formation);
    this.spawnEnemyFleet(enemyFleet);

    this.explosion = new Explosion(this);
    this.hud = new HUD(this, this.flagship, this.enemies, this.escorts);

    this.setupInput();
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

    this.handleMovement(delta);
    this.updateAim();

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

    this.hud.update(this.flagship, this.enemies, this.escorts);
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
      const pos = ENEMY_SPAWN_POSITIONS[i] ?? { x: CANVAS_W / 2, y: 80 };
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
    const kb = this.input.keyboard!;
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  private setupClickFire(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.playerWeaponSystem.fireWeapon(this.flagship, this.playerWeapon, this.aimAngle, this.time.now);
      }
    });
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

  private handleMovement(delta: number): void {
    const body = this.flagship.body as Phaser.Physics.Arcade.Body;
    const dtSec = delta / 1000;
    const spd = this.flagship.stats.speed;

    if (this.wasd.A.isDown) {
      this.flagship.angle -= SHIP_ROTATE_SPEED * dtSec;
    } else if (this.wasd.D.isDown) {
      this.flagship.angle += SHIP_ROTATE_SPEED * dtSec;
    }

    const rad = Phaser.Math.DegToRad(this.flagship.angle - 90);
    if (this.wasd.W.isDown) {
      body.setVelocity(Math.cos(rad) * spd, Math.sin(rad) * spd);
    } else if (this.wasd.S.isDown) {
      body.setVelocity(-Math.cos(rad) * spd * 0.5, -Math.sin(rad) * spd * 0.5);
    } else {
      body.setVelocity(body.velocity.x * (1 - 5 * dtSec), body.velocity.y * (1 - 5 * dtSec));
    }
  }

  private updateAim(): void {
    const pointer = this.input.activePointer;
    this.aimAngle = angleBetween(this.flagship.x, this.flagship.y, pointer.x, pointer.y);
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
    this.time.delayedCall(1200, () => {
      this.scene.start(SceneKeys.RESULTS, { victory, score: 0, turnsElapsed: 0 } as IBattleResultData);
    });
  }
}
