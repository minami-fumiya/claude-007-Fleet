# Sprint 1 — 型定義・シーン基盤・大和1隻

**Status**: Planned | **Branch**: `feature/sprint1-base-ship`
**Goal**: Playable Yamato on screen with WASD movement and click-to-fire.

## Tasks

### 型定義 (src/types/)
- [ ] `Nation.ts` — `enum Nation { IJN, USN, KM, RN }`
- [ ] `ShipClass.ts` — `enum ShipClass { Battleship, Cruiser, Destroyer, Carrier, Submarine }`
- [ ] `Ship.ts` — `IShipData` / `IShipStats`
- [ ] `Weapon.ts` — `IWeaponData` / `WeaponType`
- [ ] `Fleet.ts` — `IFleet` / `IFleetSlot`
- [ ] `Scene.ts` — inter-scene data types

### 設定 (src/config/)
- [ ] `GameConstants.ts` — CANVAS_W=1280, CANVAS_H=720, layer depths
- [ ] `SceneKeys.ts` — scene name constants
- [ ] `GameConfig.ts` — Phaser.Types.Core.GameConfig

### エントリポイント
- [ ] `src/main.ts` — `new Phaser.Game(GameConfig)`

### ユーティリティ (src/utils/)
- [ ] `MathUtils.ts` — angleBetween / distanceBetween / clamp
- [ ] `ObjectPool.ts` — pool class for bullets/effects
- [ ] `DataLoader.ts` — JSON load helper

### シーン (src/scenes/)
- [ ] `BootScene.ts` — minimal asset load → PreloadScene
- [ ] `PreloadScene.ts` — full asset load with progress bar

### エンティティ (src/entities/)
- [ ] `ships/BaseShip.ts` — Arcade.Sprite, HP/speed/armor, takeDamage, update
- [ ] `weapons/BaseProjectile.ts`
- [ ] `weapons/Shell.ts` — straight trajectory, ObjectPool

### データ
- [ ] `src/data/ships/ijn.json` — Yamato entry only
- [ ] `assets/ships/ijn/yamato.png` — placeholder sprite

### BattleScene
- [ ] `src/scenes/BattleScene.ts` — spawn Yamato, WASD move, mouse aim, click fire

### テスト
- [ ] `tests/unit/MathUtils.test.ts`

### 完了処理
- [ ] Mark `[IMPLEMENTED: sprint1]` in this file
- [ ] feature/sprint1-* → develop PR → CI → merge
- [ ] Vercel Preview URL 動作確認
