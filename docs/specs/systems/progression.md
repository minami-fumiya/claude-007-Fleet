# Progression Spec — 鎮守府・資源・入渠・研究 (Sprint 6)

Implementation: `ResourceSystem.ts`, `DockSystem.ts`, `ResearchSystem.ts`, `ProgressionSystem.ts` (pure, tested),
`src/data/tech-tree.json`, scenes `HomeScene` / `ArsenalScene`, progress in `ProgressStore` (localStorage `ww2fleet.progress.v2`, per nation since Sprint 12 — see `nation-progress.md`).

## Flow
タイトル → **鎮守府** (resources, docks) → 出撃 (Fleet Builder) / 工廠 (research) / 改装 (refit) → battle → results → 鎮守府.

## Resources
| | 燃料 fuel | 弾薬 ammo | 鋼材 steel | ボーキ bauxite |
|---|---|---|---|---|
| Start (new nation, Sprint 12) | 0 | 0 | 0 | 0 |
| Natural regeneration per minute (up to 1500) | +3 | +3 | +3 | +1 |
Cap 20000 each. Pre-Sprint-6 v1 saves without resources still migrate with 1500 / 1500 / 1500 / 800.
Each nation has its own resources, docks and research (`nation-progress.md`).

### Sortie cost (per ship)
| Class | fuel | ammo | bauxite |
|---|---|---|---|
| Battleship | 60 | 70 | — |
| Carrier | 50 | 20 | 40 |
| Cruiser | 35 | 40 | — |
| Destroyer | 15 | 20 | — |
| Submarine | 10 | 15 | — |
The Fleet Builder shows the cost; the sortie is blocked (with the reason) when resources are short or a ship is in dock.
演習 (free battle) and the first area of each theater are free; 演習 also allows docked ships (Sprint 12).

### Battle reward
Per enemy sunk: fuel 40 / ammo 40 / steel 60 / bauxite 20 (halved on a defeat). Victory bonus: 100 / 100 / 120 / 50.
Each carrier aircraft shot down costs 6 bauxite to replace. Shown on the results screen.
演習: half the reward, no aircraft cost, and no damage is kept (ships also start at full HP).

## Damage and docks
- Ships keep the HP fraction they finished with; a ship sunk in battle returns 大破 at 10% (never lost).
- Fleet Builder shows `HP x / max` with 小破 (>50%) / 中破 (≤50%) / 大破 (≤25%) / 入渠中.
- 2 docks repair in real time: 40 ms per HP; cost fuel 0.2 + steel 0.4 per missing HP.
- 高速修理 finishes a docked ship immediately for fuel 40 + steel 80.

## Research (工廠)
Paying the cost completes a project immediately. Effects are fleet-wide `IShipModifiers` and unlock refit upgrades:

| id | 名称 | Requires | Effect | Unlocks |
|---|---|---|---|---|
| gunnery_1 | 砲術研究 I | — | gun power ×1.05 | — |
| gunnery_2 | 砲術研究 II | gunnery_1 | gun reload ×0.94 | — |
| fire_control | 射撃管制 | gunnery_1 | gun power ×1.03 | 射撃指揮装置 |
| torpedo_1 | 魚雷研究 | — | torpedo power ×1.08 | 魚雷改良 |
| armor_1 | 装甲研究 | — | HP ×1.05 | 追加装甲 |
| engine_1 | 機関研究 | — | speed ×1.04 | 機関強化 |
| damage_control_1 | ダメージコントロール | armor_1 | HP ×1.05 | 応急修理班 |
| radar_1 | 電探研究 | fire_control | vision ×1.05 | 水上レーダー |
| aa_1 | 対空研究 | — | AA ×1.1 | 対空機銃増設 |

| build_cruiser / build_battleship / build_carrier / build_submarine | 〜建造 | — (battleship: build_cruiser) | — | building that class (工廠 › 建造) |

`強装薬` needs no research. Locked upgrades show 要研究 in the refit screen and are ignored in battle.
