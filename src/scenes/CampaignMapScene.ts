import Phaser from 'phaser';
import { recordLedger } from '@/systems/LedgerSystem';
import { baseOfProgress, baseReaches, basesFor, baseState, nationBases } from '@/systems/BaseSystem';
import { endSortie, pendingSortie, resumeSortie } from '@/utils/SortieFlow';
import { TutorialGuide } from '@/ui/components/TutorialGuide';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, loadSave, saveProgress } from '@/utils/ProgressStore';
import { clock } from '@/utils/TimeFormat';
import { enemyFormation } from '@/systems/EnemyFormation';
import { SUPERWEAPON_GOLD, superweaponOf } from '@/systems/SuperweaponSystem';
import { TimeOfDay } from '@/types/Weather';
import { FORMATION_RULES } from '@/systems/FormationRules';
import { GOLD_SWEEP } from '@/systems/GoldSystem';
import { canSweep, nextSweepMs, SWEEP_MAX, SWEEP_REWARD_SCALE, sweepArea, sweepCost, sweepsLeft } from '@/systems/ProgressionSystem';
import { eventAppliesToBattle, eventEffects, eventLabel } from '@/systems/EventSystem';
import { activeEvent } from '@/utils/GameClock';
import { areaDepth, curveText, enemyScale, fleetPower, theaterStep } from '@/systems/DifficultyCurve';
import { IShipData } from '@/types/Ship';
import { fleetPowerBreakdown, powerCompareText, powerTone } from '@/systems/FleetPower';
import { selectedShipIds } from '@/utils/FleetSelection';
import { prerequisitesOf, areasOf, firstSReward, lockText, sevenSeasText, enemyNationFor, enemyShips, isCleared, isFreeArea, isUnlocked, theaterProgress, theatersFor } from '@/systems/CampaignSystem';
import { ownedIds, rewardShipFor } from '@/systems/ShipyardSystem';
import { CAPTAIN_MIN_DEPTH, captainsLeft } from '@/systems/CaptainRoster';
import { kindLabel } from '@/systems/EncyclopediaSystem';
import { hasCapitalShips, kindBreakdown, kindGroups } from '@/systems/ShipKind';
import { addResources, canAfford, formatResources, lostNote } from '@/systems/ResourceSystem';
import { TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { NATION_INFO } from '@/config/NationInfo';
import { ICampaignArea, ICampaignData, Objective, ITheater } from '@/types/Campaign';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, UIButton } from '@/ui/components/UIKit';
import campaignData from '@/data/campaign.json';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { placeLabels } from '@/utils/LabelLayout';
import { dashes, rimSegment } from '@/utils/RouteLine';
import { NODE_LABEL, sortieRoute } from '@/systems/SortieMapSystem';

/** Registry key: the area the Fleet Builder is preparing a sortie for. */
export const CAMPAIGN_AREA_KEY = 'campaign.area';

const DATA = campaignData as ICampaignData;

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  [Objective.Annihilate]: '敵艦隊の殲滅',
  [Objective.Convoy]: '輸送船団の護衛',
  [Objective.Bombard]: '陸上目標の破壊',
  [Objective.SinkTargets]: '目標艦の撃沈',
  [Objective.Breakthrough]: '突入',
  [Objective.PreventEscape]: '脱出の阻止',
  [Objective.Delay]: '遅滞戦闘',
};

/** "敵旗艦の撃沈 (6:00 以内)" — the objective with its target, zone and time limit (#40). */
export function objectiveText(a: ICampaignArea): string {
  const side = a.side;
  if (!side) return OBJECTIVE_LABEL[a.objective];
  const label = side.targetLead && a.objective === Objective.SinkTargets ? '敵旗艦の撃沈' : OBJECTIVE_LABEL[a.objective];
  const zone = side.zone ? ` — ${side.zone.label}` : '';
  const t = side.timeLimitSec ?? 0;
  const time = t > 0 ? `  (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${a.objective === Objective.Delay ? ' 持ちこたえる' : ' 以内'})` : '';
  return `${label}${zone}${time}`;
}

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { tabsY: 172, map: { x: 16, y: 216, w: CANVAS_W - 32, h: 480 } as IRect, detail: { x: 16, y: 712, w: CANVAS_W - 32, h: CANVAS_H - 728 } as IRect }
  : { tabsY: 120, map: { x: 24, y: 160, w: 780, h: 540 } as IRect, detail: { x: 820, y: 160, w: 436, h: 540 } as IRect };
