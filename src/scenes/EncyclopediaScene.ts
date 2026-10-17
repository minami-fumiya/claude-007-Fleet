import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { CLASS_JA, CLASS_ORDER, filterEntries, summarizeWeapons } from '@/systems/EncyclopediaSystem';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { list: { x: 16, y: 140, w: CANVAS_W - 32, h: 520 } as IRect, rowH: 52, cols: 2, detail: { x: 16, y: 676, w: CANVAS_W - 32, h: CANVAS_H - 692 } as IRect, tabH: 52 }
  : { list: { x: 24, y: 96, w: 380, h: 604 } as IRect, rowH: 40, cols: 1, detail: { x: 420, y: 96, w: 836, h: 604 } as IRect, tabH: 38 };

const PAD = 14;
const FILTERS: Array<ShipClass | null> = [null, ...CLASS_ORDER];

/** 艦艇図鑑: every ship in the game with its stats, armament and a short history. */
export class EncyclopediaScene extends Phaser.Scene {
  private nation: Nation = Nation.IJN;
  private shipClass: ShipClass | null = null;
  private page = 0;
  private selectedId = '';
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private maxStat = { hp: 1, armor: 1, speed: 1 };

  constructor() {
    super({ key: SceneKeys.ENCYCLOPEDIA });
  }

  create(): void {
    audio.music('menu');
    this.dynamic = [];
    this.page = 0;
    const all = DataLoader.getRegistry(this).all();
    this.maxStat = {
      hp: Math.max(...all.map((s) => s.hp)),
      armor: Math.max(...all.map((s) => s.armor)),
      speed: Math.max(...all.map((s) => s.speed)),
    };
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'ENCYCLOPEDIA', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '艦艇図鑑', displayStyle(24)).setOrigin(0.5);
    addPanel(this, L.list.x, L.list.y, L.list.w, L.list.h, { radius: 24, fillAlpha: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.refresh();
  }

  private entries(): IShipData[] {
    return filterEntries(DataLoader.getRegistry(this).byNation(this.nation), this.shipClass);
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o);
    return o;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const entries = this.entries();
    if (!entries.some((s) => s.id === this.selectedId)) this.selectedId = entries[0]?.id ?? '';
    this.buildFilters();
    this.buildList(entries);
    const ship = entries.find((s) => s.id === this.selectedId);
    if (ship) this.buildDetail(ship);
  }

  private buildFilters(): void {
    const { x, y, w } = L.list;
    const inner = w - PAD * 2;
    const tab = (row: number, labels: string[], active: number, onPick: (i: number) => void, fontSize: number): void => {
      const bw = (inner - 6 * (labels.length - 1)) / labels.length;
      labels.forEach((label, i) => {
        this.track(
          new UIButton(this, x + PAD + i * (bw + 6) + bw / 2, y + PAD + row * (L.tabH + 8) + L.tabH / 2, label, () => onPick(i), {
            variant: i === active ? 'primary' : 'secondary', width: bw, height: L.tabH, fontSize,
          }),
        );
      });
    };
    tab(0, PLAYABLE_NATIONS.map((n) => NATION_INFO[n].short), PLAYABLE_NATIONS.indexOf(this.nation), (i) => {
      this.nation = PLAYABLE_NATIONS[i];
      this.page = 0;
      this.refresh();
    }, 14);
    tab(1, FILTERS.map((c) => (c === null ? '全' : CLASS_JA[c].slice(0, 2))), FILTERS.indexOf(this.shipClass), (i) => {
      this.shipClass = FILTERS[i];
      this.page = 0;
      this.refresh();
    }, 12);
  }

