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
