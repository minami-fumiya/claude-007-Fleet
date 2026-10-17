import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addChip, addPanel, drawMeter, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

const TOP_Y = 92;
const PANEL_H = 500;
const PANEL_L = { x: 24, y: TOP_Y, w: 404, h: PANEL_H };
const PANEL_C = { x: 444, y: TOP_Y, w: 412, h: PANEL_H };
const PANEL_R = { x: 872, y: TOP_Y, w: 384, h: PANEL_H };
const PANEL_HEADER_H = 58;
const FOOTER_Y = 610;
const MAX_SLOTS = 3;

const FORMATION_LIST: Formation[] = [Formation.LineAhead, Formation.DoubleLine, Formation.Circle];
const FORMATION_INFO: Record<Formation, { ja: string; en: string; desc: string }> = {
  [Formation.LineAhead]: { ja: '縦陣', en: 'LINE AHEAD', desc: '旗艦の後ろに一列で続く' },
  [Formation.DoubleLine]: { ja: '複縦陣', en: 'DOUBLE LINE', desc: '後方に二列で並び火力を集中' },
  [Formation.Circle]: { ja: '輪形陣', en: 'CIRCLE', desc: '旗艦の左右を広く守る' },
};

const CLASS_BADGE: Record<string, { label: string; color: number; css: string }> = {
  [ShipClass.Battleship]: { label: 'BATTLESHIP', color: Colors.gold, css: Css.gold },
  [ShipClass.Cruiser]: { label: 'CRUISER', color: Colors.cyan, css: Css.cyan },
  [ShipClass.Destroyer]: { label: 'DESTROYER', color: Colors.success, css: Css.success },
  [ShipClass.Carrier]: { label: 'CARRIER', color: 0xc58bff, css: '#c58bff' },
  [ShipClass.Submarine]: { label: 'SUBMARINE', color: Colors.blue, css: Css.blue },
};

interface ISlotView {
  frame: Phaser.GameObjects.Graphics;
  content: Phaser.GameObjects.Container | null;
  emptyLabel: Phaser.GameObjects.Text;
}

export class FleetBuilderScene extends Phaser.Scene {
  private ships: IShipData[] = [];
  private slots: (IShipData | null)[] = [null, null, null];
  private formation: Formation = Formation.LineAhead;

  private slotViews: ISlotView[] = [];
  private formationFrames: Phaser.GameObjects.Graphics[] = [];
  private shipCards: Phaser.GameObjects.Container[] = [];
  private summaryText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private maxStats = { hp: 1, armor: 1, speed: 1 };

  constructor() {
    super({ key: SceneKeys.FLEET_BUILDER });
  }

  create(): void {
    this.ships = DataLoader.getShips(this, 'ijn');
    this.slots = [null, null, null];
    this.formation = Formation.LineAhead;
    this.slotViews = [];
    this.formationFrames = [];
    this.shipCards = [];
    this.maxStats = {
      hp: Math.max(1, ...this.ships.map((s) => s.hp)),
      armor: Math.max(1, ...this.ships.map((s) => s.armor)),
      speed: Math.max(1, ...this.ships.map((s) => s.speed)),
    };

    addBackdrop(this, 'menu');
    this.buildHeader();
    this.buildPanelFrame(PANEL_L, 'AVAILABLE SHIPS', '利用可能な艦');
    this.buildPanelFrame(PANEL_C, 'YOUR FLEET', '艦隊編成');
    this.buildPanelFrame(PANEL_R, 'FORMATION', '陣形');
    this.buildShipList();
    this.buildSlotPanel();
    this.buildFormationPanel();
    this.buildFooter();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private buildHeader(): void {
    new UIButton(this, 92, 44, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
      variant: 'secondary',
      width: 136,
      height: 44,
      fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, 26, 'FLEET BUILDER', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, 56, '帝国海軍 — 艦隊を編成せよ', displayStyle(24)).setOrigin(0.5);
    addChip(this, CANVAS_W - 128, 44, 'NATION · IJN', Colors.gold, Css.gold);
  }

  private buildPanelFrame(p: { x: number; y: number; w: number; h: number }, eyebrow: string, title: string): void {
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, eyebrow, eyebrowStyle(11));
    this.add.text(p.x + 22, p.y + 34, title, textStyle(15, Css.text, { fontStyle: 'bold' }));
  }