const NODE_R = IS_PORTRAIT ? 26 : 22;

/**
 * 作戦: the strategic map. Each theater is a chain of sea areas; clearing one unlocks the next.
 * Selecting an area shows its briefing; 出撃準備 opens the Fleet Builder for that operation.
 */
/** Height kept free at the bottom of the map for the note on the seas not open yet (#336). */
const NOTE_STRIP = 28;

export class CampaignMapScene extends Phaser.Scene {
  private theater = DATA.theaters[0].id;
  /** Theaters the nation being played can fight in (#27) */
  private theaters: ITheater[] = [];
  private selected: ICampaignArea | null = null;
  private tabs: UIButton[] = [];
  private mapLayer: Phaser.GameObjects.GameObject[] = [];
  private detailLayer: Phaser.GameObjects.GameObject[] = [];
  /** Result of the last sweep, shown above the buttons */
  private status = '';

  constructor() {
    super({ key: SceneKeys.CAMPAIGN });
  }

  /** An area to open on (#283: the 掃討 notice), once */
  private focusArea: string | null = null;

  init(data?: { areaId?: string }): void {
    this.focusArea = data?.areaId ?? null;
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    // First-play tutorial (#90): drawn above the screen, so it can be made first.
    new TutorialGuide(this);
    audio.music('menu');
    this.tabs = [];
    this.mapLayer = [];
    this.detailLayer = [];
    this.status = '';
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '作戦 — 戦略地図', displayStyle(24)).setOrigin(0.5);
    // The bases the sorties leave from (#220): their docks, facilities and ships, then back to this map.
    new UIButton(this, CANVAS_W - back.x, back.y, '軍港  ›', () => this.scene.start(SceneKeys.BASE, { returnTo: SceneKeys.CAMPAIGN }), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    // A base under construction, or one ready to be built (#217), is noted under the button.
    const p = loadProgress();
    const works = nationBases(p.nation).map((b) => baseState(b, p));
    const workNote = works.includes('building') ? '工事中' : works.includes('ready') ? '着工できます' : '';
    if (workNote) this.add.text(CANVAS_W - back.x, back.y + back.h / 2 + 4, workNote, textStyle(11, Css.cyan)).setOrigin(0.5, 0);

    // 七つの海 (#250): how many of the seven this admiral has taken, any navy's conquests counted.
    // Portrait: in the row of the back button, where the title leaves room; landscape: under the title.
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? back.y : 86, sevenSeasText(DATA, loadSave().nations), textStyle(12, Css.gold)).setOrigin(0.5);
    // Only the seas the open bases reach are on the map (#282); the rest wait for a base to open.
    const pending = pendingSortie(this);
    const pendingArea = pending ? DATA.areas.find((a) => a.id === pending.areaId) : undefined;
    const reachable = baseOfProgress(loadProgress());
    // The navy's order (#293): the nearest sea first, as its bases open them.
    const nation = loadProgress().nation;
    const all = theatersFor(DATA, nation).sort((x, y) => (theaterStep(nation, x.id) ?? 99) - (theaterStep(nation, y.id) ?? 99));
    this.theaters = all.filter((t) => baseReaches(reachable, t.id) || t.id === pendingArea?.theater);
    const hidden = all.filter((t) => !this.theaters.includes(t));
    if (hidden.length > 0) {
      const names = IS_PORTRAIT ? '' : ` (${hidden.map((t) => t.name).join('・')})`;
      const note = this.add.text(L.map.x + 18, L.map.y + L.map.h - 14, `ほか ${hidden.length} 戦域${names}は、軍港を開くと出撃できます`, textStyle(12, Css.dim)).setOrigin(0, 1).setDepth(2);
      if (note.width > L.map.w - 36) note.setScale((L.map.w - 36) / note.width);
    }
    if (!this.theaters.some((t) => t.id === this.theater)) this.theater = this.theaters[0]?.id ?? DATA.theaters[0].id;
    // A sortie left unfinished (#138) opens on its area.
    if (pendingArea && this.theaters.some((t) => t.id === pendingArea.theater)) this.theater = pendingArea.theater;
    const focus = !pendingArea && this.focusArea ? DATA.areas.find((a) => a.id === this.focusArea) : undefined;
    if (focus && this.theaters.some((t) => t.id === focus.theater)) this.theater = focus.theater;
    const w = CANVAS_W - L.map.x * 2;
    const bw = (w - 8 * (this.theaters.length - 1)) / Math.max(1, this.theaters.length);
    this.tabs = this.theaters.map(
      (t, i) =>
        new UIButton(this, L.map.x + i * (bw + 8) + bw / 2, L.tabsY, '', () => this.selectTheater(t.id), {
          variant: 'secondary', width: bw, height: IS_PORTRAIT ? 54 : 38, fontSize: 15,
        }),
    );
    addPanel(this, L.map.x, L.map.y, L.map.w, L.map.h, { radius: 24, fillAlpha: 0.45, glow: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.selectTheater(this.theater);
  }

  private selectTheater(id: string): void {
    this.theater = id;
    const cleared = loadProgress().campaign;
    const base = baseOfProgress(loadProgress());
    this.theaters.forEach((t, i) => {
      const pct = Math.round(theaterProgress(DATA, t.id, cleared) * 100);
      // Up to six theaters a navy (#250): portrait puts the percentage under the name. 内海 marks the Baltic and the
      // Black Sea where the tab has room (landscape). A sea no open base reaches only shows for a sortie left there.
      const away = baseReaches(base, t.id) ? '' : ' 他港';
      const name = `${t.name}${t.inland && !IS_PORTRAIT ? '(内海)' : ''}`;
      this.tabs[i].setLabel(IS_PORTRAIT ? `${name}\n${pct}%${away}` : `${name} ${pct}%${away}`).setVariant(t.id === id ? 'primary' : 'secondary');
    });
    const areas = areasOf(DATA, id);
    const pending = pendingSortie(this);
    this.selected = areas.find((a) => a.id === pending?.areaId) ?? areas.find((a) => a.id === this.focusArea) ?? areas.find((a) => isUnlocked(a, cleared) && !isCleared(a, cleared)) ?? areas[0] ?? null;
    this.focusArea = null;
    this.drawMap();
    this.drawDetail();
  }

  private nodePos(a: ICampaignArea): { x: number; y: number } {
    const m = L.map;
    const pad = 60;
    // Portrait stretches the theater's nodes over the whole map: the narrow screen has no room to waste (#162).
    const fit = (v: number, lo: number, hi: number): number => (IS_PORTRAIT && hi - lo > 0.2 ? (v - lo) / (hi - lo) : v);
    const areas = areasOf(DATA, a.theater);
    const xs = areas.map((n) => n.x);
    const ys = areas.map((n) => n.y);
    return {
      x: m.x + pad + fit(a.x, Math.min(...xs), Math.max(...xs)) * (m.w - pad * 2),
      // The bottom strip is the note's (other seas, #282): nodes and their names keep above it (#336).
      y: m.y + pad + fit(a.y, Math.min(...ys), Math.max(...ys)) * (m.h - pad * 2 - NOTE_STRIP),
    };
  }

  private drawMap(): void {
    for (const o of this.mapLayer) o.destroy();
    this.mapLayer = [];
    const cleared = loadProgress().campaign;
    const areas = areasOf(DATA, this.theater);
    const g = this.add.graphics();
    this.mapLayer.push(g);
    // Faint chart grid
    g.lineStyle(1, Colors.cyan, 0.06);
    for (let x = L.map.x + 40; x < L.map.x + L.map.w; x += 60) g.lineBetween(x, L.map.y + 10, x, L.map.y + L.map.h - 10);
    for (let y = L.map.y + 40; y < L.map.y + L.map.h; y += 60) g.lineBetween(L.map.x + 10, y, L.map.x + L.map.w - 10, y);
    // Routes
    for (const a of areas) {
      const to = this.nodePos(a);
      for (const r of prerequisitesOf(a)) {
        const from = areas.find((x) => x.id === r);
        if (!from) continue;
        // Dashed, rim to rim (#162): the line never runs through a node's number or rank.
        const seg = rimSegment(this.nodePos(from), to, NODE_R, 5);
        if (!seg) continue;
        g.lineStyle(3, isCleared(from, cleared) ? Colors.cyan : Colors.muted, isCleared(from, cleared) ? 0.8 : 0.35);
        for (const d of dashes(seg, 10, 7)) g.lineBetween(d.x1, d.y1, d.x2, d.y2);
      }
    }
    // Nodes
    const names: Phaser.GameObjects.Text[] = [];
    areas.forEach((a, i) => {
      const { x, y } = this.nodePos(a);
      const done = isCleared(a, cleared);
      const open = isUnlocked(a, cleared);
      const color = done ? Colors.gold : open ? Colors.cyan : Colors.muted;
      const node = this.add.graphics();
      node.fillStyle(color, done || open ? 0.25 : 0.1);
      node.fillCircle(x, y, NODE_R);
      node.lineStyle(a === this.selected ? 4 : 2, color, open ? 1 : 0.4);
      node.strokeCircle(x, y, NODE_R);
      // A cleared area shows its best battle rank (#149), or ✓ when it has none yet.
      const best = done ? loadProgress().areaRanks[a.id] : undefined;
      // A training area (#202) reads 訓 instead of a number.
      const label = this.add.text(x, y, best ?? (done ? '✓' : a.training ? '訓' : String(i + 1)), textStyle(16, done ? Css.gold : open ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0.5);
      const name = this.add.text(x, y + NODE_R + 8, a.name, textStyle(12, open ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0, 0);
      names.push(name);
      const hit = this.add.zone(x, y, NODE_R * 3, NODE_R * 3).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.selectArea(a.id));
      this.mapLayer.push(node, label, name, hit);
      if (open && !done) {
        const pulse = this.add.circle(x, y, NODE_R).setStrokeStyle(2, Colors.cyan, 0.8);
        this.tweens.add({ targets: pulse, scale: 1.6, alpha: 0, duration: 1400, repeat: -1 });
        this.mapLayer.push(pulse);
      }
    });
    // Names go wherever they overlap nothing (#162): dense theaters crowd the portrait map.
    const placed = placeLabels(areas.map((a) => this.nodePos(a)), names.map((t) => ({ w: t.width, h: t.height })), NODE_R, { x: L.map.x + 8, y: L.map.y + 8, w: L.map.w - 16, h: L.map.h - 16 - NOTE_STRIP });
    placed.forEach((p, i) => names[i].setPosition(p.x, p.y).setScale(p.scale));
  }

  selectArea(id: string): void {
    const a = DATA.areas.find((x) => x.id === id);
    if (!a) return;
    this.selected = a;
    this.status = '';
    this.drawMap();
    this.drawDetail();
  }

  private drawDetail(): void {
    for (const o of this.detailLayer) o.destroy();
    this.detailLayer = [];
    const a = this.selected;
    if (!a) return;
    const d = L.detail;
    const cleared = loadProgress().campaign;
    const open = isUnlocked(a, cleared);
    const x = d.x + 24;
    const wrap = { wordWrap: { width: d.w - 48, useAdvancedWrap: true } };
    const registry = DataLoader.getRegistry(this);
    const enemyNation = enemyNationFor(DATA, a, loadProgress().nation);
    const enemy = enemyShips(a, registry, enemyNation);
    // Kinds first, then the names under each kind (#68).
    const lineup = kindGroups(enemy.map((s) => ({ ...s, name: s.name.replace(/\s*\(.*\)\s*$/, '') })))
      .map((g) => `${g.kind}  ${g.names.join('・')}`)
      .join('\n');
    const map = DataLoader.getMap(this, a.map);
    // The area's reward-only ship for the nation being played, until it is won with an S rank (#160).
    const progress = loadProgress();
    const roster = registry.byNation(progress.nation);
    // One S-rank reward an area (#247): its reward-only ship, else a captain on the first S (who stays a surprise);
    // none in a training area.
    const sReward = firstSReward(a, { rewardShip: rewardShipFor(roster, ownedIds(progress, roster), a.id), perfect: progress.perfect, captainsLeft: captainsLeft(progress.nation, progress.captains), depth: areaDepth(DATA, a, progress.nation), minDepth: CAPTAIN_MIN_DEPTH });
    const reward = formatResources(a.reward) + (sReward?.kind === 'ship' ? `  /  S 評価の報酬: ${sReward.ship.name.replace(/\s*\(.*\)\s*$/, '')} (${kindLabel(sReward.ship)})` : '');
    const captain = sReward?.kind === 'captain' ? 'S 評価の報酬: 艦長 +1' : '';
    // 自艦隊の戦力 (#280): the fleet last set up in the builder, against this area's enemy.
    const nation = loadProgress().nation;
    // Further along the navy's order the same fleet is stronger (#293).
    const enemyPower = Math.round(fleetPower(enemy) * enemyScale(DATA, a, nation));
    const depth = areaDepth(DATA, a, nation);
    const ownShips = selectedShipIds(this.registry, progress.nation).map((id) => roster.find((s) => s.id === id)).filter((s): s is IShipData => s !== undefined);
    // 総戦力 (#342): refits, research, crews and morale too (the captains and formation are picked in the builder).
    const ownPower = ownShips.length > 0 ? fleetPowerBreakdown(ownShips, progress, DataLoader.getUpgrades(this)).total : 0;
    const tone = powerTone(ownPower, enemyPower);
    const giantEvent = activeEvent();
    const giantHere = giantEvent?.kind === 'superweapon' && giantEvent.theater === a.theater && !a.training ? superweaponOf(enemyNation) : undefined;
    const lines: Array<[string, string]> = [
      ['目標', objectiveText(a)],
      // Portrait keeps to the kinds (the names ran the sweep line into the buttons).
      // The formation the enemy is expected to take (#82), before the player's fleet is known.
      ['敵', `${NATION_INFO[enemyNation].ja} ${enemy.length} 隻 — ${kindBreakdown(enemy)}  ·  ${FORMATION_RULES[enemyFormation({ nation: enemyNation, enemy: enemy.map((e) => e.shipClass), player: [], night: a.time === TimeOfDay.Night, named: a.enemy.formation })].ja}${IS_PORTRAIT ? '' : `\n${lineup}`}`],
      // 超兵器出現 (#148 #89): the main fleet here brings its giant while the event runs.
      ...(giantHere ? [['超兵器', `${giantHere.name} が主力艦隊に加わる (撃沈でゴールド +${SUPERWEAPON_GOLD})`] as [string, string]] : []),
      ['海域', `${map.name}  ·  ${WEATHER_LABEL[a.weather]}  ·  ${TIME_LABEL[a.time]}${isFreeArea(a) ? '  ·  出撃無料' : ''}`],
      // Nodes of the sortie (#53): skirmish, supply cache / whirlpool, main fleet.
      // The difficulty curve (#254): the enemy's strength against the target for this depth, and the rank it is for.
      // Portrait shares the route's row, so the briefing stays clear of the buttons.
      ...(IS_PORTRAIT
        ? [['ルート・敵の戦力', `${sortieRoute(a, enemy).map((n) => NODE_LABEL[n.kind]).join(' → ')}  ·  ${curveText(enemyPower, depth)}${ownPower > 0 ? `  ·  自艦隊 ×${(ownPower / enemyPower).toFixed(2)}` : ''}`] as [string, string]]
        : [['ルート', sortieRoute(a, enemy).map((n) => NODE_LABEL[n.kind]).join(' → ')], ['敵の戦力', curveText(enemyPower, depth)],
          // The fleet last set up, weighed the same way (#280).
          ...(ownPower > 0 ? [['戦力の比較', powerCompareText(ownPower, enemyPower)] as [string, string]] : [])] as Array<[string, string]>),
      ...(open ? [] : [['解放の条件', lockText(DATA, a, cleared)] as [string, string]]),
      ['初回報酬', captain ? `${reward}  /  ${captain}` : reward],
    ];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.detailLayer.push(o);
      return o;
    };
    const bestRank = progress.areaRanks[a.id];
    add(this.add.text(x, d.y + 20, isCleared(a, cleared) ? `攻略済${bestRank ? `  ·  最高評価 ${bestRank}` : ''}` : open ? '作戦' : '未解放', eyebrowStyle(11, isCleared(a, cleared) ? Css.gold : open ? Css.cyan : Css.dim)));
    const title = add(this.add.text(x, d.y + 44, a.name, displayStyle(24)));
    const desc = add(this.add.text(x, title.y + title.height + 10, a.description, textStyle(13, Css.muted, wrap)));
    let y = desc.y + desc.height + 18;
    const briefTop = y;
    const brief: Phaser.GameObjects.Text[] = [];
    for (const [k, v] of lines) {
      brief.push(add(this.add.text(x, y, k, eyebrowStyle(10, Css.gold))));
      // Battleships, carriers or heavy cruisers in the enemy fleet show in gold.
      const strong = k === '敵' && hasCapitalShips(enemy);
      const compare = k === '戦力の比較' ? { danger: Css.danger, even: Css.gold, ahead: Css.success }[tone] : undefined;
      const t = add(this.add.text(x, y + 18, v, textStyle(13, compare ?? (strong ? Css.gold : Css.text), { ...wrap, lineSpacing: 4 })));
      brief.push(t);
      y = t.y + t.height + 10;
    }
    // 掃討 (#57): an area won without losses can be swept, skipping the battle.
    const sweepable = canSweep(progress, a);
    const left = sweepsLeft(progress, a.id, Date.now());
    const wait = nextSweepMs(progress.sweepCharges[a.id], Date.now());
    const sweepNote = sweepable
      ? `掃討 ${left} / ${SWEEP_MAX} 回 (${wait > 0 ? `次の回復 ${clock(wait)}` : '満タン'}・1 時間に 1 回)  ·  ${formatResources(sweepCost(a, enemy)) || '無料'}で戦闘を省略・報酬 ${Math.round(SWEEP_REWARD_SCALE * 100)}%`
      : isCleared(a, cleared) ? '掃討: この海域で S 評価を取ると使えます' : '';
    const by = d.y + d.h - (IS_PORTRAIT ? 56 : 46);
    const buttonTop = by - (IS_PORTRAIT ? 76 : 60) / 2;
    // The sweep's result and note sit right above the buttons; the briefing shrinks to fit above them, so the three
    // never overlap however long the result runs (#297, and #141 before it).
    // A sortie left unfinished here (#138) puts its own line right above the buttons.
    const pending = pendingSortie(this);
    const pendingHere = pending?.areaId === a.id;
    const noteBottom = buttonTop - 8 - (pendingHere ? (IS_PORTRAIT ? 26 : 22) : 0);
    let noteTop = noteBottom;
    if (this.status || sweepNote) {
      const note = add(this.add.text(x, noteBottom, this.status ? `${this.status}\n${sweepNote}` : sweepNote, textStyle(12, this.status ? Css.success : Css.muted, { ...wrap, lineSpacing: 2 })).setOrigin(0, 1));
      noteTop = note.y - note.height - 8;
    }
    if (y > noteTop && y > briefTop) {
      const f = Math.max(0.6, (noteTop - briefTop) / (y - briefTop));
      for (const t of brief) t.setScale(f).setY(briefTop + (t.y - briefTop) * f);
    }
    // A sortie left unfinished here (#138): continue it or withdraw.
    if (pending && pendingHere) {
      const half = (d.w - 48 - 12) / 2;
      const bh = IS_PORTRAIT ? 76 : 60;
      add(this.add.text(x, buttonTop - 8 - (IS_PORTRAIT ? 22 : 18), pending.advance ? `出撃中: 前の戦闘は終了。進撃すると ${pending.node} / ${pending.battles} 戦目` : `出撃中: ${pending.node} / ${pending.battles} 戦目の途中で中断 (戦い直し)`, textStyle(12, Css.cyan)));
      add(new UIButton(this, d.x + 24 + half / 2, by, pending.advance ? '進撃して続ける  ›' : '続きから  ›', () => this.resume(), {
        variant: 'gold', width: half, height: bh, fontSize: IS_PORTRAIT ? 18 : 17,
      }));
      add(new UIButton(this, d.x + d.w - 24 - half / 2, by, '撤退する', () => {
        endSortie(this);
        this.status = '撤退しました';
        this.drawDetail();
      }, { variant: 'secondary', width: half, height: bh, fontSize: 17 }));
      return;
    }
    const bw = sweepable ? (d.w - 48 - 12) / 2 : d.w - 48;
    // Sorties leave from a base that reaches the theater (#145).
    const reach = baseReaches(baseOfProgress(progress), a.theater);
    const from = basesFor(progress.nation, a.theater).map((b) => b.name).join('・');
    const label = !open ? '前の海域を攻略してください' : reach ? '出撃準備  ›' : `${from}を開港すると出撃可`;
    const btn = add(
      new UIButton(this, d.x + 24 + bw / 2, by, label, () => this.prepare(a), {
        variant: open && reach ? 'gold' : 'secondary', width: bw, height: IS_PORTRAIT ? 76 : 60, fontSize: open && reach ? 20 : 14,
      }),
    );
    btn.setEnabled(open && reach);
    if (sweepable) {
      add(new UIButton(this, d.x + d.w - 24 - bw / 2, by, '掃討', () => this.sweep(a), {
        variant: 'primary', width: bw, height: IS_PORTRAIT ? 76 : 60, fontSize: 20,
      })).setEnabled(reach && left > 0 && canAfford(progress.resources, sweepCost(a, enemy)));
    }
  }

  /** Continues the saved sortie (#138). */
  private resume(): void {
    const init = resumeSortie(this);
    if (init) this.scene.start(SceneKeys.BATTLE, init);
    else {
      endSortie(this);
      this.drawDetail();
    }
  }

  private sweep(a: ICampaignArea): void {
    const registry = DataLoader.getRegistry(this);
    const progress = loadProgress();
    const enemy = enemyShips(a, registry, enemyNationFor(DATA, a, progress.nation));
    const event = activeEvent();
    const r = sweepArea(progress, a, enemy, Date.now(), eventEffects(event));
    if (!r) return;
    // Ledger (#137): the sweep's reward in, its fuel and ammo out as a sortie.
    const now = Date.now();
    const ledger = recordLedger(recordLedger(recordLedger(r.progress.ledger, 'sweep', addResources(r.reward, r.lost, -1), now), 'sortie', r.cost, now), 'overflow', r.lost, now);
    saveProgress({ ...r.progress, ledger });
    this.status = `掃討完了: ${formatResources(r.reward)}・ゴールド ${GOLD_SWEEP}${lostNote(r.lost)}  ·  戦功 +${r.merit}${r.promotedTo ? `  ·  ${r.promotedTo.name}に昇進` : ''}${eventAppliesToBattle(event, a.theater) ? `\nイベント: ${eventLabel(event)}` : ''}`;
    this.drawDetail();
  }

  private prepare(a: ICampaignArea): void {
    if (!isUnlocked(a, loadProgress().campaign)) return;
    this.registry.set(CAMPAIGN_AREA_KEY, a.id);
    this.scene.start(SceneKeys.FLEET_BUILDER);
  }
}
