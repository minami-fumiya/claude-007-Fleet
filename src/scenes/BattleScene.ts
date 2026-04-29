import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_SHIPS } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { CombatSystem } from '@/systems/CombatSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { AISystem } from '@/systems/AISystem';
import { Explosion } from '@/entities/effects/Explosion';
import { HUD } from '@/ui/HUD';
import { DataLoader } from '@/utils/DataLoader';
import { angleBetween } from '@/utils/MathUtils';
import { IShipData, IShipStats } from '@/types/Ship';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';
import { IBattleResultData } from '@/types/Scene';
import { Shell } from '@/entities/weapons/Shell';

const SHIP_ROTATE_SPEED = 120;

const YAMATO_WEAPON: IWeaponData = {
  id: 'yamato-gun',
  name: 'Yamato 46cm Gun',
  type: WeaponType.ShellAP,
  firePower: 120,
  range: 600,
  reloadTime: 1500,
  projectileSpeed: 600,
};

const ENEMY_WEAPON: IWeaponData = {
  id: 'enemy-gun',
  name: 'Enemy Main Gun',
  type: WeaponType.ShellAP,
  firePower: 70,
  range: 420,
  reloadTime: 2800,
  projectileSpeed: 500,
};

const ENEMY_SPAWN_POSITIONS = [
  { x: 160, y: 120 },
  { x: CANVAS_W - 160, y: 120 },
  { x: CANVAS_W / 2, y: 100 },
];

export class BattleScene extends Phaser.Scene {
  private player!: BaseShip;
  private enemies: BaseShip[] = [];

  private playerWeaponSystem!: WeaponSystem;
  private enemyWeaponSystem!: WeaponSystem;
  private aiSystems: AISystem[] = [];

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

  create(): void {
    this.gameOver = false;
    this.enemies = [];
    this.aiSystems = [];

    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x0a2a4a);

    const shipDataList = DataLoader.getShips(this, 'ijn');
    const yamato = shipDataList.find((s) => s.id === 'yamato');
    if (!yamato) throw new Error('BattleScene: yamato data not found');

    this.player = this.spawnPlayer(yamato);
    this.spawnEnemies(yamato);

    this.playerWeaponSystem = new WeaponSystem(this);
    this.enemyWeaponSystem = new WeaponSystem(this);

    for (let i = 0; i < this.enemies.length; i++) {
      this.aiSystems.push(new AISystem(this.enemyWeaponSystem, ENEMY_WEAPON));
    }

    this.explosion = new Explosion(this);
    this.hud = new HUD(this, this.player, this.enemies);

    this.setupInput();
    this.setupClickFire();
    this.setupOverlaps();
  }

  update(time: number, delta: number): void {
    if (this.gameOver) return;

    this.handleMovement(delta);
    this.updateAim();
    this.playerWeaponSystem.update(time, delta);
    this.enemyWeaponSystem.update(time, delta);

    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].isAlive) {
        this.aiSystems[i].update(this.enemies[i], this.player, time, delta);
      }
    }

    this.hud.update(this.player, this.enemies);
    this.checkWinLoss();
  }

  private spawnPlayer(data: IShipData): BaseShip {
    const stats: IShipStats = {
      maxHp: data.hp,
      currentHp: data.hp,
      armor: data.armor,
      speed: data.speed,
      firePower: 120,
      shipClass: data.shipClass,
    };
    const ship = new BaseShip(this, CANVAS_W / 2, CANVAS_H / 2, data.spriteKey, stats);
    ship.setDepth(DEPTH_SHIPS);
    ship.setOrigin(0.5, 0.5);
    (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
    return ship;
  }

  private spawnEnemies(template: IShipData): void {
    const enemyStats: IShipStats = {
      maxHp: 350,
      currentHp: 350,
      armor: 20,
      speed: 70,
      firePower: 70,
      shipClass: ShipClass.Battleship,
    };

    for (const pos of ENEMY_SPAWN_POSITIONS) {
      const stats = { ...enemyStats, currentHp: enemyStats.maxHp };
      const ship = new BaseShip(this, pos.x, pos.y, template.spriteKey, stats);
      ship.setDepth(DEPTH_SHIPS);
      ship.setOrigin(0.5, 0.5);
      ship.setTint(0xdd4444);
      ship.setAngle(180);
      (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
      this.enemies.push(ship);
    }
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
        this.playerWeaponSystem.fireWeapon(this.player, YAMATO_WEAPON, this.aimAngle, this.time.now);
      }
    });
  }

  private setupOverlaps(): void {
    this.physics.add.overlap(
      this.playerWeaponSystem.shells as unknown as Phaser.GameObjects.GameObject[],
      this.enemies as unknown as Phaser.GameObjects.GameObject[],
      (shellObj, enemyObj) => {
        const shell = shellObj as Shell;
        const enemy = enemyObj as BaseShip;
        if (!shell.active || !enemy.isAlive) return;
        const dmg = CombatSystem.calculateDamage(YAMATO_WEAPON, enemy.stats.shipClass, enemy.stats.armor);
        CombatSystem.applyDamage(enemy, dmg);
        shell.deactivate();
        this.explosion.play(shell.x, shell.y);
      },
    );

    this.physics.add.overlap(
      this.enemyWeaponSystem.shells as unknown as Phaser.GameObjects.GameObject[],
      [this.player] as unknown as Phaser.GameObjects.GameObject[],
      (shellObj, playerObj) => {
        const shell = shellObj as Shell;
        const p = playerObj as BaseShip;
        if (!shell.active || !p.isAlive) return;
        const dmg = CombatSystem.calculateDamage(ENEMY_WEAPON, p.stats.shipClass, p.stats.armor);
        CombatSystem.applyDamage(p, dmg);
        shell.deactivate();
        this.explosion.play(shell.x, shell.y);
      },
    );
  }

  private handleMovement(delta: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const dtSec = delta / 1000;
    const spd = this.player.stats.speed;

    if (this.wasd.A.isDown) {
      this.player.angle -= SHIP_ROTATE_SPEED * dtSec;
    } else if (this.wasd.D.isDown) {
      this.player.angle += SHIP_ROTATE_SPEED * dtSec;
    }

    const rad = Phaser.Math.DegToRad(this.player.angle - 90);
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
    this.aimAngle = angleBetween(this.player.x, this.player.y, pointer.x, pointer.y);
  }

  private checkWinLoss(): void {
    if (!this.player.isAlive) {
      this.triggerGameOver(false);
      return;
    }
    if (this.enemies.length > 0 && this.enemies.every((e) => !e.isAlive)) {
      this.triggerGameOver(true);
    }
  }

  private triggerGameOver(victory: boolean): void {
    this.gameOver = true;
    this.time.delayedCall(1200, () => {
      this.scene.start(SceneKeys.RESULTS, { victory, score: 0, turnsElapsed: 0 } as IBattleResultData);
    });
  }
}
