# Submarine Warfare Spec (Sprint 4)

Implementation: `SubmarineSystem.ts`, `SonarSystem.ts` (pure, unit tested), `DepthCharge.ts`, `Torpedo.ts`,
`BattleScene.ts` (detection, visibility, area damage).

## Dive state (`SubmarineSystem`)
| Rule | Value |
|---|---|
| Air while submerged | lasts `SUBMERGED_ENDURANCE_SEC` = 20 s |
| Recharge on the surface | 2× the drain rate |
| Air hits 0 | emergency surfacing; can't dive again until air ≥ 35% |
| Speed while submerged | × 0.6 |
| Weapons while submerged | torpedoes only |
| Hit by | depth charges only while submerged (shells and torpedoes pass over) |

Player: `Q` key / 潜航 button toggles the dive; the HUD shows state and remaining air.

## Sonar (`SonarSystem`)
| Class | Sonar range (px) |
|---|---|
| Destroyer | 320 |
| Cruiser | 180 |
| Submarine | 120 |
| Battleship / Carrier | 0 |

- A submerged boat is visible to the other side only inside one of its (surfaced) hunters' sonar range.
- Enemy boats off sonar are hidden (sprite, label, edge marker) and can't be targeted; detected ones are drawn at 45% alpha.
- While an enemy boat is submerged, player hunters show an expanding sonar ring (stand-in for the Sprint 7 minimap).

## Depth charges
- Weapon `depth_charge` (type `DepthCharge`): dropped at the ship's position when a detected submerged boat is within 80 px; reload 2.2 s.
- Fuse 0.8 s, blast radius 110 px. Damage = `calculateDamage(weapon, class, armor) × falloff`,
  falloff = 1 inside the inner third of the radius, then linear to 0 at the edge. Hits every ship of the target side in the blast.
- The player's flagship drops them automatically; escorts and AI hunters run over the contact.

## Torpedoes
- Each launch is a 2-torpedo spread (±0.04 rad); the weapon's `firePower` is split across the salvo.
- Speed from the weapon's `projectileSpeed` (250–300), they expire after 115% of the weapon's range.
- Player: `E` key / 魚雷 button fires toward the aim (or the target on touch / AUTO); touch and AUTO also launch them automatically.

## Battle mode
The Fleet Builder's 対潜戦 option generates a wolfpack of three submarines of the chosen enemy nation
(`EnemyFleetGenerator`, `BattleMode.ASW`). Bring destroyers: battleships and carriers can't see or hit a submerged boat.
