import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { HealthBar } from './components/HealthBar';
import { CANVAS_W, DEPTH_HUD, IS_PORTRAIT } from '@/config/GameConstants';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawMeter, drawPanel } from '@/ui/components/UIKit';
import { activeCriticals, activeStatus, CRITICAL_BADGE } from '@/systems/DamageSystem';

// Friendly ships carry their name + HP just below the hull, enemies just above it, so the
// labels never cover the sprite. Gaps are measured from the hull's outer radius.
const PLAYER_BAR_W = 90;
const ENEMY_BAR_W = 60;
const ESCORT_BAR_W = 50;
const LABEL_GAP = 4;
/** The strip draws above world-space ship labels that scroll underneath it. */
const STRIP_DEPTH = DEPTH_HUD + 10;

/** Distance from a ship's centre to the edge of its hull at any heading. */
function hullRadius(ship: BaseShip): number {
  return Math.max(ship.displayWidth, ship.displayHeight) / 2;
}

const LABEL_STYLE_PLAYER = textStyle(12, Css.success, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });
const LABEL_STYLE_ENEMY = textStyle(10, Css.danger, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });
const LABEL_STYLE_ESCORT = textStyle(10, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });
const LABEL_STYLE_ALLY = textStyle(10, Css.success, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 });

// Top status strip. Positions inside the strip are relative to its top-left corner.
interface IPos { x: number; y: number }
interface IMeterPos extends IPos { w: number; h: number }
interface IStripLayout {
  bar: IMeterPos;
  hpLabel: IPos; hpMeter: IMeterPos; hpText: IPos; hpTextOriginX: number;
  sunkLabel: IPos; killText: IPos;
  gunLabel: IPos; gunMeter: IMeterPos; gunText: IPos;
  timeLabel: IPos; timeText: IPos;
  dividers: Array<[number, number, number, number]>;
}

/**
 * Landscape: one row next to the retreat button. Portrait: below the retreat / AUTO buttons, in two
 * rows (flagship HP across the top; sunk, main gun and time underneath) so the enlarged text fits.
 */
const STRIP: IStripLayout = IS_PORTRAIT
  ? {
      bar: { x: 12, y: 88, w: CANVAS_W - 24, h: 132 },
      hpLabel: { x: 20, y: 14 }, hpMeter: { x: 20, y: 46, w: CANVAS_W - 64, h: 12 },
      hpText: { x: CANVAS_W - 44, y: 14 }, hpTextOriginX: 1,
      sunkLabel: { x: 20, y: 70 }, killText: { x: 20, y: 106 },
      gunLabel: { x: 252, y: 70 }, gunMeter: { x: 252, y: 101, w: 116, h: 10 }, gunText: { x: 378, y: 106 },
      timeLabel: { x: 484, y: 70 }, timeText: { x: 484, y: 106 },
      dividers: [[16, 64, CANVAS_W - 40, 64], [232, 72, 232, 122], [464, 72, 464, 122]],
    }
  : {
      bar: { x: (CANVAS_W - 660) / 2, y: 12, w: 660, h: 60 },
      hpLabel: { x: 20, y: 10 }, hpMeter: { x: 20, y: 32, w: 200, h: 8 },
      hpText: { x: 228, y: 36 }, hpTextOriginX: 0,
      sunkLabel: { x: 280, y: 10 }, killText: { x: 280, y: 38 },
      gunLabel: { x: 400, y: 10 }, gunMeter: { x: 400, y: 32, w: 96, h: 8 }, gunText: { x: 504, y: 36 },
      timeLabel: { x: 580, y: 10 }, timeText: { x: 580, y: 38 },
      dividers: [[264, 12, 264, 48], [384, 12, 384, 48], [564, 12, 564, 48]],
    };
const BX = STRIP.bar.x;
const BY = STRIP.bar.y;

export interface IHudStatus {
  /** Main gun reload progress, 0..1 */
  reload: number;
  elapsedSec: number;
  /** Every weapon's readiness and the flagship's damage (#81), one line each under the strip */
  weapons?: string;
  damage?: string;
}

/** Name plus badges for component damage, e.g. "大和 (Yamato) [機舵]". */
function labelFor(ship: BaseShip): string {
  const crits = activeCriticals(ship.criticals, ship.clock());
  // 火災・浸水 (#48) join the component damage badges.
  const status = activeStatus(ship.status, ship.clock()).map((k) => (k === 'fire' ? '火' : '水'));
  const name = ship.aiNote ? `${ship.stats.name} 〈${ship.aiNote}〉` : ship.stats.name;
  const badges = [...crits.map((c) => CRITICAL_BADGE[c]), ...status];
  return badges.length > 0 ? `${name} [${badges.join('')}]` : name;
}

