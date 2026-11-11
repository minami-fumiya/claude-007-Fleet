# CLAUDE.md — WW2 Naval Fleet Game

WW2 の艦隊を指揮する海戦ゲーム。Phaser 3 · TypeScript 5 · Vite 6 · Vitest 3 · Playwright。
**Repo**: `claude-007-Fleet` | **公開**: Vercel (`claude-007-fleet`、`main` が本番) | **今の版と計画**: `docs/VERSIONS.md`

読む順に並べてある: いつも守ること → 作業の始め方 → 開発の流れ → コードの決まり → 機能を足す時 → 版を出す時 → 0.01 区切り → 参考。

---

## 1. いつも守ること

### Language (言語)
- **ユーザーへの返信・途中経過の報告は、すべて日本語で書く** (短い一言や作業中のメモも含む)。
  - 例外はない。次の場面でも日本語で書く:
    - stop hook やシステムの通知 (CI・PR の通知、バックグラウンドの作業の完了) に応じた返信
    - 作業の合間の「今何をしているか」の一言
    - 会話が要約されて続いた直後
    - 英語の資料・ログ・ツールの出力を読んだ直後
  - 送る前に、返信が日本語になっているか確かめる。英語で書きかけたら、日本語に直してから送る。
- GitHub の issue・PR の本文やコメントも日本語。コミットメッセージは英語の Conventional Commits。
- コード中のコメントと識別子は英語のまま、画面に出る文言は日本語。

---

## 2. 作業の始め方

### 作業は issue から始める
作業は issue に書いてあり、セッションはその issue を渡されて起動する。issue がその作業の指示書になる。
- issue の節: **使うモデル・目的・背景・範囲 (やること / やらないこと)・完成の条件・引き継ぎ**。
- 「やらないこと」に書いてあるものには触らない。「完成の条件」を全部満たしてから PR を出し、満たせなかった条件は PR に書く。
- 作業中に見つけた、範囲の外の問題や、運用の決めごとが要る問題は、勝手に決めない。issue に切り出すか、PR に質問として書く (「引き継ぎ」の節に従う)。
- 新しい作業を issue にする時も、同じ節で書く。

### モデルの使い分け
issue の「使うモデル」に、起動する時に選ぶモデルを書く。

| モデル | 向く作業 |
|---|---|
| Fable | 設計と判断 (版の計画・仕様・規約・総点検・バランスの判断) |
| Opus | 実装 (仕様と範囲が決まった機能・不具合の修正) |
| 下位モデル (Sonnet・Haiku) | 決まった作業 (手順が決まっている更新・データの追加・文書の整形) |

### 読む順番
1. **渡された issue** — 目的・範囲・完成の条件。
2. **`docs/VERSIONS.md` の「現在の位置」** — 公開中の版・次の版・計画。版番号はここが正。
3. **`docs/specs/systems/<system>.md`** — 触る仕組みの仕様 (戦闘は `combat.md`、広い海は `open-world.md` など)。
4. **`skill.md`** — 触る分野の節 (過去にはまった所と、その解き方)。
5. 必要な時だけ:
   - `docs/specs/numbering.md` (通し番号)・`docs/specs/ui-gold-buttons.md` (黄色のボタン)・`docs/specs/GLOSSARY.md` (用語)
   - `docs/specs/ships/<nation>/` (艦のデータ)
   - `docs/balance/<版>.md`・`docs/review/<版>.md` (前の版のバランス確認と総点検)

過去の記録 (今の計画としては読まない): `docs/specs/GDD.md` (最初の設計)・`docs/specs/ROADMAP.md`・`docs/specs/sprints/`・`Todo.md`。開発の単位はスプリントから版に移った (0.0.8-alpha から)。

---

## 3. 開発の流れ

### ブランチと PR
- **作業ブランチ → `develop` → `main`**。
  - 作業ブランチはセッションに指定されたものを使う (例: `claude/<slug>`)。指定がなければ `claude/<slug>` を `develop` から作る。
  - 作業ブランチから `develop` へ PR を出す。**下書きで出し、ユーザーの確認後に取り込む** (取り込むのはユーザー)。
  - 公開は `develop` → `main` の PR「`Release 0.0.N-alpha`」。`main` に入ると Vercel の本番に出る。
- 版の PR の題は「`0.0.N-alpha: 名前 (#issue)`」。版に入らない PR は「`docs: …`」「`fix: …`」のように種類を頭に付ける。
- PR の本文は `.github/pull_request_template.md` の節で書く。
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)、英語。

