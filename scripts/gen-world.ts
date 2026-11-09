/**
 * Generates the open world's map (#445): src/data/world/world.json.
 *
 *   npx vite-node scripts/gen-world.ts
 *
 * 0.0.69: one grid of sectors (each one battle sea, 3200 px) over the whole globe, 1.25° of longitude by 0.8125° of
 * latitude, from 76°N to 54°S (288 × 160). Land comes from the real coastline (Natural Earth 1:50m, the npm
 * `world-atlas` package): a sector is land when most of it is. The narrow waters a 1.25° grid closes (Gibraltar, the
 * Danish straits, the Bosporus, Suez, Panama …) are opened along their routes. Every sea sector belongs to one of
 * the campaign's nine theaters. The navies' bases (bases.json) sit at their real places, in the nearest sea sector,
 * and each campaign area gets a 2 × 2 block of sea in its theater. The east and west edges join.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

type P = [number, number];

export const COLS = 288;
export const ROWS = 160;
export const LON0 = -180;
export const LAT0 = 76;
export const DLON = 1.25;
export const DLAT = 0.8125;
/** Samples a side within a sector: a sector is land when most of its SAMPLE² points are. */
const SAMPLE = 3;

/** Narrow waters opened along their routes, whatever the grid makes of the land around them. */
const STRAITS: Record<string, P[]> = {
  gibraltar: [[-7, 36], [-5.6, 35.95], [-4, 36.1]],
  danish: [[10.5, 57.6], [11.2, 56.6], [12.6, 55.8], [12.8, 55.2], [14, 55]],
  bosporus: [[26.2, 40.0], [27.0, 40.5], [29.0, 41.1], [29.3, 41.4]],
  suez: [[32.3, 31.4], [32.5, 30.0], [32.6, 29.5]],
  panama: [[-79.9, 9.4], [-79.6, 9.0], [-79.5, 8.6]],
  malacca: [[98.5, 4.5], [101.5, 2.2], [103.6, 1.2], [104.5, 1.3]],
  sunda: [[105.8, -5.8], [105.8, -6.4]],
  hormuz: [[56.0, 26.6], [56.6, 26.2], [57.2, 25.8]],
  magellan: [[-75, -52.8], [-70.5, -53.6], [-68, -52.5]],
  kronstadt: [[27.5, 60.0], [29.0, 60.0], [29.8, 60.0]],
};

/** Island groups that give a sea sector its battle map (when the island itself is land, the sector beside it). */
const ISLANDS: Array<{ at: P; map: 'archipelago' | 'atoll' | 'strait'; name: string }> = [
  { at: [-158, 21.3], map: 'archipelago', name: 'オアフ' },
  { at: [-177.4, 28.2], map: 'atoll', name: 'ミッドウェー' },
  { at: [167, 9], map: 'atoll', name: 'マーシャル' },
  { at: [160, -9.5], map: 'archipelago', name: 'ソロモン' },
  { at: [151.8, 7.4], map: 'atoll', name: 'トラック' },
  { at: [145.7, 15.2], map: 'archipelago', name: 'マリアナ' },
  { at: [175, 52], map: 'archipelago', name: 'アリューシャン' },
  { at: [-160, -17], map: 'atoll', name: 'ソシエテ' },
  { at: [178, -17.8], map: 'archipelago', name: 'フィジー' },
  { at: [-28, 38.5], map: 'archipelago', name: 'アゾレス' },
  { at: [-64.7, 32.3], map: 'atoll', name: 'バミューダ' },
  { at: [-15.6, 28.2], map: 'archipelago', name: 'カナリア' },
  { at: [14.5, 35.9], map: 'archipelago', name: 'マルタ' },
  { at: [-7, 62], map: 'archipelago', name: 'フェロー' },
  { at: [-14.4, -7.9], map: 'atoll', name: 'アセンション' },
  { at: [-5.7, -15.9], map: 'atoll', name: 'セントヘレナ' },
  { at: [73.5, 3.5], map: 'atoll', name: 'モルディブ' },
  { at: [55.5, -4.6], map: 'atoll', name: 'セーシェル' },
  { at: [92.7, 11.7], map: 'archipelago', name: 'アンダマン' },
  { at: [-90.5, -0.6], map: 'archipelago', name: 'ガラパゴス' },
  { at: [-59, -51.7], map: 'archipelago', name: 'フォークランド' },
  { at: [158, 6.9], map: 'atoll', name: 'ポナペ' },
  { at: [172.9, 1.4], map: 'atoll', name: 'タラワ' },
  { at: [134.5, 7.5], map: 'archipelago', name: 'パラオ' },
];