/** Updates a label's text only when it changed (setText re-renders the texture). */
function syncLabel(label: Phaser.GameObjects.Text, ship: BaseShip): void {
  const text = labelFor(ship);
  if (label.text !== text) label.setText(text);
}

export class HUD {
  private playerBar: HealthBar;
  private playerNameLabel: Phaser.GameObjects.Text;
  private enemyBars = new Map<BaseShip, HealthBar>();
  private enemyLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  private escortBars = new Map<BaseShip, HealthBar>();
  /** Every ship of the player's own (flagship, escorts, the support fleets, #394) for the 自艦隊 count */
  private own: BaseShip[] = [];
  private escortLabels = new Map<BaseShip, Phaser.GameObjects.Text>();
  /** Support fleets' ships (true) and allies (false) on the escort bars (#394) */
  private allyShips = new Map<BaseShip, boolean>();
  /** Convoy ships (#186) share the escort bars, drawn in gold so their HP reads apart from the warships'. */
  private convoyShips = new Set<BaseShip>();
  private killText: Phaser.GameObjects.Text;
  private readonly totalEnemies: number;

  private barBg: Phaser.GameObjects.Graphics;
  private meters: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private gunText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  /** Weapons and damage of the flagship (#81), under the strip */
  private detailText: Phaser.GameObjects.Text;
  private staticTexts: Phaser.GameObjects.Text[] = [];
  private status: IHudStatus = { reload: 1, elapsedSec: 0 };

  constructor(
    scene: Phaser.Scene,
    player: BaseShip,
    enemies: BaseShip[],
    escorts: BaseShip[] = [],
    /** Name of the weapon whose reload the strip shows */
    mainWeaponLabel = '主砲',
    convoy: BaseShip[] = [],
  ) {
    this.totalEnemies = enemies.length;

    // Status strip — flagship HP, kills, main gun reload, elapsed time
    const L = STRIP;
    this.barBg = drawPanel(scene.add.graphics(), BX, BY, L.bar.w, L.bar.h, { radius: 18, fillAlpha: 0.78, glow: 0.6 })
      .setDepth(STRIP_DEPTH);
    this.meters = scene.add.graphics().setDepth(STRIP_DEPTH + 1);

    const label = (pos: IPos, text: string): void => {
      this.staticTexts.push(scene.add.text(BX + pos.x, BY + pos.y, text, eyebrowStyle(9, Css.muted)).setDepth(STRIP_DEPTH + 1));
    };
    label(L.hpLabel, `旗艦 · ${player.stats.name}`);
    // 撃沈 and the fleet left afloat side by side (#394: only the enemy's count was shown).
    label(L.sunkLabel, '撃沈 · 自艦隊');
    label(L.gunLabel, mainWeaponLabel);
    label(L.timeLabel, '経過時間');

    const value = (pos: IPos, size: number, color: string, originX = 0): Phaser.GameObjects.Text =>
      scene.add.text(BX + pos.x, BY + pos.y, '', textStyle(size, color, { fontStyle: 'bold' }))
        .setOrigin(originX, IS_PORTRAIT && pos === L.hpText ? 0 : 0.5)
        .setDepth(STRIP_DEPTH + 1);
    this.hpText = value(L.hpText, 12, Css.muted, L.hpTextOriginX);
    this.killText = value(L.killText, IS_PORTRAIT ? 18 : 14, Css.gold);
    this.gunText = value(L.gunText, 11, Css.cyan);
    this.timeText = value(L.timeText, 16, Css.text).setText('0:00');

    // Weapons and damage (#81): portrait right of the weather chip, landscape under the strip.
    this.detailText = scene.add.text(IS_PORTRAIT ? 176 : BX + 8, BY + L.bar.h + (IS_PORTRAIT ? 6 : 6), '', textStyle(11, Css.cyan, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3, lineSpacing: 3 }))
      .setDepth(STRIP_DEPTH + 1);

    // Segment dividers
    this.barBg.lineStyle(1, Colors.rim, 0.15);
    for (const [x1, y1, x2, y2] of L.dividers) this.barBg.lineBetween(BX + x1, BY + y1, BX + x2, BY + y2);

    // The strip stays on screen while the camera follows the flagship; ship labels stay in the world.
    for (const o of [this.barBg, this.meters, this.hpText, this.killText, this.gunText, this.timeText, this.detailText, ...this.staticTexts]) {
      o.setScrollFactor(0);
    }

    // Player ship name (follows ship, above HP bar)
    this.playerNameLabel = scene.add
      .text(0, 0, player.stats.name, LABEL_STYLE_PLAYER)
      .setDepth(DEPTH_HUD)
      .setOrigin(0.5, 0);

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

