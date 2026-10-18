import { Formation, IFormationConfig, IFormationSlotOffset } from '@/types/Formation';
import { BaseShip } from '@/entities/ships/BaseShip';

/**
 * Slots for up to 7 escorts (an 8-ship fleet). The first two keep the classic 3-ship shapes; larger
 * fleets extend them: line ahead grows astern, double line adds rows, the circle closes the ring.
 * Echelon steps back to starboard, line abreast spreads out beside the flagship, and the vanguard puts
 * the first three escorts ahead of the flagship with the rest astern (#59).
 */
const FORMATION_CONFIGS: Record<Formation, IFormationConfig> = {
  [Formation.LineAhead]: {
    formation: Formation.LineAhead,
    name: '縦陣 (Line Ahead)',
    slotOffsets: [
      { forward: -90, right: 0 },
      { forward: -180, right: 0 },
      { forward: -270, right: 0 },
      { forward: -360, right: 0 },
      { forward: -450, right: 0 },
      { forward: -540, right: 0 },
      { forward: -630, right: 0 },
    ],
  },
  [Formation.DoubleLine]: {
    formation: Formation.DoubleLine,
    name: '複縦陣 (Double Line)',
    slotOffsets: [
      { forward: -90, right: -60 },
      { forward: -90, right: 60 },
      { forward: -180, right: -60 },
      { forward: -180, right: 60 },
      { forward: -270, right: -60 },
      { forward: -270, right: 60 },
      { forward: -360, right: 0 },
    ],
  },
  [Formation.Circle]: {
    formation: Formation.Circle,
    name: '輪形陣 (Circle)',
    slotOffsets: [
      { forward: -80, right: -100 },
      { forward: -80, right: 100 },
      { forward: 130, right: 0 },
      { forward: -180, right: 0 },
      { forward: 60, right: -140 },
      { forward: 60, right: 140 },
      { forward: -280, right: 0 },
    ],
  },
  [Formation.Echelon]: {
    formation: Formation.Echelon,
    name: '梯形陣 (Echelon)',
    slotOffsets: [1, 2, 3, 4, 5, 6, 7].map((k) => ({ forward: -75 * k, right: 60 * k })),
  },
  [Formation.LineAbreast]: {
    formation: Formation.LineAbreast,
    name: '単横陣 (Line Abreast)',
    slotOffsets: [
      { forward: 0, right: -95 },
      { forward: 0, right: 95 },
      { forward: 0, right: -190 },
      { forward: 0, right: 190 },
      { forward: 0, right: -285 },
      { forward: 0, right: 285 },
      { forward: 0, right: -380 },
    ],
  },
  [Formation.Vanguard]: {
    formation: Formation.Vanguard,
    name: '警戒陣 (Vanguard)',
    slotOffsets: [
      { forward: 170, right: -70 },
      { forward: 170, right: 70 },
      { forward: 270, right: 0 },
      { forward: -100, right: -70 },
      { forward: -100, right: 70 },
      { forward: -200, right: 0 },
      { forward: -290, right: 0 },
    ],
  },
};

export class FormationSystem {
  static getConfig(formation: Formation): IFormationConfig {
    return FORMATION_CONFIGS[formation];
  }

  /**
   * Escort slots of a formation: the classic two by default, or `escorts` slots for bigger fleets.
   * Beyond the table, extra escorts trail astern in line so no two ships share a slot.
   */
  static getOffsets(formation: Formation, escorts = 2): IFormationSlotOffset[] {
    const table = FORMATION_CONFIGS[formation].slotOffsets;
    const out = table.slice(0, Math.max(0, escorts));
    const tail = Math.min(...table.map((o) => o.forward));
    for (let i = out.length; i < escorts; i++) out.push({ forward: tail - 90 * (i - table.length + 1), right: 0 });
    return out;
  }

  /** Offset of escort `index` (0-based) in a fleet with at least `index + 1` escorts. */
  static getOffset(formation: Formation, index: number): IFormationSlotOffset {
    return FormationSystem.getOffsets(formation, index + 1)[index];
  }

  /** Returns world-space position for a formation slot given raw values (testable without Phaser). */
  static getWorldPositionFromValues(
    fx: number,
    fy: number,
    angleDeg: number,
    offset: IFormationSlotOffset,
  ): { x: number; y: number } {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const fwdX = Math.cos(rad);
    const fwdY = Math.sin(rad);
    const rightX = -fwdY;
    const rightY = fwdX;
    return {
      x: fx + fwdX * offset.forward + rightX * offset.right,
      y: fy + fwdY * offset.forward + rightY * offset.right,
    };
  }

  /** Returns world-space position for a formation slot relative to the flagship. */
  static getWorldPosition(
    flagship: BaseShip,
    offset: IFormationSlotOffset,
  ): { x: number; y: number } {
    return FormationSystem.getWorldPositionFromValues(flagship.x, flagship.y, flagship.angle, offset);
  }
}