/**
 * 0.0.70: each navy's places of the old 外洋 chart at their real spots (the inland ones at the port they ship from):
 * two friendly ports, an oil field, a mine, the start of a convoy route and the enemy's stronghold. Names as in
 * WorldSystem's PLACE_NAMES.
 */
const PLACE_AT: Record<string, { kind: 'port' | 'oil' | 'mine' | 'convoy' | 'fort'; name: string; at: P }> = {
  'port0:IJN': { kind: 'port', name: 'トラック泊地', at: [151.8, 7.4] },
  'port1:IJN': { kind: 'port', name: 'パラオ', at: [134.4, 7.3] },
  'oil:IJN': { kind: 'oil', name: 'パレンバン油田', at: [105.5, -2.5] },
  'mine:IJN': { kind: 'mine', name: '海南島の鉱山', at: [109.5, 18.0] },
  'convoy:IJN': { kind: 'convoy', name: '南方航路', at: [119.5, 21.5] },
  'fort:IJN': { kind: 'fort', name: 'ミッドウェー島', at: [-177.4, 28.2] },
  'port0:USN': { kind: 'port', name: '真珠湾', at: [-158.2, 21.0] },
  'port1:USN': { kind: 'port', name: 'エスピリトゥサント', at: [167.2, -15.5] },
  'oil:USN': { kind: 'oil', name: 'カリフォルニア油田', at: [-118.3, 33.6] },
  'mine:USN': { kind: 'mine', name: 'アラスカの鉱山', at: [-134.8, 57.8] },
  'convoy:USN': { kind: 'convoy', name: '太平洋航路', at: [-124.0, 37.5] },
  'fort:USN': { kind: 'fort', name: 'トラック環礁', at: [151.9, 7.6] },
  'port0:KM': { kind: 'port', name: 'ヴィルヘルムスハーフェン', at: [8.1, 53.7] },
  'port1:KM': { kind: 'port', name: 'トロンハイム', at: [9.5, 63.6] },
  'oil:KM': { kind: 'oil', name: 'ルーマニアの油田', at: [29.0, 44.1] },
  'mine:KM': { kind: 'mine', name: 'キルナの鉄鉱山', at: [16.5, 68.5] },
  'convoy:KM': { kind: 'convoy', name: '北海航路', at: [5.0, 57.5] },
  'fort:KM': { kind: 'fort', name: 'スカパ・フロー', at: [-3.0, 58.8] },
  'port0:RN': { kind: 'port', name: 'スカパ・フロー', at: [-3.0, 58.8] },
  'port1:RN': { kind: 'port', name: 'ジブラルタル', at: [-5.4, 36.0] },
  'oil:RN': { kind: 'oil', name: 'アバダン油田', at: [49.5, 29.5] },
  'mine:RN': { kind: 'mine', name: 'ウェールズの炭鉱', at: [-3.6, 51.3] },
  'convoy:RN': { kind: 'convoy', name: '援ソ船団の航路', at: [-22.0, 65.5] },
  'fort:RN': { kind: 'fort', name: 'ブレスト', at: [-4.8, 48.2] },
  'port0:FR': { kind: 'port', name: 'ブレスト', at: [-4.8, 48.2] },
  'port1:FR': { kind: 'port', name: 'ダカール', at: [-17.6, 14.6] },
  'oil:FR': { kind: 'oil', name: 'モスル油田', at: [35.6, 34.5] },
  'mine:FR': { kind: 'mine', name: 'ロレーヌの鉄鉱山', at: [2.3, 51.2] },
  'convoy:FR': { kind: 'convoy', name: '北アフリカ航路', at: [4.5, 40.0] },
  'fort:FR': { kind: 'fort', name: 'ヴィルヘルムスハーフェン', at: [8.1, 53.7] },
  'port0:SU': { kind: 'port', name: 'クロンシュタット', at: [29.6, 60.0] },
  'port1:SU': { kind: 'port', name: 'ムルマンスク', at: [33.3, 69.3] },
  'oil:SU': { kind: 'oil', name: 'バクー油田', at: [37.8, 44.6] },
  'mine:SU': { kind: 'mine', name: 'ウラルの鉱山', at: [40.0, 64.8] },
  'convoy:SU': { kind: 'convoy', name: '援ソ船団の航路', at: [35.0, 72.5] },
  'fort:SU': { kind: 'fort', name: 'キール', at: [10.4, 54.5] },
  'port0:RM': { kind: 'port', name: 'ターラント', at: [17.1, 40.4] },
  'port1:RM': { kind: 'port', name: 'トブルク', at: [24.0, 32.2] },
  'oil:RM': { kind: 'oil', name: 'リビアの油田', at: [13.2, 33.0] },
  'mine:RM': { kind: 'mine', name: 'サルデーニャの鉱山', at: [9.2, 39.0] },
  'convoy:RM': { kind: 'convoy', name: '北アフリカ航路', at: [6.0, 39.0] },
  'fort:RM': { kind: 'fort', name: 'マルタ島', at: [14.6, 35.8] },
};

