import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { NATION_INFO } from '@/config/NationInfo';
import { CLASS_JA, CLASS_ORDER, modifierBreakdown, modifierLines } from '@/systems/EncyclopediaSystem';
import {
  ABILITY_LABEL, ABILITY_MAX, aptitudeFor, captainAbilities, captainModifiers, captainSources, earnedTraits, ICaptainSource, inherentLabel,
  LEARN_SLOT_LEVELS, LEARNED_SKILL_SCALE, learnPlan, learnSlots, MAX_LEVEL, nextInherentTier, RETRAIN_COST, SKILL_LABEL, skillModifiers, TRAITS,
  validLearned, withProgress, xpForLevel,
} from '@/systems/CaptainSystem';
import { nationCaptains } from '@/systems/CaptainRoster';
import { canAfford, formatResources, pay } from '@/systems/ResourceSystem';
import { loadSave, saveSave } from '@/utils/ProgressStore';
import { Aptitude, CaptainAbility, CaptainSkill, ICaptain } from '@/types/Captain';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addChip, addPanel, drawMeter, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';
import { ABILITY_COLOR, SKILL_COLOR, TRAIT_COLOR } from '@/ui/SkillColors';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { list: { x: 16, y: 140, w: CANVAS_W - 32, h: 250 } as IRect, detail: { x: 16, y: 402, w: CANVAS_W - 32, h: CANVAS_H - 418 } as IRect, rowH: 48, cols: 2 }
  : { list: { x: 24, y: 96, w: 300, h: 604 } as IRect, detail: { x: 340, y: 96, w: 916, h: 604 } as IRect, rowH: 44, cols: 1 };

const PAD = 14;
const ROW_GAP = 6;
const SHEET_DEPTH = 300;
const APTITUDE_CSS: Record<Aptitude, string> = { S: Css.gold, A: Css.cyan, B: Css.muted, C: Css.dim };

/**
 * 艦長 (#130): the nation's captains and everything that grows them — level, the inherent skill and its tiers
 * (#131), learned skills (chosen per slot, always confirmed), abilities, aptitude, traits and a colour-coded
 * breakdown of what each adds. The 図鑑 only shows the biography.
 */
export class CaptainScene extends Phaser.Scene {
  private selectedId = '';
  private list!: ScrollList;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private sheet: Phaser.GameObjects.GameObject[] = [];
  private status = '';
  private statusCss: string = Css.success;

  constructor() {
    super({ key: SceneKeys.CAPTAIN });
  }

  init(data?: { id?: string }): void {
    this.selectedId = data?.id ?? '';
  }

  create(): void {
    showScreenHelp(this);
    audio.music('menu');
    this.dynamic = [];
    this.sheet = [];
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, '艦長', displayStyle(24)).setOrigin(0.5);
    addPanel(this, L.list.x, L.list.y, L.list.w, L.list.h, { radius: 24, fillAlpha: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.list = new ScrollList(this, { x: L.list.x + PAD, y: L.list.y + PAD, w: L.list.w - PAD * 2 + 4, h: L.list.h - PAD * 2 });
    this.refresh();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o);
    return o;
  }

  /** The current nation's captains the player has, with progress. */
  private owned(): ICaptain[] {
    const save = loadSave();
    const np = save.nations[save.current];
    const ids = np?.captains ?? [];
    return nationCaptains(save.current).filter((c) => ids.includes(c.id)).map((c) => withProgress(c, np?.captainXp[c.id] ?? 0));
  }

  private learnedOf(c: ICaptain): CaptainSkill[] {
    const save = loadSave();
    return validLearned(c, save.nations[save.current]?.captainSkills[c.id] ?? []);
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const captains = this.owned();
    if (!captains.some((c) => c.id === this.selectedId)) this.selectedId = captains[0]?.id ?? '';
    this.buildList(captains);
    const c = captains.find((x) => x.id === this.selectedId);
    if (c) this.buildDetail(c);
    else {
      const d = L.detail;
      this.track(this.add.text(d.x + d.w / 2, d.y + d.h / 2, '艦長がいません', textStyle(15, Css.dim)).setOrigin(0.5));
    }
  }

