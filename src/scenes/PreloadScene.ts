import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import ijnData from '@/data/ships/ijn.json';
import weaponsData from '@/data/weapons/weapons.json';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.PRELOAD });
  }

  preload(): void {
    this.createProgressBar();
    this.cache.json.add('ijn', ijnData);
    this.cache.json.add('weapons', weaponsData);
  }

  create(): void {
    this.generateShipTextures();
    this.generateShellTexture();
    this.scene.start(SceneKeys.MAIN_MENU);
  }

  private generateShipTextures(): void {
    // Battleship — wide hull, two gun turrets, grey
    this.makeShipTexture('yamato',  48, 30, 0x607080, 0x8090a0);
    this.makeShipTexture('musashi', 48, 30, 0x556877, 0x7888a0);
    // Cruiser — slimmer hull, green-grey
    this.makeShipTexture('takao',   36, 22, 0x407060, 0x608878);
    // Destroyer — narrow, dark teal
    this.makeShipTexture('fubuki',  24, 18, 0x304a60, 0x405e78);
    // Carrier — wide flat flight deck, tan
    this.makeCarrierTexture('shokaku', 52, 24, 0x806040, 0xa07850);
  }

  /**
   * Draws a generic warship silhouette pointing up (bow at top).
   * w × h are the texture dimensions.
   */
  private makeShipTexture(key: string, w: number, h: number, hullColor: number, accentColor: number): void {
    const g = this.add.graphics();

    // Main hull body
    g.fillStyle(hullColor);
    const hx = w * 0.25;  // hull half-width from center
    const midY = h * 0.35;
    g.fillRect(w / 2 - hx, midY, hx * 2, h * 0.55);

    // Bow — triangle pointing up
    g.fillTriangle(
      w / 2 - hx, midY,
      w / 2 + hx, midY,
      w / 2,      0,
    );

    // Superstructure block
    g.fillStyle(accentColor);
    g.fillRect(w / 2 - w * 0.12, midY + h * 0.05, w * 0.24, h * 0.2);

    // Gun turret dots
    g.fillStyle(0x202020);
    g.fillCircle(w / 2, midY + h * 0.12, 2.5);
    g.fillCircle(w / 2, h * 0.7, 2);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Carrier variant — elongated flat deck with island on starboard side. */
  private makeCarrierTexture(key: string, w: number, h: number, deckColor: number, islandColor: number): void {
    const g = this.add.graphics();

    // Flight deck — flat rectangle
    g.fillStyle(deckColor);
    g.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.65);

    // Bow taper
    g.fillTriangle(
      w * 0.1, h * 0.2,
      w * 0.9, h * 0.2,
      w * 0.5, 0,
    );

    // Island superstructure (starboard / right side)
    g.fillStyle(islandColor);
    g.fillRect(w * 0.62, h * 0.25, w * 0.15, h * 0.28);

    // Deck centre line
    g.lineStyle(1, 0xffffff, 0.25);
    g.lineBetween(w / 2, h * 0.22, w / 2, h * 0.83);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  private generateShellTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffee88);
    g.fillCircle(3, 3, 3);
    g.generateTexture('shell', 6, 6);
    g.destroy();
  }

  private createProgressBar(): void {
    const barW = 400;
    const barH = 20;
    const x = (CANVAS_W - barW) / 2;
    const y = CANVAS_H / 2;

    const border = this.add.graphics();
    border.lineStyle(2, 0xffffff);
    border.strokeRect(x, y, barW, barH);

    const fill = this.add.graphics();

    this.load.on('progress', (value: number) => {
      fill.clear();
      fill.fillStyle(0x4488ff);
      fill.fillRect(x + 2, y + 2, (barW - 4) * value, barH - 4);
    });

    this.add
      .text(CANVAS_W / 2, y - 30, 'Loading…', { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);
  }
}
