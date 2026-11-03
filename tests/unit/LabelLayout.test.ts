import { describe, expect, it } from 'vitest';
import data from '@/data/campaign.json';
import { layoutOverlap, mapNodePos, mapObstacles, placeLabels } from '@/utils/LabelLayout';

describe('LabelLayout (#162)', () => {
  it('keeps a label below its node when nothing is in the way', () => {
    const [p] = placeLabels([{ x: 100, y: 100 }], [{ w: 60, h: 16 }], 20, { x: 0, y: 0, w: 400, h: 400 });
    expect(p.side).toBe('below');
    expect(p.scale).toBe(1);
  });

  it('moves a label that would hit the node below it', () => {
    const p = placeLabels([{ x: 100, y: 100 }, { x: 100, y: 150 }], [{ w: 60, h: 16 }, { w: 60, h: 16 }], 20, { x: 0, y: 0, w: 400, h: 400 });
    expect(p[0].side).not.toBe('below');
    expect(layoutOverlap([{ x: 100, y: 100 }, { x: 100, y: 150 }], p, 20)).toBe(0);
  });

  it('lays out every theater, portrait and landscape, with no name on a node, a name, the 制海権 line or the sweep button (0.0.62)', () => {
    for (const portrait of [true, false]) {
      // As CampaignMapScene: the map's rect and node radius in each orientation.
      const m = portrait ? { x: 16, y: 216, w: 688, h: 480 } : { x: 24, y: 160, w: 780, h: 540 };
      const r = portrait ? 26 : 22;
      const obstacles = mapObstacles(m, portrait, portrait ? 330 : 420);
      for (const t of new Set(data.areas.map((a) => a.theater))) {
        const areas = data.areas.filter((a) => a.theater === t);
        const nodes = areas.map((a) => mapNodePos(a, areas, m, portrait, 28));
        // 12px bold: about 12.5px a kanji or kana, 7.5px a digit or Latin letter.
        const sizes = areas.map((a) => ({ w: [...a.name].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 12.5 : 7.5), 0), h: 17 }));
        const labels = placeLabels(nodes, sizes, r, { x: m.x + 8, y: m.y + 8, w: m.w - 16, h: m.h - 16 - 28 }, obstacles);
        expect(layoutOverlap(nodes, labels, r, obstacles), `${portrait ? '縦' : '横'} ${t}`).toBe(0);
        // No node under the 制海権 line or the sweep button either.
        expect(layoutOverlap([], nodes.map((n) => ({ x: n.x - r, y: n.y - r, w: r * 2, h: r * 2 })), r, obstacles), `${portrait ? '縦' : '横'} ${t} nodes`).toBe(0);
      }
    }
  });
});
