# Todo - WW2 Naval Fleet Game
> Phaser.js 3 + TypeScript + Vite | GitHub: `claude-007-Fleet` | Vercel: `claude-007-fleet`

---

## Sprint 0: 環境・インフラ整備

### GitHub セットアップ
- [x] `git init` でローカルリポジトリ初期化
- [x] `.gitignore` 作成 (node_modules / dist / .env / *.local)
- [x] GitHub に新規リポジトリ作成 (名前: `claude-007-Fleet`)
- [x] `git remote add origin https://github.com/minami-fumiya/claude-007-Fleet.git`
- [x] ブランチ戦略の設定
  - [x] `main` ブランチ = 本番 (Vercel 本番デプロイ)
  - [x] `develop` ブランチ = 統合 (Vercel プレビューデプロイ)
  - [x] feature ブランチ命名規則: `feature/sprint1-base-ship`
- [x] GitHub Settings → Branches → `main` を保護 (PR 必須・直接 push 禁止)
- [x] `.github/pull_request_template.md` 作成 (Sprint / 変更内容 / テスト確認)
- [x] `.github/workflows/ci.yml` 作成
  - Trigger: PR → develop、develop → main
  - Jobs: `npm run typecheck` + `npm run test`

### Vercel セットアップ
- [x] vercel.com でプロジェクト作成 (名前: `claude-007-fleet`) — CLI で自動作成
- [x] GitHub リポジトリ `claude-007-Fleet` を Vercel に連携 (Vercel GitHub App)
- [x] `vercel.json` 作成
- [x] Vercel → Settings → Git — Production Branch: `main` (自動デプロイ確認済み)
- [x] 初回デプロイ確認 → https://claude-007-fleet.vercel.app ✅ (main push で自動デプロイ)
- [ ] (任意) カスタムドメイン設定

### プロジェクト基盤ファイル
- [x] `package.json` 作成
  - 依存: `phaser@^3.88`
  - 開発: `typescript@^5` / `vite@^6` / `vitest@^3` / `@types/node` / `eslint`
  - scripts: `dev` / `build` / `preview` / `test` / `test:watch` / `typecheck` / `lint`
- [x] `tsconfig.json` 作成 (target: ES2022 / strict: true / paths: `@/*` → `src/*`)
- [x] `vite.config.ts` 作成 (alias: `@`→`/src` / phaser を別チャンクに分割)
- [x] `vitest.config.ts` 作成 (environment: jsdom / globals: true)
- [x] `.eslintrc.json` 作成 (TypeScript ESLint / no-explicit-any: error)
- [x] `index.html` 作成 (`<script type="module" src="/src/main.ts">`)
- [x] `CLAUDE.md` 作成 (プロジェクト概要・コマンド・仕様書読み順・規約)

