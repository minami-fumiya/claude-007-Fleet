import Phaser from 'phaser';
import { Colors } from '@/ui/theme';

type Pt = [number, number];

const HULL = 0x0f2443;
const DECK = 0x183461;
const STEEL = 0x1d3c6c;

function poly(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
}

function outline(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha: number, width = 1.5): void {
  g.lineStyle(width, color, alpha);
  g.strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
}

/**
 * Side-view battleship silhouette for the title screen, drawn with Graphics only
 * (no image assets). Bow points right; waterline is local y = 0.
 */
export function addHeroShip(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const g = scene.add.graphics();

  // Reflection on the water
  g.fillStyle(Colors.cyan, 0.05);
  g.fillEllipse(0, 18, 560, 34);

  // Wake lines
  g.lineStyle(2, 0xbfefff, 0.25);
  for (const [x1, len, dy] of [[-300, 90, 8], [-340, 60, 16], [-280, 120, 24], [250, 50, 10]] as const) {
    g.lineBetween(x1, dy, x1 + len, dy);
  }

  // Hull
  const hull: Pt[] = [[-252, -24], [236, -30], [270, -42], [246, 6], [-226, 10], [-258, -4]];
  poly(g, hull, HULL);
  outline(g, hull, Colors.cyan, 0.35);
  g.lineStyle(2, Colors.cyan, 0.75);
  g.lineBetween(-252, -24, 236, -30);
  g.lineBetween(236, -30, 270, -42);

  // Boot topping stripe just above the waterline
  g.lineStyle(3, Colors.gold, 0.35);
  g.lineBetween(-232, 2, 240, 0);

  // Main turrets (two forward, one aft) with barrels
  const turret = (tx: number, dir: 1 | -1): void => {
    poly(g, [[tx - 24, -26], [tx + 24, -27], [tx + 18, -42], [tx - 20, -41]], STEEL);
    outline(g, [[tx - 24, -26], [tx + 24, -27], [tx + 18, -42], [tx - 20, -41]], Colors.cyan, 0.4, 1);
    g.lineStyle(3, 0x2a4c82, 1);
    for (const dy of [-31, -35, -38]) g.lineBetween(tx + dir * 14, dy, tx + dir * 70, dy - 3);
  };
  turret(118, 1);
  turret(170, 1);
  turret(-130, -1);

  // Superstructure (pagoda mast)
  poly(g, [[-60, -28], [60, -29], [52, -62], [-50, -60]], DECK);
  poly(g, [[-30, -60], [34, -61], [26, -96], [-20, -95]], STEEL);
  poly(g, [[-14, -95], [22, -96], [16, -132], [-8, -131]], DECK);
  poly(g, [[-22, -132], [32, -133], [30, -140], [-20, -139]], STEEL);
  outline(g, [[-60, -28], [60, -29], [52, -62], [-50, -60]], Colors.cyan, 0.35, 1);
  outline(g, [[-30, -60], [34, -61], [26, -96], [-20, -95]], Colors.cyan, 0.35, 1);
  outline(g, [[-14, -95], [22, -96], [16, -132], [-8, -131]], Colors.cyan, 0.35, 1);

  // Mast and yard
  g.lineStyle(2, Colors.cyan, 0.6);
  g.lineBetween(4, -140, 2, -186);
  g.lineBetween(-14, -168, 20, -168);

  // Raked funnel
  poly(g, [[66, -29], [108, -30], [92, -98], [64, -96]], STEEL);
  outline(g, [[66, -29], [108, -30], [92, -98], [64, -96]], Colors.cyan, 0.35, 1);

  // Secondary guns and aft structure
  poly(g, [[-96, -26], [-60, -27], [-64, -44], [-92, -43]], DECK);
  poly(g, [[-200, -24], [-168, -25], [-172, -36], [-196, -35]], DECK);

  // Lit portholes / bridge windows
  g.fillStyle(Colors.gold, 0.9);
  for (let wx = -40; wx <= 40; wx += 14) g.fillRect(wx, -52, 6, 3);
  for (let wx = -18; wx <= 22; wx += 10) g.fillRect(wx, -84, 4, 3);
  g.fillRect(-2, -122, 10, 3);
  g.fillStyle(Colors.gold, 0.5);
  for (let wx = -200; wx <= 220; wx += 26) g.fillCircle(wx, -14, 1.6);

  const container = scene.add.container(x, y, [g]).setScale(scale);

  scene.tweens.add({
    targets: container,
    y: y + 5,
    angle: 0.6,
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return container;
}
