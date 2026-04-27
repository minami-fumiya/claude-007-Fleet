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

<!-- Add entries here as sprints progress. Format:
### Sprint N — <Topic>
- Observation
- Why it matters / tradeoff
-->
