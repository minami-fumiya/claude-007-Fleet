import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { SceneKeys } from '@/config/SceneKeys';
import campaignJson from '@/data/campaign.json';
import { baseOfProgress, baseReaches } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import {
  FUEL_MAX, ISectorRef, WORLD_MAP, exploredCount, findRoute, homePort, isExplored, isSea, lonLatText, routeFuel, routeLength,
  theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { ICampaignData } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { addPanel, fitText, UIButton } from '@/ui/components/UIKit';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { loadProgress } from '@/utils/ProgressStore';

export interface IOpenSeaChartData {
  nation: string;
  explored: string;
  at: ISectorRef;
  fuel: number;
  route: readonly ISectorRef[];
  onRoute: (route: ISectorRef[]) => void;
  onClose: () => void;
}

const DATA = campaignJson as unknown as ICampaignData;

const THEATER_JA: Record<string, string> = {
  pacific: '南太平洋', north_pacific: '北太平洋', atlantic: '北大西洋', south_atlantic: '南大西洋', mediterranean: '地中海',
  baltic: 'バルト海', blacksea: '黒海', indian: 'インド洋', arctic: '北極海',
};

/** Where the chart sits: the grid and the side (landscape) or bottom (portrait) panel. */
const L = IS_PORTRAIT
  ? { cell: 16, chart: { x: 20, y: 120, w: CANVAS_W - 40 }, panel: { x: 20, y: 120 + 40 * 16 + 16, w: CANVAS_W - 40, h: CANVAS_H - (120 + 40 * 16 + 16) - 24 }, bh: 60 }
  : { cell: 14, chart: { x: 20, y: 84, w: 72 * 14 }, panel: { x: 20 + 72 * 14 + 16, y: 84, w: CANVAS_W - (20 + 72 * 14 + 16) - 20, h: 40 * 14 }, bh: 46 };

/**
 * 海図 (#445, 0.0.68): the whole world over the battle screen, kept apart from it (the minimap shows only the
 * sectors round the fleet). The explored seas are lit, the rest dark; a tap on the sea plans a route there, with
 * the fuel it takes. The battle waits while it is open.
 */
export class OpenSeaChartScene extends Phaser.Scene {
  private d!: IOpenSeaChartData;
  /** The first column shown at the chart's left edge (the chart scrolls round the world) */
  private left = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private dest: ISectorRef | null = null;
  private plan: ISectorRef[] | null = null;
  private open = new Set<string>();
  private dragFrom: { x: number; left: number } | null = null;

  constructor() {
    super({ key: SceneKeys.OPEN_SEA_CHART });
  }

  init(data: IOpenSeaChartData): void {
    this.d = data;
  }

  private get cols(): number {
    return Math.min(WORLD_MAP.cols, Math.floor(L.chart.w / L.cell));
  }

  create(): void {
    this.layer = [];
    this.labels = [];
    this.dest = null;
    this.plan = this.d.route.length > 0 ? [this.d.at, ...this.d.route] : null;
    if (this.plan) this.dest = this.plan[this.plan.length - 1];
    const progress = loadProgress();
    const reach = baseOfProgress(progress);
    this.open = new Set(theatersFor(DATA, this.d.nation as Nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id));
    // Centre the chart on the fleet.
    this.left = wrapCol(this.d.at.c - Math.floor(this.cols / 2));

    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.92).setOrigin(0, 0).setInteractive();
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 50 : 40, '海図', displayStyle(IS_PORTRAIT ? 28 : 24)).setOrigin(0.5);
    const close = IS_PORTRAIT ? { x: CANVAS_W - 110, y: 50, w: 172, h: 60 } : { x: CANVAS_W - 92, y: 40, w: 136, h: 44 };
    new UIButton(this, close.x, close.y, '閉じる', () => this.close(), { variant: 'secondary', width: close.w, height: close.h, fontSize: 15 });
    if (IS_PORTRAIT) this.add.text(L.chart.x, L.chart.y - 12, '左右に動かすと、世界をぐるりと見られます', textStyle(12, Css.muted)).setOrigin(0, 1);
    this.gfx = this.add.graphics();
    const hit = this.add.zone(L.chart.x, L.chart.y, this.cols * L.cell, WORLD_MAP.rows * L.cell).setOrigin(0, 0).setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragFrom = { x: p.x, left: this.left };
    });
    hit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown || this.cols >= WORLD_MAP.cols) return;
      const moved = Math.round((this.dragFrom.x - p.x) / L.cell);
      if (moved !== 0 && wrapCol(this.dragFrom.left + moved) !== this.left) {
        this.left = wrapCol(this.dragFrom.left + moved);
        this.drawChart();
      }
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dragged = this.dragFrom ? Math.abs(p.x - this.dragFrom.x) > 8 : false;
      this.dragFrom = null;
      if (!dragged) this.pick(p.x, p.y);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.drawChart();
    this.drawPanel();
  }

  private cellAt(px: number, py: number): ISectorRef | null {
    const i = Math.floor((px - L.chart.x) / L.cell);
    const r = Math.floor((py - L.chart.y) / L.cell);
    if (i < 0 || i >= this.cols || r < 0 || r >= WORLD_MAP.rows) return null;
    return { c: wrapCol(this.left + i), r };
  }

  /** Screen x of a column's left edge, or null when it isn't on the chart. */
  private colX(c: number): number | null {
    const i = wrapCol(c - this.left);
    return i < this.cols ? L.chart.x + i * L.cell : null;
  }

  private pick(px: number, py: number): void {
    const s = this.cellAt(px, py);
    if (!s) return;
    if (!isSea(s.c, s.r)) {
      this.dest = s;
      this.plan = null;
    } else {
      this.dest = s;
      this.plan = findRoute(this.d.at, s);
    }
    this.drawChart();
    this.drawPanel();
  }

  private drawChart(): void {
    const g = this.gfx;
    g.clear();
    for (const t of this.labels) t.destroy();
    this.labels = [];
    const k = L.cell;
    const { x: x0, y: y0 } = L.chart;
    for (let i = 0; i < this.cols; i++) {
      const c = wrapCol(this.left + i);
      for (let r = 0; r < WORLD_MAP.rows; r++) {
        const x = x0 + i * k;
        const y = y0 + r * k;
        if (!isSea(c, r)) {
          g.fillStyle(0x5f7d4c, 1).fillRect(x, y, k, k);
          continue;
        }
        const theater = theaterOf(c, r);
        const seen = isExplored(this.d.explored, { c, r });
        const open = theater !== null && this.open.has(theater);
        g.fillStyle(seen ? 0x2f6f9a : open ? 0x163a55 : 0x0d1d2c, 1).fillRect(x, y, k, k);
      }
    }
    // Faint lines every 15° (3 columns), for reading the chart.
    g.lineStyle(1, Colors.cyan, 0.12);
    for (let i = 0; i < this.cols; i++) if (wrapCol(this.left + i) % 3 === 0) g.lineBetween(x0 + i * k, y0, x0 + i * k, y0 + WORLD_MAP.rows * k);
    g.lineStyle(1, Colors.cyan, 0.35).strokeRect(x0, y0, this.cols * k, WORLD_MAP.rows * k);

    // The theaters' names, at the middle of their sea (only where it is on the chart).
    for (const [id, at] of Object.entries(theaterCentres())) {
      const x = this.colX(at.c);
      if (x === null) continue;
      const open = this.open.has(id);
      const t = this.add.text(x + k / 2, y0 + (at.r + 0.5) * k, THEATER_JA[id] ?? id, textStyle(IS_PORTRAIT ? 13 : 12, open ? Css.text : Css.muted, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0.5);
      // Kept inside the chart at its edges.
      const half = t.width / 2;
      t.setX(Math.max(x0 + half + 2, Math.min(x0 + this.cols * k - half - 2, t.x)));
      this.labels.push(t);
    }
    // Every navy's home port; this navy's in gold.
    for (const [nation, port] of Object.entries(WORLD_MAP.homePorts)) {
      const x = this.colX(port.c);
      if (x === null) continue;
      const own = nation === this.d.nation;
      g.fillStyle(own ? Colors.gold : 0xb9c6d3, own ? 1 : 0.6).fillCircle(x + k / 2, y0 + (port.r + 0.5) * k, own ? k * 0.42 : k * 0.28);
    }
    // The route planned, then the fleet.
    if (this.plan) {
      g.fillStyle(Colors.gold, 0.9);
      for (const s of this.plan.slice(1)) {
        const x = this.colX(s.c);
        if (x !== null) g.fillCircle(x + k / 2, y0 + (s.r + 0.5) * k, Math.max(2, k * 0.18));
      }
    }
    if (this.dest) {
      const x = this.colX(this.dest.c);
      if (x !== null) g.lineStyle(2, isSea(this.dest.c, this.dest.r) ? Colors.gold : Colors.danger, 1).strokeRect(x + 1, y0 + this.dest.r * k + 1, k - 2, k - 2);
    }
    const fx = this.colX(this.d.at.c);
    if (fx !== null) {
      const cx = fx + k / 2;
      const cy = y0 + (this.d.at.r + 0.5) * k;
      g.fillStyle(Colors.cyan, 1).fillTriangle(cx, cy - k * 0.6, cx - k * 0.45, cy + k * 0.4, cx + k * 0.45, cy + k * 0.4);
    }
  }

  private drawPanel(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const P = L.panel;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.layer.push(o);
      return o;
    };
    add(addPanel(this, P.x, P.y, P.w, P.h, { radius: 16, fillAlpha: 0.9 }));
    const x = P.x + 16;
    const w = P.w - 32;
    let y = P.y + 16;
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true } };
    const line = (text: string, size: number, color: string = Css.text): void => {
      const t = add(this.add.text(x, y, text, textStyle(size, color, wrap)));
      y += t.height + 6;
    };
    const here = theaterOf(this.d.at.c, this.d.at.r);
    add(this.add.text(x, y, '現在地', eyebrowStyle(11, Css.gold)));
    y += 20;
    line(`${here ? THEATER_JA[here] : '沿岸'} · ${lonLatText(this.d.at)}`, 14);
    line(`燃料 ${Math.ceil(this.d.fuel)} / ${FUEL_MAX}  ·  探索 ${exploredCount(this.d.explored)} 区画`, 13, this.d.fuel <= 20 ? Css.danger : Css.cyan);
    y += 6;
    const home = homePort(this.d.nation);
    const dest = this.dest;
    let go: ISectorRef[] | null = null;
    if (dest) {
      add(this.add.text(x, y, '行き先', eyebrowStyle(11, Css.gold)));
      y += 20;
      const t = theaterOf(dest.c, dest.r);
      if (!isSea(dest.c, dest.r)) line('陸です。海を選んでください', 13, Css.danger);
      else if (!this.plan) line('ここへの海の道がありません', 13, Css.danger);
      else {
        const fuel = routeFuel(this.plan);
        const back = home ? findRoute(dest, home) : null;
        const backFuel = back ? routeFuel(back) : 0;
        line(`${t ? THEATER_JA[t] : ''} · ${lonLatText(dest)}`, 14);
        line(`${Math.round(routeLength(this.plan))} 区画 · 燃料 ${fuel}${home ? ` · 帰り ${backFuel}` : ''}`, 13, Css.cyan);
        if (t && !this.open.has(t)) line('まだ開いていない海です (基地を開くと行けます)', 12, Css.danger);
        else {
          if (fuel > this.d.fuel) line('燃料が足りません (着く前に微速になります)', 12, Css.danger);
          else if (fuel + backFuel > this.d.fuel) line('帰りの燃料が足りません', 12, Css.danger);
          go = this.plan;
        }
      }
    } else line('海をタップすると、行き先と航路・燃料が出ます。決めると自動で走ります', 13, Css.muted);
    line('金の丸: 自国の軍港 · 三角: 艦隊 · 明るい海: 探索済み · 暗い海: まだ開いていない海', 11, Css.muted);

    const by = P.y + P.h - 16 - L.bh / 2;
    const half = (w - 12) / 2;
    const goBtn = add(new UIButton(this, x + half / 2, by, 'ここへ向かう', () => go && this.choose(go), { variant: go ? 'gold' : 'secondary', width: half, height: L.bh, fontSize: IS_PORTRAIT ? 16 : 13 }));
    goBtn.setEnabled(go !== null && go.length > 1);
    const homeRoute = home ? findRoute(this.d.at, home) : null;
    const homeBtn = add(new UIButton(this, x + w - half / 2, by, '軍港へ', () => homeRoute && this.choose(homeRoute), { variant: 'primary', width: half, height: L.bh, fontSize: IS_PORTRAIT ? 16 : 13 }));
    homeBtn.setEnabled(homeRoute !== null && homeRoute.length > 1);
    for (const o of this.layer) if (o instanceof Phaser.GameObjects.Text) fitText(o, w);
  }

  private choose(route: ISectorRef[]): void {
    this.d.onRoute(route);
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.d.onClose();
  }
}

