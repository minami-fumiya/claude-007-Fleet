import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { IProgress, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { collectExpeditions, EXPEDITIONS, expeditionLength, expeditionSlots, expeditionState, groupProblem, IExpedition, pickShips, recallExpedition, rememberedGroup, shipsAway, startExpedition } from '@/systems/ExpeditionSystem';
import { DORM_PROFICIENCY_CAP, DORM_PROFICIENCY_PER_HOUR, DORM_XP_PER_HOUR, dormSlots, enterDorm, inDorm, leaveDorm } from '@/systems/DormSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { addResources, formatResources } from '@/systems/ResourceSystem';
import { recordLedger } from '@/systems/LedgerSystem';
import { QuestEvent, withQuestEvents } from '@/systems/QuestSystem';
import { RANKS, rankOf } from '@/systems/RankSystem';
import { ownedShips } from '@/systems/ShipyardSystem';
import { isDocked } from '@/systems/DockSystem';
import { CLASS_JA } from '@/systems/EncyclopediaSystem';
import { nationCaptains } from '@/systems/CaptainRoster';
import { levelForXp } from '@/systems/CaptainSystem';
import { clock } from '@/utils/TimeFormat';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { selectedShipIds } from '@/utils/FleetSelection';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';
import { sailingIds } from '@/systems/FleetGroups';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

type Tab = 'expedition' | 'dorm';

const L = IS_PORTRAIT
  ? { left: 16, top: 250, cols: 2, cardH: 152, gap: 12, tabY: 170 }
  : { left: 24, top: 166, cols: 3, cardH: 150, gap: 10, tabY: 104 };
const CARD_W = (CANVAS_W - L.left * 2 - L.gap * (L.cols - 1)) / L.cols;

/**
 * 遠征 (#41) and 寮舎 (#57): ships not fighting go out for resources, or stay home to train with their captains.
 * Expeditions back are taken home as the screen opens; dorm training is credited whenever something leaves.
 */
export class ExpeditionScene extends Phaser.Scene {
  private tab: Tab = 'expedition';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private lists: ScrollList[] = [];
  private status = '';
  /** 遠征用の編成 (#337): the expedition whose group is being chosen, and the ships chosen so far */
  private picker: IExpedition | null = null;
  private pickerIds: string[] = [];
  /** The expedition whose 呼び戻す was pressed once (a second press recalls it) */
  private recallArmed: string | null = null;

  constructor() {
    super({ key: SceneKeys.EXPEDITION });
  }

  create(data?: { tab?: Tab }): void {
    this.tab = data?.tab ?? 'expedition';
    this.status = '';
    this.picker = null;
    this.pickerIds = [];
    this.recallArmed = null;
    showScreenHelp(this);
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '遠征・寮舎', displayStyle(24)).setOrigin(0.5);
    this.collect();
    this.draw();
    // The countdowns tick; a returning expedition is taken home on the next tick.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (this.tab === 'expedition' && !this.picker) { this.collect(); this.draw(); } } });
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  /** Takes home every expedition that is back. */
  private collect(): void {
    const now = Date.now();
    const p = loadProgress();
    if (!p.expeditions.some((r) => r.endsAt <= now)) return;
    const c = collectExpeditions(p.resources, p.expeditions, holdCap(p.facilities), now);
    const ledger = recordLedger(recordLedger(p.ledger, 'expedition', addResources(c.gained, c.lost, -1), now), 'overflow', c.lost, now);
    saveProgress(withQuestEvents({ ...p, resources: c.resources, expeditions: c.runs, ledger }, [['expeditionDone', c.done]], now));
    this.status = `遠征から帰還 (${c.done}): ${formatResources(c.gained)}`;
  }

  /** Ships free for an expedition or the dorm: owned, not sailing, docked, away or training. */
  private idleShips(p: IProgress, now: number): IShipData[] {
    const roster = DataLoader.getRegistry(this).byNation(p.nation);
    const away = shipsAway(p.expeditions);
    const sortie = new Set(sailingIds(p.sortie));
    return ownedShips(p, roster).filter((s) => !away.has(s.id) && !sortie.has(s.id) && !isDocked({ ...p, docks: p.docks.filter((d) => d.endsAt > now) }, s.id) && !inDorm(p.dorm, 'ship', s.id));
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    for (const l of this.lists) l.destroy();
    this.layer = [];
    this.lists = [];
    const tabs: Array<[Tab, string]> = [['expedition', '遠征'], ['dorm', '寮舎']];
    const tw = IS_PORTRAIT ? 200 : 180;
    tabs.forEach(([id, label], i) => {
      this.track(new UIButton(this, L.left + tw / 2 + i * (tw + 10), L.tabY, label, () => { this.tab = id; this.status = ''; this.draw(); }, {
        variant: this.tab === id ? 'gold' : 'secondary', width: tw, height: IS_PORTRAIT ? 52 : 40, fontSize: 16,
      }));
    });
    if (this.status) this.track(this.add.text(CANVAS_W - L.left, L.tabY, this.status, textStyle(12, Css.success)).setOrigin(1, 0.5));
    if (this.tab === 'expedition') this.drawExpeditions();
    else this.drawDorm();
    if (this.picker && this.tab === 'expedition') this.drawPicker(this.picker);
  }

  private drawExpeditions(): void {
    const now = Date.now();
    const p = loadProgress();
    const rank = rankOf(p).index;
    const idle = this.idleShips(p, now);
    this.track(this.add.text(L.left, L.top - 30, `遠征 ${p.expeditions.length} / ${expeditionSlots(rank)}  ·  出せる艦 ${idle.length} 隻 (「編成」で艦を選べます)`, eyebrowStyle(11, Css.gold)));
    const roster = DataLoader.getRegistry(this).byNation(p.nation);
    const short = (id: string): string => roster.find((s) => s.id === id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? id;
    EXPEDITIONS.forEach((e, i) => {
      const x = L.left + (i % L.cols) * (CARD_W + L.gap);
      const y = L.top + Math.floor(i / L.cols) * (L.cardH + L.gap);
      const run = p.expeditions.find((r) => r.id === e.id);
      const state = expeditionState(e, p.expeditions, rank, idle);
      this.track(drawPanel(this.add.graphics(), x, y, CARD_W, L.cardH, { radius: 14, fillAlpha: 0.6, rim: run ? Colors.cyan : undefined, rimAlpha: run ? 0.7 : 0.2 }));
      this.track(this.add.text(x + 14, y + 10, e.name, textStyle(15, Css.text, { fontStyle: 'bold' })));
      this.track(this.add.text(x + CARD_W - 14, y + 12, expeditionLength(e.minutes), textStyle(12, Css.muted)).setOrigin(1, 0));
      // Out: who sailed (#337), in place of what it asks.
      const line = run ? `出撃中: ${run.shipIds.map(short).join('・')}` : `${e.ships} 隻${this.needsText(e)}`;
      const lineText = this.track(this.add.text(x + 14, y + 36, line, textStyle(12, run ? Css.text : Css.muted)));
      if (lineText.width > CARD_W - 28) lineText.setScale((CARD_W - 28) / lineText.width);
      this.track(this.add.text(x + 14, y + 58, formatResources(e.reward), textStyle(12, Css.cyan, { wordWrap: { width: CARD_W - 28, useAdvancedWrap: true } })));
      const by = y + L.cardH - (IS_PORTRAIT ? 26 : 22);
      const bh = IS_PORTRAIT ? 40 : 32;
      if (run) {
        // 呼び戻す (#337): a second press brings it home at once, without its reward.
        const armed = this.recallArmed === e.id;
        this.track(new UIButton(this, x + CARD_W / 2, by, armed ? 'もう一度で呼び戻す (報酬なし)' : `呼び戻す  ·  帰還まで ${clock(run.endsAt - now)}`, () => this.recall(e), {
          variant: armed ? 'danger' : 'secondary', width: CARD_W - 28, height: bh, fontSize: 13,
        }));
        return;
      }
      const label = state === 'rank' ? `要階級: ${RANKS[e.rank].name}` : state === 'slots' ? '遠征枠がいっぱい' : state === 'ships' ? '艦が足りない' : '送り出す';
      const pickW = state === 'rank' ? 0 : IS_PORTRAIT ? 96 : 80;
      if (pickW > 0) {
        this.track(new UIButton(this, x + 14 + pickW / 2, by, '編成', () => this.openPicker(e), { variant: 'primary', width: pickW, height: bh, fontSize: 13 }));
      }
      const mainW = CARD_W - 28 - (pickW > 0 ? pickW + 8 : 0);
      this.track(new UIButton(this, x + CARD_W - 14 - mainW / 2, by, label, () => this.send(e), {
        variant: state === 'ready' ? 'gold' : 'secondary', width: mainW, height: bh, fontSize: 13,
      })).setEnabled(state === 'ready');
    });
  }

  private needsText(e: IExpedition): string {
    const needs = Object.entries(e.needs) as Array<[ShipClass, number]>;
    return needs.length > 0 ? ` (${needs.map(([c, n]) => `${CLASS_JA[c]} ${n}`).join('・')} を含む)` : '';
  }

  /** Sends `e` out: with `group` (chosen in the picker), else the group sent last time, else the picked ships. */
  private send(e: IExpedition, group?: IShipData[]): void {
    const now = Date.now();
    const p = loadProgress();
    const idle = this.idleShips(p, now);
    const chosen = group ?? rememberedGroup(p.expeditionGroups, e, idle) ?? undefined;
    const runs = startExpedition(p.expeditions, e, rankOf(p).index, idle, now, chosen);
    if (!runs) return;
    const sent = runs[runs.length - 1].shipIds;
    const events: Array<[QuestEvent, number]> = [['expeditionStart', 1], ...(group ? [['expeditionPicked', 1] as [QuestEvent, number]] : [])];
    saveProgress(withQuestEvents({ ...p, expeditions: runs, expeditionGroups: { ...p.expeditionGroups, [e.id]: sent } }, events, now));
    const roster = DataLoader.getRegistry(this).byNation(p.nation);
    this.status = `${e.name}: ${sent.map((id) => roster.find((s) => s.id === id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? id).join('・')}`;
    this.picker = null;
    this.draw();
  }

  private recall(e: IExpedition): void {
    if (this.recallArmed !== e.id) {
      this.recallArmed = e.id;
      this.draw();
      return;
    }
    const p = loadProgress();
    saveProgress({ ...p, expeditions: recallExpedition(p.expeditions, e.id) });
    this.recallArmed = null;
    this.status = `${e.name}を呼び戻しました (報酬なし)`;
    this.draw();
  }

  /** 遠征用の編成 (#337): starts from the group sent last time, or the one the game would pick. */
  private openPicker(e: IExpedition): void {
    const p = loadProgress();
    const idle = this.idleShips(p, Date.now());
    this.picker = e;
    this.pickerIds = (rememberedGroup(p.expeditionGroups, e, idle) ?? pickShips(e, idle) ?? []).map((s) => s.id);
    this.draw();
  }

  private drawPicker(e: IExpedition): void {
    const p = loadProgress();
    const idle = this.idleShips(p, Date.now()).sort((a, b) => a.hp - b.hp);
    const group = idle.filter((s) => this.pickerIds.includes(s.id));
    const problem = groupProblem(e, group, (c) => CLASS_JA[c]);
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 760;
    const h = IS_PORTRAIT ? 980 : 600;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    this.track(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive().setDepth(20));
    this.track(drawPanel(this.add.graphics(), x, y, w, h, { radius: 20, fillAlpha: 0.96 }).setDepth(20));
    // Said big and in green (#357): this is an expedition's group, not the battle fleet.
    this.track(this.add.text(x + 24, y + 20, `遠征の編成 — ${e.name}`, textStyle(17, Css.success, { fontStyle: 'bold' })).setDepth(21));
    this.track(this.add.text(x + 24, y + 52, `${e.ships} 隻${this.needsText(e)}  ·  選択 ${group.length} 隻`, textStyle(12, Css.muted)).setDepth(21));
    this.track(this.add.text(x + 24, y + 74, problem ?? 'この編成で送り出せます', textStyle(12, problem ? Css.danger : Css.success)).setDepth(21));
    const listTop = y + 104;
    const footer = IS_PORTRAIT ? 80 : 60;
    const list = new ScrollList(this, { x: x + 20, y: listTop, w: w - 40, h: h - (listTop - y) - footer });
    list.setDepth(21);
    this.lists.push(list);
    const itemH = IS_PORTRAIT ? 52 : 36;
    // Ships of the battle fleet (第 1 艦隊) are marked, so the two groups are told apart (#357).
    const fleet = new Set(selectedShipIds(this.registry, p.nation));
    idle.forEach((s, i) => {
      const on = this.pickerIds.includes(s.id);
      const parts: Phaser.GameObjects.GameObject[] = [
        drawPanel(this.add.graphics(), 0, 0, w - 52, itemH, { radius: 10, fillAlpha: on ? 0.7 : 0.4, rim: on ? Colors.success : undefined, rimAlpha: on ? 0.8 : 0.15 }),
        this.add.text(14, itemH / 2, `${on ? '✓  ' : '    '}${s.name.replace(/\s*\(.*\)\s*$/, '')}  ·  ${CLASS_JA[s.shipClass]}`, textStyle(14, on ? Css.success : Css.text)).setOrigin(0, 0.5),
      ];
      const tag = on ? '遠征に出す' : fleet.has(s.id) ? '第 1 艦隊に編成中' : '';
      if (tag) parts.push(this.add.text(w - 52 - 14, itemH / 2, tag, textStyle(12, on ? Css.success : Css.gold, { fontStyle: 'bold' })).setOrigin(1, 0.5));
      const card = this.add.container(0, i * (itemH + 4), parts);
      list.addItem(card, w - 52, itemH, () => {
        this.pickerIds = on ? this.pickerIds.filter((id) => id !== s.id) : [...this.pickerIds, s.id];
        this.draw();
      });
    });
    list.setContentHeight(Math.max(0, idle.length * (itemH + 4) - 4));
    const bw = (w - 48 - 16) / 3;
    const by = y + h - footer / 2;
    const bh = IS_PORTRAIT ? 52 : 38;
    this.track(new UIButton(this, x + 24 + bw / 2, by, 'おまかせ', () => {
      this.pickerIds = (pickShips(e, idle) ?? []).map((s) => s.id);
      this.draw();
    }, { variant: 'secondary', width: bw, height: bh, fontSize: 14 }).setDepth(22));
    this.track(new UIButton(this, x + 24 + bw * 1.5 + 8, by, '閉じる', () => {
      this.picker = null;
      this.draw();
    }, { variant: 'secondary', width: bw, height: bh, fontSize: 14 }).setDepth(22));
    this.track(new UIButton(this, x + 24 + bw * 2.5 + 16, by, '送り出す', () => this.send(e, group), {
      variant: 'gold', width: bw, height: bh, fontSize: 14,
    }).setDepth(22)).setEnabled(problem === null && expeditionState(e, p.expeditions, rankOf(p).index, idle) === 'ready');
  }

  private drawDorm(): void {
    const now = Date.now();
    const p = loadProgress();
    const rank = rankOf(p).index;
    const roster = DataLoader.getRegistry(this).byNation(p.nation);
    const top = L.top - 30;
    this.track(this.add.text(L.left, top, `寮舎 ${p.dorm.length} / ${dormSlots(rank)}  ·  艦は 1 時間に練度 +${DORM_PROFICIENCY_PER_HOUR} (${DORM_PROFICIENCY_CAP} まで)、艦長は経験値 +${DORM_XP_PER_HOUR}`, eyebrowStyle(11, Css.gold)));
    // Who is in: tap to take out (their training is credited).
    const rowH = IS_PORTRAIT ? 52 : 40;
    p.dorm.forEach((e, i) => {
      const y = top + 26 + i * (rowH + 6);
      const name = e.kind === 'ship' ? roster.find((s) => s.id === e.id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? e.id : nationCaptains(p.nation).find((c) => c.id === e.id)?.name ?? e.id;
      const hours = ((now - e.since) / 3_600_000).toFixed(1);
      this.track(new UIButton(this, CANVAS_W / 2, y + rowH / 2, `${e.kind === 'ship' ? '艦' : '艦長'}  ${name}  ·  ${hours} 時間  ·  出す`, () => this.leave(e.kind, e.id), {
        variant: 'primary', width: CANVAS_W - L.left * 2, height: rowH, fontSize: 14,
      }));
    });
    const listTop = top + 26 + dormSlots(rank) * (rowH + 6) + 16;
    const full = p.dorm.length >= dormSlots(rank);
    const colW = (CANVAS_W - L.left * 2 - L.gap) / 2;
    const h = CANVAS_H - listTop - 40;
    // Ships, least trained first; captains, lowest level first.
    const ships = this.idleShips(p, now).sort((a, b) => (p.proficiency[a.id] ?? 0) - (p.proficiency[b.id] ?? 0));
    const captains = nationCaptains(p.nation).filter((c) => p.captains.includes(c.id) && !inDorm(p.dorm, 'captain', c.id))
      .sort((a, b) => (p.captainXp[a.id] ?? 0) - (p.captainXp[b.id] ?? 0));
    const column = (x: number, title: string, rows: Array<{ label: string; onTap: () => void }>): void => {
      this.track(this.add.text(x, listTop - 22, title, eyebrowStyle(11, full ? Css.dim : Css.cyan)));
      const list = new ScrollList(this, { x, y: listTop, w: colW, h });
      this.lists.push(list);
      const itemH = IS_PORTRAIT ? 48 : 34;
      rows.forEach((r, i) => {
        const card = this.add.container(0, i * (itemH + 4), [
          drawPanel(this.add.graphics(), 0, 0, colW - 12, itemH, { radius: 10, fillAlpha: 0.5 }),
          this.add.text(12, itemH / 2, r.label, textStyle(13, full ? Css.dim : Css.text)).setOrigin(0, 0.5),
        ]);
        list.addItem(card, colW - 12, itemH, r.onTap);
      });
      list.setContentHeight(Math.max(0, rows.length * (itemH + 4) - 4));
    };
    column(L.left, full ? '寮舎がいっぱい' : '艦を預ける (練度の低い順)', ships.map((s) => ({
      label: `${s.name.replace(/\s*\(.*\)\s*$/, '')}  練度 ${p.proficiency[s.id] ?? 0}`, onTap: () => this.enter('ship', s.id),
    })));
    column(L.left + colW + L.gap, full ? '寮舎がいっぱい' : '艦長を預ける (Lv の低い順)', captains.map((c) => ({
      label: `${c.name}  Lv${levelForXp(p.captainXp[c.id] ?? 0)}`, onTap: () => this.enter('captain', c.id),
    })));
  }

  private enter(kind: 'ship' | 'captain', id: string): void {
    const now = Date.now();
    const p = loadProgress();
    const next = enterDorm(p, kind, id, rankOf(p).index, now);
    if (!next) return;
    saveProgress(next);
    this.draw();
  }

  private leave(kind: 'ship' | 'captain', id: string): void {
    const now = Date.now();
    const p = loadProgress();
    // Everyone's training is credited, so the hours count once.
    const r = leaveDorm(p, kind, id, now);
    saveProgress(withQuestEvents(r.progress, [['dormHours', Math.floor(r.hours)]], now));
    this.status = '寮舎から出しました (訓練の成果を受け取りました)';
    this.draw();
  }
}

