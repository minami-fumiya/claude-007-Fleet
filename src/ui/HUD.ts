import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { HealthBar } from './components/HealthBar';
import { DEPTH_HUD } from '@/config/GameConstants';

const PLAYER_BAR_X = 100;
const PLAYER_BAR_Y = 16;
const PLAYER_BAR_W = 160;
const ENEMY_BAR_W = 60;
const ENEMY_BAR_OFFSET_Y = -28;

export class HUD {
  private playerBar: HealthBar;
  private playerLabel: Phaser.GameObjects.Text;
  private enemyBars = new Map<BaseShip, HealthBar>();
  private killText: Phaser.GameObjects.Text;
  private readonly totalEnemies: number;

  constructor(scene: Phaser.Scene, player: BaseShip, enemies: BaseShip[]) {
    this.totalEnemies = enemies.length;

    this.playerLabel = scene.add
      .text(16, PLAYER_BAR_Y, 'HP', { fontSize: '14px', color: '#aaffaa' })
      .setDepth(DEPTH_HUD);

    this.playerBar = new HealthBar(scene, PLAYER_BAR_W, 12);

    this.killText = scene.add
      .text(16, PLAYER_BAR_Y + 20, '', { fontSize: '13px', color: '#ffffff' })
      .setDepth(DEPTH_HUD);

    for (const enemy of enemies) {
      this.enemyBars.set(enemy, new HealthBar(scene, ENEMY_BAR_W, 7));
    }

    this.update(player, enemies);
  }

  update(player: BaseShip, enemies: BaseShip[]): void {
    this.playerBar.update(
      player.stats.currentHp,
      player.stats.maxHp,
      PLAYER_BAR_X,
      PLAYER_BAR_Y,
    );

    for (const [ship, bar] of this.enemyBars) {
      if (ship.active) {
        bar.update(ship.stats.currentHp, ship.stats.maxHp, ship.x, ship.y + ENEMY_BAR_OFFSET_Y);
      } else {
        bar.update(0, 1, -500, -500);
      }
    }

    const alive = enemies.filter((e) => e.isAlive).length;
    const killed = this.totalEnemies - alive;
    this.killText.setText(`Sunk: ${killed} / ${this.totalEnemies}`);
  }

  destroy(): void {
    this.playerBar.destroy();
    this.playerLabel.destroy();
    this.killText.destroy();
    for (const bar of this.enemyBars.values()) bar.destroy();
  }
}
