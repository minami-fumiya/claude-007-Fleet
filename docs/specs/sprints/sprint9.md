# Sprint 9 — 史実シナリオ・育成深化・図鑑 (v2.0 候補)

**Status**: Implemented [IMPLEMENTED: sprint9] | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
**Goal**: 史実の海戦を固定配置・特殊勝利条件で再現でき、艦が戦うほど熟練し、改造で強くなる。全艦を図鑑で読める。

## スコープ判断
- 改造データは艦種ごとの段階 (改 / 改二) として `src/data/refits.json` にまとめる (各国別ファイルにはしない)。
- v2.0 タグは main へのマージ後にユーザーが付ける。

## Tasks

### A. 熟練度
- [x] `IShipStats.proficiency` (0–100) — 戦闘ごとに上昇。命中 (照準誤差の縮小) と回避 (被弾を一定確率でかわす) に補正
- [x] `src/systems/ProficiencySystem.ts` (純粋) + テスト

### B. 改造
- [x] `src/systems/RefitSystem.ts` + `src/data/refits.json` — 段階ごとの費用・熟練度条件・能力補正 (純粋)
- [x] 改装画面に改造パネル (段階の表示・改造実行)
- [x] 戦闘で改造補正を適用、艦名に「改」「改二」
- [x] テスト

### C. 史実シナリオ
- [x] `src/data/scenarios/midway.json` / `leyte-gulf.json` / `bismarck-chase.json`
- [x] シナリオ読み込み (固定配置・陣営選択・特殊勝利条件: 指定艦の撃沈 / 突入 / 逃走阻止・制限時間)
- [x] `src/scenes/ScenarioScene.ts` — シナリオ選択・史実解説
- [x] テスト

### D. 図鑑
- [x] 全艦に短い史実解説 (`description`)
- [x] `src/scenes/EncyclopediaScene.ts` — 国籍 / 艦種フィルタ、性能・武装・解説

### 完了処理
- [x] `docs/specs/systems/scenario.md` / `refit.md`
- [x] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint9]` タグ