### 版の進め方
- 版は `0.0.N-alpha`。遊べる内容がまとまって変わるごとに N を 1 つ上げる。くくりの中の不具合修正だけなら `0.0.N-alpha.1`。`0.1.0-beta` がオープンベータ。詳しくは `docs/VERSIONS.md` の冒頭。
- 版ごとに行うこと → 「6. 版を出す時」。0.01 進むごとに行うこと → 「7. 0.01 区切りの総点検」。

### Commands
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
| `npm run balance` | 艦・資源・時間のバランスの表 (`scripts/balance.ts`) |
| `npm run sim` | 戦闘の模擬 (AUTO の戦闘を流して勝率と時間を出す、`scripts/sim.mjs`) |
| `npm run perf` | 動作速度の計測 (`scripts/perf.mjs`) |

- **コミットの前:** `npm run lint`・`npm run typecheck`・`npm run test` を通す。コードを変えた時は `npm run build` も。
- **画面を変えた時:** `npm run test:e2e` (縦・横)。時間がかかる時は、関係するテストに絞って流してよい (CI が全部を流す)。
- **CI** (`.github/workflows/ci.yml`、`develop` と `main` への PR): 型チェックと単体テスト、E2E。`docs/` と Markdown だけの変更では E2E を省く。lint と build は CI に無いので、手元で通す。

---

## 4. コードの決まり (Conventions)
- **Types**: All game objects typed via `src/types/`. No `any`.
- **Imports**: Use `@/` alias for all `src/` imports.
- **Tests**: Unit tests in `tests/unit/`. Pure logic only — no Phaser canvas. 画面は `tests/e2e/` で確かめる。
- **Phaser objects**: Never instantiate outside a Scene `create()` context.
- **判断は純粋な関数に**: 計算と判断は `src/systems/`・`src/utils/` に置いて単体テストを書く。シーンと entity は、その結果を描いて動かすだけにする。
- **文字**: 画面に出す新しい文字は `src/ui/fontGlyphs.ts` に足す (足りない文字は `fontGlyphs.test.ts` が挙げる)。

---

## 5. 機能を足す時

