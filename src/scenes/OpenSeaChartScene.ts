import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { SceneKeys } from '@/config/SceneKeys';
import campaignJson from '@/data/campaign.json';
import { baseOfProgress, baseReaches, nationBases, openBases } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import {
  FUEL_MAX, ISectorRef, WORLD_MAP, areaAt, exploredCount, findRoute, homePort, isExplored, isSea, lonLatOf, lonLatText, routeFuel, routeLength,
  theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { ICampaignData, Objective } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { Weather } from '@/types/Weather';
import { MISSION_JA, MissionKind, PatrolStance, RETURN_JA, RETURN_RULES, RETURN_SHORT, ReturnRule } from '@/systems/FleetOrders';
import { CONTROL_LOW, CONTROL_SAFE, ISeaRegion, controlWord, regionAt, regionById } from '@/systems/SeaRegionSystem';
import { airFields, navyAir, navyControl, suppliedRegions } from '@/utils/SeaControlView';
import { AIR_HIGH, AIR_LOW, AIR_MISSIONS, AIR_MISSION_JA, clearAirOp, fieldsFor, setAirOp } from '@/systems/AirControlSystem';
import { emptySeaControl } from '@/systems/SeaControlSystem';
import { TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { clockText, frontsAt, seaSky } from '@/systems/WorldClock';
import { addPanel, fitText, UIButton } from '@/ui/components/UIKit';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';

export interface IOpenSeaChartData {
  nation: string;
  explored: string;
  at: ISectorRef;
  fuel: number;
  route: readonly ISectorRef[];
  onRoute: (route: ISectorRef[]) => void;
  onClose: () => void;
  /** 艦隊の一覧 (0.0.72): the fleets away (and, index -1, the one steered); missing on older callers */
  fleets?: () => IChartFleet[];
  /** 回航: a fleet away sent along a route (why not, or null) */
  onOrder?: (index: number, route: ISectorRef[]) => string | null;
  /** 指揮を移す */
  onSwitch?: (index: number) => void;
  /** 指揮を移す to an expedition on its route (0.0.73) */
  onSwitchExpedition?: (id: string) => void;
  /** 哨戒 (0.0.73): a fleet away sent to patrol round a sector (why not, or null) */
  onPatrol?: (index: number, centre: ISectorRef, stance: PatrolStance, mission?: MissionKind) => string | null;
  /** 迎撃 (0.0.74): a fleet in a base waits to sail out to the enemies found near it (why not, or null) */
  onIntercept?: (index: number) => string | null;
  /** 命令を解く: the fleet stops where it is */
  onStop?: (index: number) => void;
  /** 自動の帰投の基準 */
  onRule?: (index: number, rule: ReturnRule) => void;
  /** Enemy residents within sight of the navy's fleets (0.0.72) */
  sightings?: () => Array<{ c: number; r: number; kind: string }>;
}

/** A fleet in the chart's list (0.0.72). */
export interface IChartFleet {
  /** Its place in the anchorages; -1 for the fleet steered, -2 for an expedition */
  index: number;
  /** An expedition on its route (0.0.73) */
  expedition?: string;
  label: string;
  place: string;
  at: ISectorRef;
  moving: boolean;
  /** Its most hurt ship's HP (0..1) */
  minHp: number;
  fuel: number;
  rule: ReturnRule;
  /** 迎撃の待機中 (0.0.74) */
  intercept?: boolean;
  /** Lying in a base (it can be set to 迎撃) */
  atBase?: boolean;
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

/** 海図の色分け (0.0.74 制海権, 0.0.75 制空権・補給線) */
type ChartLayer = 'explore' | 'sea' | 'air' | 'supply';
const LAYERS: readonly ChartLayer[] = ['explore', 'sea', 'air', 'supply'];
const LAYER_JA: Record<ChartLayer, string> = { explore: '探索', sea: '制海権', air: '制空権', supply: '補給線' };
const LEGEND: Record<ChartLayer, string> = {
  explore: '金の丸: 軍港 · 白い四角: 基地 · 赤い枠: 作戦海域 (緑は攻略済み) · 三角: 艦隊 · 明るい海: 探索済み',
  sea: `制海権: 緑 ${CONTROL_SAFE}% 以上 (船団が通る) · 黄 拮抗 · 赤 ${CONTROL_LOW}% 未満 (敵が多く、燃料が多く要る)`,
  air: `制空権: 緑 ${AIR_HIGH}% 以上 (偵察が出る) · 黄 拮抗 · 赤 ${AIR_LOW}% 以下 (敵の陸上機が空襲に来る)`,
  supply: '補給線: 緑 補給が届く (燃料が減りにくく、港の修理が増える) · 赤 補給の切れた海 (制海権が下がる)',
};

const COLOR = { land: 0x5f7d4c, seen: 0x2f6f9a, open: 0x163a55, closed: 0x0d1d2c, held: 0x2f7a5a, contested: 0x8a7330, enemy: 0x8a3340 };

/** 任務の選び方 (0.0.74): what the list's duty button cycles through. */
const DUTIES: ReadonlyArray<{ mission: MissionKind | 'intercept'; stance: PatrolStance; label: string; hint: string }> = [
  { mission: 'patrol', stance: 'chase', label: '哨戒 (追う)', hint: '見つけた敵を追う' },
  { mission: 'patrol', stance: 'report', label: '哨戒 (知らせる)', hint: '見つけた敵を知らせるだけ' },
  { mission: 'escort', stance: 'chase', label: '船団護衛', hint: 'その地方の収入が減らない・敵の巡回を追い払う' },
  { mission: 'raid', stance: 'chase', label: '通商破壊', hint: '敵の船団を襲って積荷を奪う' },
  { mission: 'mine', stance: 'report', label: '機雷敷設', hint: '6 時間で機雷を敷き、制海権が上がる' },
  { mission: 'sweep', stance: 'report', label: '掃海', hint: '4 時間で敵の機雷を取り除く' },
  { mission: 'train', stance: 'report', label: '訓練', hint: `制海権 ${CONTROL_SAFE}% 以上の海で練度を上げる (燃料を使う)` },
  { mission: 'intercept', stance: 'chase', label: '迎撃', hint: '基地で待ち、近くで見つかった敵へ向かう' },
];

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
  /** 艦隊の一覧 (0.0.72): the panel shows the fleets instead of the route, a page at a time */
  private listMode = false;
  private listPage = 0;
  private listNote = '';
  /** 任務 (0.0.74): the duty a fleet sent from the list takes up (哨戒 has its two stances; 迎撃 waits in its base) */
  private duty = 0;
  /** 制海権 (0.0.74): the chart coloured by the navy's control of each region */
  private showControl: ChartLayer = 'explore';
  private air: Record<string, number> = {};
  private supplied = new Set<string>();
  /** 航空の任務 (0.0.75): the mission picked for a base air group */
  private airMission = 0;
  private control: Record<string, number> = {};

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
    this.listMode = false;
    this.listPage = 0;
    this.listNote = '';
    this.plan = this.d.route.length > 0 ? [this.d.at, ...this.d.route] : null;
    if (this.plan) this.dest = this.plan[this.plan.length - 1];
    const progress = loadProgress();
    const reach = baseOfProgress(progress);
    this.open = new Set(theatersFor(DATA, this.d.nation as Nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id));
    this.control = navyControl(progress, Date.now(), this.open);
    this.air = navyAir(progress, Date.now(), this.open);
    this.supplied = suppliedRegions(progress, Date.now());

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
    // 0.0.74 制海権, 0.0.75 制空権・補給線: the chart's colouring in turn.
    const ctl = new UIButton(this, x + zw * 2.5 + 24, zy, LAYER_JA.sea, () => {
      this.showControl = LAYERS[(LAYERS.indexOf(this.showControl) + 1) % LAYERS.length];
      ctl.setLabel(LAYER_JA[LAYERS[(LAYERS.indexOf(this.showControl) + 1) % LAYERS.length]]);
      this.drawTexture(true);
      this.drawPanel();
    }, { variant: 'secondary', width: zw, height: zh, fontSize: 15 });
    this.add.text(x + zw * 3 + 42, zy, 'ドラッグで動かせます', textStyle(12, Css.muted)).setOrigin(0, 0.5);

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
  private drawTexture(redraw = false): void {
    // Redrawn in place while the chart is open (the 制海権 switch): the images keep the same texture.
    const kept = redraw && this.textures.exists(TEXTURE) ? this.textures.get(TEXTURE) : null;
    if (!kept && this.textures.exists(TEXTURE)) this.textures.remove(TEXTURE);
    const tex = kept instanceof Phaser.Textures.CanvasTexture ? kept : this.textures.createCanvas(TEXTURE, WORLD_MAP.cols, WORLD_MAP.rows)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(WORLD_MAP.cols, WORLD_MAP.rows);
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < WORLD_MAP.cols; c++) {
        let col = COLOR.land;
        if (isSea(c, r)) {
          const t = theaterOf(c, r);
          col = isExplored(this.d.explored, { c, r }) ? COLOR.seen : t && this.open.has(t) ? COLOR.open : COLOR.closed;
          // 制海権 (0.0.74): green where held (50%+), amber contested, red the enemy's (below 20%).
          if (this.showControl !== 'explore' && t && this.open.has(t)) {
            const region = regionAt({ c, r });
            const v = region ? (this.showControl === 'air' ? this.air : this.control)[region.id] : undefined;
            if (region && this.showControl === 'supply') col = this.supplied.has(region.id) ? COLOR.held : (this.control[region.id] ?? 0) >= CONTROL_SAFE ? COLOR.enemy : COLOR.open;
            else if (v !== undefined && this.showControl === 'air') col = v >= AIR_HIGH ? COLOR.held : v > AIR_LOW ? COLOR.contested : COLOR.enemy;
            else if (v !== undefined) col = v >= CONTROL_SAFE ? COLOR.held : v >= CONTROL_LOW ? COLOR.contested : COLOR.enemy;
          }
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
    // 天候の前線 (0.0.72): rain, fog and storms drifting east, faint under everything else.
    const FRONT_COLOR: Record<Weather, number> = { [Weather.Clear]: 0, [Weather.Overcast]: 0x7f9bb8, [Weather.Fog]: 0xdfe8f0, [Weather.Storm]: 0x9d6bd6 };
    for (const f of frontsAt(Date.now(), cols, WORLD_MAP.rows)) {
      const sx = x0 + ((((f.c - this.left) % cols) + cols) % cols) * k;
      g.fillStyle(FRONT_COLOR[f.weather], f.weather === Weather.Storm ? 0.32 : 0.2);
      for (const dx of [0, -cols * k]) g.fillRect(sx + dx, y0 + (f.r0 - this.top) * k, f.width * k, f.rows * k);
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
    // 艦隊の一覧 (0.0.72): the fleets away (squares; hollow when under way) and the enemy seen near them (red).
    for (const fl of this.d.fleets?.() ?? []) {
      if (fl.index === -1) continue;
      const p = this.pointOf(fl.at);
      if (!p) continue;
      const s = Math.max(4, k * 0.45);
      if (fl.moving) g.lineStyle(2, Colors.cyan, 1).strokeRect(p.x - s, p.y - s, s * 2, s * 2);
      else g.fillStyle(Colors.cyan, 0.9).fillRect(p.x - s, p.y - s, s * 2, s * 2);
    }
    for (const e of this.d.sightings?.() ?? []) {
      const p = this.pointOf(e);
      if (!p) continue;
      // 反攻艦隊 (0.0.74): larger and orange, wherever it is.
      if (e.kind === 'counter') g.fillStyle(0xff8a3d, 1).fillCircle(p.x, p.y, Math.max(4, k * 0.5));
      else g.fillStyle(e.kind === 'convoy' ? Colors.gold : Colors.danger, 0.95).fillCircle(p.x, p.y, Math.max(2.5, k * 0.3));
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
    // 艦隊の一覧 (0.0.72): a switch at the panel's top right between the route and the fleets.
    if (this.d.fleets) {
      const tw = IS_PORTRAIT ? 170 : 120;
      const th = IS_PORTRAIT ? 44 : 32;
      add(new UIButton(this, P.x + P.w - 16 - tw / 2, P.y + 16 + th / 2, this.listMode ? '航路に戻る' : '艦隊の一覧', () => {
        this.listMode = !this.listMode;
        this.listNote = '';
        this.drawPanel();
      }, { variant: this.listMode ? 'secondary' : 'primary', width: tw, height: th, fontSize: IS_PORTRAIT ? 14 : 12 }));
      // The narrow landscape panel keeps the switch on a row of its own.
      if (!IS_PORTRAIT) y += th + 8;
      if (this.listMode) {
        this.drawFleetList(add, x, y, w, P.y + P.h - 16);
        return;
      }
    }
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true } };
    const line = (text: string, size: number, color: string = Css.text): void => {
      const t = add(this.add.text(x, y, text, textStyle(size, color, wrap)));
      y += t.height + 6;
    };
    const here = theaterOf(this.d.at.c, this.d.at.r);
    add(this.add.text(x, y, '現在地', eyebrowStyle(11, Css.gold)));
    y += 20;
    line(`${here ? THEATER_JA[here] : '沿岸'} · ${lonLatText(this.d.at)}`, 14);
    // 世界の時計 (0.0.72): a real five minutes to the world hour; the fronts drift east (紫 嵐・白 霧・青 雨).
    const sky = seaSky(Date.now(), this.d.at.c, this.d.at.r, lonLatOf(this.d.at).lon, WORLD_MAP.cols, WORLD_MAP.rows);
    line(`現地 ${clockText(sky.hour)} (${TIME_LABEL[sky.time]})  ·  ${WEATHER_LABEL[sky.weather]}  ·  前線: 紫 嵐・白 霧・青 雨`, 12, Css.muted);
    line(`燃料 ${Math.ceil(this.d.fuel)} / ${FUEL_MAX}  ·  探索 ${exploredCount(this.d.explored)} 区画`, 13, this.d.fuel <= 20 ? Css.danger : Css.cyan);
    y += 6;
    const home = homePort(this.d.nation);
    const dest = this.dest;
    let go: ISectorRef[] | null = null;
    let airRegion: ISeaRegion | null = null;
    if (dest) {
      add(this.add.text(x, y, '行き先', eyebrowStyle(11, Css.gold)));
      y += 20;
      const t = theaterOf(dest.c, dest.r);
      const areaId = areaAt(dest);
      const area = areaId ? DATA.areas.find((a) => a.id === areaId) : undefined;
      if (area && this.open.has(area.theater)) line(`作戦海域: ${area.name} (${OBJECTIVE_LABEL[area.objective ?? Objective.Annihilate]})`, 13, Css.gold);
      // 海の地方 (0.0.74)
      const region = isSea(dest.c, dest.r) ? regionAt(dest) : null;
      const v = region ? this.control[region.id] : undefined;
      if (region && v !== undefined) line(`${region.name} · 制海権 ${v}% (${controlWord(v)}) · 制空権 ${this.air[region.id] ?? 50}%${this.supplied.has(region.id) ? ' · 補給線の中' : ''}`, 13, v >= CONTROL_SAFE ? Css.success : v >= CONTROL_LOW ? Css.gold : Css.danger);
      airRegion = region && v !== undefined ? region : null;
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
    line(LEGEND[this.showControl], 11, Css.muted);

    const by = P.y + P.h - 16 - L.bh / 2;
    const half = (w - 12) / 2;
    const goBtn = add(new UIButton(this, x + half / 2, by, 'ここへ向かう', () => go && this.choose(go), { variant: go ? 'gold' : 'secondary', width: half, height: L.bh, fontSize: IS_PORTRAIT ? 16 : 13 }));
    goBtn.setEnabled(go !== null && go.length > 1);
    const homeRoute = home ? findRoute(this.d.at, home) : null;
    const homeBtn = add(new UIButton(this, x + w - half / 2, by, '軍港へ', () => homeRoute && this.choose(homeRoute), { variant: 'primary', width: half, height: L.bh, fontSize: IS_PORTRAIT ? 16 : 13 }));
    homeBtn.setEnabled(homeRoute !== null && homeRoute.length > 1);
    // 航空の任務 (0.0.75): a base air group that reaches the region picked can be sent on a mission there.
    if (airRegion) this.drawAirOps(add, airRegion, x, w, by - L.bh - 10);
    for (const o of this.layer) if (o instanceof Phaser.GameObjects.Text) fitText(o, w);
  }

  /** 航空の任務 (0.0.75): the nearest base air group reaching the region, its mission picked in turn, sent or called off. */
  private drawAirOps(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, region: ISeaRegion, x: number, w: number, by: number): void {
    const progress = loadProgress();
    const field = fieldsFor(region, airFields(progress))[0];
    if (!field) return;
    const ops = progress.sea?.airOps ?? [];
    const current = ops.find((o) => o.base === field.id);
    const here = current?.region === region.id;
    const mission = AIR_MISSIONS[this.airMission];
    const half = (w - 12) / 2;
    const bh = IS_PORTRAIT ? 48 : 36;
    add(new UIButton(this, x + half / 2, by, `航空: ${AIR_MISSION_JA[mission]}`, () => {
      this.airMission = (this.airMission + 1) % AIR_MISSIONS.length;
      this.drawPanel();
    }, { variant: 'secondary', width: half, height: bh, fontSize: IS_PORTRAIT ? 14 : 12 }));
    add(new UIButton(this, x + w - half / 2, by, here ? '航空任務を解く' : `${field.name}から出す`, () => {
      const p = loadProgress();
      const sea = p.sea ?? emptySeaControl();
      const next = here ? clearAirOp(sea.airOps ?? [], field.id) : setAirOp(sea.airOps ?? [], field.id, mission, region.id, Date.now());
      saveProgress({ ...p, sea: { ...sea, airOps: next } });
      this.air = navyAir(loadProgress(), Date.now(), this.open);
      if (this.showControl === 'air') this.drawTexture(true);
      this.drawPanel();
    }, { variant: here ? 'secondary' : 'primary', width: half, height: bh, fontSize: IS_PORTRAIT ? 14 : 12 }));
    const note = current ? `${field.name}の基地航空隊: ${AIR_MISSION_JA[current.mission]} (${regionById(current.region)?.name ?? ''})` : `${field.name}の基地航空隊が届きます (待機中)`;
    const t = add(this.add.text(x, by - bh / 2 - 8, note, textStyle(11, current ? Css.cyan : Css.muted)).setOrigin(0, 1));
    fitText(t, w);
  }

  /**
   * 艦隊の一覧 (0.0.72): each fleet with where it is, its worst-hurt ship, its fuel and its 帰投の基準; 指揮を移す, and
   * 回航 to the destination picked on the chart (a base of the navy there, else that sea).
   */
  private drawFleetList(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, x: number, top: number, w: number, bottom: number): void {
    const fleets = this.d.fleets?.() ?? [];
    let y = top;
    add(this.add.text(x, y, '艦隊の一覧', eyebrowStyle(11, Css.gold)));
    y += IS_PORTRAIT ? 40 : 22;
    const hint = this.listNote || (this.dest ? '「ここへ回航」で、海図で選んだ所へ向かわせます' : '海図で行き先を選ぶと「ここへ回航」できます');
    const note = add(this.add.text(x, y, hint, textStyle(12, this.listNote ? Css.gold : Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    y += note.height + 10;
    const bh = IS_PORTRAIT ? 44 : 30;
    // 0.0.73: a fleet away has a second row of orders (哨戒・命令を解く・哨戒の構え).
    const rowH = (IS_PORTRAIT ? 86 : 72) + bh * 2 + 8;
    const per = Math.max(1, Math.floor((bottom - y - bh - 8) / rowH));
    const pages = Math.max(1, Math.ceil(fleets.length / per));
    this.listPage = Math.min(this.listPage, pages - 1);
    for (const fl of fleets.slice(this.listPage * per, this.listPage * per + per)) {
      const title = add(this.add.text(x, y, fl.label, textStyle(13, fl.index < 0 ? Css.gold : Css.text, { fontStyle: 'bold' })));
      fitText(title, w);
      y += IS_PORTRAIT ? 22 : 18;
      if (fl.place) {
        const where = add(this.add.text(x, y, fl.place, textStyle(11, fl.moving ? Css.cyan : Css.muted)));
        fitText(where, w);
        y += IS_PORTRAIT ? 22 : 17;
      }
      const t = add(this.add.text(x, y, `耐久 ${Math.round(fl.minHp * 100)}% (一番低い艦)  ·  燃料 ${Math.ceil(fl.fuel)}`, textStyle(11, fl.minHp <= 0.25 ? Css.danger : Css.muted)));
      fitText(t, w);
      y += IS_PORTRAIT ? 24 : 19;
      const bw = (w - 16) / 3;
      const by = y + bh / 2;
      const ruleNext = RETURN_RULES[(RETURN_RULES.indexOf(fl.rule) + 1) % RETURN_RULES.length];
      // An expedition: taken over where it is (its reward is given up); its 帰投の基準 is always 大破.
      if (fl.expedition) {
        const id = fl.expedition;
        add(new UIButton(this, x + bw / 2, by, '指揮を移す', () => this.d.onSwitchExpedition?.(id), { variant: 'gold', width: bw, height: bh, fontSize: IS_PORTRAIT ? 13 : 11 }));
        add(this.add.text(x + bw + 16, by, '移すと遠征は取りやめ (報酬なし)', textStyle(11, Css.muted)).setOrigin(0, 0.5));
        y += bh + 10;
        continue;
      }
      add(new UIButton(this, x + bw * 2.5 + 16, by, `帰投 ${RETURN_SHORT[fl.rule]}`, () => {
        this.d.onRule?.(fl.index, ruleNext);
        this.listNote = `帰投の基準を「${RETURN_JA[ruleNext]}」にしました`;
        this.drawPanel();
      }, { variant: 'secondary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 12 : 10 }));
      if (fl.index >= 0) {
        add(new UIButton(this, x + bw / 2, by, '指揮を移す', () => {
          this.d.onSwitch?.(fl.index);
        }, { variant: 'gold', width: bw, height: bh, fontSize: IS_PORTRAIT ? 13 : 11 }));
        const route = this.dest && !fl.moving ? findRoute(fl.at, this.dest) : null;
        const go = add(new UIButton(this, x + bw * 1.5 + 8, by, 'ここへ回航', () => {
          if (!route) return;
          const why = this.d.onOrder?.(fl.index, route) ?? null;
          this.listNote = why ?? `${fl.label}が回航を始めました (燃料 ${routeFuel(route)})`;
          this.drawChart();
          this.drawPanel();
        }, { variant: 'primary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 13 : 11 }));
        go.setEnabled(route !== null && route.length > 1);
        // 任務 (0.0.73 哨戒, 0.0.74 the rest): round the place picked on the chart (迎撃: in the base it lies in);
        // 命令を解く stops it where it is.
        const by2 = by + bh + 8;
        const duty = DUTIES[this.duty];
        const to = this.dest && !fl.moving ? findRoute(fl.at, this.dest) : null;
        const intercept = duty.mission === 'intercept';
        add(new UIButton(this, x + bw / 2, by2, intercept ? 'ここで迎撃' : 'ここで任務', () => {
          let why: string | null;
          if (intercept) why = this.d.onIntercept?.(fl.index) ?? null;
          else {
            if (!to || !this.dest) return;
            why = this.d.onPatrol?.(fl.index, this.dest, duty.stance, duty.mission as MissionKind) ?? null;
          }
          this.listNote = why ?? `${fl.label}が${MISSION_JA[duty.mission]}の任務に就きました (${duty.hint})`;
          this.drawChart();
          this.drawPanel();
        }, { variant: 'primary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 13 : 11 })).setEnabled(intercept ? !!fl.atBase && !fl.intercept : to !== null && this.dest !== null && isSea(this.dest.c, this.dest.r));
        add(new UIButton(this, x + bw * 1.5 + 8, by2, '命令を解く', () => {
          this.d.onStop?.(fl.index);
          this.listNote = fl.intercept ? `${fl.label}は迎撃の待機を解きました` : `${fl.label}はその場で停泊します`;
          this.drawChart();
          this.drawPanel();
        }, { variant: 'secondary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 13 : 11 })).setEnabled(fl.moving || !!fl.intercept);
        add(new UIButton(this, x + bw * 2.5 + 16, by2, `任務: ${duty.label}`, () => {
          this.duty = (this.duty + 1) % DUTIES.length;
          this.listNote = `任務「${DUTIES[this.duty].label}」: ${DUTIES[this.duty].hint}`;
          this.drawPanel();
        }, { variant: 'secondary', width: bw, height: bh, fontSize: IS_PORTRAIT ? 12 : 10 }));
        y += bh + 8;
      }
      y += bh + 10;
    }
    if (fleets.length <= 1) add(this.add.text(x, y, 'ほかの艦隊はありません。航海中に「分離・合流」の待機で艦隊を分けられます', textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } })));
    if (pages > 1) {
      const pw = IS_PORTRAIT ? 90 : 70;
      const py = bottom - bh / 2;
      add(new UIButton(this, x + pw / 2, py, '‹', () => { this.listPage = (this.listPage + pages - 1) % pages; this.drawPanel(); }, { variant: 'secondary', width: pw, height: bh, fontSize: 16 }));
      add(new UIButton(this, x + w - pw / 2, py, '›', () => { this.listPage = (this.listPage + 1) % pages; this.drawPanel(); }, { variant: 'secondary', width: pw, height: bh, fontSize: 16 }));
      add(this.add.text(x + w / 2, py, `${this.listPage + 1} / ${pages}`, textStyle(12, Css.muted)).setOrigin(0.5));
    }
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
