# Progression Spec — 鎮守府・資源・入渠・研究 (Sprint 6)

Implementation: `ResourceSystem.ts`, `DockSystem.ts`, `ResearchSystem.ts`, `ProgressionSystem.ts` (pure, tested),
`src/data/tech-tree.json`, scenes `HomeScene` / `ArsenalScene`, progress in `ProgressStore` (localStorage `ww2fleet.progress.v1`).

## Flow
タイトル → **鎮守府** (resources, docks) → 出撃 (Fleet Builder) / 工廠 (research) / 改装 (refit) → battle → results → 鎮守府.

## Resources
| | 燃料 fuel | 弾薬 ammo | 鋼材 steel | ボーキ bauxite |
|---|---|---|---|---|
| Start | 1500 | 1500 | 1500 | 800 |
Cap 20000 each.

### Sortie cost (per ship)
| Class | fuel | ammo | bauxite |
|---|---|---|---|
| Battleship | 60 | 70 | — |
| Carrier | 50 | 20 | 40 |
| Cruiser | 35 | 40 | — |
| Destroyer | 15 | 20 | — |
| Submarine | 10 | 15 | — |
The Fleet Builder shows the cost; the sortie is blocked (with the reason) when resources are short or a ship is in dock.

### Battle reward
Per enemy sunk: fuel 40 / ammo 40 / steel 60 / bauxite 20 (halved on a defeat). Victory bonus: 100 / 100 / 120 / 50.
Each carrier aircraft shot down costs 6 bauxite to replace. Shown on the results screen.

## Damage and docks
- Ships keep the HP fraction they finished with; a ship sunk in battle returns 大破 at 10% (never lost).
- Fleet Builder shows `HP x / max` with 小破 (>50%) / 中破 (≤50%) / 大破 (≤25%) / 入渠中.
- 2 docks repair in real time: 40 ms per HP; cost fuel 0.2 + steel 0.4 per missing HP.
- 高速修理 finishes a docked ship immediately for fuel 40 + steel 80.

## Research (工廠) — Sprint 12: branches and levels I–V
Paying the cost completes a project immediately. Effects are fleet-wide `IShipModifiers` (multipliers multiply,
`armorAdd` / `planesAdd` add) and some nodes unlock refit upgrades or ship construction. 49 nodes in 12 branches;
each node has a `branch` and a `level` (I–V) and needs the previous level of its branch. Costs rise with the level
inside every branch (tested). Existing ids (and saves that reference them) are unchanged.

| Branch | Nodes (level: effect) |
|---|---|
| 砲術 gunnery (6) | `gunnery_1` I guns ×1.05 · `gunnery_2` II reload ×0.94 · `fire_control` II guns ×1.03 (unlocks 射撃指揮装置) · `gunnery_3` III guns ×1.03 · `gunnery_4` IV reload ×0.96 · `gunnery_5` V guns ×1.04 (needs `fire_control`) |
| 水雷 torpedo (5) | `torpedo_1` I ×1.08 (unlocks 魚雷改良) · `torpedo_2`–`torpedo_5` ×1.05 / ×1.05 / ×1.04 / ×1.04 |
| 装甲 armor (5) | `armor_1` I HP ×1.05 (unlocks 追加装甲) · `armor_2` armor +2 · `armor_3` HP ×1.03 · `armor_4` armor +2 · `armor_5` HP ×1.03 |
| 応急 damage control (3) | `damage_control_1` I HP ×1.05 (needs `armor_1`, unlocks 応急修理班) · `damage_control_2` ×1.02 · `damage_control_3` ×1.02 (needs `armor_3`) |
| 機関 engine (3) | `engine_1` I speed ×1.04 (unlocks 機関強化) · `engine_2` ×1.03 · `engine_3` ×1.03 |
| 電探 radar (3) | `radar_1` I vision ×1.05 (needs `fire_control`, unlocks 水上レーダー) · `radar_2` ×1.05 · `radar_3` ×1.05 + night vision ×1.05 |
| 対空 AA (5) | `aa_1` I ×1.1 (unlocks 対空機銃増設) · `aa_2`–`aa_5` ×1.08 / ×1.08 / ×1.07 / ×1.07 (`aa_5` needs `radar_1`) |
| 航空 aviation (5) | `aviation_1` air attack ×1.05 · `aviation_2` re-arm ×0.9 · `aviation_3` air attack ×1.05 · `aviation_4` planes +1 per type · `aviation_5` air attack ×1.05, re-arm ×0.95 |
| 対潜 ASW (3) | `asw_1` sonar ×1.15 · `asw_2` depth charges ×1.15 · `asw_3` sonar ×1.1, depth charges ×1.1 |
| 夜戦 night (3) | `night_1` night aim error ×0.9 · `night_2` night vision ×1.1 · `night_3` night aim error ×0.9, night vision ×1.05 |
| 補給 logistics (3) | `logistics_1`–`logistics_3`: natural resource regeneration ×1.1 / ×1.15 / ×1.2 (`regenMul`, no ship effect) |
| 建造 shipbuilding (5) | `build_cruiser` I · `build_submarine` I · `build_battleship` II (needs `build_cruiser`) · `build_carrier` II (needs `build_cruiser`) · `fictional_ships` III (needs `gunnery_2`, `damage_control_1`, `build_battleship`) |

New modifier fields (`IShipModifiers`): `airPowerMul` (bomb / aerial torpedo damage of the carrier's planes),
`planesAdd` (extra planes of each type the wing already flies), `rearmMul` (squadron re-arm time), `sonarMul`,
`depthChargeMul`, `nightAimMul` (aim error at night, player ships) and `nightVisionMul` (vision at night).
`BattleScene` stores the combined modifiers on each ship (`ship.mods`); sonar, air wings, bombs and night aim read them.

### API for other systems (pure, `ResearchSystem.ts`)
- `TECH_TREE`, `TECH_BRANCHES`, `branchNodes(tree, branch)`, `branchProgress(tree, branch, done)`.
- `regenMultiplier(done)` — multiplier for natural resource regeneration (1 when no logistics research).
- `BUILD_TECH` / `BUILD_TECH_FOR` / `buildUnlocked(shipClass, done)` — shipbuilding gates (destroyers need none).
- Everything takes `done: string[]`, so a per-nation progress shape only changes the caller.

### Arsenal UI
`ArsenalScene` shows branch tabs (12 in one row in landscape, 2 × 6 in portrait, each with `done/total`) above the
selected branch's projects ordered by level (`ResearchView` component). Each card shows the level, effect,
prerequisites (other branches named in brackets, red while unmet), cost and state (研究済 / 研究可 / 資源不足 / 前提未達).
A line under the tabs sums the branch's current effect.

`強装薬` needs no research. Locked upgrades show 要研究 in the refit screen and are ignored in battle.
