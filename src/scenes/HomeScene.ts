import Phaser from 'phaser';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { isStarted, loadProgress, loadSave, saveProgress, saveSave, switchNation } from '@/utils/ProgressStore';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { Nation } from '@/types/Nation';
import { nextRegenMs, REGEN_CAP, REGEN_PER_TICK, regenFull } from '@/systems/ResourceSystem';
import { clearCount, fleetSlots, promotionText, rankOf } from '@/systems/RankSystem';
import { ownedIds, starterShip } from '@/systems/ShipyardSystem';
import { buildDock, completeRepairs, dockCount, FAST_REPAIR_COST, nextDock, hpFraction, isDocked, repairCost, repairTimeMs, startRepair, fastRepair } from '@/systems/DockSystem';
import { canAfford, formatResources, pay } from '@/systems/ResourceSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { IShipData } from '@/types/Ship';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { CAMPAIGN_AREA_KEY } from '@/scenes/CampaignMapScene';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? {
      resources: { x: 16, y: 150, w: CANVAS_W - 32 } as { x: number; y: number; w: number },
      resourceCols: 2,
      /** Nation switch button + rank / promotion / regeneration lines */
      admiral: { x: 16, y: 272, w: CANVAS_W - 32, h: 90 } as IRect,
      menu: { x: 16, y: 374, w: CANVAS_W - 32, h: 196 } as IRect,
      menuCols: 4,
      dock: { x: 16, y: 584, w: CANVAS_W - 32, h: CANVAS_H - 600 } as IRect,
      rowH: 92,
    }
  : {
      resources: { x: 444, y: 96, w: 812 } as { x: number; y: number; w: number },
      resourceCols: 4,
      admiral: { x: 444, y: 158, w: 812, h: 48 } as IRect,
      menu: { x: 24, y: 96, w: 400, h: 600 } as IRect,
      menuCols: 1,
      dock: { x: 444, y: 216, w: 812, h: 480 } as IRect,
      rowH: 62,
    };

const MENU: Array<{ label: string; caption: string; scene: string; variant: 'gold' | 'primary' | 'secondary'; data?: object }> = [
  { label: '作戦', caption: '', scene: SceneKeys.CAMPAIGN, variant: 'gold' },
  { label: '演習', caption: '', scene: SceneKeys.FLEET_BUILDER, variant: 'primary' },
  // Straight to the fleet (#77): fleet only, then on to 作戦 or 演習 (#109). The fleet is kept between visits.
  { label: '編成', caption: '', scene: SceneKeys.FLEET_BUILDER, variant: 'secondary', data: { organize: true } },
  { label: '史実', caption: '', scene: SceneKeys.SCENARIO, variant: 'primary' },
  { label: '工廠', caption: '', scene: SceneKeys.ARSENAL, variant: 'secondary' },
  { label: '改装', caption: '', scene: SceneKeys.CUSTOMIZATION, variant: 'secondary' },
  { label: '図鑑', caption: '', scene: SceneKeys.ENCYCLOPEDIA, variant: 'secondary' },
  { label: '戦績', caption: '', scene: SceneKeys.RECORD, variant: 'secondary' },
];
const MAX_DAMAGED_ROWS = IS_PORTRAIT ? 5 : 4;
/** Progress bar offset below a dock row's ship name; portrait text is taller, so the bar sits lower. */
const DOCK_METER_Y = IS_PORTRAIT ? 36 : 18;
/** Overlay (nation picker) draws above everything else on the screen. */
const OVERLAY_DEPTH = 200;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 鎮守府: the home port hub. Shows resources, opens the sortie / arsenal / refit screens and runs the
 * docks, where damaged ships are repaired in real time (two at once) or instantly for a fee.
 */