/** Where the navies' bases are (bases.json ids), longitude and latitude. */
const BASE_AT: Record<string, P> = {
  ijn_home: [139.67, 35.28], ijn_light: [135.38, 35.47], ijn_cruiser: [129.72, 33.16], ijn_heavy: [132.55, 34.24],
  ijn_fb_north_pacific: [156.1, 50.3], ijn_fb_indian: [100.33, 5.42], ijn_fb_mediterranean: [14.51, 35.9],
  usn_home: [-76.3, 36.95], usn_light: [-117.17, 32.7], usn_cruiser: [-157.95, 21.35], usn_heavy: [-73.97, 40.7],
  usn_fb_north_pacific: [-166.54, 53.89], usn_fb_pacific: [166.45, -22.27], usn_fb_south_atlantic: [-34.88, -8.05], usn_fb_arctic: [-21.7, 64.35],
  km_home: [10.14, 54.33], km_light: [-3.37, 47.75], km_cruiser: [9.99, 53.55], km_heavy: [8.12, 53.52],
  km_fb_atlantic: [-4.49, 48.39], km_fb_arctic: [17.43, 68.44], km_fb_mediterranean: [23.47, 37.96], km_fb_south_atlantic: [-1.22, 46.16], km_fb_indian: [100.33, 5.42],
  rn_home: [-1.09, 50.8], rn_light: [-4.18, 50.38], rn_cruiser: [-3.45, 56.03], rn_heavy: [-3.1, 58.9],
  rn_fb_arctic: [-21.5, 64.37], rn_fb_mediterranean: [14.51, 35.9], rn_fb_south_atlantic: [-13.23, 8.48], rn_fb_indian: [81.23, 8.57], rn_fb_pacific: [103.83, 1.45], rn_fb_north_pacific: [114.17, 22.28],
  fr_home: [5.93, 43.1], fr_light: [-1.62, 49.65], fr_cruiser: [9.87, 37.27], fr_heavy: [-4.49, 48.39],
  fr_fb_atlantic: [-7.62, 33.6], fr_fb_south_atlantic: [-17.44, 14.69], fr_fb_indian: [49.29, -12.28], fr_fb_pacific: [109.2, 11.95],
  rm_home: [9.83, 44.1], rm_light: [17.95, 40.64], rm_cruiser: [14.27, 40.84], rm_heavy: [17.22, 40.47],
  rm_fb_atlantic: [-0.57, 44.84], rm_fb_south_atlantic: [-15.41, 28.13], rm_fb_indian: [39.45, 15.61],
  su_home: [29.77, 59.99], su_light: [131.89, 43.11], su_cruiser: [33.52, 44.6], su_heavy: [30.3, 59.93],
  su_fb_north_pacific: [158.65, 53.02], su_fb_blacksea: [41.67, 42.15], su_fb_arctic: [33.4, 69.2],
};

