/**
 * Generates the open world's map (#445, 0.0.68): src/data/world/world.json.
 *
 *   npx vite-node scripts/gen-world.ts
 *
 * The world is one grid of sectors (each one battle sea, 3200 px) over the whole globe, 5° of longitude by 3.25° of
 * latitude, from 76°N to 54°S. Land is rasterised from rough continent outlines; the narrow seas a 5° grid would
 * close (Gibraltar, the Danish straits, the Bosporus, Suez, Panama, Malacca …) are opened along their routes. Every
 * sea sector belongs to one of the campaign's nine theaters. The east and west edges join (the grid wraps).
 */
import { writeFileSync } from 'node:fs';

type P = [number, number];

export const COLS = 72;
export const ROWS = 40;
export const LON0 = -180;
export const LAT0 = 76;
export const DLON = 5;
export const DLAT = 3.25;

const LAND: P[][] = [
  // North America (Alaska to Panama), the Gulf of Mexico left out.
  [[-168, 66], [-160, 71], [-140, 70], [-120, 72], [-95, 74], [-80, 74], [-62, 66], [-56, 52], [-60, 46], [-66, 44], [-70, 41.5], [-74, 40.5], [-76, 35], [-81, 31], [-80.5, 25.5], [-82, 27], [-84, 30], [-90, 29.5], [-97, 27.5], [-97.5, 22], [-92, 18.5], [-90, 21.5], [-87, 21.5], [-88, 16], [-83.5, 15], [-83.5, 10.5], [-79.5, 9.5], [-77.5, 8], [-80, 7.5], [-86, 11], [-92, 14.5], [-96, 16], [-105, 20], [-110, 23], [-112, 29], [-117, 32.5], [-121, 35], [-124, 40], [-124.5, 48], [-130, 54], [-135, 58], [-145, 60.5], [-152, 58.5], [-158, 57], [-165, 60], [-165, 64]],
  // Greenland, Iceland
  [[-55, 60], [-44, 60], [-40, 65], [-22, 70], [-18, 76.5], [-70, 76.5], [-60, 70], [-52, 66]],
  [[-24, 63.5], [-13.5, 64], [-14, 66.6], [-24, 66.6]],
  // Cuba, Hispaniola
  [[-85, 22], [-80, 23.2], [-74, 20], [-78, 19.8]],
  // South America
  [[-80, 8.5], [-72, 12], [-62, 10.5], [-52, 5], [-35, -5], [-35, -10], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -40], [-65, -45], [-68, -50], [-70, -54.5], [-74, -52], [-74, -44], [-72, -30], [-71, -18], [-76, -14], [-81, -6], [-80, 0], [-77, 4]],
  // Eurasia (Iberia to Kamchatka, with Arabia, India and Indochina); the Black Sea and the Baltic are cut out below.
  [[-9.5, 36.5], [-9.5, 43.5], [-2, 43.5], [-4.5, 48.5], [2, 51], [8, 54], [8, 57.5], [10.5, 59], [5, 58], [5, 62], [14, 68], [20, 70.5], [30, 71], [42, 68.5], [40, 65.5], [44, 66.5], [60, 69.5], [70, 73.5], [80, 73.5], [100, 77], [115, 74], [130, 72], [140, 72.5], [160, 70], [180, 69], [180, 66], [170, 60], [163, 56], [156.5, 51], [156, 57], [150, 59.5], [142, 59], [137, 54], [140, 48], [132, 43], [129.5, 40], [129.3, 35.2], [126.5, 34.5], [126.3, 37], [124.6, 38], [121, 39.5], [121.5, 40.8], [118, 39], [119, 37.5], [122.5, 37.3], [120, 35.5], [121, 32], [122, 30], [120, 27], [116, 23], [110, 21], [108, 16], [109, 12], [105, 9], [102, 12], [100, 13], [100, 8], [103.5, 1.5], [100.5, 3.5], [98, 9], [97, 16], [94, 19], [92, 22], [87, 21], [80, 16], [80, 10], [77, 8], [73, 16], [72, 21], [67, 25], [61, 25], [57, 26], [56, 27], [52, 28], [48, 30], [50, 26], [52, 24], [56, 24], [59, 22], [55, 17], [52, 16], [45, 13], [43, 13], [39, 20], [35, 28], [32.5, 30.5], [35, 33], [36, 36], [30, 36.3], [27, 37], [26, 40], [23, 40], [23, 37], [21, 38], [19.5, 42], [13.5, 45.5], [12.5, 44], [16, 41.5], [18.5, 40], [15.6, 38], [12, 41.5], [10, 44], [6, 43], [3, 43], [3, 42], [0, 39], [-2, 37], [-5.5, 36]],
  // Africa
  [[-6, 35.8], [-10, 30], [-17, 21], [-17, 14], [-12, 8], [-8, 4.5], [0, 5], [8, 4], [9.5, 2], [9, -1], [12, -6], [13, -12], [12, -17], [15, -27], [18, -33], [20, -35], [26, -34], [32, -28], [33, -25], [35, -24], [40, -15], [40, -10], [39, -5], [41, -1], [44, 1], [51, 11], [43, 12], [37, 22], [34, 27], [32.4, 30.8], [30, 31], [25, 32], [20, 32], [19, 30], [15, 32], [11, 33], [10, 37], [3, 37], [-2, 35.2]],
  // Britain, Ireland, Sicily
  [[-5.7, 50], [1.5, 51], [1.7, 53], [-0.5, 54.5], [-2, 56], [-1.8, 57.6], [-3.5, 58.7], [-5, 58.6], [-6, 56.5], [-5, 55], [-3, 54], [-4.8, 53.3], [-4.2, 51.6], [-5.7, 51.8]],
  [[-10, 51.5], [-6, 52], [-6, 55], [-8, 55.3], [-10, 54]],
  // Japan, the Philippines, Taiwan
  [[130, 31], [135, 34], [140, 35], [141, 38], [141.5, 41.5], [145, 43.5], [145, 44.5], [141.5, 45.5], [140, 42], [139, 39], [136, 36.5], [132, 35.5], [129.5, 33.5]],
  [[120, 18.5], [122.5, 18], [124, 13], [126, 7], [126, 6], [122, 7], [121.5, 12], [120, 14]],
  // Sumatra, Java, Borneo, New Guinea
  [[95, 5.5], [98, 4], [104, -2], [106, -6], [102, -4], [97, 1]],
  [[105.5, -6], [114, -7], [114, -8.5], [106, -7]],
  [[109, 1.5], [110, -3], [116, -4], [119, 1], [117, 7], [115, 5], [111, 2]],
  [[131, -1], [141, -2.5], [150, -6], [150, -10.5], [146, -8], [141, -9], [138, -8], [132, -4]],
  // Australia, New Zealand, Madagascar
  [[114, -22], [113, -26], [115, -34], [118, -35], [124, -34], [130, -31.5], [135, -35], [138, -34], [140, -38], [146, -39], [150, -37], [153, -31], [153, -25], [146, -19], [143, -11], [141, -13], [136, -12], [132, -11], [129, -15], [122, -17]],
  [[172.5, -34.5], [178, -38], [175, -41.5], [171, -44], [166.5, -46], [168, -44], [172, -41]],
  [[44, -25], [47, -25.5], [50, -15], [49, -12], [44, -16]],
];

