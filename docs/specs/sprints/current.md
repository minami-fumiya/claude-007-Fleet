# Sprint 4 — USN・Kriegsmarine・AI 強化・潜水艦戦

**Status**: Implemented [IMPLEMENTED: sprint4] | **Branch**: `ccr-192e7779-941xlk` (PR #14)
**Goal**: 3 国籍 (IJN / USN / KM) から艦隊を編成でき、国籍ごとに戦い方の違う AI と戦える。潜水艦は潜航して魚雷で戦い、駆逐艦はソナーと爆雷で対抗する。

## スコープ判断
- 艦船データは 1 国あたり 6 隻 (戦艦 2・巡洋艦・駆逐艦・空母・潜水艦) に絞り、ゲームバランスは既存 IJN の数値スケールに合わせる。
- 空母は艦載機が Sprint 5 のため、今スプリントは副砲のみの扱いを継続。
- ミニマップは Sprint 7 のため、ソナー探知は「探知中の潜水艦を半透明表示 + ソナー波紋」で表現する。
- 純粋ロジックは `src/systems/` に置き Vitest でテストする (Phaser 非依存)。

## Tasks

### A. 国籍データ・多国籍編成
- [x] `src/data/ships/usn.json` — Iowa / North Carolina / Baltimore / Fletcher / Essex / Gato
- [x] `src/data/ships/km.json` — Bismarck / Tirpitz / Prinz Eugen / Z1 / Graf Zeppelin / U-boat VIIC
- [x] `src/data/ships/ijn.json` — 伊19 (潜水艦) 追加
- [x] `src/data/weapons/weapons.json` — 各国の主砲・副砲・魚雷・爆雷を追加
- [x] `src/systems/ShipRegistry.ts` — 国籍別の艦リスト取得 (純粋ロジック)
- [x] `src/systems/EnemyFleetGenerator.ts` — 敵国籍・戦力に応じた敵艦隊生成
- [x] `ShipTextures.ts` — 潜水艦スプライト、全国籍の艦を生成
- [x] `FleetBuilderScene.ts` — 国籍タブ (IJN / USN / KM)・敵国籍の選択
- [x] `tests/unit/ShipRegistry.test.ts` / `EnemyFleetGenerator.test.ts`
- [x] `docs/specs/ships/USN/` / `docs/specs/ships/KM/` 仕様書 (`IJN/` も作成)

### B. AI v2
- [x] `src/systems/AIBrain.ts` — 優先目標選択 (距離・残 HP・脅威・艦種)、撤退判断、国籍別戦術プロファイル
  - IJN: 接近して魚雷戦 / USN: 遠距離砲戦を維持 / KM: 集中射撃で弱った艦を狙う
- [x] `AISystem.ts` を v2 化 — 旗艦だけでなく全プレイヤー艦を目標候補に
- [x] `tests/unit/AIBrain.test.ts`
- [x] `docs/specs/systems/ai.md`

### C. 武器の拡張
- [x] `src/entities/weapons/Torpedo.ts` — 低速・長射程・高威力 (Sprint 3 からの持ち越し)
- [x] 艦ごとに複数武器を扱う (主砲 + 魚雷 / 爆雷)。弾速は武器データの `projectileSpeed` を使用

### D. 潜水艦戦
- [x] `src/systems/SubmarineSystem.ts` — 潜航 / 浮上の状態管理 (潜航時: 速度低下・魚雷のみ・砲弾無効・潜航時間に上限)
- [x] `src/systems/SonarSystem.ts` — ソナー探知 (探知範囲内の潜航艦を可視化)
- [x] `src/entities/weapons/DepthCharge.ts` — 爆雷 (投下後に遅延爆発・範囲ダメージ)
- [x] 駆逐艦 AI: 探知した潜水艦へ接近して爆雷投下
- [x] プレイヤーが潜水艦を旗艦にした場合の潜航 / 浮上操作 (キー `Q` / ボタン)
- [x] 対潜戦モード基本版 (敵が潜水艦群)
- [x] `tests/unit/SubmarineSystem.test.ts` / `SonarSystem.test.ts`
- [x] `docs/specs/systems/submarine.md`

### 完了処理
- [x] `skill.md` に Sprint 4 の知見を追記
- [x] `Todo.md` / 本ファイルのチェック更新、`[IMPLEMENTED: sprint4]` タグ記入
- [ ] PR → CI → Vercel Preview 確認 (PR #14)

## 実装メモ
- AI の意思決定は `AIBrain.ts` (純粋関数)、操舵・射撃は `AISystem.ts` / `EscortAISystem.ts`。
- 武器選択は `WeaponSelector.ts`、照準の偏差射撃は `MathUtils.interceptAngle`。
- 潜水艦は独立したエンティティクラスではなく `BaseShip.sub` (潜航状態) で表現した。艦種別エンティティは backlog のまま。
- バランス調整: 魚雷は 2 本斉射で火力を分割、潜水艦魚雷は装填 8 秒、潜航持続 20 秒、爆雷は信管 0.8 秒 / 半径 110。