export class HomeScene extends Phaser.Scene {
  private registryShips!: ShipRegistry;
  private bar!: ResourceBar;
  /** Dynamic dock / damage list objects, rebuilt on every change */
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private dockMeters: Array<{ g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; x: number; y: number; w: number; ship: IShipData; total: number; endsAt: number }> = [];
  private regenText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.HOME });
  }

  create(): void {
    // First-play tutorial (#90): drawn above the screen, so it can be made first.
    new TutorialGuide(this);
    audio.music('menu');
    this.registryShips = DataLoader.getRegistry(this);
    this.dynamic = [];
    this.dockMeters = [];
    this.overlay = [];
    addBackdrop(this, 'menu');
    const save = loadSave();
    const started = isStarted(save, save.current);

    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    // Portrait: the corner buttons take the right side, so the eyebrow sits left of centre.
    const corner = IS_PORTRAIT ? { w: 100, h: 60, y: 46 } : { w: 120, h: 44, y: 44 };
    new UIButton(this, CANVAS_W - 16 - corner.w / 2, corner.y, '設定', () => this.scene.start(SceneKeys.SETTINGS, { returnTo: SceneKeys.HOME }), {
      variant: 'secondary', width: corner.w, height: corner.h, fontSize: 15,
    });
    new UIButton(this, CANVAS_W - 26 - corner.w * 1.5, corner.y, 'ヘルプ', () => this.scene.start(SceneKeys.HELP), {
      variant: 'secondary', width: corner.w, height: corner.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, `${NATION_INFO[save.current].jaShort} 鎮守府 — 艦隊司令部`, displayStyle(24)).setOrigin(0.5);

    this.bar = new ResourceBar(this, L.resources.x, L.resources.y, L.resources.w, L.resourceCols);
    this.buildAdmiral(save.current);
    this.buildMenu();
    addPanel(this, L.dock.x, L.dock.y, L.dock.w, L.dock.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(L.dock.x + 22, L.dock.y + (IS_PORTRAIT ? 30 : 22), '入渠 — 損傷艦の修理', textStyle(15, Css.text, { fontStyle: 'bold' }));
    this.refresh();
    // A brand-new save has no nation yet: pick one first (#27).
    if (!started) this.openNationPicker(false);
  }

  /** Nation switch button, rank and next promotion (#30), natural regeneration (#28). */
  private buildAdmiral(nation: Nation): void {
    const a = L.admiral;
    const progress = loadProgress();
    const rank = rankOf(progress);
    const bw = IS_PORTRAIT ? 200 : 170;
    new UIButton(this, a.x + bw / 2, a.y + a.h / 2, `${NATION_INFO[nation].jaShort}  ▸ 切替`, () => this.openNationPicker(true), {
      variant: 'primary', width: bw, height: IS_PORTRAIT ? 58 : 40, fontSize: 15,
    });
    const x = a.x + bw + 16;
    // Portrait: rank and next promotion on separate lines (one line would run off the narrow screen).
    const rankLine = `${rank.name}  ·  出撃枠 ${fleetSlots(progress)}`;
    if (IS_PORTRAIT) {
      this.add.text(x, a.y, rankLine, textStyle(12, Css.gold, { fontStyle: 'bold' }));
      this.add.text(x, a.y + a.h / 2, promotionText(progress), textStyle(11, Css.text)).setOrigin(0, 0.5);
    } else {
      this.add.text(x, a.y + 2, `${rankLine}  ·  ${promotionText(progress)}`, textStyle(12, Css.gold, { fontStyle: 'bold' }));
    }
    this.regenText = this.add.text(x, a.y + a.h - 2, '', textStyle(11, Css.muted)).setOrigin(0, 1);
  }

  private refreshRegen(now: number): void {
    const progress = loadProgress();
    this.bar.refresh(progress.resources);
    // Each resource regenerates at its own rate (0.0.12: fuel fastest).
    const r = REGEN_PER_TICK;
    const rate = IS_PORTRAIT
      ? `自然回復/分 燃${r.fuel} 弾${r.ammo} 鋼${r.steel} ボ${r.bauxite}・上限 ${REGEN_CAP}`
      : `自然回復/分 燃料 +${r.fuel} 弾薬 +${r.ammo} 鋼材 +${r.steel} ボーキ +${r.bauxite}・上限 ${REGEN_CAP}`;
    this.regenText.setText(regenFull(progress.resources) ? `${rate}  ·  上限に到達` : `${rate}  ·  次 ${clock(nextRegenMs(progress.regenAt, now))}`);
  }

  /** Lists every playable nation; picking one switches the base (a new nation starts with one destroyer). */
  private openNationPicker(closable: boolean): void {
    if (this.overlay.length > 0) return;
    const save = loadSave();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(OVERLAY_DEPTH);
      this.overlay.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const rowH = IS_PORTRAIT ? 84 : 52;
    const gap = IS_PORTRAIT ? 12 : 8;
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 620;
    const h = (IS_PORTRAIT ? 230 : 150) + PLAYABLE_NATIONS.length * (rowH + gap) + (closable ? rowH : 0);
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(20, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.95, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '国を選択', eyebrowStyle(11)));
    add(this.add.text(x + 28, y + (IS_PORTRAIT ? 52 : 42), closable ? '鎮守府を切り替える' : '着任する国を選んでください', displayStyle(22)));
    add(this.add.text(x + 28, y + (IS_PORTRAIT ? 104 : 80), '国ごとに資源・保有艦・研究・作戦の進み具合が別々に記録されます。\n新しい国は駆逐艦 1 隻・資源 0 から始まり、資源は時間で回復します。', textStyle(12, Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    let ry = y + (IS_PORTRAIT ? 210 : 136);
    for (const n of PLAYABLE_NATIONS) {
      const np = save.nations[n];
      const label = np
        ? `${NATION_INFO[n].jaShort}   ${rankOf(np).name} · 攻略 ${clearCount(np)} · 保有艦 ${ownedIds(np, this.registryShips.byNation(n)).length}`
        : `${NATION_INFO[n].jaShort}   新規着任`;
      add(new UIButton(this, x + w / 2, ry + rowH / 2, label, () => this.selectNation(n), {
        variant: n === save.current && np ? 'gold' : np ? 'primary' : 'secondary', width: w - 56, height: rowH, fontSize: 16,
      }));
      ry += rowH + gap;
    }
    if (closable) {
      add(new UIButton(this, x + w / 2, ry + rowH / 2, '閉じる', () => this.closeNationPicker(), {
        variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: rowH - 8, fontSize: 15,
      }));
    }
  }

  private closeNationPicker(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  private selectNation(nation: Nation): void {
    const starter = starterShip(this.registryShips.byNation(nation));
    saveSave(switchNation(loadSave(), nation, starter?.id, Date.now()));
    // The fleet selection belongs to the previous nation.
    this.registry.remove(CAMPAIGN_AREA_KEY);
    this.scene.restart();
  }

  update(): void {
    const now = Date.now();
    // Nothing runs until a nation is picked.
    const save = loadSave();
    if (!isStarted(save, save.current)) return;
    this.refreshRegen(now);
    const progress = loadProgress();
    const done = completeRepairs(progress, now);
    if (done !== progress) {
      saveProgress({ ...progress, ...done });
      this.refresh();
      return;
    }
    for (const m of this.dockMeters) {
      const left = m.endsAt - now;
      m.g.clear();
      drawMeter(m.g, m.x, m.y, m.w, 8, m.total > 0 ? 1 - left / m.total : 1, Colors.cyan);
      m.t.setText(`残り ${clock(left)}`);
    }
  }

  private buildMenu(): void {
    const m = L.menu;
    const gap = 14;
    const cols = L.menuCols;
    const rows = Math.ceil(MENU.length / cols);
    const cw = (m.w - gap * (cols - 1)) / cols;
    const ch = (m.h - gap * (rows - 1)) / rows;
    MENU.forEach((item, i) => {
      const r = { w: cw, h: ch, x: m.x + (i % cols) * (cw + gap), y: m.y + Math.floor(i / cols) * (ch + gap) };
      new UIButton(this, r.x + r.w / 2, r.y + r.h / 2, item.label, () => {
        // Free battles are not campaign sorties.
        if (item.scene === SceneKeys.FLEET_BUILDER) this.registry.remove(CAMPAIGN_AREA_KEY);
        this.scene.start(item.scene, { returnTo: SceneKeys.HOME, ...item.data });
      }, {
        variant: item.variant,
        width: r.w,
        height: r.h,
        fontSize: IS_PORTRAIT ? 20 : 26,
        caption: item.caption,
      });
    });
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    this.dockMeters = [];
    const progress = { ...loadProgress(), ...completeRepairs(loadProgress(), Date.now()) };
    this.bar.refresh(progress.resources);
    if (this.regenText) this.refreshRegen(Date.now());

    const d = L.dock;
    const pad = 22;
    let y = d.y + (IS_PORTRAIT ? 86 : 66);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dynamic.push(o);
      return o;
    };

    // Docks (#38): one at the start, more built as the rank allows.
    const docks = dockCount(progress);
    for (let i = 0; i < docks; i++) {
      const job = progress.docks[i];
      add(this.add.text(d.x + pad, y, `第${i + 1}ドック`, eyebrowStyle(10, Css.gold)));
      if (!job) {
        add(this.add.text(d.x + pad + 110, y, '空き', textStyle(13, Css.dim)));
        // Empty docks take a short row so four still fit with the damaged list.
        y += IS_PORTRAIT ? 48 : 36;
        continue;
      } else {
        const ship = this.registryShips.byId(job.shipId);
        if (ship) {
          add(this.add.text(d.x + pad + 110, y - 2, ship.name, textStyle(14, Css.text, { fontStyle: 'bold' })));
          const total = repairTimeMs(ship.hp, hpFraction(progress, ship.id));
          const meterX = d.x + pad + 110;
          const meterW = d.w - pad * 2 - 110 - (IS_PORTRAIT ? 200 : 260);
          const g = add(this.add.graphics());
          // Portrait: the 高速修理 button takes the right end of the row, so the remaining time
          // goes on its own line under the progress bar (#22). Landscape keeps it right of the bar.
          const t = add(
            IS_PORTRAIT
              ? this.add.text(meterX, y + DOCK_METER_Y + 14, '', textStyle(12, Css.muted))
              : this.add.text(meterX + meterW + 12, y + 22, '', textStyle(12, Css.muted)).setOrigin(0, 0.5),
          );
          this.dockMeters.push({ g, t, x: meterX, y: y + DOCK_METER_Y, w: meterW, ship, total, endsAt: job.endsAt });
          const affordable = canAfford(progress.resources, FAST_REPAIR_COST);
          const btn = add(
            new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + (IS_PORTRAIT ? 34 : 10), '高速修理', () => this.fastRepair(ship.id), {
              variant: 'primary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 48 : 34, fontSize: 13,
            }),
          );
          btn.setEnabled(affordable);
        }
      }
      y += IS_PORTRAIT ? 100 : 52;
    }
    const next = nextDock(progress);
    if (next) {
      const label = `第${docks + 1}ドック増設  ${formatResources(next.cost)}`;
      add(this.add.text(d.x + pad, y + (IS_PORTRAIT ? 14 : 8), next.state === 'rank' ? `第${docks + 1}ドック: ${next.rankName}に昇進すると増設できます` : label, textStyle(12, next.state === 'rank' ? Css.dim : Css.muted)).setOrigin(0, 0.5));
      if (next.state !== 'rank') {
        add(new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + (IS_PORTRAIT ? 14 : 8), '増設', () => this.buildDock(), {
          variant: 'primary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 48 : 30, fontSize: 13,
        })).setEnabled(next.state === 'ready');
      }
      y += IS_PORTRAIT ? 48 : 30;
    }
    add(this.add.text(d.x + pad, y, `高速修理: ${formatResources(FAST_REPAIR_COST)}`, textStyle(11, Css.dim)));
    y += IS_PORTRAIT ? 40 : 28;

    // Damaged ships waiting for a dock
    const damaged = Object.keys(progress.damage)
      .map((id) => this.registryShips.byId(id))
      .filter((s): s is IShipData => s !== undefined && !isDocked(progress, s.id));
    add(this.add.text(d.x + pad, y, damaged.length > 0 ? '損傷艦' : '損傷艦はありません', eyebrowStyle(10, damaged.length > 0 ? Css.danger : Css.muted)));
    y += IS_PORTRAIT ? 36 : 26;
    const dockFree = progress.docks.length < docks;
    // Portrait: only as many rows as fit above the panel's bottom edge, leaving room for 他 n 隻.
    const fit = (reserve: number): number => Math.max(1, Math.min(MAX_DAMAGED_ROWS, Math.floor((d.y + d.h - y - reserve) / L.rowH)));
    const maxRows = !IS_PORTRAIT ? MAX_DAMAGED_ROWS : damaged.length <= fit(0) ? fit(0) : fit(40);
    for (const ship of damaged.slice(0, maxRows)) {
      const f = hpFraction(progress, ship.id);
      const cost = repairCost(ship.hp, f);
      add(this.add.text(d.x + pad, y, ship.name, textStyle(14, Css.text, { fontStyle: 'bold' })));
      add(this.add.text(d.x + pad, y + (IS_PORTRAIT ? 30 : 22), `HP ${Math.round(ship.hp * f)} / ${ship.hp}  ·  ${clock(repairTimeMs(ship.hp, f))}  ·  ${formatResources(cost)}`, textStyle(11, Css.muted)));
      const btn = add(
        new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + 14, '入渠', () => this.dock(ship), {
          variant: 'secondary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 52 : 34, fontSize: 14,
        }),
      );
      btn.setEnabled(dockFree && canAfford(progress.resources, cost));
      y += L.rowH;
    }
    if (damaged.length > maxRows) {
      add(this.add.text(d.x + pad, y, `他 ${damaged.length - maxRows} 隻`, textStyle(12, Css.dim)));
    }
  }

  private buildDock(): void {
    const built = buildDock(loadProgress());
    if (!built) return;
    saveProgress(built);
    this.refresh();
  }

  private dock(ship: IShipData): void {
    const progress = loadProgress();
    const f = hpFraction(progress, ship.id);
    const paid = pay(progress.resources, repairCost(ship.hp, f));
    const docked = paid ? startRepair(progress, ship.id, ship.hp, Date.now()) : null;
    if (!paid || !docked) return;
    saveProgress({ ...progress, ...docked, resources: paid });
    this.refresh();
  }

  private fastRepair(shipId: string): void {
    const progress = loadProgress();
    const paid = pay(progress.resources, FAST_REPAIR_COST);
    if (!paid) return;
    saveProgress({ ...progress, ...fastRepair(progress, shipId), resources: paid });
    this.refresh();
  }
}
