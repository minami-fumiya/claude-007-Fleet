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
- [ ] `src/systems/CombatSystem.ts`
  - `calculateDamage(weapon, target): number`
  - `applyDamage(ship, damage): void`
  - ダメージ式: `Math.max(1, weapon.firePower * multiplier - target.armor * reduction)`
- [ ] `src/systems/WeaponSystem.ts`
  - `fireWeapon(ship, targetAngle): void`
  - リロードタイマー管理
  - ObjectPool からシェル取得

#### 当たり判定
- [ ] `BattleScene.ts` に `physics.add.overlap(shells, enemies, onHit)` 追加
- [ ] `onHit` → `CombatSystem.applyDamage` 呼び出し

#### エフェクト (src/entities/effects/)
- [ ] `src/entities/effects/Explosion.ts` — Phaser ParticleEmitter
- [ ] `src/entities/effects/WaterSplash.ts` — 着弾水柱

#### UI / HUD (src/ui/)
- [ ] `src/ui/HUD.ts` — 戦闘中 HUD レイアウト
- [ ] `src/ui/components/HealthBar.ts` — HP バー (Graphics 描画)

#### 敵 AI 基本版
- [ ] `src/systems/AISystem.ts` v1
  - `Phaser.Math.Angle.Between` で向き計算
  - 射程内で発射

#### BattleScene 完成
- [ ] 勝利条件: 全敵艦撃沈
- [ ] 敗北条件: 旗艦 HP = 0
- [ ] `src/scenes/ResultsScene.ts` 基本版 (勝敗表示・リトライ)

#### テスト
- [ ] `tests/unit/CombatSystem.test.ts` — ダメージ計算・境界値
- [ ] `tests/unit/WeaponSystem.test.ts` — リロード・発射タイミング

#### Sprint 2 完了処理
- [ ] 仕様書タグ更新 → develop PR → Vercel Preview 確認 → main マージ

---

## Phase 2: コンテンツ拡充

### Sprint 3: IJN 全艦種・FleetBuilder・護衛艦・陣形

#### IJN 艦種実装 (src/entities/ships/)
- [ ] `src/entities/ships/Battleship.ts` (主砲 2 連装)
- [ ] `src/entities/ships/Cruiser.ts` (中速・副砲多め)
- [ ] `src/entities/ships/Destroyer.ts` (高速・魚雷搭載)
- [ ] `src/entities/ships/Carrier.ts` (低耐久・艦載機発艦ポイント)
- [ ] `src/entities/ships/Submarine.ts` (潜航フラグ・表示切替)

#### IJN データ (`src/data/ships/ijn.json`)
- [ ] 戦艦: 大和 / 武蔵 / 長門 / 陸奥 / 金剛 + 架空枠
- [ ] 巡洋艦: 高雄 / 愛宕 / 利根 / 筑摩 等
- [ ] 駆逐艦: 島風 / 雪風 / 初春 等
- [ ] 空母: 赤城 / 加賀 / 翔鶴 / 瑞鶴 / 大鳳 等
- [ ] 潜水艦: 伊400 / 伊19 等
- [ ] `docs/specs/ships/IJN/` 仕様書一式

#### 武器追加
- [ ] `src/entities/weapons/Torpedo.ts` — 低速・高威力・AOE
- [ ] `src/data/weapons/torpedoes.json` / `main-guns.json` / `secondary.json`

#### FleetBuilder
- [ ] `src/scenes/FleetBuilderScene.ts`
- [ ] `src/ui/FleetPanel.ts` — 艦船カード一覧・編成
- [ ] `src/ui/components/ShipCard.ts` — 艦名・HP・攻撃力カード
- [ ] `src/systems/FleetSystem.ts` — 陣形計算・隊列維持 AI
- [ ] 陣形種別: 単縦陣 / 輪形陣 / 複縦陣

#### 護衛艦 AI
- [ ] `AISystem.ts` 拡張: 旗艦 / 空母を追従しつつ脅威排除

#### Sprint 3 完了処理
- [ ] develop PR → CI → Vercel Preview → main マージ

---