    this.own = [player, ...escorts];
    for (const ship of convoy) this.convoyShips.add(ship);
    for (const escort of [...escorts, ...convoy]) {
      this.escortBars.set(escort, new HealthBar(scene, ESCORT_BAR_W, 6));
      this.escortLabels.set(
        escort,
        scene.add
          .text(0, 0, escort.stats.name, LABEL_STYLE_ESCORT)
          .setDepth(DEPTH_HUD)
          .setOrigin(0.5, 0),
      );
    }

    this.update(player, enemies, escorts);
  }

  /**
   * The support fleets (#84) and allies that join (#64) get HP bars like the escorts (#394: their HP was not shown);
   * the player's own fleets count towards 自艦隊.
   */
  addAllies(scene: Phaser.Scene, ships: BaseShip[], owned: boolean): void {
    for (const ship of ships) {
      if (this.escortBars.has(ship)) continue;
      if (owned) this.own.push(ship);
      this.allyShips.set(ship, owned);
      this.escortBars.set(ship, new HealthBar(scene, ESCORT_BAR_W, 6));
      this.escortLabels.set(ship, scene.add.text(0, 0, ship.stats.name, owned ? LABEL_STYLE_ESCORT : LABEL_STYLE_ALLY).setDepth(DEPTH_HUD).setOrigin(0.5, 0));
    }
  }

  update(player: BaseShip, enemies: BaseShip[], _escorts: BaseShip[] = [], status?: IHudStatus): void {
    if (status) this.status = status;
    const detail = [this.status.weapons ?? '', this.status.damage ?? ''].filter((l) => l).join('\n');
    if (this.detailText.text !== detail) {
      this.detailText.setText(detail).setColor(this.status.damage ? Css.danger : Css.cyan);
    }
    // Player HP bar and name follow the flagship
    if (player.active) {
      syncLabel(this.playerNameLabel, player);
      this.playerNameLabel
        .setPosition(player.x, player.y + hullRadius(player) + LABEL_GAP)
        .setVisible(true);
      this.playerBar.update(
        player.stats.currentHp,
        player.stats.maxHp,
        player.x,
        player.y + hullRadius(player) + LABEL_GAP + this.playerNameLabel.height,
      );
    } else {
      this.playerNameLabel.setVisible(false);
      this.playerBar.update(0, 1, -500, -500);
    }

    for (const [ship, bar] of this.enemyBars) {
      const label = this.enemyLabels.get(ship)!;
      // Hidden enemies (submerged boats off sonar) don't give themselves away with a label.
      if (ship.active && ship.visible) {
        syncLabel(label, ship);
        const top = ship.y - hullRadius(ship) - LABEL_GAP;
        bar.update(ship.stats.currentHp, ship.stats.maxHp, ship.x, top - 7);
        label.setPosition(ship.x, top - 9).setVisible(true);
      } else {
        bar.update(0, 1, -500, -500);
        label.setVisible(false);
      }
    }

    for (const [ship, bar] of this.escortBars) {
      const label = this.escortLabels.get(ship)!;
      if (ship.active) {
        syncLabel(label, ship);
        const bottom = ship.y + hullRadius(ship) + LABEL_GAP;
        label.setPosition(ship.x, bottom).setVisible(true);
        bar.update(ship.stats.currentHp, ship.stats.maxHp, ship.x, bottom + label.height, this.convoyShips.has(ship) ? Colors.gold : this.allyShips.get(ship) === false ? Colors.success : Colors.cyan);
      } else {
        bar.update(0, 1, -500, -500);
        label.setVisible(false);
      }
    }

    const alive = enemies.filter((e) => e.isAlive).length;
    const killed = this.totalEnemies - alive;
    const afloat = this.own.filter((s) => s.isAlive).length;
    const kills = `${killed}/${this.totalEnemies}  自 ${afloat}/${this.own.length}`;
    if (this.killText.text !== kills) this.killText.setText(kills);

    const hpFrac = player.stats.maxHp > 0 ? Math.max(0, player.stats.currentHp / player.stats.maxHp) : 0;
    const hpColor = hpFrac > 0.5 ? Colors.success : hpFrac > 0.25 ? Colors.gold : Colors.danger;
    const reload = this.status.reload;
    this.meters.clear();
    const { hpMeter: hm, gunMeter: gm } = STRIP;
    drawMeter(this.meters, BX + hm.x, BY + hm.y, hm.w, hm.h, hpFrac, hpColor);
    drawMeter(this.meters, BX + gm.x, BY + gm.y, gm.w, gm.h, reload, reload >= 1 ? Colors.cyan : Colors.blue);
    this.hpText.setText(`${Math.max(0, Math.ceil(player.stats.currentHp))}`);
    this.gunText.setText(reload >= 1 ? '装填完了' : '装填中').setColor(reload >= 1 ? Css.cyan : Css.muted);

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