/** Seas inside the outlines above. */
const SEAS: P[][] = [
  // Hudson Bay
  [[-95, 59], [-88, 56], [-80, 52], [-78, 58], [-78, 62], [-86, 64], [-94, 62]],
  // Baltic
  [[10, 54], [14, 54], [21, 54.5], [21, 57], [24, 57.5], [24, 59.4], [30, 60], [23, 60.5], [21.5, 62], [21.5, 65.5], [25, 66], [22, 66.5], [17.5, 63], [17, 60.5], [19, 59.5], [16.5, 57], [14, 55.5], [12.5, 56.2], [11, 57.5]],
  // Black Sea
  [[28, 41.3], [28, 44], [30, 45.5], [33, 46], [36, 45.3], [38, 47], [39.5, 47], [38, 45], [41.5, 42], [40, 41], [35, 42], [31, 41.2]],
];

/** Narrow waters opened along their routes, whatever the grid makes of the land around them. */
const STRAITS: Record<string, P[]> = {
  gibraltar: [[-12, 36], [-5.6, 36], [0, 36.5]],
  channel: [[-6, 49.5], [-1, 50.2], [2, 51], [4, 52.5], [5, 55]],
  danish: [[7, 57.5], [10.5, 57.6], [11.5, 56], [12.5, 55], [14, 55]],
  north_sea: [[-2, 58.5], [3, 58], [7, 57.5]],
  bosporus: [[26, 39], [27, 40.5], [29, 41.2], [31, 42]],
  suez: [[32.5, 33], [32.5, 30], [34.5, 27.5]],
  red_sea: [[34.5, 27.5], [38, 21], [41.5, 15], [43.5, 12.5], [48, 12]],
  gulf: [[58, 24], [56, 26.5], [52, 27.5], [49, 29]],
  malacca: [[95, 7], [98.5, 4.5], [101.5, 2.2], [104, 1.3], [106, 2]],
  sunda: [[104, -4], [105.5, -6.2], [106, -8]],
  panama: [[-80, 6], [-79.6, 9.2], [-79.5, 12]],
  magellan: [[-78, -53], [-72, -53.6], [-64, -53]],
  korea: [[127, 33], [129.3, 34.3], [131, 36.5]],
  taiwan: [[118, 22], [119.5, 24], [121, 27]],
  english_n: [[-5, 52], [-5, 53.7], [-5, 55.5]],
  white_sea: [[40, 68.5], [40, 66.2]],
  adriatic: [[18.7, 39.8], [16.5, 42.5], [13.5, 44.5]],
  aegean: [[23.5, 36], [25, 38], [24.5, 40]],
  sicily: [[10, 37.5], [12.5, 36.5], [15.8, 37.8]],
  tyrrhenian: [[9.8, 44], [11, 42], [12, 40], [14, 38.5]],
  baltic: [[12.5, 55], [17, 56], [19, 58], [22, 59.5], [24, 60.5], [27, 60.5], [29.8, 60]],
};

