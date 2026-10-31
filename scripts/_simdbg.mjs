/**
 * 戦闘の模擬 (#320): plays campaign battles in AUTO, headless and fast-forwarded, in the real game, and prints a
 * table per area: win rate, battle time (mean and range), the ranks S〜D and the player's ships left afloat.
 *
 * The player's fleet is the one of the area's recommended rank (DifficultyCurve.recommendedRank): as many ships as the
 * rank's slots, the strongest the rank may build (no fictional, reward-only or submarine) within its cost cap (#306),
 * led by a gun ship, with carriers in at most a third of the slots. The enemy is the area's
 * main fleet, strengthened for the navy's order (#293). Route battles before the main fleet are not played.
 *
 *   npm run sim -- --nations IJN,USN --areas p1,p5 --runs 3 --out docs/balance/sim.md
 *
 * Without --areas every area of each navy is played (--sample 1: the first, a middle and the final area of each
 * theater); without --nations, every playable navy. --pages N plays on N pages at once.
 *
 * --grown 1 (#346): the fleet of a player who has grown with the rank — the research the rank allows, proficiency 40,
 * the first remodel from 大尉 and the second from 大佐 — and from 少佐 a 支援艦隊 (#84) of the next strongest ships.
 * Battles past 300 seconds are listed: a fight with no end in sight (only a submarine left, ships circling out of range).
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const PORT = Number(args.port ?? 5174);
const RUNS = Number(args.runs ?? 3);
/** Battle seconds before a run counts as unfinished (a draw). */
const LIMIT_SEC = Number(args.limit ?? 900);
const STEP_MS = 50;
const GROWN = args.grown !== undefined && args.grown !== '0';
/** A battle this long is listed as one that may never end (#346). */
const LONG_SEC = 300;

async function waitForServer(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no server at ${url}`);
}

const server = args.url ? null : spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = args.url ?? `http://localhost:${PORT}`;
// No GPU: the battle is stepped without drawing, and a software GPU only burns the CPU the battles need.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--disable-gpu'] });
try {
  await waitForServer(base);
  const PAGES = Math.max(1, Number(args.pages ?? 1));
  const pages = [];
  for (let i = 0; i < PAGES; i++) {
    // Separate contexts: each page keeps its own save (localStorage).
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
    await page.goto(`${base}/?layout=landscape`);
    // `window.game` is the page's #game element until the Phaser game takes the name.
    await page.waitForFunction(() => window.game?.scene !== undefined, null, { timeout: 120_000 });
    await page.waitForFunction(() => window.game.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 120_000 });
    pages.push(page);
  }
  const page = pages[0];

  // What to play: [nation, area id] pairs.
  const plan = await page.evaluate(async ({ nations, areas, sample }) => {
    const { PLAYABLE_NATIONS } = await import('/src/config/NationInfo.ts');
    const { theatersFor } = await import('/src/systems/CampaignSystem.ts');
    const data = (await import('/src/data/campaign.json')).default;
    const list = nations ? nations.split(',') : PLAYABLE_NATIONS;
    const wanted = areas ? areas.split(',') : null;
    const out = [];
    for (const n of list) {
      for (const t of theatersFor(data, n)) {
        const areas = data.areas.filter((a) => a.theater === t.id && !a.training && (!wanted || wanted.includes(a.id)));
        // --sample: the first, a middle and the final area of each theater.
        const picked = sample ? [...new Set([areas[0], areas[Math.floor(areas.length / 2)], areas[areas.length - 1]])].filter(Boolean) : areas;
        for (const a of picked) out.push([n, a.id]);
      }
    }
    return out;
  }, { nations: args.nations ?? null, areas: args.areas ?? null, sample: args.sample !== undefined });

  // Each page plays the next pair in the plan; rows keep the plan's order.
  const rows = new Array(plan.length);
  const long = [];
  let next = 0;
  await Promise.all(pages.map(async (p) => {
    while (next < plan.length) {
      const k = next++;
      const [nation, areaId] = plan[k];
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        // A battle that throws is reported and counted as lost, so one bug doesn't stop the whole table.
        const r = await p.evaluate(playOne, { nation, areaId, limitSec: LIMIT_SEC, stepMs: STEP_MS, grown: GROWN }).catch(async (e) => {
          console.error(`${nation} ${areaId}: ${e.message.split('\n')[0]}`);
          await p.reload();
          await p.waitForFunction(() => window.game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 120_000 });
          return { depth: 0, rankName: '?', ratio: 0, victory: false, durationSec: LIMIT_SEC, rank: 'D', survivors: 0, fleetSize: 1, error: true };
        });
        runs.push(r);
        if (r.durationSec >= LONG_SEC) long.push(`${nation} ${areaId}: ${Math.round(r.durationSec)} 秒 (${r.victory ? '勝利' : '敗北'}・撃沈 ${r.sunk ?? '?'})`);
        if (args.verbose) console.log(JSON.stringify({ nation, areaId, ...r }));
      }
      rows[k] = summarize(nation, areaId, runs);
      console.log(line(rows[k]));
    }
  }));
  const table = [
    `| 国 | 海域 | 深さ | 推奨 | 敵 / 自 | 勝率 | 時間 (秒) 平均 (幅) | S / A / B / C / D | 残存 |`,
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(line),
    ...(long.length > 0 ? ['', `${LONG_SEC} 秒を超えた戦闘 (決着のつかない組み合わせの候補):`, ...long.map((l) => `- ${l}`)] : []),
  ].join('\n');
  if (args.out) writeFileSync(args.out, `${table}\n`);
  else console.log(`\n${table}`);
} finally {
  await browser.close();
  server?.kill();
}

