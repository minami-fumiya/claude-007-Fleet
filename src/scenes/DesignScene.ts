import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import {
  designLimit, designProblem, designShip, designTier, designWeapons, designWeight, fittingsFor, hull, HULLS, hullCapacity, moduleWeight, NAME_MAX, newDesignId, ROLE_JA, weaponRole,
} from '@/systems/DesignSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { buildCostAt, shipGrade } from '@/systems/ShipyardSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { IShipData } from '@/types/Ship';
import { IShipDesign } from '@/types/Design';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { ScrollList } from '@/ui/components/ScrollList';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, pick: 300, hull: 368, act: 436, status: 480, preview: 520, list: { x: 16, y: 604 }, rowH: 64, h: 56, gap: 8 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, pick: 170, hull: 170, act: 220, status: 252, preview: 274, list: { x: 24, y: 330 }, rowH: 46, h: 40, gap: 6 };

interface IDraft {
  /** The saved design being changed, or null for a new one */
  id: string | null;
  name: string;
  hull: string;
  modules: string[];
}

/**
 * 工廠 › 設計 (#51): the navy's own ships, drawn up from a hull and modules and named. A saved design is built in the
 * shipyard like any other ship (its own category, 設計艦). How far the navy can design — hulls, weight, how many
 * designs — grows with its national focuses and the 架空艦計画 research.
 */
