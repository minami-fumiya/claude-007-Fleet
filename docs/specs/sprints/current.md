# Sprint 8 — 作戦マップ・キャンペーン・特殊作戦

**Status**: Implemented [IMPLEMENTED: sprint8] | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
**Goal**: 島・浅瀬・潮流のある海域で戦い、作戦マップの海域を順に攻略していく。護衛作戦と砲撃支援の特殊作戦がある。

## スコープ判断
- Tiled エディタは使えないため、マップは独自 JSON (`src/data/maps/*.json`: 島・浅瀬は円の集合、潮流は矩形ゾーン) で定義する。
- FogOfWar は Sprint 5 で完全実装済み (視界外は不可視) のため本スプリントでは扱わない。
- キャンペーンの進行 (攻略済み海域) は `ProgressStore` に保存する。

## Tasks

### A. 海域マップ
- [x] `src/types/Map.ts` / `src/data/maps/*.json` — 島 (衝突)・浅瀬 (減速)・潮流ゾーン
- [x] `src/systems/MapSystem.ts` — 潮流ベクトル・浅瀬判定・島回避の操舵 (純粋)
- [x] 戦闘: 島の描画と衝突、砲弾は島に当たって消える、潮流で艦が流される、浅瀬で減速
- [x] テスト

### B. キャンペーン
- [x] `src/data/campaign.json` — 太平洋 / 大西洋の海域 (解放条件・敵艦隊・目標・初回報酬)
- [x] `src/systems/CampaignSystem.ts` — 解放判定・攻略記録・報酬 (純粋)
- [x] `src/scenes/CampaignMapScene.ts` — 戦略マップ (海域ノード・航路・詳細パネル)
- [x] 鎮守府 → 作戦 → Fleet Builder (作戦の敵を使用) → 戦闘 → 結果で攻略記録
- [x] テスト

### C. 護衛作戦
- [x] 輸送船 (`special.json` の `convoy`、BaseShip の `isConvoy`) — 武装なし、東へ航行
- [x] 勝利: 輸送船 2 隻以上が脱出 / 敗北: 旗艦撃沈か輸送船 2 隻喪失

### D. 砲撃支援
- [x] 陸上目標 (`special.json` の `landTargets`、BaseShip の `isLand`) — 砲台 (反撃する) / 港湾 / 飛行場、魚雷は当たらない
- [x] 勝利: 陸上目標をすべて破壊

### 完了処理
- [x] `docs/specs/systems/campaign.md`
- [x] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint8]` タグ

## 実装メモ
- 輸送船・陸上目標は専用エンティティクラスではなく、`BaseShip` + データ (`special.json`) + フラグで表現した。
- 砲弾は島の上を飛び越え、魚雷だけが島で止まる (陸上目標を砲撃できるように)。
- 勝敗判定は `ObjectiveSystem.evaluateObjective` に集約した。
