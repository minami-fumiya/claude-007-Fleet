import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import {
  CLASS_JA, CLASS_ORDER, collectionLabel, EncyclopediaTab, filterEntries, kindLabel, modifierLines, summarizeWeapons, TAB_LABEL, TABS,
  sisterNames,
} from '@/systems/EncyclopediaSystem';
import { aptitudeFor, earnedTraits, inherentLabel, SKILL_LABEL, SKILL_LEVEL_CAP, skillModifiers, withProgress } from '@/systems/CaptainSystem';
import { SKILL_COLOR } from '@/ui/SkillColors';
import { nationCaptains } from '@/systems/CaptainRoster';
import { rewardAreaOf } from '@/systems/ShipyardSystem';
import { loadSave } from '@/utils/ProgressStore';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { ICaptainData } from '@/types/Captain';
import { AircraftType } from '@/types/Aircraft';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';
import campaignData from '@/data/campaign.json';
import aircraftData from '@/data/aircraft.json';
import specialData from '@/data/special.json';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { list: { x: 16, y: 140, w: CANVAS_W - 32, h: 600 } as IRect, rowH: 52, cols: 2, detail: { x: 16, y: 756, w: CANVAS_W - 32, h: CANVAS_H - 772 } as IRect, tabH: 50 }
  : { list: { x: 24, y: 96, w: 380, h: 604 } as IRect, rowH: 40, cols: 1, detail: { x: 420, y: 96, w: 836, h: 604 } as IRect, tabH: 36 };

const PAD = 14;
const FILTERS: Array<ShipClass | null> = [null, ...CLASS_ORDER];
/** Nation tabs wrap after this many per row, so long Japanese names stay readable (#21). */
const NATION_COLS = 4;
const NATION_ROWS = Math.ceil(PLAYABLE_NATIONS.length / NATION_COLS);
const TAB_GAP = 8;
const ROW_GAP = 6;
/** Height of the collection line under the scrolling list */
const COUNT_H = IS_PORTRAIT ? 34 : 26;
const AREA_NAMES: Record<string, string> = Object.fromEntries(campaignData.areas.map((a) => [a.id, a.name]));

interface IAircraftEntry { id: string; nation: string; type: AircraftType; name: string; description: string }
const AIRCRAFT = (aircraftData as { aircraft: IAircraftEntry[] }).aircraft;
const AIRCRAFT_TYPE_JA: Record<AircraftType, string> = {
  [AircraftType.Fighter]: '艦上戦闘機', [AircraftType.DiveBomber]: '艦上爆撃機', [AircraftType.TorpedoBomber]: '艦上攻撃機', [AircraftType.Recon]: '水上偵察機',
};
const AIRCRAFT_TEXTURE: Record<AircraftType, string> = {
  [AircraftType.Fighter]: 'plane-fighter', [AircraftType.DiveBomber]: 'plane-dive', [AircraftType.TorpedoBomber]: 'plane-torpedo', [AircraftType.Recon]: 'plane-recon',
};
const AIRCRAFT_ROLE: Record<AircraftType, string> = {
  [AircraftType.Fighter]: '敵機を迎え撃ち、味方の攻撃隊を護衛する。',
  [AircraftType.DiveBomber]: '急降下して爆弾を当てる。装甲の薄い艦に強い。',
  [AircraftType.TorpedoBomber]: '低空から魚雷を放つ。大型艦に大きな損害を与える。',
  [AircraftType.Recon]: '戦艦・巡洋艦から飛び、敵を見つけて触接する (#98)。',
};
interface IGroundEntry { id: string; name: string; spriteKey: string; hp: number; armor: number; description: string }
const GROUND: IGroundEntry[] = [
  { ...specialData.convoy, description: '作戦「船団護衛」で守る、または沈める輸送船。武装は無い。' },
  ...specialData.landTargets.map((t) => ({
    ...t,
    description: t.id === 'land_battery' ? '海岸に据えた砲台。近づく艦を砲撃してくる。' : t.id === 'land_harbor' ? '港湾施設。作戦「対地攻撃」の目標。' : '飛行場。作戦「対地攻撃」の目標。今後、航空機を出撃させる (#83)。',
  })),
];

