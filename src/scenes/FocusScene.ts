import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { FOCUS_RESET_COST, focusLayout, focusStatus, FocusStatus, focusTree, IFocusNode, resetFocus, startFocus } from '@/systems/NationFocusSystem';
import { canAfford, formatResources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { withQuestEvents } from '@/systems/QuestSystem';
import { RANKS, rankOf } from '@/systems/RankSystem';
import { audio } from '@/systems/AudioSystem';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, fitText, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { addArsenalTabs } from '@/ui/components/ArsenalTabs';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { clock } from '@/utils/TimeFormat';

interface IRect { x: number; y: number; w: number; h: number }

/** Portrait: the tree grows downwards over the details; landscape: it grows to the right, the details beside it. */
const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, status: 296, tree: { x: 16, y: 330, w: CANVAS_W - 32, h: 590 } as IRect, detail: { x: 16, y: 934, w: CANVAS_W - 32, h: CANVAS_H - 934 - 16 } as IRect }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, status: 166, tree: { x: 24, y: 192, w: 840, h: CANVAS_H - 192 - 16 } as IRect, detail: { x: 880, y: 192, w: CANVAS_W - 880 - 24, h: CANVAS_H - 192 - 16 } as IRect };

/** The short state on a node of the tree. */
const STATE_SHORT: Record<FocusStatus, string> = {
  done: '完了', active: '進行中', ready: '開始できる', busy: '待ち', rank: '要階級', locked: '前提あり', closed: '選ばず', resources: '資源不足',
};

/**
 * 工廠 › 方針 (#49 #309 #382): the navy's national focuses as a tree, taken one at a time. A pair (大艦巨砲 / 航空主兵
 * …) takes one side only, marked または; a side taken can be undone (見直し) for resources, with what came after it.
 * Tap a focus for what it gives, the planned ships it opens and its cost, and start it from there.
 */