/** Sea sectors that hold islands, from the battle maps: atolls for the coral islands, the archipelago for the rest. */
const ISLANDS: Array<{ at: P; map: 'archipelago' | 'atoll' | 'strait'; name: string }> = [
  { at: [-158, 21.3], map: 'archipelago', name: 'オアフ' },
  { at: [-177.4, 28.2], map: 'atoll', name: 'ミッドウェー' },
  { at: [167, 9], map: 'atoll', name: 'マーシャル' },
  { at: [160, -9.5], map: 'archipelago', name: 'ソロモン' },
  { at: [152, 7.5], map: 'atoll', name: 'トラック' },
  { at: [145, 15], map: 'archipelago', name: 'マリアナ' },
  { at: [175, 52], map: 'archipelago', name: 'アリューシャン' },
  { at: [-173, 52], map: 'archipelago', name: 'アリューシャン' },
  { at: [-160, -18], map: 'atoll', name: 'ソシエテ' },
  { at: [178, -18], map: 'archipelago', name: 'フィジー' },
  { at: [166, -22], map: 'archipelago', name: 'ニューカレドニア' },
  { at: [-28, 38.5], map: 'archipelago', name: 'アゾレス' },
  { at: [-64.7, 32.3], map: 'atoll', name: 'バミューダ' },
  { at: [-16, 28], map: 'archipelago', name: 'カナリア' },
  { at: [14.5, 35.9], map: 'archipelago', name: 'マルタ' },
  { at: [25, 35.3], map: 'archipelago', name: 'クレタ' },
  { at: [-7, 62], map: 'archipelago', name: 'フェロー' },
  { at: [16, 78], map: 'archipelago', name: 'スヴァールバル' },
  { at: [-14.4, -7.9], map: 'atoll', name: 'アセンション' },
  { at: [-5.7, -15.9], map: 'atoll', name: 'セントヘレナ' },
  { at: [73, -0.5], map: 'atoll', name: 'モルディブ' },
  { at: [81, 7.5], map: 'archipelago', name: 'セイロン' },
  { at: [55.5, -4.6], map: 'atoll', name: 'セーシェル' },
  { at: [93, 12], map: 'archipelago', name: 'アンダマン' },
  { at: [-90, -0.5], map: 'archipelago', name: 'ガラパゴス' },
  { at: [-59, -51.7], map: 'archipelago', name: 'フォークランド' },
];