/** One row of the list. */
interface IEntry {
  id: string;
  name: string;
  /** Right-hand label (kind, skill, …) */
  sub: string;
  icon: string;
  owned: boolean;
}

/** 図鑑 (#43 / #44 / #91): ships, captains, aircraft and ground targets, by nation; owned-only or everything. */
export class EncyclopediaScene extends Phaser.Scene {
  private tab: EncyclopediaTab = 'ships';
  private nation: Nation = Nation.IJN;
  private shipClass: ShipClass | null = null;
  /** Show only what the player has (#44); off shows everything, the rest as silhouettes */
  private ownedOnly = true;
  private list!: ScrollList;
  private countText!: Phaser.GameObjects.Text;
  private selectedId = '';
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private maxStat = { hp: 1, armor: 1, speed: 1 };
  /** Where the back button goes (#178: the 改装 screen that opened this page), or the home port */
  private back: { scene: string; data?: object } | null = null;
  /** Entry to bring into view once the list is built */
  private revealId = '';

  constructor() {
    super({ key: SceneKeys.ENCYCLOPEDIA });
  }

  /** `tab` opens a tab directly (鎮守府 → 艦隊 → 艦長, #61); `id` an entry of the current nation (#178). */
  init(data?: { tab?: EncyclopediaTab; id?: string; back?: { scene: string; data?: object } }): void {
    if (data?.tab && TABS.includes(data.tab)) this.tab = data.tab;
    this.back = data?.back ?? null;
    this.revealId = data?.id ?? '';
    if (data?.id) {
      this.selectedId = data.id;
      this.shipClass = null;
    }
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    audio.music('menu');
    this.dynamic = [];
    this.nation = loadSave().current;
    this.ownedOnly = audio.settings.encyclopediaOwnedOnly;
    const all = DataLoader.getRegistry(this).all();
    this.maxStat = {
      hp: Math.max(...all.map((s) => s.hp)),
      armor: Math.max(...all.map((s) => s.armor)),
      speed: Math.max(...all.map((s) => s.speed)),
    };
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, this.back ? '‹  戻る' : '‹  鎮守府', () => (this.back ? this.scene.start(this.back.scene, this.back.data) : this.scene.start(SceneKeys.HOME)), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '図鑑', displayStyle(24)).setOrigin(0.5);
    addPanel(this, L.list.x, L.list.y, L.list.w, L.list.h, { radius: 24, fillAlpha: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    const { x, y, w, h } = L.list;
    const top = y + PAD + (NATION_ROWS + 2) * (L.tabH + TAB_GAP) + 4;
    // The list scrolls (#20); its right edge leaves a gutter for the scrollbar.
    this.list = new ScrollList(this, { x: x + PAD, y: top, w: w - PAD * 2 + 4, h: y + h - PAD - COUNT_H - top });
    this.countText = this.add.text(x + w / 2, y + h - PAD - COUNT_H / 2 + 2, '', textStyle(12, Css.muted)).setOrigin(0.5);
    this.list.setOffset(0);
    this.refresh();
    if (this.revealId) {
      const all = this.allEntries();
      const i = (this.ownedOnly ? all.filter((e) => e.owned) : all).findIndex((e) => e.id === this.revealId);
      if (i >= 0) this.list.reveal(Math.floor(i / L.cols) * (L.rowH + ROW_GAP), L.rowH);
    }
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o);
    return o;
  }

  // -------------------------------------------------------------------------
  // What the player has
  // -------------------------------------------------------------------------

  private ownedShipIds(): string[] {
    return loadSave().nations[this.nation]?.ships ?? [];
  }

  private ownedCaptainIds(): string[] {
    return loadSave().nations[this.nation]?.captains ?? [];
  }

