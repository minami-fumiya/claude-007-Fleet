import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { ISelection, SELECTION_KEY } from '@/scenes/FleetBuilderScene';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { applyToStats, applyToWeapons, toggleUpgrade, upgradeModifiers, UPGRADE_SLOTS } from '@/systems/CustomizationSystem';
import { primaryWeapon, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { IShipData, IShipStats } from '@/types/Ship';
import { IUpgradeData } from '@/types/Modifiers';
import { IWeaponData } from '@/types/Weapon';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

interface IRect { x: number; y: number; w: number; h: number }

/** Landscape: tabs on top, stats on the left, upgrade cards in a 2-column grid. Portrait: stacked. */
const L = IS_PORTRAIT
  ? {
      tabsY: 170, tabH: 60,
      stats: { x: 16, y: 220, w: CANVAS_W - 32, h: 320 } as IRect,
      grid: { x: 16, y: 560, w: CANVAS_W - 32 } as { x: number; y: number; w: number },
      cols: 1, cardH: 76, gap: 6,
    }
  : {
      tabsY: 118, tabH: 44,
      stats: { x: 24, y: 160, w: 400, h: 440 } as IRect,
      grid: { x: 444, y: 160, w: 812 } as { x: number; y: number; w: number },
      cols: 2, cardH: 100, gap: 10,
    };

/**
 * 改装: fit up to UPGRADE_SLOTS upgrades to each ship of the current fleet. Fitted upgrades are
 * saved with the player's progress and applied at battle start.
 */
export class CustomizationScene extends Phaser.Scene {
  private ships: IShipData[] = [];
  private selected = 0;
  private catalog: IUpgradeData[] = [];
  private tabs: UIButton[] = [];
  private cardFrames: Phaser.GameObjects.Graphics[] = [];
  private cardMarks: Phaser.GameObjects.Text[] = [];
  private statsText: Phaser.GameObjects.Text[] = [];
  private slotText!: Phaser.GameObjects.Text;
  private shipName!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.CUSTOMIZATION });
  }

  create(): void {
    const selection = this.registry.get(SELECTION_KEY) as ISelection | undefined;
    const registry = DataLoader.getRegistry(this);
    this.ships = (selection?.slotIds ?? [])
      .map((id) => (id ? registry.byId(id) : undefined))
      .filter((s): s is IShipData => s !== undefined);
    this.catalog = DataLoader.getUpgrades(this);
    this.selected = 0;
    this.tabs = [];
    this.cardFrames = [];
    this.cardMarks = [];
    this.statsText = [];

    addBackdrop(this, 'menu');
    this.buildHeader();
    if (this.ships.length === 0) {
      this.add
        .text(CANVAS_W / 2, IS_PORTRAIT ? 400 : 320, '艦隊に艦を追加すると改装できます', textStyle(18, Css.muted, { fontStyle: 'bold' }))
        .setOrigin(0.5);
      return;
    }
    this.buildTabs();
    this.buildStatsPanel();
    this.buildCards();
    this.refresh();
  }

  private buildHeader(): void {
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  編成へ', () => this.scene.start(SceneKeys.FLEET_BUILDER), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'REFIT', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '改装 — 装備を換装せよ', displayStyle(24)).setOrigin(0.5);
  }

  private buildTabs(): void {
    const x0 = L.stats.x;
    const w = CANVAS_W - x0 * 2;
    const gap = 8;
    const bw = Math.floor((w - gap * (this.ships.length - 1)) / this.ships.length);
    this.tabs = this.ships.map((ship, i) => {
      const short = ship.name.replace(/\s*\(.*\)\s*$/, '');
      return new UIButton(this, x0 + i * (bw + gap) + bw / 2, L.tabsY, short, () => {
        this.selected = i;
        this.refresh();
      }, { variant: 'secondary', width: bw, height: L.tabH - 6, fontSize: 14 });
    });
  }

  private buildStatsPanel(): void {
    const p = L.stats;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, 'SHIP STATUS', eyebrowStyle(11));
    this.shipName = this.add.text(p.x + 22, p.y + (IS_PORTRAIT ? 46 : 36), '', textStyle(17, Css.text, { fontStyle: 'bold' }));
    this.slotText = this.add.text(p.x + p.w - 22, p.y + 18, '', eyebrowStyle(11, Css.gold)).setOrigin(1, 0);
    const rows = 6;
    const top = p.y + (IS_PORTRAIT ? 96 : 84);
    const rowH = (p.h - (top - p.y) - 18) / rows;
    for (let i = 0; i < rows; i++) {
      this.statsText.push(this.add.text(p.x + 22, top + i * rowH, '', textStyle(14, Css.muted)));
    }
  }

  private cardRect(i: number): IRect {
    const cw = (L.grid.w - L.gap * (L.cols - 1)) / L.cols;
    const col = i % L.cols;
    const row = Math.floor(i / L.cols);
    return { x: L.grid.x + col * (cw + L.gap), y: L.grid.y + row * (L.cardH + L.gap), w: cw, h: L.cardH };
  }

  private buildCards(): void {
    this.catalog.forEach((u, i) => {
      const r = this.cardRect(i);
      const frame = this.add.graphics();
      const mark = this.add.text(r.w - 20, r.h / 2, '', textStyle(18, Css.cyan, { fontStyle: 'bold' })).setOrigin(1, 0.5);
      const name = this.add.text(18, IS_PORTRAIT ? 12 : 18, u.name, textStyle(16, Css.text, { fontStyle: 'bold' }));
      const desc = this.add.text(18, IS_PORTRAIT ? 44 : 54, u.description, textStyle(12, Css.muted));
      const card = this.add.container(r.x, r.y, [frame, name, desc, mark]);
      makeClickable(card, r.w, r.h);
      card.on('pointerup', () => this.toggle(u.id));
      this.cardFrames.push(frame);
      this.cardMarks.push(mark);
    });
  }

  private fitted(): string[] {
    return loadProgress().upgrades[this.ships[this.selected].id] ?? [];
  }

  private toggle(upgradeId: string): void {
    const ship = this.ships[this.selected];
    const progress = loadProgress();
    const next = toggleUpgrade(progress.upgrades[ship.id] ?? [], upgradeId);
    saveProgress({ ...progress, upgrades: { ...progress.upgrades, [ship.id]: next } });
    this.refresh();
  }

  private refresh(): void {
    this.tabs.forEach((t, i) => t.setVariant(i === this.selected ? 'primary' : 'secondary'));
    const fitted = this.fitted();
    this.catalog.forEach((u, i) => {
      const r = this.cardRect(i);
      const on = fitted.includes(u.id);
      const full = !on && fitted.length >= UPGRADE_SLOTS;
      this.cardFrames[i].clear();
      drawPanel(this.cardFrames[i], 0, 0, r.w, r.h, {
        radius: 16,
        fill: on ? Colors.panelHi : Colors.panel,
        fillAlpha: on ? 0.9 : 0.5,
        rimAlpha: on ? 0.85 : 0.2,
        glow: on ? 1 : 0,
      });
      this.cardMarks[i].setText(on ? '装備中' : full ? '—' : '+').setColor(on ? Css.gold : Css.cyan);
    });
    this.refreshStats(fitted);
  }

  private refreshStats(fitted: string[]): void {
    const ship = this.ships[this.selected];
    const loadout = ship.weapons
      .map((id) => DataLoader.getWeaponById(this, id))
      .filter((w): w is IWeaponData => w !== undefined);
    const base: IShipStats = {
      name: ship.name,
      maxHp: ship.hp,
      currentHp: ship.hp,
      armor: ship.armor,
      speed: ship.speed,
      firePower: 0,
      shipClass: ship.shipClass,
    };
    const mods = upgradeModifiers(fitted, this.catalog);
    const after = applyToStats(base, mods);
    const weaponsAfter = applyToWeapons(loadout, mods);
    const gunBefore = primaryWeapon(loadout.filter((w) => weaponKind(w) === WeaponKind.Gun));
    const gunAfter = primaryWeapon(weaponsAfter.filter((w) => weaponKind(w) === WeaponKind.Gun));
    const torpBefore = loadout.find((w) => weaponKind(w) === WeaponKind.Torpedo);
    const torpAfter = weaponsAfter.find((w) => weaponKind(w) === WeaponKind.Torpedo);

    const line = (label: string, a: number | undefined, b: number | undefined, lowerIsBetter = false): string => {
      if (a === undefined || b === undefined) return `${label}   —`;
      const ra = Math.round(a);
      const rb = Math.round(b);
      if (ra === rb) return `${label}   ${ra}`;
      const better = lowerIsBetter ? rb < ra : rb > ra;
      return `${label}   ${ra}  →  ${rb}  ${better ? '▲' : '▼'}`;
    };
    const lines = [
      line('耐久', base.maxHp, after.maxHp),
      line('装甲', base.armor, after.armor),
      line('速力', base.speed, after.speed),
      line('砲火力', gunBefore?.firePower, gunAfter?.firePower),
      line('砲装填 (ms)', gunBefore?.reloadTime, gunAfter?.reloadTime, true),
      line('魚雷火力', torpBefore?.firePower, torpAfter?.firePower),
    ];
    const extras: string[] = [];
    if (mods.visionMul !== 1) extras.push(`視界 ×${mods.visionMul.toFixed(2)}`);
    if (mods.aaMul !== 1) extras.push(`対空 ×${mods.aaMul.toFixed(2)}`);
    if (extras.length > 0) lines[5] = `${lines[5]}     ${extras.join('  ')}`;
    this.statsText.forEach((t, i) => t.setText(lines[i] ?? '').setColor(lines[i]?.includes('→') ? Css.text : Css.muted));
    this.shipName.setText(ship.name);
    this.slotText.setText(`装備 ${fitted.length} / ${UPGRADE_SLOTS}`);
  }
}
