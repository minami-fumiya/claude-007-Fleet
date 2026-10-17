import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { HealthBar } from './components/HealthBar';
import { CANVAS_W, DEPTH_HUD } from '@/config/GameConstants';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawMeter, drawPanel } from '@/ui/components/UIKit';

const PLAYER_BAR_W = 90;
const PLAYER_BAR_OFFSET_Y = 22;   // bar starts below ship centre
const PLAYER_NAME_OFFSET_Y = 10;  // name label bottom above bar

const ENEMY_BAR_W = 60;
const ENEMY_BAR_OFFSET_Y = -28;
const ENEMY_NAME_OFFSET_Y = -40;

const ESCORT_BAR_W = 50;
const ESCORT_BAR_OFFSET_Y = -22;
const ESCORT_NAME_OFFSET_Y = -34;

const LABEL_STYLE_PLAYER = textStyle(12, Css.success, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });
const LABEL_STYLE_ENEMY = textStyle(10, Css.danger, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });
const LABEL_STYLE_ESCORT = textStyle(10, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });

// Top status strip
const BAR = { w: 660, h: 60, y: 12 };
const BAR_X = (CANVAS_W - BAR.w) / 2;
const SEG_HP = { x: 20, meterW: 200 };
const SEG_SUNK_X = 280;
const SEG_GUN = { x: 400, meterW: 96 };
const SEG_TIME_X = 580;

export interface IHudStatus {
  /** Main gun reload progress, 0..1 */
  reload: number;
  elapsedSec: number;
}

export class HUD {
  private playerBar: HealthBar;
  private playerNameLabel: Phaser.GameObjects.Text;
  private enemyBars = new Map<BaseShip, HealthBar>();
  private enemyLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  private escortBars = new Map<BaseShip, HealthBar>();
  private escortLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  private killText: Phaser.GameObjects.Text;
  private readonly totalEnemies: number;

  private barBg: Phaser.GameObjects.Graphics;
  private meters: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private gunText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private staticTexts: Phaser.GameObjects.Text[] = [];
  private status: IHudStatus = { reload: 1, elapsedSec: 0 };

  constructor(
    scene: Phaser.Scene,
    player: BaseShip,
    enemies: BaseShip[],
    escorts: BaseShip[] = [],
  ) {
    this.totalEnemies = enemies.length;

    // Status strip — flagship HP, kills, main gun reload, elapsed time
    this.barBg = drawPanel(scene.add.graphics(), BAR_X, BAR.y, BAR.w, BAR.h, { radius: 18, fillAlpha: 0.78, glow: 0.6 })
      .setDepth(DEPTH_HUD);
    this.meters = scene.add.graphics().setDepth(DEPTH_HUD + 1);

    const label = (x: number, text: string): void => {
      this.staticTexts.push(scene.add.text(BAR_X + x, BAR.y + 10, text, eyebrowStyle(9, Css.muted)).setDepth(DEPTH_HUD + 1));
    };
    label(SEG_HP.x, `FLAGSHIP · ${player.stats.name}`);
    label(SEG_SUNK_X, '撃沈 SUNK');
    label(SEG_GUN.x, '主砲 MAIN GUN');
    label(SEG_TIME_X, 'TIME');

    const valueStyle = textStyle(16, Css.text, { fontStyle: 'bold' });
    this.hpText = scene.add.text(BAR_X + SEG_HP.x + SEG_HP.meterW + 8, BAR.y + 36, '', textStyle(12, Css.muted))
      .setOrigin(0, 0.5).setDepth(DEPTH_HUD + 1);
    this.killText = scene.add.text(BAR_X + SEG_SUNK_X, BAR.y + 38, '', textStyle(18, Css.gold, { fontStyle: 'bold' }))
      .setOrigin(0, 0.5).setDepth(DEPTH_HUD + 1);
    this.gunText = scene.add.text(BAR_X + SEG_GUN.x + SEG_GUN.meterW + 8, BAR.y + 36, '', textStyle(11, Css.cyan, { fontStyle: 'bold' }))
      .setOrigin(0, 0.5).setDepth(DEPTH_HUD + 1);
    this.timeText = scene.add.text(BAR_X + SEG_TIME_X, BAR.y + 38, '0:00', valueStyle)
      .setOrigin(0, 0.5).setDepth(DEPTH_HUD + 1);

    // Segment dividers
    this.barBg.lineStyle(1, Colors.rim, 0.15);
    for (const dx of [SEG_SUNK_X - 16, SEG_GUN.x - 16, SEG_TIME_X - 16]) {
      this.barBg.lineBetween(BAR_X + dx, BAR.y + 12, BAR_X + dx, BAR.y + BAR.h - 12);
    }

    // Player ship name (follows ship, above HP bar)
    this.playerNameLabel = scene.add
      .text(0, 0, player.stats.name, LABEL_STYLE_PLAYER)
      .setDepth(DEPTH_HUD)
      .setOrigin(0.5, 1);

    this.playerBar = new HealthBar(scene, PLAYER_BAR_W, 8);

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

  update(player: BaseShip, enemies: BaseShip[], _escorts: BaseShip[] = [], status?: IHudStatus): void {
    if (status) this.status = status;
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
    this.killText.setText(`${killed} / ${this.totalEnemies}`);

    const hpFrac = player.stats.maxHp > 0 ? Math.max(0, player.stats.currentHp / player.stats.maxHp) : 0;
    const hpColor = hpFrac > 0.5 ? Colors.success : hpFrac > 0.25 ? Colors.gold : Colors.danger;
    const reload = this.status.reload;
    this.meters.clear();
    drawMeter(this.meters, BAR_X + SEG_HP.x, BAR.y + 32, SEG_HP.meterW, 8, hpFrac, hpColor);
    drawMeter(this.meters, BAR_X + SEG_GUN.x, BAR.y + 32, SEG_GUN.meterW, 8, reload, reload >= 1 ? Colors.cyan : Colors.blue);
    this.hpText.setText(`${Math.max(0, Math.ceil(player.stats.currentHp))}`);
    this.gunText.setText(reload >= 1 ? 'READY' : 'RELOAD').setColor(reload >= 1 ? Css.cyan : Css.muted);

    const sec = Math.floor(this.status.elapsedSec);
    this.timeText.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
  }

  destroy(): void {
    this.playerBar.destroy();
    this.playerNameLabel.destroy();
    this.killText.destroy();
    this.barBg.destroy();
    this.meters.destroy();
    this.hpText.destroy();
    this.gunText.destroy();
    this.timeText.destroy();
    for (const t of this.staticTexts) t.destroy();
    for (const bar of this.enemyBars.values()) bar.destroy();
    for (const label of this.enemyLabels.values()) label.destroy();
    for (const bar of this.escortBars.values()) bar.destroy();
    for (const label of this.escortLabels.values()) label.destroy();
  }
}
