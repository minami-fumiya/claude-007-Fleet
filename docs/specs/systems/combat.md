# Combat System Spec

## Damage Formula
```
damage = max(1, firePower * typeMultiplier - armor * reductionFactor)
```

### Parameters
| Parameter | Type | Description |
|---|---|---|
| `firePower` | number | Weapon's base attack power |
| `typeMultiplier` | number | Modifier based on weapon vs ship class matchup |
| `armor` | number | Target ship's armor stat |
| `reductionFactor` | number | Armor effectiveness (default: 0.5) |

### Type Multipliers
| Weapon \ Target | Battleship | Cruiser | Destroyer | Carrier | Submarine |
|---|---|---|---|---|---|
| Shell (AP) | 1.0 | 0.9 | 0.7 | 0.8 | 0.3 |
| Shell (HE) | 0.7 | 1.0 | 1.2 | 1.1 | 0.4 |
| Torpedo | 1.3 | 1.1 | 0.9 | 1.5 | 0.5 |
| Depth Charge | 0.2 | 0.2 | 0.2 | 0.2 | 2.0 |
| Bomb | 0.8 | 0.9 | 1.3 | 1.2 | 0.3 |

## Critical Hit System (Sprint 7)
- Roll chance based on weapon accuracy and target speed
- Critical types: Main gun destroyed / Engine damage / Rudder damage
- Each type applies a stat debuff to the target ship

## Apply Damage Flow
1. `CombatSystem.calculateDamage(weapon, target)` → number
2. `CombatSystem.applyDamage(ship, damage)` → void
   - Subtract from `ship.currentHp`
   - If `currentHp <= 0`: trigger sink animation, remove from scene
