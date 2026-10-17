import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { generateEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { BattleMode } from '@/types/Battle';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { IBattleInitData } from '@/types/Scene';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addChip, addPanel, drawMeter, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

const MAX_SLOTS = 3;
const PANEL_PAD = 14;
/** Space for a panel's eyebrow + title; taller in portrait where text is enlarged. */
const PANEL_HEADER_H = IS_PORTRAIT ? 84 : 58;
/** Portrait only: fixed bars above and below the scrolling content. */
const HEADER_BAR_H = 124;
const FOOTER_BAR_H = 160;
/** A drag longer than this scrolls the page instead of counting as a tap. */
const DRAG_THRESHOLD = 12;

interface IRect { x: number; y: number; w: number; h: number }

interface IBuilderLayout {
  ships: IRect;
  shipItemH: number;
  /** Height of the nation tab row at the top of the ship list */
  tabH: number;
  fleet: IRect;
  slotH: number;
  formations: IRect;
  /** 'column' stacks formation cards vertically, 'row' lays them side by side */
  formationFlow: 'column' | 'row';
  formationCardH: number;
  /** Opponent nation + battle mode toggles */
  enemy: IRect;
  enemyButtonH: number;
  footer: IRect;
}

/** Ships shown per page of the ship list; the panel is sized for one full page. */
const PAGE_SIZE = 6;
const P_SHIP_ITEM_H = 120;
const P_TAB_H = 64;
const P_SHIPS_Y = 618;
const P_SHIPS_H = 84 + P_TAB_H + 12 + PAGE_SIZE * P_SHIP_ITEM_H + (PAGE_SIZE - 1) * 8 + 14;
const P_FORMATIONS_Y = P_SHIPS_Y + P_SHIPS_H + 18;
const P_FORMATIONS_H = 84 + 180 + 14;
const P_ENEMY_Y = P_FORMATIONS_Y + P_FORMATIONS_H + 18;

/**
 * Landscape: ships | fleet | formations in three columns, everything on one screen.
 * Portrait: fleet, ships, formations stacked on a page that scrolls between a fixed header and footer.
 */
const LAYOUT: IBuilderLayout = IS_PORTRAIT
  ? {
      fleet: { x: 16, y: HEADER_BAR_H + 12, w: CANVAS_W - 32, h: 84 + 3 * 116 + 2 * 10 + 14 },
      slotH: 116,
      ships: { x: 16, y: P_SHIPS_Y, w: CANVAS_W - 32, h: P_SHIPS_H },
      shipItemH: P_SHIP_ITEM_H,
      tabH: P_TAB_H,
      formations: { x: 16, y: P_FORMATIONS_Y, w: CANVAS_W - 32, h: P_FORMATIONS_H },
      formationFlow: 'row',
      formationCardH: 180,
      enemy: { x: 16, y: P_ENEMY_Y, w: CANVAS_W - 32, h: 84 + 2 * 64 + 12 + 14 },
      enemyButtonH: 60,
      footer: { x: 16, y: CANVAS_H - FOOTER_BAR_H + 6, w: CANVAS_W - 32, h: FOOTER_BAR_H - 18 },
    }
  : {
      ships: { x: 24, y: 92, w: 404, h: 512 },
      shipItemH: 62,
      tabH: 36,
      fleet: { x: 444, y: 92, w: 412, h: 512 },
      slotH: 136,
      formations: { x: 872, y: 92, w: 384, h: 362 },
      formationFlow: 'column',
      formationCardH: 88,
      enemy: { x: 872, y: 466, w: 384, h: 138 },
      enemyButtonH: 32,
      footer: { x: 24, y: 616, w: CANVAS_W - 48, h: 92 },
    };

const ITEM_GAP = IS_PORTRAIT ? 8 : 6;
const CARD_GAP = 10;

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

/** "大和 (Yamato)" → "大和": the Japanese part of a display name. */
function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, '');
}

/** Fits a ship name into `room` px: first drop the English part, then shrink the text. */
function fitName(text: Phaser.GameObjects.Text, name: string, room: number): void {
  if (text.width <= room) return;
  text.setText(shortName(name));
  if (text.width > room) text.setScale(room / text.width);
}

