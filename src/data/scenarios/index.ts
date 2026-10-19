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

/** Every historical scenario (#71), in no particular order; ScenarioSystem.sortScenarios orders them by date. */
export const ALL_SCENARIOS = [
  midway, leyte, bismarck, guadalcanal, northCape, riverPlate, denmarkStrait, matapan, coralSea, savoIsland, tassafaronga, samar, bonomisaki,
] as unknown as IScenario[];