  private buildShipList(): void {
    const itemH = 80;
    const gap = 8;
    const startY = PANEL_L.y + PANEL_HEADER_H + 4;
    const x = PANEL_L.x + 14;
    const w = PANEL_L.w - 28;

    this.ships.forEach((ship, i) => {
      const y = startY + i * (itemH + gap);
      const bg = drawPanel(this.add.graphics(), 0, 0, w, itemH, { radius: 16, fill: Colors.panelHi, fillAlpha: 0.55 });
      const hover = this.add.graphics();
      drawPanel(hover, 0, 0, w, itemH, { radius: 16, fill: Colors.cyan, fillAlpha: 0.08, rimAlpha: 0.7 });
      hover.setVisible(false);

      const icon = this.add.image(36, itemH / 2, ship.spriteKey).setScale(1.1);
      const name = this.add.text(70, 12, ship.name, textStyle(15, Css.text, { fontStyle: 'bold' }));
      const badgeInfo = CLASS_BADGE[ship.shipClass] ?? CLASS_BADGE[ShipClass.Cruiser];
      const badge = addChip(this, 70 + name.width + 10, 22, badgeInfo.label, badgeInfo.color, badgeInfo.css);

      const meters = this.add.graphics();
      const stats: Array<[string, number, number, number]> = [
        ['HP', ship.hp, this.maxStats.hp, Colors.success],
        ['ARM', ship.armor, this.maxStats.armor, Colors.gold],
        ['SPD', ship.speed, this.maxStats.speed, Colors.cyan],
      ];
      const statLabels: Phaser.GameObjects.Text[] = [];
      stats.forEach(([label, value, max, color], si) => {
        const mx = 70 + si * 92;
        statLabels.push(this.add.text(mx, 44, `${label} ${value}`, textStyle(11, Css.muted)));
        drawMeter(meters, mx, 62, 80, 5, value / max, color);
      });

      const plus = this.add.graphics();
      plus.fillStyle(Colors.cyan, 0.15);
      plus.fillCircle(w - 30, itemH / 2, 17);
      plus.lineStyle(1.5, Colors.cyan, 0.7);
      plus.strokeCircle(w - 30, itemH / 2, 17);
      const plusLabel = this.add.text(w - 30, itemH / 2 - 1, '+', textStyle(22, Css.cyan, { fontStyle: 'bold' })).setOrigin(0.5);

      const card = this.add.container(x, y, [bg, hover, icon, name, badge, meters, ...statLabels, plus, plusLabel]);
      makeClickable(card, w, itemH);
      card.on('pointerover', () => hover.setVisible(true));
      card.on('pointerout', () => hover.setVisible(false));
      card.on('pointerup', () => this.addShipToFleet(ship));
      this.shipCards.push(card);
    });
  }

