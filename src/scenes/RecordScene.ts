import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { MEDAL_CATEGORY_LABEL, MedalCategory, medalProgress, MEDALS, totalSunk } from '@/systems/RecordSystem';
import { medalContext } from '@/utils/MedalContext';
import { CLASS_JA, CLASS_ORDER } from '@/systems/EncyclopediaSystem';
import { awardPendingMedals, loadProgress, loadSave } from '@/utils/ProgressStore';
import { INCOME, LEDGER_HOURS, LEDGER_LABEL, LedgerCategory, ledgerTotals, SPENDING } from '@/systems/LedgerSystem';
import { RESOURCE_KEYS, RESOURCE_LABEL, resources } from '@/systems/ResourceSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, drawMeter, drawPanel, UIButton } from '@/ui/components/UIKit';
import { IServiceRecord } from '@/types/Record';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { stats: { x: 16, y: 140, w: CANVAS_W - 32, h: 340 } as IRect, statCols: 3, medals: { x: 16, y: 496, w: CANVAS_W - 32, h: CANVAS_H - 512 } as IRect, medalCols: 2 }
  : { stats: { x: 24, y: 96, w: 400, h: 604 } as IRect, statCols: 2, medals: { x: 440, y: 96, w: 816, h: 604 } as IRect, medalCols: 3 };

/** 戦績: career totals and the medal case. */
export class RecordScene extends Phaser.Scene {
  /** Right panel: the medal case or the resource ledger (#137) */
  private view: 'medals' | 'ledger' = 'medals';
  private layer: Phaser.GameObjects.GameObject[] = [];
  /** Medal case category and page (#92) */
  private medalCategory: MedalCategory = 'sink';
  private medalPage = 0;

  constructor() {
    super({ key: SceneKeys.RECORD });
  }

  init(data?: { view?: 'medals' | 'ledger' }): void {
    this.view = data?.view ?? 'medals';
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '戦績', displayStyle(24)).setOrigin(0.5);

