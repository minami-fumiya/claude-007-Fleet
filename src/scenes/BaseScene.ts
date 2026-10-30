import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { NATION_INFO } from '@/config/NationInfo';
import {
  baseBonusLines, baseLockShort, baseLockText, baseOfProgress, BaseState, baseState, baseWorkOf, currentBaseId, dockTotal, fleetBuildTimeMul, FRONT_SHOP, IBase, isBaseOpen, isForward, nationBases,
  nationForwardBases, nationPorts, openBases, rushBaseWork, startBaseWork, SUPPLY_OFF,
} from '@/systems/BaseSystem';
import {
  boostedBase, COMMON_FACILITIES, facilityCost, facilityLevel, facilityMinutes, facilitySlots, facilityState, FacilityId, FORWARD_FACILITIES, forwardTotal, maxLevelOf, facilityPreview, holdCap, regenRules, startFacility,
  UNIQUE_REGEN_CAP, uniqueStrength,
} from '@/systems/FacilitySystem';
import { formatResources } from '@/systems/ResourceSystem';
import { awardPendingMedals, loadProgress, saveProgress } from '@/utils/ProgressStore';
import { clock } from '@/utils/TimeFormat';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { QuestEvent, withQuestEvents } from '@/systems/QuestSystem';
import { facilityMedal, medalName } from '@/systems/MedalGate';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import campaignData from '@/data/campaign.json';

interface IRect { x: number; y: number; w: number; h: number }

const THEATER_NAME: Record<string, string> = Object.fromEntries(campaignData.theaters.map((t) => [t.id, t.name]));

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 140, w: CANVAS_W - 32 }, barCols: 2, list: { x: 16, y: 280, w: CANVAS_W - 32, h: 262 } as IRect, detail: { x: 16, y: 554, w: CANVAS_W - 32, h: CANVAS_H - 570 } as IRect, rowH: 110 }
  : { bar: { x: 24, y: 92, w: CANVAS_W - 48 }, barCols: 4, list: { x: 24, y: 176, w: 360, h: 528 } as IRect, detail: { x: 400, y: 176, w: 856, h: 528 } as IRect, rowH: 112 };

/** List-row text of a base that is not open yet (#217); 'locked' shows the rank it waits for. */
const BASE_STATE_TEXT: Partial<Record<BaseState, string>> = { ready: '着工できる', resources: '着工できる (資源不足)', busy: '着工待ち (他の工事中)' };

/** The base's own facility, named after its bonus. */
function uniqueName(base: IBase): string {
  if (base.repairTime) return '修理工廠';
  const classes = base.build?.classes ?? [];
  if (classes.includes('Battleship' as never)) return '大型艦ドック';
  if (classes.includes('Cruiser' as never)) return '巡洋艦造船所';
  return '小型艦造船所';
}

/** What a forward base's facilities give now (#373): "補給 −10%・修理所 +5%", or a line saying it has none yet. */
function forwardEffects(facilities: Record<string, Partial<Record<FacilityId, number>>>, base: string): string {
  const lv = (id: FacilityId): number => facilityLevel(facilities, base, id);
  const parts = [
    lv('supply') > 0 ? `出撃の燃料・弾薬 −${Math.round((SUPPLY_OFF[lv('supply')] ?? 0) * 100)}%` : '',
    lv('anchorage') > 0 ? `途中の戦闘の後に耐久 +${5 * lv('anchorage')}%` : '',
    lv('baseAir') > 0 ? (lv('baseAir') === 1 ? '敵艦隊の位置が分かる' : `敵艦隊の位置・攻撃隊 ${lv('baseAir') - 1} 回`) : '',
    lv('frontShop') > 0 ? `研究費 −${Math.round(FRONT_SHOP.research * 100 * lv('frontShop'))}%・修理時間 −${Math.round(FRONT_SHOP.repair * 100 * lv('frontShop'))}%` : '',
    lv('outpost') > 0 ? `遠征先 1 つ${lv('outpost') >= 2 ? ' (報酬 +20%)' : ''}` : '',
  ].filter((x) => x);
  return parts.length > 0 ? parts.join('・') : 'まだ施設がありません (施設を作ると効果が出ます)';
}

/**
 * 軍港 (#88 / #145 / #146): the nation's bases, where sorties from each can go, and their facilities. Moving is
 * free; facilities cost resources and time and raise regeneration (every base counts) or the base's own bonus.
 * Since #373 two tabs: the home ports (軍港) and the forward bases (基地) that open the far seas, each with their own
 * facilities.
 */
