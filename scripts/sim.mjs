/**
 * 戦闘の模擬 (#320): plays campaign battles in AUTO, headless and fast-forwarded, in the real game, and prints a
 * table per area: win rate, battle time (mean and range), the ranks S〜D and the player's ships left afloat.
 *
 * The player's fleet is the one of the area's recommended rank (DifficultyCurve.recommendedRank): as many ships as the
 * rank's slots, the strongest the rank may build (no fictional, reward-only or submarine). The enemy is the area's
 * main fleet, strengthened for the navy's order (#293). Route battles before the main fleet are not played.
 *
 *   npm run sim -- --nations IJN,USN --areas p1,p5 --runs 3 --out docs/balance/sim.md
 *
 * Without --areas every area of each navy is played; without --nations, every playable navy.
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  await waitForServer(base);
  const PAGES = Math.max(1, Number(args.pages ?? 1));
  const pages = [];
  for (let i = 0; i < PAGES; i++) {
    // Separate contexts: each page keeps its own save (localStorage).
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(`${base}/?layout=landscape`);
    await page.waitForFunction(() => window.game !== undefined, null, { timeout: 120_000 });
    await page.waitForFunction(() => window.game.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 120_000 });
    pages.push(page);
  }
  const page = pages[0];

  // What to play: [nation, area id] pairs.
  const plan = await page.evaluate(async ({ nations, areas }) => {
    const { PLAYABLE_NATIONS } = await import('/src/config/NationInfo.ts');
    const { theatersFor } = await import('/src/systems/CampaignSystem.ts');
    const data = (await import('/src/data/campaign.json')).default;
    const list = nations ? nations.split(',') : PLAYABLE_NATIONS;
    const wanted = areas ? areas.split(',') : null;
    const out = [];
    for (const n of list) {
      const theaters = new Set(theatersFor(data, n).map((t) => t.id));
      for (const a of data.areas) if (theaters.has(a.theater) && !a.training && (!wanted || wanted.includes(a.id))) out.push([n, a.id]);
    }
    return out;
  }, { nations: args.nations ?? null, areas: args.areas ?? null });

  // Each page plays the next pair in the plan; rows keep the plan's order.
  const rows = new Array(plan.length);
  let next = 0;
  await Promise.all(pages.map(async (p) => {
    while (next < plan.length) {
      const k = next++;
      const [nation, areaId] = plan[k];
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const r = await p.evaluate(playOne, { nation, areaId, limitSec: LIMIT_SEC, stepMs: STEP_MS });
        runs.push(r);
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
async function playOne({ nation, areaId, limitSec, stepMs }) {
  const game = window.game;
  const ps = await import('/src/utils/ProgressStore.ts');
  const { DataLoader } = await import('/src/utils/DataLoader.ts');
  const { FleetSystem } = await import('/src/systems/FleetSystem.ts');
  const { enemyNationFor, enemyShips, areaMode } = await import('/src/systems/CampaignSystem.ts');
  const curve = await import('/src/systems/DifficultyCurve.ts');
  const { RANKS } = await import('/src/systems/RankSystem.ts');
  const { shipGrade, gradeAllowed, isRewardOnly } = await import('/src/systems/ShipyardSystem.ts');
  const data = (await import('/src/data/campaign.json')).default;
  const area = data.areas.find((a) => a.id === areaId);
  const depth = curve.areaDepth(data, area, nation);
  const rank = curve.recommendedRank(depth);

  // A save at the recommended rank, every help seen, so nothing stops the battle.
  const helps = (await import('/src/data/screen-help.json')).default.screens?.map((h) => h.id) ?? [];
  let save = ps.switchNation(ps.emptySave(), nation, undefined, Date.now());
  save = { ...save, seenHelp: [...helps, 'BattleScene'], nations: { ...save.nations, [nation]: { ...save.nations[nation], merit: RANKS[rank.index].minMerit, rankFloor: rank.index } } };
  ps.saveSave(save);

  const scene = game.scene.getScenes(true)[0] ?? game.scene.getScene('MainMenuScene');
  const registry = DataLoader.getRegistry(scene);
  const ships = registry.byNation(nation)
    .filter((s) => !s.fictional && !isRewardOnly(s) && s.shipClass !== 'Submarine' && gradeAllowed(shipGrade(s), rank.index))
    .sort((x, y) => curve.fleetPower([y]) - curve.fleetPower([x]))
    .slice(0, RANKS[rank.index].slots);
  const enemyNation = enemyNationFor(data, area, nation);
  const enemy = enemyShips(area, registry, enemyNation);
  const ratio = (curve.fleetPower(enemy) * curve.enemyScale(data, area, nation)) / Math.max(1, curve.fleetPower(ships));
  const init = {
    playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', nation, ships, 0),
    enemyFleet: FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', enemyNation, enemy, 0),
    mapKey: area.map, mode: areaMode(enemy), weather: area.weather, time: area.time,
    captainIds: ships.map(() => null), areaId: area.id, objective: area.objective,
  };

  game.loop.sleep();
  let now = performance.now();
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      now += stepMs;
      // The battle clock reads the loop's time (BattleScene.battleNow), which headlessStep leaves alone.
      game.loop.time = now;
      game.loop.delta = stepMs;
      game.headlessStep(now, stepMs);
    }
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
  game.scene.getScenes(true).forEach((s) => s.scene.stop());
  game.loop.wake();
  return res
    ? { depth, rankName: rank.name, ratio, victory: res.victory, durationSec: res.durationSec, sunk: `${res.enemiesSunk}/${res.enemiesTotal}`, rank: res.rank, survivors: res.survivors, fleetSize: res.fleetSize }
    : { depth, rankName: rank.name, ratio, victory: false, durationSec: limitSec, rank: 'D', survivors: 0, fleetSize: ships.length };
}