    awardPendingMedals();
    const record = loadProgress().record;
    this.buildStats(record);
    const p = L.medals;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.layer = [];
    this.showView(this.view);
  }

  /** Switches the right panel between the medals and the ledger. */
  showView(view: 'medals' | 'ledger'): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    this.view = view;
    const p = L.medals;
    const tw = IS_PORTRAIT ? 150 : 130;
    const th = IS_PORTRAIT ? 44 : 32;
    (['medals', 'ledger'] as const).forEach((v, i) => {
      this.track(new UIButton(this, p.x + p.w - 22 - (1 - i) * (tw + 8) - tw / 2, p.y + 14 + th / 2, v === 'medals' ? '勲章' : '資源の収支', () => this.showView(v), {
        variant: v === view ? 'primary' : 'secondary', width: tw, height: th, fontSize: 13,
      }));
    });
    if (view === 'medals') this.buildMedals(loadProgress().record.medals);
    else this.buildLedger();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  /**
   * 資源の収支 (#137): the last 24 hours by category, a row each, with a bar per resource scaled to the largest
   * figure of that resource.
   */
  private buildLedger(): void {
    const p = L.medals;
    const now = Date.now();
    const totals = ledgerTotals(loadProgress().ledger, now);
    this.track(this.add.text(p.x + 22, p.y + 18, `資源の収支  ·  直近 ${LEDGER_HOURS} 時間`, eyebrowStyle(11)));
    const rows: Array<{ cat: LedgerCategory | 'net'; sign: 1 | -1 }> = [
      ...INCOME.filter((c) => totals[c]).map((c) => ({ cat: c, sign: 1 as const })),
      ...SPENDING.filter((c) => totals[c]).map((c) => ({ cat: c, sign: -1 as const })),
    ];
    const top = p.y + (IS_PORTRAIT ? 74 : 62);
    if (rows.length === 0) {
      this.track(this.add.text(p.x + p.w / 2, p.y + p.h / 2, 'まだ記録がありません\n(戦闘・建造・修理などをすると記録されます)', textStyle(14, Css.dim, { align: 'center' })).setOrigin(0.5));
      return;
    }
    const net = resources();
    for (const r of rows) for (const k of RESOURCE_KEYS) net[k] += r.sign * (totals[r.cat as LedgerCategory]?.[k] ?? 0);
    const labelW = IS_PORTRAIT ? 120 : 130;
    const colW = (p.w - 44 - labelW) / RESOURCE_KEYS.length;
    const rowH = Math.min(IS_PORTRAIT ? 40 : 30, (p.h - (top - p.y) - 70) / (rows.length + 1));
    RESOURCE_KEYS.forEach((k, i) => this.track(this.add.text(p.x + 22 + labelW + i * colW + colW - 8, top, RESOURCE_LABEL[k], textStyle(11, Css.muted)).setOrigin(1, 0)));
    const max: Record<string, number> = {};
    for (const k of RESOURCE_KEYS) max[k] = Math.max(1, ...rows.map((r) => totals[r.cat as LedgerCategory]?.[k] ?? 0));
    const g = this.track(this.add.graphics());
    rows.forEach((r, i) => {
      const y = top + 22 + i * rowH;
      const css = r.sign > 0 ? Css.success : Css.danger;
      this.track(this.add.text(p.x + 22, y, `${r.sign > 0 ? '+' : '−'} ${LEDGER_LABEL[r.cat as LedgerCategory]}`, textStyle(IS_PORTRAIT ? 13 : 12, css)));
      RESOURCE_KEYS.forEach((k, j) => {
        const v = totals[r.cat as LedgerCategory]?.[k] ?? 0;
        const cx = p.x + 22 + labelW + j * colW;
        g.fillStyle(r.sign > 0 ? Colors.success : Colors.danger, 0.35);
        g.fillRect(cx, y + rowH - 10, (colW - 12) * (v / max[k]), 4);
        this.track(this.add.text(cx + colW - 8, y, v > 0 ? v.toLocaleString('en-US') : '—', textStyle(IS_PORTRAIT ? 13 : 12, v > 0 ? Css.text : Css.dim)).setOrigin(1, 0));
      });
    });
    const ny = top + 22 + rows.length * rowH + 6;
    g.lineStyle(1, 0xffffff, 0.2);
    g.lineBetween(p.x + 22, ny - 3, p.x + p.w - 22, ny - 3);
    this.track(this.add.text(p.x + 22, ny, '差し引き', textStyle(IS_PORTRAIT ? 13 : 12, Css.text, { fontStyle: 'bold' })));
    RESOURCE_KEYS.forEach((k, j) => {
      const v = net[k];
      this.track(this.add.text(p.x + 22 + labelW + j * colW + colW - 8, ny, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')}`, textStyle(IS_PORTRAIT ? 13 : 12, v < 0 ? Css.danger : Css.success, { fontStyle: 'bold' })).setOrigin(1, 0));
    });
  }

  private buildStats(r: IServiceRecord): void {
    const p = L.stats;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.5 });
    this.add.text(p.x + 22, p.y + 18, '通算', eyebrowStyle(11));
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

  /**
   * The medal case (#92): one category at a time, a page of cards each. Earned medals shine; the rest show what they
   * need and how far along the admiral is.
   */
  private buildMedals(earned: string[]): void {
    const p = L.medals;
    const record = loadProgress().record;
    const ctx = medalContext(loadSave());
    const rate = Math.round((earned.filter((id) => MEDALS.some((m) => m.id === id)).length / MEDALS.length) * 100);
    this.track(this.add.text(p.x + 22, p.y + 18, `勲章  ·  ${earned.length} / ${MEDALS.length}  ·  達成率 ${rate}%`, eyebrowStyle(11)));
    const cats = Object.keys(MEDAL_CATEGORY_LABEL) as MedalCategory[];
    const top = p.y + (IS_PORTRAIT ? 70 : 56);
    const ctw = (p.w - 44 - 6 * (cats.length - 1)) / cats.length;
    const cth = IS_PORTRAIT ? 44 : 30;
    cats.forEach((c, i) => {
      const n = MEDALS.filter((m) => m.category === c);
      const got = n.filter((m) => earned.includes(m.id)).length;
      this.track(new UIButton(this, p.x + 22 + i * (ctw + 6) + ctw / 2, top + cth / 2, IS_PORTRAIT ? MEDAL_CATEGORY_LABEL[c].slice(0, 2) : `${MEDAL_CATEGORY_LABEL[c]} ${got}/${n.length}`, () => {
        this.medalCategory = c;
        this.medalPage = 0;
        this.showView('medals');
      }, { variant: c === this.medalCategory ? 'primary' : 'secondary', width: ctw, height: cth, fontSize: IS_PORTRAIT ? 13 : 11 }));
    });
    const list = MEDALS.filter((m) => m.category === this.medalCategory);
    const rowsPerPage = IS_PORTRAIT ? 6 : 5;
    const perPage = rowsPerPage * L.medalCols;
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    this.medalPage = Math.min(this.medalPage, pages - 1);
    const gap = 10;
    const gridTop = top + cth + 14;
    const navH = IS_PORTRAIT ? 52 : 36;
    const cw = (p.w - 44 - gap * (L.medalCols - 1)) / L.medalCols;
    const ch = (p.y + p.h - 16 - navH - 10 - gridTop - gap * (rowsPerPage - 1)) / rowsPerPage;
    list.slice(this.medalPage * perPage, (this.medalPage + 1) * perPage).forEach((m, i) => {
      const on = earned.includes(m.id);
      const x = p.x + 22 + (i % L.medalCols) * (cw + gap);
      const y = gridTop + Math.floor(i / L.medalCols) * (ch + gap);
      this.track(drawPanel(this.add.graphics(), x, y, cw, ch, {
        radius: 14, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.35, rimAlpha: on ? 0.8 : 0.12, glow: on ? 0.8 : 0,
      }));
      const g = this.track(this.add.graphics());
      const cx = x + 28;
      const cy = y + ch / 2;
      g.fillStyle(on ? Colors.gold : 0xffffff, on ? 1 : 0.08);
      g.fillCircle(cx, cy, 14);
      g.lineStyle(2, 0xffffff, on ? 0.7 : 0.15);
      g.strokeCircle(cx, cy, 14);
      const tx = x + 52;
      const tw = cw - 62;
      this.track(this.add.text(tx, y + 8, m.name, textStyle(14, on ? Css.text : Css.muted, { fontStyle: 'bold' })));
      this.track(this.add.text(tx, y + 30, m.description, textStyle(11, on ? Css.muted : Css.dim)));
      if (!on) {
        const [value, goal] = medalProgress(m.id, record, ctx);
        drawMeter(this.track(this.add.graphics()), tx, y + ch - 14, tw - 70, 4, value / goal, Colors.cyan);
        this.track(this.add.text(x + cw - 10, y + ch - 20, `${value.toLocaleString()} / ${goal.toLocaleString()}`, textStyle(10, Css.cyan)).setOrigin(1, 0));
      }
    });
    if (pages > 1) {
      const ny = p.y + p.h - 16 - navH / 2;
      const nw = IS_PORTRAIT ? 120 : 90;
      this.track(new UIButton(this, p.x + p.w / 2 - nw - 50, ny, '‹ 前', () => {
        this.medalPage = (this.medalPage + pages - 1) % pages;
        this.showView('medals');
      }, { variant: 'secondary', width: nw, height: navH, fontSize: 13 }));
      this.track(this.add.text(p.x + p.w / 2, ny, `${this.medalPage + 1} / ${pages}`, textStyle(13, Css.muted)).setOrigin(0.5));
      this.track(new UIButton(this, p.x + p.w / 2 + nw + 50, ny, '次 ›', () => {
        this.medalPage = (this.medalPage + 1) % pages;
        this.showView('medals');
      }, { variant: 'secondary', width: nw, height: navH, fontSize: 13 }));
    }
  }
}