  /** Aircraft count as known once the nation has a ship that flies them (carriers; battleships and cruisers for floatplanes). */
  private aircraftKnown(type: AircraftType): boolean {
    const owned = DataLoader.getRegistry(this).byNation(this.nation).filter((s) => this.ownedShipIds().includes(s.id));
    if (type === AircraftType.Recon) return owned.some((s) => s.shipClass === ShipClass.Battleship || s.shipClass === ShipClass.Cruiser);
    return owned.some((s) => s.shipClass === ShipClass.Carrier);
  }

  private allEntries(): IEntry[] {
    switch (this.tab) {
      case 'ships': {
        const owned = this.ownedShipIds();
        return filterEntries(DataLoader.getRegistry(this).byNation(this.nation), this.shipClass).map((s) => ({
          id: s.id, name: s.name.replace(/\s*\(.*\)\s*$/, ''), sub: `${s.fictional ? '架空  ' : ''}${kindLabel(s)}`, icon: s.spriteKey, owned: owned.includes(s.id),
        }));
      }
      case 'captains': {
        const owned = this.ownedCaptainIds();
        const xp = loadSave().nations[this.nation]?.captainXp ?? {};
        return nationCaptains(this.nation).map((c) => ({
          id: c.id, name: c.name, sub: owned.includes(c.id) ? `Lv${withProgress(c, xp[c.id] ?? 0).level}  ${SKILL_LABEL[c.skill]}` : SKILL_LABEL[c.skill], icon: '', owned: owned.includes(c.id),
        }));
      }
      case 'aircraft':
        return AIRCRAFT.filter((a) => a.nation === this.nation).map((a) => ({
          id: a.id, name: a.name, sub: AIRCRAFT_TYPE_JA[a.type], icon: AIRCRAFT_TEXTURE[a.type], owned: this.aircraftKnown(a.type),
        }));
      case 'ground':
        return GROUND.map((g) => ({ id: g.id, name: g.name, sub: g.id === 'convoy_ship' ? '支援' : '地上', icon: g.spriteKey, owned: true }));
    }
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const all = this.allEntries();
    const entries = this.ownedOnly ? all.filter((e) => e.owned) : all;
    if (!entries.some((e) => e.id === this.selectedId)) this.selectedId = entries[0]?.id ?? '';
    this.buildFilters();
    this.buildList(entries);
    const owned = all.filter((e) => e.owned).length;
    this.countText.setText(this.tab === 'ground' ? `${all.length} 種` : collectionLabel(`${NATION_INFO[this.nation].jaShort}の${TAB_LABEL[this.tab]}`, owned, all.length));
    const entry = entries.find((e) => e.id === this.selectedId);
    if (!entry) {
      const d = L.detail;
      this.track(this.add.text(d.x + d.w / 2, d.y + d.h / 2, this.ownedOnly ? 'まだ入手していません\n(右上の「全て」で未入手も表示)' : '項目がありません', textStyle(15, Css.dim, { align: 'center' })).setOrigin(0.5));
      return;
    }
    if (this.tab === 'ships') this.buildShipDetail(DataLoader.getRegistry(this).byId(entry.id)!, entry.owned);
    else if (this.tab === 'captains') this.buildCaptainDetail(nationCaptains(this.nation).find((c) => c.id === entry.id)!, entry.owned);
    else if (this.tab === 'aircraft') this.buildAircraftDetail(AIRCRAFT.find((a) => a.id === entry.id)!, entry.owned);
    else this.buildGroundDetail(GROUND.find((g) => g.id === entry.id)!);
  }

