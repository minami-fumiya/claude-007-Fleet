/**
 * Routes between map nodes (#162, pure): a line from one node's rim to the other's, cut into dashes, so it never
 * crosses the node's number or rank letter.
 */

export interface ISegment { x1: number; y1: number; x2: number; y2: number }

/** The part of the line between two node centres that lies outside both circles (radius `r` plus `gap`), or null. */
export function rimSegment(from: { x: number; y: number }, to: { x: number; y: number }, r: number, gap = 4): ISegment | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const cut = r + gap;
  if (len <= cut * 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: from.x + ux * cut, y1: from.y + uy * cut, x2: to.x - ux * cut, y2: to.y - uy * cut };
}

/** A segment cut into dashes of `dash` px with `space` px between them; the last dash is shortened to fit. */
export function dashes(s: ISegment, dash = 10, space = 7): ISegment[] {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  if (len === 0) return [];
  const ux = (s.x2 - s.x1) / len;
  const uy = (s.y2 - s.y1) / len;
  const out: ISegment[] = [];
  for (let t = 0; t < len; t += dash + space) {
    const e = Math.min(len, t + dash);
    out.push({ x1: s.x1 + ux * t, y1: s.y1 + uy * t, x2: s.x1 + ux * e, y2: s.y1 + uy * e });
  }
  return out;
}