### 仕様書初期セット
- [x] `docs/specs/GDD.md` (ゲーム概要・コアループ・スコープ定義)
- [x] `docs/specs/ROADMAP.md` (Phase 1-4 マイルストーン)
- [x] `docs/specs/GLOSSARY.md` (日英用語集)
- [x] `docs/specs/systems/combat.md` (ダメージ式・武器種別テーブル)
- [x] `docs/specs/ships/_template.md` (艦船データ記述テンプレート)
- [x] `docs/specs/sprints/backlog.md` (未割り当てタスク一覧)
- [x] `docs/specs/sprints/current.md` (Sprint 1 計画)
- [x] 初回 commit `chore: initial project setup` → `develop` push
- [x] develop → main への PR 作成・CI パス確認・マージ ✅ (PR #1 merged)

---

## Phase 1: 基盤構築

### Sprint 1: 型定義・シーン基盤・大和1隻

#### 型定義 (src/types/)
- [x] `src/types/Nation.ts` — `enum Nation { IJN, USN, KM, RN }`
- [x] `src/types/ShipClass.ts` — `enum ShipClass { Battleship, Cruiser, Destroyer, Carrier, Submarine }`
- [x] `src/types/Ship.ts` — `IShipData` (JSON 構造) / `IShipStats` (実行時ステータス)
- [x] `src/types/Weapon.ts` — `IWeaponData` / `WeaponType` enum
- [x] `src/types/Fleet.ts` — `IFleet` / `IFleetSlot`
- [x] `src/types/Scene.ts` — シーン間受け渡しデータ型

#### 設定・定数 (src/config/)
- [x] `src/config/GameConstants.ts` — `CANVAS_W=1280` / `CANVAS_H=720` / レイヤー深度定数
- [x] `src/config/SceneKeys.ts` — `const SceneKeys = { BOOT, PRELOAD, MAIN_MENU, ... } as const`
- [x] `src/config/GameConfig.ts` — `Phaser.Types.Core.GameConfig` オブジェクト

#### エントリポイント
- [x] `src/main.ts` — `new Phaser.Game(GameConfig)` 呼び出し

#### ユーティリティ (src/utils/)
- [x] `src/utils/MathUtils.ts` — `angleBetween` / `distanceBetween` / `clamp`
- [x] `src/utils/ObjectPool.ts` — 弾薬・エフェクト用プールクラス
- [x] `src/utils/DataLoader.ts` — JSON 読み込みヘルパー

#### シーン (src/scenes/)
- [x] `src/scenes/BootScene.ts` — 最小アセット読み込み → PreloadScene 遷移
- [x] `src/scenes/PreloadScene.ts` — 全アセット読み込み・ロードバー表示

#### 艦船エンティティ (src/entities/ships/)
- [x] `src/entities/ships/BaseShip.ts` — `Phaser.Physics.Arcade.Sprite` 継承
  - HP / speed / armor プロパティ
  - `takeDamage(amount: number): void`
  - `update(time: number, delta: number): void`

#### 武器・弾薬 (src/entities/weapons/)
- [x] `src/entities/weapons/BaseProjectile.ts`
- [x] `src/entities/weapons/Shell.ts` — 砲弾 (直線弾道・ObjectPool 使用)

#### 最初の艦船データ
- [x] `src/data/ships/ijn.json` — 大和エントリのみ
- [x] `public/assets/ships/ijn/yamato.png` 配置 (仮スプライト: 64×32 グレー PNG)

#### BattleScene 初期版
- [x] `src/scenes/BattleScene.ts`
  - create: プレイヤー艦 (大和) 生成
  - update: WASD 移動 / マウス方向に照準 / クリックで発射

#### Vitest テスト
- [x] `tests/unit/MathUtils.test.ts` — 12 tests passing

#### Sprint 1 完了処理
- [x] `docs/specs/sprints/current.md` に `[IMPLEMENTED: sprint1]` タグ記入
- [x] feature/sprint1-* → develop PR → CI パス → マージ (PR #2 ✅)
- [x] Vercel Preview URL で動作確認 ✅

---

### Sprint 2: 戦闘システム・HUD・敵AI

#### システム (src/systems/)
- [x] `src/systems/CombatSystem.ts`
  - `calculateDamage(weapon, targetClass, targetArmor): number`
  - `applyDamage(ship, damage): void`
  - ダメージ式: `Math.max(1, weapon.firePower * multiplier - targetArmor * 0.5)`
- [x] `src/systems/ReloadState.ts` — リロードタイマー (WeakMap ベース・テスト可能)
- [x] `src/systems/WeaponSystem.ts`
  - `fireWeapon(ship, weapon, targetAngle, now): boolean`
  - リロードタイマー管理・ObjectPool からシェル取得

#### 当たり判定
- [x] `BattleScene.ts` に `physics.add.overlap(playerShells, enemies, onHit)` 追加
- [x] `physics.add.overlap(enemyShells, [player], onHit)` 追加
- [x] `onHit` → `CombatSystem.applyDamage` 呼び出し

#### エフェクト (src/entities/effects/)
- [x] `src/entities/effects/Explosion.ts` — Phaser ParticleEmitter
- [x] `src/entities/effects/WaterSplash.ts` — 着弾水柱 (Sprint 7 でフル組込)

#### UI / HUD (src/ui/)
- [x] `src/ui/HUD.ts` — 戦闘中 HUD (プレイヤー HP バー・撃沈カウンター)
- [x] `src/ui/components/HealthBar.ts` — HP バー (Graphics 描画・HP で色変化)

#### 敵 AI 基本版
- [x] `src/systems/AISystem.ts` v1
  - `Phaser.Math.Angle.Between` で向き計算
  - 射程内で発射・接近移動

#### BattleScene 完成
- [x] 敵艦 3 隻スポーン (赤 tint)
- [x] 勝利条件: 全敵艦撃沈
- [x] 敗北条件: プレイヤー HP = 0
- [x] `src/scenes/ResultsScene.ts` — 勝敗表示・RETRY ボタン

#### テスト
- [x] `tests/unit/CombatSystem.test.ts` — ダメージ計算・型倍率・境界値 (10 tests)
- [x] `tests/unit/WeaponSystem.test.ts` — リロード状態管理 (7 tests)

#### Sprint 2 完了処理
- [x] 仕様書タグ更新 (`[IMPLEMENTED: sprint2]`)
- [x] feature/sprint2-* → develop PR → CI → merge (PR #3 ✅)
- [x] Vercel Preview URL 動作確認 ✅

---

## Phase 2: コンテンツ拡充

### Sprint 3: IJN 艦隊・FleetBuilder・護衛艦・陣形 ✅

> 詳細: `docs/specs/sprints/sprint3.md`。当初計画のうち未実装分は `docs/specs/sprints/backlog.md`「Deferred from Sprint 3」へ移動。

#### IJN データ / 武器
- [x] `src/data/ships/ijn.json` — 5 隻 (大和 / 武蔵 / 高雄 / 吹雪 / 翔鶴)
- [x] `src/data/weapons/weapons.json` — 46cm / 20cm / 12cm / 93式魚雷

#### FleetBuilder・陣形
- [x] `src/scenes/MainMenuScene.ts` / `src/scenes/FleetBuilderScene.ts` (最大 3 スロット)
- [x] `src/types/Formation.ts` + `src/systems/FormationSystem.ts` — 単縦陣 / 複縦陣 / 輪形陣
- [x] `src/systems/FleetSystem.ts` — 艦隊生成・検証・旗艦取得

#### 護衛艦 AI
- [x] `src/systems/EscortAISystem.ts` — 陣形位置へ追従・射程内の敵を自動攻撃

#### テスト
- [x] `tests/unit/FleetSystem.test.ts` / `tests/unit/FormationSystem.test.ts`

#### Sprint 3 完了処理
- [x] develop PR → CI → Vercel Preview → main マージ (PR #4 ✅)

### Sprint 3 後の追加対応 (計画外)
- [x] Issue #5〜#9 修正 — クラッシュ / テクスチャ / 艦名 / HP バー位置 (PR #10)
- [x] モバイル対応 — レスポンシブスケーリング / バーチャルジョイスティック / タップ射撃 (PR #11)
- [x] UI 刷新 — 日本語フォント / 縦画面レイアウト / AUTO 操縦 / 戦闘海域拡大 (PR #12)

---

### Sprint 4: USN・Kriegsmarine・AI 強化・潜水艦戦 ✅

> 詳細: `docs/specs/sprints/current.md`。Fleet Builder の艦リストは 6 隻ごとのページ切替。

#### USN データ (`src/data/ships/usn.json`)
- [x] 戦艦: Iowa / North Carolina
- [x] 戦艦: Missouri / New Jersey
- [x] 巡洋艦: Baltimore
- [x] 巡洋艦: Des Moines
- [x] 駆逐艦: Fletcher
- [x] 駆逐艦: Gearing
- [x] 空母: Essex (艦載機は Sprint 5)
- [x] 空母: Enterprise / Midway
- [x] 潜水艦: Gato
- [x] 潜水艦: Balao
- [x] `docs/specs/ships/USN/` 仕様書

#### Kriegsmarine データ (`src/data/ships/km.json`)
- [x] 戦艦: Bismarck / Tirpitz
- [x] 戦艦: Scharnhorst / Gneisenau
- [x] 巡洋艦: Prinz Eugen
- [x] 巡洋艦: Admiral Hipper
- [x] 駆逐艦: Z1 (Leberecht Maass)
- [x] 空母: Graf Zeppelin (架空扱い)
- [x] 潜水艦: VIIC 型
- [x] 潜水艦: IXC 型 / XXI 型
- [x] `docs/specs/ships/KM/` 仕様書

#### AI 強化
- [x] `AIBrain.ts` + `AISystem.ts` v2: 優先目標選択 / 撤退判断 / 国籍別戦術差 (`docs/specs/systems/ai.md`)

#### 潜水艦戦メカニクス
- [x] 潜航 / 浮上 状態管理 (`SubmarineSystem.ts`: 半透明 / 速度低下 / 魚雷のみ / 潜航時間制限)
- [x] `src/entities/weapons/DepthCharge.ts` — 爆雷 (AOE・遅延爆発)
- [x] `src/entities/weapons/Torpedo.ts` — 魚雷 (Sprint 3 から持ち越し)
- [x] ソナー探知 (`SonarSystem.ts`): 探知中のみ表示 + ソナー波紋 (ミニマップ表示は Sprint 7)
- [x] ASW モード基本版 (Fleet Builder の「対潜戦」で敵が潜水艦群)

#### Sprint 4 完了処理
- [ ] develop PR → CI → Vercel Preview → main マージ (PR #14)

---

### Sprint 5: Royal Navy・カスタマイズ・艦長・艦載機 ✅

> 詳細: `docs/specs/sprints/current.md`

#### Royal Navy データ (`src/data/ships/rn.json`)
- [x] 戦艦: Hood / King George V / Warspite / Rodney
- [x] 巡洋艦: Belfast / Southampton
- [x] 駆逐艦: Tribal 級 (Cossack) / J 級 (Javelin)
- [x] 空母: Illustrious / Ark Royal
- [x] 潜水艦: T 級 (Truant) / U 級 (Upholder)
- [x] `docs/specs/ships/RN/` 仕様書

#### カスタマイズシステム
- [x] `src/systems/CustomizationSystem.ts` — スロット管理・ステータス再計算
- [x] `src/scenes/CustomizationScene.ts` (パネル UI はシーン内に実装)
- [x] `docs/specs/systems/customization.md`

#### 艦長システム
- [x] `src/types/Captain.ts` — `ICaptain` / `CaptainSkill` enum
- [x] `src/systems/CaptainSystem.ts` — 任命 / スキル3種 / 経験値・レベルアップ
- [x] `docs/specs/systems/captain.md`

#### 艦載機システム
- [x] `src/types/Aircraft.ts` — `AircraftType` enum (Fighter / DiveBomber / TorpedoBomber / Recon)
- [x] `src/entities/aircraft/Squadron.ts` — 編隊 (機種ごとのクラスではなく編隊 1 クラスで実装)
- [x] 戦闘機 (直掩・迎撃) / 急降下爆撃 / 雷撃 — `AirOpsSystem.ts`
- [x] 空母の発艦 / 着艦・再装備 — `AirWingSystem.ts`
- [x] `docs/specs/systems/aircraft.md`

#### 航空偵察機
- [x] 水上偵察機 (`ReconSystem.ts`)・扇形索敵範囲 (`VisionSystem.ts`)
- [x] FogOfWar 実装 (RenderTexture マスク、`ui/FogOfWar.ts`)

#### Sprint 5 完了処理
- [ ] develop PR → CI → Vercel Preview → main マージ (PR #14)

---

## Phase 3: システム拡張・品質

### Sprint 6: 鎮守府・基地システム ✅

> 詳細: `docs/specs/systems/progression.md`

- [x] `src/scenes/HomeScene.ts` — 鎮守府ハブ画面 (出撃 / 工廠 / 改装 + 資源 + 入渠パネル)
- [x] `src/systems/DockSystem.ts` — 修理キュー管理 (最大2隻並列・時間コスト・高速修理)
- [x] `src/systems/ResourceSystem.ts` — 燃料 / 弾薬 / 鋼材 / ボーキサイト 管理
- [x] `src/scenes/ArsenalScene.ts` — 工廠画面
- [x] `src/systems/ResearchSystem.ts` — 技術ツリー・資源消費でアンロック
- [x] `src/data/tech-tree.json` — 技術ツリー定義
- [x] `src/systems/ProgressionSystem.ts` — 資源報酬・損傷の反映 (艦長 XP は CaptainSystem)
- [x] `docs/specs/systems/progression.md`
- [ ] develop PR → CI → Vercel Preview → main マージ (PR #14)

---

### Sprint 7: 演出・品質・バランス ✅

> 詳細: `docs/specs/sprints/current.md` / `docs/specs/systems/balance.md`

- [x] `src/systems/AudioSystem.ts` — BGM フェード・SE 管理 (WebAudio 合成)
- [x] ~~`assets/audio/` アセット配置~~ → 音はすべて合成するため不要
- [x] Explosion / WaterSplash エフェクト強化 (黒煙・波紋・航跡・炎上煙)
- [x] `src/ui/Minimap.ts` — 縮小表示 (味方: 青 / 敵: 赤)。Graphics で毎フレーム描画
- [x] `src/systems/WeatherSystem.ts` — 晴天 / 曇天 / 嵐 / 霧 (照準・視界・速力補正)
- [x] 夜戦モード: 暗い視界外・視界縮小・発砲炎で発見
- [x] `src/types/ShipDamage.ts` — 部位別損傷 (主砲 / 機関 / 舵)
- [x] `rollCriticalHit` (`DamageSystem.ts`) — 主砲損傷 / 機関損傷 / 舵損傷
- [x] 全体バランス調整 (`BalanceModel` + 不変条件テスト + AUTO 対戦)
- [ ] develop PR → CI → Vercel Preview → main マージ → **v1.0 タグ** (PR #14)

---

## Phase 4: 高度機能・拡張

### Sprint 8: 作戦マップ・キャンペーン・特殊モード ✅

> 詳細: `docs/specs/systems/campaign.md`

- [x] `src/scenes/CampaignMapScene.ts` — 太平洋 / 大西洋 戦略マップ
- [x] `src/data/campaign.json` — 海域定義 (解放条件・敵艦隊構成・目標・初回報酬)
- [x] `src/systems/CampaignSystem.ts` — 進行管理・海域ロック / アンロック
- [x] 護衛作戦モード: 輸送船 (`special.json`) + 護衛シナリオ (`ObjectiveSystem`)
- [x] 砲撃支援モード: 陸上目標 (砲台 / 港湾 / 飛行場)
- [x] FogOfWar 完全実装 (Sprint 5 で実装済み)
- [x] ~~Tiled マップ~~ → 独自 JSON マップ (`src/data/maps/`) + 島・浅瀬の衝突判定
- [x] 潮流ベクトルフィールド (矩形ゾーン)
- [ ] develop PR → CI → Vercel Preview → main マージ (PR #14)

---

### Sprint 9: 史実シナリオ・育成深化・図鑑 ✅

> 詳細: `docs/specs/systems/scenario.md` / `refit.md`

- [x] `src/data/scenarios/midway.json` / `leyte-gulf.json` / `bismarck-chase.json`
- [x] シナリオ読み込みシステム (固定配置・特殊勝利条件) + `ScenarioScene`
- [x] `src/systems/RefitSystem.ts` — 改装/改造 (資源消費で段階解放)
- [x] ~~`src/data/refits/` — 各国改装データ JSON~~ → 艦種別の段階を `src/data/refits.json` に集約
- [x] `IShipStats` に `proficiency: number (0-100)` 追加 → 命中 / 回避補正
- [x] `src/scenes/EncyclopediaScene.ts` — 艦船図鑑 (国籍 / 艦種フィルタ・史実解説)
- [ ] develop PR → CI → Vercel Preview → main マージ → **v2.0 タグ**

---

### Sprint 10: 架空艦・追加コンテンツ・戦績 ✅

> 詳細: `docs/specs/systems/records.md` / `scenario.md` / `campaign.md`

- [x] 架空艦実装 (IJN: 超大和型 A-150 / USN: モンタナ級 / KM: H 級 / RN: ライオン級) — 研究「架空艦計画」で解放
- [x] 追加シナリオ (第三次ソロモン海戦 / 北岬沖海戦) / 海域 (第 3 戦域「地中海」: 地中海・インド洋 5 海域)
- [x] 戦績・勲章システム (`RecordSystem` + 戦績画面 + 戦闘結果の勲章表示)
- [ ] (検討) マルチプレイヤー対戦 (WebSocket) — サーバーが必要なため Sprint 11 以降で検討

---

## CI/CD パイプライン全体像

```
feature/* ブランチ
    ↓ PR to develop
GitHub Actions CI (typecheck + vitest)
    ↓ merge
develop ブランチ → Vercel Preview Deploy (自動)
    ↓ PR to main (Sprint 完了時)
GitHub Actions CI (再実行)
    ↓ merge
main ブランチ → Vercel Production Deploy (自動)
```
