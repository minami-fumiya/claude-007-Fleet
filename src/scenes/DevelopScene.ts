import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { canDevelop, develop, developable, developCost, developRandom, heldCount, randomDevelopCost, stockOf } from '@/systems/EquipmentSystem';
import { aircraftDevState, AIRCRAFT, carrierModel, chooseModel, developAircraft, developCostOf, IAircraftData, isDeveloped, modelsFor, perfOf } from '@/systems/AircraftSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { ownedShips } from '@/systems/ShipyardSystem';
import { TECH_TREE } from '@/systems/ResearchSystem';
import { AircraftType, CARRIER_AIRCRAFT, CarrierAircraft } from '@/types/Aircraft';
import { IUpgradeData } from '@/types/Modifiers';
import { IShipData } from '@/types/Ship';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { ScrollList } from '@/ui/components/ScrollList';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { formatNo } from '@/systems/Numbering';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, tabs: { y: 300, h: 52 }, status: 336, action: { y: 404, h: 60 }, list: { x: 16, y: 446 }, rowH: 128, gap: 10 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, tabs: { y: 164, h: 36 }, status: 188, action: { y: 230, h: 40 }, list: { x: 24, y: 258 }, rowH: 90, gap: 8 };

const KIND_JA: Record<CarrierAircraft, string> = {
  [AircraftType.Fighter]: '艦上戦闘機', [AircraftType.DiveBomber]: '艦上爆撃機', [AircraftType.TorpedoBomber]: '艦上攻撃機',
};

type Mode = 'equipment' | 'aircraft';

/**
 * 工廠 › 開発 (#55 #87). 装備: equipment is made with resources — a chosen one at its price, or 「おまかせ」 (a random
 * one the research has opened) for less; it goes into the stock and is fitted on the 改装 screen. 航空機: carrier
 * models are developed once, then each carrier picks the model it flies for each kind; its pilots' skill shows here.
 */