export class BaseScene extends Phaser.Scene {
  private selectedId = '';
  /** 軍港 or 基地 (#373) */
  private tab: 'port' | 'forward' = 'port';
  private bar!: ResourceBar;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private timer: { text: Phaser.GameObjects.Text; endsAt: number; label: string } | null = null;
  /** The base under construction (#217), counting down on its list row */
  private workTimer: { text: Phaser.GameObjects.Text; endsAt: number; name: string } | null = null;
  private status = '';
  /** Where the back button goes: the home port, or the strategic map that opened this screen (#220) */
  private returnTo: string = SceneKeys.HOME;

  constructor() {
    super({ key: SceneKeys.BASE });
  }

  init(data?: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? SceneKeys.HOME;
  }

  create(): void {
    showScreenHelp(this);
    awardPendingMedals();
    audio.music('menu');
    this.layer = [];
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    const backLabel = this.returnTo === SceneKeys.CAMPAIGN ? '‹  戦略地図' : '‹  鎮守府';
    new UIButton(this, back.x, back.y, backLabel, () => this.scene.start(this.returnTo), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 56, `${NATION_INFO[loadProgress().nation].jaShort}の軍港と基地`, displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    addPanel(this, L.list.x, L.list.y, L.list.w, L.list.h, { radius: 24, fillAlpha: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.tab = 'port';
    this.selectedId = currentBaseId(loadProgress());
    this.refresh();
  }

  update(): void {
    const progress = loadProgress();
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    if (this.workTimer) {
      // A finished construction opens the base on load (#217).
      if (!progress.baseWork) {
        this.status = `${this.workTimer.name}が${this.tab === 'forward' ? '開設' : '開港'}しました`;
        this.refresh();
        return;
      }
      this.workTimer.text.setText(`工事中 残り ${clock(this.workTimer.endsAt - Date.now())}`);
    }
    if (!this.timer) return;
    const left = this.timer.endsAt - Date.now();
    // A finished job takes effect on load: redraw with the new level.
    if (left <= 0 || !progress.facilityJobs.some((j) => j.endsAt === this.timer?.endsAt)) {
      this.status = `${this.timer.label}が完成しました`;
      this.refresh();
      return;
    }
    this.timer.text.setText(`建設中: ${this.timer.label}  残り ${clock(left)}`);
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private refresh(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    this.timer = null;
    this.workTimer = null;
    const progress = loadProgress();
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    this.buildList();
    const base = nationBases(progress.nation).find((b) => b.id === this.selectedId);
    if (base) this.buildDetail(base);
  }

  private buildList(): void {
    const progress = loadProgress();
    const { x, w } = L.list;
    // 軍港 / 基地 (#373): the home ports, or the forward bases that open the far seas.
    const tabH = IS_PORTRAIT ? 44 : 36;
    const tabW = (w - 28 - 8) / 2;
    (['port', 'forward'] as const).forEach((t, i) => {
      const n = this.listed(t).filter((b) => isBaseOpen(b, progress)).length;
      const all = this.listed(t).length;
      this.track(new UIButton(this, x + 14 + tabW / 2 + i * (tabW + 8), L.list.y + 14 + tabH / 2, `${t === 'port' ? '軍港' : '基地'} ${n} / ${all}`, () => {
        if (this.tab === t) return;
        this.tab = t;
        this.selectedId = this.listed(t)[0]?.id ?? '';
        this.status = '';
        this.refresh();
      }, { variant: this.tab === t ? 'primary' : 'secondary', width: tabW, height: tabH, fontSize: IS_PORTRAIT ? 14 : 13 }));
    });
    const y = L.list.y + tabH + 10;
    const bases = this.listed(this.tab);
    const gap = 8;
    const cols = IS_PORTRAIT ? 2 : 1;
    const cw = (w - 28 - gap * (cols - 1)) / cols;
    const rowsN = Math.max(1, Math.ceil(bases.length / cols));
    const rh = Math.min(L.rowH, (L.list.h - tabH - 10 - 28 - gap * (rowsN - 1)) / rowsN);
    bases.forEach((b, i) => {
      const bx = x + 14 + (i % cols) * (cw + gap);
      const by = y + 14 + Math.floor(i / cols) * (rh + gap);
      const open = isBaseOpen(b, progress);
      const on = b.id === this.selectedId;
      this.track(drawPanel(this.add.graphics(), bx, by, cw, rh, {
        radius: 14, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.45, rimAlpha: on ? 0.85 : 0.15, glow: on ? 0.8 : 0,
      }));
      this.track(this.add.text(bx + 16, by + 12, b.name, textStyle(IS_PORTRAIT ? 16 : 15, open ? Css.text : Css.dim, { fontStyle: 'bold' })));
      // A base past its rank is built before it opens (#217).
      const state = baseState(b, progress);
      // A home port past the first opens no sea since #373: it reads 本国の軍港.
      const seas = (b.theaters ?? []).map((t) => THEATER_NAME[t] ?? t).join('・') || '本国の軍港';
      const sub = open ? seas : BASE_STATE_TEXT[state] ?? baseLockShort(b, progress);
      const subText = this.track(this.add.text(bx + 16, by + rh - 12, sub, textStyle(12, open ? Css.muted : state === 'ready' || state === 'building' ? Css.cyan : Css.dim)).setOrigin(0, 1));
      if (subText.width > cw - 32) subText.setScale((cw - 32) / subText.width);
      if (state === 'building' && progress.baseWork) {
        this.workTimer = { text: subText, endsAt: progress.baseWork.endsAt, name: b.name };
        subText.setText(`工事中 残り ${clock(progress.baseWork.endsAt - Date.now())}`);
      }
      this.track(this.add.zone(bx, by, cw, rh).setOrigin(0, 0).setInteractive({ cursor: 'pointer' }).on('pointerup', () => {
        this.selectedId = b.id;
        this.status = '';
        this.refresh();
      }));
    });
  }

  /**
   * The ports or bases the list shows: those open, under way or that can be built — not those whose rank or earlier
   * theater is still out of reach (#382: they only crowded the list with what can't be had yet).
   */
  private listed(tab: 'port' | 'forward'): IBase[] {
    const progress = loadProgress();
    return (tab === 'port' ? nationPorts(progress.nation) : nationForwardBases(progress.nation)).filter((b) => baseState(b, progress) !== 'locked');
  }

  private buildDetail(base: IBase): void {
    if (isForward(base)) {
      this.buildForwardDetail(base);
      return;
    }
    const progress = loadProgress();
    const d = L.detail;
    const x = d.x + 24;
    const w = d.w - 48;
    const open = isBaseOpen(base, progress);
    const facilities = progress.facilities;
    const state = baseState(base, progress);
    // No moving between bases since #281: every open base works at once.
    this.track(this.add.text(x, d.y + 18, open ? '開港済みの軍港' : state === 'building' ? '工事中' : '未開港', eyebrowStyle(11, open ? Css.gold : Css.cyan)));
    const title = this.track(this.add.text(x, d.y + 38, base.name, displayStyle(22)));
    if (!open) {
      // Construction (#217): start it once the rank is reached, or finish it with a 高速建造材.
      const work = baseWorkOf(base);
      const items = progress.items.fastBuild;
      const label = state === 'building' ? `高速建造材で完成 (所持 ${items})`
        : state === 'ready' || state === 'resources' ? `着工 ${work.minutes}分${IS_PORTRAIT ? '\n' : '  '}${formatResources(work.cost)}`
          : state === 'busy' ? '他の軍港を工事中' : baseLockText(base, progress);
      const enabled = state === 'ready' || (state === 'building' && items > 0);
      const workW = IS_PORTRAIT ? 300 : 340;
      this.track(new UIButton(this, d.x + d.w - 24 - workW / 2, d.y + 44, label, () => (state === 'building' ? this.rushWork() : this.startWork(base)), {
        variant: state === 'ready' ? 'gold' : 'secondary', width: workW, height: IS_PORTRAIT ? 60 : 40, fontSize: IS_PORTRAIT ? 12 : 12,
      })).setEnabled(enabled);
      // The name never runs under the button (#297).
      const room = w - workW - 12;
      if (title.width > room) title.setScale(room / title.width);
    }
    // Below the button in portrait (it is taller than the name).
    let y = Math.max(title.y + title.height + 10, !open && IS_PORTRAIT ? d.y + 80 : 0);
    // Where sorties go from here (#145), this base's bonus with its own facility (#146), and every open base together (#281).
    const bonus = baseBonusLines(boostedBase(base, facilities) ?? base).join('・');
    const all = baseOfProgress(progress);
    const time = Math.round((1 - fleetBuildTimeMul(progress)) * 100);
    const total = [...(all ? baseBonusLines(all) : []), ...(time > 0 ? [`建造時間 -${time}%`] : []), `ドック ${dockTotal(progress)} 本`].join('・');
    const seas = (base.theaters ?? []).map((t) => THEATER_NAME[t] ?? t).join('・');
    const info = this.track(this.add.text(x, y, `${seas ? `解放する戦域: ${seas}` : '本国の軍港 (遠い海の戦域は基地が開く)'}\nこの軍港の特色: ${bonus}${uniqueStrength(facilities, base.id) > 1 ? ` (${uniqueName(base)}で強化)` : ''}${open ? '' : ' (開港すると加わる)'}\n全軍港の効果: ${total}`, textStyle(13, Css.muted, { lineSpacing: 4, wordWrap: { width: w, useAdvancedWrap: true } })));
    y = info.y + info.height + 12;

    // The footer is laid out from the bottom up first, so nothing above runs into it (#297): regeneration with
    // every base's facilities (#146), the holding cap (#221) above it, and the work line on top.
    const { perTick: r, cap } = regenRules(facilities);
    const hold = holdCap(facilities);
    const footStyle = textStyle(12, Css.muted, { wordWrap: { width: w, useAdvancedWrap: true } });
    const regenText = this.track(this.add.text(x, d.y + d.h - 14, `自然回復/分 燃${r.fuel} 弾${r.ammo} 鋼${r.steel} ボ${r.bauxite}  ·  回復上限 燃${cap.fuel} 弾${cap.ammo} 鋼${cap.steel} ボ${cap.bauxite}`, footStyle).setOrigin(0, 1));
    const holdText = this.track(this.add.text(x, regenText.y - regenText.height - 2, `保有上限 燃${hold.fuel} 弾${hold.ammo} 鋼${hold.steel} ボ${hold.bauxite}  (全軍港の施設で増える)`, footStyle).setOrigin(0, 1));
    const footerTop = holdText.y - holdText.height - 24;
    // Facilities: the base's own first, then the common ones. The rows shrink to leave the footer its room.
    const rowH = Math.min(IS_PORTRAIT ? 70 : 44, Math.floor((footerTop - y - 20) / (1 + COMMON_FACILITIES.length)));
    // Several facilities can be raised at once (#216).
    const jobs = progress.facilityJobs.filter((j) => j.base === base.id);
    const rows: Array<{ id: FacilityId; name: string; effect: string }> = [
      { id: 'unique', name: `${uniqueName(base)} (固有)`, effect: `特色の効果 ×${uniqueStrength(facilities, base.id)}  →  次 ×${uniqueStrength(facilities, base.id) + 0.5}・4 資源の回復上限 +${UNIQUE_REGEN_CAP}` },
      // Resource facilities show their next level's figures (#190); every base's levels add up.
      ...COMMON_FACILITIES.map((f) => ({ id: f.id, name: f.name, effect: f.id === 'workshop' ? f.effect : IS_PORTRAIT ? facilityPreview(facilities, base.id, f.id, true) ?? f.effect : `${facilityPreview(facilities, base.id, f.id) ?? f.effect} (全軍港で合算)` })),
    ];
    this.track(this.add.text(x, y, '施設', eyebrowStyle(10, Css.gold)));
    y += 20;
    const bw = IS_PORTRAIT ? 250 : 290;
    for (const r of rows) {
      const lv = facilityLevel(facilities, base.id, r.id);
      const max = maxLevelOf(r.id);
      const state = open ? facilityState(facilities, progress.facilityJobs, base.id, r.id, progress.resources, progress.record.medals) : 'busy';
      const cost = facilityCost(r.id, lv + 1);
      this.track(drawPanel(this.add.graphics(), x, y, w, rowH - 6, { radius: 10, fill: Colors.panel, fillAlpha: 0.45, rimAlpha: 0.12 }));
      this.track(this.add.text(x + 14, y + (IS_PORTRAIT ? 10 : 5), `${r.name}  Lv${lv} / ${max}`, textStyle(IS_PORTRAIT ? 14 : 13, lv > 0 ? Css.text : Css.muted, { fontStyle: 'bold' })));
      const effect = this.track(this.add.text(x + 14, y + rowH - (IS_PORTRAIT ? 14 : 9), r.id === 'unique' && lv >= max ? '最大まで強化済み' : r.effect, textStyle(11, Css.dim)).setOrigin(0, 1));
      const room = w - bw - 40;
      if (effect.width > room) effect.setScale(room / effect.width);
      if (lv < max) {
        // Facilities being raised read 建設中; the others show their price, waiting while every slot is taken.
        // The upper levels may need a medal first (#169).
        const medal = state === 'medal' ? facilityMedal(base.id, r.id, lv + 1) : undefined;
        const label = jobs.some((j) => j.id === r.id) ? '建設中…'
          : medal ? `Lv${lv + 1} 要勲章${IS_PORTRAIT ? '\n' : ' '}「${medalName(medal)}」`
            : `${lv === 0 ? '建設' : '強化'} ${facilityMinutes(r.id, lv + 1)}分${IS_PORTRAIT ? '\n' : '  '}${formatResources(cost)}`;
        this.track(new UIButton(this, x + w - 8 - bw / 2, y + (rowH - 6) / 2, label, () => this.build(base, r.id), {
          variant: state === 'ready' ? 'primary' : 'secondary', width: bw, height: rowH - 14, fontSize: IS_PORTRAIT ? 11 : 10,
        })).setEnabled(state === 'ready');
      }
      y += rowH;
    }
    if (jobs.length > 0) {
      // The one finishing first gets the live countdown; the line also says how many slots are in use.
      const job = [...jobs].sort((a, b) => a.endsAt - b.endsAt)[0];
      const label = `${rows.find((r) => r.id === job.id)?.name ?? job.id} Lv${job.level}  (建設中 ${jobs.length} / ${facilitySlots(facilities, base.id)})`;
      const t = this.track(this.add.text(x, footerTop, '', textStyle(13, Css.cyan)));
      this.timer = { text: t, endsAt: job.endsAt, label };
      t.setText(`建設中: ${label}  残り ${clock(job.endsAt - Date.now())}`);
    } else if (this.status) {
      this.track(this.add.text(x, footerTop, this.status, textStyle(13, Css.success)));
    }
  }

  /** 基地 (#373): where it is, the sea it opens, what its facilities give now, and the five facilities. */
  private buildForwardDetail(base: IBase): void {
    const progress = loadProgress();
    const d = L.detail;
    const x = d.x + 24;
    const w = d.w - 48;
    const open = isBaseOpen(base, progress);
    const facilities = progress.facilities;
    const state = baseState(base, progress);
    this.track(this.add.text(x, d.y + 18, open ? '開設済みの基地' : state === 'building' ? '工事中' : '未開設', eyebrowStyle(11, open ? Css.gold : Css.cyan)));
    const title = this.track(this.add.text(x, d.y + 38, base.name, displayStyle(22)));
    if (!open) {
      const work = baseWorkOf(base);
      const items = progress.items.fastBuild;
      const label = state === 'building' ? `高速建造材で完成 (所持 ${items})`
        : state === 'ready' || state === 'resources' ? `開設 ${work.minutes}分${IS_PORTRAIT ? '\n' : '  '}${formatResources(work.cost)}`
          : state === 'busy' ? '他の工事中' : baseLockText(base, progress);
      const enabled = state === 'ready' || (state === 'building' && items > 0);
      const workW = IS_PORTRAIT ? 300 : 340;
      this.track(new UIButton(this, d.x + d.w - 24 - workW / 2, d.y + 44, label, () => (state === 'building' ? this.rushWork() : this.startWork(base)), {
        variant: state === 'ready' ? 'gold' : 'secondary', width: workW, height: IS_PORTRAIT ? 60 : 40, fontSize: 12,
      })).setEnabled(enabled);
      const room = w - workW - 12;
      if (title.width > room) title.setScale(room / title.width);
    } else if (title.width > w) title.setScale(w / title.width);
    let y = Math.max(title.y + title.height + 10, !open && IS_PORTRAIT ? d.y + 80 : 0);
    const forward = openBases(progress).filter(isForward).map((b) => b.id);
    const shop = forwardTotal(facilities, 'frontShop', forward);
    const all = shop > 0 ? `研究費 −${Math.round(FRONT_SHOP.research * 100 * shop)}%・修理時間 −${Math.round(FRONT_SHOP.repair * 100 * shop)}% (前線工作所)` : 'なし';
    const info = this.track(this.add.text(x, y, `${base.note ?? ''}\n開く戦域: ${(base.theaters ?? []).map((t) => THEATER_NAME[t] ?? t).join('・')}\nこの基地の効果: ${forwardEffects(facilities, base.id)}${open ? '' : ' (開設すると働く)'}\n全基地の効果: ${all}`, textStyle(13, Css.muted, { lineSpacing: 4, wordWrap: { width: w, useAdvancedWrap: true } })));
    y = info.y + info.height + 12;
    const footerTop = d.y + d.h - 40;
    const rowH = Math.min(IS_PORTRAIT ? 70 : 44, Math.floor((footerTop - y - 20) / FORWARD_FACILITIES.length));
    const jobs = progress.facilityJobs.filter((j) => j.base === base.id);
    this.track(this.add.text(x, y, '基地の施設', eyebrowStyle(10, Css.gold)));
    y += 20;
    const bw = IS_PORTRAIT ? 250 : 290;
    for (const f of FORWARD_FACILITIES) {
      const lv = facilityLevel(facilities, base.id, f.id);
      const max = maxLevelOf(f.id);
      const fState = open ? facilityState(facilities, progress.facilityJobs, base.id, f.id, progress.resources, progress.record.medals) : 'busy';
      this.track(drawPanel(this.add.graphics(), x, y, w, rowH - 6, { radius: 10, fill: Colors.panel, fillAlpha: 0.45, rimAlpha: 0.12 }));
      this.track(this.add.text(x + 14, y + (IS_PORTRAIT ? 10 : 5), `${f.name}  Lv${lv} / ${max}`, textStyle(IS_PORTRAIT ? 14 : 13, lv > 0 ? Css.text : Css.muted, { fontStyle: 'bold' })));
      const effect = this.track(this.add.text(x + 14, y + rowH - (IS_PORTRAIT ? 14 : 9), f.effect, textStyle(11, Css.dim)).setOrigin(0, 1));
      const room = w - bw - 40;
      if (effect.width > room) effect.setScale(room / effect.width);
      if (lv < max) {
        const label = jobs.some((j) => j.id === f.id) ? '建設中…' : `${lv === 0 ? '建設' : '強化'} ${facilityMinutes(f.id, lv + 1)}分${IS_PORTRAIT ? '\n' : '  '}${formatResources(facilityCost(f.id, lv + 1))}`;
        this.track(new UIButton(this, x + w - 8 - bw / 2, y + (rowH - 6) / 2, label, () => this.build(base, f.id), {
          variant: fState === 'ready' ? 'primary' : 'secondary', width: bw, height: rowH - 14, fontSize: IS_PORTRAIT ? 11 : 10,
        })).setEnabled(fState === 'ready');
      }
      y += rowH;
    }
    if (jobs.length > 0) {
      const job = jobs[0];
      const label = `${FORWARD_FACILITIES.find((f) => f.id === job.id)?.name ?? job.id} Lv${job.level}`;
      const t = this.track(this.add.text(x, footerTop, '', textStyle(13, Css.cyan)));
      this.timer = { text: t, endsAt: job.endsAt, label };
      t.setText(`建設中: ${label}  残り ${clock(job.endsAt - Date.now())}`);
    } else if (this.status) {
      this.track(this.add.text(x, footerTop, this.status, textStyle(13, Css.success)));
    }
  }

  private startWork(base: IBase): void {
    const progress = loadProgress();
    const next = startBaseWork(progress, base, Date.now());
    if (!next) return;
    saveProgress(next, 'facility');
    this.status = `${base.name}の工事を始めました`;
    this.refresh();
  }

  private rushWork(): void {
    const progress = loadProgress();
    const name = nationBases(progress.nation).find((b) => b.id === progress.baseWork?.base)?.name ?? '軍港';
    const next = rushBaseWork(progress, Date.now());
    if (!next) return;
    // The item and the base opened count for their medal and quest (#314 #315).
    const opened = progress.baseWork?.base ?? '';
    saveProgress(withQuestEvents(next, [['fastBuildUse', 1], ['baseOpened', 1], ...(opened.includes('_fb_') ? [['forwardBaseOpened', 1] as [QuestEvent, number]] : [])], Date.now()));
    this.status = `${name}が${this.tab === 'forward' ? '開設' : '開港'}しました`;
    this.refresh();
  }

  build(base: IBase, id: FacilityId): void {
    const progress = loadProgress();
    const next = startFacility(progress, base.id, id, Date.now());
    if (!next) return;
    saveProgress(withQuestEvents(next, [['facility', 1]], Date.now()), 'facility');
    this.status = '';
    this.refresh();
  }
}
