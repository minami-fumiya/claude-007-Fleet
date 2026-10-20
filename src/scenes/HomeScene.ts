import Phaser from 'phaser';
import { clock } from '@/utils/TimeFormat';
import { nationLocks } from '@/systems/NationUnlock';
import { holdCap, regenRules } from '@/systems/FacilitySystem';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { audio } from '@/systems/AudioSystem';
import { SceneKeys } from '@/config/SceneKeys';
import { pendingSummary } from '@/systems/PendingSummary';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { DataLoader } from '@/utils/DataLoader';
import { awardPendingMedals, IProgress, isStarted, loadProgress, loadSave, saveProgress, saveSave, switchNation } from '@/utils/ProgressStore';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { Nation } from '@/types/Nation';
import { gainResources, lostNote, nextRegenMs, overflows, regenFull, resources } from '@/systems/ResourceSystem';
import { captainsLeft, recruitCaptains } from '@/systems/CaptainRoster';
import { ShipClass } from '@/types/ShipClass';
import { SKILL_LABEL } from '@/systems/CaptainSystem';
import { clearCount, fleetSlots, missionCount, missionText, nextRank, promotionText, RANK_MISSIONS, rankOf, RANKS } from '@/systems/RankSystem';
import { buildsHere, ownedIds, starterShip } from '@/systems/ShipyardSystem';
import { baseDockView, mergeBaseDocks, buildDock, completeRepairs, dockCount, FAST_REPAIR_COST, nextDock, hpFraction, isDocked, repairCost, repairTimeMs, startRepair, fastRepair } from '@/systems/DockSystem';
import { canAfford, formatResources, pay, scaleCost } from '@/systems/ResourceSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { IShipData } from '@/types/Ship';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawMeter, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { CAMPAIGN_AREA_KEY } from '@/scenes/CampaignMapScene';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { DEFAULT_HOME_TAB, HOME_MENU, homeTab, IHomeMenuItem } from '@/systems/HomeMenu';
import { baseOfProgress, currentBaseId, isAtCurrentBase, repairTimeMultiplier } from '@/systems/BaseSystem';
import {
  activeQuests, addItems, claimableCount, recordQuestEvent, QUESTS, formatItems, claimQuest, isClaimable, nextReset, QUEST_KIND_LABEL, QUEST_KINDS, questBoard, QuestKind, questProgress, QUESTS_SHOWN,
  gameDay, QuestStatus, questStatus, refreshQuests, withQuestEvents,
} from '@/systems/QuestSystem';
import { MEDALS } from '@/systems/RecordSystem';
import { daySchedule, eventLabel, nextEvent, WINDOWS_PER_DAY } from '@/systems/EventSystem';
import { activeEffects, activeEvent } from '@/utils/GameClock';
import { rankTable } from '@/systems/RankTable';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? {
      resources: { x: 16, y: 150, w: CANVAS_W - 32 } as { x: number; y: number; w: number },
      resourceCols: 2,
      /** Nation switch button + rank / promotion / regeneration lines */
      admiral: { x: 16, y: 272, w: CANVAS_W - 32, h: 90 } as IRect,
      menu: { x: 16, y: 374, w: CANVAS_W - 32, h: 196 } as IRect,
      menuCols: 4,
      dock: { x: 16, y: 584, w: CANVAS_W - 32, h: CANVAS_H - 600 } as IRect,
      rowH: 92,
    }
  : {
      resources: { x: 444, y: 96, w: 812 } as { x: number; y: number; w: number },
      resourceCols: 4,
      admiral: { x: 444, y: 158, w: 812, h: 48 } as IRect,
      menu: { x: 24, y: 96, w: 400, h: 600 } as IRect,
      menuCols: 1,
      dock: { x: 444, y: 216, w: 812, h: 480 } as IRect,
      rowH: 62,
    };

/** Registry key: the menu tab last opened (#61), kept while the game runs. */
const HOME_TAB_KEY = 'home.tab';
const MAX_DAMAGED_ROWS = IS_PORTRAIT ? 5 : 4;
/** Progress bar offset below a dock row's ship name; portrait text is taller, so the bar sits lower. */
const DOCK_METER_Y = IS_PORTRAIT ? 36 : 18;
/** Overlay (nation picker) draws above everything else on the screen. */
const OVERLAY_DEPTH = 200;

/** "1:02:03" */
function longClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 鎮守府: the home port hub. Shows resources, opens the sortie / arsenal / refit screens and runs the
 * docks, where damaged ships are repaired in real time (two at once) or instantly for a fee.
 */

/** 任務 tab (#158): a quest kind, or the promotion missions. */
type QuestTab = QuestKind | 'rank';

/** One row of the 任務 sheet. */
interface IQuestRow {
  id: string;
  name: string;
  text: string;
  value: number;
  goal: number;
  reward: string;
  status: QuestStatus;
  /** The reward would not all fit under the holding cap (#221) */
  overflow?: boolean;
}

