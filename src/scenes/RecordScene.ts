import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { MEDALS, totalSunk } from '@/systems/RecordSystem';
import { CLASS_JA, CLASS_ORDER } from '@/systems/EncyclopediaSystem';
import { loadProgress } from '@/utils/ProgressStore';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, drawPanel, UIButton } from '@/ui/components/UIKit';
import { IServiceRecord } from '@/types/Record';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { stats: { x: 16, y: 140, w: CANVAS_W - 32, h: 340 } as IRect, statCols: 3, medals: { x: 16, y: 496, w: CANVAS_W - 32, h: CANVAS_H - 512 } as IRect, medalCols: 2 }
  : { stats: { x: 24, y: 96, w: 400, h: 604 } as IRect, statCols: 2, medals: { x: 440, y: 96, w: 816, h: 604 } as IRect, medalCols: 3 };

/** 戦績: career totals and the medal case. */
export class RecordScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.RECORD });
  }

  create(): void {
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'SERVICE RECORD', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '戦績', displayStyle(24)).setOrigin(0.5);

    const record = loadProgress().record;
    this.buildStats(record);
    this.buildMedals(record.medals);
  }

  private buildStats(r: IServiceRecord): void {
    const p = L.stats;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.5 });
    this.add.text(p.x + 22, p.y + 18, 'TOTALS', eyebrowStyle(11));
    const winRate = r.sorties > 0 ? `${Math.round((r.victories / r.sorties) * 100)}%` : '—';
    const cards: Array<[string, string, string]> = [
      ['出撃', String(r.sorties), Css.text],
      ['勝利', `${r.victories}  (${winRate})`, Css.success],
      ['撃沈', String(totalSunk(r)), Css.gold],
      ['喪失', String(r.shipsLost), Css.danger],
      ['与ダメージ', r.damageDealt.toLocaleString('en-US'), Css.cyan],
      ['最大 (1 戦)', r.bestDamage.toLocaleString('en-US'), Css.cyan],
    ];
    const gap = 10;
    const cw = (p.w - 44 - gap * (L.statCols - 1)) / L.statCols;
    const ch = IS_PORTRAIT ? 78 : 70;
    const top = p.y + 46;
    cards.forEach(([label, value, css], i) => {
      addStatCard(this, p.x + 22 + (i % L.statCols) * (cw + gap), top + Math.floor(i / L.statCols) * (ch + gap), cw, ch, label, value, css);
    });
    let y = top + Math.ceil(cards.length / L.statCols) * (ch + gap) + 12;
    this.add.text(p.x + 22, y, '艦種別撃沈', eyebrowStyle(10, Css.gold));
    y += 22;
    if (IS_PORTRAIT) {
      // One row: class name over its count.
      const colW = (p.w - 44) / CLASS_ORDER.length;
      CLASS_ORDER.forEach((c, i) => {
        const cx = p.x + 22 + i * colW + colW / 2;
        this.add.text(cx, y, CLASS_JA[c], textStyle(12, Css.muted)).setOrigin(0.5, 0);
        this.add.text(cx, y + 22, String(r.sunk[c] ?? 0), textStyle(20, Css.text, { fontStyle: 'bold' })).setOrigin(0.5, 0);
      });
      return;
    }
    for (const c of CLASS_ORDER) {
      this.add.text(p.x + 22, y, CLASS_JA[c], textStyle(13, Css.muted));
      this.add.text(p.x + p.w - 22, y, String(r.sunk[c] ?? 0), textStyle(13, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0);
      y += 22;
    }
  }

  private buildMedals(earned: string[]): void {
    const p = L.medals;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.add.text(p.x + 22, p.y + 18, `MEDALS  ·  ${earned.length} / ${MEDALS.length}`, eyebrowStyle(11));
    const gap = 10;
    const cw = (p.w - 44 - gap * (L.medalCols - 1)) / L.medalCols;
    const rows = Math.ceil(MEDALS.length / L.medalCols);
    const ch = Math.min(IS_PORTRAIT ? 96 : 120, (p.h - 60 - gap * (rows - 1)) / rows);
    MEDALS.forEach((m, i) => {
      const on = earned.includes(m.id);
      const x = p.x + 22 + (i % L.medalCols) * (cw + gap);
      const y = p.y + 46 + Math.floor(i / L.medalCols) * (ch + gap);
      drawPanel(this.add.graphics(), x, y, cw, ch, {
        radius: 14, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.35, rimAlpha: on ? 0.8 : 0.12, glow: on ? 0.8 : 0,
      });
      const g = this.add.graphics();
      const cx = x + 30;
      const cy = y + ch / 2;
      g.fillStyle(on ? Colors.gold : 0xffffff, on ? 1 : 0.08);
      g.fillCircle(cx, cy, 15);
      g.lineStyle(2, 0xffffff, on ? 0.7 : 0.15);
      g.strokeCircle(cx, cy, 15);
      this.add.text(x + 56, cy - 4, m.name, textStyle(15, on ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0, 1);
      this.add.text(x + 56, cy + 2, m.description, textStyle(11, on ? Css.muted : Css.dim, { wordWrap: { width: cw - 66, useAdvancedWrap: true } })).setOrigin(0, 0);
    });
  }
}
