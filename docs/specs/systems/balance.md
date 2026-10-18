# Balance Notes (Sprint 7)

## Tools
- `src/systems/BalanceModel.ts` — analytic model: expected DPS of a loadout against a target
  (gun hit rate 45%, torpedo hit rate 30%, damage formula from `CombatSystem`), time-to-kill and duel ratio.
- `tests/unit/Balance.test.ts` — invariants the data must keep:
  1. Battleship DPS vs a reference battleship (armor 60) within ±25% of the class median.
  2. Every battleship, cruiser and destroyer deals ≥ 20 DPS to a destroyer (no helpless ships).
  3. Each nation's strongest battleship duels every other nation's within a 0.7–1.4 time-to-kill ratio.
  4. HP ordering by class: battleship > carrier > cruiser > destroyer > submarine (weakest of a class beats the strongest of the next).
  5. Destroyers are faster than cruisers, cruisers than battleships (on average).
- Browser runs: AUTO battles started directly in `BattleScene` via the dev-only `window.game` (Playwright).

## Changes made
| Change | Why |
|---|---|
| Yamato / Musashi gain `15_5cm_triple` secondaries | Main gun only: weakest anti-destroyer DPS of any battleship (failed invariant 2) |
| Takao gains Type 93 torpedoes | Half the DPS of sister ship Atago |
| Kongo HP 360 → 380, Midway 380 → 360 | Battleship / carrier HP ordering |
| AI torpedo aim error 0.12 rad (guns 0.05) | Slow torpedoes with perfect lead hit almost every time: a flagship lost 260 HP in 2.5 s |
| (Sprint 4) 2-torpedo salvos share firePower; sub torpedoes 8 s reload; depth charge 0.8 s fuse / 110 px | ASW and torpedo spikes |

## AUTO battle results (BB + CA + DD each side, clear day)
| Player | Enemy | Result | Enemy sunk | Own afloat | Time |
|---|---|---|---|---|---|
| IJN | USN | Defeat | 2/3 | 2/3 | 43 s |
| USN | KM | Defeat | 2/3 | 2/3 | 47 s |
| KM | RN | Victory | 3/3 | 3/3 | 39 s |
| RN | IJN | Defeat | 2/3 | 2/3 | 33 s |
| USN | IJN | Victory | 3/3 | 3/3 | 34 s |
| IJN | KM | Victory | 3/3 | 2/3 | 37 s |

Even 3-to-3 fights split 3–3 and every defeat was close (the flagship, which the enemy AI focuses, sank with
two enemies already gone). A player steering manually (dodging torpedoes, keeping range) should win most.

## Sprint 9 pass (scenario battles)
Running the historical scenarios in AUTO showed battles ending in 20–30 s, with the AI landing far more shells
than the model's 45% (perfect lead plus 0.05 rad error) and carriers dying to a single torpedo-bomber strike.

| Change | Effect |
|---|---|
| Every ship's HP ×1.6 (also convoy ships / shore targets) | Longer battles, relative balance unchanged (invariants still hold) |
| Repairs: 40 ms and fuel 0.2 / steel 0.4 per HP (was 60 ms, 0.3 / 0.6) | Repair cost per battle about the same as before the HP change |
| AI gun aim error 0.085 rad, player AUTO 0.07 | Hit rates closer to the model |
| Aerial torpedo 110 → 75, aerial bomb 75 → 65, drop error 0.16 rad | One strike no longer sinks a carrier |
| AA 0.18 kills/s per strength (was 0.12), re-arm 18 s (was 12) | Strikes cost planes; fewer waves |

Midway in AUTO now takes ~60–180 s; surface 3-vs-3 battles ~40 s.

## Known gaps
- Carriers' gun DPS is near zero by design (their weapon is the air wing, not modelled here).
- Submarines are judged by ASW battles instead (see `submarine.md`).

## Sprint 12 pass — new ships and nations (#16 #17)
New ships keep the same invariants (`tests/unit/Balance.test.ts` now loads all 7 nation files; invariant 3 runs over
every `Nation`). Fictional ships: the battleship tests cover fictional *battleships* only (5 with Sovetsky Soyuz);
fictional carriers (71号計画空母, Aquila) get their own check that they stay inside the carrier hull band.

Nation flagships (best historical battleship by HP × DPS): Yamato, Iowa, Tirpitz, Rodney, Richelieu,
Oktyabrskaya Revolutsiya, Roma. Duel ratios (row's time-to-kill on column ÷ column's on row, < 1 = row wins):

| | IJN | USN | KM | RN | FR | SU | RM |
|---|---|---|---|---|---|---|---|
| IJN | – | 0.83 | 0.89 | 0.73 | 0.86 | 0.76 | 0.84 |
| USN | 1.21 | – | 1.07 | 0.94 | 1.06 | 0.96 | 1.04 |
| KM | 1.13 | 0.94 | – | 0.85 | 0.97 | 0.86 | 0.96 |
| RN | 1.38 | 1.07 | 1.18 | – | 1.15 | 0.97 | 1.12 |
| FR | 1.16 | 0.95 | 1.03 | 0.87 | – | 0.86 | 0.98 |
| SU | 1.32 | 1.04 | 1.17 | 1.03 | 1.16 | – | 1.14 |
| RM | 1.19 | 0.96 | 1.04 | 0.89 | 1.02 | 0.88 | – |

| Decision | Why |
|---|---|
| Gangut-class 30.5cm: firePower 94, reload 1050 ms (12 guns → fast salvos) | The USSR's only historical battleships must still duel Yamato within 1.4 |
| Light / escort carriers HP 455–470 | Carriers must out-hull every cruiser (max 450) and stay under the weakest battleship (610) |
| Escorts (海防艦 / DE / sloop) are Destroyers with 200–205 HP and a fast-firing HA gun | Destroyer HP floor (> submarines' 175) and ≥ 20 DPS against destroyers |
| Zara gets 10cm HA guns (no torpedoes historically) | 20.3cm AP alone gave 14 DPS against destroyers |
| Panzerschiffe (Deutschland, Graf Spee) are Cruisers (重巡洋艦) with 28cm SK C/28 | 28cm guns, cruiser hull (HP 425–430) |
