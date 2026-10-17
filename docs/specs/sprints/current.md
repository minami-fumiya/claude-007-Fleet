# Sprint 7 — 演出・品質・バランス (v1.0 候補)

**Status**: In Progress | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
**Goal**: 戦闘の見た目・音・状況 (天候 / 夜戦) が揃い、損傷とバランスが整った v1.0 候補にする。

## スコープ判断
- 音声アセットは用意できないため、効果音と BGM は WebAudio で合成する (`assets/audio/` は使わない)。ミュート切替あり。
- v1.0 タグは main へのマージ後にユーザーが付ける (このブランチではタグを作らない)。
- 純粋ロジックは `src/systems/` に置き Vitest でテストする。

## Tasks

### A. 損傷とクリティカル
- [x] `src/types/ShipDamage.ts` — 部位損傷 (主砲 / 機関 / 舵)
- [x] `CombatSystem.rollCriticalHit` — 命中時に確率で部位損傷 (火力・速力・旋回の低下、時間で応急修理)
- [x] HUD / ラベルに損傷アイコン
- [x] テスト

### B. 天候と夜戦
- [x] `src/systems/WeatherSystem.ts` — 晴天 / 曇天 / 嵐 / 霧 (視界・命中 (照準誤差)・速力の補正)
- [x] 夜戦: 視界を縮小、暗い画面、発砲した艦は一時的に発見される
- [x] Fleet Builder で天候 / 昼夜を選択 (ランダムも)
- [x] テスト

### C. 演出
- [x] 爆発の黒煙・炎上、着弾の水柱と波紋、航跡
- [x] `src/ui/Minimap.ts` — 味方 (青) / 視界内の敵 (赤) / 視界範囲
- [x] `src/systems/AudioSystem.ts` — 合成効果音 (砲撃・爆発・着水・魚雷・爆雷・航空機) と BGM (フェード)、ミュート

### D. バランス
- [ ] 戦闘シミュレーション (headless の純粋モデル) で国籍・艦種の勝率を確認し、HP / 火力 / AI を調整
- [ ] 調整結果を `docs/specs/systems/balance.md` に記録

### 完了処理
- [ ] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint7]` タグ
