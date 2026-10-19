import { describe, expect, it } from 'vitest';
import data from '@/data/campaign.json';
import { layoutOverlap, placeLabels } from '@/utils/LabelLayout';

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

  it('lays out every theater of the portrait map without overlaps', () => {
    const m = { x: 16, y: 216, w: 688, h: 480 };
    const theaters = new Set(data.areas.map((a) => (a as { theater?: string }).theater ?? 'pacific'));
    for (const t of theaters) {
      const areas = (data.areas as Array<{ theater?: string; x: number; y: number; name: string }>).filter((a) => (a.theater ?? 'pacific') === t);
      // As CampaignMapScene.nodePos in portrait: the theater's nodes stretched over the map
      const span = (vs: number[]) => (v: number) => (v - Math.min(...vs)) / (Math.max(...vs) - Math.min(...vs));
      const fx = span(areas.map((a) => a.x));
      const fy = span(areas.map((a) => a.y));
      const nodes = areas.map((a) => ({ x: m.x + 60 + fx(a.x) * (m.w - 120), y: m.y + 60 + fy(a.y) * (m.h - 120) }));
      // 12px bold: about 13px per character
      const labels = placeLabels(nodes, areas.map((a) => ({ w: a.name.length * 13, h: 16 })), 26, m);
      expect(layoutOverlap(nodes, labels, 26), t).toBe(0);
    }
  });
});