  private buildSlotPanel(): void {
    const slotH = 136;
    const gap = 10;
    const startY = PANEL_C.y + PANEL_HEADER_H + 4;
    const x = PANEL_C.x + 14;
    const w = PANEL_C.w - 28;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = startY + i * (slotH + gap);
      const frame = this.add.graphics().setPosition(x, y);
      const emptyLabel = this.add
        .text(x + w / 2, y + slotH / 2 + 12, '← 左の一覧から艦を追加', textStyle(14, Css.dim))
        .setOrigin(0.5);
      const role = i === 0 ? 'FLAGSHIP · 旗艦' : `ESCORT ${i} · 護衛`;
      this.add.text(x + 18, y + 16, role, eyebrowStyle(10, i === 0 ? Css.gold : Css.cyan));
      this.slotViews.push({ frame, content: null, emptyLabel });
    }
  }

  private buildFormationPanel(): void {
    const btnH = 136;
    const gap = 10;
    const startY = PANEL_R.y + PANEL_HEADER_H + 4;
    const x = PANEL_R.x + 14;
    const w = PANEL_R.w - 28;

    FORMATION_LIST.forEach((formation, i) => {
      const y = startY + i * (btnH + gap);
      const info = FORMATION_INFO[formation];
      const frame = this.add.graphics();
      this.formationFrames.push(frame);

      const ja = this.add.text(20, 22, info.ja, displayStyle(24));
      const en = this.add.text(20, 60, info.en, eyebrowStyle(10, Css.muted));
      const desc = this.add.text(20, 84, info.desc, textStyle(12, Css.muted, { wordWrap: { width: w - 150 } }));
      const diagram = this.add.graphics();
      this.drawFormationDiagram(diagram, formation, w - 66, btnH / 2);

      const card = this.add.container(x, y, [frame, ja, en, desc, diagram]);
      makeClickable(card, w, btnH);
      card.on('pointerup', () => this.selectFormation(formation));
    });
  }

  private drawFormationDiagram(g: Phaser.GameObjects.Graphics, formation: Formation, cx: number, cy: number): void {
    g.fillStyle(Colors.cyan, 0.06);
    g.fillCircle(cx, cy, 50);
    g.lineStyle(1, Colors.cyan, 0.2);
    g.strokeCircle(cx, cy, 50);

    const ship = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx + dx - 5, cy + dy - 12, 10, 24, 5);
    };
    if (formation === Formation.LineAhead) {
      ship(0, -30, Colors.gold);
      ship(0, 0, Colors.cyan);
      ship(0, 30, Colors.cyan);
    } else if (formation === Formation.DoubleLine) {
      ship(0, -20, Colors.gold);
      ship(-16, 18, Colors.cyan);
      ship(16, 18, Colors.cyan);
    } else {
      ship(0, -18, Colors.gold);
      ship(-30, 16, Colors.cyan);
      ship(30, 16, Colors.cyan);
    }
  }

  private buildFooter(): void {
    addPanel(this, 24, FOOTER_Y, CANVAS_W - 48, 92, { radius: 24, fillAlpha: 0.6 });
    this.add.text(52, FOOTER_Y + 22, 'FLEET SUMMARY', eyebrowStyle(10, Css.muted));
    this.countText = this.add.text(52, FOOTER_Y + 44, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
    this.summaryText = this.add.text(200, FOOTER_Y + 50, '', textStyle(14, Css.muted));

    this.startBtn = new UIButton(this, CANVAS_W - 196, FOOTER_Y + 46, '出撃  ▶', () => {
      if (this.canStart()) this.startBattle();
    }, { variant: 'gold', width: 300, height: 60, fontSize: 22, caption: 'START BATTLE' });
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private addShipToFleet(ship: IShipData): void {
    const emptyIndex = this.slots.findIndex((s) => s === null);
    if (emptyIndex === -1) return;
    this.slots[emptyIndex] = ship;
    this.refresh();
  }

  private removeShipFromSlot(index: number): void {
    this.slots[index] = null;
    this.refresh();
  }

  private selectFormation(formation: Formation): void {
    this.formation = formation;
    this.refreshFormations();
    this.refreshFooter();
  }

  private refresh(): void {
    this.refreshSlots();
    this.refreshFormations();
    this.refreshFooter();
  }

  private refreshSlots(): void {
    const w = PANEL_C.w - 28;
    const h = 136;

    this.slots.forEach((ship, i) => {
      const view = this.slotViews[i];
      view.frame.clear();
      view.content?.destroy();
      view.content = null;

      if (!ship) {
        drawPanel(view.frame, 0, 0, w, h, { radius: 18, fillAlpha: 0.25, dashed: true, rimAlpha: 0.35 });
        view.emptyLabel.setVisible(true);
        return;
      }

      const isFlag = i === 0 || this.slots.findIndex((s) => s !== null) === i;
      drawPanel(view.frame, 0, 0, w, h, {
        radius: 18,
        fill: Colors.panelHi,
        fillAlpha: 0.75,
        rim: isFlag ? Colors.gold : Colors.cyan,
        rimAlpha: 0.6,
        glow: 0.8,
      });
      view.emptyLabel.setVisible(false);

      const icon = this.add.image(54, 78, ship.spriteKey).setScale(1.5);
      const name = this.add.text(100, 44, ship.name, textStyle(18, Css.text, { fontStyle: 'bold' }));
      const stats = this.add.text(100, 74, `HP ${ship.hp}   装甲 ${ship.armor}   速力 ${ship.speed}`, textStyle(13, Css.muted));
      const weapons = this.add.text(100, 98, ship.weapons.join(' · '), textStyle(11, Css.dim));

      const remove = new UIButton(this, w - 34, 30, '✕', () => this.removeShipFromSlot(i), {
        variant: 'secondary',
        width: 40,
        height: 36,
        fontSize: 15,
      });

      const frameX = view.frame.x;
      const frameY = view.frame.y;
      view.content = this.add.container(frameX, frameY, [icon, name, stats, weapons, remove]);
    });
  }

  private refreshFormations(): void {
    const w = PANEL_R.w - 28;
    const h = 136;
    FORMATION_LIST.forEach((f, i) => {
      const selected = f === this.formation;
      const g = this.formationFrames[i];
      g.clear();
      drawPanel(g, 0, 0, w, h, {
        radius: 18,
        fill: selected ? Colors.panelHi : Colors.panel,
        fillAlpha: selected ? 0.9 : 0.45,
        rimAlpha: selected ? 0.85 : 0.2,
        glow: selected ? 1 : 0,
      });
      if (selected) {
        g.fillStyle(Colors.cyan, 1);
        g.fillCircle(w - 18, 18, 5);
      }
    });
  }

  private refreshFooter(): void {
    const ships = this.slots.filter((s): s is IShipData => s !== null);
    this.countText.setText(`${ships.length} / ${MAX_SLOTS} 隻`);
    if (ships.length === 0) {
      this.summaryText.setText('艦を 1 隻以上選ぶと出撃できます');
    } else {
      const totalHp = ships.reduce((sum, s) => sum + s.hp, 0);
      const minSpeed = Math.min(...ships.map((s) => s.speed));
      this.summaryText.setText(`総耐久 ${totalHp}   艦隊速力 ${minSpeed}   陣形 ${FORMATION_INFO[this.formation].ja}`);
    }
    this.startBtn.setEnabled(this.canStart());
  }

  private canStart(): boolean {
    return this.slots.some((s) => s !== null);
  }

  private startBattle(): void {
    const allShips = DataLoader.getShips(this, 'ijn');
    const flagshipIndex = this.slots.findIndex((s) => s !== null);

    const playerFleet = FleetSystem.createFleet(
      'player-fleet',
      '第一艦隊',
      Nation.IJN,
      this.slots,
      flagshipIndex,
    );
    playerFleet.slots.forEach((slot) => {
      if (slot.shipData) {
        (slot.shipData as IShipData & { formation?: Formation }).formation = this.formation;
      }
    });

    const musashi = allShips.find((s) => s.id === 'musashi') ?? allShips[0];
    const takao = allShips.find((s) => s.id === 'takao') ?? allShips[0];
    const enemyFleet = FleetSystem.createFleet(
      'enemy-fleet',
      'Enemy Fleet',
      Nation.IJN,
      [musashi, takao, takao],
      0,
    );

    const initData: IBattleInitData & { formation: Formation } = {
      playerFleet,
      enemyFleet,
      mapKey: '',
      formation: this.formation,
    };

    this.scene.start(SceneKeys.BATTLE, initData);
  }
}
