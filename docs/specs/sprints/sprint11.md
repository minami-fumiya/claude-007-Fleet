# Sprint 11 — 仕上げ: 設定・ヘルプ・セーブ管理 (提案)

**Status**: Implemented [IMPLEMENTED: sprint11] | **Branch**: `ccr-192e7779-941xlk` (PR #14 に同梱)
**Goal**: ROADMAP の機能は Sprint 10 で揃ったため、リリースに向けた仕上げを行う。音量を調整でき、操作方法を画面で確認でき、進行状況を保存・移行・リセットできる。

## スコープ判断
- ROADMAP にない項目のため「提案」とする。ユーザーのレビューで変更・取り消し可。
- マルチプレイヤーはサーバーが必要なため引き続き対象外。

## Tasks

### A. 設定
- [x] `src/systems/SettingsSystem.ts` (純粋) — BGM / 効果音の音量 (0–100)・ミュート、localStorage 保存 (進行データとは別キー)
- [x] `AudioSystem` に音量を反映
- [x] `src/scenes/SettingsScene.ts` — 音量スライダー / ミュート、タイトル画面と鎮守府から開く

### B. 操作説明
- [x] ヘルプ画面 — 操作 (キーボード / タッチ)・艦種・作戦目標の早見表 (兵装は図鑑で確認できるため省略)

### C. セーブ管理
- [x] 進行データのエクスポート (コピー用テキスト) / インポート (検証してから適用) / リセット (確認あり)
- [x] テスト (不正データを拒否、旧セーブの互換)

### 完了処理
- [x] `docs/specs/systems/settings.md`、Todo / skill.md 更新、`[IMPLEMENTED: sprint11]` タグ
