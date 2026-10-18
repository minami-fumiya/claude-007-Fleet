import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { UIButton } from '@/ui/components/UIKit';

export type ArsenalTab = 'research' | 'build';

const TABS: Array<{ id: ArsenalTab; label: string; scene: string }> = [
  { id: 'research', label: '研究', scene: SceneKeys.ARSENAL },
  { id: 'build', label: '建造', scene: SceneKeys.SHIPYARD },
];

/** 研究 / 建造 tabs in the top-right corner of the arsenal screens; each tab is its own scene. */
export function addArsenalTabs(scene: Phaser.Scene, active: ArsenalTab): UIButton[] {
  const w = IS_PORTRAIT ? 116 : 110;
  const h = IS_PORTRAIT ? 60 : 44;
  const gap = 8;
  const y = IS_PORTRAIT ? 46 : 44;
  return TABS.map((t, i) => {
    const x = CANVAS_W - 16 - w / 2 - (TABS.length - 1 - i) * (w + gap);
    return new UIButton(scene, x, y, t.label, () => {
      if (t.id !== active) scene.scene.start(t.scene);
    }, { variant: t.id === active ? 'primary' : 'secondary', width: w, height: h, fontSize: 15 });
  });
}
