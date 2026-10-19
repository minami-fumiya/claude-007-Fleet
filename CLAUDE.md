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
| `npm run test:e2e` | Playwright screen tests (all menu screens, portrait + landscape, a sortie) |
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
  e2e/          # Playwright screen tests (dev server, `window.game`)
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

## Language (言語)
- **ユーザーへの返信・途中経過の報告は、すべて日本語で書く** (短い一言や作業中のメモも含む)。
- GitHub の issue・PR の本文やコメントも日本語。コミットメッセージは英語の Conventional Commits。
- コード中のコメントと識別子は英語のまま、画面に出る文言は日本語。

## セーブデータを消さない (Save data must survive every release)
リリースのたびにプレイヤーの進行が消えてはならない (0.0.12 で消えた報告あり)。保存形式に触れる変更では必ず:
- **形式の変更は `src/utils/SaveMigration.ts` に移行ステップを 1 つ追加**して行う。公開済みのステップは書き換えない。項目を減らす・名前を変える時も、旧データを読み替えて残す。
- **リリースごとにセーブの fixture を追加**: `tests/fixtures/saves/save-<版>.json` (その版のコードで作ったセーブ)。`tests/unit/SaveCompat.test.ts` が全版のセーブを読み、艦・資源・攻略・研究・艦長・出撃枠が減らないことを確かめる。
- 読み込み時の安全装置 (`ProgressStore.loadSave`): 旧版のセーブは移行前に、読めないセーブは置き換え前に、生データを `ww2fleet.progress.backups` に退避する (最新 5 件、設定 → バックアップから復元)。この仕組みを外さない。
- `parseSave` が例外で空のセーブを返す経路を増やさない。新しい項目は必ず既定値付きで読む (欠けていても落ちない)。
- 注意: Vercel のプレビュー URL (PR ごとの URL) と本番 URL は保存場所 (localStorage) が別。プレビューで遊んだ進行は本番には無い。

## 新要素には勲章も (Medals come with every new feature)
新しい要素 (画面・仕組み・アイテム・遊び方) を追加するときは、それに関わる勲章も併せて追加する (#92 #193)。
- 勲章は `src/systems/RecordSystem.ts` の `MEDALS` に表で追加する (分類・条件・目標)。数える値が要るときは `IMedalContext` か任務の累計 (`quests.totals`) に足す。
- 勲章のテスト (`tests/unit/Medals.test.ts`) が通ること、勲章の総数が減らないこと。

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
