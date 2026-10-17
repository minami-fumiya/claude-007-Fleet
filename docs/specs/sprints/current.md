# Sprint 8 — 作戦マップ・キャンペーン・特殊作戦

**Status**: In Progress | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
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
- [ ] `src/data/campaign.json` — 太平洋 / 大西洋の海域 (解放条件・敵艦隊・目標・初回報酬)
- [ ] `src/systems/CampaignSystem.ts` — 解放判定・攻略記録・報酬 (純粋)
- [ ] `src/scenes/CampaignMapScene.ts` — 戦略マップ (海域ノード・航路・詳細パネル)
- [ ] 鎮守府 → 作戦 → Fleet Builder (作戦の敵を使用) → 戦闘 → 結果で攻略記録
- [ ] テスト

### C. 護衛作戦
- [ ] `ConvoyShip` — 武装のない輸送船、航路に沿って進む
- [ ] 勝利: 輸送船 2 隻以上が脱出 / 敗北: 旗艦撃沈か輸送船 2 隻喪失

### D. 砲撃支援
- [ ] `LandTarget` — 砲台 (反撃する) / 港湾 / 飛行場、魚雷は当たらない
- [ ] 勝利: 陸上目標をすべて破壊

### 完了処理
- [ ] `docs/specs/systems/campaign.md`
- [ ] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint8]` タグ
