export const SceneKeys = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  MAIN_MENU: 'MainMenuScene',
  FLEET_BUILDER: 'FleetBuilderScene',
  BATTLE: 'BattleScene',
  RESULTS: 'ResultsScene',
  CUSTOMIZATION: 'CustomizationScene',
  ARSENAL: 'ArsenalScene',
  CAMPAIGN: 'CampaignMapScene',
  SCENARIO: 'ScenarioScene',
  ENCYCLOPEDIA: 'EncyclopediaScene',
  RECORD: 'RecordScene',
  SETTINGS: 'SettingsScene',
  HELP: 'HelpScene',
  HOME: 'HomeScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
