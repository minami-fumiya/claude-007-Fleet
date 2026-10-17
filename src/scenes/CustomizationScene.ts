import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { ISelection, SELECTION_KEY } from '@/scenes/FleetBuilderScene';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { applyToStats, applyToWeapons, combineModifiers, toggleUpgrade, upgradeModifiers, UPGRADE_SLOTS } from '@/systems/CustomizationSystem';
import { primaryWeapon, weaponKind, WeaponKind } from '@/systems/WeaponSelector';
import { IShipData, IShipStats } from '@/types/Ship';
import { IUpgradeData } from '@/types/Modifiers';
import { IWeaponData } from '@/types/Weapon';
import { ITechNode } from '@/types/Progression';
import { unlockedUpgrades } from '@/systems/ResearchSystem';
import techTree from '@/data/tech-tree.json';
import refitsData from '@/data/refits.json';
import { canRefit, nextStage, refit, refitModifiers, refitName, RefitTable } from '@/systems/RefitSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

interface IRect { x: number; y: number; w: number; h: number }

/** Landscape: tabs on top, stats on the left, upgrade cards in a 2-column grid. Portrait: stacked. */
/** Space at the bottom of the status panel for the remodel line and button. */
const REFIT_H = IS_PORTRAIT ? 120 : 104;

const L = IS_PORTRAIT
  ? {
      tabsY: 170, tabH: 60,
      stats: { x: 16, y: 220, w: CANVAS_W - 32, h: 410 } as IRect,
      grid: { x: 16, y: 646, w: CANVAS_W - 32 } as { x: number; y: number; w: number },
      cols: 1, cardH: 70, gap: 6,
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
  private refitText!: Phaser.GameObjects.Text;
  private refitBtn!: UIButton;
  private readonly refitTable = refitsData.classes as RefitTable;
  private readonly tech = techTree.tech as ITechNode[];
  private selected = 0;
  private catalog: IUpgradeData[] = [];
  private tabs: UIButton[] = [];
  private cardFrames: Phaser.GameObjects.Graphics[] = [];
  private cardMarks: Phaser.GameObjects.Text[] = [];
  private statsText: Phaser.GameObjects.Text[] = [];
  private slotText!: Phaser.GameObjects.Text;
  private shipName!: Phaser.GameObjects.Text;

  /** Scene the back button returns to (the Fleet Builder or the home port) */
  private returnTo: string = SceneKeys.FLEET_BUILDER;
  private unlocked = new Set<string>();

  constructor() {
    super({ key: SceneKeys.CUSTOMIZATION });
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.FLEET_BUILDER;
  }

  create(): void {
    const selection = this.registry.get(SELECTION_KEY) as ISelection | undefined;
    const registry = DataLoader.getRegistry(this);
    this.ships = (selection?.slotIds ?? [])
      .map((id) => (id ? registry.byId(id) : undefined))
      .filter((s): s is IShipData => s !== undefined);
    this.catalog = DataLoader.getUpgrades(this);
    this.unlocked = new Set(unlockedUpgrades(this.catalog, loadProgress().research).map((u) => u.id));
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
    new UIButton(this, back.x, back.y, '‹  戻る', () => this.scene.start(this.returnTo), {
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
    const rowH = (p.h - (top - p.y) - REFIT_H) / rows;
    for (let i = 0; i < rows; i++) {
      this.statsText.push(this.add.text(p.x + 22, top + i * rowH, '', textStyle(14, Css.muted)));
    }
    const ry = p.y + p.h - REFIT_H + 8;
    this.add.text(p.x + 22, ry, 'REMODEL · 改造', eyebrowStyle(10, Css.gold));
    this.refitText = this.add.text(p.x + 22, ry + (IS_PORTRAIT ? 26 : 20), '', textStyle(12, Css.muted, { wordWrap: { width: p.w - 44, useAdvancedWrap: true } }));
    this.refitBtn = new UIButton(this, p.x + p.w / 2, p.y + p.h - (IS_PORTRAIT ? 34 : 28), '改造', () => this.remodel(), {
      variant: 'gold', width: p.w - 44, height: IS_PORTRAIT ? 48 : 36, fontSize: 14,
    });
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
    if (!this.unlocked.has(upgradeId)) return;
    const ship = this.ships[this.selected];
    const progress = loadProgress();
    const next = toggleUpgrade(progress.upgrades[ship.id] ?? [], upgradeId);
    saveProgress({ ...progress, upgrades: { ...progress.upgrades, [ship.id]: next } });
    this.refresh();
  }

  private remodel(): void {
    const ship = this.ships[this.selected];
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    const r = refit(this.refitTable, ship.shipClass, stage, progress.proficiency[ship.id] ?? 0, progress.resources);
    if (!r) return;
    saveProgress({ ...progress, resources: r.resources, refits: { ...progress.refits, [ship.id]: r.stage } });
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
      const locked = !this.unlocked.has(u.id);
      const required = this.tech.find((t) => t.id === u.requires)?.name ?? '';
      this.cardMarks[i]
        .setText(on ? '装備中' : locked ? `要研究: ${required}` : full ? '—' : '+')
        .setColor(on ? Css.gold : locked ? Css.dim : Css.cyan)
        .setFontSize(locked ? 12 : 18);
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
    const progress = loadProgress();
    const stage = progress.refits[ship.id] ?? 0;
    const mods = combineModifiers(upgradeModifiers(fitted, this.catalog), refitModifiers(this.refitTable, ship.shipClass, stage));
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
    this.shipName.setText(refitName(this.refitTable, ship.name, ship.shipClass, stage));
    const next = nextStage(this.refitTable, ship.shipClass, stage);
    const prof = progress.proficiency[ship.id] ?? 0;
    if (!next) {
      this.refitText.setText('改造完了 (最終段階)');
      this.refitBtn.setLabel('改造完了').setEnabled(false);
    } else {
      this.refitText.setText(`次: ${next.suffix}  ·  熟練 ${prof} / ${next.minProficiency}  ·  ${formatResources(next.cost)}`);
      this.refitBtn.setLabel(`${next.suffix} に改造`).setEnabled(canRefit(this.refitTable, ship.shipClass, stage, prof, progress.resources));
    }
    this.slotText.setText(`装備 ${fitted.length} / ${UPGRADE_SLOTS}`);
  }
}