export class FocusScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusBad = false;
  /** The focus whose details show */
  private selected = '';
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
    this.status = '';
    this.confirm = null;
    const p = loadProgress();
    // Open on the focus under way, else the first one that can start, else the root.
    const tree = focusTree(p.nation);
    this.selected = p.focus.current?.id
      ?? tree.find((n) => focusStatus(p.nation, p.focus, n.id, rankOf(p).index, p.resources) === 'ready')?.id
      ?? tree[0]?.id ?? '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    addArsenalTabs(this, 'focus');
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '工廠 — 国家方針', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    addPanel(this, L.tree);
    addPanel(this, L.detail);
    this.draw();
  }

  update(): void {
    const p = loadProgress();
    // A focus that ran out is settled by the load: redraw once it has.
    if (`${p.focus.current?.id ?? ''}/${p.focus.done.length}` !== this.shownKey) {
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
    const room = CANVAS_W - L.tree.x * 2;
    const line = this.status
      || (p.focus.current ? this.clockLine(p.focus.current.id, p.focus.current.endsAt - Date.now()) : `完了 ${p.focus.done.length} / ${tree.length}  ·  方針は 1 つずつ進みます。「または」は片方だけ`);
    const t = add(this.add.text(L.tree.x, L.status, line, textStyle(13, this.status ? (this.statusBad ? Css.danger : Css.success) : p.focus.current ? Css.gold : Css.muted, { fontStyle: 'bold' })));
    fitText(t, room);
    this.clockText = !this.status && p.focus.current ? t : undefined;
    this.drawTree(add, tree, rank);
    const node = tree.find((n) => n.id === this.selected);
    if (node) this.drawDetail(add, node, rank);
  }

  /** Where a node of the tree sits, and how big. */
  private nodeRect(depth: number, lane: number, depths: number, lanes: number): IRect {
    const a = L.tree;
    const pad = 12;
    if (IS_PORTRAIT) {
      const cw = (a.w - pad * 2) / lanes;
      const ch = (a.h - pad * 2) / depths;
      const w = cw - 8;
      const h = Math.min(92, ch - 26);
      return { x: a.x + pad + lane * cw + 4, y: a.y + pad + depth * ch + (ch - h) / 2, w, h };
    }
    const cw = (a.w - pad * 2) / depths;
    const ch = (a.h - pad * 2) / lanes;
    const w = cw - 30;
    const h = Math.min(64, ch - 10);
    return { x: a.x + pad + depth * cw + 4, y: a.y + pad + lane * ch + (ch - h) / 2, w, h };
  }

  private drawTree(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, tree: IFocusNode[], rank: number): void {
    const p = loadProgress();
    const { places, depths, lanes } = focusLayout(p.nation);
    const rect = new Map(places.map((pl) => [pl.id, this.nodeRect(pl.depth, pl.lane, depths, lanes)]));
    const states = new Map(tree.map((n) => [n.id, focusStatus(p.nation, p.focus, n.id, rank, p.resources)]));
    // Lines from each focus to the ones it needs: lit once the earlier one is done.
    const g = add(this.add.graphics());
    for (const n of tree) {
      const to = rect.get(n.id)!;
      for (const r of [...(n.requires ?? []), ...(n.requiresAny ?? [])]) {
        const from = rect.get(r);
        if (!from) continue;
        const lit = p.focus.done.includes(r) && states.get(n.id) !== 'closed';
        g.lineStyle(lit ? 3 : 2, lit ? Colors.cyan : Colors.muted, lit ? 0.85 : 0.35);
        if (IS_PORTRAIT) {
          const x1 = from.x + from.w / 2;
          const y1 = from.y + from.h;
          const x2 = to.x + to.w / 2;
          const y2 = to.y;
          const my = (y1 + y2) / 2;
          g.lineBetween(x1, y1, x1, my);
          g.lineBetween(x1, my, x2, my);
          g.lineBetween(x2, my, x2, y2);
        } else {
          const x1 = from.x + from.w;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y + to.h / 2;
          const mx = (x1 + x2) / 2;
          g.lineBetween(x1, y1, mx, y1);
          g.lineBetween(mx, y1, mx, y2);
          g.lineBetween(mx, y2, x2, y2);
        }
      }
    }
    // または between the two sides of a pair, once each pair.
    const marked = new Set<string>();
    for (const n of tree) {
      for (const e of n.exclusive ?? []) {
        const key = [n.id, e].sort().join('|');
        if (marked.has(key)) continue;
        marked.add(key);
        const a = rect.get(n.id)!;
        const b = rect.get(e);
        if (!b) continue;
        const x = IS_PORTRAIT ? (Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x)) / 2 : a.x + a.w / 2;
        const y = IS_PORTRAIT ? a.y + a.h + 10 : (Math.min(a.y + a.h, b.y + b.h) + Math.max(a.y, b.y)) / 2;
        add(this.add.text(x, y, 'または', eyebrowStyle(9, Css.gold)).setOrigin(0.5));
      }
    }
    for (const n of tree) {
      const r = rect.get(n.id)!;
      const st = states.get(n.id)!;
      const on = n.id === this.selected;
      const lit = st === 'done' || st === 'active' || st === 'ready';
      const frame = add(drawPanel(this.add.graphics(), r.x, r.y, r.w, r.h, {
        radius: 10,
        fill: on ? Colors.panelHi : Colors.panel,
        fillAlpha: st === 'closed' ? 0.2 : lit ? 0.85 : 0.5,
        rim: st === 'done' ? Colors.gold : st === 'active' ? Colors.cyan : on ? Colors.cyan : undefined,
        rimAlpha: on ? 0.95 : st === 'done' || st === 'active' ? 0.75 : 0.2,
        glow: on ? 0.6 : 0,
      }));
      // One line, shrunk to fit: a wrap would split a word (マル五計 | 画, #382).
      const name = add(this.add.text(r.x, r.y, n.name, textStyle(IS_PORTRAIT ? 13 : 12, st === 'closed' ? Css.dim : Css.text, { fontStyle: 'bold' })));
      fitText(name, r.w - 10);
      name.setPosition(r.x + (r.w - name.displayWidth) / 2, r.y + (r.h - 14 - name.displayHeight) / 2);
      const stateText = add(this.add.text(r.x + r.w / 2, r.y + r.h - 6, st === 'active' && p.focus.current ? `残り ${clock(Math.max(0, p.focus.current.endsAt - Date.now()))}` : STATE_SHORT[st], eyebrowStyle(9, this.stateColor(st))).setOrigin(0.5, 1));
      fitText(stateText, r.w - 8);
      const hit = add(this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      hit.on('pointerup', () => this.select(n.id));
      void frame;
    }
  }

  private stateColor(state: FocusStatus): string {
    switch (state) {
      case 'done': return Css.gold;
      case 'active': return Css.cyan;
      case 'ready': return Css.cyan;
      case 'resources': return Css.danger;
      case 'rank': return Css.danger;
      default: return Css.dim;
    }
  }

  /** The chosen focus: what it gives, what it opens, what it costs, and its button. */
  private drawDetail(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, node: IFocusNode, rank: number): void {
    const p = loadProgress();
    const d = L.detail;
    const x = d.x + 20;
    const w = d.w - 40;
    const state = focusStatus(p.nation, p.focus, node.id, rank, p.resources);
    const done = p.focus.done.includes(node.id);
    const tree = focusTree(p.nation);
    add(this.add.text(x, d.y + 16, `${RANKS[node.rank]?.name ?? ''}  ·  ${node.minutes} 分`, eyebrowStyle(10, Css.muted)));
    const title = add(this.add.text(x, d.y + 36, node.name, textStyle(18, Css.text, { fontStyle: 'bold' })));
    fitText(title, w);
    const lines = [
      `効果: ${node.text}`,
      ...(node.unlocks ? [`建造できる艦: ${this.shipNames(node)}`] : []),
      ...(node.exclusive ? [`または: ${node.exclusive.map((e) => tree.find((n) => n.id === e)?.name ?? e).join('・')} (片方だけ)`] : []),
      ...(node.requiresAny ? [`前提: ${node.requiresAny.map((e) => tree.find((n) => n.id === e)?.name ?? e).join(' か ')}`] : []),
      `費用: ${formatResources(node.cost)}`,
    ];
    const body = add(this.add.text(x, d.y + 70, lines.join('\n'), textStyle(13, Css.muted, { lineSpacing: 6, wordWrap: { width: w, useAdvancedWrap: true } })));
    const btnH = IS_PORTRAIT ? 56 : 44;
    const by = d.y + d.h - 16 - btnH / 2;
    if (body.y + body.height > by - btnH / 2 - 8) body.setScale(Math.max(0.6, (by - btnH / 2 - 8 - body.y) / body.height));
    const label = done
      ? node.exclusive ? (this.confirm === node.id ? `もう一度で見直し (${formatResources(FOCUS_RESET_COST)})` : '見直す') : '完了'
      : state === 'ready' ? `始める (${node.minutes} 分)`
        : state === 'active' ? '進行中'
          : state === 'rank' ? `要階級: ${RANKS[node.rank]?.name ?? ''}`
            : state === 'closed' ? '選ばなかった道 (もう一方を見直すと選べる)'
              : state === 'busy' ? '他の方針が進行中'
                : state === 'resources' ? '資源が足りません' : '前の方針が必要';
    const enabled = state === 'ready' || (done && !!node.exclusive);
    add(new UIButton(this, d.x + d.w / 2, by, label, () => this.tap(node), {
      variant: state === 'ready' ? 'gold' : done && node.exclusive ? 'secondary' : 'secondary', width: w, height: btnH, fontSize: 14,
    })).setEnabled(enabled);
  }

  private select(id: string): void {
    this.selected = id;
    this.confirm = null;
    this.status = '';
    this.draw();
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
    this.selected = node.id;
    this.tap(node);
    return true;
  }
}

function addPanel(scene: Phaser.Scene, r: IRect): void {
  drawPanel(scene.add.graphics(), r.x, r.y, r.w, r.h, { radius: 20, fillAlpha: 0.45, rimAlpha: 0.25 });
}