function summarize(nation, areaId, runs) {
  const won = runs.filter((r) => r.victory).length;
  const times = runs.map((r) => r.durationSec);
  const ranks = ['S', 'A', 'B', 'C', 'D'].map((k) => runs.filter((r) => r.rank === k).length);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  return {
    nation, areaId, depth: runs[0].depth, rank: runs[0].rankName, ratio: runs[0].ratio,
    win: won / runs.length, time: mean(times), min: Math.min(...times), max: Math.max(...times), ranks,
    left: mean(runs.map((r) => r.survivors / Math.max(1, r.fleetSize))),
  };
}

function line(r) {
  return `| ${r.nation} | ${r.areaId} | ${r.depth} | ${r.rank} | ${r.ratio.toFixed(2)} | ${Math.round(r.win * 100)}% | ${Math.round(r.time)} (${Math.round(r.min)}〜${Math.round(r.max)}) | ${r.ranks.join(' / ')} | ${Math.round(r.left * 100)}% |`;
}

/** Runs in the page: one battle of `nation` against `areaId`'s main fleet, returned as its results. */
async function playOne({ nation, areaId, limitSec, stepMs, grown }) {
  const game = window.game;
  const ps = await import('/src/utils/ProgressStore.ts');
  const { DataLoader } = await import('/src/utils/DataLoader.ts');
  const { FleetSystem } = await import('/src/systems/FleetSystem.ts');
  const { enemyNationFor, enemyShips, areaMode } = await import('/src/systems/CampaignSystem.ts');
  const curve = await import('/src/systems/DifficultyCurve.ts');
  const { RANKS } = await import('/src/systems/RankSystem.ts');
  const { shipGrade, gradeAllowed, isRewardOnly } = await import('/src/systems/ShipyardSystem.ts');
  const { costCap, shipCost } = await import('/src/systems/FleetCost.ts');
  const data = (await import('/src/data/campaign.json')).default;
  const area = data.areas.find((a) => a.id === areaId);
  const depth = curve.areaDepth(data, area, nation);
  const rank = curve.recommendedRank(depth);

  // A save at the recommended rank, every help seen, so nothing stops the battle.
  const helps = (await import('/src/data/screen-help.json')).default.screens?.map((h) => h.id) ?? [];
  let save = ps.switchNation(ps.emptySave(), nation, undefined, Date.now());
  // 初期機 (#385): the first carrier models developed, as a player with carriers would have them.
  const { STARTER_AIRCRAFT } = await import('/src/systems/AircraftSystem.ts');
  save = { ...save, seenHelp: [...helps, 'BattleScene'], nations: { ...save.nations, [nation]: { ...save.nations[nation], merit: RANKS[rank.index].minMerit, rankFloor: rank.index, aircraftDev: STARTER_AIRCRAFT, airStart: true } } };
  if (grown) {
    // The research the rank allows (#346), every branch.
    const tech = (await import('/src/data/tech-tree.json')).default.tech.filter((n) => (n.rank ?? 0) <= rank.index && !(n.medal)).map((n) => n.id);
    save.nations[nation] = { ...save.nations[nation], research: tech };
  }
  ps.saveSave(save);

  const scene = game.scene.getScenes(true)[0] ?? game.scene.getScene('MainMenuScene');
  const registry = DataLoader.getRegistry(scene);
  // A gun ship leads (a carrier flagship sails AUTO straight into torpedoes), and carriers fill at most a third.
  const slots = RANKS[rank.index].slots;
  const pool = registry.byNation(nation)
    // Real ships only: no planned ships, designs (#51) or other navies' copies (#368).
    .filter((s) => !s.fictional && !s.designed && !s.foreign && !isRewardOnly(s) && s.shipClass !== 'Submarine' && gradeAllowed(shipGrade(s), rank.index))
    .sort((x, y) => curve.fleetPower([y]) - curve.fleetPower([x]));
  const guns = pool.filter((s) => s.shipClass !== 'Carrier');
  const carriers = pool.filter((s) => s.shipClass === 'Carrier').slice(0, Math.floor(slots / 3));
  const rest = [...guns.slice(1), ...carriers].sort((x, y) => curve.fleetPower([y]) - curve.fleetPower([x]));
  // Within the rank's cost cap (#306): the strongest that still fit, in that order.
  const cap = costCap(rank.index);
  const ships = [];
  let used = 0;
  for (const s of [guns[0], ...rest].filter(Boolean)) {
    if (ships.length >= slots) break;
    if (used + shipCost(s) > cap) continue;
    ships.push(s);
    used += shipCost(s);
  }
  // 支援艦隊 (#84) from 少佐 in the grown fleet: the next strongest ships, guarding the flagship.
  const support = [];
  if (grown && rank.index >= 6) {
    const left = [...guns, ...carriers].filter((s) => !ships.includes(s));
    const group = [];
    let cost = 0;
    for (const s of left) {
      if (group.length >= slots) break;
      if (cost + shipCost(s) > cap) continue;
      group.push(s);
      cost += shipCost(s);
    }
    if (group.length > 0) support.push({ ships: group, captainIds: group.map(() => null), mission: 'escort' });
  }
  if (grown) {
    // Proficiency 40 and remodels by rank on every ship that sails.
    const stage = rank.index >= 8 ? 2 : rank.index >= 4 ? 1 : 0;
    const all = [...ships, ...support.flatMap((g) => g.ships)];
    const s2 = ps.loadSave();
    s2.nations[nation] = { ...s2.nations[nation], ships: all.map((s) => s.id), proficiency: Object.fromEntries(all.map((s) => [s.id, 40])), refits: Object.fromEntries(all.map((s) => [s.id, stage])) };
    ps.saveSave(s2);
  }
  const enemyNation = enemyNationFor(data, area, nation);
  const enemy = enemyShips(area, registry, enemyNation);
  const ratio = (curve.fleetPower(enemy) * curve.enemyScale(data, area, nation)) / Math.max(1, curve.fleetPower(ships));
  const init = {
    playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', nation, ships, 0),
    enemyFleet: FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', enemyNation, enemy, 0),
    mapKey: area.map, mode: areaMode(enemy), weather: area.weather, time: area.time,
    captainIds: ships.map(() => null), areaId: area.id, objective: area.objective,
    ...(support.length > 0 ? { support } : {}),
  };

  game.loop.sleep();
  // The simulated clock runs ahead of the real one; it must never go back for the next battle on this page.
  let now = Math.max(performance.now(), window.__simNow ?? 0);
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      now += stepMs;
      // The battle clock reads the loop's time (BattleScene.battleNow), which headlessStep leaves alone.
      game.loop.time = now;
      game.loop.delta = stepMs;
      game.headlessStep(now, stepMs);
    }
    window.__simNow = now;
  };
  game.scene.getScenes(true).forEach((s) => s.scene.stop());
  game.scene.start('BattleScene', init);
  step(5);
  const battle = game.scene.getScene('BattleScene');
  battle.setAutoMode(true);
  const results = () => game.scene.getScene('ResultsScene');
  const maxSteps = Math.ceil((limitSec * 1000) / stepMs);
  let steps = 0;
  while (!results()?.sys.settings.active && steps < maxSteps) {
    step(20);
    steps += 20;
    // Keep the page responsive between chunks.
    if (steps % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  // The results may wait on a timer (the sinking of the last ship): give it a little real time too.
  for (let i = 0; i < 50 && !results()?.sys.settings.active; i++) {
    step(20);
    await new Promise((r) => setTimeout(r, 20));
  }
  const res = results()?.sys.settings.active ? results().sys.settings.data : null;
  const b = game.scene.getScene('BattleScene');
  console.log('DBG', JSON.stringify({ res: res && { v: res.victory, why: res.campaign, note: res.rankNote, ev: res.event, t: res.durationSec, title: res.title, reason: res.reason }, fleet: ships.map((s) => s.id), flag: b.flagship?.dataId, flagAlive: b.flagship?.isAlive, enemyDmg: b.damageLog.enemy, myDmg: b.damageLog.player, enemies: b.enemies.map((e) => `${e.dataId}:${e.isAlive ? Math.round(e.stats.currentHp) : 'X'}`) }));
  game.scene.getScenes(true).forEach((s) => s.scene.stop());
  game.loop.wake();
  return res
    ? { depth, rankName: rank.name, ratio, victory: res.victory, durationSec: res.durationSec, sunk: `${res.enemiesSunk}/${res.enemiesTotal}`, note: res.rankNote, why: res.campaign, rank: res.rank, survivors: res.survivors, fleetSize: res.fleetSize }
    : { depth, rankName: rank.name, ratio, victory: false, durationSec: limitSec, rank: 'D', survivors: 0, fleetSize: ships.length };
}
