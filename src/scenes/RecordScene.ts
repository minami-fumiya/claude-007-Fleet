import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { emptyCareer, hitRate, MEDAL_CATEGORY_LABEL, MedalCategory, medalProgress, MEDALS, RECORD_MODE_LABEL, RECORD_MODES, scenarioWins, totalSunk, unsortedRecord, emptyModeRecord } from '@/systems/RecordSystem';
import { medalContext } from '@/utils/MedalContext';
import { unlocksOf } from '@/systems/MedalGate';
import { TECH_TREE } from '@/systems/ResearchSystem';
import { CLASS_JA, CLASS_ORDER } from '@/systems/EncyclopediaSystem';
import { awardPendingMedals, loadProgress, loadSave, saveProgress } from '@/utils/ProgressStore';
import { earnedTitles, TITLES } from '@/systems/AdmiralTitles';
import { INCOME, LEDGER_HOURS, LEDGER_LABEL, LedgerCategory, ledgerHours, ledgerTotals, SPENDING } from '@/systems/LedgerSystem';
import { RESOURCE_KEYS, RESOURCE_LABEL, resources } from '@/systems/ResourceSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, addStatCard, drawMeter, drawPanel, UIButton } from '@/ui/components/UIKit';
import { IModeRecord, IServiceRecord, RecordMode } from '@/types/Record';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

interface IRect { x: number; y: number; w: number; h: number }

/** The right panel (#92 #137): medals, the career figures, titles or the resource ledger. */
type RecordView = 'medals' | 'career' | 'titles' | 'ledger';
const VIEW_LABEL: Record<RecordView, string> = { medals: '勲章', career: '記録', titles: '称号', ledger: '資源の収支' };

const L = IS_PORTRAIT
  ? { stats: { x: 16, y: 140, w: CANVAS_W - 32, h: 384 } as IRect, statCols: 3, medals: { x: 16, y: 540, w: CANVAS_W - 32, h: CANVAS_H - 556 } as IRect, medalCols: 2 }
  : { stats: { x: 24, y: 96, w: 400, h: 604 } as IRect, statCols: 2, medals: { x: 440, y: 96, w: 816, h: 604 } as IRect, medalCols: 3 };