export function cellOf([lon, lat]: P): { c: number; r: number } {
  const c = ((Math.floor((lon - LON0) / DLON) % COLS) + COLS) % COLS;
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((LAT0 - lat) / DLAT)));
  return { c, r };
}

function centre(c: number, r: number): P {
  return [LON0 + (c + 0.5) * DLON, LAT0 - (r + 0.5) * DLAT];
}

/** The theater a sea at (lon, lat) is in (the game's own split of the oceans). */
export function theaterAt([lon, lat]: P): string {
  // The Baltic: south of 60°N from the Danish straits east, and the Gulf of Bothnia (east of Sweden's coast) above.
  if (lon >= 9.5 && lon <= 31 && lat >= 53 && lat <= 67 && (lat < 57.5 || lon >= 16.5)) return 'baltic';
  if (lon >= 27 && lon <= 42 && lat >= 40.5 && lat <= 48) return 'blacksea';
  // The Mediterranean, without the Bay of Biscay north of Spain.
  if (lon >= -6 && lon <= 37 && lat >= 29 && lat <= 46.5 && !(lat > 42.5 && lon < 3)) return 'mediterranean';
  if (lat >= 63) return 'arctic';
  if (lon >= 20 && lon < 101.5 && lat < 32) return 'indian';
  if (lon >= 101.5 && lon < 135 && lat < -8) return 'indian';
  if (lon >= 100 || lon < -100 || (lon < -78 && lat < 12)) {
    // The game's 北太平洋 takes in the China seas north of Hong Kong; east of Korea it starts at 40°N.
    return lat >= (lon >= 100 && lon < 125 ? 18 : 40) ? 'north_pacific' : 'pacific';
  }
  return lat >= 30 || (lon < -40 && lat >= 0) ? 'atlantic' : 'south_atlantic';
}

export const THEATER_CODE: Record<string, string> = {
  pacific: 'P', north_pacific: 'N', atlantic: 'A', south_atlantic: 'S', mediterranean: 'M', baltic: 'B', blacksea: 'K', indian: 'I', arctic: 'R',
};

/** Even-odd scanline fill of every land ring at the sample latitudes: true = land. */
function rasterise(): boolean[][] {
  const topo = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json', 'utf8')) as Topology;
  const land = feature(topo, topo.objects.land as GeometryCollection) as unknown as { features: Array<{ geometry: { type: string; coordinates: P[][] | P[][][] } }> };
  const rings: P[][] = [];
  for (const f of land.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') rings.push(...(g.coordinates as P[][]));
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates as P[][][]) rings.push(...poly);
  }
  const edges: Array<[number, number, number, number]> = [];
  for (const ring of rings) for (let i = 0; i + 1 < ring.length; i++) edges.push([ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]]);
  const counts = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    for (let sy = 0; sy < SAMPLE; sy++) {
      const lat = LAT0 - (r + (sy + 0.5) / SAMPLE) * DLAT;
      const xs: number[] = [];
      for (const [x1, y1, x2, y2] of edges) {
        if (y1 > lat === y2 > lat) continue;
        xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let c = 0; c < COLS; c++) {
        for (let sx = 0; sx < SAMPLE; sx++) {
          const lon = LON0 + (c + (sx + 0.5) / SAMPLE) * DLON;
          // Inside when an odd number of crossings lie to the west.
          let n = 0;
          for (const x of xs) {
            if (x < lon) n++;
            else break;
          }
          if (n % 2 === 1) counts[r][c]++;
        }
      }
    }
  }
  const half = (SAMPLE * SAMPLE) / 2;
  return counts.map((row) => row.map((n) => n > half));
}