### 新要素には勲章も (Medals come with every new feature)
新しい要素 (画面・仕組み・アイテム・遊び方) を追加するときは、それに関わる勲章も併せて追加する (#92 #193)。
- 勲章は `src/systems/RecordSystem.ts` の `MEDALS` に表で追加する (分類・条件・目標)。数える値が要るときは `IMedalContext` か任務の累計 (`quests.totals`) に足す。
- 勲章のテスト (`tests/unit/Medals.test.ts`) が通ること、勲章の総数が減らないこと。

### セーブデータを消さない (Save data must survive every release)
リリースのたびにプレイヤーの進行が消えてはならない (0.0.12 で消えた報告あり)。

**α 版の間 (今):** セーブの互換を考えない開発でよい (2026-10-20 ユーザー判断)。移行ステップと版ごとの fixture は省いてよい (考えるのに手間がかかる時は特に)。ただし次の 2 つは残す:
- 新しい項目は既定値付きで読む (欠けていても落ちない)。
- 読み込み時のバックアップ (`ProgressStore.loadSave`) は外さない。

**β 版から:** 保存形式に触れる変更では必ず次を守る。
- **形式の変更は `src/utils/SaveMigration.ts` に移行ステップを 1 つ追加**して行う。公開済みのステップは書き換えない。項目を減らす・名前を変える時も、旧データを読み替えて残す。
- **リリースごとにセーブの fixture を追加**: `tests/fixtures/saves/save-<版>.json` (その版のコードで作ったセーブ)。`tests/unit/SaveCompat.test.ts` が全版のセーブを読み、艦・資源・攻略・研究・艦長・出撃枠が減らないことを確かめる。
- 読み込み時の安全装置 (`ProgressStore.loadSave`): 旧版のセーブは移行前に、読めないセーブは置き換え前に、生データを `ww2fleet.progress.backups` に退避する (最新 5 件、設定 → バックアップから復元)。この仕組みを外さない。
- `parseSave` が例外で空のセーブを返す経路を増やさない。新しい項目は必ず既定値付きで読む (欠けていても落ちない)。

**注意 (α・β とも):** Vercel のプレビュー URL (PR ごとの URL) と本番 URL は保存場所 (localStorage) が別。プレビューで遊んだ進行は本番には無い。

---

## 6. 版を出す時

### 版にそろえるもの
`tests/unit/ReleaseChecklist.test.ts` が、書き忘れを落とす (#207)。
- `package.json` の `version`
- `src/data/changelog.json` — タイトル画面に出る更新内容
- `docs/VERSIONS.md` — 「現在の位置」の公開中の版と、一覧の行
- `docs/balance/<版>.md` — 下のバランス確認の結果
- 新しい要素の勲章 (「5. 機能を足す時」)
- β 版からは、その版のセーブの fixture (「セーブデータを消さない」)

### 版ごとのバランス確認 (Balance review at every release, #223)
どの版のリリースでも、リリース PR の前に全体のゲームバランスを確かめて調整する。
- 艦の強さ (艦種ごとに年代・格の順か)、作戦の難しさ (海域の敵と推奨艦隊の戦力比)、資源の収支 (序盤・中盤・終盤の 1 時間)、建造・入渠・施設の時間、育成と昇進の速さ、任務・イベント・S 評価の報酬を確かめる。
- 結果は `docs/balance/<版>.md` に残し、前の版との差と、調整した値を書く。目安から外れた値はその版で直すか、issue にして次の版で直す。

---

## 7. 0.01 区切りの総点検 (Full review every 0.01)
版が 0.01 進むごと (0.0.39 の公開後・0.0.40 に入る前、0.0.49 の後 …) に、一通りの総点検をする (2026-10-20 ユーザー指示)。issue の読み直しは、この時にまとめて行う (版ごとには行わない)。
- **パワーバランス:** 艦・作戦 (難しさの曲線)・資源・時間・育成・報酬を全体で見直す。版ごとのバランス確認より広く、前の総点検からの変化をまとめる。
- **抜け漏れ:** 新しい要素に勲章・任務・図鑑・ヘルプ・昇進条件・データ検査などの関連要素がそろっているか。
- **バグ:** 全画面 (縦・横) を触って確かめ、E2E とデータ検査で拾えないものを探す。
- **issue:** 未対応の issue を全件読み直し、統合・クローズ・追加をする。終わった追跡 issue は閉じる。版の計画 (`docs/VERSIONS.md`) を見直す。
- **結果:** `docs/review/<版>.md` に残し、追跡 issue を 1 つ作る。

---

## 8. 参考

### Repository Layout
```
src/
  config/       # GameConstants, SceneKeys, GameConfig, Layout (縦・横)
  data/         # JSON data (ships, weapons, campaign, quests, changelog, world …)
  entities/     # Phaser Sprites (ships, weapons, effects, aircraft)
  scenes/       # Phaser Scenes (Boot, Preload, Home, Battle, etc.)
  systems/      # Pure logic (Combat, Weapon, AI, Record, World, etc.)
  types/        # TypeScript interfaces and enums
  ui/           # theme, UIKit components, HUD, fontGlyphs
  utils/        # Shared helpers (ProgressStore, SaveMigration, MathUtils, DataLoader)
  main.ts       # Entry point — new Phaser.Game(GameConfig)
public/assets/  # 配信する画像 (ships/)
scripts/        # balance・sim・perf と、データから文書や番号を作る gen-*.ts
docs/
  VERSIONS.md   # 版の履歴と計画 (版番号はここが正)
  balance/      # 版ごとのバランス確認
  review/       # 0.01 区切りの総点検
  specs/        # 仕様 (systems/・ships/・numbering.md など)。sprints/ は過去の記録
tests/
  unit/         # Vitest unit tests
  e2e/          # Playwright screen tests (dev server, `window.game`)
  fixtures/     # セーブの fixture (saves/)
```

### Key Files
- `docs/VERSIONS.md` — 版の履歴と計画
- `src/config/GameConstants.ts` — canvas size, layer depths
- `src/config/SceneKeys.ts` — all scene name constants
- `src/systems/CombatSystem.ts` — damage formula implementation (`docs/specs/systems/combat.md`)
- `src/systems/RecordSystem.ts` — 戦績と勲章 (`MEDALS`)
- `src/utils/ProgressStore.ts`・`src/utils/SaveMigration.ts` — セーブの読み書きと移行
- `src/data/changelog.json` — 版ごとの更新内容
- `tests/unit/ReleaseChecklist.test.ts`・`tests/unit/DataIntegrity.test.ts` — 版の書き忘れとデータの検査

### Learning Log
版をまたいで使う知見 (はまった所と解き方) は `skill.md` に、分野ごとにまとめてある。
同じ分野を触る前に読み、新しく分かったことは、その分野の節に足す (古くなった記述は直すか消す)。