  private buildList(entries: IShipData[]): void {
    const { x, y, w, h } = L.list;
    const top = y + PAD + 2 * (L.tabH + 8) + 4;
    const pagerH = L.tabH;
    const rows = Math.floor((y + h - PAD - pagerH - 8 - top) / (L.rowH + 6));
    const perPage = rows * L.cols;
    const pages = Math.max(1, Math.ceil(entries.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    const colW = (w - PAD * 2 - 8 * (L.cols - 1)) / L.cols;

    entries.slice(this.page * perPage, (this.page + 1) * perPage).forEach((ship, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const on = ship.id === this.selectedId;
      const frame = drawPanel(this.add.graphics(), 0, 0, colW, L.rowH, {
        radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.45, rimAlpha: on ? 0.85 : 0.15, glow: on ? 1 : 0,
      });
      const icon = this.add.image(26, L.rowH / 2, ship.spriteKey).setAngle(90);
      icon.setScale(Math.min(1, 40 / Math.max(1, icon.height)));
      const name = this.add.text(52, L.rowH / 2, ship.name.replace(/\s*\(.*\)\s*$/, ''), textStyle(IS_PORTRAIT ? 16 : 14, on ? Css.text : Css.muted)).setOrigin(0, 0.5);
      const cls = this.add.text(colW - 12, L.rowH / 2, `${ship.fictional ? '架空  ' : ''}${CLASS_JA[ship.shipClass]}`, eyebrowStyle(10, ship.fictional ? Css.gold : Css.dim)).setOrigin(1, 0.5);
      const card = this.track(this.add.container(x + PAD + col * (colW + 8), top + row * (L.rowH + 6), [frame, icon, name, cls]));
      makeClickable(card, colW, L.rowH);
      card.on('pointerup', () => {
        this.selectedId = ship.id;
        this.refresh();
      });
    });

    const py = y + h - PAD - pagerH / 2;
    const bw = IS_PORTRAIT ? 96 : 64;
    this.track(this.add.text(x + w / 2, py, `${this.page + 1} / ${pages}  ·  ${entries.length}隻`, textStyle(12, Css.muted)).setOrigin(0.5));
    if (this.page > 0) {
      this.track(new UIButton(this, x + PAD + bw / 2, py, '‹', () => { this.page--; this.refresh(); }, { variant: 'secondary', width: bw, height: pagerH, fontSize: 18 }));
    }
    if (this.page < pages - 1) {
      this.track(new UIButton(this, x + w - PAD - bw / 2, py, '›', () => { this.page++; this.refresh(); }, { variant: 'secondary', width: bw, height: pagerH, fontSize: 18 }));
    }
  }

  private buildDetail(ship: IShipData): void {
    const d = L.detail;
    const x = d.x + 26;
    const w = d.w - 52;
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true } };
    const kind = ship.fictional ? `${CLASS_JA[ship.shipClass]}  ·  架空艦` : CLASS_JA[ship.shipClass];
    this.track(this.add.text(x, d.y + 20, `${NATION_INFO[ship.nation].ja}  ·  ${kind}`, eyebrowStyle(10, ship.fictional ? Css.gold : Css.cyan)));
    const title = this.track(this.add.text(x, d.y + 42, ship.name, displayStyle(IS_PORTRAIT ? 24 : 26)));
    let y = title.y + title.height + 18;
    if (ship.fictional) {
      this.track(this.add.text(x, title.y + title.height + 2, '工廠の研究「架空艦計画」で建造可能', textStyle(12, Css.gold)));
      y += 20;
    }
    const icon = this.track(this.add.image(d.x + d.w - 30, d.y + 22, ship.spriteKey).setOrigin(1, 0));
    icon.setScale(Math.min(2, (IS_PORTRAIT ? 150 : 140) / Math.max(1, icon.height)));

    // Stat meters
    const meters = this.track(this.add.graphics());
    const stats: Array<[string, number, number, number]> = [
      ['耐久', ship.hp, this.maxStat.hp, Colors.success],
      ['装甲', ship.armor, this.maxStat.armor, Colors.gold],
      ['速力', ship.speed, this.maxStat.speed, Colors.cyan],
    ];
    const meterW = IS_PORTRAIT ? w - 230 : Math.min(420, w - 150);
    for (const [label, v, max, color] of stats) {
      this.track(this.add.text(x, y, label, eyebrowStyle(10, Css.muted)));
      drawMeter(meters, x + 56, y + 3, meterW, 8, v / max, color);
      this.track(this.add.text(x + 66 + meterW, y - 3, String(v), textStyle(14, Css.text, { fontStyle: 'bold' })));
      y += 26;
    }
    y += 8;

    // Armament
    this.track(this.add.text(x, y, '兵装', eyebrowStyle(10, Css.gold)));
    y += 20;
    const lines = summarizeWeapons(ship.weapons).map(({ id, count }) => {
      const wd = DataLoader.getWeaponById(this, id);
      return `${wd?.name ?? id}${count > 1 ? ` ×${count}` : ''}`;
    });
    if (ship.airWing) {
      const a = ship.airWing;
      lines.push(`艦載機  戦闘機 ${a.fighters} / 艦爆 ${a.diveBombers} / 艦攻 ${a.torpedoBombers}`);
    }
    const arm = this.track(this.add.text(x, y, lines.join('\n'), textStyle(13, Css.text, { ...wrap, lineSpacing: 4 })));
    y = arm.y + arm.height + 18;

    // History
    this.track(this.add.text(x, y, '解説', eyebrowStyle(10, Css.gold)));
    this.track(this.add.text(x, y + 20, ship.description ?? '—', textStyle(14, Css.muted, { ...wrap, lineSpacing: 6 })));
  }
}