/** Each navy's home port (#445): its 本拠地 (the first of bases.json), put in the nearest sea sector. */
const HOME_PORTS: Record<string, { name: string; at: P }> = {
  IJN: { name: '横須賀', at: [139.7, 35.3] },
  USN: { name: 'ノーフォーク', at: [-76.3, 36.9] },
  RN: { name: 'ポーツマス', at: [-1.1, 50.8] },
  KM: { name: 'キール', at: [10.1, 54.3] },
  FR: { name: 'トゥーロン', at: [5.9, 43.1] },
  RM: { name: 'ラ・スペツィア', at: [9.8, 44.1] },
  SU: { name: 'クロンシュタット', at: [29.8, 60] },
};

export function cellOf([lon, lat]: P): { c: number; r: number } {
  const c = (((Math.floor((lon - LON0) / DLON) % COLS) + COLS) % COLS);
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((LAT0 - lat) / DLAT)));
  return { c, r };
}

function centre(c: number, r: number): P {
  return [LON0 + (c + 0.5) * DLON, LAT0 - (r + 0.5) * DLAT];
}

function inside([x, y]: P, poly: P[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
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

/** The theater a sea at (lon, lat) is in. */
export function theaterAt([lon, lat]: P): string {
  if (lon >= 9 && lon <= 31 && lat >= 53 && lat <= 67) return 'baltic';
  if (lon >= 27 && lon <= 42 && lat >= 40.5 && lat <= 48) return 'blacksea';
  if (lon >= -7 && lon <= 37 && lat >= 29 && lat <= 46.5) return 'mediterranean';
  if (lat >= 64) return 'arctic';
  if (lon >= 20 && lon < 100 && lat < 32) return 'indian';
  if (lon >= 100 && lon < 135 && lat < -8) return 'indian';
  if (lon >= 100 || lon < -100 || (lon < -78 && lat < 12)) return lat >= 40 ? 'north_pacific' : 'pacific';
  return lat >= 0 ? 'atlantic' : 'south_atlantic';
}

export const THEATER_CODE: Record<string, string> = {
  pacific: 'P', north_pacific: 'N', atlantic: 'A', south_atlantic: 'S', mediterranean: 'M', baltic: 'B', blacksea: 'K', indian: 'I', arctic: 'R',
};

function build(): unknown {
  const land: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    land.push([]);
    for (let c = 0; c < COLS; c++) {
      const p = centre(c, r);
      const isLand = LAND.some((poly) => inside(p, poly)) && !SEAS.some((poly) => inside(p, poly));
      land[r].push(isLand);
    }
  }
  for (const route of Object.values(STRAITS)) for (const { c, r } of along(route)) land[r][c] = false;
  const islands = ISLANDS.map((i) => ({ ...cellOf(i.at), map: i.map, name: i.name }));
  for (const i of islands) land[i.r][i.c] = false;
  const homePorts: Record<string, { name: string; c: number; r: number }> = {};
  for (const [nation, port] of Object.entries(HOME_PORTS)) {
    const at = cellOf(port.at);
    if (land[at.r][at.c]) {
      // The nearest sea sector, by the grid.
      let best = at;
      let bestD = Infinity;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const dc = Math.min(Math.abs(c - at.c), COLS - Math.abs(c - at.c));
        const d = dc * dc + (r - at.r) * (r - at.r);
        if (!land[r][c] && d < bestD) [best, bestD] = [{ c, r }, d];
      }
      homePorts[nation] = { name: port.name, ...best };
    } else homePorts[nation] = { name: port.name, ...at };
  }
  return {
    _comment: 'Generated by scripts/gen-world.ts (#445). One sector = one battle sea. land: # = land, . = sea; theater: one letter per sea sector (P N A S M B K I R), - for land. The east and west edges join.',
    cols: COLS,
    rows: ROWS,
    lon0: LON0,
    lat0: LAT0,
    dLon: DLON,
    dLat: DLAT,
    land: land.map((row) => row.map((l) => (l ? '#' : '.')).join('')),
    theater: land.map((row, r) => row.map((l, c) => (l ? '-' : THEATER_CODE[theaterAt(centre(c, r))])).join('')),
    islands,
    homePorts,
  };
}

writeFileSync('src/data/world/world.json', JSON.stringify(build(), null, 1).replace(/\n {2,}(?=[^"\s])/g, ' ') + '\n');
console.log('wrote src/data/world/world.json');
