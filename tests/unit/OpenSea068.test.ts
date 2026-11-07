import { describe, expect, it } from 'vitest';
import campaignJson from '@/data/campaign.json';
import { ICampaignData } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { theatersFor } from '@/systems/CampaignSystem';
import { nationBases } from '@/systems/BaseSystem';
import {
  WORLD_MAP, SECTOR_PX, colGap, dangerAt, emptyExplored, explore, exploredCount, findRoute, fuelForPx, FUEL_PER_SECTOR,
  homePort, isExplored, isSea, neighbours, parseOpenSea, readExplored, routeFuel, routeLength, sectorAt, sectorContent,
  sectorWindow, seaSteps, theaterOf, theaterSectors, wrapCol, lonLatText,
} from '@/systems/OpenSeaSystem';

const DATA = campaignJson as unknown as ICampaignData;
const NATIONS = Object.keys(WORLD_MAP.homePorts);

describe('0.0.68 the world map (#445)', () => {
  it('is one grid with every row the same width', () => {
    expect(WORLD_MAP.land).toHaveLength(WORLD_MAP.rows);
    expect(WORLD_MAP.theater).toHaveLength(WORLD_MAP.rows);
    for (const row of [...WORLD_MAP.land, ...WORLD_MAP.theater]) expect(row).toHaveLength(WORLD_MAP.cols);
  });

  it('gives every sea sector a theater and none to land', () => {
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < WORLD_MAP.cols; c++) {
        if (isSea(c, r)) expect(theaterOf(c, r)).not.toBeNull();
        else expect(theaterOf(c, r)).toBeNull();
      }
    }
  });

  it('has all nine campaign theaters on it, each with room to sail', () => {
    const counts = theaterSectors();
    for (const t of DATA.theaters) expect(counts[t.id] ?? 0, t.id).toBeGreaterThanOrEqual(3);
  });

  it('puts every navy home port at sea, in the home sea of its 本拠地', () => {
    for (const n of Object.values(Nation)) {
      const home = homePort(n);
      expect(home, n).toBeDefined();
      expect(isSea(home!.c, home!.r), n).toBe(true);
      expect(theaterOf(home!.c, home!.r), n).toBe(nationBases(n)[0].theaters?.[0]);
    }
  });

  it('joins every home port to every other and to all of its navy\'s theaters by sea', () => {
    for (const n of NATIONS) {
      const steps = seaSteps(homePort(n)!);
      for (const m of NATIONS) {
        const h = homePort(m)!;
        expect(steps[h.r * WORLD_MAP.cols + h.c], `${n} → ${m}`).toBeGreaterThanOrEqual(0);
      }
      for (const t of theatersFor(DATA, n as Nation)) {
        let reached = false;
        for (let r = 0; r < WORLD_MAP.rows && !reached; r++) {
          for (let c = 0; c < WORLD_MAP.cols; c++) if (theaterOf(c, r) === t.id && steps[r * WORLD_MAP.cols + c] >= 0) reached = true;
        }
        expect(reached, `${n} → ${t.id}`).toBe(true);
      }
    }
  });

  it('opens the narrow seas: the Mediterranean, the Baltic and the Black Sea reach the ocean', () => {
    const atlantic = homePort('RN')!;
    for (const n of ['FR', 'RM', 'SU', 'KM']) expect(findRoute(atlantic, homePort(n)!), n).not.toBeNull();
    const sevastopol = WORLD_MAP.land.length > 0 ? { c: Math.floor((33.5 + 180) / 5), r: Math.floor((76 - 44.6) / 3.25) } : null;
    if (sevastopol && isSea(sevastopol.c, sevastopol.r)) expect(findRoute(atlantic, sevastopol)).not.toBeNull();
  });

  it('wraps east to west', () => {
    expect(wrapCol(-1)).toBe(WORLD_MAP.cols - 1);
    expect(wrapCol(WORLD_MAP.cols)).toBe(0);
    expect(colGap(0, WORLD_MAP.cols - 1)).toBe(1);
    // Yokosuka to Pearl Harbor goes across the date line, not round the world.
    const oahu = WORLD_MAP.islands.find((i) => i.name === 'オアフ')!;
    const route = findRoute(homePort('IJN')!, oahu)!;
    expect(routeLength(route)).toBeLessThan(WORLD_MAP.cols / 3);
  });

  it('names sectors by longitude and latitude', () => {
    expect(lonLatText(homePort('IJN')!)).toMatch(/^東経 \d+°・北緯 \d+°$/);
    expect(lonLatText(homePort('USN')!)).toMatch(/^西経 \d+°・北緯 \d+°$/);
  });
});