  private buildFilters(): void {
    const { x, y, w } = L.list;
    const inner = w - PAD * 2;
    const tab = (row: number, labels: string[], active: number, onPick: (i: number) => void, fontSize: number): void => {
      const bw = (inner - 6 * (labels.length - 1)) / labels.length;
      labels.forEach((label, i) => {
        if (!label) return;
        this.track(
          new UIButton(this, x + PAD + i * (bw + 6) + bw / 2, y + PAD + row * (L.tabH + TAB_GAP) + L.tabH / 2, label, () => onPick(i), {
            variant: i === active ? 'primary' : 'secondary', width: bw, height: L.tabH, fontSize,
          }),
        );
      });
    };
    // Row 0: what to look at, and owned-only / everything (#44).
    const kinds = [...TABS.map((t) => TAB_LABEL[t]), this.ownedOnly ? '所持のみ' : '全て'];
    tab(0, kinds, TABS.indexOf(this.tab), (i) => {
      if (i < TABS.length) this.tab = TABS[i];
      else {
        this.ownedOnly = !this.ownedOnly;
        audio.update({ encyclopediaOwnedOnly: this.ownedOnly });
      }
      this.list.setOffset(0);
      this.refresh();
    }, IS_PORTRAIT ? 13 : 11);
    const nationLabels = PLAYABLE_NATIONS.map((n) => NATION_INFO[n].jaShort);
    for (let row = 0; row < NATION_ROWS; row++) {
      const start = row * NATION_COLS;
      const labels = nationLabels.slice(start, start + NATION_COLS);
      // Wrapped rows keep the first row's tab width.
      while (NATION_ROWS > 1 && labels.length < NATION_COLS) labels.push('');
      tab(row + 1, labels, PLAYABLE_NATIONS.indexOf(this.nation) - start, (i) => {
        if (!PLAYABLE_NATIONS[start + i]) return;
        this.nation = PLAYABLE_NATIONS[start + i];
        this.list.setOffset(0);
        this.refresh();
      }, 14);
    }
    if (this.tab === 'ships') {
      tab(NATION_ROWS + 1, FILTERS.map((c) => (c === null ? '全' : CLASS_JA[c].slice(0, 2))), FILTERS.indexOf(this.shipClass), (i) => {
        this.shipClass = FILTERS[i];
        this.list.setOffset(0);
        this.refresh();
      }, 12);
    }
  }

  private buildList(entries: IEntry[]): void {
    this.list.clear();
    const cols = L.cols;
    const rows = Math.ceil(entries.length / cols);
    // Rows leave a gutter on the right for the scrollbar.
    const colW = (L.list.w - PAD * 2 - 12 - 8 * (cols - 1)) / cols;
    entries.forEach((e, i) => {
      // Left to right, then down, so both columns scroll through the list in reading order.
      const col = i % cols;
      const row = Math.floor(i / cols);
      const on = e.id === this.selectedId;
      const frame = drawPanel(this.add.graphics(), 0, 0, colW, L.rowH, {
        radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.45, rimAlpha: on ? 0.85 : 0.15, glow: on ? 1 : 0,
      });
      const parts: Phaser.GameObjects.GameObject[] = [frame];
      if (e.icon) {
        const icon = this.add.image(26, L.rowH / 2, e.icon).setAngle(90);
        icon.setScale(Math.min(1, 40 / Math.max(1, icon.height)));
        // Not owned yet: a dark silhouette (#44).
        if (!e.owned) icon.setTintFill(0x101a2c).setAlpha(0.8);
        parts.push(icon);
      } else {
        parts.push(this.add.text(26, L.rowH / 2, e.owned ? '★' : '？', textStyle(16, e.owned ? Css.gold : Css.dim)).setOrigin(0.5));
      }
      const name = this.add.text(52, L.rowH / 2, e.name, textStyle(IS_PORTRAIT ? 16 : 14, on ? Css.text : e.owned ? Css.muted : Css.dim)).setOrigin(0, 0.5);
      const sub = this.add.text(colW - 12, L.rowH / 2, e.sub, eyebrowStyle(10, Css.dim)).setOrigin(1, 0.5);
      const room = colW - 52 - sub.width - 12;
      if (name.width > room) name.setScale(room / name.width);
      parts.push(name, sub);
      const card = this.add.container(col * (colW + 8), row * (L.rowH + ROW_GAP), parts);
      this.list.addItem(card, colW, L.rowH, () => {
        this.selectedId = e.id;
            this.refresh();
      });
    });
    this.list.setContentHeight(Math.max(0, rows * (L.rowH + ROW_GAP) - ROW_GAP));
  }

