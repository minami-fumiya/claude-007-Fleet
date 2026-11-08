import { describe, expect, it } from 'vitest';
import campaignJson from '@/data/campaign.json';
import basesJson from '@/data/bases.json';
import { ICampaignData } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { theatersFor } from '@/systems/CampaignSystem';
import {
  WORLD_MAP, FUEL_PER_SECTOR, SECTOR_PX, anchorAt, areaAt, baseAnchor, emptyExplored, encounterAt, encountersNear, exploredCount, findRoute,
  fleetStart, homeAnchor, homePort, isExplored, isSea, parseAnchors, parseOpenSea, readExplored, seaHour, seaSteps, shipPlace, theaterOf,
} from '@/systems/OpenSeaSystem';
import { QUEST_EVENTS } from '@/systems/QuestSystem';
import { MEDALS } from '@/systems/RecordSystem';

const DATA = campaignJson as unknown as ICampaignData;
const BASES = (basesJson as { bases: Array<{ id: string; nation: string; theaters?: string[] }> }).bases;

describe('0.0.69 the finer world (#445)', () => {
  it('is 288 × 160 sectors of 1.25°, a quarter of the fuel a sector', () => {
    expect(WORLD_MAP.cols).toBe(288);
    expect(WORLD_MAP.rows).toBe(160);
    expect(WORLD_MAP.dLon).toBe(1.25);
    expect(FUEL_PER_SECTOR).toBe(0.75);
  });

  it('puts every base at sea, and the forward bases in the theater they open', () => {
    // Bases serving a sea far off (La Pallice, the U-boats' base for the South Atlantic, lies in the Bay of Biscay).
    const far = new Set(['km_fb_south_atlantic']);
    for (const b of BASES) {
      const s = WORLD_MAP.bases[b.id];
      expect(s, b.id).toBeDefined();
      expect(isSea(s.c, s.r), b.id).toBe(true);
      if (b.theaters?.length && !far.has(b.id)) expect(theaterOf(s.c, s.r), b.id).toBe(b.theaters[0]);
    }
  });

  it('gives every campaign area a block of sea in its own theater, apart from the others', () => {
    const taken = new Set<string>();
    for (const a of DATA.areas) {
      const b = WORLD_MAP.areas[a.id];
      expect(b, a.id).toBeDefined();
      expect(b.size === 2 || (b.size === 1 && a.theater === 'blacksea'), a.id).toBe(true);
      for (let dy = 0; dy < b.size; dy++) {
        for (let dx = 0; dx < b.size; dx++) {
          const c = (b.c + dx) % WORLD_MAP.cols;
          const r = b.r + dy;
          expect(theaterOf(c, r), a.id).toBe(a.theater);
          const k = `${c},${r}`;
          expect(taken.has(k), a.id).toBe(false);
          taken.add(k);
          expect(areaAt({ c, r }), a.id).toBe(a.id);
        }
      }
    }
  });

  it('reaches every area of a navy\'s theaters by sea from its home port', () => {
    for (const n of Object.values(Nation)) {
      const steps = seaSteps(homePort(n)!);
      for (const t of theatersFor(DATA, n)) {
        for (const a of DATA.areas.filter((x) => x.theater === t.id)) {
          const b = WORLD_MAP.areas[a.id];
          expect(steps[b.r * WORLD_MAP.cols + b.c], `${n} → ${a.id}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('holds the narrow seas wide enough for their areas (Baltic, Black Sea, Mediterranean)', () => {
    const count = (code: string): number => WORLD_MAP.theater.reduce((n, row) => n + [...row].filter((ch) => ch === code).length, 0);
    expect(count('M')).toBeGreaterThanOrEqual(200);
    expect(count('B')).toBeGreaterThanOrEqual(60);
    expect(count('K')).toBeGreaterThanOrEqual(40);
  });

  it('carries 0.0.68\'s explored chart over: each old sector opens the 16 that now cover it', () => {
    // 0.0.68's chart: 72 × 40, the sector (10, 5) explored.
    const old = '0'.repeat(720).split('');
    const k = 5 * 72 + 10;
    old[k >> 2] = (1 << (k & 3)).toString(16);
    const bits = readExplored(old.join(''));
    expect(exploredCount(bits)).toBe(16);
    expect(isExplored(bits, { c: 40, r: 20 })).toBe(true);
    expect(isExplored(bits, { c: 43, r: 23 })).toBe(true);
    expect(isExplored(bits, { c: 44, r: 20 })).toBe(false);
    expect(readExplored('x'.repeat(720))).toBe(emptyExplored());
  });
});

describe('0.0.69 停泊: fleets lie where their voyage ended', () => {
  it('starts at the home port, then where the ships were left', () => {
    expect(shipPlace([], 'yamato', 'IJN')).toEqual(homeAnchor('IJN'));
    const malta = baseAnchor('ijn_fb_mediterranean')!;
    let anchors = anchorAt([], ['yamato', 'musashi'], malta, 'IJN');
    expect(shipPlace(anchors, 'yamato', 'IJN')).toEqual(malta);
    expect(fleetStart(anchors, ['yamato', 'musashi'], 'IJN')).toEqual({ at: malta });
    // One of them at home, the other at Malta: they can't sail together.
    expect('problem' in fleetStart(anchors, ['yamato', 'nagato'], 'IJN')).toBe(true);
    // Back home: no group left.
    anchors = anchorAt(anchors, ['yamato', 'musashi'], homeAnchor('IJN'), 'IJN');
    expect(anchors).toEqual([]);
  });

  it('lies at sea at the very point the voyage stopped, and joins a group already lying there', () => {
    const sea = { x: 1000, y: 2000 };
    let anchors = anchorAt([], ['a'], sea, 'IJN');
    anchors = anchorAt(anchors, ['b'], { x: 1000, y: 2000 }, 'IJN');
    expect(anchors).toEqual([{ shipIds: ['a', 'b'], at: sea }]);
    anchors = anchorAt(anchors, ['a'], baseAnchor('ijn_fb_indian')!, 'IJN');
    expect(anchors.map((g) => g.shipIds)).toEqual([['b'], ['a']]);
  });

  it('reads broken anchorages safely and keeps them through the save', () => {
    expect(parseAnchors(undefined)).toEqual([]);
    expect(parseAnchors([{ shipIds: [], at: { x: 1, y: 1 } }, { shipIds: ['a'], at: { x: 'n' } }, { shipIds: ['a', 3], at: { base: 'b', x: 1, y: 2 } }])).toEqual([{ shipIds: ['a'], at: { base: 'b', x: 1, y: 2 } }]);
    expect(parseOpenSea({ anchors: [{ shipIds: ['x'], at: { x: 5, y: 6 } }] }).anchors).toEqual([{ shipIds: ['x'], at: { x: 5, y: 6 } }]);
  });
});

describe('0.0.69 groups met at sea', () => {
  const theaters = new Set(DATA.theaters.map((t) => t.id));
  const ports = Object.values(WORLD_MAP.bases);

  it('changes every hour, the same within the hour', () => {
    const at = { c: homePort('IJN')!.c + 20, r: homePort('IJN')!.r + 10 };
    const a = encountersNear('IJN', at, 1000, theaters, ports, 10);
    expect(encountersNear('IJN', at, 1000, theaters, ports, 10)).toEqual(a);
    expect(encountersNear('IJN', at, 1001, theaters, ports, 10)).not.toEqual(a);
    expect(seaHour(3_600_000 * 5 + 10)).toBe(5);
  });

  it('lies on about 1 sea sector in 80, clear of the harbours and the areas, in the navy\'s seas only', () => {
    let sea = 0;
    let groups = 0;
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < WORLD_MAP.cols; c++) {
        if (!isSea(c, r)) continue;
        sea += 1;
        const g = encounterAt('IJN', { c, r }, 7, theaters, ports);
        if (!g) continue;
        groups += 1;
        expect(ports.every((p) => Math.abs(p.c - c) >= 3 || Math.abs(p.r - r) >= 3)).toBe(true);
        expect(areaAt({ c, r })).toBeUndefined();
        expect(g.danger).toBeGreaterThanOrEqual(1);
      }
    }
    expect(groups / sea).toBeGreaterThan(0.005);
    expect(groups / sea).toBeLessThan(0.015);
    expect(encounterAt('IJN', { c: 0, r: 0 }, 7, new Set(), ports)).toBeNull();
  });

  it('keeps the route between a navy\'s bases by sea', () => {
    expect(findRoute(WORLD_MAP.bases.ijn_home, WORLD_MAP.bases.ijn_fb_indian)).not.toBeNull();
    expect(SECTOR_PX).toBe(3200);
  });
});

describe('0.0.69 medals and quests', () => {
  it('counts the fights at sea and the harbours put into', () => {
    for (const e of ['seaAreaWin', 'seaGroupWin', 'anchoredAway']) expect(QUEST_EVENTS as readonly string[]).toContain(e);
    for (const id of ['sea_area', 'sea_group', 'anchored_away']) expect(MEDALS.some((m) => m.id.startsWith(id))).toBe(true);
  });
});