/** Cells a route passes through (sampled every quarter sector). */
function along(route: P[]): Array<{ c: number; r: number }> {
  const out: Array<{ c: number; r: number }> = [];
  for (let i = 0; i + 1 < route.length; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]) / DLON, Math.abs(b[1] - a[1]) / DLAT) * 4) + 1;
    for (let k = 0; k <= steps; k++) out.push(cellOf([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]));
  }
  return out;
}

const wrap = (c: number): number => ((c % COLS) + COLS) % COLS;

/** The sea sectors reached by sea from (c, r), 8-way without slipping between touching land. */
function reach(land: boolean[][], from: { c: number; r: number }): Set<number> {
  const seen = new Set<number>([from.r * COLS + from.c]);
  const q = [from];
  const sea = (c: number, r: number): boolean => r >= 0 && r < ROWS && !land[r][wrap(c)];
  for (let i = 0; i < q.length; i++) {
    const { c, r } = q[i];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dr === 0 && dc === 0) || !sea(c + dc, r + dr)) continue;
        if (dr !== 0 && dc !== 0 && (!sea(c + dc, r) || !sea(c, r + dr))) continue;
        const k = (r + dr) * COLS + wrap(c + dc);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ c: wrap(c + dc), r: r + dr });
      }
    }
  }
  return seen;
}

/** The nearest sea sector to (lon, lat) on the open ocean (the main body of water). */
function nearestSea(ocean: Set<number>, at: P): { c: number; r: number } {
  const want = cellOf(at);
  let best = want;
  let bestD = Infinity;
  for (const k of ocean) {
    const c = k % COLS;
    const r = Math.floor(k / COLS);
    const dc = Math.min(Math.abs(c - want.c), COLS - Math.abs(c - want.c));
    const d = dc * dc + (r - want.r) * (r - want.r);
    if (d < bestD) [best, bestD] = [{ c, r }, d];
  }
  return best;
}

interface IArea { id: string; theater: string }

/**
 * Each campaign area's 2 × 2 block of sea in its theater, the theater's areas in their campaign order spreading out
 * from where the navies enter it (the first base listed for it), kept apart from each other and from the bases.
 */
function placeAreas(land: boolean[][], theater: string[], ocean: Set<number>, bases: Record<string, { c: number; r: number }>): Record<string, { c: number; r: number; size: number }> {
  const campaign = JSON.parse(readFileSync('src/data/campaign.json', 'utf8')) as { theaters: Array<{ id: string }>; areas: IArea[] };
  const basesJson = JSON.parse(readFileSync('src/data/bases.json', 'utf8')) as { bases: Array<{ id: string; theaters?: string[] }> };
  const out: Record<string, { c: number; r: number; size: number }> = {};
  const code = (c: number, r: number): string => (r >= 0 && r < ROWS ? theater[r][wrap(c)] : '-');
  const taken = Object.values(bases);
  for (const t of campaign.theaters) {
    const areas = campaign.areas.filter((a) => a.theater === t.id);
    const entry = basesJson.bases.find((b) => b.theaters?.includes(t.id));
    const from = entry ? bases[entry.id] : undefined;
    const steps = from ? stepsFrom(land, from) : null;
    const ch = THEATER_CODE[t.id];
    const far = (a: { c: number; r: number }, b: { c: number; r: number }, gap: number): boolean =>
      Math.max(Math.min(Math.abs(a.c - b.c), COLS - Math.abs(a.c - b.c)), Math.abs(a.r - b.r)) >= gap;
    // 2 × 2 blocks where they fit; the smallest seas (the Black Sea) take 1 × 1 areas instead.
    tries: for (const size of [2, 1]) {
      const blocks: Array<{ c: number; r: number; d: number }> = [];
      for (let r = 0; r + size - 1 < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cells: Array<[number, number]> = [];
          for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.push([c + dx, r + dy]);
          if (!cells.every(([x, y]) => code(x, y) === ch && ocean.has(y * COLS + wrap(x)))) continue;
          blocks.push({ c, r, d: steps ? steps.get(r * COLS + c) ?? 9999 : 0 });
        }
      }
      blocks.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
      // Nearest first; a small sea is packed row by row instead (its blocks then ordered by distance all the same).
      const rowMajor = [...blocks].sort((a, b) => a.r - b.r || a.c - b.c);
      for (const gap of [10, 8, 6, 5, 4, 3, 2].filter((g) => g >= size)) {
        for (const order of [blocks, rowMajor]) {
          const picked: Array<{ c: number; r: number; d: number }> = [];
          for (const b of order) {
            if (picked.length >= areas.length) break;
            if (picked.every((p) => far(p, b, gap)) && taken.every((p) => far(p, b, Math.min(2, gap - 1)))) picked.push(b);
          }
          if (picked.length === areas.length) {
            picked.sort((a, b) => a.d - b.d);
            areas.forEach((a, i) => (out[a.id] = { c: picked[i].c, r: picked[i].r, size }));
            break tries;
          }
        }
      }
    }
    if (areas.some((a) => !out[a.id])) throw new Error(`no room for ${t.id}'s areas`);
  }
  return out;
}

