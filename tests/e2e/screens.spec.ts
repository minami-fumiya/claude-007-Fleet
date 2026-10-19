import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The last released version's save (tests/fixtures/saves): a release must load it without losing anything. */
const PREVIOUS_SAVE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'saves', 'save-0.0.25.json'), 'utf8');

/**
 * Screen smoke tests (#101). Each screen is opened straight from `window.game` with a seeded save, then checked for
 * page errors and for visible text running off the canvas sideways (the usual sign of a layout that doesn't fit).
 */

type GameWindow = Window & { game?: { scene: unknown } };

/** A mid-game Japanese save: several ships, some research, cleared areas, a damaged ship. */
const SAVE = {
  version: 5,
  tutorial: { step: 0, done: true },
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
      merit: 300,
      rankFloor: 0,
      docksOwned: 2,
    },
  },
};

const SCREENS = [
  'MainMenuScene', 'HomeScene', 'FleetBuilderScene', 'CampaignMapScene', 'ScenarioScene', 'ArsenalScene',
  'ShipyardScene', 'CustomizationScene', 'EncyclopediaScene', 'RecordScene', 'SettingsScene', 'HelpScene',
  'CaptainScene', 'BaseScene',
];

/** `lastSeen`: the version whose 更新内容 (#205) counts as read; the default hides the sheet so screens stay clear. */
async function boot(page: Page, layout: string, save: object = SAVE, lastSeen = '99.0.0'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?layout=${layout}`);
  await page.waitForFunction(() => (window as GameWindow).game !== undefined, null, { timeout: 60_000 });
  await page.evaluate(([s, seen]) => {
    const data = s as typeof SAVE;
    localStorage.setItem('ww2fleet.progress.v2', JSON.stringify({ ...data, nations: { IJN: { ...data.nations.IJN, regenAt: Date.now() } } }));
    localStorage.setItem('ww2fleet.settings.v1', JSON.stringify({ lastSeenVersion: seen }));
  }, [save, lastSeen] as const);
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

/**
 * Visible texts of `key` sticking out of the canvas, as "text (left..right, top..bottom)". Sideways always counts;
 * below the bottom edge counts on screens that don't scroll (the settings once ran off the bottom, 0.0.12). Rows
 * inside masked scrolling lists are skipped.
 */
async function overflowingTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    const w = g.scale.width;
    const h = g.scale.height;
    const scrolls = scene.cameras.main.useBounds;
    const out: string[] = [];
    const visit = (o: Phaser.GameObjects.GameObject, visible: boolean): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0;
      if ((o as unknown as { mask?: unknown }).mask) return;
      if (o.type === 'Container') {
        (o as Phaser.GameObjects.Container).list.forEach((c) => visit(c, v));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      const b = t.getBounds();
      const below = !scrolls && t.scrollFactorY !== 0 ? b.bottom > h + 2 : t.scrollFactorY === 0 && b.bottom > h + 2;
      if (b.left < -2 || b.right > w + 2 || below) out.push(`${t.text.replace(/\n/g, ' ')} (${Math.round(b.left)}..${Math.round(b.right)}, ${Math.round(b.top)}..${Math.round(b.bottom)})`);
    };
    scene.children.list.forEach((o) => visit(o, true));
    return out;
  }, key);
}

/**
 * Visible texts that overlap another visible text (#163): "a × b" for each pair crossing by more than a few pixels both
 * ways. Only texts at the same depth count: a sheet over the screen, or content scrolling under a fixed bar, is meant
 * to cover what lies beneath. Masked (scroll list) texts are left out like in overflowingTexts.
 */
async function overlappingTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    // Buttons count as boxes too (#182): a text running under a button's face is hidden even if it misses the label.
    const boxes: Array<{ text: string; b: Phaser.Geom.Rectangle; depth: number; owner: unknown }> = [];
    const visit = (o: Phaser.GameObjects.GameObject, visible: boolean, depth: number, owner: unknown): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0.05;
      if ((o as unknown as { mask?: unknown }).mask) return;
      if (o.type === 'Container') {
        const c = o as Phaser.GameObjects.Container;
        const label = c.list.find((x) => x.type === 'Text') as Phaser.GameObjects.Text | undefined;
        // The button's face is its hit area (its bounds also take in the glow around it).
        const hit = c.input?.hitArea as Phaser.Geom.Rectangle | undefined;
        if (v && hit && label) {
          const m = c.getWorldTransformMatrix();
          // Container hit areas are measured from the container's top-left (its display origin back from x, y).
          const face = new Phaser.Geom.Rectangle(m.tx + (hit.x - c.displayOriginX) * m.scaleX, m.ty + (hit.y - c.displayOriginY) * m.scaleY, hit.width * m.scaleX, hit.height * m.scaleY);
          boxes.push({ text: `[${label.text.replace(/\n/g, ' ').slice(0, 16)}]`, b: face, depth, owner: c });
        }
        c.list.forEach((x) => visit(x, v, depth, c.input ? c : owner));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      boxes.push({ text: t.text.replace(/\n/g, ' ').slice(0, 24), b: t.getBounds(), depth, owner });
    };
    scene.children.list.forEach((o) => visit(o, true, (o as unknown as { depth: number }).depth, undefined));
    const out: string[] = [];
    const SLACK = 3;
    boxes.forEach((a, i) => {
      for (const c of boxes.slice(i + 1)) {
        if (c.depth !== a.depth) continue;
        // A button and its own label, or two buttons (they may share a frame), are not a clash.
        if ((a.owner && a.owner === c.owner) || (a.text.startsWith('[') && c.text.startsWith('['))) continue;
        const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
        const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
        if (w > SLACK && h > SLACK) out.push(`${a.text} × ${c.text}`);
      }
    });
    return out;
  }, key);
}

test.describe('screens', () => {
  test('every menu screen opens without errors or text off the canvas', async ({ page }, info) => {
    // Fourteen screens, each checked for overflow and overlaps.
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    for (const key of SCREENS) {
      await open(page, key);
      expect(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
      expect.soft(await overlappingTexts(page, key), `${key} overlaps (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${key}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('the shipyard rank line and the research button never overlap, for every class (#182)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ShipyardScene'] });
    await open(page, 'ShipyardScene');
    for (const cls of ['Destroyer', 'Submarine', 'Cruiser', 'Carrier', 'Battleship']) {
      await page.evaluate((c) => {
        const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { shipClass: string; refresh(): void };
        s.shipClass = c;
        s.refresh();
      }, cls);
      expect(await overflowingTexts(page, 'ShipyardScene'), `${cls} (${layout})`).toEqual([]);
      expect.soft(await overlappingTexts(page, 'ShipyardScene'), `${cls} overlaps (${layout})`).toEqual([]);
    }
    await page.screenshot({ path: info.outputPath('shipyard-battleship.png') });
    expect(errors).toEqual([]);
  });

  test('the scenario list pages through 13 battles and a 7-vs-7 one starts (#71)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ScenarioScene'] });
    await open(page, 'ScenarioScene');
    const listed = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as {
        scenarios: Array<{ id: string }>; selected: number; theater: string; page: number; drawList(): void; refresh(): void;
      };
      s.theater = 'pacific';
      s.page = 1;
      s.selected = s.scenarios.findIndex((x) => x.id === 'leyte-gulf');
      s.drawList();
      s.refresh();
      return s.scenarios.length;
    });
    expect(listed).toBe(13);
    expect(await overflowingTexts(page, 'ScenarioScene'), `scenarios (${layout})`).toEqual([]);
    expect.soft(await overlappingTexts(page, 'ScenarioScene'), `scenarios overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('scenarios.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as { scenarios: unknown[]; selected: number; start(sc: unknown): void };
      s.start(s.scenarios[s.selected]);
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.waitForTimeout(2500);
    const sizes = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { escorts: unknown[]; enemies: unknown[] };
      return { mine: b.escorts.length + 1, enemy: b.enemies.length };
    });
    expect(sizes).toEqual({ mine: 7, enemy: 7 });
    await page.screenshot({ path: info.outputPath('scenario-battle.png') });
    expect(errors).toEqual([]);
  });

  test('every scenario and side lists its ships by kind and fits (#196)', async ({ page }, info) => {
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ScenarioScene'] });
    await open(page, 'ScenarioScene');
    type S = { scenarios: Array<{ id: string; sides: unknown[] }>; selected: number; side: number; theater: string; drawList(): void; refresh(): void; detail: Array<{ type: string; text?: string }> };
    const count = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as S).scenarios.length);
    const problems: string[] = [];
    for (let i = 0; i < count; i++) {
      for (let side = 0; side < 2; side++) {
        const text = await page.evaluate(([idx, sd]) => {
          const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as S;
          s.selected = idx;
          s.side = sd;
          s.refresh();
          return s.detail.filter((o) => o.type === 'Text').map((o) => o.text ?? '').join('|');
        }, [i, side] as const);
        if (!/隻 — /.test(text)) problems.push(`${i}/${side}: no kind headline`);
        const over = [...await overflowingTexts(page, 'ScenarioScene'), ...await overlappingTexts(page, 'ScenarioScene')];
        if (over.length > 0) problems.push(`${i}/${side}: ${over.join(', ')}`);
      }
    }
    await page.screenshot({ path: info.outputPath('scenario-lineup.png') });
    expect(problems, layout).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a save full of ships, captains and cleared areas still fits every screen (#163)', async ({ page }, info) => {
    // Fourteen screens, each checked for overflow and overlaps.
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const read = (f: string): { ships?: Array<{ id: string; fictional?: boolean }> } => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', f), 'utf8'));
    const ships = read('ships/ijn.json').ships!.filter((s) => !s.fictional).map((s) => s.id);
    const captains = (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'captains.json'), 'utf8')) as { captains?: Array<{ id: string; nation: string }> } | Array<{ id: string; nation: string }>);
    const ijnCaptains = (Array.isArray(captains) ? captains : captains.captains ?? []).filter((c) => c.nation === 'IJN').map((c) => c.id);
    const campaign = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'm1', 'm2', 'm3', 'm4'];
    const heavy = {
      ...SAVE,
      version: 7,
      seenHelp: SCREENS,
      nations: { IJN: { ...SAVE.nations.IJN, ships, captains: ijnCaptains, captainXp: Object.fromEntries(ijnCaptains.map((id, i) => [id, i * 40_000])), campaign, merit: 20_000, proficiency: Object.fromEntries(ships.map((id) => [id, 80])) } },
    };
    const errors = await boot(page, layout, heavy);
    for (const key of SCREENS) {
      await open(page, key);
      expect.soft(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
      expect.soft(await overlappingTexts(page, key), `${key} overlaps (${layout})`).toEqual([]);
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
        openPicker(i: number): void; pickShip(s: { id: string }): void; refresh(): void; moveUp(i: number): void;
      };
      const pick = (slot: number, id: string): void => { s.openPicker(slot); s.pickShip(s.ships.find((x) => x.id === id)!); };
      pick(0, 'yamato');
      pick(1, 'fubuki');
      // Picking a ship already in the fleet swaps the two slots (#147).
      pick(1, 'yamato');
      const swapped = s.slots.map((x) => x?.id ?? null);
      // ▲ moves a ship one slot up.
      s.moveUp(1);
      return { swapped, after: s.slots.map((x) => x?.id ?? null) };
    });
    expect(fleet.swapped.slice(0, 2)).toEqual(['fubuki', 'yamato']);
    expect(fleet.after.slice(0, 2)).toEqual(['yamato', 'fubuki']);
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
    // The pause sheet shows the objective and progress (#189), inside the sheet and above its buttons.
    const sheet = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as {
        setPaused(p: boolean): void; pauseLayer: Phaser.GameObjects.GameObject[];
      };
      b.setPaused(true);
      const info = b.pauseLayer.find((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text.startsWith('作戦目標')) as Phaser.GameObjects.Text;
      const buttons = b.pauseLayer.filter((o) => o.type === 'Container') as Phaser.GameObjects.Container[];
      const r = info.getBounds();
      return { text: info.text, bottom: r.bottom, firstButtonTop: Math.min(...buttons.map((c) => c.y - c.height / 2)) };
    });
    await page.screenshot({ path: info.outputPath('battle-paused.png') });
    expect(sheet.text).toContain('経過');
    expect(sheet.text).toContain('敵艦  撃沈');
    expect(sheet.bottom).toBeLessThan(sheet.firstButtonTop);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void }).setPaused(false));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath('battle.png') });
    expect(errors).toEqual([]);
  });

  test('the 図鑑 and the 改装 screen open each other on the same ship (#178)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    type G = { game: Phaser.Game };
    const shipId = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.ships.at(-1) as string);
    await open(page, 'EncyclopediaScene', { tab: 'ships', id: shipId });
    expect(await page.evaluate(() => ((window as unknown as G).game.scene.getScene('EncyclopediaScene') as unknown as { selectedId: string }).selectedId)).toBe(shipId);
    expect(await overflowingTexts(page, 'EncyclopediaScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'EncyclopediaScene')).toEqual([]);
    await page.screenshot({ path: info.outputPath('encyclopedia-ship.png') });
    const press = (key: string, label: string): Promise<void> => page.evaluate(([k, l]) => {
      const scene = (window as unknown as G).game.scene.getScene(k);
      const btn = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((c) => (c as Phaser.GameObjects.Text).text?.startsWith(l)));
      btn!.emit('pointerdown');
      btn!.emit('pointerup');
    }, [key, label] as const);
    await press('EncyclopediaScene', '改装・改造');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('CustomizationScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    const refit = await page.evaluate(() => {
      const s = (window as unknown as G).game.scene.getScene('CustomizationScene') as unknown as { ships: Array<{ id: string }>; selected: number };
      return s.ships[s.selected].id;
    });
    expect(refit).toBe(shipId);
    await page.screenshot({ path: info.outputPath('refit-from-encyclopedia.png') });
    await press('CustomizationScene', '図鑑');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('EncyclopediaScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ((window as unknown as G).game.scene.getScene('EncyclopediaScene') as unknown as { selectedId: string }).selectedId)).toBe(shipId);
    expect(errors).toEqual([]);
  });

  test('the captain screen tells how captains join, without naming who is next (#179 #215)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['CaptainScene'] });
    await open(page, 'CaptainScene');
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as { openRecruitInfo(): void }).openRecruitInfo());
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('captain-recruits.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('help lists every formation, and the title copy fits (#197)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HelpScene'] });
    expect(await overflowingTexts(page, 'MainMenuScene')).toEqual([]);
    await open(page, 'HelpScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HelpScene') as unknown as { tab: string; refresh(): void };
      s.tab = 'formations';
      s.refresh();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('help-formations.png') });
    expect(await overflowingTexts(page, 'HelpScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'HelpScene')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a 艦長教本 goes to the captain the player picks, and traits show their progress (#199)', async ({ page }, info) => {
    const save = { ...SAVE, version: 13, seenHelp: ['CaptainScene'], nations: { IJN: { ...SAVE.nations.IJN, captains: ['ijn_sakai', 'ijn_murase'], items: { fastRepair: 0, fastBuild: 0, captainBook: 1 } } } };
    const errors = await boot(page, info.project.metadata.layout as string, save);
    await open(page, 'CaptainScene');
    await page.screenshot({ path: info.outputPath('captain-book.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'CaptainScene')).toEqual([]);
    const r = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as {
        selectedId: string; useBook(c: { id: string; name: string }): void; children: { list: Array<{ type: string; text?: string }> };
      };
      const xp = (): number => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.captainXp[s.selectedId] ?? 0;
      const traits = s.children.list.some((o) => o.type === 'Text' && /夜戦で 3 隻撃沈 — \d+ \/ 3/.test(o.text ?? ''));
      const before = xp();
      s.useBook({ id: s.selectedId, name: '' });
      return { gained: xp() - before, books: JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.items.captainBook, traits };
    });
    expect(r).toEqual({ gained: 300, books: 0, traits: true });
    expect(errors).toEqual([]);
  });

  test('a new version shows its 更新内容 on the title once (#205)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, SAVE, '0.0.20-alpha');
    type M = { changesLayer: unknown[]; children: { list: Array<{ type: string; list?: Array<{ text?: string }>; emit(e: string): void }> } };
    const shown = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M).changesLayer.length);
    expect(shown).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('changes.png') });
    expect(await overflowingTexts(page, 'MainMenuScene')).toEqual([]);
    // 閉じる marks the version seen; the next visit shows nothing.
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M;
      const close = s.children.list.find((o) => o.type === 'Container' && (o.list ?? []).some((c) => c.text === '閉じる'))!;
      close.emit('pointerdown');
      close.emit('pointerup');
    });
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.settings.v1')!).lastSeenVersion as string);
    expect(seen).toMatch(/^0\.0\.\d+-alpha/);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M).changesLayer.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("today's and tomorrow's event schedule opens from the home banner and fits (#218)", async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HomeScene'] });
    await open(page, 'HomeScene');
    for (const ahead of [0, 1]) {
      await page.evaluate((a) => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openEventSchedule(n: number): void }).openEventSchedule(a), ahead);
      await page.waitForTimeout(300);
      await page.screenshot({ path: info.outputPath(`events-${ahead}.png`) });
      expect(await overflowingTexts(page, 'HomeScene'), `day +${ahead}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('編成 from the menu moves on to 作戦 or 演習 instead of a sortie (#109)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'FleetBuilderScene', { organize: true });
    await page.screenshot({ path: info.outputPath('organize.png') });
    const organize = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { organizeOnly: boolean; startBtn: { list: Array<{ text?: string }> } };
      return { organize: s.organizeOnly, label: s.startBtn.list.map((o) => o.text).filter(Boolean).join('') };
    });
    expect(organize).toEqual({ organize: true, label: '作戦へ  ›' });
    expect(errors).toEqual([]);
  });

  test('a new save plays without a tutorial (postponed to the end of the alpha, #90)', async ({ page }, info) => {
    const fresh = { ...SAVE, tutorial: { step: 0, done: false }, nations: { IJN: { ...SAVE.nations.IJN, merit: 0, ships: ['fubuki'], campaign: [] } } };
    const errors = await boot(page, info.project.metadata.layout as string, fresh);
    await open(page, 'HomeScene');
    expect(await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.get('tutorial.seen'))).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("the previous release's save loads with its fleet (CLAUDE.md: セーブデータを消さない)", async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?layout=${info.project.metadata.layout as string}`);
    await page.waitForFunction(() => (window as GameWindow).game !== undefined, null, { timeout: 60_000 });
    await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('ww2fleet.progress.v2', raw); }, PREVIOUS_SAVE);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await open(page, 'HomeScene');
    const stored = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { version?: number; nations?: Record<string, { ships: string[] }> };
      const backups = JSON.parse(localStorage.getItem('ww2fleet.progress.backups') ?? '[]') as Array<{ reason: string }>;
      return { version: save.version ?? 0, ships: save.nations?.IJN?.ships ?? [], backups: backups.map((b) => b.reason) };
    });
    const before = (JSON.parse(PREVIOUS_SAVE) as { nations: { IJN: { ships: string[] } } }).nations.IJN.ships;
    expect(stored.ships).toEqual(expect.arrayContaining(before));
    // An older format is backed up before it is migrated; the same format is loaded as is.
    if ((JSON.parse(PREVIOUS_SAVE) as { version: number }).version < stored.version) expect(stored.backups).toContain('migration');
    await page.screenshot({ path: info.outputPath('previous-save-home.png') });
    expect(errors).toEqual([]);
  });

  test('the encyclopedia shows every tab, owned-only and everything (#43 #44 #91)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'EncyclopediaScene');
    for (const tab of ['ships', 'captains', 'aircraft', 'ground']) {
      for (const ownedOnly of [true, false]) {
        await page.evaluate(([t, o]) => {
          const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('EncyclopediaScene') as unknown as { tab: string; ownedOnly: boolean; selectedId: string; refresh(): void };
          s.tab = t as string;
          s.ownedOnly = o as boolean;
          s.selectedId = '';
          s.refresh();
        }, [tab, ownedOnly] as const);
        expect(await overflowingTexts(page, 'EncyclopediaScene'), `${tab} ${ownedOnly}`).toEqual([]);
      }
      await page.screenshot({ path: info.outputPath(`encyclopedia-${tab}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('home: menu tabs, the base picker and first-visit help (#61 #88)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: [] });
    await open(page, 'HomeScene');
    // A screen not seen yet explains itself once.
    expect(await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene');
      return s.children.list.some((o) => (o as Phaser.GameObjects.Text).text === 'はじめての画面');
    })).toBe(true);
    await page.screenshot({ path: info.outputPath('home-help.png') });
    for (const tab of ['sortie', 'fleet', 'arsenal', 'record']) {
      await page.evaluate((t) => {
        const g = (window as unknown as { game: Phaser.Game }).game;
        g.registry.set('home.tab', t);
        (g.scene.getScene('HomeScene') as unknown as { buildMenu(): void }).buildMenu();
      }, tab);
      expect(await overflowingTexts(page, 'HomeScene'), `${tab} (${layout})`).toEqual([]);
    }
    // 軍港 (#145 / #146): bases, their theaters and facilities.
    await open(page, 'BaseScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BaseScene') as unknown as { build(b: { id: string }, id: string): void };
      s.build({ id: 'ijn_home' }, 'fuelTank');
    });
    const jobs = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.facilityJobs as Array<{ id: string }>);
    expect(jobs.map((j) => j.id)).toEqual(['fuelTank']);
    expect(await overflowingTexts(page, 'BaseScene'), `bases (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('home-bases.png') });
    expect(errors).toEqual([]);
  });

  test('quests, sweeping a won area and the event line (#52 #57 #89 #158)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const save = { ...SAVE, version: 8, nations: { IJN: { ...SAVE.nations.IJN, perfect: ['p2'] } } };
    const errors = await boot(page, layout, save);
    await open(page, 'HomeScene');
    for (const kind of ['hourly', 'daily', 'weekly', 'once', 'rank']) {
      await page.evaluate((k) => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openQuests(k: string): void }).openQuests(k), kind);
      expect(await overflowingTexts(page, 'HomeScene'), `${kind} (${layout})`).toEqual([]);
      expect.soft(await overlappingTexts(page, 'HomeScene'), `${kind} overlaps (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`quests-${kind}.png`) });
    }
    await page.screenshot({ path: info.outputPath('quests.png') });
    await open(page, 'CampaignMapScene');
    const swept = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { selectArea(id: string): void; sweep(a: unknown): void; selected: unknown; status: string };
      s.selectArea('p2');
      s.sweep(s.selected);
      const stored = JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { nations: { IJN: { quests: { totals: Record<string, number> } } } };
      return { status: s.status, sweeps: stored.nations.IJN.quests.totals.sweep };
    });
    expect(swept.status).toContain('掃討完了');
    expect(swept.sweeps).toBe(1);
    expect(await overflowingTexts(page, 'CampaignMapScene'), `sweep (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('sweep.png') });
    expect(errors).toEqual([]);
  });

  test('captains: pick a skill for a slot, confirm it, and see it in the colour-coded bonus (#130 / #131)', async ({ page }, info) => {
    const save = { ...SAVE, version: 7, seenHelp: ['CaptainScene'], nations: { IJN: { ...SAVE.nations.IJN, captainXp: { ijn_sakai: 60_000 }, captainSkills: { ijn_sakai: ['Torpedo'] } } } };
    const errors = await boot(page, info.project.metadata.layout as string, save);
    await open(page, 'CaptainScene', { id: 'ijn_sakai' });
    await page.screenshot({ path: info.outputPath('captain.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'CaptainScene'), 'overlaps').toEqual([]);
    type Scene = { openPicker(c: unknown, slot: number): void; confirmLearn(c: unknown, slot: number, s: string): void; applyLearn(c: unknown, slot: number, s: string): void; owned(): Array<{ id: string }> };
    const call = (fn: string, slot: number, skill?: string) => page.evaluate(([f, i, k]) => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as Scene & Record<string, (...a: unknown[]) => void>;
      s[f as string](s.owned().find((c) => c.id === 'ijn_sakai'), i, k);
    }, [fn, slot, skill] as const);
    await call('openPicker', 0);
    await page.screenshot({ path: info.outputPath('captain-picker.png') });
    // Replacing 雷撃 asks first and names what it drops.
    await call('confirmLearn', 0, 'Night');
    await page.screenshot({ path: info.outputPath('captain-confirm.png') });
    await call('applyLearn', 0, 'Night');
    const learned = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.captainSkills.ijn_sakai);
    expect(learned).toEqual(['Night']);
    expect(errors).toEqual([]);
  });

  test('改装 lists every owned ship, steps through them and opens the ship list (#144)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['CustomizationScene'] });
    await open(page, 'CustomizationScene', { returnTo: 'HomeScene', scope: 'all' });
    const count = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as { ships: unknown[] };
      return s.ships.length;
    });
    expect(count).toBe(SAVE.nations.IJN.ships.length);
    await page.screenshot({ path: info.outputPath('customize.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as { openShipList(): void };
      s.openShipList();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('customize-list.png') });
    expect(await overflowingTexts(page, 'CustomizationScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'CustomizationScene'), 'overlaps').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('建造 takes time: lay down a ship, see the countdown, finish it with a 高速建造材 (#143)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['ShipyardScene', 'HomeScene', 'RecordScene'] });
    await open(page, 'ShipyardScene');
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN as { builds: Array<{ shipId: string }>; ships: string[]; items: { fastBuild: number } });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { build(ship: unknown): void; classShips(): Array<{ id: string }> };
      const target = s.classShips().find((x) => x.id === 'etorofu');
      s.build(target);
    });
    let np = await read();
    expect(np.builds.map((b) => b.shipId)).toEqual(['etorofu']);
    expect(np.ships).not.toContain('etorofu');
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('shipyard-building.png') });
    // Tapping it again spends a 高速建造材 (migrated saves get two).
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { build(ship: unknown): void; classShips(): Array<{ id: string }> };
      s.build(s.classShips().find((x) => x.id === 'etorofu'));
    });
    np = await read();
    expect(np.ships).toContain('etorofu');
    expect(np.items.fastBuild).toBe(1);
    await open(page, 'HomeScene');
    await page.screenshot({ path: info.outputPath('home-docks.png') });
    // The build's cost shows in the ledger (#137).
    await open(page, 'RecordScene', { view: 'ledger' });
    await page.screenshot({ path: info.outputPath('ledger.png') });
    expect(await overflowingTexts(page, 'RecordScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'RecordScene'), 'overlaps').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('nations open step by step: the others wait for the first nation (#134)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HomeScene'] });
    await open(page, 'HomeScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openNationPicker(closable: boolean): void; selectNation(n: string): void };
      s.openNationPicker(true);
      // A locked nation can't be picked.
      s.selectNation('USN');
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('nations-locked.png') });
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).current);
    expect(current).toBe('IJN');
    expect(errors).toEqual([]);
  });

  test('the backup list opens as a sheet that fits the screen (#157)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: [] });
    await page.evaluate(() => {
      const raw = localStorage.getItem('ww2fleet.progress.v2')!;
      const list = Array.from({ length: 5 }, (_, i) => ({ at: Date.now() - i * 3_600_000, version: 9, reason: i % 2 ? 'migration' : 'reset', raw }));
      localStorage.setItem('ww2fleet.progress.backups', JSON.stringify(list));
    });
    await open(page, 'SettingsScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { backupsOpen: boolean; refresh(): void };
      s.backupsOpen = true;
      s.refresh();
    });
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'SettingsScene')).toEqual([]);
    expect(await overlappingTexts(page, 'SettingsScene')).toEqual([]);
    await page.screenshot({ path: info.outputPath('backups.png') });
    expect(errors).toEqual([]);
  });

  test('a campaign sortie fights its escorts first, then advances to the main fleet (#53)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.set('campaign.area', 'p4'));
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; startBattle(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const first = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown }; setPaused(p: boolean): void; triggerGameOver(v: boolean): void };
      const sortie = b.battleData.sortie;
      b.setPaused(false);
      b.triggerGameOver(true);
      return sortie;
    });
    expect(first).toEqual({ node: 1, battles: 2, boss: false });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await page.screenshot({ path: info.outputPath('sortie-advance.png') });
    expect(await page.evaluate(() => {
      const r = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene');
      const btn = r.children.list.find((o) => ((o as Phaser.GameObjects.Container).list ?? []).some((c) => (c as Phaser.GameObjects.Text).text?.startsWith('進撃')));
      btn?.emit('pointerdown');
      btn?.emit('pointerup');
      return btn !== undefined;
    })).toBe(true);
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const second = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown } }).battleData.sortie);
    expect(second).toEqual({ node: 2, battles: 2, boss: true });
    expect(errors).toEqual([]);
  });

  test('a sortie left after its first battle is continued from the map after a reload (#138)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.set('campaign.area', 'p4'));
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; startBattle(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void; triggerGameOver(v: boolean): void };
      b.setPaused(false);
      b.triggerGameOver(true);
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    // Close the game on the results screen: the sortie is in the save.
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await open(page, 'CampaignMapScene');
    await page.screenshot({ path: info.outputPath('sortie-resume.png') });
    expect(await overflowingTexts(page, 'CampaignMapScene')).toEqual([]);
    expect.soft(await overlappingTexts(page, 'CampaignMapScene'), 'overlaps').toEqual([]);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { resume(): void }).resume());
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const node = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown } }).battleData.sortie);
    expect(node).toEqual({ node: 2, battles: 2, boss: true });
    expect(errors).toEqual([]);
  });

  test('rank list, nation reset and the version on the title (#128 #129 #136)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    await open(page, 'HomeScene');
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openRanks(): void }).openRanks());
    expect(await overflowingTexts(page, 'HomeScene'), `ranks (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('ranks.png') });
    await open(page, 'SettingsScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { nationResetOpen: boolean; resetOneNation(n: string): void };
      s.nationResetOpen = true;
      s.resetOneNation('IJN');
    });
    expect(await overflowingTexts(page, 'SettingsScene'), `nation reset (${layout})`).toEqual([]);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { resetOneNation(n: string): void }).resetOneNation('IJN'));
    const left = await page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { nations: object }).nations));
    expect(left).not.toContain('IJN');
    await open(page, 'MainMenuScene');
    expect(await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene').children.list.some((o) => /^v\d/.test((o as Phaser.GameObjects.Text).text ?? '')))).toBe(true);
    expect(errors).toEqual([]);
  });
});
