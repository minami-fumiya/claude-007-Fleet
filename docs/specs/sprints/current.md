# Sprint 4 — USN・Kriegsmarine・AI 強化・潜水艦戦

**Status**: In Progress | **Branch**: `ccr-192e7779-941xlk` (PR #14)
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
- [ ] `src/systems/AIBrain.ts` — 優先目標選択 (距離・残 HP・脅威・艦種)、撤退判断、国籍別戦術プロファイル
  - IJN: 夜戦・魚雷志向で接近 / USN: 遠距離砲戦を維持 / KM: 集中射撃で弱った艦を狙う
- [ ] `AISystem.ts` を v2 化 — 旗艦だけでなく全プレイヤー艦を目標候補に
- [ ] `tests/unit/AIBrain.test.ts`
- [ ] `docs/specs/systems/ai.md`

### C. 武器の拡張
- [ ] `src/entities/weapons/Torpedo.ts` — 低速・長射程・高威力 (Sprint 3 からの持ち越し)
- [ ] 艦ごとに複数武器を扱う (主砲 + 魚雷 / 爆雷)。弾速は武器データの `projectileSpeed` を使用

### D. 潜水艦戦
- [ ] `src/systems/SubmarineSystem.ts` — 潜航 / 浮上の状態管理 (潜航時: 速度低下・魚雷のみ・砲弾無効・潜航時間に上限)
- [ ] `src/systems/SonarSystem.ts` — ソナー探知 (探知範囲内の潜航艦を可視化)
- [ ] `src/entities/weapons/DepthCharge.ts` — 爆雷 (投下後に遅延爆発・範囲ダメージ)
- [ ] 駆逐艦 AI: 探知した潜水艦へ接近して爆雷投下
- [ ] プレイヤーが潜水艦を旗艦にした場合の潜航 / 浮上操作 (キー `Q` / ボタン)
- [ ] 対潜戦モード基本版 (敵が潜水艦群)
- [ ] `tests/unit/SubmarineSystem.test.ts` / `SonarSystem.test.ts`
- [ ] `docs/specs/systems/submarine.md`

### 完了処理
- [ ] `skill.md` に Sprint 4 の知見を追記
- [ ] `Todo.md` / 本ファイルのチェック更新、`[IMPLEMENTED: sprint4]` タグ記入
- [ ] PR → CI → Vercel Preview 確認
