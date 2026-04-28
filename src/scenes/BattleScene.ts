import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, DEPTH_SHIPS, DEPTH_HUD } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { Shell } from '@/entities/weapons/Shell';
import { ObjectPool } from '@/utils/ObjectPool';
import { DataLoader } from '@/utils/DataLoader';
import { IShipData, IShipStats } from '@/types/Ship';
import { angleBetween } from '@/utils/MathUtils';

const SHIP_ROTATE_SPEED = 120; // deg/s
const RELOAD_MS = 1500;
const SHELL_POOL_SIZE = 20;

export class BattleScene extends Phaser.Scene {
  private player!: BaseShip;
  private shellPool!: ObjectPool<Shell>;
  private shells: Shell[] = [];

  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private lastFiredAt = 0;
  private aimAngle = 0;
  private hpText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.BATTLE });
  }

  create(): void {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x0a2a4a);

    const shipDataList = DataLoader.getShips(this, 'ijn');
    const yamato = shipDataList.find((s) => s.id === 'yamato');
    if (!yamato) throw new Error('BattleScene: yamato data not found in ijn.json');

    this.player = this.spawnPlayer(yamato);
    this.setupInput();
    this.setupShellPool();
    this.setupHud();
    this.setupClickFire();
  }

  update(time: number, delta: number): void {
    this.handleMovement(delta);
    this.updateAim();
    this.shells.forEach((s) => s.update(time, delta));
    this.hpText.setText(`HP: ${this.player.stats.currentHp} / ${this.player.stats.maxHp}`);
  }

  private spawnPlayer(data: IShipData): BaseShip {
    const stats: IShipStats = {
      maxHp: data.hp,
      currentHp: data.hp,
      armor: data.armor,
      speed: data.speed,
      firePower: 120,
    };
    const ship = new BaseShip(this, CANVAS_W / 2, CANVAS_H / 2, data.spriteKey, stats);
    ship.setDepth(DEPTH_SHIPS);
    ship.setOrigin(0.5, 0.5);
    (ship.body as Phaser.Physics.Arcade.Body).setDrag(200, 200);
    return ship;
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

  private setupShellPool(): void {
    this.shellPool = new ObjectPool<Shell>(
      () => {
        const s = new Shell(this);
        this.shells.push(s);
        return s;
      },
      (s) => s.setActive(true).setVisible(true),
      (s) => s.deactivate(),
      SHELL_POOL_SIZE,
    );
  }

  private setupHud(): void {
    this.hpText = this.add
      .text(16, 16, '', { fontSize: '16px', color: '#00ff88', stroke: '#000000', strokeThickness: 3 })
      .setDepth(DEPTH_HUD);
  }

  private setupClickFire(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.fireShell();
    });
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
      body.setVelocity(
        body.velocity.x * (1 - 5 * dtSec),
        body.velocity.y * (1 - 5 * dtSec),
      );
    }
  }

  private updateAim(): void {
    const pointer = this.input.activePointer;
    this.aimAngle = angleBetween(this.player.x, this.player.y, pointer.x, pointer.y);
  }

  private fireShell(): void {
    const now = this.time.now;
    if (now - this.lastFiredAt < RELOAD_MS) return;
    this.lastFiredAt = now;

    const shell = this.shellPool.get();
    shell.fire(this.player.x, this.player.y, this.aimAngle);
  }
}
