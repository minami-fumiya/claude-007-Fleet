/**
 * 画面の外の艦隊 (0.0.72): runs the fleets under orders up to now against the game's own data (the ship registry,
 * the day's residents, the navy's docks), and saves what came of it — the fleets' places, their ships' HP, the
 * residents beaten. Called when the home port or the open sea opens, and every few seconds at sea.
 */
import campaignData from '@/data/campaign.json';
import { baseOfProgress, baseReaches } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import { fleetPower } from '@/systems/DifficultyCurve';
import { setDamage } from '@/systems/DockSystem';
import { advanceIntercepts, advanceOrders, IKnownFoe, IOffscreenFight, IOffscreenWorld, SIGHTING_MS } from '@/systems/FleetOrders';
import { withQuestEvents } from '@/systems/QuestSystem';
import { EXPEDITIONS } from '@/systems/ExpeditionSystem';
import { advanceExpeditions, expeditionPlan } from '@/systems/ExpeditionRoute';
import { nearestDock } from '@/systems/AnchorageSystem';
import { WORLD_MAP, baseAnchor, findRoute } from '@/systems/OpenSeaSystem';
import { IResident, residentDay, residentPos, residentsFor } from '@/systems/WorldSim';
import { addResources, gainResources } from '@/systems/ResourceSystem';
import { defenseReward, emptySeaControl, settleDefense } from '@/systems/SeaControlSystem';
import { advanceAirOps, IAirWork, STRUCK_MUL } from '@/systems/AirControlSystem';
import { CONTROL_SAFE, addRegionEvent, regionById } from '@/systems/SeaRegionSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { holdCap } from '@/systems/FacilitySystem';
import { recordLedger } from '@/systems/LedgerSystem';
import { addProficiency } from '@/systems/ProficiencySystem';
import { counterResident, controlAtPx, hotSeas, isCounterId, wasStruck, withRegionEvent } from '@/utils/SeaControlView';
import { resourceReward } from '@/systems/WorldSystem';
import { markResidentWon, spotWon, worldEnemyFleet, worldEnemyScale, emptyWorld } from '@/systems/WorldSystem';
import { SECTOR_PX } from '@/systems/OpenSeaSystem';
import { ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { IProgress } from '@/utils/ProgressStore';

export interface IShipLookup {
  byId(id: string): IShipData | undefined;
  byNation(nation: string): IShipData[];
}

/** The seas a navy sails: its theaters a base of its reaches. */
export function navyTheaters(progress: IProgress): string[] {
  const reach = baseOfProgress(progress);
  return theatersFor(campaignData as ICampaignData, progress.nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id);
}

/** 訓練 (0.0.74): proficiency a ship gains a world hour of training, up to TRAIN_CAP; the fuel it burns. */
export const TRAIN_PER_HOUR = 0.5;
export const TRAIN_CAP = 60;
export const TRAIN_FUEL_PER_SHIP_HOUR = 2;

/**
 * The day's residents of the seas a navy sails, as the battle screen and the off-screen fleets both see them (0.0.74):
 * one more enemy patrol round each sea where its control is low, and the counterattack under way.
 */
export function worldResidents(progress: IProgress, theaters: readonly string[], now: number, giants: Parameters<typeof residentsFor>[3] = []): IResident[] {
  const hot = hotSeas(progress, now, new Set(theaters));
  const list = residentsFor(progress.nation, theaters, residentDay(now), giants, hot);
  const counter = counterResident(progress);
  return counter ? [...list, counter] : list;
}

/** The fleets under orders brought up to `now`; null when none is under way. */
export function runFleetOrders(progress: IProgress, ships: IShipLookup, now: number): { progress: IProgress; fights: IOffscreenFight[] } | null {
  // 遠征の航路 (0.0.73): expeditions sail their routes too; 0.0.74: fleets waiting in a base to intercept.
  const routed = progress.expeditions.some((x) => x.startedAt !== undefined && !x.cut && x.endsAt > (x.checkedAt ?? 0));
  // 0.0.75: the base air groups' missions too.
  if (!progress.openSea.anchors.some((a) => a.order || a.intercept) && !routed && (progress.sea?.airOps ?? []).length === 0) return null;
  const data = campaignData as ICampaignData;
  const theaters = navyTheaters(progress);
  const residents = worldResidents(progress, theaters, now);
  const hp: Record<string, number> = {};
  for (const a of progress.openSea.anchors) for (const id of a.shipIds) hp[id] = progress.damage[id] ?? 1;
  for (const x of progress.expeditions) for (const id of x.shipIds) hp[id] = progress.damage[id] ?? 1;
  const world = progress.world ?? emptyWorld();
  const offscreen: IOffscreenWorld = {
    residents,
    won: (id) => spotWon(world, id),
    power: (ids, health) => fleetPower(ids.map((id) => ships.byId(id)).filter((s): s is IShipData => s !== undefined).map((s) => ({ hp: s.hp * (health[s.id] ?? 1), armor: s.armor }))),
    enemyPower: (r) => {
      const opponent = data.theaters.find((t) => t.id === r.theater)?.opponents?.[progress.nation] ?? Nation.USN;
      // 対艦攻撃 (0.0.75): a fleet struck from the air fights weaker.
      return fleetPower(worldEnemyFleet(ships.byNation(opponent), { id: r.id, danger: r.danger })) * worldEnemyScale(r.danger) * (wasStruck(progress, r.id) ? STRUCK_MUL : 1);
    },
    homeFrom: (s) => {
      const base = nearestDock(progress, s);
      const at = base ? baseAnchor(base.id) : undefined;
      const sector = base ? WORLD_MAP.bases[base.id] : undefined;
      const route = sector ? findRoute(s, { c: sector.c, r: sector.r }) : null;
      return at && route ? { route, dest: at } : null;
    },
  };
  const ordered = advanceOrders(progress.openSea.anchors, hp, now, offscreen);
  // 航空の任務 (0.0.75): the base air groups search, strike the ships found and strike the enemy's harbours.
  const air = advanceAirOps({
    ops: progress.sea?.airOps ?? [],
    regions: (id) => regionById(id),
    residents,
    won: (id) => spotWon(world, id),
    struck: (id) => wasStruck(progress, id),
    enemyHarbour: (r) => !!r.areaId && (!progress.campaign.includes(r.areaId) || (progress.sea?.lost ?? []).includes(r.areaId)),
  }, now);
  ordered.sightings.push(...air.found.map(({ base: _b, ...x }) => x));
  // 迎撃 (0.0.74): what the patrols found just now, and the counterattack at sea, for the fleets waiting in a base.
  const byId = new Map(residents.map((r) => [r.id, r]));
  const known: IKnownFoe[] = ordered.sightings.flatMap((x) => {
    const r = byId.get(x.id);
    return r ? [{ id: x.id, kind: r.kind, x: (x.c + 0.5) * SECTOR_PX, y: (x.r + 0.5) * SECTOR_PX, at: x.at, resident: r }] : [];
  });
  const counter = residents.find((r) => r.kind === 'counter');
  if (counter) {
    const at = residentPos(counter, now);
    known.push({ id: counter.id, kind: 'counter', x: at.x, y: at.y, at: now, resident: counter });
  }
  const caught = advanceIntercepts(ordered.anchors, ordered.hp, now, offscreen, known);
  const result = { ...ordered, anchors: caught.anchors, hp: caught.hp, fights: [...ordered.fights, ...caught.fights] };
  const sent = advanceExpeditions(progress.expeditions, result.hp, now, offscreen, (id) => {
    const exp = EXPEDITIONS.find((e) => e.id === id);
    return exp ? expeditionPlan(progress.nation, exp) : null;
  });
  result.hp = sent.hp;
  const fights: IOffscreenFight[] = [...result.fights, ...sent.fights.map((f) => ({ shipIds: f.shipIds, residentId: f.residentId, won: f.won, hurt: {}, turnedHome: f.turnedHome, at: f.at, expedition: f.runId }))];
  // 哨戒 (0.0.73): what the patrols found, kept for two world hours, and counted for the quests and medals.
  const sightings = [...(progress.openSea.sightings ?? []), ...result.sightings].filter((x) => now - x.at <= SIGHTING_MS).slice(-40);
  let next: IProgress = { ...progress, expeditions: sent.runs, openSea: { ...progress.openSea, anchors: result.anchors, sightings } };
  if (result.sightings.length > 0) next = withQuestEvents(next, [['patrolSighting', result.sightings.length]], now);
  for (const [id, h] of Object.entries(result.hp)) {
    if (h !== hp[id]) next = { ...next, ...setDamage(next, id, h) };
  }
  let w = next.world ?? emptyWorld();
  for (const f of fights) if (f.won) w = markResidentWon(w, f.residentId);
  next = { ...next, world: w };
  next = applyDutyResults(next, fights, ordered.works, residents, now);
  next = applyAirWork(next, air, now);
  return { progress: next, fights };
}

/** 航空の任務 (0.0.75): the missions counted on; the ships struck kept two world days; the harbours struck in their regions. */
function applyAirWork(progress: IProgress, air: IAirWork, now: number): IProgress {
  const sea = progress.sea ?? emptySeaControl();
  if ((sea.airOps ?? []).length === 0) return progress;
  const struck = Object.fromEntries(Object.entries(sea.struck ?? {}).filter(([, at]) => now - at < 48 * WORLD_HOUR_MS));
  for (const id of air.struck) struck[id] = now;
  let events = sea.events;
  for (const p of air.ports) events = addRegionEvent(events, p.region, 'portStrike', p.at);
  let next: IProgress = { ...progress, sea: { ...sea, airOps: air.ops, struck, ...(events ? { events } : {}) } };
  next = withQuestEvents(next, [['airRecon', air.found.length], ['airStrike', air.struck.length], ['portStrike', air.ports.length]], now);
  return next;
}

/**
 * 制海権 (0.0.74): what the fights and the duties did — each fight moves its region's control (won up, lost down), a
 * convoy sunk pays its cargo, a counterattack beaten keeps its sea, the mines and the sweeping count in their region,
 * and the ships in training gain proficiency for the fuel they burn.
 */
function applyDutyResults(progress: IProgress, fights: readonly IOffscreenFight[], works: ReturnType<typeof advanceOrders>['works'], residents: readonly IResident[], now: number): IProgress {
  let next = progress;
  const data = campaignData as ICampaignData;
  for (const f of fights) {
    if (f.x === undefined || f.y === undefined) continue;
    const counter = isCounterId(f.residentId);
    next = withRegionEvent(next, f.x, f.y, f.won ? (counter ? 'counter' : f.kind === 'convoy' ? 'raid' : 'win') : 'loss', f.at);
    if (!f.won) continue;
    if (f.kind === 'convoy') {
      const r = residents.find((x) => x.id === f.residentId);
      const cargo = resourceReward('convoy', r?.danger ?? 3);
      const g = gainResources(next.resources, cargo, holdCap(next.facilities));
      next = withQuestEvents({ ...next, resources: g.resources, ledger: recordLedger(recordLedger(next.ledger, 'battle', addResources(cargo, g.lost, -1), now), 'overflow', g.lost, now) }, [['convoyRaid', 1], ['dutyRaid', 1]], now);
    }
    if (counter && next.sea?.counter) {
      const area = data.areas.find((a) => a.id === next.sea!.counter!.areaId);
      next = { ...next, sea: settleDefense(next.sea, next.sea.counter.areaId, true) };
      if (area) {
        const reward = defenseReward(area.reward);
        const g = gainResources(next.resources, reward, holdCap(next.facilities));
        next = withQuestEvents({ ...next, resources: g.resources, ledger: recordLedger(recordLedger(next.ledger, 'battle', addResources(reward, g.lost, -1), now), 'overflow', g.lost, now) }, [['defenseWin', 1], ['counterRepel', 1]], now);
      }
    }
    if (f.mission === 'intercept') next = withQuestEvents(next, [['interceptWin', 1]], now);
  }
  for (const wk of works) {
    const x = (wk.at.c + 0.5) * SECTOR_PX;
    const y = (wk.at.r + 0.5) * SECTOR_PX;
    if (wk.mission === 'mine') next = withQuestEvents(withRegionEvent(next, x, y, 'mine', wk.t), [['mineLaid', 1]], now);
    else if (wk.mission === 'sweep') next = withQuestEvents(withRegionEvent(next, x, y, 'sweep', wk.t), [['seaSwept', 1]], now);
    else if (wk.mission === 'escort' && wk.hours) next = withQuestEvents(next, [['escortHours', wk.hours]], now);
    else if (wk.mission === 'train' && wk.hours) {
      // Only in safe waters, and only for the fuel there is.
      const here = controlAtPx(next, x, y, now);
      const fuel = TRAIN_FUEL_PER_SHIP_HOUR * wk.shipIds.length * wk.hours;
      if (!here || here.control < CONTROL_SAFE || next.resources.fuel < fuel) continue;
      const proficiency = { ...next.proficiency };
      for (const id of wk.shipIds) {
        const before = proficiency[id] ?? 0;
        if (before >= TRAIN_CAP) continue;
        proficiency[id] = Math.min(TRAIN_CAP, addProficiency(before, TRAIN_PER_HOUR * wk.hours));
      }
      const spent = { fuel, ammo: 0, steel: 0, bauxite: 0 };
      next = withQuestEvents({ ...next, proficiency, resources: { ...next.resources, fuel: next.resources.fuel - fuel }, ledger: recordLedger(next.ledger, 'training', spent, now) }, [['trainHours', wk.hours * wk.shipIds.length]], now);
    }
  }
  return next;
}

/** A line for a fight fought off-screen. */
export function fightNote(f: IOffscreenFight, ships: IShipLookup): string {
  const lead = ships.byId(f.shipIds[0])?.name.replace(/\s*\(.*\)\s*$/, '') ?? '艦隊';
  const worst = Math.max(...Object.values(f.hurt), 0);
  if (f.expedition) {
    const name = EXPEDITIONS.find((e) => e.id === f.expedition)?.name ?? '遠征';
    return `遠征「${name}」が途中で敵と交戦: ${f.won ? '撃退' : '振り切った'}${f.turnedHome ? '・大破した艦がいるので引き返します (報酬は半分)' : ''}`;
  }
  return `${lead}の艦隊が敵と交戦: ${f.won ? '撃退' : '振り切った'} (最大 ${Math.round(worst * 100)}% の損傷)${f.turnedHome ? '・帰投の基準に達したので入渠できる基地へ' : ''}`;
}