  /** Eyebrow + title at the top of the detail panel; returns the y under it. */
  private detailHeader(eyebrow: string, title: string, eyebrowCss: string = Css.cyan): number {
    const d = L.detail;
    this.track(this.add.text(d.x + 26, d.y + 20, eyebrow, eyebrowStyle(10, eyebrowCss)));
    const t = this.track(this.add.text(d.x + 26, d.y + 42, title, displayStyle(IS_PORTRAIT ? 24 : 26)));
    return t.y + t.height + 16;
  }

  private section(y: number, label: string, body: string, css: string = Css.text): number {
    const d = L.detail;
    const w = d.w - 52;
    this.track(this.add.text(d.x + 26, y, label, eyebrowStyle(10, Css.gold)));
    const t = this.track(this.add.text(d.x + 26, y + 20, body, textStyle(IS_PORTRAIT ? 14 : 13, css, { wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 5 })));
    return t.y + t.height + 16;
  }

  // -------------------------------------------------------------------------
  // Ships
  // -------------------------------------------------------------------------

  private shipSource(ship: IShipData): string {
    const area = rewardAreaOf(ship);
    if (area) return `報酬限定艦 — 作戦「${AREA_NAMES[area] ?? area}」の初回攻略で入手`;
    if (ship.fictional) return '工廠で建造 (研究「架空艦計画」が必要)';
    return '工廠で建造、または作戦の初回攻略の報酬';
  }

  private buildShipDetail(ship: IShipData, owned: boolean): void {
    const d = L.detail;
    const x = d.x + 26;
    const w = d.w - 52;
    const kind = ship.fictional ? `${kindLabel(ship)}  ·  架空艦` : kindLabel(ship);
    let y = this.detailHeader(`${NATION_INFO[ship.nation].ja}  ·  ${kind}${owned ? '  ·  保有' : '  ·  未入手'}`, ship.name, owned ? Css.cyan : Css.dim);
    const icon = this.track(this.add.image(d.x + d.w - 30, d.y + 22, ship.spriteKey).setOrigin(1, 0));
    icon.setScale(Math.min(2, (IS_PORTRAIT ? 130 : 140) / Math.max(1, icon.height)));
    if (!owned) icon.setTintFill(0x101a2c).setAlpha(0.8);
    if (!owned) y = this.section(y, '入手方法', this.shipSource(ship), Css.gold);

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
    // 改装 › (#178): owned ships of the nation being played open on the refit screen.
    if (owned && this.nation === loadSave().current) {
      const bh = IS_PORTRAIT ? 48 : 36;
      this.track(new UIButton(this, x + 110, y + bh / 2, '改装・改造  ›', () => this.scene.start(SceneKeys.CUSTOMIZATION, {
        returnTo: SceneKeys.ENCYCLOPEDIA, scope: 'all', shipId: ship.id,
      }), { variant: 'primary', width: 220, height: bh, fontSize: 14 }));
      y += bh + 14;
    }
    const lines = summarizeWeapons(ship.weapons).map(({ id, count }) => {
      const wd = DataLoader.getWeaponById(this, id);
      return `${wd?.name ?? id}${count > 1 ? ` ×${count}` : ''}`;
    });
    if (ship.airWing) {
      const a = ship.airWing;
      lines.push(`艦載機  戦闘機 ${a.fighters} / 艦爆 ${a.diveBombers} / 艦攻 ${a.torpedoBombers}`);
    }
    y = this.section(y, '兵装', lines.join('\n') || '—');
    // The class's other ships (#85): same performance, other names.
    const sisters = sisterNames(DataLoader.getRegistry(this).byNation(ship.nation), ship);
    if (sisters.length > 0) y = this.section(y, `同型艦 (${sisters.length + 1} 隻)`, sisters.join('・'), Css.muted);
    this.section(y, '解説', ship.description ?? '—', Css.muted);
  }

