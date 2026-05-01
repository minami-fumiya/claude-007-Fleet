import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { HealthBar } from './components/HealthBar';
import { DEPTH_HUD } from '@/config/GameConstants';

const PLAYER_BAR_W = 160;
const PLAYER_BAR_OFFSET_Y = 22;   // bar starts below ship centre
const PLAYER_NAME_OFFSET_Y = 10;  // name label bottom above bar

const ENEMY_BAR_W = 60;
const ENEMY_BAR_OFFSET_Y = -28;
const ENEMY_NAME_OFFSET_Y = -40;

const ESCORT_BAR_W = 50;
const ESCORT_BAR_OFFSET_Y = -22;
const ESCORT_NAME_OFFSET_Y = -34;

const LABEL_STYLE_PLAYER: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '12px', color: '#aaffaa', stroke: '#000000', strokeThickness: 2,
};
const LABEL_STYLE_ENEMY: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '10px', color: '#ffaaaa', stroke: '#000000', strokeThickness: 2,
};
const LABEL_STYLE_ESCORT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '10px', color: '#aaaaff', stroke: '#000000', strokeThickness: 2,
};

export class HUD {
  private playerBar: HealthBar;
  private playerNameLabel: Phaser.GameObjects.Text;
  private enemyBars = new Map<BaseShip, HealthBar>();
  private enemyLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  private escortBars = new Map<BaseShip, HealthBar>();
  private escortLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  private killText: Phaser.GameObjects.Text;
  private readonly totalEnemies: number;

  constructor(
    scene: Phaser.Scene,
    player: BaseShip,
    enemies: BaseShip[],
    escorts: BaseShip[] = [],
  ) {
    this.totalEnemies = enemies.length;

    // Kill count — stays in top-left corner
    this.killText = scene.add
      .text(16, 16, '', { fontSize: '13px', color: '#ffffff' })
      .setDepth(DEPTH_HUD);

    // Player ship name (follows ship, above HP bar)
    this.playerNameLabel = scene.add
      .text(0, 0, player.stats.name, LABEL_STYLE_PLAYER)
      .setDepth(DEPTH_HUD)
      .setOrigin(0.5, 1);

    this.playerBar = new HealthBar(scene, PLAYER_BAR_W, 12);

    for (const enemy of enemies) {
      this.enemyBars.set(enemy, new HealthBar(scene, ENEMY_BAR_W, 7));
      this.enemyLabels.set(
        enemy,
        scene.add
          .text(0, 0, enemy.stats.name, LABEL_STYLE_ENEMY)
          .setDepth(DEPTH_HUD)
          .setOrigin(0.5, 1),
      );
    }

    for (const escort of escorts) {
      this.escortBars.set(escort, new HealthBar(scene, ESCORT_BAR_W, 6));
      this.escortLabels.set(
        escort,
        scene.add
          .text(0, 0, escort.stats.name, LABEL_STYLE_ESCORT)
          .setDepth(DEPTH_HUD)
          .setOrigin(0.5, 1),
      );
    }

    this.update(player, enemies, escorts);
  }

  update(player: BaseShip, enemies: BaseShip[], _escorts: BaseShip[] = []): void {
    // Player HP bar and name follow the flagship
    if (player.active) {
      this.playerNameLabel
        .setPosition(player.x, player.y + PLAYER_NAME_OFFSET_Y)
        .setVisible(true);
      this.playerBar.update(
        player.stats.currentHp,
        player.stats.maxHp,
        player.x,
        player.y + PLAYER_BAR_OFFSET_Y,
      );
    } else {
      this.playerNameLabel.setVisible(false);
      this.playerBar.update(0, 1, -500, -500);
    }

    for (const [ship, bar] of this.enemyBars) {
      const label = this.enemyLabels.get(ship)!;
      if (ship.active) {
        bar.update(ship.stats.currentHp, ship.stats.maxHp, ship.x, ship.y + ENEMY_BAR_OFFSET_Y);
        label.setPosition(ship.x, ship.y + ENEMY_NAME_OFFSET_Y).setVisible(true);
      } else {
        bar.update(0, 1, -500, -500);
        label.setVisible(false);
      }
    }

    for (const [ship, bar] of this.escortBars) {
      const label = this.escortLabels.get(ship)!;
      if (ship.active) {
        bar.update(ship.stats.currentHp, ship.stats.maxHp, ship.x, ship.y + ESCORT_BAR_OFFSET_Y, 0x44aaff);
        label.setPosition(ship.x, ship.y + ESCORT_NAME_OFFSET_Y).setVisible(true);
      } else {
        bar.update(0, 1, -500, -500);
        label.setVisible(false);
      }
    }

    const alive = enemies.filter((e) => e.isAlive).length;
    const killed = this.totalEnemies - alive;
    this.killText.setText(`Sunk: ${killed} / ${this.totalEnemies}`);
  }

  destroy(): void {
    this.playerBar.destroy();
    this.playerNameLabel.destroy();
    this.killText.destroy();
    for (const bar of this.enemyBars.values()) bar.destroy();
    for (const label of this.enemyLabels.values()) label.destroy();
    for (const bar of this.escortBars.values()) bar.destroy();
    for (const label of this.escortLabels.values()) label.destroy();
  }
}
