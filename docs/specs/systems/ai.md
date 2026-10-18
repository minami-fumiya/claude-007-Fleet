# AI Spec (v2 — Sprint 4)

Implementation: `src/systems/AIBrain.ts` (pure decisions, unit tested) and `src/systems/AISystem.ts` /
`src/systems/EscortAISystem.ts` (Phaser glue: steering and firing).

## Inputs
Each frame the scene builds one *view* per ship for the opposing side (`IShipView`): position, alive,
HP fraction, class, submerged, and **detected** (surface ships always; submerged boats only while on the
other side's sonar).

## Target choice
```
score = distanceWeight * near + focusWeakWeight * (1 - hpFraction) + capitalWeight * classValue (+0.6 if a submerged boat)
        - crowdPenalty * attackers + priority
near  = 1 - min(1, distance / (2 * maxRange))
```
- `attackers` (#34): how many other ships of the same side already target that ship. BattleScene keeps the count
  current as each enemy decides, so the fleet spreads its fire instead of piling onto the leading flagship.
  `crowdPenalty` per nation: IJN 0.15 · USN 0.2 · KM 0.05 (wolf pack — keeps focusing) · RN 0.15 · FR 0.2 · SU 0.12 · RM 0.2.
- `priority`: convoy ships +0.6, scenario targets +0.5, the player's flagship **−0.15** (escorts draw their share).
- With a line-ahead fleet of four, a healthy flagship draws at most two of four attackers (tested in `AIBrain.test.ts`);
  a badly damaged flagship is still finished off — protecting it is the escorts' and formations' job (#59).
| Class | classValue |
|---|---|
| Battleship | 1.0 |
| Carrier | 0.9 |
| Cruiser | 0.6 |
| Destroyer | 0.4 |
| Submarine | 0.3 |

- Dead or undetected ships are never chosen. Submerged boats are only targets for ships with depth charges.
- The current target is kept unless another scores at least **0.15** higher (no flip-flopping).

## Modes
| Mode | When | Range held |
|---|---|---|
| Engage | default | `maxRange * preferredRangeFraction` |
| Retreat | `hpFraction <= retreatHpFraction` | preferred × 1.6 (keeps firing) |
| Hunt | target is a submerged boat | 0 — run over it and drop depth charges |
| Patrol | nothing visible | head for the middle of the sea at half speed |

Steering reuses `AutoPilot.engageSteer` (close in / back off / circle inside the band, turn back from the edges).

## Nation tactics (`TACTICS`)
| Nation | preferredRange | retreatHp | focusWeak | distance | capital | torpedoEagerness | Style |
|---|---|---|---|---|---|---|---|
| IJN | 0.5 | 0.15 | 0.4 | 1.0 | 0.3 | 1.0 | 接近して魚雷戦 |
| USN | 0.85 | 0.3 | 0.3 | 1.0 | 0.5 | 0.3 | 遠距離砲戦を維持、早めに離脱 |
| KM | 0.7 | 0.2 | 1.0 | 0.8 | 0.2 | 0.6 | 弱った艦へ集中射撃 |

`torpedoEagerness` 0 holds torpedoes until 60% of their range, 1 launches at full range.

## Firing
`fireAt` fires every weapon `WeaponSelector.selectWeapons` allows (guns / torpedoes at surface targets in
range, depth charges only at a submerged boat within the drop range, submerged boats torpedoes only),
leading moving targets with `interceptAngle`. AI shots get ±0.05 rad of random error.

## Escorts
Keep their formation slot (`FormationSystem`) and fire at the best target. An escort with depth charges
leaves the formation to run over a detected submerged boat within 380 px.

## Submarines
`submarineWantsDive`: dive when a visible enemy is within 750 px and air ≥ 50%; surface again before air
drops under 12%. See `submarine.md`.

## Turn rates (deg/s)
Battleship 55 · Carrier 50 · Cruiser 75 · Destroyer 110 · Submarine 80 (the player's flagship turns at 120).