  private buildList(captains: ICaptain[]): void {
    this.list.clear();
    const cols = L.cols;
    const colW = (L.list.w - PAD * 2 - 12 - 8 * (cols - 1)) / cols;
    captains.forEach((c, i) => {
      const on = c.id === this.selectedId;
      const frame = drawPanel(this.add.graphics(), 0, 0, colW, L.rowH, {
        radius: 12, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.45, rimAlpha: on ? 0.85 : 0.15, glow: on ? 1 : 0,
      });
      const sc = SKILL_COLOR[c.skill];
      const dot = this.add.circle(18, L.rowH / 2, 6, sc.color);
      const name = this.add.text(32, L.rowH / 2, c.name, textStyle(IS_PORTRAIT ? 16 : 14, on ? Css.text : Css.muted)).setOrigin(0, 0.5);
      const sub = this.add.text(colW - 12, L.rowH / 2, `Lv${c.level}  ${SKILL_LABEL[c.skill]}`, eyebrowStyle(10, sc.css)).setOrigin(1, 0.5);
      const room = colW - 32 - sub.width - 16;
      if (name.width > room) name.setScale(room / name.width);
      const card = this.add.container((i % cols) * (colW + 8), Math.floor(i / cols) * (L.rowH + ROW_GAP), [frame, dot, name, sub]);
      this.list.addItem(card, colW, L.rowH, () => {
        this.selectedId = c.id;
        this.status = '';
        this.refresh();
      });
    });
    this.list.setContentHeight(Math.max(0, Math.ceil(captains.length / cols) * (L.rowH + ROW_GAP) - ROW_GAP));
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------

  private label(x: number, y: number, text: string): number {
    this.track(this.add.text(x, y, text, eyebrowStyle(10, Css.gold)));
    return y + 22;
  }

  private buildDetail(c: ICaptain): void {
    const d = L.detail;
    const x = d.x + 26;
    const colW = IS_PORTRAIT ? d.w - 52 : 420;
    this.track(this.add.text(x, d.y + 18, `${NATION_INFO[c.nation].ja}  ·  艦長`, eyebrowStyle(10, Css.cyan)));
    const title = this.track(this.add.text(x, d.y + 38, c.name, displayStyle(IS_PORTRAIT ? 24 : 24)));
    let y = title.y + title.height + 12;

    // Level and experience
    const next = c.level >= MAX_LEVEL ? null : xpForLevel(c.level + 1);
    const from = xpForLevel(c.level);
    const meterW = colW - 90 - 150;
    drawMeter(this.track(this.add.graphics()), x + 80, y + 7, meterW, 8, next ? (c.xp - from) / (next - from) : 1, Colors.cyan);
    this.track(this.add.text(x, y, `Lv${c.level}`, textStyle(16, Css.text, { fontStyle: 'bold' })));
    this.track(this.add.text(x + 90 + meterW, y + 1, next ? `${c.xp} / ${next}` : '最大レベル', textStyle(12, Css.muted)));
    y += 34;

    // Inherent skill: its own slot, never swapped (#131)
    y = this.label(x, y, '固有スキル (専用枠・付け替え不可)');
    const sc = SKILL_COLOR[c.skill];
    const chip = this.track(addChip(this, x, y + 10, inherentLabel(c), sc.color, sc.css));
    const tier = nextInherentTier(c.level);
    const chipW = (chip.list[1] as Phaser.GameObjects.Text).width + 18;
    this.track(this.add.text(x + chipW + 12, y + 10, tier ? `Lv${tier.level} で ${tier.label} に強化 (効果 ${tier.mul} 倍)` : '最大まで強化済み', textStyle(12, Css.muted)).setOrigin(0, 0.5));
    y += 34;

    // Learned skills, one button per slot (#130)
    const learned = this.learnedOf(c);
    const open = learnSlots(c.level);
    y = this.label(x, y, `習得スキル ${learned.length} / ${open} 枠`);
    y = this.buildSlots(c, learned, x, y, colW);
    const caption = this.track(this.add.text(x, y, `枠をタップしてスキルを選ぶ (空き枠は無料・付け替えは ${formatResources(RETRAIN_COST)})。\n効果は固有スキルの ${Math.round(LEARNED_SKILL_SCALE * 100)}%`, textStyle(11, Css.dim, { wordWrap: { width: colW, useAdvancedWrap: true } })));
    y = caption.y + caption.height + 8;
    if (this.status) {
      const t = this.track(this.add.text(x, y, this.status, textStyle(13, this.statusCss, { wordWrap: { width: colW, useAdvancedWrap: true } })));
      y = t.y + t.height + 8;
    }
    y += 6;

    // Abilities (#131)
    y = this.label(x, y, `能力 (Lv${MAX_LEVEL} で最大 +${ABILITY_MAX}%)`);
    const abilities = captainAbilities(c);
    const half = (colW - 20) / 2;
    (Object.values(CaptainAbility) as CaptainAbility[]).forEach((a, i) => {
      const ax = x + (i % 2) * (half + 20);
      const ay = y + Math.floor(i / 2) * 26;
      this.track(this.add.text(ax, ay, ABILITY_LABEL[a], textStyle(12, Css.muted)));
      drawMeter(this.track(this.add.graphics()), ax + 44, ay + 6, half - 44 - 56, 6, abilities[a] / ABILITY_MAX, ABILITY_COLOR.color);
      this.track(this.add.text(ax + half, ay, `+${abilities[a].toFixed(1)}%`, textStyle(12, ABILITY_COLOR.css)).setOrigin(1, 0));
    });
    y += 58;

    // Aptitude (#131)
    y = this.label(x, y, '搭乗適性 (S 120%・A 100%・B 80%・C 60%)');
    const aw = colW / CLASS_ORDER.length;
    CLASS_ORDER.forEach((cls, i) => {
      const apt = aptitudeFor(c, cls);
      const name = this.track(this.add.text(x + i * aw, y, CLASS_JA[cls].slice(0, 2), textStyle(13, Css.muted)));
      this.track(this.add.text(name.x + name.width + 6, y - 2, apt, textStyle(16, APTITUDE_CSS[apt], { fontStyle: 'bold' })));
    });
    y += 34;

    // Second column (landscape) or further down (portrait): the bonus breakdown and traits.
    const bx = IS_PORTRAIT ? x : d.x + 480;
    const bw = IS_PORTRAIT ? colW : d.w - 506;
    let by = IS_PORTRAIT ? y : d.y + 22;
    by = this.buildBreakdown(c, learned, bx, by, bw);
    this.buildTraits(c, bx, by + 8, bw);
  }

  private buildSlots(c: ICaptain, learned: CaptainSkill[], x: number, y: number, w: number): number {
    const n = LEARN_SLOT_LEVELS.length;
    const gap = 6;
    const sw = (w - gap * (n - 1)) / n;
    const sh = IS_PORTRAIT ? 48 : 38;
    const open = learnSlots(c.level);
    for (let i = 0; i < n; i++) {
      const sx = x + i * (sw + gap);
      const skill = learned[i];
      const g = this.track(this.add.graphics());
      const locked = i >= open;
      const color = skill ? SKILL_COLOR[skill].color : Colors.dim;
      g.fillStyle(skill ? color : Colors.panel, skill ? 0.16 : 0.5);
      g.fillRoundedRect(sx, y, sw, sh, 10);
      g.lineStyle(1, color, locked ? 0.25 : 0.7);
      g.strokeRoundedRect(sx, y, sw, sh, 10);
      const text = locked ? `Lv${LEARN_SLOT_LEVELS[i]}` : skill ? SKILL_LABEL[skill] : '＋ 空き';
      const css = locked ? Css.dim : skill ? SKILL_COLOR[skill].css : Css.muted;
      this.track(this.add.text(sx + sw / 2, y + sh / 2, text, textStyle(IS_PORTRAIT ? 14 : 13, css, { fontStyle: skill ? 'bold' : 'normal' })).setOrigin(0.5));
      if (!locked) {
        this.track(this.add.zone(sx, y, sw, sh).setOrigin(0, 0).setInteractive({ cursor: 'pointer' }).on('pointerup', () => this.openPicker(c, i)));
      }
    }
    return y + sh + 8;
  }

  /** Every bonus the captain gives, each line in the colours of the skills behind it (#130). */
  private buildBreakdown(c: ICaptain, learned: CaptainSkill[], x: number, y: number, w: number): number {
    const save = loadSave();
    const stats = save.nations[save.current]?.captainStats[c.id];
    const ctx = { night: true };
    const sources = captainSources(c, ctx, learned, stats);
    const rows = modifierBreakdown(sources, captainModifiers(c, ctx, learned, stats));
    y = this.label(x, y, '現在の補正 (適性 A・夜戦時を含む)');
    if (rows.length === 0) {
      this.track(this.add.text(x, y, '—', textStyle(13, Css.muted)));
      return y + 24;
    }
    const lineH = IS_PORTRAIT ? 26 : 24;
    for (const row of rows) {
      // A strip per source in its colour, then the label, the total and each share.
      let sx = x;
      for (const p of row.parts) {
        this.track(this.add.rectangle(sx, y + 3, 4, lineH - 10, this.sourceColor(sources[p.source]).color).setOrigin(0, 0));
        sx += 6;
      }
      const label = this.track(this.add.text(x + 30, y, row.label, textStyle(13, Css.muted)));
      label.setX(Math.max(x + 30, sx + 4));
      const total = this.track(this.add.text(x + 120, y, row.total, textStyle(13, Css.text, { fontStyle: 'bold' })));
      let px = total.x + Math.max(56, total.width + 10);
      for (const p of row.parts.length > 1 ? row.parts : []) {
        const src = sources[p.source];
        const t = this.track(this.add.text(px, y + 1, `${this.shortSource(src)} ${p.value}`, textStyle(11, this.sourceColor(src).css)));
        px += t.width + 10;
        if (px > x + w) t.setVisible(false);
      }
      if (row.parts.length === 1) {
        this.track(this.add.text(px, y + 1, this.shortSource(sources[row.parts[0].source]), textStyle(11, this.sourceColor(sources[row.parts[0].source]).css)));
      }
      y += lineH;
    }
    return y + 4;
  }

  private sourceColor(s: ICaptainSource): { color: number; css: string } {
    if (s.skill) return SKILL_COLOR[s.skill];
    return s.kind === 'ability' ? ABILITY_COLOR : TRAIT_COLOR;
  }

  private shortSource(s: ICaptainSource): string {
    if (s.kind === 'inherent') return `固有${s.skill ? SKILL_LABEL[s.skill] : ''}`;
    if (s.kind === 'learned') return s.skill ? SKILL_LABEL[s.skill] : '習得';
    return s.label;
  }

  private buildTraits(c: ICaptain, x: number, y: number, w: number): void {
    const save = loadSave();
    const earned = new Set(earnedTraits(save.nations[save.current]?.captainStats[c.id]).map((t) => t.id));
    y = this.label(x, y, '特性 (戦闘の実績で獲得)');
    const lines = TRAITS.map((t) => `${earned.has(t.id) ? '★' : '☆'} ${t.name} — ${t.effect}${earned.has(t.id) ? '' : ` (条件: ${t.condition})`}`);
    this.track(this.add.text(x, y, lines.join('\n'), textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 4 })));
  }

  // -------------------------------------------------------------------------
  // Choosing and confirming a skill (#130)
  // -------------------------------------------------------------------------

  private closeSheet(): void {
    for (const o of this.sheet) o.destroy();
    this.sheet = [];
  }

  /** A modal card in the middle of the screen; returns its rect. */
  private openSheet(h: number): IRect {
    this.closeSheet();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH);
      this.sheet.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.75).setOrigin(0, 0).setInteractive());
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 620;
    const r = { x: (CANVAS_W - w) / 2, y: (CANVAS_H - h) / 2, w, h };
    add(addPanel(this, r.x, r.y, r.w, r.h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    return r;
  }

  private sheetAdd<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(SHEET_DEPTH + 1);
    this.sheet.push(o);
    return o;
  }

  /** Lists the skills that can go into learn slot `slot`, with what each would add. */
  openPicker(c: ICaptain, slot: number): void {
    const learned = this.learnedOf(c);
    const options = (Object.values(CaptainSkill) as CaptainSkill[]).filter((s) => s !== c.skill && !learned.includes(s));
    const rowH = IS_PORTRAIT ? 56 : 44;
    const r = this.openSheet(110 + options.length * (rowH + 6) + 70);
    const replaces = learned[slot];
    this.sheetAdd(this.add.text(r.x + 26, r.y + 22, `習得枠 ${slot + 1}${replaces ? ` (いまは ${SKILL_LABEL[replaces]})` : ''}`, eyebrowStyle(11, Css.cyan)));
    this.sheetAdd(this.add.text(r.x + 26, r.y + 44, '習得するスキルを選ぶ', displayStyle(20)));
    let y = r.y + 92;
    for (const s of options) {
      const sc = SKILL_COLOR[s];
      const g = this.sheetAdd(this.add.graphics());
      g.fillStyle(sc.color, 0.12);
      g.fillRoundedRect(r.x + 20, y, r.w - 40, rowH, 12);
      g.lineStyle(1, sc.color, 0.5);
      g.strokeRoundedRect(r.x + 20, y, r.w - 40, rowH, 12);
      this.sheetAdd(this.add.text(r.x + 36, y + rowH / 2, SKILL_LABEL[s], textStyle(15, sc.css, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      const effect = modifierLines(skillModifiers(s, c.level, { night: true }, LEARNED_SKILL_SCALE)).join('・') || '—';
      const e = this.sheetAdd(this.add.text(r.x + 100, y + rowH / 2, s === CaptainSkill.Night ? `夜戦で ${effect}` : effect, textStyle(12, Css.muted)).setOrigin(0, 0.5));
      if (e.width > r.w - 140) e.setScale((r.w - 140) / e.width);
      this.sheetAdd(this.add.zone(r.x + 20, y, r.w - 40, rowH).setOrigin(0, 0).setInteractive({ cursor: 'pointer' }).on('pointerup', () => this.confirmLearn(c, slot, s)));
      y += rowH + 6;
    }
    this.sheetAdd(new UIButton(this, r.x + r.w / 2, r.y + r.h - 40, 'やめる', () => this.closeSheet(), { variant: 'secondary', width: 200, height: IS_PORTRAIT ? 52 : 40, fontSize: 15 }));
  }

  /** はい / いいえ before anything changes; a replacement names the skill it drops and the cost. */
  confirmLearn(c: ICaptain, slot: number, skill: CaptainSkill): void {
    const plan = learnPlan(c, this.learnedOf(c), slot, skill);
    if (!plan) return;
    const r = this.openSheet(IS_PORTRAIT ? 300 : 250);
    const what = plan.replaces ? `「${SKILL_LABEL[plan.replaces]}」を外して「${SKILL_LABEL[skill]}」を習得します` : `「${SKILL_LABEL[skill]}」を習得します`;
    const cost = plan.cost ? `(${formatResources(plan.cost)})` : '(無料)';
    this.sheetAdd(this.add.text(r.x + 26, r.y + 22, `${c.name}  ·  習得枠 ${slot + 1}`, eyebrowStyle(11, Css.cyan)));
    this.sheetAdd(this.add.text(r.x + r.w / 2, r.y + r.h / 2 - 30, `${what}\n${cost}`, textStyle(16, Css.text, { align: 'center', wordWrap: { width: r.w - 52, useAdvancedWrap: true }, lineSpacing: 6 })).setOrigin(0.5));
    const bh = IS_PORTRAIT ? 56 : 42;
    const bw = (r.w - 72) / 2;
    this.sheetAdd(new UIButton(this, r.x + 26 + bw / 2, r.y + r.h - 24 - bh / 2, 'いいえ', () => this.closeSheet(), { variant: 'secondary', width: bw, height: bh, fontSize: 16 }));
    this.sheetAdd(new UIButton(this, r.x + r.w - 26 - bw / 2, r.y + r.h - 24 - bh / 2, 'はい', () => this.applyLearn(c, slot, skill), { variant: 'gold', width: bw, height: bh, fontSize: 16 }));
  }

  applyLearn(c: ICaptain, slot: number, skill: CaptainSkill): void {
    this.closeSheet();
    const save = loadSave();
    const np = save.nations[save.current];
    const plan = learnPlan(c, this.learnedOf(c), slot, skill);
    if (!np || !plan) return;
    let resources = np.resources;
    if (plan.cost) {
      if (!canAfford(resources, plan.cost)) {
        this.status = `資源が足りません (${formatResources(plan.cost)})`;
        this.statusCss = Css.danger;
        this.refresh();
        return;
      }
      resources = pay(resources, plan.cost)!;
    }
    saveSave({ ...save, nations: { ...save.nations, [save.current]: { ...np, resources, captainSkills: { ...np.captainSkills, [c.id]: plan.learned } } } });
    this.status = plan.replaces ? `「${SKILL_LABEL[plan.replaces]}」を外し「${SKILL_LABEL[skill]}」を習得しました` : `「${SKILL_LABEL[skill]}」を習得しました`;
    this.statusCss = Css.success;
    this.refresh();
  }
}
