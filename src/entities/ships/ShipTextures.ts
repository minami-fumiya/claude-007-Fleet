import Phaser from 'phaser';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';

/**
 * Procedural top-down ship sprites, one per ship in the data files. Bow points up (angle 0 = north),
 * matching how BattleScene moves ships. Colours are light so `setTint()` (enemy red) reads clearly.
 */

type Draw = (g: Phaser.GameObjects.Graphics, w: number, h: number, shade: number, nation: Nation) => void;

const OUTLINE = 0x5d6b80;
const DECK = 0xa9b6c8;
const TURRET = 0x66738a;
const STRUCTURE = 0x8692a8;
const FUNNEL = 0x4a5568;

/**
 * Hull paint per navy, light enough that the enemy red tint still reads: [base, darker sister-ship shade].
 * IJN grey, USN haze blue, KM pale grey, RN light grey, FR warm grey, SU green-grey, RM pale sand.
 */
const NATION_HULL: Record<Nation, [number, number]> = {
  [Nation.IJN]: [0xc5d0df, 0xa9b6c8],
  [Nation.USN]: [0xbccde6, 0x9fb3d0],
  [Nation.KM]: [0xd3d8de, 0xb4bcc6],
  [Nation.RN]: [0xcbd3da, 0xaab4be],
  [Nation.FR]: [0xd6d1c8, 0xb8b1a5],
  [Nation.SU]: [0xc3d1c6, 0xa4b5a8],
  [Nation.RM]: [0xdcd5c4, 0xbfb6a0],
};

function hullColor(shade: number, nation: Nation = Nation.IJN): number {
  // shade in [0, 1): small per-ship variation so sister ships are distinguishable
  const [b, d] = NATION_HULL[nation] ?? NATION_HULL[Nation.IJN];
  const base = Phaser.Display.Color.ValueToColor(b);
  const dark = Phaser.Display.Color.ValueToColor(d);
  const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(base, dark, 100, Math.round(shade * 100));
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}

function hull(g: Phaser.GameObjects.Graphics, w: number, h: number, color: number, beam = 1): void {
  const inset = (w * (1 - beam)) / 2;
  const pts = [
    [w / 2, 0],
    [w - 2 - inset, h * 0.22],
    [w - 1 - inset, h * 0.72],
    [w - 4 - inset, h - 2],
    [4 + inset, h - 2],
    [1 + inset, h * 0.72],
    [2 + inset, h * 0.22],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  g.lineStyle(1, OUTLINE, 1);
  g.strokePoints(pts, true);
}

function turret(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, barrels: number, dir: -1 | 1): void {
  g.lineStyle(1.2, TURRET, 1);
  const spread = r * 0.6;
  for (let i = 0; i < barrels; i++) {
    const bx = x + (barrels === 1 ? 0 : -spread / 2 + (spread * i) / (barrels - 1));
    g.lineBetween(bx, y, bx, y + dir * r * 2.2);
  }
  g.fillStyle(TURRET, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.25);
  g.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.4);
}

const drawBattleship: Draw = (g, w, h, shade, nation) => {
  hull(g, w, h, hullColor(shade, nation));
  g.fillStyle(DECK, 1);
  g.fillRect(w / 2 - 2, h * 0.12, 4, h * 0.8);
  turret(g, w / 2, h * 0.25, 4.5, 3, -1);
  turret(g, w / 2, h * 0.35, 4.5, 3, -1);
  turret(g, w / 2, h * 0.8, 4.5, 3, 1);
  g.fillStyle(STRUCTURE, 1);
  g.fillRoundedRect(w / 2 - 6, h * 0.42, 12, h * 0.18, 3);
  g.fillStyle(FUNNEL, 1);
  g.fillEllipse(w / 2, h * 0.64, 7, 10);
  // Secondary guns on both beams
  g.fillStyle(TURRET, 1);
  for (const y of [0.46, 0.56]) {
    g.fillCircle(4.5, h * y, 2);
    g.fillCircle(w - 4.5, h * y, 2);
  }
};

