# Sprint 6 — 鎮守府・資源・入渠・工廠 (研究)

**Status**: Implemented [IMPLEMENTED: sprint6] | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
**Goal**: 戦闘の外に「母港」ができる。出撃には資源を使い、損傷は入渠で直し、資源で研究を進めて艦隊を強化する。

## スコープ判断
- 進捗 (資源・損傷・入渠・研究) は Sprint 5 の `ProgressStore` (localStorage) に追加する。
- 入渠時間は実時間 (Date.now) で進む。2 隻まで並行して修理し、資源 (高速修理) で即時完了もできる。
- 研究は資源を払うと即時に完了。効果は全艦への補正 (`IShipModifiers`) と改装装備の解放。
- 純粋ロジックは `src/systems/` に置き Vitest でテストする。

## Tasks

### A. ロジック (純粋)
- [x] `src/systems/ResourceSystem.ts` — 燃料 / 弾薬 / 鋼材 / ボーキサイト、出撃コスト・報酬・支払い
- [x] `src/systems/DockSystem.ts` — 損傷 (艦ごとの HP 割合)、修理時間・費用、2 ドック並行、高速修理
- [x] `src/systems/ResearchSystem.ts` + `src/data/tech-tree.json` — 前提研究・費用・全艦補正・装備の解放
- [x] `src/systems/ProgressionSystem.ts` — 戦闘結果 → 資源報酬・損傷・艦長 XP をまとめて進捗に反映
- [x] テスト: `ResourceSystem` / `DockSystem` / `ResearchSystem` / `ProgressionSystem`

### B. シーン
- [x] `src/scenes/HomeScene.ts` — 鎮守府ハブ (資源表示、出撃 / 入渠 / 工廠 / 改装)
- [x] 入渠パネル (HomeScene 内) — 損傷艦の一覧、ドック 2 つ、修理開始・高速修理
- [x] `src/scenes/ArsenalScene.ts` — 工廠: 研究ツリーの一覧・研究実行
- [x] Fleet Builder: 出撃コストの表示、資源不足・入渠中の艦は出撃不可、損傷艦の HP 表示
- [x] 戦闘: 損傷艦は減った HP で出撃、研究補正の適用、結果で資源・損傷を反映 (Results に表示)
- [x] 画面遷移: タイトル → 鎮守府 → 各画面

### 完了処理
- [x] `docs/specs/systems/progression.md`
- [x] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint6]` タグ

## 実装メモ
- 入渠は HomeScene 内のパネルとして実装 (専用シーンは作らない)。`update()` で実時間の完了を監視。
- 撃沈された艦は失われず「大破 (10%)」で帰還する。資源不足・入渠中は出撃ボタンが無効になり理由を表示。
- 研究は即時完了 (研究時間は無し)。改装装備のうち 7 種は研究で解放。
