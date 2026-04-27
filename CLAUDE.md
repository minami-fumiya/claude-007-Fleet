# CLAUDE.md — WW2 Naval Fleet Game

## Project Overview
WW2 Naval Fleet Game built with Phaser.js 3 + TypeScript + Vite.
Turn-based/real-time naval combat featuring IJN, USN, Kriegsmarine, Royal Navy.

**Repo**: `claude-007-Fleet` | **Deploy**: Vercel (`claude-007-fleet`)
**Stack**: Phaser 3 · TypeScript 5 · Vite 6 · Vitest 3

---

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (localhost:5173) |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run Vitest tests once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint on `src/` |

---

## Repository Layout
```
src/
  config/       # GameConstants, SceneKeys, GameConfig
  data/         # JSON data (ships, weapons, scenarios)
  entities/     # Phaser Sprites (ships, weapons, effects, aircraft)
  scenes/       # Phaser Scenes (Boot, Preload, Battle, etc.)
  systems/      # Pure logic (Combat, Weapon, AI, Fleet, etc.)
  types/        # TypeScript interfaces and enums
  ui/           # HUD components
  utils/        # Shared helpers (MathUtils, ObjectPool, DataLoader)
  main.ts       # Entry point — new Phaser.Game(GameConfig)
assets/
  ships/        # Sprite sheets by nation (ijn/, usn/, km/, rn/)
  audio/        # BGM and SFX
  maps/         # Tiled JSON maps
docs/
  specs/        # Game design documents (read order below)
tests/
  unit/         # Vitest unit tests
```

---

## Spec Read Order
When starting a new sprint, read in this order:
1. `docs/specs/GDD.md` — core game rules and scope
2. `docs/specs/ROADMAP.md` — sprint milestones
3. `docs/specs/sprints/current.md` — active sprint tasks
4. `docs/specs/systems/<system>.md` — relevant system spec
5. `docs/specs/ships/<nation>/` — ship data for the sprint

---

## Conventions
- **Branches**: `feature/sprint<N>-<slug>` → develop → main
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)
- **Types**: All game objects typed via `src/types/`. No `any`.
- **Imports**: Use `@/` alias for all `src/` imports.
- **Tests**: Unit tests in `tests/unit/`. Pure logic only — no Phaser canvas.
- **Phaser objects**: Never instantiate outside a Scene `create()` context.

---

## Key Files
- `src/config/GameConstants.ts` — canvas size, layer depths
- `src/config/SceneKeys.ts` — all scene name constants
- `src/systems/CombatSystem.ts` — damage formula implementation
- `docs/specs/systems/combat.md` — damage formula spec

---

## Learning Log
Cross-sprint insights and patterns are captured in `skill.md`.
Check it before implementing systems that appear in multiple sprints
(e.g. ObjectPool, damage calc, AI targeting).
