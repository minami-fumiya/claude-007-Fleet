# Sprint 1 — 型定義・シーン基盤・大和1隻

**Status**: Implemented [IMPLEMENTED: sprint1] | **Branch**: `feature/sprint1-base-ship`
**Goal**: Playable Yamato on screen with WASD movement and click-to-fire.

## Tasks

### 型定義 (src/types/)
- [x] `Nation.ts` — `enum Nation { IJN, USN, KM, RN }`
- [x] `ShipClass.ts` — `enum ShipClass { Battleship, Cruiser, Destroyer, Carrier, Submarine }`
- [x] `Ship.ts` — `IShipData` / `IShipStats`
- [x] `Weapon.ts` — `IWeaponData` / `WeaponType`
- [x] `Fleet.ts` — `IFleet` / `IFleetSlot`
- [x] `Scene.ts` — inter-scene data types

### 設定 (src/config/)
- [x] `GameConstants.ts` — CANVAS_W=1280, CANVAS_H=720, layer depths
- [x] `SceneKeys.ts` — scene name constants
- [x] `GameConfig.ts` — Phaser.Types.Core.GameConfig

### エントリポイント
- [x] `src/main.ts` — `new Phaser.Game(GameConfig)`

### ユーティリティ (src/utils/)
- [x] `MathUtils.ts` — angleBetween / distanceBetween / clamp
- [x] `ObjectPool.ts` — pool class for bullets/effects
- [x] `DataLoader.ts` — JSON load helper

### シーン (src/scenes/)
- [x] `BootScene.ts` — minimal asset load → PreloadScene
- [x] `PreloadScene.ts` — full asset load with progress bar

### エンティティ (src/entities/)
- [x] `ships/BaseShip.ts` — Arcade.Sprite, HP/speed/armor, takeDamage, update
- [x] `weapons/BaseProjectile.ts`
- [x] `weapons/Shell.ts` — straight trajectory, ObjectPool

### データ
- [x] `src/data/ships/ijn.json` — Yamato entry only
- [x] `public/assets/ships/ijn/yamato.png` — placeholder sprite (64×32 gray PNG)

### BattleScene
- [x] `src/scenes/BattleScene.ts` — spawn Yamato, WASD move, mouse aim, click fire

### テスト
- [x] `tests/unit/MathUtils.test.ts` — 12 tests passing

### 完了処理
- [x] Mark `[IMPLEMENTED: sprint1]` in this file
- [ ] feature/sprint1-* → develop PR → CI → merge
- [ ] Vercel Preview URL 動作確認
