import { IScenario } from '@/types/Scenario';
import midway from './midway.json';
import leyte from './leyte-gulf.json';
import bismarck from './bismarck-chase.json';
import guadalcanal from './guadalcanal.json';
import northCape from './north-cape.json';
import riverPlate from './river-plate.json';
import denmarkStrait from './denmark-strait.json';
import matapan from './matapan.json';
import coralSea from './coral-sea.json';
import savoIsland from './savo-island.json';
import tassafaronga from './tassafaronga.json';
import samar from './samar.json';
import bonomisaki from './bonomisaki.json';
import mersElKebir from './mers-el-kebir.json';
import dakar from './dakar.json';
import tallinn from './tallinn.json';
import sevastopolRun from './sevastopol-run.json';
import capeSpada from './cape-spada.json';
import secondSirte from './second-sirte.json';

/** Every historical scenario (#71), in no particular order; ScenarioSystem.sortScenarios orders them by date. */
export const ALL_SCENARIOS = [
  midway, leyte, bismarck, guadalcanal, northCape, riverPlate, denmarkStrait, matapan, coralSea, savoIsland, tassafaronga, samar, bonomisaki,
  // 0.0.51 (#317): France, the Soviet Union and Italy
  mersElKebir, dakar, tallinn, sevastopolRun, capeSpada, secondSirte,
] as unknown as IScenario[];
