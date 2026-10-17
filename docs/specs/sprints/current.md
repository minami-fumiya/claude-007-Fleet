# Sprint 5 — Royal Navy・艦載機・偵察と索敵・艦長・カスタマイズ

**Status**: In Progress | **Branch**: `ccr-192e7779-941xlk` (PR #14 に Sprint 4 と同梱)
**Goal**: 4 国籍が揃い、空母が艦載機で戦える。視界外の敵は見えず (FogOfWar)、偵察機で索敵する。艦長とカスタマイズで艦を育てられる。

## スコープ判断
- 艦船データのファイル名は既存に合わせて `src/data/ships/rn.json` (Todo の `royal-navy.json` から変更)。
- 艦載機は「攻撃隊 (編隊) 単位」で扱う。1 機ずつの物理演算はしない。
- 艦長・カスタマイズの保存は localStorage (失敗時はメモリのみ)。本格的なセーブ/ロードは backlog のまま。
- 純粋ロジックは `src/systems/` に置き Vitest でテストする。

## Tasks

### A. Royal Navy
- [x] `src/data/ships/rn.json` — Hood / King George V / Warspite / Rodney / Belfast / Southampton / Tribal 級 / J 級 / Illustrious / Ark Royal / T 級 / U 級
- [x] 武器データ (15in / 16in / 14in / 6in / 4.7in / Mk.VIII 魚雷 / Mk.VIII 潜水艦魚雷)
- [x] `PLAYABLE_NATIONS` に RN を追加 (Fleet Builder タブ・交戦相手)
- [x] `docs/specs/ships/RN/roster.md`

### B. 艦載機
- [ ] `src/types/Aircraft.ts` — `AircraftType` (Fighter / DiveBomber / TorpedoBomber / Recon)、`IAirWing`
- [ ] `src/systems/AirWingSystem.ts` — 搭載機数・発艦・帰還・再装備・損耗 (純粋)
- [ ] `src/systems/AirCombat.ts` — 対空砲火による撃墜・戦闘機の迎撃 (純粋)
- [ ] `src/entities/aircraft/Squadron.ts` — 編隊エンティティ (進出 → 攻撃 → 帰還)
  - 急降下爆撃: 目標上空で爆弾 (Bomb) / 雷撃: 目標手前で魚雷投下 / 戦闘機: 空母上空で直掩・敵編隊を迎撃
- [ ] 空母の艦載機データ (`airWing`) と AI の攻撃隊発艦、プレイヤーの「攻撃隊発艦」ボタン
- [ ] `tests/unit/AirWingSystem.test.ts` / `AirCombat.test.ts`
- [ ] `docs/specs/systems/aircraft.md`

### C. 偵察機と FogOfWar
- [ ] `src/systems/VisionSystem.ts` — 艦の視界・偵察機の扇形索敵範囲・可視判定 (純粋)
- [ ] 偵察機 (戦艦・巡洋艦の水上機) が前方を索敵
- [ ] FogOfWar: 視界外の敵艦は非表示・攻撃目標にできない、画面は視界外を暗く (RenderTexture マスク)
- [ ] `tests/unit/VisionSystem.test.ts`

### D. 艦長
- [ ] `src/types/Captain.ts` — `ICaptain` / `CaptainSkill`
- [ ] `src/systems/CaptainSystem.ts` — 任命・スキル 3 種・経験値とレベルアップ (純粋)
- [ ] Fleet Builder で艦長を任命、戦闘結果で経験値付与
- [ ] `tests/unit/CaptainSystem.test.ts`
- [ ] `docs/specs/systems/captain.md`

### E. カスタマイズ
- [ ] `src/systems/CustomizationSystem.ts` — 装備スロット・ステータス再計算 (純粋)
- [ ] `src/scenes/CustomizationScene.ts` + `src/ui/CustomizationPanel.ts`
- [ ] `tests/unit/CustomizationSystem.test.ts`
- [ ] `docs/specs/systems/customization.md`

### 完了処理
- [ ] `skill.md` / `Todo.md` / 本ファイル更新、`[IMPLEMENTED: sprint5]` タグ
- [ ] PR → CI → Vercel Preview 確認