const drawCruiser: Draw = (g, w, h, shade, nation) => {
  hull(g, w, h, hullColor(shade, nation), 0.95);
  turret(g, w / 2, h * 0.22, 3.2, 2, -1);
  turret(g, w / 2, h * 0.32, 3.2, 2, -1);
  turret(g, w / 2, h * 0.74, 3.2, 2, 1);
  turret(g, w / 2, h * 0.84, 3.2, 2, 1);
  g.fillStyle(STRUCTURE, 1);
  g.fillRoundedRect(w / 2 - 4.5, h * 0.4, 9, h * 0.16, 2);
  g.fillStyle(FUNNEL, 1);
  g.fillEllipse(w / 2, h * 0.6, 5, 8);
};

const drawDestroyer: Draw = (g, w, h, shade, nation) => {
  hull(g, w, h, hullColor(shade, nation), 0.9);
  turret(g, w / 2, h * 0.22, 2.6, 1, -1);
  turret(g, w / 2, h * 0.82, 2.6, 1, 1);
  g.fillStyle(STRUCTURE, 1);
  g.fillRoundedRect(w / 2 - 3, h * 0.3, 6, h * 0.12, 2);
  g.fillStyle(FUNNEL, 1);
  g.fillEllipse(w / 2, h * 0.47, 4, 6);
  // Torpedo tubes
  g.lineStyle(1.5, TURRET, 1);
  g.lineBetween(w / 2 - 2.5, h * 0.58, w / 2 + 2.5, h * 0.64);
  g.lineBetween(w / 2 - 2.5, h * 0.66, w / 2 + 2.5, h * 0.72);
};

