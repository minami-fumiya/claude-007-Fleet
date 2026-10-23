/**
 * 動作速度の計測 (#99): the benchmark battle — 8 player ships against 10, two carriers on each side — runs in real
 * time in Chromium with the CPU slowed 4× (a mid-range phone), and the fps and the battle logic's time per frame are
 * printed for each layout.
 *
 *   npm run perf -- --seconds 30 --throttle 4
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const PORT = Number(args.port ?? 5175);
const SECONDS = Number(args.seconds ?? 30);
const THROTTLE = Number(args.throttle ?? 4);
const base = args.url ?? `http://localhost:${PORT}`;
const server = args.url ? null : spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

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

/** Starts the benchmark battle in the page and samples fps once a second. */
async function measure(layout, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${base}/?layout=${layout}&fps=1`);
  await page.waitForFunction(() => window.game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 120_000 });
  await page.evaluate(async () => {
    const game = window.game;
    const { DataLoader } = await import('/src/utils/DataLoader.ts');
    const { FleetSystem } = await import('/src/systems/FleetSystem.ts');
    const ps = await import('/src/utils/ProgressStore.ts');
    const helps = (await import('/src/data/screen-help.json')).default.screens.map((h) => h.id);
    ps.saveSave({ ...ps.switchNation(ps.emptySave(), 'IJN', undefined, Date.now()), seenHelp: [...helps, 'BattleScene'] });
    const reg = DataLoader.getRegistry(game.scene.getScene('MainMenuScene'));
    const ids = (list) => list.map((id) => reg.byId(id)).filter(Boolean);
    const player = ids(['yamato', 'nagato', 'shokaku', 'zuikaku', 'takao', 'atago', 'yukikaze', 'shimakaze']);
    const enemy = ids(['iowa', 'missouri', 'essex', 'enterprise', 'baltimore', 'cleveland', 'fletcher', 'gearing', 'sumner', 'benson']);
    game.scene.getScenes(true).forEach((s) => s.scene.stop());
    game.scene.start('BattleScene', {
      playerFleet: FleetSystem.createFleet('p', '第一艦隊', 'IJN', player, 0),
      enemyFleet: FleetSystem.createFleet('e', 'E', 'USN', enemy, 0),
      mapKey: 'open-sea', captainIds: player.map(() => null),
    });
    await new Promise((r) => setTimeout(r, 500));
    game.scene.getScene('BattleScene').setAutoMode(true);
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const samples = [];
  for (let i = 0; i < SECONDS; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const b = window.game.scene.getScene('BattleScene');
      const frames = b.perfFrames ?? [];
      return { fps: window.game.loop.actualFps, logic: frames.length ? frames.reduce((a, x) => a + x, 0) / frames.length : 0, active: b.sys.settings.active };
    });
    if (!s.active) break;
    samples.push(s);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await context.close();
  const fps = samples.map((s) => s.fps).sort((a, b) => a - b);
  const median = fps[Math.floor(fps.length / 2)] ?? 0;
  const low = fps[Math.floor(fps.length * 0.1)] ?? 0;
  const logic = samples.reduce((a, s) => a + s.logic, 0) / Math.max(1, samples.length);
  return { layout, seconds: samples.length, median: Math.round(median), low: Math.round(low), logicMs: logic.toFixed(1) };
}

try {
  await waitForServer(base);
  const rows = [await measure('landscape', { width: 1280, height: 720 }), await measure('portrait', { width: 390, height: 844 })];
  console.log(`CPU ×${THROTTLE}, 8 隻 対 10 隻 (空母 2 隻ずつ)`);
  console.log('| 画面 | 秒 | fps 中央値 | fps 下位 10% | 戦闘の処理 (ms/フレーム) |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.layout} | ${r.seconds} | ${r.median} | ${r.low} | ${r.logicMs} |`);
} finally {
  await browser.close();
  server?.kill();
}