describe('0.0.68 routes and fuel', () => {
  it('never steps onto land or slips between touching land', () => {
    const route = findRoute(homePort('IJN')!, homePort('RN')!)!;
    expect(route).not.toBeNull();
    for (let i = 0; i < route.length; i++) {
      expect(isSea(route[i].c, route[i].r)).toBe(true);
      if (i > 0) expect(neighbours(route[i - 1]).some((n) => n.c === route[i].c && n.r === route[i].r)).toBe(true);
    }
  });

  it('is null to land', () => {
    let land = { c: 0, r: 0 };
    for (let r = 0; r < WORLD_MAP.rows; r++) for (let c = 0; c < WORLD_MAP.cols; c++) if (!isSea(c, r)) land = { c, r };
    expect(findRoute(homePort('IJN')!, land)).toBeNull();
  });

  it('costs fuel by sectors', () => {
    expect(fuelForPx(SECTOR_PX)).toBe(FUEL_PER_SECTOR);
    const route = findRoute(homePort('RM')!, homePort('FR')!)!;
    expect(routeFuel(route)).toBe(Math.ceil(routeLength(route) * FUEL_PER_SECTOR));
  });

  it('lets a full tank reach the nearby seas and come back', () => {
    // The home theater is within half a tank for every navy.
    for (const n of NATIONS) {
      const home = homePort(n)!;
      const t = theaterOf(home.c, home.r);
      let near = Infinity;
      const steps = seaSteps(home);
      for (let r = 0; r < WORLD_MAP.rows; r++) for (let c = 0; c < WORLD_MAP.cols; c++) if (theaterOf(c, r) === t && steps[r * WORLD_MAP.cols + c] > 0) near = Math.min(near, steps[r * WORLD_MAP.cols + c]);
      expect(near * FUEL_PER_SECTOR * 2, n).toBeLessThanOrEqual(100);
    }
  });

  it('makes the home waters safe and the far seas dangerous', () => {
    const home = homePort('IJN')!;
    expect(dangerAt('IJN', home)).toBe(1);
    expect(dangerAt('IJN', homePort('RN')!)).toBe(10);
  });
});

describe('0.0.68 the sectors the battle screen holds', () => {
  it('maps pixels to sectors, wrapping east and west', () => {
    expect(sectorAt(10, 10)).toEqual({ c: 0, r: 0 });
    expect(sectorAt(-10, SECTOR_PX * 1.5)).toEqual({ c: WORLD_MAP.cols - 1, r: 1 });
    expect(sectorAt(WORLD_MAP.cols * SECTOR_PX + 5, 0).c).toBe(0);
  });

  it('holds the 3 × 3 window, fewer at the top and bottom', () => {
    expect(sectorWindow({ c: 5, r: 5 })).toHaveLength(9);
    expect(sectorWindow({ c: 5, r: 0 })).toHaveLength(6);
  });

  it('fills land sectors and leaves the open ocean clear', () => {
    let land = null as { c: number; r: number } | null;
    let open = null as { c: number; r: number } | null;
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < WORLD_MAP.cols; c++) {
        if (!isSea(c, r)) land ??= { c, r };
        else if (neighbours({ c, r }).length === 8 && !WORLD_MAP.islands.some((i) => i.c === c && i.r === r)) open ??= { c, r };
      }
    }
    const l = sectorContent(land!.c, land!.r);
    expect(l.land).toBe(true);
    expect(l.islands.flat().length).toBe(16);
    const o = sectorContent(open!.c, open!.r);
    expect(o.land).toBe(false);
    expect(o.islands).toHaveLength(0);
  });

  it('puts the island groups (Oahu, Midway, Malta …) in their sectors', () => {
    const oahu = WORLD_MAP.islands.find((i) => i.name === 'オアフ')!;
    const s = sectorContent(oahu.c, oahu.r);
    expect(s.place).toBe('オアフ');
    expect(s.islands.length).toBeGreaterThan(0);
    for (const i of WORLD_MAP.islands) expect(isSea(i.c, i.r), i.name).toBe(true);
  });

  it('is the same every time (deterministic)', () => {
    expect(sectorContent(30, 20)).toEqual(sectorContent(30, 20));
    expect(sectorContent(-1, 20)).toEqual(sectorContent(WORLD_MAP.cols - 1, 20));
  });
});

describe('0.0.68 the explored chart', () => {
  it('marks the sectors round the fleet', () => {
    let bits = emptyExplored();
    expect(exploredCount(bits)).toBe(0);
    bits = explore(bits, { c: 10, r: 10 });
    expect(exploredCount(bits)).toBe(9);
    expect(isExplored(bits, { c: 9, r: 11 })).toBe(true);
    expect(isExplored(bits, { c: 12, r: 10 })).toBe(false);
    // Across the east-west join.
    bits = explore(bits, { c: 0, r: 10 });
    expect(isExplored(bits, { c: WORLD_MAP.cols - 1, r: 10 })).toBe(true);
  });

  it('reads a broken or missing save as an empty chart', () => {
    expect(readExplored(undefined)).toBe(emptyExplored());
    expect(readExplored('zz')).toBe(emptyExplored());
    expect(parseOpenSea(undefined)).toEqual({ explored: emptyExplored(), sailedPx: 0, voyages: 0 });
    expect(parseOpenSea({ sailedPx: -5, voyages: 'x' })).toEqual({ explored: emptyExplored(), sailedPx: 0, voyages: 0 });
    const bits = explore(emptyExplored(), { c: 3, r: 3 });
    expect(parseOpenSea({ explored: bits, sailedPx: 6400, voyages: 2 })).toEqual({ explored: bits, sailedPx: 6400, voyages: 2 });
  });
});