const drawCarrier: Draw = (g, w, h, shade, nation) => {
  hull(g, w, h, hullColor(shade, nation), 0.75);
  // Flight deck overhangs the hull
  const deck = [
    [w / 2, 2],
    [w - 3, h * 0.14],
    [w - 2, h - 4],
    [2, h - 4],
    [3, h * 0.14],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(0xc9b28a, 1);
  g.fillPoints(deck, true);
  g.lineStyle(1, 0x8d7652, 1);
  g.strokePoints(deck, true);
  // Centre line and elevators
  g.lineStyle(1, 0xffffff, 0.7);
  for (let y = h * 0.12; y < h - 8; y += 6) g.lineBetween(w / 2, y, w / 2, y + 3);
  g.fillStyle(0x9c8460, 1);
  g.fillRect(w / 2 - 4, h * 0.3, 8, 7);
  g.fillRect(w / 2 - 4, h * 0.66, 8, 7);
  // Island on the starboard side
  g.fillStyle(STRUCTURE, 1);
  g.fillRoundedRect(w - 7, h * 0.4, 5, h * 0.16, 1.5);
  g.fillStyle(FUNNEL, 1);
  g.fillRect(w - 6, h * 0.5, 3, 4);
};

const drawSubmarine: Draw = (g, w, h, shade, nation) => {
  // Cigar-shaped pressure hull with a rounded stern
  g.fillStyle(hullColor(shade, nation), 1);
  g.fillEllipse(w / 2, h / 2, w - 1, h - 2);
  g.lineStyle(1, OUTLINE, 1);
  g.strokeEllipse(w / 2, h / 2, w - 1, h - 2);
  // Deck casing and conning tower (sail)
  g.fillStyle(DECK, 1);
  g.fillRect(w / 2 - 1.5, h * 0.12, 3, h * 0.76);
  g.fillStyle(STRUCTURE, 1);
  g.fillRoundedRect(w / 2 - 3, h * 0.36, 6, h * 0.18, 2.5);
  g.fillStyle(FUNNEL, 1);
  g.fillCircle(w / 2, h * 0.4, 1.4);
  // Deck gun forward of the sail
  g.fillStyle(TURRET, 1);
  g.fillCircle(w / 2, h * 0.27, 1.8);
};

const CLASS_SPRITES: Record<ShipClass, { w: number; h: number; draw: Draw }> = {
  [ShipClass.Battleship]: { w: 26, h: 76, draw: drawBattleship },
  [ShipClass.Cruiser]: { w: 18, h: 58, draw: drawCruiser },
  [ShipClass.Destroyer]: { w: 12, h: 42, draw: drawDestroyer },
  [ShipClass.Carrier]: { w: 28, h: 74, draw: drawCarrier },
  [ShipClass.Submarine]: { w: 10, h: 40, draw: drawSubmarine },
};

/** Smaller hulls for the light subtypes (light / escort carriers, escorts); others keep the class size. */
const SUBTYPE_SCALE: Partial<Record<ShipSubtype, number>> = {
  [ShipSubtype.LightCarrier]: 0.88,
  [ShipSubtype.EscortCarrier]: 0.8,
  [ShipSubtype.Escort]: 0.86,
};

export function generateShipTextures(scene: Phaser.Scene, ships: IShipData[]): void {
  const perClassIndex = new Map<string, number>();
  for (const ship of ships) {
    // Sister ships (#85) use their lead's texture.
    if (ship.sisterOf) continue;
    // The own superweapons (#148) borrow a ship's sprite like the enemy giants.
    if (ship.blueprint) continue;
    const spec = CLASS_SPRITES[ship.shipClass] ?? CLASS_SPRITES[ShipClass.Cruiser];
    // Sister-ship shading counts per nation and class, so every navy starts from its base colour.
    const key = `${ship.nation}:${ship.shipClass}`;
    const index = perClassIndex.get(key) ?? 0;
    perClassIndex.set(key, index + 1);

    if (scene.textures.exists(ship.spriteKey)) scene.textures.remove(ship.spriteKey);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const k = (ship.subtype && SUBTYPE_SCALE[ship.subtype]) || 1;
    const w = Math.round(spec.w * k);
    const h = Math.round(spec.h * k);
    spec.draw(g, w, h, Math.min(0.9, (index % 3) * 0.45), ship.nation);
    g.generateTexture(ship.spriteKey, w, h);
    g.destroy();
  }
}

/** Merchant ship and shore installations used by the convoy / bombardment operations. */
export function generateSpecialTextures(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  // Freighter: blunt hull, cargo hatches, bridge aft.
  make('convoy-ship', 18, 54, (g) => {
    hull(g, 18, 54, 0xc8b89a, 1);
    g.fillStyle(0x8a7a5e, 1);
    for (const y of [0.18, 0.32, 0.46]) g.fillRect(4, 54 * y, 10, 5);
    g.fillStyle(0xe8e2d4, 1);
    g.fillRoundedRect(4, 54 * 0.62, 10, 8, 2);
    g.fillStyle(FUNNEL, 1);
    g.fillRect(7, 54 * 0.78, 4, 4);
  });
  // Gun battery: a concrete emplacement with a barrel pointing up (rotates to aim).
  make('land-battery', 26, 30, (g) => {
    g.fillStyle(0x8c8c84, 1);
    g.fillRoundedRect(1, 6, 24, 23, 5);
    g.lineStyle(1, 0x5a5a54, 1);
    g.strokeRoundedRect(1, 6, 24, 23, 5);
    g.fillStyle(0x55554f, 1);
    g.fillCircle(13, 17, 6);
    g.lineStyle(3, 0x44443f, 1);
    g.lineBetween(13, 17, 13, 1);
  });
  // Harbour: piers and warehouses.
  make('land-harbor', 44, 36, (g) => {
    g.fillStyle(0x9a8f7a, 1);
    g.fillRect(0, 0, 44, 18);
    g.fillStyle(0x6e6656, 1);
    for (const x of [4, 18, 32]) g.fillRect(x, 3, 9, 11);
    g.fillStyle(0xb8ad96, 1);
    for (const x of [6, 20, 34]) g.fillRect(x, 18, 4, 18);
  });
  // Airfield: a runway with centre-line marks.
  make('land-airfield', 20, 60, (g) => {
    g.fillStyle(0x5d5d58, 1);
    g.fillRect(3, 0, 14, 60);
    g.lineStyle(1, 0xf0f0e8, 0.9);
    for (let y = 4; y < 56; y += 8) g.lineBetween(10, y, 10, y + 4);
    g.fillStyle(0x7a7a72, 1);
    g.fillRect(0, 24, 3, 12);
  });
}
