# skill.md — Cross-Sprint Learnings

> Patterns, gotchas, and insights discovered during development.
> Update this file whenever you encounter a non-obvious solution or tradeoff.

---

## Tech Stack Notes

### Vite + Phaser
- Phaser must be split into its own chunk (`manualChunks: { phaser: ['phaser'] }`)
  to avoid blocking the initial parse of game logic code.
- Use `type: "module"` in `package.json` — Vite's ESM output requires it.

### TypeScript + Phaser
- Phaser types are bundled in `phaser` package — no `@types/phaser` needed.
- `moduleResolution: "bundler"` is required for Vite path aliases to work with `tsc`.
- Avoid `any`; use Phaser's own types (`Phaser.Physics.Arcade.Sprite`, etc.).

### Vitest + jsdom
- Phaser cannot be imported in unit test files (it requires a real Canvas).
  Test pure logic (systems, utils, types) only. Isolate Phaser code in scenes/entities.
- `globals: true` in vitest.config.ts enables `describe`/`it`/`expect` without imports.

---

## Configuration Patterns

### Path Alias (@/)
Both `tsconfig.json` (paths) and `vitest.config.ts` (resolve.alias) must declare
`@` → `src/` independently. Vite handles it at build time; Vitest needs its own config.

---

## Cross-Sprint Learnings

### Sprint 0 — CI Setup
- `npm ci` (used in GitHub Actions) requires `package-lock.json` to exist in the repo.
  Generate it by running `npm install` locally and committing the lock file.
- `vitest run` exits with code 1 when no test files exist. Add `--passWithNoTests` to
  the test script in `package.json` until Sprint 1 unit tests are added.
- `tsc --noEmit` with `"include": ["src"]` fails if `src/` is empty or absent.
  Add a minimal `src/main.ts` placeholder (`export {};`) as an entry point stub.

### Sprint 0 — Git Strategy
- Initialize git on `main` first, push to GitHub, then create `develop` from `main`.
  This avoids "no commits between branches" errors when creating the first PR.
- Add `.claude/` to `.gitignore` — `settings.local.json` contains per-machine permissions
  and must not be committed.
- Add `.gitattributes` with `* text=auto eol=lf` on Windows to prevent CRLF warnings
  and keep line endings consistent across platforms.

### Sprint 0 — Vercel CLI
- `vercel --yes` auto-detects `vercel.json` and deploys immediately. The `--name` flag
  is deprecated; project name is derived from the directory name or `package.json` name.
- Vercel CLI creates the project and deploys, but GitHub auto-deploy integration requires
  the Vercel GitHub App to be installed on the repo. This cannot be done via CLI alone —
  it must be authorized in the Vercel dashboard (Settings → Git → Connect).
- `vercel --yes` automatically appends `.vercel` to `.gitignore`. Clean up duplicates if
  `.vercel/` was already present in `.gitignore`.
- After `vercel --yes`, the deploy URL is `https://<project>.vercel.app` plus a unique
  preview URL. Use `vercel inspect <url>` to confirm status.

### Mobile Support
- Scale with `scale: { mode: Phaser.Scale.FIT, autoCenter: CENTER_BOTH }` + a `parent` div;
  game logic keeps using fixed 1280x720 coordinates (pointer x/y are already in game space).
- Set multi-touch via `input.activePointers` in GameConfig, not `this.input.addPointer()`
  inside a Scene — addPointer accumulates every time the scene restarts.
- Don't aim from `input.activePointer` on touch: it may be the joystick finger. Keep an
  explicit aim target updated by mouse move (`!pointer.wasTouch`) or by the firing tap.

### UI Kit (src/ui/theme.ts, src/ui/components/UIKit.ts)
- Gradients and glows are drawn once into canvas textures (`textures.createCanvas`), because
  `Graphics.fillGradientStyle` is WebGL-only and not rendered by the Canvas renderer.
- A Container's input hit area is centred on its position (Phaser adds `displayOriginX/Y`).
  For cards laid out from their top-left, use `makeClickable()` which offsets the rectangle
  by half its size; a centre-positioned button can use `Rectangle(0, 0, w, h)` directly.
- In BattleScene, the global `pointerdown` fire handler skips events whose `currentlyOver`
  list is non-empty, so tapping HUD buttons does not fire the main gun.

### Portrait layout for phones
- `src/config/Layout.ts` picks the orientation once at boot: touch-only devices get 720x1280,
  anything with a mouse/trackpad gets 1280x720. `?layout=portrait` forces it for PC testing.
