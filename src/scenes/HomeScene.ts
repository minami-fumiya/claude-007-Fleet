import Phaser from 'phaser';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { completeRepairs, DOCK_COUNT, FAST_REPAIR_COST, hpFraction, isDocked, repairCost, repairTimeMs, startRepair, fastRepair } from '@/systems/DockSystem';
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
      menu: { x: 16, y: 290, w: CANVAS_W - 32, h: 110 } as IRect,
      menuFlow: 'row' as const,
      dock: { x: 16, y: 420, w: CANVAS_W - 32, h: CANVAS_H - 436 } as IRect,
      rowH: 92,
    }
  : {
      resources: { x: 444, y: 96, w: 812 } as { x: number; y: number; w: number },
      resourceCols: 4,
      menu: { x: 24, y: 96, w: 400, h: 600 } as IRect,
      menuFlow: 'column' as const,
      dock: { x: 444, y: 164, w: 812, h: 532 } as IRect,
      rowH: 62,
    };

const MENU: Array<{ label: string; caption: string; scene: string; variant: 'gold' | 'primary' | 'secondary' }> = [
  { label: '作戦', caption: 'CAMPAIGN', scene: SceneKeys.CAMPAIGN, variant: 'gold' },
  { label: '演習', caption: 'FREE BATTLE', scene: SceneKeys.FLEET_BUILDER, variant: 'primary' },
  { label: '工廠', caption: 'ARSENAL · 研究', scene: SceneKeys.ARSENAL, variant: 'secondary' },
  { label: '改装', caption: 'REFIT', scene: SceneKeys.CUSTOMIZATION, variant: 'secondary' },
];
const MAX_DAMAGED_ROWS = IS_PORTRAIT ? 6 : 5;

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

  constructor() {
    super({ key: SceneKeys.HOME });
  }

  create(): void {
    audio.music('menu');
    this.registryShips = DataLoader.getRegistry(this);
    this.dynamic = [];
    this.dockMeters = [];
    addBackdrop(this, 'menu');

    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'NAVAL BASE', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '鎮守府 — 艦隊司令部', displayStyle(24)).setOrigin(0.5);

    this.bar = new ResourceBar(this, L.resources.x, L.resources.y, L.resources.w, L.resourceCols);
    this.buildMenu();
    addPanel(this, L.dock.x, L.dock.y, L.dock.w, L.dock.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(L.dock.x + 22, L.dock.y + 18, 'DOCK', eyebrowStyle(11));
    this.add.text(L.dock.x + 22, L.dock.y + (IS_PORTRAIT ? 46 : 34), '入渠 — 損傷艦の修理', textStyle(15, Css.text, { fontStyle: 'bold' }));
    this.refresh();
  }

  update(): void {
    const now = Date.now();
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
    MENU.forEach((item, i) => {
      const n = MENU.length;
      const r =
        L.menuFlow === 'row'
          ? { w: (m.w - gap * (n - 1)) / n, h: m.h, x: m.x + i * ((m.w - gap * (n - 1)) / n + gap), y: m.y }
          : { w: m.w, h: (m.h - gap * (n - 1)) / n, x: m.x, y: m.y + i * ((m.h - gap * (n - 1)) / n + gap) };
      new UIButton(this, r.x + r.w / 2, r.y + r.h / 2, item.label, () => {
        // Free battles are not campaign sorties.
        if (item.scene === SceneKeys.FLEET_BUILDER) this.registry.remove(CAMPAIGN_AREA_KEY);
        this.scene.start(item.scene, { returnTo: SceneKeys.HOME });
      }, {
        variant: item.variant,
        width: r.w,
        height: r.h,
        fontSize: IS_PORTRAIT ? 24 : 30,
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

    const d = L.dock;
    const pad = 22;
    let y = d.y + (IS_PORTRAIT ? 86 : 66);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dynamic.push(o);
      return o;
    };

    // Docks
    for (let i = 0; i < DOCK_COUNT; i++) {
      const job = progress.docks[i];
      add(this.add.text(d.x + pad, y, `第${i + 1}ドック`, eyebrowStyle(10, Css.gold)));
      if (!job) {
        add(this.add.text(d.x + pad + 110, y, '空き', textStyle(13, Css.dim)));
      } else {
        const ship = this.registryShips.byId(job.shipId);
        if (ship) {
          add(this.add.text(d.x + pad + 110, y - 2, ship.name, textStyle(14, Css.text, { fontStyle: 'bold' })));
          const total = repairTimeMs(ship.hp, hpFraction(progress, ship.id));
          const meterX = d.x + pad + 110;
          const meterW = d.w - pad * 2 - 110 - (IS_PORTRAIT ? 200 : 260);
          const g = add(this.add.graphics());
          const t = add(this.add.text(meterX + meterW + 12, y + 22, '', textStyle(12, Css.muted)).setOrigin(0, 0.5));
          this.dockMeters.push({ g, t, x: meterX, y: y + 18, w: meterW, ship, total, endsAt: job.endsAt });
          const affordable = canAfford(progress.resources, FAST_REPAIR_COST);
          const btn = add(
            new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + 10, '高速修理', () => this.fastRepair(ship.id), {
              variant: 'primary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 48 : 34, fontSize: 13,
            }),
          );
          btn.setEnabled(affordable);
        }
      }
      y += IS_PORTRAIT ? 70 : 52;
    }
    add(this.add.text(d.x + pad, y, `高速修理: ${formatResources(FAST_REPAIR_COST)}`, textStyle(11, Css.dim)));
    y += IS_PORTRAIT ? 40 : 28;

    // Damaged ships waiting for a dock
    const damaged = Object.keys(progress.damage)
      .map((id) => this.registryShips.byId(id))
      .filter((s): s is IShipData => s !== undefined && !isDocked(progress, s.id));
    add(this.add.text(d.x + pad, y, damaged.length > 0 ? 'DAMAGED · 損傷艦' : '損傷艦はありません', eyebrowStyle(10, damaged.length > 0 ? Css.danger : Css.muted)));
    y += IS_PORTRAIT ? 36 : 26;
    const dockFree = progress.docks.length < DOCK_COUNT;
    for (const ship of damaged.slice(0, MAX_DAMAGED_ROWS)) {
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
    if (damaged.length > MAX_DAMAGED_ROWS) {
      add(this.add.text(d.x + pad, y, `他 ${damaged.length - MAX_DAMAGED_ROWS} 隻`, textStyle(12, Css.dim)));
    }
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
