import Phaser from 'phaser';
import { CANVAS_W, DEPTH_HUD, DEPTH_WATER_FX, IS_PORTRAIT } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { resolveMap } from '@/systems/MapSystem';
import {
  EXPLORE_RADIUS, FUEL_MAX, ISectorRef, NO_FUEL_SPEED, PORT_RADIUS, SECTOR_PX, WORLD_MAP, WORLD_PX, IOpenSeaProgress,
  IAnchorPlace, anchorAt, explore, fuelForPx, isSea, lonLatText, sectorAt, sectorContent, sectorWindow, theaterOf, wrapCol,
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
  /** Ends the voyage in the port (bases.json id) */
  enterPort(baseId: string): void;
  /** Calls at a port on the sea (0.0.70): fuel and a patch-up, the voyage goes on */
  callAt(placeId: string): void;
  /** Sails through an oil field's or a mine's ring (0.0.70) */
  passBy(placeId: string): void;
  /** The sheet of 帰投・待機・合流 orders (艦隊の分離, 0.0.70) */
  openSeparation(): void;
  /** Starts a drill at a practice ground (訓練海域・演習場, 0.0.70) */
  startDrill(kind: 'training' | 'exercise'): void;
}

/** A ring on the sea: one of the navy's bases (put in and lie there), a port (supply), an oil field or a mine. */
export type VoyageStopKind = 'base' | 'port' | 'oil' | 'mine' | 'training' | 'exercise';
export type IVoyageStop = { id: string; name: string; kind?: VoyageStopKind } & ISectorRef;