export class DevelopScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private list?: ScrollList;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusBad = false;
  private mode: Mode = 'equipment';
  /** The carrier whose air group is shown */
  private carrier = 0;

  constructor() {
    super({ key: SceneKeys.DEVELOP });
  }

  init(data?: { mode?: Mode }): void {
    this.mode = data?.mode ?? 'equipment';
    this.carrier = 0;
  }

  create(): void {
    showScreenHelp(this);
    awardPendingMedals();
    this.layer = [];
    this.list = undefined;
    this.status = '';
    this.statusBad = false;
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    addArsenalTabs(this, 'develop');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 開発', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    this.list = new ScrollList(this, { x: L.list.x, y: L.list.y, w: CANVAS_W - L.list.x * 2, h: CANVAS_H - 16 - L.list.y });
    this.draw();
  }

  update(): void {
    const p = loadProgress();
    this.bar.refresh(p.resources, holdCap(p.facilities));
  }

  private catalog(): IUpgradeData[] {
    return DataLoader.getUpgrades(this);
  }

  private carriers(): IShipData[] {
    const p = loadProgress();
    return ownedShips(p, DataLoader.getRegistry(this).byNation(p.nation)).filter((s) => !!s.airWing);
  }

  private say(text: string, bad = false): void {
    this.status = text;
    this.statusBad = bad;
    this.draw();
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.layer.push(o);
      return o;
    };
    const p = loadProgress();
    this.bar.refresh(p.resources, holdCap(p.facilities));
    const w = CANVAS_W - L.list.x * 2;
    const tw = (w - 8) / 2;
    (['equipment', 'aircraft'] as Mode[]).forEach((m, i) => {
      add(new UIButton(this, L.list.x + i * (tw + 8) + tw / 2, L.tabs.y, m === 'equipment' ? '装備' : '航空機', () => {
        this.mode = m;
        this.status = '';
        this.draw();
      }, { variant: this.mode === m ? 'primary' : 'secondary', width: tw, height: L.tabs.h, fontSize: 14 }));
    });
    if (this.mode === 'equipment') this.drawEquipment(add);
    else this.drawAircraft(add);
  }

  private statusLine(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, fallback: string): void {
    const y = L.status + (IS_PORTRAIT ? 6 : 4);
    const t = add(this.add.text(L.list.x, y, this.status || fallback, textStyle(13, this.status ? (this.statusBad ? Css.danger : Css.success) : Css.muted, { fontStyle: this.status ? 'bold' : 'normal' })));
    const room = CANVAS_W - L.list.x * 2;
    if (t.width > room) t.setScale(room / t.width);
  }

  private drawEquipment(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const p = loadProgress();
    const pool = developable(this.catalog(), p.research, p.nation);
    this.statusLine(add, pool.length === 0 ? '研究で装備の開発が開きます (工廠 › 研究)' : `開発できる装備 ${pool.length} 種  ·  作った装備は改装の画面で艦に付けます`);
    const randomCost = randomDevelopCost(pool);
    const ready = pool.length > 0 && canAfford(p.resources, randomCost);
    add(new UIButton(this, CANVAS_W / 2, L.action.y, pool.length > 0 ? `おまかせ開発  ${formatResources(randomCost)}` : 'おまかせ開発', () => this.developRandom(), {
      variant: ready ? 'gold' : 'secondary', width: CANVAS_W - L.list.x * 2, height: L.action.h, fontSize: 14,
    })).setEnabled(ready);

    const list = this.list!;
    const keep = list.offset;
    list.clear();
    const w = CANVAS_W - L.list.x * 2 - 12;
    pool.forEach((u, i) => {
      const cost = developCost(u);
      const can = canDevelop(p, this.catalog(), u.id, p.nation);
      const frame = drawPanel(this.add.graphics(), 0, 0, w, L.rowH, { radius: 14, fill: Colors.panel, fillAlpha: can ? 0.7 : 0.35, rimAlpha: can ? 0.5 : 0.15 });
      const name = this.add.text(16, 10, u.name, textStyle(15, can ? Css.text : Css.dim, { fontStyle: 'bold' }));
      const no = this.add.text(w - 16, 12, `${formatNo(u.no)}  所持 ${stockOf(p, u.id)} / 計 ${heldCount(p, u.id)}`, eyebrowStyle(10, Css.muted)).setOrigin(1, 0);
      const desc = this.add.text(16, IS_PORTRAIT ? 40 : 34, u.description, textStyle(12, Css.muted, { wordWrap: { width: w - 32, useAdvancedWrap: true } }));
      const price = this.add.text(16, L.rowH - (IS_PORTRAIT ? 30 : 24), `開発 ${formatResources(cost)}  ·  タップで開発`, textStyle(12, can ? Css.cyan : Css.danger, { fontStyle: 'bold' }));
      list.addItem(this.add.container(0, i * (L.rowH + L.gap), [frame, name, no, desc, price]), w, L.rowH, () => this.develop(u));
    });
    list.setContentHeight(Math.max(0, pool.length * (L.rowH + L.gap) - L.gap));
    list.setOffset(keep);
  }

  /** 航空機 (#87): the selected carrier's models and pilots, then every model of the navy to develop. */
  private drawAircraft(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const p = loadProgress();
    const carriers = this.carriers();
    this.carrier = Math.min(this.carrier, Math.max(0, carriers.length - 1));
    const ship = carriers[this.carrier];
    const pilot = ship ? p.pilots[ship.id] : undefined;
    this.statusLine(add, ship
      ? `搭乗員  練度 ${Math.round(pilot?.skill ?? 0)}  ·  撃墜 ${pilot?.kills ?? 0}${pilot?.ace ? `  ·  エース ${pilot.ace}` : ''}  ·  機種をタップで切り替え`
      : '空母を保有すると、艦ごとに積む機種を選べます');
    // The carrier picker: ‹ name ›
    const sw = IS_PORTRAIT ? 72 : 56;
    const w = CANVAS_W - L.list.x * 2;
    const step = (d: number): void => {
      if (carriers.length === 0) return;
      this.carrier = (this.carrier + d + carriers.length) % carriers.length;
      this.status = '';
      this.draw();
    };
    add(new UIButton(this, L.list.x + sw / 2, L.action.y, '‹', () => step(-1), { variant: 'secondary', width: sw, height: L.action.h, fontSize: 18 })).setEnabled(carriers.length > 1);
    add(new UIButton(this, L.list.x + w - sw / 2, L.action.y, '›', () => step(1), { variant: 'secondary', width: sw, height: L.action.h, fontSize: 18 })).setEnabled(carriers.length > 1);
    const name = add(this.add.text(CANVAS_W / 2, L.action.y, ship ? `${ship.name.replace(/\s*\(.*\)\s*$/, '')}  ${this.carrier + 1} / ${carriers.length}` : '空母なし', textStyle(15, ship ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0.5));
    if (name.width > w - sw * 2 - 24) name.setScale((w - sw * 2 - 24) / name.width);

    const list = this.list!;
    const keep = list.offset;
    list.clear();
    const rw = w - 12;
    let y = 0;
    const kindH = IS_PORTRAIT ? 64 : 48;
    if (ship) {
      for (const kind of CARRIER_AIRCRAFT) {
        const model = carrierModel(p, ship.id, p.nation, kind);
        const developed = modelsFor(p.nation, kind).filter((m) => isDeveloped(p, m));
        const frame = drawPanel(this.add.graphics(), 0, 0, rw, kindH, { radius: 12, fill: Colors.panelHi, fillAlpha: 0.8, rimAlpha: 0.5 });
        const label = this.add.text(16, kindH / 2, KIND_JA[kind], eyebrowStyle(11, Css.gold)).setOrigin(0, 0.5);
        const value = this.add.text(rw - 16, kindH / 2, `${model?.name ?? '—'}${developed.length > 1 ? '  ›' : ''}`, textStyle(14, Css.text, { fontStyle: 'bold' })).setOrigin(1, 0.5);
        if (value.width > rw - 150) value.setScale((rw - 150) / value.width);
        list.addItem(this.add.container(0, y, [frame, label, value]), rw, kindH, () => this.cycle(ship, kind));
        y += kindH + L.gap;
      }
    }
    const models = AIRCRAFT.filter((a) => a.nation === p.nation && a.type !== AircraftType.Recon);
    for (const m of models) {
      const state = aircraftDevState(p, m);
      const lit = state === 'ready' || state === 'developed';
      const frame = drawPanel(this.add.graphics(), 0, 0, rw, L.rowH, { radius: 14, fill: Colors.panel, fillAlpha: lit ? 0.7 : 0.35, rimAlpha: state === 'developed' ? 0.7 : lit ? 0.5 : 0.15, rim: state === 'developed' ? Colors.gold : undefined });
      const title = this.add.text(16, 10, m.name, textStyle(15, lit ? Css.text : Css.dim, { fontStyle: 'bold' }));
      const kind = this.add.text(rw - 16, 12, `${formatNo(m.no)}  ${KIND_JA[m.type as CarrierAircraft]}${m.year ? `  ${m.year}` : ''}`, eyebrowStyle(10, Css.muted)).setOrigin(1, 0);
      const f = perfOf(m);
      const stats = this.add.text(16, IS_PORTRAIT ? 42 : 36, `攻撃 ×${f.attack.toFixed(2)}  空戦 ×${f.agility.toFixed(2)}  頑丈 ×${f.toughness.toFixed(2)}  速度 ×${f.speed.toFixed(2)}`, textStyle(12, Css.muted));
      const tech = m.requires ? TECH_TREE.find((n) => n.id === m.requires)?.name ?? m.requires : '';
      const line = state === 'developed' ? '開発済み' : state === 'research' ? `要研究: ${tech}` : `開発 ${formatResources(developCostOf(m))}  ·  タップで開発`;
      const foot = this.add.text(16, L.rowH - (IS_PORTRAIT ? 30 : 24), line, textStyle(12, state === 'developed' ? Css.gold : state === 'ready' ? Css.cyan : state === 'resources' ? Css.danger : Css.dim, { fontStyle: 'bold' }));
      list.addItem(this.add.container(0, y, [frame, title, kind, stats, foot]), rw, L.rowH, () => this.developModel(m));
      y += L.rowH + L.gap;
    }
    list.setContentHeight(Math.max(0, y - L.gap));
    list.setOffset(keep);
  }

  /** The carrier's next developed model of a kind. */
  private cycle(ship: IShipData, kind: CarrierAircraft): void {
    const p = loadProgress();
    const developed = modelsFor(p.nation, kind).filter((m) => isDeveloped(p, m));
    if (developed.length < 2) {
      this.say(`${KIND_JA[kind]}は 1 機種だけです (研究と開発で増えます)`);
      return;
    }
    const now = carrierModel(p, ship.id, p.nation, kind);
    const next = developed[(developed.findIndex((m) => m.id === now?.id) + 1) % developed.length];
    const chosen = chooseModel(p, ship.id, next.id);
    if (!chosen) return;
    saveProgress(chosen);
    this.say(`${ship.name.replace(/\s*\(.*\)\s*$/, '')}: ${KIND_JA[kind]}を ${next.name} に`);
  }

  private developModel(m: IAircraftData): void {
    const p = loadProgress();
    const state = aircraftDevState(p, m);
    if (state === 'developed') return;
    const next = developAircraft(p, m.id);
    if (!next) {
      this.say(`${m.name}: ${state === 'research' ? '研究が足りません' : '資源が足りません'}`, true);
      return;
    }
    saveProgress(withQuestEvents(next, [['aircraftDev', 1]], Date.now()));
    this.say(`${m.name} を開発しました (空母の機種に選べます)`);
  }

  private develop(u: IUpgradeData): void {
    const p = loadProgress();
    const next = develop(p, this.catalog(), u.id, p.nation);
    if (!next) {
      this.say(`${u.name}: 資源が足りません`, true);
      return;
    }
    saveProgress(withQuestEvents(next, [['develop', 1]], Date.now()));
    this.say(`${u.name} を開発しました (所持 ${stockOf(next, u.id)})`);
  }

  private developRandom(): void {
    const p = loadProgress();
    const out = developRandom(p, this.catalog(), p.nation, Math.random());
    if (!out) return;
    saveProgress(withQuestEvents(out.holder, [['develop', 1]], Date.now()));
    this.say(`おまかせ開発: ${this.catalog().find((u) => u.id === out.id)?.name ?? out.id} ができました`);
  }
}
