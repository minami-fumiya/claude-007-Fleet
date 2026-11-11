# skill.md — Learnings across versions

> Patterns, gotchas and insights discovered during development, grouped by area.
> Read the section of the area you are about to touch. When you find a non-obvious solution or tradeoff, add it to
> its section; fix or delete an entry that is no longer true. Rules live in `CLAUDE.md`, not here.

Sections: Toolchain · Layout and text · UI building blocks · Battle scene · Battle logic and AI · Aircraft and fog ·
Maps and objectives · Progress and saves · Home port and progression · Settings and audio · Balance and simulation ·
E2E (Playwright) · Working in parallel

---

## Toolchain
- Phaser is split into its own chunk (`manualChunks: { phaser: ['phaser'] }` in `vite.config.ts`) so it does not block
  the initial parse of the game code.
- Phaser's types are bundled in the `phaser` package — no `@types/phaser`. Avoid `any`; use Phaser's own types.
- `moduleResolution: "bundler"` is required for the Vite path alias to work with `tsc`. The `@` → `src/` alias is
  declared twice, in `tsconfig.json` (paths) and `vitest.config.ts` (resolve.alias): Vitest needs its own.
- `import.meta.env` needs `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) for `tsc`.
- Phaser cannot be imported in unit tests (it needs a real Canvas). Test pure logic (systems, utils, types) only and
  keep Phaser code in scenes and entities. `globals: true` gives `describe` / `it` / `expect` without imports.
- Don't name a Scene field `registry`: `Phaser.Scene` already has one, and TS reports "not assignable to Scene" at
  every `this` passed as a Scene (FleetBuilderScene uses `shipRegistry`).
- Run lint, typecheck, the unit tests and the build before committing (a type error once reached the remote).
- New UI characters must be added to `src/ui/fontGlyphs.ts` by hand; `fontGlyphs.test.ts` lists the missing ones.
  Stage that file with the change that needs it.

## Layout and text
- `src/config/Layout.ts` decides the orientation before the game starts: touch-only devices play the way they are
  held (portrait unless turned sideways), anything with a mouse plays in landscape; the settings can fix either, and
  `?layout=portrait|landscape` forces it (handy for the phone UI on a PC). When the other layout comes to fit, the
  game reloads into it and reopens the screen (`utils/OrientationWatch.ts`); a battle is never cut short.
- `CANVAS_W/H` and `IS_PORTRAIT` in GameConstants are module-level constants computed from that; scenes branch their
  layout on `IS_PORTRAIT`. Game logic uses those fixed canvas coordinates (`Scale.FIT`; pointer x/y are in game space).
- When a panel's height depends on game state (fleet slots), compute the layout in `create()` instead of a
  module-level constant; every panel below it moves with it.
- Text sizes go through `uiFontSize()` (theme.ts): ×1.5 with a 17px floor in portrait, a 14px floor on a phone held
  sideways, a 12px floor on PC. Lay out with measured text (`text.width/height`, `getBounds()`), not fixed offsets.
- Phaser `wordWrap` only breaks at spaces; Japanese needs `useAdvancedWrap: true`. `textStyle()` applies the Japanese
  line-breaking rules (`jaWordWrap`) to wrapped text.
- `Container.getBounds()` ignores a Graphics child, so a pill made of graphics + text reports only the text width;
  measure the text and add the padding (`chipWidth`) before placing anything to its right.
- An overlay text measured before its panel is drawn ends up under the panel at the same depth — lift it.
- Long ship names: `fitName()` drops the "(English)" part, then scales the text down.
- Six menu buttons don't fit one portrait row — lay menus out as a grid (`menuCols`) rather than a row/column flag.
- Canvas radial gradients: keep inner radius < outer radius for both orientations (`min(w,h)` / `hypot(w,h)/2`),
  otherwise the vignette inverts in portrait.
- The E2E text-overflow and overlap checks pay off on every new detail page: long headings in portrait are caught there.

## UI building blocks (`src/ui/theme.ts`, `src/ui/components/UIKit.ts`)
- Gradients and glows are drawn once into canvas textures (`textures.createCanvas`), because
  `Graphics.fillGradientStyle` is WebGL-only and not rendered by the Canvas renderer.
- A Container's input hit area is centred on its position (Phaser adds `displayOriginX/Y`). For cards laid out from
  their top-left, use `makeClickable()`, which offsets the rectangle by half its size; a centre-positioned button can
  use `Rectangle(0, 0, w, h)` directly.
- A scrolling page between fixed (scrollFactor 0) header/footer bars: the bars are interactive so taps don't fall
  through, and tap handlers go through `onTap()` to ignore drags.
- A sheet over a scrolling page: lay it out at camera scroll 0 (save and restore the scroll), so a masked
  `ScrollList` inside it lines up with its taps; give the list a depth above the page.
- Pass the "back" destination into shared scenes (`scene.start(key, { returnTo })`) instead of hard-coding it.
- Destructive buttons use a two-press arm that any other action disarms, instead of a blocking `confirm`.
- Text input without DOM elements: `window.prompt` works on desktop and mobile (a design ship's name still uses it);
  Playwright answers it with `page.on('dialog')`. Search by name uses an in-screen field (0.0.40).
- Settings that rarely change belong in collapsible radio groups rebuilt from a `settingGroups()` description — one
  builder handles the layout, open state and portrait height, and adding a setting is one entry.
- Gold buttons: see `docs/specs/ui-gold-buttons.md`.

## Battle scene (Phaser side)
- Set multi-touch via `input.activePointers` in GameConfig, not `this.input.addPointer()` inside a Scene —
  addPointer accumulates every time the scene restarts.
- Don't aim from `input.activePointer` on touch: it may be the joystick finger. Keep an explicit aim target updated
  by mouse move (`!pointer.wasTouch`) or by the firing tap.
- The scene's `pointerdown` handler ignores taps that land on an interactive HUD object or belong to the joystick, so
  tapping HUD buttons does not fire the main gun.
- Touch controls live in `systems/AutoPilot.ts` (pure, tested): tap enemy = lock target, tap sea = waypoint,
  auto-fire in range, AUTO = engage band (close in / back off / circle).
- The battle world is larger than the canvas (`BATTLE_WORLD` in `systems/BattleLayout.ts`): `physics.world.setBounds`
  + `camera.setBounds/startFollow(flagship)`. The HUD uses `setScrollFactor(0)`; ship labels stay in world space, so
  the HUD strip sits at a higher depth than them.
- Use `pointer.worldX/worldY` for world taps, and re-project the mouse every frame (`camera.getWorldPoint`) because
  the camera moves while the cursor is still. Out-of-bounds checks use `physics.world.bounds`, not the canvas size.
- `ShipTextures.ts` draws top-down, bow-up sprites per ship class from the ship data. Arcade bodies don't rotate, so
  BaseShip uses a circular body sized between beam and length.
- Pools of Phaser objects: "find an inactive one, else create" over the same array the overlap collider was
  registered with (the collider reads the array each step, so pushing new projectiles keeps hit detection working).
  An earlier pool that took objects and never released them created a new Shell on every shot.
- Per-battle state declared with an initialiser (`readonly log = {}`) survives `scene.start` because Phaser reuses
  the scene instance — clear it in `create()` (this once inflated the service record's damage).
- `update(time)` gets the game-loop clock, `this.time.now` in `create()` the scene clock (stale right after a scene
  start): never subtract one from the other. Take battle start times on the first `update`.
- Pausing means one battle clock: `battleNow()` = loop time − paused ms, and every timer (reloads, crit effects,
  flashes) reads it. Give entities a `clock()` callback rather than letting them read the scene clock. Pause physics,
  tweens and `this.time` together, and auto-pause on `HIDDEN`.
- A battle-screen setting applied in `create()` before the HUD is built must not touch the HUD's buttons: the button
  reads the state when it is made (0.0.69 review: the 海から autopilot threw and the HUD was never made).
- Particle effects that follow ships (wakes, smoke) must be hidden whenever the ship is hidden by fog, otherwise they
  give away hidden enemies. The 4px 'particle' texture reads as dots when scaled; soft effects use the 16px 'soft' one.

## Battle logic and AI (pure side)
- Keep decisions pure (`AIBrain`, `WeaponSelector`, `SubmarineSystem`, `SonarSystem`, `AutoPilot`) and feed them
  plain views built once per frame; the Phaser classes only steer and fire.
- Projectiles carry their `IWeaponData`; one WeaponSystem per side serves the whole fleet.
- Stat changes from upgrades, captains and formations go through `IShipModifiers` applied at spawn
  (`applyToStats` / `applyToWeapons`, combined with `combineModifiers`), keeping BattleScene ignorant of where bonuses
  come from. New gameplay that only re-weights existing stats fits here; test "no option dominates another" rather
  than fixed numbers.
- Layer new bonuses (learned skills, traits) on top of the old one and test that with none of them the result equals
  the old single bonus exactly — old saves keep the same strength.
- AI targeting that scores targets independently makes the whole side pile onto one ship. Pass "how many of my side
  already attack it" (`attackers`) and update the count after each ship decides within the frame; tune the per-nation
  `crowdPenalty` with a small assignment sim (4 v 4) rather than by feel.
- AUTO and AI need something to do when nothing is visible: both patrol towards the middle of the sea.
- Escorts that steer straight at a slot behind a turning flagship swing back and forth. Smooth the formation heading
  (≤ 30°/s), hold it with matching throttle when on station, and only steer to the slot when off it (`EscortSteering`).
- Torpedoes: full `firePower` per torpedo plus perfect lead aim wiped a fleet in 20 s. Split the weapon's firePower
  across the salvo and give AI aim a small random error.
- Depth charges with a long fuse miss a moving boat (it travels ~100 px in 1.2 s); 0.8 s / 110 px works.
- "No duplicate ships" must hold for every generator (exercise, campaign swaps, scenario data): pick from pools with
  a `used` set and let the fleet come out short rather than repeat; test the data files, not just the generator.

## Aircraft and fog of war
- Aircraft are squadrons (one Container of plane icons), not physics bodies; AA and dogfights are fractional
  "damage" accumulators (`applyAttrition`) so losses are smooth and testable without randomness.
- Two `AirOpsSystem`s (one per side) read each other's `squadrons` arrays for interception; each side's cleanup
  writes off its own shot-down planes, so no cross-system bookkeeping is needed.
- Fog of war: a screen-sized RenderTexture filled dark each frame, with a soft radial brush `erase`d per vision
  circle and a Graphics polygon erased for recon cones. Hidden enemies use `setVisible(false)`, and HUD labels check
  `ship.visible`.

## Maps, objectives and scenarios
- Map geometry in normalised units (x, y of world size; r of the shorter side) keeps one map file valid for both the
  landscape and portrait worlds. Tests check that spawn areas stay at sea in both.
- Islands are Zones with static circle bodies in a StaticGroup; colliders with ship arrays and an overlap that only
  stops torpedoes (shells "fly over" land so shore targets can be shelled).
- Currents are applied as a direct position shift (`x += vx·dt`); adding to velocity accumulates because steering and
  drag rewrite velocity every frame.
- Win / loss for every objective lives in one pure `evaluateObjective`; a new objective needs a case there plus the
  state fields (`targetsAlive`, `flagshipInZone`, `enemyInZone`, time) that BattleScene fills each tick.
- Merchant ships / shore targets are `BaseShip`s with flags (`isConvoy`, `isLand`) and data in `special.json`; enemy
  AI priority comes from a `priority` bonus on the target view.
- Exhibition modes (scenarios) isolate both ways: skip saving results AND skip loading progress-based modifiers.
  Results get `returnScene` / `retry` so one ResultsScene serves every mode.
- An E2E per entry point into battle (chart, 海から, …): one entry's test does not cover another's.

## Progress and saves
The rules are in `CLAUDE.md`「セーブデータを消さない」(the alpha exception included). How it is done:
- localStorage access is wrapped in try/catch with an in-memory fallback (`ProgressStore`).
- Progress grows by adding fields with defaults filled in by the parser, so older saves keep working.
- Format changes go through `src/utils/SaveMigration.ts`: append one step to `MIGRATIONS` (raw JSON v(n) → v(n+1)),
  never edit a released step. `SAVE_VERSION` follows automatically.
- Back up the raw stored save before migrating it, before replacing an unreadable one, and before imports and resets;
  read the save once at boot (`main.ts`) so the backup exists before any screen writes.
- A save fixture per release (`tests/fixtures/saves/`) is made with that release's own code: check out the old commit
  in a worktree and serialise a save with its pure API.
- Replacing what a value is derived from (rank from cleared areas → from merit) needs a save floor: the migration
  gives `rankFloor` so no old save loses slots or buildable ships, and tests walk every old rank through it.
- Introducing ownership of something everyone had (captains): the migration gives old saves the whole roster, and
  the parser fills in the whole roster too when the field is missing, so no path loses an assigned captain.
- A one-shot reward the player can replay (tutorial from ヘルプ) needs a `rewarded` flag in the save.
- Keep settings in their own storage key: a progress reset or a save import must not touch volume.
- Prefix + base64 save codes survive copy / paste (whitespace is stripped on import).
- Preview deployments have their own localStorage: "my save is gone" may be a different URL, not a bug.

## Home port, timers and progression
- Real-time timers (repairs, construction) use `Date.now()` stored as absolute `endsAt`, so they keep running while
  the game is closed; the scene's `update()` completes what is due and saves on change.
- Gate optional content with a data flag plus one pure filter used at the single place lists are built; the enemy
  generator filters independently so research never leaks into enemy fleets.
- Data defaults leak features: an upgrade with no `requires` was usable from the start. Test "every catalog entry is
  gated" rather than trusting the data.
- A remodel stage's effects replace the previous stage's — keep every stage's numbers absolute, not deltas.
- Reward-only content that differs per nation lives in its own data file keyed by nation → area, not on the shared
  area record (areas are shared by several nations).
- Promotion exams (an area that must be cleared) stop the climb at that rank; merit alone can't skip them. Before
  adding a promotion mission, check that the seas of the rank held can meet it (six-ship fleets sail only from the
  大佐 seas on); `Progress058.test.ts` guards the S-against-six-ships case.
- Career stats are a plain record object updated by a pure `recordBattle`; medals are rules over that record plus a
  small context, so a new medal is one table row.
- Tutorial steps that only explain must not block the ones that wait for an action: an action event passes over the
  explain-only steps before it, so closing a sheet and just playing still advances.
- A feature that has to be rewritten whenever others change (the tutorial) is better postponed until the rest is
  stable than shipped half-right.
- Generated docs (ship rosters, numbers) are rebuilt from JSON by `scripts/gen-*.ts`; the roster script keeps the
  hand-written Notes section.

## Settings and audio
- WebAudio needs a user gesture: `main.ts` calls `audio.unlock()` on the first pointerdown / keydown.
- Throttle each sound kind (a salvo of 6 guns becomes one sound) and attenuate by distance from the camera.
- When adding a volume scale to an existing mix, raise the base gains so the default setting keeps today's loudness.

## Balance and simulation
- An analytic DPS / time-to-kill model plus invariant tests catches data outliers cheaply; confirm with real AUTO
  battles (`npm run sim`).
- Test the invariant ("steel regen time ≤ 1.5× fuel/ammo for every ship") instead of pinning numbers, so later cost
  changes keep the intent.
- Keep balance invariants on the historical set and give special ships their own bounded tests, instead of loosening
  the shared ones.
- Scenario geometry and balance need AUTO sims from both sides after every change: a fix for one side easily flips the
  result, and the first layouts were won in under 30 s by whichever side the AUTO pilot played. Placement tests (at sea
  in both worlds) catch islands, not balance.
- Compare simulations only with the same flags: `--grown 1` (a fleet grown to the recommended rank) wins the deep
  seas, a raw fleet loses them by design. A "0% outlier" from a raw run is not a regression.
- Never touch the tree a simulation runs from (sources or `node_modules`): Vite reloads or the imports break and every
  later battle reports 0%. A worktree with a `node_modules` symlink must keep that symlink out of git (`.gitignore`
  has `node_modules/`, a directory pattern, so add `node_modules` to `.git/info/exclude`).
- In the cloud container the sim needs `CHROMIUM_PATH=/opt/pw-browsers/chromium` (the pinned headless shell is not
  installed), and nothing heavy beside it: parallel headless browsers starve the CPU and the game runs in slow
  motion; an E2E run or a second dev server at the same time made page loads time out and the sim stop half way
  (0.0.69 review). Two pages (`--pages 2`) are enough.

## E2E (Playwright)
- Drive scenes through `window.game` (dev only). Starting a scene that is running restarts it, so stop only the
  *other* scenes first — stopping and starting the same key in one tick leaves it stopped.
- Map game coordinates to the canvas bounding box; `?layout=portrait` plus `hasTouch` for the phone UI. Mouse-wheel
  scrolling in a portrait list is not pixel-predictable.
- Seed `localStorage` with `page.evaluate` and reload to test states like damaged ships quickly.

## Working in parallel (agents and worktrees)
- Create the worktrees from the working branch (they once defaulted to an old `main`), give each agent a disjoint
  file scope, and define shared contracts (field names, research ids) up front in the plan.
- Merge the biggest cross-cutting stream (save format, fleet builder) last, and have a still-running stream merge the
  integrated branch itself — it resolves its own conflicts better than the integrator.
- Two streams can invent the same thing under different names: when merging, keep one and rename, don't keep both.
- Agents hit usage limits mid-task; ask them to commit after every passing check so a stop loses nothing.
