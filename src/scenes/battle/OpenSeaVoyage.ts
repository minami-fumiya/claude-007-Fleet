import Phaser from 'phaser';
import { CANVAS_W, DEPTH_HUD, DEPTH_WATER_FX, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { resolveMap } from '@/systems/MapSystem';
import {
  EXPLORE_RADIUS, FUEL_MAX, ISectorRef, NO_FUEL_SPEED, PORT_RADIUS, SECTOR_PX, WORLD_MAP, WORLD_PX, IOpenSeaProgress,
  explore, fuelForPx, homePort, isSea, lonLatText, sectorAt, sectorContent, sectorWindow, theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { IResolvedMap } from '@/types/Map';
import { drawMap } from '@/ui/MapView';
import { Minimap } from '@/ui/Minimap';
import { UIButton } from '@/ui/components/UIKit';
import { Colors, Css, textStyle } from '@/ui/theme';

/** What the battle scene lends the voyage. */
export interface IVoyageHost {
  scene: Phaser.Scene;
  /** The battle's map, filled in place with the loaded sectors' land (ships' land avoidance reads it) */
  map: IResolvedMap;
  flagship(): BaseShip;
  /** The player's ships (they are moved when the fleet crosses the east-west join) */
  ships(): BaseShip[];
  /** Registers a loaded sector's land with the battle's colliders; the colliders are dropped with the sector */
  addLand(group: Phaser.Physics.Arcade.StaticGroup): Phaser.Physics.Arcade.Collider[];
  /** Moves what else lives in world pixels (shells, aircraft) by `dx` */
  shiftWorld(dx: number): void;
  minimap: Minimap;
  /** Opens the chart over the battle */
  openChart(): void;
  /** Ends the voyage in port */
  enterPort(): void;
}

interface ILoadedSector {
  /** Unwrapped column (may be -1 or cols) and row */
  c: number;
  r: number;
  group: Phaser.Physics.Arcade.StaticGroup;
  colliders: Phaser.Physics.Arcade.Collider[];
  drawn: Phaser.GameObjects.GameObject[];
  map: IResolvedMap;
}

const THEATER_JA: Record<string, string> = {
  pacific: '南太平洋', north_pacific: '北太平洋', atlantic: '北大西洋', south_atlantic: '南大西洋', mediterranean: '地中海',
  baltic: 'バルト海', blacksea: '黒海', indian: 'インド洋', arctic: '北極海',
};

/**
 * 本当のオープンワールド (#445, 0.0.68 段階 A1): the battle screen sailing the world. The sectors round the flagship
 * are loaded (land, shoals, the home port) and the far ones dropped; crossing the east-west join moves everything by
 * the world's width; fuel burns by the distance sailed. 0.0.69: no time compression; the chart's route is sailed by
 * the autopilot (自動航行) at the fleet's own speed.
 */
export class OpenSeaVoyage {
  fuel = FUEL_MAX;
  explored: string;
  /** Pixels the flagship has sailed this voyage */
  sailedPx = 0;
  /** The chart's route: sector centres still to reach */
  private route: ISectorRef[] = [];
  private loaded: ILoadedSector[] = [];
  private centre: ISectorRef = { c: -999, r: -999 };
  private last: { x: number; y: number } | null = null;
  private info!: Phaser.GameObjects.Text;
  private portBtn!: UIButton;
  private routeGfx!: Phaser.GameObjects.Graphics;
  private readonly home: ISectorRef & { name: string };

  constructor(private readonly host: IVoyageHost, readonly nation: string, saved: IOpenSeaProgress) {
    this.explored = saved.explored;
    this.home = homePort(nation) ?? { name: '軍港', c: 0, r: 0 };
  }

  /** Where the fleet puts to sea: just off its home port. */
  static startPoint(nation: string): { x: number; y: number } {
    const home = homePort(nation) ?? { c: 0, r: 0 };
    return { x: (home.c + 0.5) * SECTOR_PX, y: (home.r + 0.5) * SECTOR_PX + PORT_RADIUS + 200 };
  }

  /** The physics and camera bounds: the world plus one sector each side, for the east-west join. */
  static bounds(): { x: number; y: number; w: number; h: number } {
    return { x: -SECTOR_PX, y: 0, w: WORLD_PX.w + 2 * SECTOR_PX, h: WORLD_PX.h };
  }

  /** The voyage's own buttons and readout, under the minimap. */
  buildUi(minimapBottom: number): void {
    const scene = this.host.scene;
    const w = IS_PORTRAIT ? 150 : 200;
    const x = CANVAS_W - 20 - w / 2;
    const h = IS_PORTRAIT ? 52 : 40;
    let y = minimapBottom + 16 + h / 2;
    new UIButton(scene, x, y, '海図', () => this.host.openChart(), { variant: 'primary', width: w, height: h, fontSize: IS_PORTRAIT ? 16 : 14 })
      .setDepth(DEPTH_HUD + 2).setScrollFactor(0);
    y += h / 2 + 10;
    this.info = scene.add.text(CANVAS_W - 20, y, '', textStyle(IS_PORTRAIT ? 13 : 12, Css.text, { align: 'right', lineSpacing: 4, stroke: Css.bgDeep, strokeThickness: 3 }))
      .setOrigin(1, 0).setDepth(DEPTH_HUD + 2).setScrollFactor(0);
    this.portBtn = new UIButton(scene, CANVAS_W / 2, IS_PORTRAIT ? 420 : 200, `${this.home.name}に入港する`, () => this.host.enterPort(), {
      variant: 'gold', width: IS_PORTRAIT ? 320 : 300, height: IS_PORTRAIT ? 60 : 48, fontSize: IS_PORTRAIT ? 17 : 15,
    });
    this.portBtn.setDepth(DEPTH_HUD + 3).setScrollFactor(0).setVisible(false);
    this.routeGfx = scene.add.graphics().setDepth(DEPTH_WATER_FX + 2);
  }

  /** The chart's destination: the route to follow, sector by sector. */
  setRoute(route: readonly ISectorRef[]): void {
    this.route = route.slice(1).map((s) => ({ ...s }));
  }

  get hasRoute(): boolean {
    return this.route.length > 0;
  }

  get routeLeft(): readonly ISectorRef[] {
    return this.route;
  }

  clearRoute(): void {
    this.route = [];
  }

  /** The next point to steer for (the nearest copy of the next sector's centre across the join), or null. */
  waypoint(): { x: number; y: number } | null {
    const f = this.host.flagship();
    while (this.route.length > 0) {
      const next = this.route[0];
      const x = this.nearestX((next.c + 0.5) * SECTOR_PX, f.x);
      const y = (next.r + 0.5) * SECTOR_PX;
      // Passing within a third of a sector of a centre counts; the last one is reached properly.
      const arrive = this.route.length === 1 ? 300 : SECTOR_PX / 3;
      if (Math.hypot(x - f.x, y - f.y) > arrive) return { x, y };
      this.route.shift();
    }
    return null;
  }

  private nearestX(x: number, near: number): number {
    let best = x;
    for (const k of [-1, 1]) if (Math.abs(x + k * WORLD_PX.w - near) < Math.abs(best - near)) best = x + k * WORLD_PX.w;
    return best;
  }

  /** Every frame (after the sea has set the ships' speeds). */
  update(): void {
    const f = this.host.flagship();
    if (!f.active) return;
    if (f.x >= WORLD_PX.w) this.shift(-WORLD_PX.w);
    else if (f.x < 0) this.shift(WORLD_PX.w);

    if (this.last) this.sailedPx += Math.hypot(f.x - this.last.x, f.y - this.last.y);
    this.last = { x: f.x, y: f.y };
    this.fuel = Math.max(0, FUEL_MAX - fuelForPx(this.sailedPx));
    if (this.fuel <= 0) for (const s of this.host.ships()) s.envSpeedMul *= NO_FUEL_SPEED;

    const here = { c: Math.floor(f.x / SECTOR_PX), r: Math.max(0, Math.min(WORLD_MAP.rows - 1, Math.floor(f.y / SECTOR_PX))) };
    if (here.c !== this.centre.c || here.r !== this.centre.r) {
      this.centre = here;
      this.stream(here);
      this.explored = explore(this.explored, { c: wrapCol(here.c), r: here.r }, EXPLORE_RADIUS);
    }
    const portX = this.nearestX((this.home.c + 0.5) * SECTOR_PX, f.x);
    const inPort = Math.hypot(portX - f.x, (this.home.r + 0.5) * SECTOR_PX - f.y) <= PORT_RADIUS;
    this.portBtn?.setVisible(inPort);
    this.drawRoute();
    this.refreshInfo(here);
  }

  get inPort(): boolean {
    return this.portBtn?.visible ?? false;
  }

  private refreshInfo(here: ISectorRef): void {
    if (!this.info) return;
    const s = { c: wrapCol(here.c), r: here.r };
    const theater = theaterOf(s.c, s.r);
    const place = sectorContent(s.c, s.r).place;
    const fuel = Math.ceil(this.fuel);
    const lines = [
      `${theater ? THEATER_JA[theater] : '沿岸'}${place ? ` · ${place}` : ''}`,
      lonLatText(s),
      `燃料 ${fuel} / ${FUEL_MAX}${fuel <= 0 ? ' (微速)' : ''}`,
    ];
    const text = lines.join('\n');
    if (this.info.text !== text) {
      this.info.setText(text);
      this.info.setColor(fuel <= 20 ? Css.danger : Css.text);
    }
  }

  /** The route ahead as a dotted line from the flagship. */
  private drawRoute(): void {
    const g = this.routeGfx;
    if (!g) return;
    g.clear();
    if (this.route.length === 0) return;
    const f = this.host.flagship();
    g.fillStyle(Colors.gold, 0.7);
    let px = f.x;
    let py = f.y;
    for (const s of this.route.slice(0, 6)) {
      const x = this.nearestX((s.c + 0.5) * SECTOR_PX, px);
      const y = (s.r + 0.5) * SECTOR_PX;
      const n = Math.max(1, Math.floor(Math.hypot(x - px, y - py) / 160));
      for (let i = 1; i <= n; i++) g.fillCircle(px + ((x - px) * i) / n, py + ((y - py) * i) / n, 6);
      [px, py] = [x, y];
    }
  }

  /** Loads the sectors round `centre` and drops the rest; the map the ships steer by is rebuilt from them. */
  private stream(centre: ISectorRef): void {
    const want = sectorWindow(centre);
    const keep = (l: ILoadedSector): boolean => want.some((w) => w.c === l.c && w.r === l.r);
    for (const l of this.loaded.filter((x) => !keep(x))) this.unload(l);
    this.loaded = this.loaded.filter(keep);
    for (const w of want) if (!this.loaded.some((l) => l.c === w.c && l.r === w.r)) this.loaded.push(this.load(w));
    const m = this.host.map;
    m.islands.splice(0, m.islands.length, ...this.loaded.flatMap((l) => l.map.islands));
    m.shoals.splice(0, m.shoals.length, ...this.loaded.flatMap((l) => l.map.shoals));
    m.currents.splice(0, m.currents.length, ...this.loaded.flatMap((l) => l.map.currents));
    const ox = (centre.c - 1) * SECTOR_PX;
    const oy = (centre.r - 1) * SECTOR_PX;
    const land = this.loaded.filter((l) => !isSea(l.c, l.r)).map((l) => ({ x: l.c * SECTOR_PX, y: l.r * SECTOR_PX, w: SECTOR_PX, h: SECTOR_PX }));
    this.host.minimap.setWindow(ox, oy, { islands: this.loaded.filter((l) => isSea(l.c, l.r)).flatMap((l) => l.map.islands), shoals: [], currents: [] }, land);
  }

  private load(at: ISectorRef): ILoadedSector {
    const scene = this.host.scene;
    const content = sectorContent(at.c, at.r);
    const local = resolveMap(content, SECTOR_PX, SECTOR_PX);
    const x0 = at.c * SECTOR_PX;
    const y0 = at.r * SECTOR_PX;
    const map: IResolvedMap = {
      islands: local.islands.map((i) => i.map((c) => ({ ...c, x: c.x + x0, y: c.y + y0 }))),
      shoals: local.shoals.map((c) => ({ ...c, x: c.x + x0, y: c.y + y0 })),
      currents: local.currents.map((z) => ({ ...z, x: z.x + x0, y: z.y + y0 })),
    };
    const drawn: Phaser.GameObjects.GameObject[] = [];
    const group = drawMap(scene, map, drawn);
    // The home port: a harbour ring and its name.
    if (wrapCol(at.c) === this.home.c && at.r === this.home.r) {
      const cx = x0 + SECTOR_PX / 2;
      const cy = y0 + SECTOR_PX / 2;
      const ring = scene.add.graphics().setDepth(DEPTH_WATER_FX - 1);
      ring.lineStyle(6, Colors.gold, 0.55).strokeCircle(cx, cy, PORT_RADIUS);
      ring.fillStyle(Colors.gold, 0.08).fillCircle(cx, cy, PORT_RADIUS);
      drawn.push(ring);
      drawn.push(scene.add.text(cx, cy, `⚓ ${this.home.name}`, textStyle(64, Css.gold, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 8 })).setOrigin(0.5).setDepth(DEPTH_WATER_FX - 1).setAlpha(0.8));
    }
    return { ...at, group, colliders: this.host.addLand(group), drawn, map };
  }

  private unload(l: ILoadedSector): void {
    for (const c of l.colliders) c.destroy();
    l.group.destroy(true);
    for (const d of l.drawn) d.destroy();
  }

  /** Crossing the east-west join: everything moves by the world's width and the sectors are loaded again. */
  private shift(dx: number): void {
    for (const s of this.host.ships()) s.x += dx;
    this.host.shiftWorld(dx);
    const cam = this.host.scene.cameras.main;
    cam.scrollX += dx;
    if (this.last) this.last.x += dx;
    for (const l of this.loaded) this.unload(l);
    this.loaded = [];
    this.centre = { c: -999, r: -999 };
  }

  /** What the voyage leaves in the save. */
  result(saved: IOpenSeaProgress): IOpenSeaProgress {
    return { explored: this.explored, sailedPx: saved.sailedPx + this.sailedPx, voyages: saved.voyages + 1 };
  }

  /** The sector the flagship is in (wrapped). */
  here(): ISectorRef {
    const f = this.host.flagship();
    return sectorAt(f.x, f.y);
  }
}