export class DesignScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private list?: ScrollList;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusBad = false;
  private draft: IDraft = { id: null, name: '', hull: HULLS[0].id, modules: [] };

  constructor() {
    super({ key: SceneKeys.DESIGN });
  }

  create(): void {
    showScreenHelp(this);
    awardPendingMedals();
    this.layer = [];
    this.list = undefined;
    this.status = '';
    this.draft = { id: null, name: '', hull: HULLS[0].id, modules: [] };
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    addArsenalTabs(this, 'design');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 設計', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    this.list = new ScrollList(this, { x: L.list.x, y: L.list.y, w: CANVAS_W - L.list.x * 2, h: CANVAS_H - 16 - L.list.y });
    this.draw();
  }

  private tier(): number {
    const p = loadProgress();
    return designTier(p.focus.done.length, p.research);
  }

  private roster(): IShipData[] {
    return DataLoader.getRegistry(this).all();
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
    const tier = this.tier();
    const x0 = L.list.x;
    const w = CANVAS_W - x0 * 2;
    const half = IS_PORTRAIT ? w : (w - 12) / 2;
    const sw = IS_PORTRAIT ? 72 : 52;

    // ‹ design › picker: the saved designs and a new one.
    const designs = p.designs;
    const at = this.draft.id ? designs.findIndex((d) => d.id === this.draft.id) : designs.length;
    const pickTitle = this.draft.id ? `${this.draft.name}  ${at + 1} / ${designs.length}` : `新しい設計  (設計 ${designs.length} / ${designLimit(tier)})`;
    this.picker(add, x0, L.pick, half, sw, pickTitle, (d) => this.stepDesign(d), designs.length > 0);
    // ‹ hull › picker: the hulls the tier allows.
    const h = hull(this.draft.hull) ?? HULLS[0];
    const hx = IS_PORTRAIT ? x0 : x0 + half + 12;
    const hullTitle = `${h.name}${h.tier > tier ? ` (要設計段階 ${h.tier})` : ''}`;
    this.picker(add, hx, L.hull, half, sw, hullTitle, (d) => this.stepHull(d), true);

    // 艦名 · 保存 · 削除
    const bw = (w - 16) / 3;
    const bh = IS_PORTRAIT ? 52 : 36;
    add(new UIButton(this, x0 + bw / 2, L.act, this.draft.name ? `艦名: ${this.draft.name}` : '艦名を付ける', () => this.rename(), { variant: 'secondary', width: bw, height: bh, fontSize: 13 }));
    const problem = designProblem(this.draft, this.roster(), p.nation, tier);
    const full = !this.draft.id && designs.length >= designLimit(tier);
    add(new UIButton(this, x0 + bw * 1.5 + 8, L.act, this.draft.id ? '設計を更新' : '設計を保存', () => this.save(), {
      variant: problem || full ? 'secondary' : 'gold', width: bw, height: bh, fontSize: 13,
    })).setEnabled(!problem && !full);
    add(new UIButton(this, x0 + bw * 2.5 + 16, L.act, '設計を破棄', () => this.remove(), { variant: 'secondary', width: bw, height: bh, fontSize: 13 })).setEnabled(this.draft.id !== null && this.removable(this.draft.id));

    // Status and the preview of the ship it makes.
    const cap = hullCapacity(h, tier);
    const weight = designWeight(this.draft.modules);
    const line = this.status || (full ? `設計は ${designLimit(tier)} つまで (方針と研究で増えます)` : problem ?? `設計段階 ${tier}  ·  重量 ${weight} / ${cap}  ·  保存すると建造の画面に並びます`);
    const bad = this.status ? this.statusBad : !!problem || full;
    const st = add(this.add.text(x0, L.status, line, textStyle(13, bad ? Css.danger : this.status ? Css.success : Css.muted, { fontStyle: 'bold' })));
    if (st.width > w) st.setScale(w / st.width);
    const ship = designShip({ ...this.draft, id: this.draft.id ?? 'draft', shipClass: h.shipClass, name: this.draft.name || h.name }, p.nation, this.roster());
    const cost = buildCostAt(p, ship);
    const air = ship.airWing ? `  ·  搭載 ${ship.airWing.fighters + ship.airWing.diveBombers + ship.airWing.torpedoBombers} 機` : '';
    const pv = add(this.add.text(x0, L.preview, `耐久 ${ship.hp}  装甲 ${ship.armor}  速力 ${ship.speed}  格 ${shipGrade(ship)}${air}\n建造 ${formatResources(cost)}`, textStyle(13, Css.text, { lineSpacing: 4 })));
    if (pv.width > w) pv.setScale(w / pv.width);
    add(drawPanel(this.add.graphics(), x0 - 4, L.preview - 6, w + 8, pv.height + 12, { radius: 10, fillAlpha: 0.35, rimAlpha: 0.2 })).setDepth(pv.depth - 1);

    // The modules: weapons the navy's ships carry, then fittings; tap to fit or take off.
    const list = this.list!;
    const keep = list.offset;
    list.clear();
    const rw = w - 12;
    const options = [
      ...designWeapons(this.roster(), p.nation, h).map((wpn) => ({ id: wpn.id, name: wpn.name, sub: `${ROLE_JA[weaponRole(wpn)!]}  ·  火力 ${wpn.firePower}  射程 ${wpn.range}` })),
      ...fittingsFor(h).map((f) => ({ id: f.id, name: f.name, sub: f.text })),
    ];
    options.forEach((o, i) => {
      const on = this.draft.modules.includes(o.id);
      const frame = drawPanel(this.add.graphics(), 0, 0, rw, L.rowH, { radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.85 : 0.5, rim: on ? Colors.gold : undefined, rimAlpha: on ? 0.7 : 0.2 });
      const name = this.add.text(16, L.rowH / 2, `${on ? '● ' : '○ '}${o.name}`, textStyle(14, on ? Css.gold : Css.text, { fontStyle: 'bold' })).setOrigin(0, 0.5);
      const sub = this.add.text(rw - 16, L.rowH / 2, `${o.sub}  ·  重量 ${moduleWeight(o.id)}`, eyebrowStyle(10, Css.muted)).setOrigin(1, 0.5);
      const room = rw - 40 - name.width;
      if (sub.width > room) sub.setScale(Math.max(0.5, room / sub.width));
      list.addItem(this.add.container(0, i * (L.rowH + L.gap), [frame, name, sub]), rw, L.rowH, () => this.toggle(o.id));
    });
    list.setContentHeight(Math.max(0, options.length * (L.rowH + L.gap) - L.gap));
    list.setOffset(keep);
  }

  private picker(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, x: number, y: number, w: number, sw: number, title: string, step: (d: number) => void, enabled: boolean): void {
    add(new UIButton(this, x + sw / 2, y, '‹', () => step(-1), { variant: 'secondary', width: sw, height: L.h, fontSize: 18 })).setEnabled(enabled);
    add(new UIButton(this, x + w - sw / 2, y, '›', () => step(1), { variant: 'secondary', width: sw, height: L.h, fontSize: 18 })).setEnabled(enabled);
    const t = add(this.add.text(x + w / 2, y, title, textStyle(14, Css.text, { fontStyle: 'bold' })).setOrigin(0.5));
    if (t.width > w - sw * 2 - 16) t.setScale((w - sw * 2 - 16) / t.width);
  }

  /** Steps through the saved designs, with a new one after the last. */
  private stepDesign(d: number): void {
    const designs = loadProgress().designs;
    const n = designs.length + 1;
    const at = this.draft.id ? designs.findIndex((x) => x.id === this.draft.id) : designs.length;
    const next = (at + d + n) % n;
    const pick = designs[next];
    this.draft = pick ? { id: pick.id, name: pick.name, hull: pick.hull, modules: [...pick.modules] } : { id: null, name: '', hull: this.draft.hull, modules: [] };
    this.status = '';
    this.draw();
  }

  private stepHull(d: number): void {
    const i = HULLS.findIndex((h) => h.id === this.draft.hull);
    const next = HULLS[(i + d + HULLS.length) % HULLS.length];
    // Weapons that the new hull can't carry come off.
    const p = loadProgress();
    const fits = new Set([...designWeapons(this.roster(), p.nation, next).map((w) => w.id), ...fittingsFor(next).map((f) => f.id)]);
    this.draft = { ...this.draft, hull: next.id, modules: this.draft.modules.filter((m) => fits.has(m)) };
    this.status = '';
    this.draw();
  }

  private toggle(id: string): void {
    const on = this.draft.modules.includes(id);
    this.draft = { ...this.draft, modules: on ? this.draft.modules.filter((m) => m !== id) : [...this.draft.modules, id] };
    this.status = '';
    this.draw();
  }

  private rename(): void {
    const name = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(`艦名 (${NAME_MAX} 文字まで)`, this.draft.name) : null;
    if (name === null) return;
    this.setName(name);
  }

  /** E2E / prompt: sets the draft's name. */
  setName(name: string): void {
    this.draft = { ...this.draft, name: name.trim().slice(0, NAME_MAX) };
    this.status = '';
    this.draw();
  }

  /** A design can go while no ship of it is owned or on the slip. */
  private removable(id: string): boolean {
    const p = loadProgress();
    return !p.ships.includes(id) && !p.builds.some((b) => b.shipId === id);
  }

  save(): void {
    const p = loadProgress();
    const tier = this.tier();
    const problem = designProblem(this.draft, this.roster(), p.nation, tier);
    if (problem) {
      this.say(problem, true);
      return;
    }
    const h = hull(this.draft.hull)!;
    if (this.draft.id) {
      // A design already built keeps its ships as they are: its changes reach them too, as a refit would.
      const designs = p.designs.map((d) => (d.id === this.draft.id ? { ...d, name: this.draft.name, hull: h.id, shipClass: h.shipClass, modules: [...this.draft.modules] } : d));
      saveProgress({ ...p, designs });
      this.say(`${this.draft.name} の設計を更新しました`);
      return;
    }
    if (p.designs.length >= designLimit(tier)) {
      this.say(`設計は ${designLimit(tier)} つまでです`, true);
      return;
    }
    const d: IShipDesign = { id: newDesignId(p.nation, p.designs), name: this.draft.name, shipClass: h.shipClass, hull: h.id, modules: [...this.draft.modules] };
    saveProgress(withQuestEvents({ ...p, designs: [...p.designs, d] }, [['designMade', 1]], Date.now()));
    this.draft = { ...this.draft, id: d.id };
    this.say(`${d.name} を設計しました (建造の画面に並びます)`);
  }

  private remove(): void {
    const id = this.draft.id;
    if (!id || !this.removable(id)) return;
    const p = loadProgress();
    saveProgress({ ...p, designs: p.designs.filter((d) => d.id !== id) });
    const name = this.draft.name;
    this.draft = { id: null, name: '', hull: this.draft.hull, modules: [] };
    this.say(`${name} の設計を破棄しました`);
  }

  /** E2E: draws up a destroyer with what the navy has, named. */
  sampleDesign(): void {
    const p = loadProgress();
    const h = HULLS[0];
    const weapons = designWeapons(this.roster(), p.nation, h);
    const roles = new Set<string>();
    const modules: string[] = [];
    let weight = 0;
    for (const w of [...weapons].reverse()) {
      const r = weaponRole(w)!;
      if (roles.has(r) || weight + moduleWeight(w.id) > hullCapacity(h, this.tier())) continue;
      roles.add(r);
      modules.push(w.id);
      weight += moduleWeight(w.id);
    }
    this.draft = { id: null, name: '試作駆逐艦', hull: h.id, modules: modules.slice(0, h.slots) };
    this.draw();
  }
}
