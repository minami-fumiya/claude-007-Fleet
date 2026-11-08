import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { SceneKeys } from '@/config/SceneKeys';
import campaignJson from '@/data/campaign.json';
import { baseOfProgress, baseReaches, nationBases, openBases } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import {
  FUEL_MAX, ISectorRef, WORLD_MAP, areaAt, exploredCount, findRoute, homePort, isExplored, isSea, lonLatText, routeFuel, routeLength,
  theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { ICampaignData, Objective } from '@/types/Campaign';
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

export const THEATER_JA: Record<string, string> = {
  pacific: '南太平洋', north_pacific: '北太平洋', atlantic: '北大西洋', south_atlantic: '南大西洋', mediterranean: '地中海',
  baltic: 'バルト海', blacksea: '黒海', indian: 'インド洋', arctic: '北極海',
};

/** Where the chart sits: the grid and the side (landscape) or bottom (portrait) panel. */
const L = IS_PORTRAIT
  ? { chart: { x: 20, y: 120, w: CANVAS_W - 40, h: 620 }, panel: { x: 20, y: 120 + 620 + 70, w: CANVAS_W - 40, h: CANVAS_H - (120 + 620 + 70) - 24 }, bh: 60 }
  : { chart: { x: 20, y: 84, w: 900, h: 560 }, panel: { x: 20 + 900 + 16, y: 84, w: CANVAS_W - (20 + 900 + 16) - 20, h: 560 }, bh: 46 };
/** Zoom steps: pixels a sector. The first fits the whole world across the chart. */
const ZOOMS = [L.chart.w / WORLD_MAP.cols, 6, 12, 24];
const TEXTURE = 'open-sea-chart';

const COLOR = { land: 0x5f7d4c, seen: 0x2f6f9a, open: 0x163a55, closed: 0x0d1d2c };

/**
 * 海図 (#445): the whole world over the battle screen, kept apart from it (the minimap shows only the sectors round
 * the fleet). 0.0.69: 288 × 160 sectors drawn as one picture (a pixel a sector), zoomed and dragged; the navy's bases
 * and the campaign areas are on it. A tap on the sea plans a route there, with the fuel it takes. The battle waits
 * while it is open.
 */
export class OpenSeaChartScene extends Phaser.Scene {
  private d!: IOpenSeaChartData;
  /** The sector at the chart's top-left corner (fractional; the columns wrap) */
  private left = 0;
  private top = 0;
  private zoom = 1;
  private gfx!: Phaser.GameObjects.Graphics;
  private images: Phaser.GameObjects.Image[] = [];
  private layer: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private dest: ISectorRef | null = null;
  private plan: ISectorRef[] | null = null;
  private open = new Set<string>();
  private dragFrom: { x: number; y: number; left: number; top: number } | null = null;

  constructor() {
    super({ key: SceneKeys.OPEN_SEA_CHART });
  }

  init(data: IOpenSeaChartData): void {
    this.d = data;
  }

  private get k(): number {
    return ZOOMS[this.zoom];
  }

  create(): void {
    this.layer = [];
    this.labels = [];
    this.images = [];
    this.dest = null;
    this.plan = this.d.route.length > 0 ? [this.d.at, ...this.d.route] : null;
    if (this.plan) this.dest = this.plan[this.plan.length - 1];
    const progress = loadProgress();
    const reach = baseOfProgress(progress);
    this.open = new Set(theatersFor(DATA, this.d.nation as Nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id));

    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.94).setOrigin(0, 0).setInteractive();
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 50 : 40, '海図', displayStyle(IS_PORTRAIT ? 28 : 24)).setOrigin(0.5);
    const close = IS_PORTRAIT ? { x: CANVAS_W - 110, y: 50, w: 172, h: 60 } : { x: CANVAS_W - 92, y: 40, w: 136, h: 44 };
    new UIButton(this, close.x, close.y, '閉じる', () => this.close(), { variant: 'secondary', width: close.w, height: close.h, fontSize: 15 });

    this.drawTexture();
    const { x, y, w, h } = L.chart;
    this.add.rectangle(x, y, w, h, COLOR.closed, 1).setOrigin(0, 0);
    const mask = this.make.graphics({}, false).fillRect(x, y, w, h).createGeometryMask();
    // The picture twice side by side, so the east-west join scrolls through.
    for (let i = 0; i < 2; i++) this.images.push(this.add.image(0, 0, TEXTURE).setOrigin(0, 0).setMask(mask));
    this.gfx = this.add.graphics().setMask(mask);
    this.add.graphics().lineStyle(1, Colors.cyan, 0.35).strokeRect(x, y, w, h);
    // Zoom buttons under the chart.
    const zy = y + h + (IS_PORTRAIT ? 34 : 30);
    const zw = IS_PORTRAIT ? 120 : 90;
    const zh = IS_PORTRAIT ? 52 : 40;
    new UIButton(this, x + zw / 2, zy, '縮小', () => this.setZoom(this.zoom - 1), { variant: 'secondary', width: zw, height: zh, fontSize: 15 });
    new UIButton(this, x + zw * 1.5 + 12, zy, '拡大', () => this.setZoom(this.zoom + 1), { variant: 'secondary', width: zw, height: zh, fontSize: 15 });
    this.add.text(x + zw * 2 + 30, zy, 'ドラッグで動かせます', textStyle(12, Css.muted)).setOrigin(0, 0.5);

    const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragFrom = { x: p.x, y: p.y, left: this.left, top: this.top };
    });
    hit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown) return;
      this.left = this.dragFrom.left - (p.x - this.dragFrom.x) / this.k;
      this.top = this.clampTop(this.dragFrom.top - (p.y - this.dragFrom.y) / this.k);
      this.drawChart();
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dragged = this.dragFrom ? Math.hypot(p.x - this.dragFrom.x, p.y - this.dragFrom.y) > 8 : false;
      this.dragFrom = null;
      if (!dragged) this.pick(p.x, p.y);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.setZoom(2, this.d.at);
    this.drawPanel();
  }

  /** One pixel a sector: land, the explored sea, the open seas and the seas not yet open. */
  private drawTexture(): void {
    if (this.textures.exists(TEXTURE)) this.textures.remove(TEXTURE);
    const tex = this.textures.createCanvas(TEXTURE, WORLD_MAP.cols, WORLD_MAP.rows)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(WORLD_MAP.cols, WORLD_MAP.rows);
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < WORLD_MAP.cols; c++) {
        let col = COLOR.land;
        if (isSea(c, r)) {
          const t = theaterOf(c, r);
          col = isExplored(this.d.explored, { c, r }) ? COLOR.seen : t && this.open.has(t) ? COLOR.open : COLOR.closed;
        }
        const i = (r * WORLD_MAP.cols + c) * 4;
        img.data[i] = (col >> 16) & 0xff;
        img.data[i + 1] = (col >> 8) & 0xff;
        img.data[i + 2] = col & 0xff;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private clampTop(top: number): number {
    const rowsShown = L.chart.h / this.k;
    return Math.max(0, Math.min(WORLD_MAP.rows - rowsShown, top));
  }

  /** Zooms about the chart's middle (or about `on`, the fleet on opening). */
  private setZoom(z: number, on?: ISectorRef): void {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, z));
    const midC = on ? on.c + 0.5 : this.left + L.chart.w / 2 / this.k;
    const midR = on ? on.r + 0.5 : this.top + L.chart.h / 2 / this.k;
    this.zoom = next;
    this.left = midC - L.chart.w / 2 / this.k;
    this.top = this.clampTop(midR - L.chart.h / 2 / this.k);
    this.drawChart();
  }

  private cellAt(px: number, py: number): ISectorRef | null {
    const { x, y, w, h } = L.chart;
    if (px < x || py < y || px > x + w || py > y + h) return null;
    const r = Math.floor(this.top + (py - y) / this.k);
    if (r < 0 || r >= WORLD_MAP.rows) return null;
    return { c: wrapCol(Math.floor(this.left + (px - x) / this.k)), r };
  }

  /** Screen point of a sector's centre (the copy nearest the chart's middle), or null when it isn't on the chart. */
  private pointOf(s: ISectorRef): { x: number; y: number } | null {
    const k = this.k;
    const cols = WORLD_MAP.cols;
    let dc = s.c + 0.5 - this.left;
    dc = ((dc % cols) + cols) % cols;
    const x = L.chart.x + dc * k;
    const y = L.chart.y + (s.r + 0.5 - this.top) * k;
    if (x > L.chart.x + L.chart.w + k || y < L.chart.y - k || y > L.chart.y + L.chart.h + k) return null;
    return { x, y };
  }

  private pick(px: number, py: number): void {
    const s = this.cellAt(px, py);
    if (!s) return;
    this.dest = s;
    this.plan = isSea(s.c, s.r) ? findRoute(this.d.at, s) : null;
    this.drawChart();
    this.drawPanel();
  }

  private drawChart(): void {
    const k = this.k;
    const cols = WORLD_MAP.cols;
    const { x: x0, y: y0, w: cw } = L.chart;
    const left = ((this.left % cols) + cols) % cols;
    this.images.forEach((img, i) => img.setScale(k).setPosition(x0 + (i * cols - left) * k, y0 - this.top * k));
    const g = this.gfx;
    g.clear();
    for (const t of this.labels) t.destroy();
    this.labels = [];
    // Lines every 15° (12 columns) for reading the chart, when zoomed in enough.
    if (k >= 6) {
      g.lineStyle(1, Colors.cyan, 0.1);
      for (let c = Math.ceil(this.left / 12) * 12; c < this.left + cw / k; c += 12) g.lineBetween(x0 + (c - this.left) * k, y0, x0 + (c - this.left) * k, y0 + L.chart.h);
    }
    // Campaign areas of the seas open to the navy (red; cleared ones green).
    const cleared = new Set(loadProgress().campaign);
    for (const a of DATA.areas) {
      const b = WORLD_MAP.areas[a.id];
      if (!b || !this.open.has(a.theater)) continue;
      const p = this.pointOf(b);
      if (!p) continue;
      g.lineStyle(Math.max(1, k / 6), cleared.has(a.id) ? Colors.success : Colors.danger, 0.9).strokeRect(p.x - k / 2, p.y - k / 2, b.size * k, b.size * k);
    }
    // The navy's bases (open ones bright), every other navy's home port faint.
    const progress = loadProgress();
    const openIds = new Set(openBases(progress).map((b) => b.id));
    for (const base of nationBases(this.d.nation)) {
      const s = WORLD_MAP.bases[base.id];
      const p = s && this.pointOf(s);
      if (!p) continue;
      g.fillStyle(openIds.has(base.id) ? 0xffffff : 0x8a96a3, openIds.has(base.id) ? 1 : 0.6).fillRect(p.x - Math.max(2, k * 0.35), p.y - Math.max(2, k * 0.35), Math.max(4, k * 0.7), Math.max(4, k * 0.7));
    }
    for (const [nation, port] of Object.entries(WORLD_MAP.homePorts)) {
      const p = this.pointOf(port);
      if (!p) continue;
      const own = nation === this.d.nation;
      g.fillStyle(own ? Colors.gold : 0xb9c6d3, own ? 1 : 0.5).fillCircle(p.x, p.y, own ? Math.max(5, k * 0.6) : Math.max(3, k * 0.35));
    }
    // The theaters' names, kept inside the chart.
    for (const [id, at] of Object.entries(theaterCentres())) {
      const p = this.pointOf(at);
      if (!p || p.x > x0 + cw) continue;
      const t = this.add.text(p.x, p.y, THEATER_JA[id] ?? id, textStyle(IS_PORTRAIT ? 13 : 12, this.open.has(id) ? Css.text : Css.muted, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 3 })).setOrigin(0.5);
      const half = t.width / 2;
      t.setX(Math.max(x0 + half + 2, Math.min(x0 + cw - half - 2, t.x)));
      t.setY(Math.max(y0 + t.height / 2 + 2, Math.min(y0 + L.chart.h - t.height / 2 - 2, t.y)));
      this.labels.push(t);
    }
    // The route planned, the destination, then the fleet.
    if (this.plan) {
      g.fillStyle(Colors.gold, 0.9);
      for (const s of this.plan.slice(1)) {
        const p = this.pointOf(s);
        if (p) g.fillCircle(p.x, p.y, Math.max(1.5, k * 0.2));
      }
    }
    if (this.dest) {
      const p = this.pointOf(this.dest);
      if (p) g.lineStyle(2, isSea(this.dest.c, this.dest.r) ? Colors.gold : Colors.danger, 1).strokeRect(p.x - Math.max(4, k / 2), p.y - Math.max(4, k / 2), Math.max(8, k), Math.max(8, k));
    }
    const f = this.pointOf(this.d.at);
    if (f) {
      const s = Math.max(6, k * 0.6);
      g.fillStyle(Colors.cyan, 1).fillTriangle(f.x, f.y - s, f.x - s * 0.75, f.y + s * 0.7, f.x + s * 0.75, f.y + s * 0.7);
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
      const areaId = areaAt(dest);
      const area = areaId ? DATA.areas.find((a) => a.id === areaId) : undefined;
      if (area && this.open.has(area.theater)) line(`作戦海域: ${area.name} (${OBJECTIVE_LABEL[area.objective ?? Objective.Annihilate]})`, 13, Css.gold);
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
    } else line('海をタップすると、行き先と航路・燃料が出ます。決めると自動航行で走ります', 13, Css.muted);
    line('金の丸: 軍港 · 白い四角: 基地 · 赤い枠: 作戦海域 (緑は攻略済み) · 三角: 艦隊 · 明るい海: 探索済み', 11, Css.muted);

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
