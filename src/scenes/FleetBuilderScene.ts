import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData } from '@/types/Scene';

const PANEL_L = { x: 10, y: 70, w: 360, h: 550 };
const PANEL_C = { x: 380, y: 70, w: 510, h: 550 };
const PANEL_R = { x: 900, y: 70, w: 370, h: 550 };
const MAX_SLOTS = 3;

const FORMATION_LIST: Formation[] = [Formation.LineAhead, Formation.DoubleLine, Formation.Circle];
const FORMATION_LABELS: Record<Formation, string> = {
  [Formation.LineAhead]: '縦陣\nLine Ahead',
  [Formation.DoubleLine]: '複縦陣\nDouble Line',
  [Formation.Circle]: '輪形陣\nCircle',
};

export class FleetBuilderScene extends Phaser.Scene {
  private ships: IShipData[] = [];
  private slots: (IShipData | null)[] = [null, null, null];
  private formation: Formation = Formation.LineAhead;

  private shipItemBgs: Phaser.GameObjects.Rectangle[] = [];
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private slotRemoveBtns: Phaser.GameObjects.Text[] = [];
  private formationBgs: Phaser.GameObjects.Rectangle[] = [];
  private startBtn!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.FLEET_BUILDER });
  }

  create(): void {
    this.ships = DataLoader.getShips(this, 'ijn');
    this.slots = [null, null, null];
    this.formation = Formation.LineAhead;

    this.drawBackground();
    this.buildShipList();
    this.buildSlotPanel();
    this.buildFormationPanel();
    this.buildStartButton();
  }

  private drawBackground(): void {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x040e1c);

    this.add
      .text(CANVAS_W / 2, 30, 'FLEET BUILDER — 帝国海軍 (IJN)', {
        fontSize: '26px',
        color: '#c8d8f0',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);

    this.add
      .text(PANEL_L.x + PANEL_L.w / 2, PANEL_L.y + 12, '利用可能な艦', {
        fontSize: '16px', color: '#8aaccc',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(PANEL_C.x + PANEL_C.w / 2, PANEL_C.y + 12, '艦隊編成 (最大 3 隻)', {
        fontSize: '16px', color: '#8aaccc',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(PANEL_R.x + PANEL_R.w / 2, PANEL_R.y + 12, '陣形選択', {
        fontSize: '16px', color: '#8aaccc',
      })
      .setOrigin(0.5, 0);

    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x204060, 0.8);
    [PANEL_L, PANEL_C, PANEL_R].forEach((p) => gfx.strokeRect(p.x, p.y, p.w, p.h));
  }

  private buildShipList(): void {
    const itemH = 96;
    const startY = PANEL_L.y + 38;

    this.ships.forEach((ship, i) => {
      const y = startY + i * (itemH + 6);

      const bg = this.add
        .rectangle(PANEL_L.x + 8, y, PANEL_L.w - 16, itemH, 0x0a1e30)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.shipItemBgs.push(bg);

      this.add
        .text(PANEL_L.x + 18, y + 10, ship.name, { fontSize: '15px', color: '#e0ecff' });
      this.add
        .text(PANEL_L.x + 18, y + 32, `Class: ${ship.shipClass}`, { fontSize: '12px', color: '#7a9ab8' });
      this.add
        .text(PANEL_L.x + 18, y + 50, `HP ${ship.hp}  Armor ${ship.armor}  Spd ${ship.speed}`, {
          fontSize: '12px', color: '#7a9ab8',
        });
      this.add
        .text(PANEL_L.x + 18, y + 68, `Weapons: ${ship.weapons.join(', ')}`, {
          fontSize: '11px', color: '#557090',
        });

      const addLabel = this.add
        .text(PANEL_L.x + PANEL_L.w - 26, y + itemH / 2, '[+]', {
          fontSize: '18px', color: '#44cc88',
        })
        .setOrigin(1, 0.5);

      bg.on('pointerover', () => {
        bg.setFillStyle(0x163048);
        addLabel.setStyle({ color: '#88ffcc' });
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(0x0a1e30);
        addLabel.setStyle({ color: '#44cc88' });
      });
      bg.on('pointerdown', () => this.addShipToFleet(ship));
    });
  }

  private buildSlotPanel(): void {
    const slotH = 158;
    const startY = PANEL_C.y + 38;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = startY + i * (slotH + 8);

      this.add.rectangle(PANEL_C.x + 10, y, PANEL_C.w - 20, slotH, 0x0a1e30).setOrigin(0, 0);

      const role = i === 0 ? '★ Flagship' : `○ Escort ${i}`;
      this.add.text(PANEL_C.x + 22, y + 10, `Slot ${i + 1}  ${role}`, {
        fontSize: '13px', color: '#7a9ab8',
      });

      const shipText = this.add
        .text(PANEL_C.x + 22, y + 34, '--- Empty ---', {
          fontSize: '16px', color: '#3a5a78',
        });
      this.slotTexts.push(shipText);

      const removeBtn = this.add
        .text(PANEL_C.x + PANEL_C.w - 26, y + 12, '[✕]', {
          fontSize: '16px', color: '#cc4444',
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.slotRemoveBtns.push(removeBtn);

      const slotIndex = i;
      removeBtn.on('pointerover', () => removeBtn.setStyle({ color: '#ff8888' }));
      removeBtn.on('pointerout', () => removeBtn.setStyle({ color: '#cc4444' }));
      removeBtn.on('pointerdown', () => this.removeShipFromSlot(slotIndex));
    }
  }

  private buildFormationPanel(): void {
    const btnH = 158;
    const startY = PANEL_R.y + 38;

    FORMATION_LIST.forEach((formation, i) => {
      const y = startY + i * (btnH + 8);

      const bg = this.add
        .rectangle(PANEL_R.x + 10, y, PANEL_R.w - 20, btnH, 0x0a1e30)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.formationBgs.push(bg);

      this.add
        .text(PANEL_R.x + 24, y + 18, FORMATION_LABELS[formation], {
          fontSize: '14px',
          color: '#c8d8f0',
          lineSpacing: 4,
        });

      this.drawFormationDiagram(formation, PANEL_R.x + PANEL_R.w - 80, y + btnH / 2);

      const idx = i;
      bg.on('pointerover', () => {
        if (this.formation !== FORMATION_LIST[idx]) bg.setFillStyle(0x122a40);
      });
      bg.on('pointerout', () => {
        if (this.formation !== FORMATION_LIST[idx]) bg.setFillStyle(0x0a1e30);
      });
      bg.on('pointerdown', () => this.selectFormation(FORMATION_LIST[idx]));
    });

    this.selectFormation(Formation.LineAhead);
  }

  private drawFormationDiagram(formation: Formation, cx: number, cy: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x4488cc, 0.9);
    const shipW = 10;
    const shipH = 22;

    const drawShip = (dx: number, dy: number, color: number): void => {
      gfx.fillStyle(color, 1);
      gfx.fillRect(cx + dx - shipW / 2, cy + dy - shipH / 2, shipW, shipH);
    };

    if (formation === Formation.LineAhead) {
      drawShip(0, -36, 0xffdd44);
      drawShip(0, 0, 0x4488cc);
      drawShip(0, 36, 0x4488cc);
    } else if (formation === Formation.DoubleLine) {
      drawShip(0, -22, 0xffdd44);
      drawShip(-18, 18, 0x4488cc);
      drawShip(18, 18, 0x4488cc);
    } else {
      drawShip(0, -22, 0xffdd44);
      drawShip(-32, 18, 0x4488cc);
      drawShip(32, 18, 0x4488cc);
    }
  }

  private buildStartButton(): void {
    this.startBtn = this.add
      .text(CANVAS_W / 2, 660, '[ 出撃 — START BATTLE ]', {
        fontSize: '30px',
        color: '#888888',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.startBtn.on('pointerover', () => {
      if (this.canStart()) this.startBtn.setStyle({ color: '#44ffcc' });
    });
    this.startBtn.on('pointerout', () => {
      this.refreshStartButton();
    });
    this.startBtn.on('pointerdown', () => {
      if (this.canStart()) this.startBattle();
    });
  }

  private addShipToFleet(ship: IShipData): void {
    const emptyIndex = this.slots.findIndex((s) => s === null);
    if (emptyIndex === -1) return;
    this.slots[emptyIndex] = ship;
    this.refreshSlotPanel();
    this.refreshStartButton();
  }

  private removeShipFromSlot(index: number): void {
    this.slots[index] = null;
    this.refreshSlotPanel();
    this.refreshStartButton();
  }

  private selectFormation(formation: Formation): void {
    this.formation = formation;
    FORMATION_LIST.forEach((f, i) => {
      const isSelected = f === formation;
      this.formationBgs[i].setFillStyle(isSelected ? 0x0d2e50 : 0x0a1e30);
      this.formationBgs[i].setStrokeStyle(isSelected ? 2 : 0, 0x4488cc);
    });
  }

  private refreshSlotPanel(): void {
    this.slots.forEach((ship, i) => {
      if (ship) {
        this.slotTexts[i].setText(`${ship.name}\nHP ${ship.hp}  Armor ${ship.armor}  Spd ${ship.speed}`);
        this.slotTexts[i].setStyle({ color: '#e0ecff', fontSize: '14px' });
        this.slotRemoveBtns[i].setVisible(true);
      } else {
        this.slotTexts[i].setText('--- Empty ---');
        this.slotTexts[i].setStyle({ color: '#3a5a78', fontSize: '16px' });
        this.slotRemoveBtns[i].setVisible(false);
      }
    });
  }

  private canStart(): boolean {
    return this.slots.some((s) => s !== null);
  }

  private refreshStartButton(): void {
    this.startBtn.setStyle({ color: this.canStart() ? '#ffffff' : '#888888' });
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