let centres: Record<string, ISectorRef> | null = null;

/** The middle of each theater's sea on the chart (the sea sector nearest its centre of mass, columns averaged round). */
export function theaterCentres(): Record<string, ISectorRef> {
  if (centres) return centres;
  const acc: Record<string, { sx: number; sy: number; r: number; n: number; cells: ISectorRef[] }> = {};
  for (let r = 0; r < WORLD_MAP.rows; r++) {
    for (let c = 0; c < WORLD_MAP.cols; c++) {
      const t = theaterOf(c, r);
      if (!t) continue;
      const a = (acc[t] ??= { sx: 0, sy: 0, r: 0, n: 0, cells: [] });
      const ang = (c / WORLD_MAP.cols) * Math.PI * 2;
      a.sx += Math.cos(ang);
      a.sy += Math.sin(ang);
      a.r += r;
      a.n += 1;
      a.cells.push({ c, r });
    }
  }
  centres = {};
  for (const [t, a] of Object.entries(acc)) {
    const ang = Math.atan2(a.sy, a.sx);
    const mc = wrapCol(Math.round((ang / (Math.PI * 2)) * WORLD_MAP.cols));
    const mr = a.r / a.n;
    let best = a.cells[0];
    let bestD = Infinity;
    for (const s of a.cells) {
      const dc = Math.min(Math.abs(s.c - mc), WORLD_MAP.cols - Math.abs(s.c - mc));
      const d = dc * dc + (s.r - mr) ** 2;
      if (d < bestD) [best, bestD] = [s, d];
    }
    centres[t] = best;
  }
  return centres;
}