const BATTLE_MODES: BattleMode[] = [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW];
const MODE_LABEL: Record<BattleMode, string> = {
  [BattleMode.Surface]: '水上戦',
  [BattleMode.CarrierStrike]: '機動部隊',
  [BattleMode.ASW]: '対潜戦',
};

/** Last Fleet Builder setup, kept in the game registry so RETRY / 撤退 come back to the same fleet. */
const SELECTION_KEY = 'fleetBuilder.selection';
interface ISelection {
  nation: Nation;
  enemyNation: Nation;
  mode: BattleMode;
  formation: Formation;
  slotIds: (string | null)[];
}

interface ISlotView {
  frame: Phaser.GameObjects.Graphics;
  content: Phaser.GameObjects.Container | null;
  emptyLabel: Phaser.GameObjects.Text;
}

export class FleetBuilderScene extends Phaser.Scene {
  private shipRegistry!: ShipRegistry;
  private ships: IShipData[] = [];
  private slots: (IShipData | null)[] = [null, null, null];
  private formation: Formation = Formation.LineAhead;
  private nation: Nation = Nation.IJN;
  private enemyNation: Nation = Nation.USN;
  private mode: BattleMode = BattleMode.Surface;

  private page = 0;
  private pageText!: Phaser.GameObjects.Text;
  private pageButtons: UIButton[] = [];
  private nationTabs: UIButton[] = [];
  private enemyNationButtons: UIButton[] = [];
  private modeButtons: UIButton[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private nationChip: Phaser.GameObjects.Container | null = null;

  private slotViews: ISlotView[] = [];
  private formationFrames: Phaser.GameObjects.Graphics[] = [];
  private shipCards: Phaser.GameObjects.Container[] = [];
  private summaryText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private maxStats = { hp: 1, armor: 1, speed: 1 };
  /** Portrait scrolling: true while the current pointer gesture is a drag, so taps are ignored */
  private dragging = false;

  constructor() {
    super({ key: SceneKeys.FLEET_BUILDER });
  }

  create(): void {
    this.shipRegistry = DataLoader.getRegistry(this);
    const saved = this.registry.get(SELECTION_KEY) as ISelection | undefined;
    this.nation = saved?.nation ?? Nation.IJN;
    this.enemyNation = saved?.enemyNation ?? Nation.USN;
    this.mode = saved?.mode ?? BattleMode.Surface;
    this.ships = this.shipRegistry.byNation(this.nation);
    this.slots = [0, 1, 2].map((i) => {
      const id = saved?.slotIds[i];
      return id ? this.shipRegistry.byId(id) ?? null : null;
    });
    this.formation = saved?.formation ?? Formation.LineAhead;
    this.slotViews = [];
    this.formationFrames = [];
    this.shipCards = [];
    this.page = 0;
    this.pageButtons = [];
    this.nationTabs = [];
    this.enemyNationButtons = [];
    this.modeButtons = [];
    this.nationChip = null;
    this.dragging = false;
    // Meters share one scale across nations so ships compare fairly between tabs.
    const all = this.shipRegistry.all();
    this.maxStats = {
      hp: Math.max(1, ...all.map((s) => s.hp)),
      armor: Math.max(1, ...all.map((s) => s.armor)),
      speed: Math.max(1, ...all.map((s) => s.speed)),
    };

    addBackdrop(this, 'menu').setScrollFactor(0);
    this.buildHeader();
    this.buildPanelFrame(LAYOUT.ships, 'AVAILABLE SHIPS', '利用可能な艦');
    this.buildPanelFrame(LAYOUT.fleet, 'YOUR FLEET', '艦隊編成');
    this.buildPanelFrame(LAYOUT.formations, 'FORMATION', '陣形');
    this.buildPanelFrame(LAYOUT.enemy, 'OPPONENT', '交戦相手');
    this.buildNationTabs();
    this.buildPager();
    this.buildShipList();
    this.buildSlotPanel();
    this.buildFormationPanel();
    this.buildEnemyPanel();
    this.buildFooter();
    this.refresh();
    if (IS_PORTRAIT) this.setupScrolling();
  }

  /** Wraps a tap handler so it does nothing at the end of a scroll drag. */
  private onTap(fn: () => void): () => void {
    return () => {
      if (!this.dragging) fn();
    };
  }

  private setupScrolling(): void {
    const contentBottom = LAYOUT.enemy.y + LAYOUT.enemy.h + 24;
    // Let the last panel scroll clear of the fixed footer.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, CANVAS_W, contentBottom + FOOTER_BAR_H);

    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = false;
      startY = p.y;
      startScroll = cam.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const dy = p.y - startY;
      if (!this.dragging && Math.abs(dy) < DRAG_THRESHOLD) return;
      this.dragging = true;
      cam.setScroll(0, startScroll - dy);
    });
    // Game-object pointerup handlers run before this scene-level one, so they still see `dragging`.
    this.input.on('pointerup', () => {
      this.time.delayedCall(0, () => {
        this.dragging = false;
      });
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      cam.setScroll(0, cam.scrollY + dy);
    });
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private buildHeader(): void {
    const fixed: Phaser.GameObjects.GameObject[] = [];
    if (IS_PORTRAIT) {
      // Interactive so taps on the bar don't reach cards scrolled underneath it.
      fixed.push(this.add.rectangle(0, 0, CANVAS_W, HEADER_BAR_H, Colors.bgDeep, 0.94).setOrigin(0, 0).setInteractive());
    }
    const back = IS_PORTRAIT
      ? new UIButton(this, 100, 46, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
          variant: 'secondary', width: 172, height: 60, fontSize: 15,
        })
      : new UIButton(this, 92, 44, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
          variant: 'secondary', width: 136, height: 44, fontSize: 15,
        });
    fixed.push(back);
    fixed.push(this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'FLEET BUILDER', eyebrowStyle(12)).setOrigin(0.5));
    this.titleText = this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 56, '', displayStyle(24)).setOrigin(0.5);
    fixed.push(this.titleText);
    this.pin(fixed, 60);
    this.refreshHeader();
  }

  private refreshHeader(): void {
    this.titleText.setText(`${NATION_INFO[this.nation].ja} — 艦隊を編成せよ`);
    this.nationChip?.destroy();
    const chip = addChip(this, 0, IS_PORTRAIT ? 46 : 44, `NATION · ${NATION_INFO[this.nation].short}`, Colors.gold, Css.gold);
    chip.setX(CANVAS_W - 20 - chip.getBounds().width);
    this.pin([chip], 60);
    this.nationChip = chip;
  }

  /** A row of equal-width toggle buttons filling `w`, centred vertically on `cy`. */
  private addToggleRow(
    x: number,
    cy: number,
    w: number,
    h: number,
    labels: string[],
    onSelect: (index: number) => void,
  ): UIButton[] {
    const gap = 8;
    const bw = Math.floor((w - gap * (labels.length - 1)) / labels.length);
    return labels.map(
      (label, i) =>
        new UIButton(this, x + i * (bw + gap) + bw / 2, cy, label, this.onTap(() => onSelect(i)), {
          variant: 'secondary',
          width: bw,
          height: h,
          fontSize: IS_PORTRAIT ? 15 : 13,
        }),
    );
  }

  private static setToggle(buttons: UIButton[], selected: number): void {
    buttons.forEach((b, i) => b.setVariant(i === selected ? 'primary' : 'secondary'));
  }

  private buildNationTabs(): void {
    const p = LAYOUT.ships;
    const labels = PLAYABLE_NATIONS.map((n) => NATION_INFO[n].short);
    this.nationTabs = this.addToggleRow(
      p.x + PANEL_PAD,
      p.y + PANEL_HEADER_H + LAYOUT.tabH / 2,
      p.w - PANEL_PAD * 2,
      LAYOUT.tabH - 4,
      labels,
      (i) => this.selectNation(PLAYABLE_NATIONS[i]),
    );
    FleetBuilderScene.setToggle(this.nationTabs, PLAYABLE_NATIONS.indexOf(this.nation));
  }

  private buildEnemyPanel(): void {
    const p = LAYOUT.enemy;
    const h = LAYOUT.enemyButtonH;
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const rowGap = IS_PORTRAIT ? 12 : 6;
    const top = p.y + PANEL_HEADER_H + (IS_PORTRAIT ? 4 : 0);
    this.enemyNationButtons = this.addToggleRow(
      x,
      top + h / 2,
      w,
      h,
      PLAYABLE_NATIONS.map((n) => `敵 ${NATION_INFO[n].short}`),
      (i) => {
        this.enemyNation = PLAYABLE_NATIONS[i];
        this.refreshEnemyPanel();
      },
    );
    this.modeButtons = this.addToggleRow(x, top + h + rowGap + h / 2, w, h, BATTLE_MODES.map((m) => MODE_LABEL[m]), (i) => {
      this.mode = BATTLE_MODES[i];
      this.refreshEnemyPanel();
    });
    this.refreshEnemyPanel();
  }

  private refreshEnemyPanel(): void {
    FleetBuilderScene.setToggle(this.enemyNationButtons, PLAYABLE_NATIONS.indexOf(this.enemyNation));
    FleetBuilderScene.setToggle(this.modeButtons, BATTLE_MODES.indexOf(this.mode));
  }

  /** Switching nation swaps the ship list; a fleet is single-nation, so the slots are cleared. */
  private selectNation(nation: Nation): void {
    if (nation === this.nation) return;
    this.nation = nation;
    this.ships = this.shipRegistry.byNation(nation);
    this.slots = [null, null, null];
    this.page = 0;
    FleetBuilderScene.setToggle(this.nationTabs, PLAYABLE_NATIONS.indexOf(nation));
    this.rebuildShipList();
    this.refreshHeader();
    this.refresh();
  }

  private get pageCount(): number {
    return Math.max(1, Math.ceil(this.ships.length / PAGE_SIZE));
  }

  /** ‹ n / m › in the ship panel header. */
  private buildPager(): void {
    const p = LAYOUT.ships;
    const bw = IS_PORTRAIT ? 64 : 40;
    const bh = IS_PORTRAIT ? 52 : 32;
    const cy = p.y + (IS_PORTRAIT ? 42 : 32);
    const right = p.x + p.w - PANEL_PAD - bw / 2;
    const opts = { variant: 'secondary' as const, width: bw, height: bh, fontSize: 18 };
    const next = new UIButton(this, right, cy, '›', this.onTap(() => this.turnPage(1)), opts);
    this.pageText = this.add.text(right - bw / 2 - (IS_PORTRAIT ? 52 : 36), cy, '', textStyle(13, Css.muted, { fontStyle: 'bold' })).setOrigin(0.5);
    const prev = new UIButton(this, right - bw - (IS_PORTRAIT ? 104 : 72), cy, '‹', this.onTap(() => this.turnPage(-1)), opts);
    this.pageButtons = [prev, next];
    this.refreshPager();
  }

  private refreshPager(): void {
    this.pageText.setText(`${this.page + 1} / ${this.pageCount}`);
    this.pageButtons[0].setEnabled(this.page > 0);
    this.pageButtons[1].setEnabled(this.page < this.pageCount - 1);
  }

  private turnPage(step: number): void {
    const page = Math.min(this.pageCount - 1, Math.max(0, this.page + step));
    if (page === this.page) return;
    this.page = page;
    this.rebuildShipList();
  }

  private rebuildShipList(): void {
    for (const card of this.shipCards) card.destroy();
    this.shipCards = [];
    this.buildShipList();
    this.refreshPager();
  }

  /** Keeps objects in place while the portrait page scrolls underneath them. */
  private pin(objects: Phaser.GameObjects.GameObject[], depth: number): void {
    for (const o of objects) {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
    }
  }

  private buildPanelFrame(p: { x: number; y: number; w: number; h: number }, eyebrow: string, title: string): void {
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, eyebrow, eyebrowStyle(11));
    this.add.text(p.x + 22, p.y + (IS_PORTRAIT ? 46 : 34), title, textStyle(15, Css.text, { fontStyle: 'bold' }));
  }

  /** Rotates a bow-up ship sprite to lie bow-right and scales it to fit `maxLen`. */
  private addShipIcon(x: number, y: number, key: string, maxLen: number, maxScale: number): Phaser.GameObjects.Image {
    const icon = this.add.image(x, y, key).setAngle(90);
    return icon.setScale(Math.min(maxScale, maxLen / Math.max(1, icon.height)));
  }

  private buildShipList(): void {
    const p = LAYOUT.ships;
    const itemH = LAYOUT.shipItemH;
    const startY = p.y + PANEL_HEADER_H + LAYOUT.tabH + (IS_PORTRAIT ? 12 : 6);
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;
    const statX = IS_PORTRAIT ? 100 : 74;
    const plusR = IS_PORTRAIT ? 26 : 17;
    const statSpacing = (w - statX - plusR * 2 - 30) / 3;

    this.ships.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).forEach((ship, i) => {
      const y = startY + i * (itemH + ITEM_GAP);
      const bg = drawPanel(this.add.graphics(), 0, 0, w, itemH, { radius: 16, fill: Colors.panelHi, fillAlpha: 0.55 });
      const hover = this.add.graphics();
      drawPanel(hover, 0, 0, w, itemH, { radius: 16, fill: Colors.cyan, fillAlpha: 0.08, rimAlpha: 0.7 });
      hover.setVisible(false);

      const icon = this.addShipIcon(statX / 2, itemH / 2, ship.spriteKey, statX - 20, 1.2);
      const name = this.add.text(statX, itemH * 0.12, ship.name, textStyle(15, Css.text, { fontStyle: 'bold' }));
      const badgeInfo = CLASS_BADGE[ship.shipClass] ?? CLASS_BADGE[ShipClass.Cruiser];
      const badge = addChip(this, 0, name.y + name.height / 2, badgeInfo.label, badgeInfo.color, badgeInfo.css);
      // Long names drop their English part so the class badge clears the + button.
      const nameRoom = w - statX - plusR * 2 - 30 - badge.getBounds().width - 10;
      fitName(name, ship.name, nameRoom);
      badge.setX(statX + name.displayWidth + 10);

      const meters = this.add.graphics();
      const stats: Array<[string, number, number, number]> = [
        ['HP', ship.hp, this.maxStats.hp, Colors.success],
        ['ARM', ship.armor, this.maxStats.armor, Colors.gold],
        ['SPD', ship.speed, this.maxStats.speed, Colors.cyan],
      ];
      const statLabels: Phaser.GameObjects.Text[] = [];
      stats.forEach(([label, value, max, color], si) => {
        const mx = statX + si * statSpacing;
        statLabels.push(this.add.text(mx, itemH * 0.5, `${label} ${value}`, textStyle(11, Css.muted)));
        drawMeter(meters, mx, itemH * 0.8, statSpacing - 12, IS_PORTRAIT ? 8 : 5, value / max, color);
      });

      const plus = this.add.graphics();
      plus.fillStyle(Colors.cyan, 0.15);
      const plusX = w - plusR - 13;
      plus.fillCircle(plusX, itemH / 2, plusR);
      plus.lineStyle(1.5, Colors.cyan, 0.7);
      plus.strokeCircle(plusX, itemH / 2, plusR);
      const plusLabel = this.add.text(plusX, itemH / 2 - 1, '+', textStyle(22, Css.cyan, { fontStyle: 'bold' })).setOrigin(0.5);

      const card = this.add.container(x, y, [bg, hover, icon, name, badge, meters, ...statLabels, plus, plusLabel]);
      makeClickable(card, w, itemH);
      card.on('pointerover', () => hover.setVisible(true));
      card.on('pointerout', () => hover.setVisible(false));
      card.on('pointerup', this.onTap(() => this.addShipToFleet(ship)));
      this.shipCards.push(card);
    });
  }

  private buildSlotPanel(): void {
    const p = LAYOUT.fleet;
    const slotH = LAYOUT.slotH;
    const startY = p.y + PANEL_HEADER_H + 4;
    const x = p.x + PANEL_PAD;
    const w = p.w - PANEL_PAD * 2;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = startY + i * (slotH + CARD_GAP);
      const frame = this.add.graphics().setPosition(x, y);
      const emptyLabel = this.add
        .text(x + w / 2, y + slotH / 2 + 10, IS_PORTRAIT ? '↓ 下の一覧から艦を追加' : '← 左の一覧から艦を追加', textStyle(14, Css.dim))
        .setOrigin(0.5);
      const role = i === 0 ? 'FLAGSHIP · 旗艦' : `ESCORT ${i} · 護衛`;
      this.add.text(x + 18, y + (IS_PORTRAIT ? 12 : 16), role, eyebrowStyle(10, i === 0 ? Css.gold : Css.cyan));
      this.slotViews.push({ frame, content: null, emptyLabel });
    }
  }

  private formationCardRect(i: number): IRect {
    const p = LAYOUT.formations;
    const top = p.y + PANEL_HEADER_H + 4;
    const inner = p.w - PANEL_PAD * 2;
    const h = LAYOUT.formationCardH;
    if (LAYOUT.formationFlow === 'row') {
      const w = (inner - CARD_GAP * (FORMATION_LIST.length - 1)) / FORMATION_LIST.length;
      return { x: p.x + PANEL_PAD + i * (w + CARD_GAP), y: top, w, h };
    }
    return { x: p.x + PANEL_PAD, y: top + i * (h + CARD_GAP), w: inner, h };
  }

  private buildFormationPanel(): void {
    FORMATION_LIST.forEach((formation, i) => {
      const r = this.formationCardRect(i);
      const compact = r.w < 260;
      const info = FORMATION_INFO[formation];
      const frame = this.add.graphics();
      this.formationFrames.push(frame);

      const parts: Phaser.GameObjects.GameObject[] = [
        frame,
        this.add.text(18, IS_PORTRAIT ? 18 : 10, info.ja, displayStyle(24)),
        this.add.text(18, IS_PORTRAIT ? 66 : 46, info.en, eyebrowStyle(10, Css.muted)),
      ];
      if (!compact) {
        parts.push(this.add.text(18, IS_PORTRAIT ? 84 : 62, info.desc, textStyle(12, Css.muted, { wordWrap: { width: r.w - 150, useAdvancedWrap: true } })));
      }
      const diagram = this.add.graphics();
      if (compact) {
        this.drawFormationDiagram(diagram, formation, r.w / 2, r.h - 50, 0.75);
      } else {
        this.drawFormationDiagram(diagram, formation, r.w - 60, r.h / 2, Math.min(1, (r.h - 12) / 100));
      }
      parts.push(diagram);

      const card = this.add.container(r.x, r.y, parts);
      makeClickable(card, r.w, r.h);
      card.on('pointerup', this.onTap(() => this.selectFormation(formation)));
    });
  }

  private drawFormationDiagram(g: Phaser.GameObjects.Graphics, formation: Formation, cx: number, cy: number, k: number): void {
    g.fillStyle(Colors.cyan, 0.06);
    g.fillCircle(cx, cy, 50 * k);
    g.lineStyle(1, Colors.cyan, 0.2);
    g.strokeCircle(cx, cy, 50 * k);

    const ship = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx + (dx - 5) * k, cy + (dy - 12) * k, 10 * k, 24 * k, 5 * k);
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
    const f = LAYOUT.footer;
    const onStart = this.onTap(() => {
      if (this.canStart()) this.startBattle();
    });
    const btn = { variant: 'gold' as const, fontSize: 22, caption: 'START BATTLE' };

    if (IS_PORTRAIT) {
      // Fixed bar: count + summary on one line, full-width deploy button below.
      const bar = this.add
        .rectangle(0, CANVAS_H - FOOTER_BAR_H, CANVAS_W, FOOTER_BAR_H, Colors.bgDeep, 0.94)
        .setOrigin(0, 0)
        .setInteractive();
      const panel = addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
      this.countText = this.add.text(f.x + 24, f.y + 12, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
      this.summaryText = this.add.text(f.x + f.w - 24, f.y + 20, '', textStyle(14, Css.muted)).setOrigin(1, 0);
      this.startBtn = new UIButton(this, CANVAS_W / 2, f.y + f.h - 46, '出撃  ▶', onStart, { ...btn, width: f.w - 32, height: 76 });
      this.pin([bar, panel, this.countText, this.summaryText, this.startBtn], 60);
      return;
    }

    addPanel(this, f.x, f.y, f.w, f.h, { radius: 24, fillAlpha: 0.6 });
    this.add.text(f.x + 28, f.y + 22, 'FLEET SUMMARY', eyebrowStyle(10, Css.muted));
    this.countText = this.add.text(f.x + 28, f.y + 42, '', textStyle(22, Css.text, { fontStyle: 'bold' }));
    this.summaryText = this.add.text(f.x + 176, f.y + 49, '', textStyle(14, Css.muted));
    this.startBtn = new UIButton(this, f.x + f.w - 172, f.y + f.h / 2, '出撃  ▶', onStart, { ...btn, width: 300, height: 60 });
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
    const w = LAYOUT.fleet.w - PANEL_PAD * 2;
    const h = LAYOUT.slotH;
    const compact = IS_PORTRAIT;

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

      const nameX = compact ? 124 : 100;
      const nameText = this.add.text(nameX, compact ? h * 0.3 : 44, ship.name, textStyle(18, Css.text, { fontStyle: 'bold' }));
      // Leave room for the remove button on the right.
      fitName(nameText, ship.name, w - nameX - (compact ? 84 : 64));
      const parts: Phaser.GameObjects.GameObject[] = compact
        ? [
            this.addShipIcon(62, h * 0.6, ship.spriteKey, 88, 1.3),
            nameText,
            this.add.text(124, h * 0.64, `HP ${ship.hp}   装甲 ${ship.armor}   速力 ${ship.speed}`, textStyle(13, Css.muted)),
          ]
        : [
            this.addShipIcon(54, 78, ship.spriteKey, 76, 1.3),
            nameText,
            this.add.text(100, 74, `HP ${ship.hp}   装甲 ${ship.armor}   速力 ${ship.speed}`, textStyle(13, Css.muted)),
            this.add.text(100, 98, ship.weapons.join(' · '), textStyle(11, Css.dim)),
          ];

      const remove = new UIButton(this, compact ? w - 44 : w - 34, compact ? h / 2 : 30, '✕', this.onTap(() => this.removeShipFromSlot(i)), {
        variant: 'secondary',
        width: compact ? 60 : 40,
        height: compact ? 56 : 36,
        fontSize: 15,
      });

      const frameX = view.frame.x;
      const frameY = view.frame.y;
      view.content = this.add.container(frameX, frameY, [...parts, remove]);
    });
  }

  private refreshFormations(): void {
    FORMATION_LIST.forEach((f, i) => {
      const { w, h } = this.formationCardRect(i);
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
      this.summaryText.setText(IS_PORTRAIT ? '艦を選ぶと出撃できます' : '艦を 1 隻以上選ぶと出撃できます');
    } else {
      const totalHp = ships.reduce((sum, s) => sum + s.hp, 0);
      const minSpeed = Math.min(...ships.map((s) => s.speed));
      const formation = FORMATION_INFO[this.formation].ja;
      this.summaryText.setText(
        IS_PORTRAIT
          ? `耐久 ${totalHp} · 速力 ${minSpeed} · ${formation}`
          : `総耐久 ${totalHp}   艦隊速力 ${minSpeed}   陣形 ${formation}`,
      );
    }
    this.startBtn.setEnabled(this.canStart());
  }

  private canStart(): boolean {
    return this.slots.some((s) => s !== null);
  }

  private startBattle(): void {
    const selection: ISelection = {
      nation: this.nation,
      enemyNation: this.enemyNation,
      mode: this.mode,
      formation: this.formation,
      slotIds: this.slots.map((s) => s?.id ?? null),
    };
    this.registry.set(SELECTION_KEY, selection);
    const flagshipIndex = this.slots.findIndex((s) => s !== null);

    const playerFleet = FleetSystem.createFleet(
      'player-fleet',
      '第一艦隊',
      this.nation,
      this.slots,
      flagshipIndex,
    );

    const enemyFleet = FleetSystem.createFleet(
      'enemy-fleet',
      'Enemy Fleet',
      this.enemyNation,
      generateEnemyFleet(this.shipRegistry, this.enemyNation, this.mode),
      0,
    );

    const initData: IBattleInitData = {
      playerFleet,
      enemyFleet,
      mapKey: '',
      formation: this.formation,
      mode: this.mode,
    };

    this.scene.start(SceneKeys.BATTLE, initData);
  }
}