- `CANVAS_W/H` and `IS_PORTRAIT` in GameConstants are module-level constants computed from that;
  scenes branch their layout on `IS_PORTRAIT` (see FleetBuilderScene's `LAYOUT` table).
- Canvas radial gradients: keep inner radius < outer radius for both orientations
  (`min(w,h)` / `hypot(w,h)/2`), otherwise the vignette inverts in portrait.
- New UI characters must be added to `src/ui/fontGlyphs.ts`; `fontGlyphs.test.ts` lists any missing.

### Ship sprites
- `ShipTextures.ts` draws top-down, bow-up sprites per ship class from the ship data. Arcade
  bodies don't rotate, so BaseShip uses a circular body sized between beam and length.

### Phone readability & controls
- Text sizes go through `uiFontSize()` (theme.ts): ×1.5 with a 17px floor in portrait, 12px floor on PC.
  Lay out with measured text (`text.width/height`, `getBounds()`) rather than fixed offsets.
- Phaser `wordWrap` only breaks at spaces; Japanese needs `useAdvancedWrap: true`.
- Portrait FleetBuilder scrolls the camera between fixed (scrollFactor 0) header/footer bars; the bars
  are interactive so taps don't fall through, and tap handlers go through `onTap()` to ignore drags.
- Touch battle controls live in `systems/AutoPilot.ts` (pure, tested): tap enemy = lock target,
  tap sea = waypoint, auto-fire in range, AUTO = engage band (close in / back off / circle).

### Battle world larger than the screen
- BattleScene's `WORLD` is ~2x the canvas; `physics.world.setBounds` + `camera.setBounds/startFollow(flagship)`.
- HUD (strip, buttons, chips, joystick, edge markers) uses `setScrollFactor(0)`; ship labels stay in world space,
  so the strip sits at a higher depth than them.
- Use `pointer.worldX/worldY` for world taps/clicks, and re-project the mouse every frame
  (`camera.getWorldPoint`) because the camera moves while the cursor is still.
- Shell out-of-bounds checks `physics.world.bounds`, not the canvas size.

### Sprint 4 — Multi-nation, AI v2, submarines
- Don't name a Scene field `registry`: `Phaser.Scene` already has one, and TS reports "not assignable
  to Scene" at every `this` passed as a Scene (FleetBuilderScene uses `shipRegistry`).
- The old WeaponSystem took shells from ObjectPool but never released them, so after 20 shots every shot
  created a new Shell. Pools of Phaser objects are simpler as "find an inactive one, else create" over the
  same array that the overlap collider was registered with (the collider reads the array each step, so
  pushing new projectiles into it keeps hit detection working).
- Projectiles carry their `IWeaponData`; one WeaponSystem per side serves the whole fleet.
- Keep decisions pure (`AIBrain`, `WeaponSelector`, `SubmarineSystem`, `SonarSystem`) and feed them plain
  views built once per frame; the Phaser classes only steer and fire.
- Torpedo balance: full `firePower` per torpedo plus perfect lead aim wiped a fleet in 20 s. Split the
  weapon's firePower across the salvo and give AI aim a small random error.
- Depth charges with a long fuse miss a moving boat (it travels ~100 px in 1.2 s); 0.8 s / 110 px works.
- Playwright smoke tests: map game coordinates to the canvas bounding box; `?layout=portrait` plus
  `hasTouch` for the phone UI. Mouse-wheel scrolling in the portrait Fleet Builder is not pixel-predictable.
- Long ship names: `fitName()` in FleetBuilderScene drops the "(English)" part, then scales the text down.

### Sprint 5 — Aircraft, fog of war, captains, refits
- Aircraft are squadrons (one Container of plane icons), not physics bodies; AA and dogfights are fractional
  "damage" accumulators (`applyAttrition`) so losses are smooth and testable without randomness.
- Two `AirOpsSystem`s (one per side) read each other's `squadrons` arrays for interception; each side's
  cleanup writes off its own shot-down planes, so no cross-system bookkeeping is needed.
- Fog of war: a screen-sized RenderTexture filled dark each frame, with a soft radial brush `erase`d per vision
  circle and a Graphics polygon erased for recon cones. Hidden enemies use `setVisible(false)`, and HUD labels
  check `ship.visible`.
- AUTO and AI need something to do when nothing is visible: both patrol towards the middle of the sea.
- Stat changes from upgrades and captains go through one `IShipModifiers` object applied at spawn
  (`applyToStats` / `applyToWeapons`), keeping BattleScene ignorant of where bonuses come from.
- localStorage access is wrapped in try/catch with an in-memory fallback (`ProgressStore`).
