# Nation Progress Spec (Sprint 12, WS-D: #15 #18 #25 #27 #28 #29 #30)

Implementation: `ProgressStore.ts` (save v2), `ResourceSystem.ts` (regen), `RankSystem.ts`, `ShipyardSystem.ts`,
`ProgressionSystem.ts` (exercise rules), `EnemyFleetGenerator.exerciseEnemyFleet`, scenes `HomeScene` (nation picker),
`ShipyardScene` (工廠 › 建造), `FleetBuilderScene`, `BattleScene`. All rules are pure and tested
(`NationProgress`, `RankSystem`, `ShipyardSystem`, `ExerciseRules`, `EarlyGameLoop` tests).

## Save v2 (#27) — `ww2fleet.progress.v2`
```
ISave {
  version: 2,
  current: Nation,                       // nation being played (its slot may not exist on a brand-new save)
  nations: { [Nation]?: INationProgress },
  record: IServiceRecord                 // shared by every nation (medals too); settings stay in their own key
}
INationProgress { resources, regenAt, damage, docks, research, ships /* owned ids */, upgrades, refits,
                  proficiency, captainXp, campaign /* cleared areas; rank is derived */ }
```
- Scenes use an `IProgress` **view** = current nation's slot + `nation` + shared `record`. `loadProgress()` returns it
  (with regeneration applied, saved straight away when it changed); `saveProgress(view)` writes it back into the
  view's own nation slot. Accessors: `currentNation(save)`, `progressView`, `withProgress`, `switchNation`,
  `isStarted`, `startedNations`, `loadSave` / `saveSave`.
- Nations are handled generically (`Nation` enum / `PLAYABLE_NATIONS`); new nations need no store change.
- **Migration**: when no v2 key exists the v1 key (`ww2fleet.progress.v1`, flat object) is read and migrated: every
  field goes into the IJN slot, which owns the whole IJN roster (fictional ships stay gated by 架空艦計画), the record
  becomes the shared record. The v1 key is never written or deleted. Save codes hold the whole v2 save; old (v1)
  codes are migrated the same way. `parseSave` / `parseProgress` stay tolerant of malformed data.

## New nation (#18 / #28)
- Picking a nation for the first time (鎮守府 → `日本 ▸ 切替`, or the picker that opens on a brand-new save) creates its
  slot: resources 0, one starter destroyer (first historical destroyer in the nation's data: 吹雪 / Fletcher / Z1 /
  Cossack), regeneration starting now. An empty ship list always falls back to the starter.

## Natural regeneration (#28)
| | fuel | ammo | steel | bauxite |
|---|---|---|---|---|
| per minute | +3 | +3 | +3 | +1 |
Up to 1500 each (`REGEN_CAP`); a resource at or above the cap is untouched (rewards may exceed it). Based on the stored
epoch `regenAt` like dock timers, so it runs while the game is closed. The home port shows the next tick countdown.

## Sorties (#15 / #28)
| | Cost | Docked ships | Start HP | Damage kept | Resource reward | Aircraft cost | XP / proficiency / record |
|---|---|---|---|---|---|---|---|
| 演習 (free battle) | free | allowed | full | no | ×0.5 | none | yes |
| Campaign, first area of a theater | free | blocked | carried over | yes | full | yes | yes |
| Campaign, other areas | per class | blocked | carried over | yes | full | yes | yes |
A battle is an exercise when it has neither `areaId` nor `scenario` (`isExercise`). Historical scenarios are unchanged.

## Ownership and the shipyard (#18 / #29)
The Fleet Builder lists only the current nation's owned ships (fictional ones still need research). Ships come from:
1. **建造** (工廠 › 建造 tab, `ShipyardScene`): one of each ship; cost from class × HP (+ armour for steel), rounded to
   tens, fictional ×1.3. Class gates: `build_cruiser`, `build_battleship` (needs build_cruiser), `build_carrier`,
   `build_submarine` (destroyers need none); the research is offered on the tab itself.
2. **First-clear reward**: each campaign area has `rewardShip` (a class); the nation gets its cheapest unowned historical
   ship of that class (else of any class). Shown in the briefing and on the results screen.

| Per HP | fuel | ammo | steel (HP + 5×armour) | bauxite |
|---|---|---|---|---|
| Destroyer | 0.5 | 0.5 | 0.8 | — |
| Submarine | 0.6 | 0.6 | 0.8 | — |
| Cruiser | 0.8 | 0.9 | 1.2 | 0.1 |
| Carrier | 1.0 | 0.5 | 1.2 | 1.2 |
| Battleship | 1.2 | 1.5 | 1.8 | 0.1 |
e.g. 雪風 110/110/230/0, 高雄 320/360/720/40, 大和 960/1200/2030/80.

## Admiral rank (#30 / #25)
| Rank | Areas cleared | Fleet (and captain) slots | Ship grade buildable |
|---|---|---|---|
| 少佐 | 0 | 1 | 0 |
| 中佐 | 1 | 2 | ≤ 1 |
| 大佐 | 2 | 3 | ≤ 2 |
| 少将 | 4 | 4 | ≤ 3 |
| 中将 | 7 | 5 | ≤ 4 |
| 大将 | 10 | 6 | 5 |
Grade = number of HP marks (250, 400, 520, 700, 780) the ship exceeds; fictional ships are grade 5. So destroyers and
submarines are grade 0, most cruisers 1–2, carriers 2–3, battleships 3–5 (大和 5). `fleetSlots(progress)` gives the slot
count; the Fleet Builder shows that many slots (two columns beyond three) and the home port shows the next promotion.

## Enemy fleet sizes (#25)
Campaign areas grow along each theater: 太平洋 1·2·3·4·6·7, 大西洋 1·2·3·5·8, 地中海 1·2·3·5·7. Free battle: opponent
size 同数 / +1 / +2; each enemy mirrors the class of the player's ship in that position (extras mirror the smallest),
picking the enemy ship of that class closest in HP; ASW = submarines, carrier battle leads with a carrier.

## Early loop (tested in `EarlyGameLoop.test.ts`)
New nation: 1 destroyer, 0 resources → the free first area (1 enemy) or a free 演習 is always available. Worst case
(sunk, 大破, broke): an exercise still works and regeneration pays the repair (≈ 26 min for a destroyer at 10%).
First clear → 中佐 (2 slots) + a second ship + 300–400 of each resource, enough to build another destroyer and pay the
second area's sortie.