export class HomeScene extends Phaser.Scene {
  private registryShips!: ShipRegistry;
  private bar!: ResourceBar;
  /** Dynamic dock / damage list objects, rebuilt on every change */
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private dockMeters: Array<{ g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; x: number; y: number; w: number; ship: IShipData; total: number; endsAt: number }> = [];
  private regenText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private questTab: QuestTab = 'daily';
  /** A quest whose reward overflows the holding cap, pressed once: the next press takes it anyway (#221). */
  private confirmClaim: string | null = null;
  /** What the last claim brought beyond resources (captains, #209), shown once on the quest board */
  private questNote = '';
  private eventText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.HOME });
  }

  create(): void {
    // First-play tutorial (#90): drawn above the screen, so it can be made first.
    new TutorialGuide(this);
    audio.music('menu');
    // Medals earned outside a battle (builds, facilities, an older version's progress) are handed out here (#92).
    awardPendingMedals();
    this.registryShips = DataLoader.getRegistry(this);
    this.dynamic = [];
    this.dockMeters = [];
    this.overlay = [];
    this.menuObjs = [];
    addBackdrop(this, 'menu');
    const save = loadSave();
    const started = isStarted(save, save.current);

    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  タイトル', () => this.scene.start(SceneKeys.MAIN_MENU), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    // Portrait: the corner buttons take the right side, so the eyebrow sits left of centre.
    const corner = IS_PORTRAIT ? { w: 100, h: 60, y: 46 } : { w: 120, h: 44, y: 44 };
    new UIButton(this, CANVAS_W - 16 - corner.w / 2, corner.y, '設定', () => this.scene.start(SceneKeys.SETTINGS, { returnTo: SceneKeys.HOME }), {
      variant: 'secondary', width: corner.w, height: corner.h, fontSize: 15,
    });
    new UIButton(this, CANVAS_W - 26 - corner.w * 1.5, corner.y, 'ヘルプ', () => this.scene.start(SceneKeys.HELP), {
      variant: 'secondary', width: corner.w, height: corner.h, fontSize: 15,
    });
    // The base in use (#88) names the screen; before a nation is picked it is just 鎮守府.
    const base = started ? baseOfProgress(loadProgress()) : undefined;
    const title = this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, `${NATION_INFO[save.current].jaShort} ${base?.name ?? '鎮守府'}`, displayStyle(24)).setOrigin(0.5);
    const room = IS_PORTRAIT ? CANVAS_W - 32 : CANVAS_W - 2 * 300;
    if (title.width > room) title.setScale(room / title.width);

    // Limited-time event (#89): what runs now, or what comes next.
    this.eventText = this.add.text(IS_PORTRAIT ? CANVAS_W / 2 : L.resources.x + L.resources.w / 2, IS_PORTRAIT ? 134 : 82, '', textStyle(12, Css.gold, { fontStyle: 'bold' })).setOrigin(0.5);
    // Today's events, window by window (#218).
    this.eventText.setInteractive({ useHandCursor: true }).on('pointerup', () => this.openEventSchedule(0));
    this.bar = new ResourceBar(this, L.resources.x, L.resources.y, L.resources.w, L.resourceCols);
    this.buildAdmiral(save.current);
    this.buildMenu();
    addPanel(this, L.dock.x, L.dock.y, L.dock.w, L.dock.h, { radius: 24, fillAlpha: 0.55, glow: 0.6 });
    this.add.text(L.dock.x + 22, L.dock.y + (IS_PORTRAIT ? 30 : 22), '入渠 — 損傷艦の修理', textStyle(15, Css.text, { fontStyle: 'bold' }));
    this.refresh();
    // A brand-new save has no nation yet: pick one first (#27).
    if (!started) this.openNationPicker(false);
    else showScreenHelp(this);
  }

  /** Nation switch button, rank and next promotion (#30), natural regeneration (#28). */
  private buildAdmiral(nation: Nation): void {
    const a = L.admiral;
    const progress = loadProgress();
    const rank = rankOf(progress);
    const bw = IS_PORTRAIT ? 200 : 170;
    new UIButton(this, a.x + bw / 2, a.y + a.h / 2, `${NATION_INFO[nation].jaShort}  ▸ 切替`, () => this.openNationPicker(true), {
      variant: 'primary', width: bw, height: IS_PORTRAIT ? 58 : 40, fontSize: 15,
    });
    const x = a.x + bw + 16;
    // Portrait: rank and next promotion on separate lines (one line would run off the narrow screen).
    const rankLine = `${rank.name}  ·  出撃枠 ${fleetSlots(progress)}`;
    if (IS_PORTRAIT) {
      this.add.text(x, a.y, rankLine, textStyle(12, Css.gold, { fontStyle: 'bold' }));
      this.add.text(x, a.y + a.h / 2, promotionText(progress), textStyle(11, Css.text)).setOrigin(0, 0.5);
    } else {
      this.add.text(x, a.y + 2, `${rankLine}  ·  ${promotionText(progress)}`, textStyle(12, Css.gold, { fontStyle: 'bold' }));
    }
    this.regenText = this.add.text(x, a.y + a.h - 2, '', textStyle(11, Css.muted)).setOrigin(0, 1);
  }

  private refreshRegen(now: number): void {
    const progress = loadProgress();
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    // Each resource regenerates at its own rate (0.0.12: fuel fastest).
    // Base facilities (#146) raise the rates and caps.
    const { perTick: r, cap } = regenRules(progress.facilities);
    const caps = cap.fuel === cap.ammo && cap.ammo === cap.steel ? String(cap.fuel) : `燃${cap.fuel} 弾${cap.ammo} 鋼${cap.steel}`;
    const rate = IS_PORTRAIT
      ? `自然回復/分 燃${r.fuel} 弾${r.ammo} 鋼${r.steel} ボ${r.bauxite}・上限 ${caps}`
      : `自然回復/分 燃料 +${r.fuel} 弾薬 +${r.ammo} 鋼材 +${r.steel} ボーキ +${r.bauxite}・上限 ${caps}`;
    this.regenText.setText(regenFull(progress.resources, cap) ? `${rate}  ·  上限に到達` : `${rate}  ·  次 ${clock(nextRegenMs(progress.regenAt, now))}`);
  }

  private refreshEvent(now: number): void {
    const event = activeEvent(now);
    if (event) {
      this.eventText.setText(`開催中: ${eventLabel(event)}  あと ${longClock(event.endsAt - now)}  ·  予定 ›`).setColor(Css.gold);
      return;
    }
    const next = nextEvent(now);
    this.eventText.setText(next ? `次のイベント: ${eventLabel(next)}  ${longClock(next.startsAt - now)} 後` : '').setColor(Css.muted);
  }

  /** Today's (or, with `ahead` 1, tomorrow's) eight event windows, 00:00〜24:00 JST (#218). */
  openEventSchedule(ahead: number): void {
    this.closeNationPicker();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(OVERLAY_DEPTH);
      this.overlay.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const rowH = IS_PORTRAIT ? 60 : 42;
    const w = IS_PORTRAIT ? CANVAS_W - 32 : 640;
    const head = IS_PORTRAIT ? 150 : 112;
    const h = head + WINDOWS_PER_DAY * rowH + (IS_PORTRAIT ? 100 : 72);
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(8, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 24, y + 20, 'イベントの予定 (日本時間)', eyebrowStyle(11)));
    add(this.add.text(x + 24, y + (IS_PORTRAIT ? 44 : 40), ahead === 0 ? '今日のイベント' : '明日のイベント', displayStyle(IS_PORTRAIT ? 20 : 18)));
    const tw = IS_PORTRAIT ? 150 : 120;
    ['今日', '明日'].forEach((label, i) => add(new UIButton(this, x + w - 24 - (1 - i) * (tw + 8) - tw / 2, y + (IS_PORTRAIT ? 58 : 46), label, () => this.openEventSchedule(i), {
      variant: i === ahead ? 'primary' : 'secondary', width: tw, height: IS_PORTRAIT ? 48 : 36, fontSize: 14,
    })));
    const now = Date.now();
    daySchedule(gameDay(now) + ahead).forEach((e, i) => {
      const ry = y + head + i * rowH;
      const live = e.startsAt <= now && now < e.endsAt;
      if (live) {
        const g = add(this.add.graphics());
        g.fillStyle(Colors.gold, 0.16);
        g.fillRoundedRect(x + 12, ry - 6, w - 24, rowH - 4, 8);
      }
      const css = live ? Css.gold : e.endsAt <= now ? Css.dim : Css.text;
      add(this.add.text(x + 28, ry, `${String(i * 3).padStart(2, '0')}:00〜${String(i * 3 + 3).padStart(2, '0')}:00`, textStyle(IS_PORTRAIT ? 15 : 13, css)));
      add(this.add.text(x + (IS_PORTRAIT ? 190 : 170), ry, `${eventLabel(e)}${live ? '  (開催中)' : ''}`, textStyle(IS_PORTRAIT ? 15 : 13, css, { fontStyle: 'bold' })));
    });
    add(new UIButton(this, x + w / 2, y + h - (IS_PORTRAIT ? 44 : 32), '閉じる', () => this.closeNationPicker(), {
      variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: IS_PORTRAIT ? 56 : 40, fontSize: 15,
    }));
  }

  /** Lists every playable nation; picking one switches the base (a new nation starts with one destroyer). */
  private openNationPicker(closable: boolean): void {
    if (this.overlay.length > 0) return;
    const save = loadSave();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(OVERLAY_DEPTH);
      this.overlay.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const rowH = IS_PORTRAIT ? 84 : 52;
    const gap = IS_PORTRAIT ? 12 : 8;
    const w = IS_PORTRAIT ? CANVAS_W - 64 : 620;
    const h = (IS_PORTRAIT ? 230 : 150) + PLAYABLE_NATIONS.length * (rowH + gap) + (closable ? rowH : 0);
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(20, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.95, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '国を選択', eyebrowStyle(11)));
    add(this.add.text(x + 28, y + (IS_PORTRAIT ? 52 : 42), closable ? '鎮守府を切り替える' : '着任する国を選んでください', displayStyle(22)));
    add(this.add.text(x + 28, y + (IS_PORTRAIT ? 104 : 80), '国ごとに資源・保有艦・研究・作戦の進み具合が別々に記録されます。\n新しい国は駆逐艦 1 隻・資源 0 から始まり、資源は時間で回復します。', textStyle(12, Css.muted, { wordWrap: { width: w - 56, useAdvancedWrap: true } })));
    let ry = y + (IS_PORTRAIT ? 210 : 136);
    // Nations open step by step (#134): locked ones show what opens them.
    const locks = nationLocks(save.nations);
    for (const n of PLAYABLE_NATIONS) {
      const np = save.nations[n];
      const lock = locks[n];
      const label = np
        ? `${NATION_INFO[n].jaShort}   ${rankOf(np).name} · 攻略 ${clearCount(np)} · 保有艦 ${ownedIds(np, this.registryShips.byNation(n)).length}`
        : lock.unlocked ? `${NATION_INFO[n].jaShort}   新規着任` : `${NATION_INFO[n].jaShort}   未解放`;
      add(new UIButton(this, x + w / 2, ry + rowH / 2, label, () => this.selectNation(n), {
        variant: n === save.current && np ? 'gold' : np ? 'primary' : 'secondary', width: w - 56, height: rowH, fontSize: 16,
        caption: lock.unlocked ? undefined : [lock.condition, lock.progress].filter((t) => t).join('  ·  '),
      })).setEnabled(lock.unlocked);
      ry += rowH + gap;
    }
    if (closable) {
      add(new UIButton(this, x + w / 2, ry + rowH / 2, '閉じる', () => this.closeNationPicker(), {
        variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: rowH - 8, fontSize: 15,
      }));
    }
  }

  /**
   * 任務 (#52 #158): one tab at a time — 毎時 / デイリー / ウィークリー / 戦果, and the promotion missions (#142). At
   * most 10 rows, coloured by state: claimable gold, in progress cyan with a bar, not started grey, claimed dimmed.
   * Landscape lays the rows out in two columns.
   */
  private openQuests(tab: QuestTab = this.questTab): void {
    this.closeNationPicker();
    this.questTab = tab;
    const now = Date.now();
    const progress = loadProgress();
    const state = refreshQuests(progress.quests, now);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(OVERLAY_DEPTH);
      this.overlay.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const cap = holdCap(progress.facilities);
    const rows: IQuestRow[] = tab === 'rank' ? this.rankMissionRows(progress) : questBoard(state, tab, now).map((q) => {
      const status = questStatus(state, q);
      const medal = q.medal ? MEDALS.find((m) => m.id === q.medal)?.name : undefined;
      // A reward that would overflow the holding cap (#221) waits unclaimed until there is room, or is taken anyway.
      const lost = status === 'claimable' ? gainResources(progress.resources, q.reward, cap).lost : resources();
      const reward = [formatResources(q.reward), formatItems(q.items ?? {}), q.captains ? `艦長 +${q.captains}` : '', medal ? `勲章「${medal}」` : ''].filter((t) => t).join('・') + lostNote(lost);
      return { id: q.id, name: q.name, text: q.text, value: questProgress(state, q), goal: q.goal, reward, status, overflow: lostNote(lost) !== '' };
    });
    const cols = IS_PORTRAIT ? 1 : 2;
    const perCol = Math.ceil(QUESTS_SHOWN.once / cols);
    const rowH = IS_PORTRAIT ? 92 : 78;
    const gap = IS_PORTRAIT ? 6 : 8;
    const w = IS_PORTRAIT ? CANVAS_W - 48 : 1200;
    const head = IS_PORTRAIT ? 150 : 128;
    const h = head + perCol * (rowH + gap) + (IS_PORTRAIT ? 86 : 62);
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(16, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 28, y + 22, '任務', eyebrowStyle(11)));
    const next = nextRank(progress);
    const note = tab === 'once' ? '1 回限り・達成で勲章がもらえるものも'
      : tab === 'rank' ? (next ? `次の階級: ${next.rank.name}` : '最高の階級です')
        : `更新まで ${longClock(nextReset(tab, now) - now)}`;
    add(this.add.text(x + w - 28, y + 22, note, textStyle(12, Css.muted)).setOrigin(1, 0));
    // Captains a claim just brought (#209), once.
    if (this.questNote) {
      const t = add(this.add.text(x + 28, y + 40, this.questNote, textStyle(12, Css.gold)));
      if (t.width > w - 56) t.setScale((w - 56) / t.width);
      this.questNote = '';
    }
    const tabs: QuestTab[] = [...QUEST_KINDS, 'rank'];
    const tw = (w - 56 - 8 * (tabs.length - 1)) / tabs.length;
    const tabH = IS_PORTRAIT ? 52 : 40;
    tabs.forEach((k, i) => {
      const n = k === 'rank' ? 0 : activeQuests(k, now).filter((q) => isClaimable(state, q)).length;
      const label = k === 'rank' ? '昇進' : QUEST_KIND_LABEL[k];
      // The hourly tab tells when its quests turn over (#180).
      const caption = k === 'hourly' ? `あと ${Math.ceil((nextReset('hourly', now) - now) / 60_000)} 分` : undefined;
      add(new UIButton(this, x + 28 + i * (tw + 8) + tw / 2, y + (IS_PORTRAIT ? 64 : 56) + tabH / 2, n > 0 ? `${label} (${n})` : label, () => this.openQuests(k), {
        variant: k === tab ? 'primary' : 'secondary', width: tw, height: tabH, fontSize: IS_PORTRAIT ? 14 : 15, caption,
      }));
    });
    const colW = (w - 56 - 16 * (cols - 1)) / cols;
    const bw = IS_PORTRAIT ? 140 : 120;
    rows.forEach((r, i) => {
      const rx = x + 28 + Math.floor(i / perCol) * (colW + 16);
      const ry = y + head + (i % perCol) * (rowH + gap);
      const claimed = r.status === 'claimed';
      const color = r.status === 'claimable' ? Css.gold : r.status === 'progress' ? Css.cyan : Css.dim;
      add(addPanel(this, rx, ry, colW, rowH, { radius: 14, fillAlpha: claimed ? 0.2 : 0.5, rim: r.status === 'claimable' ? Colors.gold : r.status === 'progress' ? Colors.cyan : undefined }));
      const tx = rx + 16;
      const textW = colW - 32 - bw - 12;
      add(this.add.text(tx, ry + 8, r.name, textStyle(15, claimed ? Css.dim : r.status === 'idle' ? Css.muted : Css.text, { fontStyle: 'bold' })));
      add(this.add.text(tx + textW, ry + 12, `${Math.min(r.goal, r.value)} / ${r.goal}`, textStyle(12, color)).setOrigin(1, 0));
      // Description and reward stay left of the status button (long weekly rewards ran under it in portrait).
      const fit = <T extends Phaser.GameObjects.Text>(t: T): T => (t.width > textW ? t.setScale(textW / t.width) : t);
      add(fit(this.add.text(tx, ry + (IS_PORTRAIT ? 38 : 32), r.text, textStyle(11, claimed ? Css.dim : Css.muted))));
      drawMeter(add(this.add.graphics()), tx, ry + rowH - (IS_PORTRAIT ? 30 : 27), textW, 4, r.value / r.goal, r.status === 'claimable' ? Colors.gold : claimed ? Colors.muted : Colors.cyan);
      if (r.reward) add(fit(this.add.text(tx, ry + rowH - 8, r.reward, textStyle(11, claimed ? Css.dim : r.overflow ? Css.danger : Css.gold)).setOrigin(0, 1)));
      const claimLabel = !r.overflow ? '受け取る' : this.confirmClaim === r.id ? 'あふれても\n受け取る' : '上限で保留';
      const label = { claimable: claimLabel, progress: '進行中', idle: '未着手', claimed: '✓ 受取済' }[r.status];
      const btn = add(new UIButton(this, rx + colW - 12 - bw / 2, ry + rowH / 2, tab === 'rank' && claimed ? '✓ 達成' : label, () => this.claimQuest(r.id), {
        variant: r.status === 'claimable' ? 'gold' : 'secondary', width: bw, height: rowH - 24, fontSize: 14,
      })).setEnabled(r.status === 'claimable' && tab !== 'rank');
      if (claimed) btn.setAlpha(0.5);
    });
    if (rows.length === 0) add(this.add.text(x + w / 2, y + head + 40, '表示できる任務はありません', textStyle(14, Css.muted)).setOrigin(0.5, 0));
    // まとめて受け取る (#180): every finished one that fits under the holding cap.
    const ready = tab === 'rank' ? [] : rows.filter((r) => r.status === 'claimable' && !r.overflow).map((r) => r.id);
    const bw2 = IS_PORTRAIT ? 260 : 200;
    const by = y + h - (IS_PORTRAIT ? 48 : 36);
    const both = ready.length > 0;
    add(new UIButton(this, x + w / 2 + (both ? bw2 / 2 + 8 : 0), by, '閉じる', () => {
      this.closeNationPicker();
      this.buildMenu();
    }, { variant: 'secondary', width: bw2, height: IS_PORTRAIT ? 60 : 44, fontSize: 15 }));
    if (both) {
      add(new UIButton(this, x + w / 2 - bw2 / 2 - 8, by, `まとめて受け取る (${ready.length})`, () => this.claimAll(ready), {
        variant: 'gold', width: bw2, height: IS_PORTRAIT ? 60 : 44, fontSize: 15,
      }));
    }
  }

  /** The promotion missions (#142) of the ranks ahead, for the 昇進 tab (#158). */
  private rankMissionRows(progress: IProgress): IQuestRow[] {
    const current = rankOf(progress).index;
    const rows: IQuestRow[] = [];
    for (const [index, missions] of Object.entries(RANK_MISSIONS)) {
      if (Number(index) <= current) continue;
      for (const m of missions ?? []) {
        const value = Math.min(m.goal, missionCount(progress, m.stat));
        rows.push({
          id: `${index}_${m.stat}`, name: `${RANKS[Number(index)].name}への昇進任務`, text: m.text, value, goal: m.goal, reward: '',
          status: value >= m.goal ? 'claimed' : value > 0 ? 'progress' : 'idle',
        });
      }
    }
    return rows.slice(0, QUESTS_SHOWN.once);
  }

  /** Every rank (#128): merit needed, sortie slots, ship grade and what it opens; the current one highlighted. */
  private openRanks(): void {
    this.closeNationPicker();
    const progress = loadProgress();
    const current = rankOf(progress);
    const rows = rankTable(progress.nation);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(OVERLAY_DEPTH);
      this.overlay.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep, 0.85).setOrigin(0, 0).setInteractive());
    const rowH = IS_PORTRAIT ? 66 : 38;
    const w = IS_PORTRAIT ? CANVAS_W - 32 : 900;
    const head = IS_PORTRAIT ? 120 : 88;
    const h = head + rows.length * rowH + (IS_PORTRAIT ? 110 : 78);
    const x = (CANVAS_W - w) / 2;
    const y = Math.max(8, (CANVAS_H - h) / 2);
    add(addPanel(this, x, y, w, h, { radius: 24, fillAlpha: 0.96, glow: 0.8 }));
    add(this.add.text(x + 24, y + 20, '階級一覧', eyebrowStyle(11)));
    add(this.add.text(x + 24, y + (IS_PORTRAIT ? 44 : 40), `現在: ${current.name}  ·  戦功 ${Math.floor(progress.merit ?? 0)}`, displayStyle(IS_PORTRAIT ? 20 : 18)));
    const cols = IS_PORTRAIT ? [0, 150, 270, 380] : [0, 150, 260, 350, 440];
    const hy = y + head - (IS_PORTRAIT ? 26 : 22);
    const labels = ['階級', '必要戦功', '出撃枠', '建造', ...(IS_PORTRAIT ? [] : ['解放されるもの'])];
    labels.forEach((l, i) => add(this.add.text(x + 24 + cols[i], hy, l, textStyle(11, Css.muted))));
    rows.forEach((r, i) => {
      const ry = y + head + i * rowH;
      const here = r.index === current.index;
      if (here) {
        const g = add(this.add.graphics());
        g.fillStyle(Colors.gold, 0.16);
        g.fillRoundedRect(x + 12, ry - 2, w - 24, rowH - 2, 8);
      }
      const css = here ? Css.gold : r.index < current.index ? Css.text : r.beforeStart ? Css.dim : Css.muted;
      const name = r.beforeStart ? `${r.name} *` : r.name;
      add(this.add.text(x + 24 + cols[0], ry + 4, name, textStyle(IS_PORTRAIT ? 15 : 13, css, { fontStyle: 'bold' })));
      add(this.add.text(x + 24 + cols[1], ry + 4, String(r.minMerit), textStyle(IS_PORTRAIT ? 14 : 13, css)));
      add(this.add.text(x + 24 + cols[2], ry + 4, `${r.slots} 隻`, textStyle(IS_PORTRAIT ? 14 : 13, css)));
      add(this.add.text(x + 24 + cols[3], ry + 4, `格 ${r.grade}`, textStyle(IS_PORTRAIT ? 14 : 13, css)));
      // Promotion missions (#142) first: done (✓) or how far along.
      const missions = (RANK_MISSIONS[r.index] ?? []).map((m) => (missionCount(progress, m.stat) >= m.goal || r.index <= current.index ? `✓ ${m.text}` : `任務: ${missionText(m, progress)}`));
      // Each promotion ahead brings a captain while any is left to join (#179).
      const ahead = r.index - current.index;
      const captain = ahead > 0 && ahead <= captainsLeft(progress.nation, progress.captains) ? '艦長 +1' : '';
      const extra = [...missions, r.unlocks, captain].filter((t) => t).join('  ·  ');
      if (extra) {
        const ux = IS_PORTRAIT ? x + 24 : x + 24 + cols[4];
        const t = add(this.add.text(ux, IS_PORTRAIT ? ry + 32 : ry + 5, extra, textStyle(11, missions.some((m) => m.startsWith('任務')) ? Css.cyan : css)));
        const room = IS_PORTRAIT ? w - 48 : w - 48 - cols[4];
        if (t.width > room) t.setScale(room / t.width);
      }
    });
    add(this.add.text(x + 24, y + head + rows.length * rowH + 4, '* 士官候補生はチュートリアル実装後の開始階級です (今は准尉から始まります)。', textStyle(11, Css.dim)));
    add(new UIButton(this, x + w / 2, y + h - (IS_PORTRAIT ? 40 : 28), '閉じる', () => this.closeNationPicker(), {
      variant: 'secondary', width: IS_PORTRAIT ? 260 : 200, height: IS_PORTRAIT ? 56 : 40, fontSize: 15,
    }));
  }

  private claimQuest(id: string): void {
    const progress = loadProgress();
    const quest = QUESTS.find((q) => q.id === id);
    // The first press on an overflowing reward only asks (#221): the quest stays claimable until there is room.
    if (quest && overflows(progress.resources, quest.reward, holdCap(progress.facilities)) && this.confirmClaim !== id) {
      this.confirmClaim = id;
      this.openQuests(this.questTab);
      return;
    }
    this.confirmClaim = null;
    const r = this.claimOne(progress, id);
    if (!r) return;
    this.questNote = r.note;
    saveProgress(r.progress, 'quest');
    this.refresh();
    this.openQuests();
  }

  /**
   * まとめて受け取る (#180): every finished quest of the tab whose reward fits under the holding cap. Those that would
   * overflow stay, to be taken one by one.
   */
  private claimAll(ids: string[]): void {
    let progress = loadProgress();
    const notes: string[] = [];
    let n = 0;
    for (const id of ids) {
      const quest = QUESTS.find((q) => q.id === id);
      if (!quest || overflows(progress.resources, quest.reward, holdCap(progress.facilities))) continue;
      const r = this.claimOne(progress, id);
      if (!r) continue;
      progress = r.progress;
      n++;
      if (r.note) notes.push(r.note);
    }
    if (n === 0) return;
    this.confirmClaim = null;
    this.questNote = [`${n} 件受け取りました`, ...notes].join('  ·  ');
    saveProgress(progress, 'quest');
    this.refresh();
    this.openQuests();
  }

  /** One quest's reward added to `progress`, with a line about captains it brought (#209); null when not claimable. */
  private claimOne(progress: IProgress, id: string): { progress: IProgress; note: string } | null {
    const r = claimQuest(progress.quests, id, Date.now());
    if (!r) return null;
    // A ladder quest's medal (#158) goes into the shared record with the reward.
    const record = r.medal && !progress.record.medals.includes(r.medal) ? { ...progress.record, medals: [...progress.record.medals, r.medal] } : progress.record;
    let next: IProgress = { ...progress, record, quests: recordQuestEvent(r.state, 'questClaim', Date.now()), resources: gainResources(progress.resources, r.reward, holdCap(progress.facilities)).resources, items: addItems(progress.items, r.items) };
    let note = '';
    // Some quests bring a captain (#209), chosen like any recruit: for the classes the fleet is short of.
    if (r.captains > 0) {
      const roster = this.registryShips.byNation(next.nation);
      const classes = ownedIds(next, roster).map((sid) => roster.find((s) => s.id === sid)?.shipClass).filter((c): c is ShipClass => c !== undefined);
      const rec = recruitCaptains(next, r.captains, classes);
      next = rec.joined.length > 0 ? withQuestEvents(rec.progress, [['captainJoin', rec.joined.length]], Date.now()) : rec.progress;
      note = [
        rec.joined.length > 0 ? `新しい艦長: ${rec.joined.map((c) => `${c.name} (${SKILL_LABEL[c.skill]})`).join('・')}` : '',
        rec.books > 0 ? `艦長教本 +${rec.books}` : '',
      ].filter((t) => t).join('  ·  ');
    }
    return { progress: next, note };
  }

  private closeNationPicker(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  private selectNation(nation: Nation): void {
    if (!nationLocks(loadSave().nations)[nation].unlocked) return;
    const starter = starterShip(this.registryShips.byNation(nation));
    saveSave(switchNation(loadSave(), nation, starter?.id, Date.now()));
    // The fleet selection belongs to the previous nation.
    this.registry.remove(CAMPAIGN_AREA_KEY);
    this.scene.restart();
  }

  update(): void {
    const now = Date.now();
    // Nothing runs until a nation is picked.
    const save = loadSave();
    if (!isStarted(save, save.current)) return;
    this.refreshRegen(now);
    this.refreshEvent(now);
    const progress = loadProgress();
    const done = completeRepairs(progress, now);
    if (done !== progress) {
      saveProgress({ ...progress, ...done });
      this.refresh();
      return;
    }
    for (const m of this.dockMeters) {
      const left = m.endsAt - now;
      m.g.clear();
      drawMeter(m.g, m.x, m.y, m.w, 8, m.total > 0 ? 1 - left / m.total : 1, Colors.cyan);
      m.t.setText(`残り ${clock(left)}`);
    }
  }

  /** Four tabs (#61) over the screens of the chosen one. */
  private buildMenu(): void {
    for (const o of this.menuObjs) o.destroy();
    this.menuObjs = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.menuObjs.push(o);
      return o;
    };
    const m = L.menu;
    const gap = IS_PORTRAIT ? 10 : 12;
    const active = homeTab(this.registry.get(HOME_TAB_KEY) ?? DEFAULT_HOME_TAB);
    const tabH = IS_PORTRAIT ? 56 : 48;
    const tw = (m.w - 8 * (HOME_MENU.length - 1)) / HOME_MENU.length;
    HOME_MENU.forEach((t, i) => {
      add(new UIButton(this, m.x + i * (tw + 8) + tw / 2, m.y + tabH / 2, t.label, () => {
        this.registry.set(HOME_TAB_KEY, t.id);
        this.buildMenu();
      }, { variant: t.id === active.id ? 'primary' : 'secondary', width: tw, height: tabH, fontSize: IS_PORTRAIT ? 17 : 16 }));
    });
    const top = m.y + tabH + gap;
    const items = active.items;
    // Portrait: one row across; landscape: a column down the left side.
    const cols = IS_PORTRAIT ? items.length : 1;
    const rows = Math.ceil(items.length / cols);
    const slots = IS_PORTRAIT ? cols : Math.max(rows, 4);
    const cw = IS_PORTRAIT ? (m.w - gap * (cols - 1)) / cols : m.w;
    const ch = IS_PORTRAIT ? m.y + m.h - top : (m.y + m.h - top - gap * (slots - 1)) / slots;
    // 任務 (#52): rewards waiting show on the button.
    const claimable = claimableCount(loadProgress().quests, Date.now());
    // お知らせ (#192): the screens with something waiting say so in their caption, like 任務 does.
    const pending = pendingSummary(loadProgress(), Date.now(), 0).filter((p) => p.id !== 'quests' && p.id !== 'docks');
    items.forEach((item, i) => {
      const x = m.x + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      const ready = item.action === 'quests' && claimable > 0;
      const waiting = item.action ? undefined : pending.find((p) => p.scene === item.scene);
      add(new UIButton(this, x + cw / 2, y + ch / 2, item.label, () => this.openMenuItem(item), {
        variant: ready ? 'gold' : item.variant, width: cw, height: ch, fontSize: IS_PORTRAIT ? 22 : 26,
        caption: ready ? `達成 ${claimable}` : waiting ? `${waiting.label} ${waiting.count}` : item.caption,
      }));
    });
  }

  /**
   * お知らせ (#192): a chip for each thing waiting on the admiral, at the top of the dock panel; a tap goes there.
   * Portrait: a row under the panel title; landscape: right of it.
   */
  private drawPending(progress: IProgress, freeDocks: number, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const items = pendingSummary(progress, Date.now(), freeDocks);
    if (items.length === 0) return;
    const d = L.dock;
    const h = 26;
    const gap = 6;
    const y = d.y + (IS_PORTRAIT ? 69 : 22);
    const right = d.x + d.w - 22;
    const left = IS_PORTRAIT ? d.x + 22 : d.x + 260;
    const w = Math.min(IS_PORTRAIT ? 150 : 120, (right - left - gap * (items.length - 1)) / items.length);
    items.forEach((it, i) => {
      const x = (IS_PORTRAIT ? left : right - items.length * (w + gap) + gap) + i * (w + gap) + w / 2;
      add(new UIButton(this, x, y, `${it.label} ${it.count}`, () => {
        if (it.id === 'quests') this.openQuests();
        else this.scene.start(it.scene, { returnTo: SceneKeys.HOME });
      }, { variant: it.id === 'quests' ? 'gold' : 'primary', width: w, height: h, fontSize: 12 }));
    });
  }

  private openMenuItem(item: IHomeMenuItem): void {
    if (item.action === 'quests') {
      this.openQuests();
      return;
    }
    if (item.action === 'ranks') {
      this.openRanks();
      return;
    }
    // Free battles are not campaign sorties.
    if (item.scene === SceneKeys.FLEET_BUILDER) this.registry.remove(CAMPAIGN_AREA_KEY);
    this.scene.start(item.scene, { returnTo: SceneKeys.HOME, ...item.data });
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    this.dockMeters = [];
    const all = { ...loadProgress(), ...completeRepairs(loadProgress(), Date.now()) };
    // The docks and damaged ships of the base the admiral is at (#145).
    const here = currentBaseId(all);
    const progress = baseDockView(all, here);
    this.bar.refresh(progress.resources, holdCap(progress.facilities));
    if (this.regenText) this.refreshRegen(Date.now());

    const d = L.dock;
    const pad = 22;
    let y = d.y + (IS_PORTRAIT ? 86 : 66);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dynamic.push(o);
      return o;
    };

    // The base (#88) and 入渠半額 (#89) shorten repairs; the event also halves their cost.
    const event = activeEffects();
    const repairMul = repairTimeMultiplier(baseOfProgress(progress)) * event.repairMul;
    // Docks (#38), shared by repairs and builds since #211: a summary line, then a row per repair.
    const docks = dockCount(progress);
    const building = buildsHere(all).length;
    const used = progress.docks.length + building;
    this.drawPending(all, Math.max(0, docks - used), add);
    add(this.add.text(d.x + pad, y, 'ドック', eyebrowStyle(10, Css.gold)));
    add(this.add.text(d.x + pad + 110, y - 2, `使用中 ${used} / ${docks}  ·  入渠 ${progress.docks.length}・建造 ${building}  ·  空き ${Math.max(0, docks - used)}`, textStyle(13, used >= docks ? Css.gold : Css.muted)));
    y += IS_PORTRAIT ? 48 : 36;
    // Up to eight docks (#211): only so many repair rows fit above the damaged list; the rest are counted.
    const repairRows = Math.min(progress.docks.length, IS_PORTRAIT ? 3 : 4);
    for (let i = 0; i < repairRows; i++) {
      const job = progress.docks[i];
      add(this.add.text(d.x + pad, y, `入渠 ${i + 1}`, eyebrowStyle(10, Css.gold)));
      const ship = this.registryShips.byId(job.shipId);
      if (ship) {
        add(this.add.text(d.x + pad + 110, y - 2, ship.name, textStyle(14, Css.text, { fontStyle: 'bold' })));
        const total = repairTimeMs(ship.hp, hpFraction(progress, ship.id), repairMul, ship.shipClass);
        const meterX = d.x + pad + 110;
        const meterW = d.w - pad * 2 - 110 - (IS_PORTRAIT ? 200 : 260);
        const g = add(this.add.graphics());
        // Portrait: the 高速修理 button takes the right end of the row, so the remaining time
        // goes on its own line under the progress bar (#22). Landscape keeps it right of the bar.
        const t = add(
          IS_PORTRAIT
            ? this.add.text(meterX, y + DOCK_METER_Y + 14, '', textStyle(12, Css.muted))
            : this.add.text(meterX + meterW + 12, y + 22, '', textStyle(12, Css.muted)).setOrigin(0, 0.5),
        );
        this.dockMeters.push({ g, t, x: meterX, y: y + DOCK_METER_Y, w: meterW, ship, total, endsAt: job.endsAt });
        // A 高速修理材 (#143) is used first; without one the repair is paid in resources.
        const items = progress.items.fastRepair;
        const affordable = items > 0 || canAfford(progress.resources, FAST_REPAIR_COST);
        const btn = add(
          new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + (IS_PORTRAIT ? 34 : 10), items > 0 ? `高速修理材 (${items})` : '高速修理', () => this.fastRepair(ship.id), {
            variant: 'primary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 48 : 34, fontSize: 13,
          }),
        );
        btn.setEnabled(affordable);
      }
      y += IS_PORTRAIT ? 100 : 52;
    }
    if (progress.docks.length > repairRows) {
      add(this.add.text(d.x + pad + 110, y, `ほか ${progress.docks.length - repairRows} 隻入渠中`, textStyle(12, Css.muted)));
      y += IS_PORTRAIT ? 36 : 26;
    }
    const next = nextDock(progress);
    if (next) {
      const label = `第${docks + 1}ドック増設  ${formatResources(next.cost)}`;
      add(this.add.text(d.x + pad, y + (IS_PORTRAIT ? 14 : 8), next.state === 'rank' ? `第${docks + 1}ドック: ${next.rankName}に昇進すると増設できます` : label, textStyle(12, next.state === 'rank' ? Css.dim : Css.muted)).setOrigin(0, 0.5));
      if (next.state !== 'rank') {
        add(new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + (IS_PORTRAIT ? 14 : 8), '増設', () => this.buildDock(), {
          variant: 'primary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 48 : 30, fontSize: 13,
        })).setEnabled(next.state === 'ready');
      }
      y += IS_PORTRAIT ? 48 : 30;
    }
    add(this.add.text(d.x + pad, y, `高速修理: 高速修理材 1 個 (所持 ${progress.items.fastRepair})、なければ ${formatResources(FAST_REPAIR_COST)}`, textStyle(11, Css.dim)));
    y += IS_PORTRAIT ? 40 : 28;

    // Damaged ships waiting for a dock
    const damagedAll = Object.keys(progress.damage)
      .map((id) => this.registryShips.byId(id))
      .filter((s): s is IShipData => s !== undefined && !isDocked(all, s.id));
    const damaged = damagedAll.filter((s) => isAtCurrentBase(all, s.id));
    const elsewhere = damagedAll.length - damaged.length;
    add(this.add.text(d.x + pad, y, damaged.length > 0 ? '損傷艦' : '損傷艦はありません', eyebrowStyle(10, damaged.length > 0 ? Css.danger : Css.muted)));
    y += IS_PORTRAIT ? 36 : 26;
    const dockFree = used < docks;
    // Portrait: only as many rows as fit above the panel's bottom edge, leaving room for 他 n 隻.
    const fit = (reserve: number): number => Math.max(1, Math.min(MAX_DAMAGED_ROWS, Math.floor((d.y + d.h - y - reserve) / L.rowH)));
    const maxRows = !IS_PORTRAIT ? MAX_DAMAGED_ROWS : damaged.length <= fit(0) ? fit(0) : fit(40);
    for (const ship of damaged.slice(0, maxRows)) {
      const f = hpFraction(progress, ship.id);
      const cost = scaleCost(repairCost(ship.hp, f), event.repairMul);
      add(this.add.text(d.x + pad, y, ship.name, textStyle(14, Css.text, { fontStyle: 'bold' })));
      add(this.add.text(d.x + pad, y + (IS_PORTRAIT ? 30 : 22), `HP ${Math.round(ship.hp * f)} / ${ship.hp}  ·  ${clock(repairTimeMs(ship.hp, f, repairMul, ship.shipClass))}  ·  ${formatResources(cost)}`, textStyle(11, Css.muted)));
      const btn = add(
        new UIButton(this, d.x + d.w - pad - (IS_PORTRAIT ? 80 : 90), y + 14, '入渠', () => this.dock(ship), {
          variant: 'secondary', width: IS_PORTRAIT ? 160 : 180, height: IS_PORTRAIT ? 52 : 34, fontSize: 14,
        }),
      );
      // A ship out on an unfinished sortie (#138) can't be docked until it comes home.
      const away = (progress.sortie?.shipIds ?? []).includes(ship.id);
      if (away) btn.setLabel('出撃中');
      btn.setEnabled(!away && dockFree && canAfford(progress.resources, cost));
      y += L.rowH;
    }
    if (damaged.length > maxRows || elsewhere > 0) {
      const more = [damaged.length > maxRows ? `他 ${damaged.length - maxRows} 隻` : '', elsewhere > 0 ? `他の軍港の損傷艦 ${elsewhere} 隻 (その軍港で入渠)` : ''].filter((t) => t);
      add(this.add.text(d.x + pad, y, more.join('  ·  '), textStyle(12, Css.dim)));
    }
  }

  private buildDock(): void {
    const progress = loadProgress();
    const here = currentBaseId(progress);
    const built = buildDock(baseDockView(progress, here));
    if (!built) return;
    saveProgress(mergeBaseDocks(progress, here, built), 'dock');
    this.refresh();
  }

  private dock(ship: IShipData): void {
    const progress = loadProgress();
    const f = hpFraction(progress, ship.id);
    const event = activeEffects();
    const paid = pay(progress.resources, scaleCost(repairCost(ship.hp, f), event.repairMul));
    const here = currentBaseId(progress);
    // Builds at this base hold docks too (#211).
    const docked = paid ? startRepair(baseDockView(progress, here), ship.id, ship.hp, Date.now(), repairTimeMultiplier(baseOfProgress(progress)) * event.repairMul, ship.shipClass, buildsHere(progress).length) : null;
    if (!paid || !docked) return;
    saveProgress(withQuestEvents({ ...mergeBaseDocks(progress, here, { ...progress, ...docked }), resources: paid }, [['repair', 1]], Date.now()), 'repair');
    this.refresh();
  }

  private fastRepair(shipId: string): void {
    const progress = loadProgress();
    if (progress.items.fastRepair > 0) {
      saveProgress({ ...progress, ...fastRepair(progress, shipId), items: { ...progress.items, fastRepair: progress.items.fastRepair - 1 } });
      this.refresh();
      return;
    }
    const paid = pay(progress.resources, FAST_REPAIR_COST);
    if (!paid) return;
    saveProgress({ ...progress, ...fastRepair(progress, shipId), resources: paid }, 'repair');
    this.refresh();
  }
}
