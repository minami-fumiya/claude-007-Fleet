import { describe, it, expect } from 'vitest';
import { HOME_MENU, homeTab } from '@/systems/HomeMenu';
import { markHelpSeen, SCREEN_HELP, unseenHelp } from '@/systems/ScreenHelp';
import { EXISTING_PLAYER_HELP } from '@/utils/SaveMigration';
import { SceneKeys } from '@/config/SceneKeys';

describe('home menu tabs (#61)', () => {
  it('groups every screen under 出撃 / 艦隊 / 工廠 / 記録', () => {
    expect(HOME_MENU.map((t) => t.label)).toEqual(['出撃', '艦隊', '工廠', '記録']);
    const scenes = new Set(HOME_MENU.flatMap((t) => t.items.map((i) => i.scene)));
    for (const s of [SceneKeys.CAMPAIGN, SceneKeys.FLEET_BUILDER, SceneKeys.SCENARIO, SceneKeys.CUSTOMIZATION, SceneKeys.ENCYCLOPEDIA, SceneKeys.ARSENAL, SceneKeys.SHIPYARD, SceneKeys.RECORD]) {
      expect(scenes, s).toContain(s);
    }
    expect(homeTab('fleet').label).toBe('艦隊');
    expect(homeTab('nope').id).toBe('sortie');
  });
});

describe('first-visit help (#61)', () => {
  it('each screen explains itself once', () => {
    expect(unseenHelp([], SceneKeys.HOME)?.title).toBe('鎮守府');
    const seen = markHelpSeen([], SceneKeys.HOME);
    expect(unseenHelp(seen, SceneKeys.HOME)).toBeUndefined();
    expect(markHelpSeen(seen, SceneKeys.HOME)).toEqual(seen);
    expect(unseenHelp([], 'NoSuchScene')).toBeUndefined();
  });

  it('an existing player from before 0.0.14 has seen every screen that had help then', () => {
    // Screens added later explain themselves to everyone once.
    const added = ['CaptainScene', 'BaseScene'];
    for (const h of SCREEN_HELP.filter((x) => !added.includes(x.id))) expect(EXISTING_PLAYER_HELP, h.id).toContain(h.id);
    for (const id of added) expect(EXISTING_PLAYER_HELP).not.toContain(id);
  });
});
