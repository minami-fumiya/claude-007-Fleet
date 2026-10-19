/**
 * Label placement for map nodes (#162, pure). Each label goes below, above, right or left of its node, whichever
 * overlaps the other nodes, the labels already placed and the map edge the least; when every side overlaps it is
 * tried again smaller. Placed in node order, so earlier nodes keep the natural spot (below).
 */

export interface IBox { x: number; y: number; w: number; h: number }

export interface IPlacedLabel extends IBox {
  side: 'below' | 'above' | 'right' | 'left';
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

export function placeLabels(nodes: ReadonlyArray<{ x: number; y: number }>, sizes: ReadonlyArray<{ w: number; h: number }>, r: number, bounds: IBox): IPlacedLabel[] {
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
      ];
      for (const o of options) {
        const hit = circles.reduce((s, c, j) => s + (j === i ? 0 : overlap(o, c)), 0) + placed.reduce((s, p) => s + overlap(o, p), 0);
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
export function layoutOverlap(nodes: ReadonlyArray<{ x: number; y: number }>, labels: readonly IBox[], r: number): number {
  let sum = 0;
  labels.forEach((a, i) => {
    labels.forEach((b, j) => {
      if (j > i) sum += overlap(a, b);
    });
    nodes.forEach((n, j) => {
      if (j !== i) sum += overlap(a, { x: n.x - r, y: n.y - r, w: r * 2, h: r * 2 });
    });
  });
  return sum;
}