const STOP_MARK: Record<VoyageStopKind, string> = { base: '⚓', port: '⚓', oil: '油', mine: '鉱', training: '訓', exercise: '演' };

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
  /** The navy's open bases (the home port first), its ports, oil fields and mines (0.0.70) */
  private readonly ports: IVoyageStop[];
  private portHere: IVoyageStop | null = null;
  /** The resource ring passed last (paid once on the way in) */
  private passedHere: string | null = null;

  /** The tank at the last fill (0.0.70: a fleet lying at sea puts out with what it had left) and the distance then */
  private tank = FUEL_MAX;
  private filledAtPx = 0;

  constructor(private readonly host: IVoyageHost, readonly nation: string, saved: IOpenSeaProgress, ports: IVoyageStop[], startFuel = FUEL_MAX) {
    this.explored = saved.explored;
    this.ports = ports;
    this.tank = startFuel;
    this.fuel = startFuel;
  }

  /** A full tank (a port on the sea, 0.0.70). */
  refuel(): void {
    this.tank = FUEL_MAX;
    this.filledAtPx = this.sailedPx;
    this.fuel = FUEL_MAX;
  }

  /** Where the fleet puts to sea: just off the base it lay at, or the very point at sea it stopped at. */
  static startPoint(at: IAnchorPlace): { x: number; y: number } {
    if (!at.base) return { x: at.x, y: at.y };
    // Off the harbour, on the side with the most sea.
    const s = sectorAt(at.x, at.y);
    const off = PORT_RADIUS + 200;
    const sides: Array<[number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const best = sides.find(([dx, dy]) => isSea(s.c + dx, s.r + dy)) ?? [0, 1];
    const len = Math.hypot(best[0], best[1]);
    return { x: at.x + (best[0] / len) * off, y: at.y + (best[1] / len) * off };
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
    // 艦隊の分離 (0.0.70): under the readout.
    new UIButton(scene, x, y + (IS_PORTRAIT ? 96 : 76), '分離・合流', () => this.host.openSeparation(), { variant: 'secondary', width: w, height: h, fontSize: IS_PORTRAIT ? 15 : 13 })
      .setDepth(DEPTH_HUD + 2).setScrollFactor(0);
    this.portBtn = new UIButton(scene, CANVAS_W / 2, IS_PORTRAIT ? 420 : 200, '入港する', () => {
      const here = this.portHere;
      if (!here) return;
      if (here.kind === 'port') this.host.callAt(here.id);
      else if (here.kind === 'training' || here.kind === 'exercise') this.host.startDrill(here.kind);
      else this.host.enterPort(here.id);
    }, {
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
    this.fuel = Math.max(0, this.tank - fuelForPx(this.sailedPx - this.filledAtPx));
    if (this.fuel <= 0) for (const s of this.host.ships()) s.envSpeedMul *= NO_FUEL_SPEED;

    const here = { c: Math.floor(f.x / SECTOR_PX), r: Math.max(0, Math.min(WORLD_MAP.rows - 1, Math.floor(f.y / SECTOR_PX))) };
    if (here.c !== this.centre.c || here.r !== this.centre.r) {
      this.centre = here;
      this.stream(here);
      this.explored = explore(this.explored, { c: wrapCol(here.c), r: here.r }, EXPLORE_RADIUS);
    }
    // In one of the navy's open harbours: the fleet can put in (and lie there, 停泊); a port on the sea refills the
    // tank; an oil field or a mine pays as the fleet sails through (0.0.70).
    const ring = this.ports.find((p) => Math.hypot(this.nearestX((p.c + 0.5) * SECTOR_PX, f.x) - f.x, (p.r + 0.5) * SECTOR_PX - f.y) <= PORT_RADIUS) ?? null;
    const resource = ring && (ring.kind === 'oil' || ring.kind === 'mine') ? ring : null;
    if (resource && this.passedHere !== resource.id) this.host.passBy(resource.id);
    this.passedHere = resource?.id ?? null;
    const port = resource ? null : ring;
    if (port?.id !== this.portHere?.id) {
      this.portHere = port;
      if (port) this.portBtn?.setLabel(port.kind === 'port' ? `${port.name}で補給する` : port.kind === 'training' ? '訓練を始める' : port.kind === 'exercise' ? '演習を始める' : `${port.name}に入港する`);
    }
    this.portBtn?.setVisible(port !== null);
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
    // The navy's harbours, ports and resource points: a ring and the name (a second one in the same sector below).
    this.ports.filter((p) => p.c === wrapCol(at.c) && p.r === at.r).forEach((port, i) => {
      const cx = x0 + SECTOR_PX / 2;
      const cy = y0 + SECTOR_PX / 2;
      const kind = port.kind ?? 'base';
      const color = kind === 'base' ? Colors.gold : kind === 'port' || kind === 'training' || kind === 'exercise' ? Colors.cyan : Colors.success;
      const css = kind === 'base' ? Css.gold : kind === 'port' || kind === 'training' || kind === 'exercise' ? Css.cyan : Css.success;
      const ring = scene.add.graphics().setDepth(DEPTH_WATER_FX - 1);
      ring.lineStyle(6, color, 0.55).strokeCircle(cx, cy, PORT_RADIUS);
      ring.fillStyle(color, 0.08).fillCircle(cx, cy, PORT_RADIUS);
      drawn.push(ring);
      drawn.push(scene.add.text(cx, cy + i * 90, `${STOP_MARK[kind]} ${port.name}`, textStyle(64, css, { fontStyle: 'bold', stroke: Css.bgDeep, strokeThickness: 8 })).setOrigin(0.5).setDepth(DEPTH_WATER_FX - 1).setAlpha(0.8));
    });
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
  result(saved: IOpenSeaProgress, shipIds: readonly string[], at: IAnchorPlace): IOpenSeaProgress {
    return { explored: this.explored, sailedPx: saved.sailedPx + this.sailedPx, voyages: saved.voyages + 1, anchors: anchorAt(saved.anchors, shipIds, at, this.nation, this.fuel) };
  }

  /** The flagship's place, wrapped into the world (for lying at sea). */
  seaPlace(): IAnchorPlace {
    const f = this.host.flagship();
    return { x: ((f.x % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w, y: f.y };
  }

  /** The sector the flagship is in (wrapped). */
  here(): ISectorRef {
    const f = this.host.flagship();
    return sectorAt(f.x, f.y);
  }
}