/** 戦績: career totals and the medal case. */
export class RecordScene extends Phaser.Scene {
  /** Right panel: the medal case or the resource ledger (#137) */
  private view: RecordView = 'medals';
  /** 称号 page (#92) */
  private titlePage = 0;
  private layer: Phaser.GameObjects.GameObject[] = [];
  /** Medal case category and page (#92) */
  private medalCategory: MedalCategory = 'sink';
  private medalPage = 0;
  /** Which battles the figures count (#177): all, or one kind */
  private mode: RecordMode | 'all' = 'all';
  private statsLayer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.RECORD });
  }

  init(data?: { view?: RecordView }): void {
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
    const p = L.stats;
    addPanel(this, p.x, p.y, p.w, p.h, { radius: 24, fillAlpha: 0.55, glow: 0.5 });
    this.buildStats(loadProgress().record);
    const m = L.medals;
    addPanel(this, m.x, m.y, m.w, m.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.layer = [];
    this.showView(this.view);
  }

  /** Switches the right panel between the medals and the ledger. */
  showView(view: RecordView): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    this.view = view;
    const p = L.medals;
    const views = Object.keys(VIEW_LABEL) as RecordView[];
    const tw = IS_PORTRAIT ? 104 : 100;
    const th = IS_PORTRAIT ? 44 : 32;
    views.forEach((v, i) => {
      const w = v === 'ledger' ? tw + 30 : tw;
      const right = views.slice(i + 1).reduce((sum, x) => sum + (x === 'ledger' ? tw + 30 : tw) + 8, 0);
      this.track(new UIButton(this, p.x + p.w - 22 - right - w / 2, p.y + 14 + th / 2, VIEW_LABEL[v], () => this.showView(v), {
        variant: v === view ? 'primary' : 'secondary', width: w, height: th, fontSize: 13,
      }));
    });
    if (view === 'medals') this.buildMedals(loadProgress().record.medals);
    else if (view === 'career') this.buildCareer();
    else if (view === 'titles') this.buildTitles();
    else this.buildLedger();
  }

  /** 通算の記録 (#92): what the ships have done since 0.0.51, a row each. */
  private buildCareer(): void {
    const p = L.medals;
    const c = loadProgress().record.career ?? emptyCareer();
    this.track(this.add.text(p.x + 22, p.y + 18, '通算の記録', eyebrowStyle(11)));
    const rate = (hits: number, fired: number): string => {
      const r = hitRate(hits, fired);
      return r === undefined ? '—' : `${r}%`;
    };
    const time = (sec: number): string => (sec <= 0 ? '—' : sec >= 3600 ? `${Math.floor(sec / 3600)} 時間 ${Math.floor((sec % 3600) / 60)} 分` : `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`);
    const n = (v: number): string => Math.round(v).toLocaleString('en-US');
    const rows: Array<[string, string]> = [
      ['航行距離', `${n(c.distanceNm)} 海里`],
      ['主砲・副砲の発射', `${n(c.shellsFired)} 発`],
      ['主砲・副砲の命中', `${n(c.shellHits)} 発  (命中率 ${rate(c.shellHits, c.shellsFired)})`],
      ['魚雷の発射', `${n(c.torpedoesFired)} 本`],
      ['魚雷の命中', `${n(c.torpedoHits)} 本  (命中率 ${rate(c.torpedoHits, c.torpedoesFired)})`],
      ['爆雷の投下', `${n(c.chargesDropped)} 発`],
      ['敵機の撃墜', `${n(c.planesDown)} 機`],
      ['受けたダメージ', n(c.damageTaken)],
      ['戦闘時間の合計', time(c.battleSec)],
      ['最も長い戦闘', time(c.longestSec)],
      ['最も早い勝利', time(c.fastestWinSec)],
      ['1 戦の最多撃沈', `${c.mostSunk} 隻`],
    ];
    const top = p.y + (IS_PORTRAIT ? 80 : 64);
    const rowH = Math.min(IS_PORTRAIT ? 44 : 38, (p.h - (top - p.y) - 50) / rows.length);
    const g = this.track(this.add.graphics());
    rows.forEach(([label, value], i) => {
      const y = top + i * rowH;
      if (i % 2 === 0) {
        g.fillStyle(0xffffff, 0.04);
        g.fillRect(p.x + 16, y - 4, p.w - 32, rowH);
      }
      this.track(this.add.text(p.x + 26, y + rowH / 2 - 4, label, textStyle(IS_PORTRAIT ? 14 : 13, Css.muted)).setOrigin(0, 0.5));
      this.track(this.add.text(p.x + p.w - 26, y + rowH / 2 - 4, value, textStyle(IS_PORTRAIT ? 15 : 14, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0.5));
    });
    this.track(this.add.text(p.x + 22, p.y + p.h - 18, '作戦と演習の戦闘を、0.0.51 から数えます (史実は入りません)', textStyle(11, Css.dim)).setOrigin(0, 1));
  }

  /** 称号 (#92): earned titles can be worn (one at a time, shown on the home screen); the rest say which medal. */
  private buildTitles(): void {
    const p = L.medals;
    const record = loadProgress().record;
    const earned = earnedTitles(record.medals);
    this.track(this.add.text(p.x + 22, p.y + 18, `称号  ·  ${earned.length} / ${TITLES.length}`, eyebrowStyle(11)));
    const cols = L.medalCols;
    const rowsPerPage = 6;
    const perPage = cols * rowsPerPage;
    const pages = Math.max(1, Math.ceil(TITLES.length / perPage));
    this.titlePage = Math.min(this.titlePage, pages - 1);
    const top = p.y + (IS_PORTRAIT ? 80 : 64);
    const navH = IS_PORTRAIT ? 52 : 36;
    const gap = 10;
    const cw = (p.w - 44 - gap * (cols - 1)) / cols;
    const ch = (p.y + p.h - 16 - navH - 10 - top - gap * (rowsPerPage - 1)) / rowsPerPage;
    TITLES.slice(this.titlePage * perPage, (this.titlePage + 1) * perPage).forEach((t, i) => {
      const x = p.x + 22 + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      const on = record.medals.includes(t.medal);
      const worn = record.title === t.id && on;
      const medal = MEDALS.find((m) => m.id === t.medal);
      this.track(drawPanel(this.add.graphics(), x, y, cw, ch, {
        radius: 12, fill: worn ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.35, rimAlpha: worn ? 1 : on ? 0.5 : 0.12, glow: worn ? 0.9 : 0,
      }));
      this.track(this.add.text(x + 14, y + 8, `${worn ? '✓ ' : ''}${t.name}`, textStyle(14, on ? (worn ? Css.gold : Css.text) : Css.muted, { fontStyle: 'bold' })));
      this.track(this.add.text(x + 14, y + ch - 8, on ? (worn ? '着用中 (もう一度で外す)' : 'タップで着ける') : `条件: ${medal?.name ?? t.medal}`, textStyle(10, on ? Css.cyan : Css.dim)).setOrigin(0, 1));
      if (!on) return;
      const zone = this.track(this.add.zone(x + cw / 2, y + ch / 2, cw, ch).setInteractive({ useHandCursor: true }));
      zone.on('pointerup', () => {
        const progress = loadProgress();
        saveProgress({ ...progress, record: { ...progress.record, title: worn ? undefined : t.id } });
        this.showView('titles');
      });
    });
    if (pages > 1) {
      const ny = p.y + p.h - 16 - navH / 2;
      const nw = IS_PORTRAIT ? 120 : 90;
      this.track(new UIButton(this, p.x + p.w / 2 - nw - 50, ny, '‹ 前', () => {
        this.titlePage = (this.titlePage + pages - 1) % pages;
        this.showView('titles');
      }, { variant: 'secondary', width: nw, height: navH, fontSize: 13 }));
      this.track(this.add.text(p.x + p.w / 2, ny, `${this.titlePage + 1} / ${pages}`, textStyle(13, Css.muted)).setOrigin(0.5));
      this.track(new UIButton(this, p.x + p.w / 2 + nw + 50, ny, '次 ›', () => {
        this.titlePage = (this.titlePage + 1) % pages;
        this.showView('titles');
      }, { variant: 'secondary', width: nw, height: navH, fontSize: 13 }));
    }
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
    const lost = totals.overflow;
    const extra = lost ? 3 : 2;
    const rowH = Math.min(IS_PORTRAIT ? 40 : 30, (p.h - (top - p.y) - 70) / (rows.length + extra));
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
    // Per hour played (#222): which resource runs short shows at a glance.
    const hours = ledgerHours(loadProgress().ledger, now);
    const hy = ny + rowH;
    this.track(this.add.text(p.x + 22, hy, `1 時間あたり (${hours} 時間)`, textStyle(IS_PORTRAIT ? 12 : 11, Css.muted)));
    RESOURCE_KEYS.forEach((k, j) => {
      const v = Math.round(net[k] / hours);
      this.track(this.add.text(p.x + 22 + labelW + j * colW + colW - 8, hy, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')}`, textStyle(IS_PORTRAIT ? 12 : 11, v < 0 ? Css.danger : Css.muted)).setOrigin(1, 0));
    });
    // Income the holding cap turned away (#221).
    if (lost) {
      const ly = hy + rowH;
      this.track(this.add.text(p.x + 22, ly, LEDGER_LABEL.overflow, textStyle(IS_PORTRAIT ? 12 : 11, Css.dim)));
      RESOURCE_KEYS.forEach((k, j) => {
        this.track(this.add.text(p.x + 22 + labelW + j * colW + colW - 8, ly, lost[k] > 0 ? lost[k].toLocaleString('en-US') : '—', textStyle(IS_PORTRAIT ? 12 : 11, Css.dim)).setOrigin(1, 0));
      });
    }
  }

  /**
   * 通算 (#177): the career totals or one kind of battle, picked with the tabs. 全体 is the career totals (作戦と演習);
   * 史実 adds how many scenarios were won, and from both sides.
   */
  private buildStats(record: IServiceRecord): void {
    for (const o of this.statsLayer) o.destroy();
    this.statsLayer = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.statsLayer.push(o);
      return o;
    };
    const p = L.stats;
    const tabs: Array<RecordMode | 'all'> = ['all', ...RECORD_MODES];
    const tw = (p.w - 44 - 6 * (tabs.length - 1)) / tabs.length;
    const th = IS_PORTRAIT ? 40 : 30;
    tabs.forEach((t, i) => {
      add(new UIButton(this, p.x + 22 + i * (tw + 6) + tw / 2, p.y + 16 + th / 2, t === 'all' ? '全体' : RECORD_MODE_LABEL[t], () => {
        this.mode = t;
        this.buildStats(loadProgress().record);
      }, { variant: t === this.mode ? 'primary' : 'secondary', width: tw, height: th, fontSize: IS_PORTRAIT ? 14 : 12 }));
    });
    const r: IModeRecord = this.mode === 'all' ? record : record.byMode?.[this.mode] ?? emptyModeRecord();
    const old = unsortedRecord(record);
    const wins = scenarioWins(record);
    const note = this.mode === 'all'
      ? `作戦と演習の通算${old.sorties > 0 ? ` (うち区分なし・0.0.30 以前: 出撃 ${old.sorties}・勝利 ${old.victories})` : ''}`
      : this.mode === 'scenario' ? `通算には入りません  ·  勝利したシナリオ ${wins.won} 種類・両陣営で勝利 ${wins.bothSides} 種類` : `${RECORD_MODE_LABEL[this.mode]}の戦闘 (0.0.31 から)`;
    add(this.add.text(p.x + 22, p.y + 24 + th, note, textStyle(IS_PORTRAIT ? 12 : 11, Css.muted, { wordWrap: { width: p.w - 44, useAdvancedWrap: true } })));
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
    const top = p.y + th + (IS_PORTRAIT ? 62 : 70);
    cards.forEach(([label, value, css], i) => {
      add(addStatCard(this, p.x + 22 + (i % L.statCols) * (cw + gap), top + Math.floor(i / L.statCols) * (ch + gap), cw, ch, label, value, css).container);
    });
    let y = top + Math.ceil(cards.length / L.statCols) * (ch + gap) + 12;
    add(this.add.text(p.x + 22, y, '艦種別撃沈', eyebrowStyle(10, Css.gold)));
    y += 22;
    if (IS_PORTRAIT) {
      // One row: class name over its count.
      const colW = (p.w - 44) / CLASS_ORDER.length;
      CLASS_ORDER.forEach((c, i) => {
        const cx = p.x + 22 + i * colW + colW / 2;
        add(this.add.text(cx, y, CLASS_JA[c], textStyle(12, Css.muted)).setOrigin(0.5, 0));
        add(this.add.text(cx, y + 22, String(r.sunk[c] ?? 0), textStyle(20, Css.text, { fontStyle: 'bold' })).setOrigin(0.5, 0));
      });
      return;
    }
    for (const c of CLASS_ORDER) {
      add(this.add.text(p.x + 22, y, CLASS_JA[c], textStyle(13, Css.muted)));
      add(this.add.text(p.x + p.w - 22, y, String(r.sunk[c] ?? 0), textStyle(13, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0));
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
    const rowsPerPage = 5;
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
      this.track(this.add.text(tx, y + (IS_PORTRAIT ? 34 : 30), m.description, textStyle(11, on ? Css.muted : Css.dim)));
      // What the medal opens (#169): as many as fit the card, then "ほか n 件".
      const opens = unlocksOf(m.id);
      const items = [...opens.research.map((id) => TECH_TREE.find((n) => n.id === id)?.name ?? id), ...opens.other];
      if (items.length > 0) {
        const t = this.track(this.add.text(tx, y + (IS_PORTRAIT ? 54 : 48), '', textStyle(10, on ? Css.gold : Css.muted)));
        for (let n = items.length; n >= 1; n--) {
          t.setText(`解放: ${items.slice(0, n).join('・')}${n < items.length ? ` ほか ${items.length - n} 件` : ''}`);
          if (t.width <= tw) break;
        }
      }
      if (!on) {
        const [value, goal] = medalProgress(m.id, record, ctx);
        drawMeter(this.track(this.add.graphics()), tx, y + ch - 10, tw - 70, 4, value / goal, Colors.cyan);
        this.track(this.add.text(x + cw - 10, y + ch - 6, `${value.toLocaleString()} / ${goal.toLocaleString()}`, textStyle(10, Css.cyan)).setOrigin(1, 1));
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