  // -------------------------------------------------------------------------
  // Captains (#43 / #45)
  // -------------------------------------------------------------------------

  /** The 図鑑 page is the captain's biography (#130); skills are learned on the 艦長 screen. */
  private buildCaptainDetail(data: ICaptainData, owned: boolean): void {
    const d = L.detail;
    const np = loadSave().nations[this.nation];
    const captain = withProgress(data, np?.captainXp[data.id] ?? 0);
    const sc = SKILL_COLOR[data.skill];
    let y = this.detailHeader(`${NATION_INFO[data.nation].ja}  ·  艦長${owned ? `  ·  Lv${captain.level}` : ''}`, data.name, owned ? Css.cyan : Css.dim);
    y = this.section(y, '略歴', data.bio ?? '—');
    y = this.section(y, `固有スキル「${owned ? inherentLabel(captain) : SKILL_LABEL[data.skill]}」`, `${modifierLines(skillModifiers(data.skill, SKILL_LEVEL_CAP, { night: true })).join('・')} (Lv${SKILL_LEVEL_CAP})\nLv10 で II (1.5 倍)、Lv50 で III (2 倍) に強化`, sc.css);
    y = this.section(y, '搭乗適性', CLASS_ORDER.map((c) => `${CLASS_JA[c].slice(0, 2)} ${aptitudeFor(data, c)}`).join('   '));
    if (!owned) {
      this.section(y, '入手方法', '作戦の初回攻略・昇進・戦闘の勝利 (低確率) で、まだ仲間になっていない艦長が加わります。', Css.gold);
      return;
    }
    const earned = earnedTraits(np?.captainStats[data.id]);
    y = this.section(y, '特性', earned.length > 0 ? earned.map((t) => `★ ${t.name} — ${t.effect}`).join('\n') : 'まだありません', Css.muted);
    if (this.nation === loadSave().current) {
      const bh = IS_PORTRAIT ? 52 : 40;
      this.track(new UIButton(this, d.x + 26 + 130, Math.min(y + bh / 2, d.y + d.h - 20 - bh / 2), 'スキルと成長  ›', () => this.scene.start(SceneKeys.CAPTAIN, { id: data.id }), {
        variant: 'primary', width: 260, height: bh, fontSize: 14,
      }));
    }
  }

  // -------------------------------------------------------------------------
  // Aircraft and ground targets (#91)
  // -------------------------------------------------------------------------

  private buildAircraftDetail(a: IAircraftEntry, owned: boolean): void {
    const d = L.detail;
    let y = this.detailHeader(`${NATION_INFO[a.nation as Nation].ja}  ·  ${AIRCRAFT_TYPE_JA[a.type]}`, a.name, owned ? Css.cyan : Css.dim);
    const icon = this.track(this.add.image(d.x + d.w - 60, d.y + 50, AIRCRAFT_TEXTURE[a.type]).setScale(4));
    if (!owned) {
      icon.setTintFill(0x101a2c).setAlpha(0.8);
      y = this.section(y, '入手方法', a.type === AircraftType.Recon ? '戦艦か巡洋艦を保有すると使えるようになります。' : '空母を保有すると使えるようになります。', Css.gold);
    }
    y = this.section(y, '役割', AIRCRAFT_ROLE[a.type]);
    y = this.section(y, '搭載', a.type === AircraftType.Recon ? '戦艦・巡洋艦 (偵察機 1 機)' : '空母の航空隊');
    this.section(y, '解説', a.description, Css.muted);
  }

  private buildGroundDetail(g: IGroundEntry): void {
    let y = this.detailHeader(g.id === 'convoy_ship' ? '支援' : '地上目標', g.name);
    const d = L.detail;
    this.track(this.add.image(d.x + d.w - 60, d.y + 60, g.spriteKey).setScale(2));
    y = this.section(y, '性能', `耐久 ${g.hp}  装甲 ${g.armor}`);
    this.section(y, '解説', g.description, Css.muted);
  }
}
