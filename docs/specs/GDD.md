# Game Design Document — WW2 Naval Fleet

## Overview
A real-time naval combat game set in World War II. Players command a fleet of
historically accurate warships across Pacific, Atlantic, and Mediterranean theaters.

## Core Loop
1. **Fleet Builder** — Select and deploy ships from your fleet roster
2. **Battle** — Real-time combat on a 2D top-down sea map
3. **Results** — Score, experience, resource rewards
4. **Base** — Repair, research, refit between missions

## Scope (v1.0 — Sprints 0–7)
- Nations: IJN, USN, Kriegsmarine, Royal Navy
- Ship classes: Battleship, Cruiser, Destroyer, Carrier, Submarine
- Modes: Single-player campaign + standalone battles
- Platform: Web browser (Vercel)

## Win / Loss Conditions
- **Victory**: Sink all enemy ships (or achieve scenario objective)
- **Defeat**: Flagship sunk (HP = 0)

## Core Mechanics
- WASD movement, mouse aim, left-click to fire
- Ships have HP, armor, speed, and weapon loadouts
- Damage formula: `max(1, firePower * multiplier - armor * reduction)`
- Formations affect fleet AI behavior (line, circle, double-line)
