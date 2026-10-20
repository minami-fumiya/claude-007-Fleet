import Phaser from 'phaser';
import { Nation } from '@/types/Nation';

/**
 * Simplified naval ensigns for the title screen (#198), drawn with Graphics: the colours and the main shape of each
 * navy's flag, not a faithful copy.
 */
export function drawFlag(g: Phaser.GameObjects.Graphics, nation: Nation, x: number, y: number, w: number, h: number): void {
  const rect = (c: number, rx: number, ry: number, rw: number, rh: number): void => {
    g.fillStyle(c, 1);
    g.fillRect(x + rx * w, y + ry * h, rw * w, rh * h);
  };
  switch (nation) {
    case Nation.IJN: {
      rect(0xffffff, 0, 0, 1, 1);
      g.fillStyle(0xc8102e, 1);
      const cx = x + w * 0.42;
      const cy = y + h / 2;
      // Where a ray from the sun meets the flag's edge, so the rays stay inside it.
      const edge = (a: number): Phaser.Math.Vector2 => {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const tx = dx > 0 ? (x + w - cx) / dx : dx < 0 ? (x - cx) / dx : Infinity;
        const ty = dy > 0 ? (y + h - cy) / dy : dy < 0 ? (y - cy) / dy : Infinity;
        const k = Math.min(tx, ty);
        return new Phaser.Math.Vector2(cx + dx * k, cy + dy * k);
      };
      for (let i = 0; i < 16; i += 2) {
        const a = edge((i / 16) * Math.PI * 2);
        const b = edge(((i + 1) / 16) * Math.PI * 2);
        // A ray that spans a corner gets the corner too.
        const corner = new Phaser.Math.Vector2(Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5 ? (Math.abs(a.x - x) < 0.5 || Math.abs(a.x - x - w) < 0.5 ? a.x : b.x) : a.x, Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5 ? (Math.abs(a.y - y) < 0.5 || Math.abs(a.y - y - h) < 0.5 ? a.y : b.y) : a.y);
        g.fillPoints([new Phaser.Math.Vector2(cx, cy), a, corner, b], true);
      }
      g.fillCircle(cx, cy, h * 0.28);
      break;
    }
    case Nation.USN:
      for (let i = 0; i < 7; i++) rect(i % 2 === 0 ? 0xb22234 : 0xffffff, 0, i / 7, 1, 1 / 7);
      rect(0x3c3b6e, 0, 0, 0.42, 4 / 7);
      break;
    case Nation.KM:
      // Red field, a white disc and a black cross.
      rect(0xdd0000, 0, 0, 1, 1);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + w / 2, y + h / 2, h * 0.36);
      rect(0x000000, 0.46, 0.22, 0.08, 0.56);
      rect(0x000000, 0.34, 0.44, 0.32, 0.12);
      break;
    case Nation.RN:
      rect(0xffffff, 0, 0, 1, 1);
      rect(0xc8102e, 0.45, 0, 0.1, 1);
      rect(0xc8102e, 0, 0.42, 1, 0.16);
      rect(0x012169, 0, 0, 0.42, 0.42);
      rect(0xffffff, 0.17, 0, 0.08, 0.42);
      rect(0xffffff, 0, 0.17, 0.42, 0.08);
      break;
    case Nation.FR:
      rect(0x0055a4, 0, 0, 1 / 3, 1);
      rect(0xffffff, 1 / 3, 0, 1 / 3, 1);
      rect(0xef4135, 2 / 3, 0, 1 / 3, 1);
      break;
    case Nation.RM:
      rect(0x009246, 0, 0, 1 / 3, 1);
      rect(0xffffff, 1 / 3, 0, 1 / 3, 1);
      rect(0xce2b37, 2 / 3, 0, 1 / 3, 1);
      break;
    case Nation.SU: {
      rect(0xffffff, 0, 0, 1, 1);
      rect(0x0039a6, 0, 0.82, 1, 0.18);
      g.fillStyle(0xcc0000, 1);
      const cx = x + w * 0.3;
      const cy = y + h * 0.4;
      const r = h * 0.2;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.42;
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
      }
      g.fillPoints(pts, true);
      break;
    }
  }
  g.lineStyle(1, 0xffffff, 0.35);
  g.strokeRect(x, y, w, h);
}
