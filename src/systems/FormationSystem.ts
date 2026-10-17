import { Formation, IFormationConfig, IFormationSlotOffset } from '@/types/Formation';
import { BaseShip } from '@/entities/ships/BaseShip';

const FORMATION_CONFIGS: Record<Formation, IFormationConfig> = {
  [Formation.LineAhead]: {
    formation: Formation.LineAhead,
    name: '縦陣 (Line Ahead)',
    slotOffsets: [
      { forward: -90, right: 0 },
      { forward: -180, right: 0 },
    ],
  },
  [Formation.DoubleLine]: {
    formation: Formation.DoubleLine,
    name: '複縦陣 (Double Line)',
    slotOffsets: [
      { forward: -90, right: -60 },
      { forward: -90, right: 60 },
    ],
  },
  [Formation.Circle]: {
    formation: Formation.Circle,
    name: '輪形陣 (Circle)',
    slotOffsets: [
      { forward: -80, right: -100 },
      { forward: -80, right: 100 },
    ],
  },
};

export class FormationSystem {
  static getConfig(formation: Formation): IFormationConfig {
    return FORMATION_CONFIGS[formation];
  }

  static getOffsets(formation: Formation): IFormationSlotOffset[] {
    return FORMATION_CONFIGS[formation].slotOffsets;
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