### Sprint 4: USN・Kriegsmarine・AI 強化・潜水艦戦

#### USN データ (`src/data/ships/usn.json`)
- [ ] 戦艦: Iowa / Missouri / New Jersey / North Carolina 等
- [ ] 巡洋艦: Baltimore / Des Moines 等
- [ ] 駆逐艦: Fletcher / Gearing 等
- [ ] 空母: Essex / Enterprise / Midway 等
- [ ] 潜水艦: Gato / Balao 等
- [ ] `docs/specs/ships/USN/` 仕様書

#### Kriegsmarine データ (`src/data/ships/kriegsmarine.json`)
- [ ] 戦艦: Bismarck / Tirpitz / Scharnhorst / Gneisenau
- [ ] 巡洋艦: Admiral Hipper / Prinz Eugen 等
- [ ] 駆逐艦: Z 級各艦
- [ ] 空母: Graf Zeppelin (架空扱い)
- [ ] 潜水艦: VIIC 型 / IXC 型 / XXI 型 等
- [ ] `docs/specs/ships/Kriegsmarine/` 仕様書

#### AI 強化
- [ ] `AISystem.ts` v2: 優先目標選択 / 撤退判断 / 国籍別戦術差

#### 潜水艦戦メカニクス
- [ ] `Submarine.ts` 潜航 / 浮上 状態管理 (alpha=0 / 速度低下 / 魚雷のみ)
- [ ] `src/entities/weapons/DepthCharge.ts` — 爆雷 (AOE・遅延爆発)
- [ ] ソナー探知: 探知範囲内の潜水艦をミニマップに表示
- [ ] ASW モード基本版 (護衛艦 vs 潜水艦群)

#### Sprint 4 完了処理
- [ ] develop PR → CI → Vercel Preview → main マージ

---

### Sprint 5: Royal Navy・カスタマイズ・艦長・艦載機

#### Royal Navy データ (`src/data/ships/royal-navy.json`)
- [ ] 戦艦: Hood / King George V / Warspite / Rodney 等
- [ ] 巡洋艦: Belfast / Southampton 等
- [ ] 駆逐艦: Tribal 級 / J 級 等
- [ ] 空母: Illustrious / Ark Royal 等
- [ ] 潜水艦: T 級 / U 級 等
- [ ] `docs/specs/ships/RoyalNavy/` 仕様書

#### カスタマイズシステム
- [ ] `src/systems/CustomizationSystem.ts` — スロット管理・ステータス再計算
- [ ] `src/scenes/CustomizationScene.ts`
- [ ] `src/ui/CustomizationPanel.ts` — スロット UI・装備選択
- [ ] `docs/specs/systems/customization.md`

#### 艦長システム
- [ ] `src/types/Captain.ts` — `ICaptain` / `CaptainSkill` enum
- [ ] `src/systems/CaptainSystem.ts` — 任命 / スキル3種 / 経験値・レベルアップ
- [ ] `docs/specs/systems/captain.md`

#### 艦載機システム
- [ ] `src/types/Aircraft.ts` — `AircraftType` enum (Fighter / DiveBomber / TorpedoBomber)
- [ ] `src/entities/aircraft/BaseAircraft.ts`
- [ ] `src/entities/aircraft/Fighter.ts` — 制空権確保・敵機迎撃
- [ ] `src/entities/aircraft/DiveBomber.ts` — 急降下爆撃
- [ ] `src/entities/aircraft/TorpedoBomber.ts` — 低空雷撃
- [ ] `Carrier.ts` に発艦 / 着艦メソッド追加
- [ ] `docs/specs/systems/aircraft.md`

#### 航空偵察機
- [ ] `src/entities/aircraft/Recon.ts` — 水上機・扇形索敵範囲
- [ ] FogOfWar 実装 (RenderTexture マスク)

#### Sprint 5 完了処理
- [ ] develop PR → CI → Vercel Preview → main マージ

---

## Phase 3: システム拡張・品質

### Sprint 6: 鎮守府・基地システム

