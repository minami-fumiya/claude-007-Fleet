# Sprint 3 — Full IJN Roster, FleetBuilder, Formations

**Status**: Implemented [IMPLEMENTED: sprint3] | **Branch**: `feature/sprint3-ijn-fleet-builder`
**Goal**: 5-ship IJN roster, FleetBuilder scene for pre-battle fleet composition, formation system for escort AI behavior.

## Tasks

### データ (src/data/)
- [x] `src/data/ships/ijn.json` — 5 隻に拡張 (Yamato, Musashi, Takao, Fubuki, Shokaku)
- [x] `src/data/weapons/weapons.json` — 武器定義 (46cm, 20cm, 12cm, 93式魚雷)

### 型定義 (src/types/)
- [x] `src/types/Formation.ts` — `Formation` enum + `IFormationSlotOffset` + `IFormationConfig`

### システム (src/systems/)
- [x] `src/systems/FleetSystem.ts`
  - `createFleet(...)`: IFleet 生成
  - `isValid(fleet)`: 艦が 1 隻以上あるか検証
  - `getShips(fleet)`: null 除外した艦リスト
  - `getFlagship(fleet)`: 旗艦 IShipData 取得
- [x] `src/systems/FormationSystem.ts`
  - `getOffsets(formation)`: 陣形スロットオフセット配列
  - `getWorldPosition(flagship, offset)`: 旗艦基準ワールド座標計算
- [x] `src/systems/EscortAISystem.ts`
  - 陣形ポジションへの移動
  - 射程内の敵に自動攻撃

### シーン (src/scenes/)
- [x] `src/scenes/MainMenuScene.ts` — タイトル画面 → FleetBuilder 遷移
- [x] `src/scenes/FleetBuilderScene.ts`
  - IJN 艦選択 (最大 3 スロット)
  - 陣形選択 (縦陣 / 複縦陣 / 輪形陣)
  - 出撃ボタン → BattleScene に IBattleInitData を渡す

### 既存ファイル更新
- [x] `src/scenes/BootScene.ts` — 新艦プレースホルダーテクスチャ生成
- [x] `src/scenes/PreloadScene.ts` — 武器 JSON キャッシュ・MainMenu 遷移
- [x] `src/scenes/BattleScene.ts` — IBattleInitData 受取・護衛艦スポーン・EscortAI
- [x] `src/scenes/ResultsScene.ts` — RETRY → FleetBuilderScene
- [x] `src/config/GameConfig.ts` — MainMenuScene / FleetBuilderScene 登録
- [x] `src/utils/DataLoader.ts` — `getWeapons()` / `getWeaponById()` 追加

### テスト
- [x] `tests/unit/FleetSystem.test.ts` — 艦隊構成ロジック (6 tests)
- [x] `tests/unit/FormationSystem.test.ts` — 陣形ポジション計算 (6 tests)

### 完了処理
- [x] `docs/specs/sprints/current.md` に `[IMPLEMENTED: sprint3]` タグ記入
- [x] feature/sprint3-* → develop PR → CI → merge
- [x] Vercel Preview URL 動作確認
