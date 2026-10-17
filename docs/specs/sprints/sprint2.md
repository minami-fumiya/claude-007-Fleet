# Sprint 2 — 戦闘システム・HUD・敵 AI

**Status**: Implemented [IMPLEMENTED: sprint2] | **Branch**: `feature/sprint2-combat-hud-ai`
**Goal**: CombatSystem with damage formula, HP bars, basic enemy AI, win/loss conditions.

## Tasks

### システム (src/systems/)
- [x] `src/systems/CombatSystem.ts`
  - `calculateDamage(weapon, targetClass, targetArmor): number`
  - `applyDamage(ship, damage): void`
  - ダメージ式: `Math.max(1, weapon.firePower * multiplier - targetArmor * 0.5)`
- [x] `src/systems/ReloadState.ts` — リロードタイマー (WeakMap ベース、テスト可能)
- [x] `src/systems/WeaponSystem.ts`
  - `fireWeapon(ship, weapon, targetAngle, now): boolean`
  - ObjectPool からシェル取得・管理
- [x] `src/systems/AISystem.ts` v1
  - `Phaser.Math.Angle.Between` で向き計算
  - 射程内で発射・接近移動

### 当たり判定
- [x] `BattleScene.ts` に `physics.add.overlap(playerShells, enemies, onHit)` 追加
- [x] `physics.add.overlap(enemyShells, [player], onHit)` 追加
- [x] `onHit` → `CombatSystem.applyDamage` 呼び出し

### エフェクト (src/entities/effects/)
- [x] `src/entities/effects/Explosion.ts` — Phaser ParticleEmitter (sprint 7 で強化予定)
- [x] `src/entities/effects/WaterSplash.ts` — 着弾水柱 (sprint 7 で BattleScene に組込予定)

### UI / HUD (src/ui/)
- [x] `src/ui/HUD.ts` — 戦闘中 HUD (プレイヤー HP バー・撃沈カウンター)
- [x] `src/ui/components/HealthBar.ts` — HP バー (Graphics 描画、HP に応じて色変化)

### BattleScene 完成
- [x] 敵艦 3 隻スポーン (赤 tint・大和と同スプライト)
- [x] 勝利条件: 全敵艦撃沈
- [x] 敗北条件: プレイヤー HP = 0
- [x] `src/scenes/ResultsScene.ts` — 勝敗表示・RETRY ボタン

### テスト
- [x] `tests/unit/CombatSystem.test.ts` — ダメージ計算・型倍率・境界値 (10 tests)
- [x] `tests/unit/WeaponSystem.test.ts` — リロード状態管理 (7 tests)

### 完了処理
- [x] `docs/specs/sprints/current.md` に `[IMPLEMENTED: sprint2]` タグ記入
- [ ] feature/sprint2-* → develop PR → CI → merge
- [ ] Vercel Preview URL 動作確認
