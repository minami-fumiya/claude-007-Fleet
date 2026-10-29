import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { FOCUS_RESET_COST, focusStatus, FocusStatus, focusTree, IFocusNode, resetFocus, startFocus } from '@/systems/NationFocusSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { RANKS, rankOf } from '@/systems/RankSystem';
import { audio } from '@/systems/AudioSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { ScrollList } from '@/ui/components/ScrollList';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { clock } from '@/utils/TimeFormat';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, status: 300, list: { x: 16, y: 352 }, rowH: 150, gap: 10 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, status: 168, list: { x: 24, y: 204 }, rowH: 96, gap: 8 };

const STATE_LINE: Record<FocusStatus, string> = {
  done: '完了', active: '進行中', ready: 'タップで開始', busy: '他の方針が進行中', rank: '', locked: '前の方針が必要', closed: '', resources: '資源不足',
};

/**
 * 工廠 › 方針 (#49 #309): the navy's national focuses, one at a time. A pair (大艦巨砲 / 航空主兵 …) takes one side
 * only; a side taken can be undone (見直し) for resources, with what came after it. Later focuses open the planned
 * ships (架空艦) to the shipyard; every focus gives a lasting bonus to a class of ships.
 */
export class FocusScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private list?: ScrollList;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusBad = false;
  /** The focus a 見直し was asked for: a second tap confirms */
  private confirm: string | null = null;
  private clockText?: Phaser.GameObjects.Text;
  private shownKey = '';

  constructor() {
    super({ key: SceneKeys.FOCUS });
  }

  create(): void {
    showScreenHelp(this);
    awardPendingMedals();
    this.layer = [];
    this.list = undefined;
    this.status = '';
    this.confirm = null;
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    addArsenalTabs(this, 'focus');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 国家方針', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    this.list = new ScrollList(this, { x: L.list.x, y: L.list.y, w: CANVAS_W - L.list.x * 2, h: CANVAS_H - 16 - L.list.y });
    this.draw();
  }

  update(): void {
    const p = loadProgress();
    const key = `${p.focus.current?.id ?? ''}/${p.focus.done.length}`;
    // A focus that ran out is settled by the load: redraw once it has.
    if (key !== this.shownKey) {
      this.draw();
      return;
    }
    if (p.focus.current && this.clockText?.active) this.clockText.setText(this.clockLine(p.focus.current.id, p.focus.current.endsAt - Date.now()));
  }

  private clockLine(id: string, left: number): string {
    const p = loadProgress();
    return `進行中: ${focusTree(p.nation).find((n) => n.id === id)?.name ?? id}  残り ${clock(Math.max(0, left))}`;
  }

  private say(text: string, bad = false): void {
    this.status = text;
    this.statusBad = bad;
    this.draw();
  }

  /** The planned ships a focus opens, by name. */
  private shipNames(node: IFocusNode): string {
    const reg = DataLoader.getRegistry(this);
    return (node.unlocks ?? []).map((id) => reg.byId(id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? id).join('・');
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.layer.push(o);
      return o;
    };
    const p = loadProgress();
    this.shownKey = `${p.focus.current?.id ?? ''}/${p.focus.done.length}`;
    this.bar.refresh(p.resources, holdCap(p.facilities));
    const tree = focusTree(p.nation);
    const rank = rankOf(p).index;
    const room = CANVAS_W - L.list.x * 2;
    const line = this.status
      || (p.focus.current ? this.clockLine(p.focus.current.id, p.focus.current.endsAt - Date.now()) : `完了 ${p.focus.done.length} / ${tree.length}  ·  方針は 1 つずつ進みます。二者択一は片方だけ`);
    const t = add(this.add.text(L.list.x, L.status, line, textStyle(13, this.status ? (this.statusBad ? Css.danger : Css.success) : p.focus.current ? Css.gold : Css.muted, { fontStyle: 'bold' })));
    if (t.width > room) t.setScale(room / t.width);
    this.clockText = !this.status && p.focus.current ? t : undefined;

    const list = this.list!;
    const keep = list.offset;
    list.clear();
    const w = room - 12;
    tree.forEach((node, i) => {
      const state = focusStatus(p.nation, p.focus, node.id, rank, p.resources);
      const lit = state === 'ready' || state === 'active' || state === 'done';
      const frame = drawPanel(this.add.graphics(), 0, 0, w, L.rowH, {
        radius: 14, fill: Colors.panel, fillAlpha: lit ? 0.7 : 0.35, rimAlpha: state === 'done' ? 0.7 : lit ? 0.5 : 0.15, rim: state === 'done' ? Colors.gold : state === 'active' ? Colors.cyan : undefined,
      });
      const pair = node.exclusive ? `  ·  二者択一: ${node.exclusive.map((x) => tree.find((n) => n.id === x)?.name ?? x).join('・')}` : '';
      const name = this.add.text(16, 10, node.name, textStyle(15, lit ? Css.text : Css.dim, { fontStyle: 'bold' }));
      const meta = this.add.text(w - 16, 12, `${RANKS[node.rank]?.name ?? ''}  ·  ${node.minutes} 分`, eyebrowStyle(10, Css.muted)).setOrigin(1, 0);
      const ships = node.unlocks ? `  ·  建造可: ${this.shipNames(node)}` : '';
      const desc = this.add.text(16, IS_PORTRAIT ? 40 : 34, `${node.text}${ships}${pair}`, textStyle(12, Css.muted, { wordWrap: { width: w - 32, useAdvancedWrap: true } }));
      const foot = this.add.text(16, L.rowH - (IS_PORTRAIT ? 30 : 24), this.footLine(node, state, p.focus.done.includes(node.id)), textStyle(12, this.footColor(state), { fontStyle: 'bold' }));
      if (foot.width > w - 32) foot.setScale((w - 32) / foot.width);
      if (desc.height > L.rowH - (IS_PORTRAIT ? 76 : 60)) desc.setScale((L.rowH - (IS_PORTRAIT ? 76 : 60)) / desc.height);
      list.addItem(this.add.container(0, i * (L.rowH + L.gap), [frame, name, meta, desc, foot]), w, L.rowH, () => this.tap(node));
    });
    list.setContentHeight(Math.max(0, tree.length * (L.rowH + L.gap) - L.gap));
    list.setOffset(keep);
  }

  private footLine(node: IFocusNode, state: FocusStatus, done: boolean): string {
    if (done && node.exclusive) return this.confirm === node.id ? `もう一度タップで見直し (${formatResources(FOCUS_RESET_COST)})` : '完了  ·  タップで見直し';
    if (state === 'rank') return `要階級: ${RANKS[node.rank]?.name ?? ''}`;
    if (state === 'closed') return '選ばなかった道 (見直しで選び直せます)';
    if (state === 'ready' || state === 'resources' || state === 'busy') return `${formatResources(node.cost)}  ·  ${STATE_LINE[state]}`;
    return STATE_LINE[state];
  }

  private footColor(state: FocusStatus): string {
    switch (state) {
      case 'done': return Css.gold;
      case 'active': return Css.cyan;
      case 'ready': return Css.cyan;
      case 'resources': return Css.danger;
      default: return Css.dim;
    }
  }

  private tap(node: IFocusNode): void {
    const p = loadProgress();
    const now = Date.now();
    if (p.focus.done.includes(node.id)) {
      if (!node.exclusive) return;
      if (this.confirm !== node.id) {
        this.confirm = node.id;
        this.draw();
        return;
      }
      this.confirm = null;
      if (!canAfford(p.resources, FOCUS_RESET_COST)) {
        this.say('見直しの資源が足りません', true);
        return;
      }
      const r = resetFocus(p.nation, p.focus, node.id, p.resources);
      if (!r) return;
      saveProgress(withQuestEvents({ ...p, focus: r.state, resources: r.resources }, [['focusReset', 1]], now), 'research');
      this.say(`${node.name} を見直しました。もう一方の道を選べます`);
      return;
    }
    this.confirm = null;
    const state = focusStatus(p.nation, p.focus, node.id, rankOf(p).index, p.resources);
    if (state !== 'ready') {
      if (state === 'resources') this.say(`${node.name}: 資源が足りません`, true);
      else if (state === 'busy') this.say('方針は 1 つずつ進みます', true);
      else this.draw();
      return;
    }
    const r = startFocus(p.nation, p.focus, node.id, rankOf(p).index, p.resources, now);
    if (!r) return;
    saveProgress({ ...p, focus: r.state, resources: r.resources }, 'research');
    audio.play('notify');
    this.say(`${node.name} を始めました (${node.minutes} 分)`);
  }

  /** E2E: start the first focus that can start. */
  startFirst(): boolean {
    const p = loadProgress();
    const node = focusTree(p.nation).find((n) => focusStatus(p.nation, p.focus, n.id, rankOf(p).index, p.resources) === 'ready');
    if (!node) return false;
    this.tap(node);
    return true;
  }
}
