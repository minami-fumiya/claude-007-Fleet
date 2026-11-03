/**
 * Label placement for map nodes (#162, pure). Each label goes below, above, right or left of its node, whichever
 * overlaps the other nodes, the labels already placed and the map edge the least; when every side overlaps it is
 * tried again smaller. Placed in node order, so earlier nodes keep the natural spot (below).
 */

export interface IBox { x: number; y: number; w: number; h: number }

export interface IPlacedLabel extends IBox {
  side: 'below' | 'above' | 'right' | 'left' | 'belowRight' | 'belowLeft' | 'aboveRight' | 'aboveLeft';
  scale: number;
}

const GAP = 6;
// Smaller than 0.85 of 12px is unreadable on a phone.
const SCALES = [1, 0.85];

function overlap(a: IBox, b: IBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Area of `box` outside `bounds`. */
function outside(box: IBox, bounds: IBox): number {
  return box.w * box.h - overlap(box, bounds);
}

/**
 * `obstacles` are other things on the map the labels keep off (#50: the 制海権 line and the sweep button). Beside the
 * four sides, a label can sit at a corner of its node (0.0.62: a dense theater left one touching its neighbour).
 */
export function placeLabels(nodes: ReadonlyArray<{ x: number; y: number }>, sizes: ReadonlyArray<{ w: number; h: number }>, r: number, bounds: IBox, obstacles: readonly IBox[] = []): IPlacedLabel[] {
  const circles: IBox[] = nodes.map((n) => ({ x: n.x - r, y: n.y - r, w: r * 2, h: r * 2 }));
  const placed: IPlacedLabel[] = [];
  nodes.forEach((n, i) => {
    let best: IPlacedLabel | null = null;
    let bestScore = Infinity;
    for (const scale of SCALES) {
      const w = sizes[i].w * scale;
      const h = sizes[i].h * scale;
      const options: IPlacedLabel[] = [
        { side: 'below', scale, x: n.x - w / 2, y: n.y + r + GAP, w, h },
        { side: 'above', scale, x: n.x - w / 2, y: n.y - r - GAP - h, w, h },
        { side: 'right', scale, x: n.x + r + GAP, y: n.y - h / 2, w, h },
        { side: 'left', scale, x: n.x - r - GAP - w, y: n.y - h / 2, w, h },
        // The corners: the label's near corner just off the node's.
        { side: 'belowRight', scale, x: n.x + r * 0.5, y: n.y + r * 0.7 + GAP, w, h },
        { side: 'belowLeft', scale, x: n.x - r * 0.5 - w, y: n.y + r * 0.7 + GAP, w, h },
        { side: 'aboveRight', scale, x: n.x + r * 0.5, y: n.y - r * 0.7 - GAP - h, w, h },
        { side: 'aboveLeft', scale, x: n.x - r * 0.5 - w, y: n.y - r * 0.7 - GAP - h, w, h },
      ];
      for (const o of options) {
        const hit = circles.reduce((s, c, j) => s + (j === i ? 0 : overlap(o, c)), 0) + placed.reduce((s, p) => s + overlap(o, p), 0) + obstacles.reduce((s, b) => s + overlap(o, b), 0);
        // Leaving the map counts double: a label cut off is worse than one touching another.
        const score = hit + 2 * outside(o, bounds);
        if (score < bestScore) {
          bestScore = score;
          best = o;
        }
      }
      if (bestScore === 0) break;
    }
    placed.push(best!);
  });
  return placed;
}

/** Total overlap among the labels and between labels and other nodes (0 = a clean layout), for tests. */
export function layoutOverlap(nodes: ReadonlyArray<{ x: number; y: number }>, labels: readonly IBox[], r: number, obstacles: readonly IBox[] = []): number {
  let sum = 0;
  labels.forEach((a, i) => {
    for (const b of obstacles) sum += overlap(a, b);
    labels.forEach((b, j) => {
      if (j > i) sum += overlap(a, b);
    });
    nodes.forEach((n, j) => {
      if (j !== i) sum += overlap(a, { x: n.x - r, y: n.y - r, w: r * 2, h: r * 2 });
    });
  });
  return sum;
}

/**
 * Where an area's node sits on the campaign map (CampaignMapScene, pure for the tests). Portrait stretches the
 * theater's nodes over the whole map (#162); the bottom `strip` is kept for the note on the other seas (#336).
 */
export function mapNodePos(a: { x: number; y: number }, theater: ReadonlyArray<{ x: number; y: number }>, m: IBox, portrait: boolean, strip: number, pad = 60): { x: number; y: number } {
  const fit = (v: number, lo: number, hi: number): number => (portrait && hi - lo > 0.2 ? (v - lo) / (hi - lo) : v);
  const xs = theater.map((n) => n.x);
  const ys = theater.map((n) => n.y);
  // The stretched portrait map keeps its top row clear of the 制海権 line and the sweep button (#50).
  const top = portrait ? pad + 20 : pad;
  return {
    x: m.x + pad + fit(a.x, Math.min(...xs), Math.max(...xs)) * (m.w - pad * 2),
    y: m.y + top + fit(a.y, Math.min(...ys), Math.max(...ys)) * (m.h - pad - top - strip),
  };
}

/** What else sits on the campaign map (CampaignMapScene): the 制海権 line at the top left (#50) and the sweep button. */
export function mapObstacles(m: IBox, portrait: boolean, seaLineW: number): IBox[] {
  const sweep = portrait ? { w: 200, h: 40, cx: m.x + m.w - 110, cy: m.y + 30 } : { w: 160, h: 30, cx: m.x + m.w - 90, cy: m.y + 24 };
  return [
    { x: m.x + 18, y: m.y + 12, w: seaLineW, h: 16 },
    { x: sweep.cx - sweep.w / 2, y: sweep.cy - sweep.h / 2, w: sweep.w, h: sweep.h },
  ];
}