function stepsFrom(land: boolean[][], from: { c: number; r: number }): Map<number, number> {
  const out = new Map<number, number>([[from.r * COLS + from.c, 0]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const { c, r } = q[i];
    const d = out.get(r * COLS + c)!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = wrap(c + dc);
      const nr = r + dr;
      if (nr < 0 || nr >= ROWS || land[nr][nc] || out.has(nr * COLS + nc)) continue;
      out.set(nr * COLS + nc, d + 1);
      q.push({ c: nc, r: nr });
    }
  }
  return out;
}

function build(): unknown {
  const land = rasterise();
  for (const route of Object.values(STRAITS)) for (const { c, r } of along(route)) land[r][c] = false;
  // The open ocean: the water reached from the middle of the Pacific. Lakes and the Caspian stay apart (and land).
  const ocean = reach(land, cellOf([-150, 0]));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!land[r][c] && !ocean.has(r * COLS + c)) land[r][c] = true;
  const islands = ISLANDS.map((i) => ({ ...nearestSea(ocean, i.at), map: i.map, name: i.name }));
  const bases: Record<string, { c: number; r: number }> = {};
  for (const [id, at] of Object.entries(BASE_AT)) bases[id] = nearestSea(ocean, at);
  const homePorts: Record<string, { name: string; c: number; r: number }> = {};
  const homeOf: Record<string, string> = { IJN: '横須賀', USN: 'ノーフォーク', RN: 'ポーツマス', KM: 'キール', FR: 'トゥーロン', RM: 'ラ・スペツィア', SU: 'クロンシュタット' };
  for (const [n, name] of Object.entries(homeOf)) homePorts[n] = { name, ...bases[`${n.toLowerCase()}_home`] };
  const theater = land.map((row, r) => row.map((l, c) => (l ? '-' : THEATER_CODE[theaterAt(centre(c, r))])).join(''));
  const areas = placeAreas(land, theater, ocean, bases);
  const places: Record<string, { kind: string; nation: string; name: string; c: number; r: number }> = {};
  for (const [id, p] of Object.entries(PLACE_AT)) places[id] = { kind: p.kind, nation: id.split(':')[1], name: p.name, ...nearestSea(ocean, p.at) };
  return {
    _comment: 'Generated by scripts/gen-world.ts (#445) from Natural Earth (world-atlas land-50m). One sector = one battle sea. land: # = land, . = sea; theater: one letter per sea sector (P N A S M B K I R), - for land. The east and west edges join. bases: bases.json ids at their sea sectors; areas: each campaign area\'s 2 × 2 block (top-left); places: the old 外洋 chart\'s ports, resources and strongholds (0.0.70).',
    cols: COLS,
    rows: ROWS,
    lon0: LON0,
    lat0: LAT0,
    dLon: DLON,
    dLat: DLAT,
    land: land.map((row) => row.map((l) => (l ? '#' : '.')).join('')),
    theater,
    islands,
    homePorts,
    bases,
    areas,
    places,
  };
}

writeFileSync('src/data/world/world.json', JSON.stringify(build(), null, 1).replace(/\n {2,}(?=[^"\s])/g, ' ') + '\n');
console.log('wrote src/data/world/world.json');
