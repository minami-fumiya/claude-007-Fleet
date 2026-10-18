import { expect, Page, test } from '@playwright/test';

/**
 * Screen smoke tests (#101). Each screen is opened straight from `window.game` with a seeded save, then checked for
 * page errors and for visible text running off the canvas sideways (the usual sign of a layout that doesn't fit).
 */

type GameWindow = Window & { game?: { scene: unknown } };

/** A mid-game Japanese save: several ships, some research, cleared areas, a damaged ship. */
const SAVE = {
  version: 4,
  current: 'IJN',
  record: { sorties: 5 },
  nations: {
    IJN: {
      resources: { fuel: 5000, ammo: 5000, steel: 5000, bauxite: 2000 },
      regenAt: 0,
      damage: { nagato: 0.4 },
      docks: [],
      research: ['build_cruiser', 'build_heavy_cruiser', 'gunnery_1'],
      ships: ['yamato', 'nagato', 'takao', 'sendai', 'fubuki', 'yukikaze', 'akagi', 'i19'],
      upgrades: {},
      refits: {},
      proficiency: { yamato: 45 },
      captainXp: {},
      campaign: ['p1', 'p2', 'p3'],
      presets: [],
    },
  },
};

const SCREENS = [
  'MainMenuScene', 'HomeScene', 'FleetBuilderScene', 'CampaignMapScene', 'ScenarioScene', 'ArsenalScene',
  'ShipyardScene', 'CustomizationScene', 'EncyclopediaScene', 'RecordScene', 'SettingsScene', 'HelpScene',
];

async function boot(page: Page, layout: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?layout=${layout}`);
  await page.waitForFunction(() => (window as GameWindow).game !== undefined, null, { timeout: 60_000 });
  await page.evaluate((save) => {
    localStorage.setItem('ww2fleet.progress.v2', JSON.stringify({ ...save, nations: { IJN: { ...save.nations.IJN, regenAt: Date.now() } } }));
  }, SAVE);
  await page.reload();
  await page.waitForFunction(() => {
    const g = (window as unknown as { game?: Phaser.Game }).game;
    return g?.scene.getScene('MainMenuScene')?.sys.settings.active === true;
  }, null, { timeout: 60_000 });
  return errors;
}

/** Stops every other running scene and (re)starts `key`. */
async function open(page: Page, key: string, data: object = {}): Promise<void> {
  await page.evaluate(([k, d]) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    // Starting a running scene restarts it, so only the others are stopped.
    g.scene.getScenes(true).filter((s) => s.scene.key !== k).forEach((s) => s.scene.stop());
    g.scene.start(k as string, d as object);
  }, [key, data] as const);
  await page.waitForFunction((k) => (window as unknown as { game: Phaser.Game }).game.scene.getScene(k)?.sys.settings.active === true, key);
  await page.waitForTimeout(700);
}

/** Visible texts of `key` sticking out of the canvas left or right, as "text (left..right)". */
async function overflowingTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    const w = g.scale.width;
    const out: string[] = [];
    const visit = (o: Phaser.GameObjects.GameObject, visible: boolean): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0;
      if (o.type === 'Container') {
        (o as Phaser.GameObjects.Container).list.forEach((c) => visit(c, v));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      const b = t.getBounds();
      if (b.left < -2 || b.right > w + 2) out.push(`${t.text.replace(/\n/g, ' ')} (${Math.round(b.left)}..${Math.round(b.right)})`);
    };
    scene.children.list.forEach((o) => visit(o, true));
    return out;
  }, key);
}

test.describe('screens', () => {
  test('every menu screen opens without errors or text off the canvas', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    for (const key of SCREENS) {
      await open(page, key);
      expect(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${key}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('a sortie: pick ships, deploy, pause and resume the battle', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'FleetBuilderScene');
    // The slot picker (#77): one ship per slot, never the same ship twice (#76).
    const fleet = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; slots: Array<{ id: string } | null>;
        openPicker(i: number): void; pickShip(s: { id: string }): void; refresh(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.openPicker(1);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.pickShip(s.ships.find((x) => x.id === 'fubuki')!);
      return s.slots.map((x) => x?.id ?? null);
    });
    expect(fleet.slice(0, 2)).toEqual(['yamato', 'fubuki']);
    await page.screenshot({ path: info.outputPath('builder.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { startBattle(): void };
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.waitForTimeout(2500);
    // Pause (#79): the battle clock stops while paused.
    const paused = await page.evaluate(async () => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void; battleNow(): number };
      b.setPaused(true);
      const before = b.battleNow();
      await new Promise((r) => setTimeout(r, 600));
      const after = b.battleNow();
      b.setPaused(false);
      return after - before;
    });
    expect(paused).toBe(0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath('battle.png') });
    expect(errors).toEqual([]);
  });
});