- [ ] `src/scenes/HomeScene.ts` — 鎮守府ハブ画面 (編成 / 出撃 / 工廠 / 管理)
- [ ] `src/systems/DockSystem.ts` — 修理キュー管理 (最大2隻並列・時間コスト)
- [ ] `src/systems/ResourceSystem.ts` — 燃料 / 弾薬 / 鋼材 / ボーキサイト 管理
- [ ] `src/scenes/ArsenalScene.ts` — 工廠画面
- [ ] `src/systems/ResearchSystem.ts` — 技術ツリー・資源消費でアンロック
- [ ] `src/data/tech-tree.json` — 技術ツリー定義
- [ ] `src/systems/ProgressionSystem.ts` — 経験値付与・資源獲得統合
- [ ] `docs/specs/systems/progression.md`
- [ ] develop PR → CI → Vercel Preview → main マージ

---

### Sprint 7: 演出・品質・バランス

- [ ] `src/systems/AudioSystem.ts` — BGM フェード・SE 管理
- [ ] `assets/audio/bgm/` / `assets/audio/sfx/` アセット配置
- [ ] Explosion / WaterSplash エフェクト強化 (黒煙・波紋アニメーション)
- [ ] `src/ui/Minimap.ts` — RenderTexture 縮小表示 (味方: 青 / 敵: 赤)
- [ ] `src/systems/WeatherSystem.ts` — 晴天 / 曇天 / 嵐 / 霧 (命中・視界補正)
- [ ] 夜戦モード: 暗転オーバーレイ・視界円・レーダー拡大
- [ ] `src/types/ShipDamage.ts` — 部位別損傷フラグ
- [ ] `CombatSystem.ts` に `rollCriticalHit` 追加 (主砲破壊 / 機関損傷 / 舵損傷)
- [ ] 全体バランス調整 (HP / ダメージ / 速度 / AI 強度)
- [ ] develop PR → CI → Vercel Preview → main マージ → **v1.0 タグ**

---

## Phase 4: 高度機能・拡張

### Sprint 8: 作戦マップ・キャンペーン・特殊モード

- [ ] `src/scenes/CampaignMapScene.ts` — 太平洋 / 大西洋 戦略マップ
- [ ] `src/data/campaign.json` — 海域定義 (解放条件・敵艦隊構成)
- [ ] `src/systems/CampaignSystem.ts` — 進行管理・海域ロック / アンロック
- [ ] 護衛作戦モード: `src/entities/ConvoyShip.ts` + 護衛シナリオ
- [ ] 砲撃支援モード: `src/entities/LandTarget.ts` (砲台 / 港湾 / 飛行場)
- [ ] FogOfWar 完全実装 (視界外は不可視)
- [ ] Tiled マップ対応 (`assets/maps/stage-01.json`) + 島・浅瀬の衝突判定
- [ ] 潮流ベクトルフィールド (一定方向に艦を押し流す)
- [ ] develop PR → CI → Vercel Preview → main マージ

---

### Sprint 9: 史実シナリオ・育成深化・図鑑

- [ ] `src/data/scenarios/midway.json` / `leyte-gulf.json` / `bismarck-chase.json`
- [ ] シナリオ読み込みシステム (固定配置・特殊勝利条件)
- [ ] `src/systems/RefitSystem.ts` — 改装/改造 (資源消費で段階解放)
- [ ] `src/data/refits/` — 各国改装データ JSON
- [ ] `IShipStats` に `proficiency: number (0-100)` 追加 → 命中 / 回避補正
- [ ] `src/scenes/EncyclopediaScene.ts` — 艦船図鑑 (国籍 / 艦種フィルタ・史実解説)
- [ ] develop PR → CI → Vercel Preview → main マージ → **v2.0 タグ**

---

### Sprint 10+: 架空艦・追加コンテンツ

- [ ] 架空艦実装 (IJN: 超大和型・A-150 / USN: モンタナ級 / KM: H 級 / RN: ライオン級)
- [ ] 追加シナリオ / 海域 (地中海 / インド洋 等)
- [ ] 戦績・勲章システム拡充
- [ ] (検討) マルチプレイヤー対戦 (WebSocket)

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
