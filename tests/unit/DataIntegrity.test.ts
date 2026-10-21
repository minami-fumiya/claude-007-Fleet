import { describe, it, expect } from 'vitest';
import { IShipData } from '@/types/Ship';
import { MEDALS } from '@/systems/RecordSystem';
import { theaterFinal } from '@/systems/NationUnlock';
import { finalAreas } from '@/systems/RankSystem';
import { theaterFinalArea } from '@/systems/CampaignSystem';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import captains from '@/data/captains.json';
import aircraft from '@/data/aircraft.json';
import weapons from '@/data/weapons/weapons.json';
import items from '@/data/items.json';
import campaign from '@/data/campaign.json';
import quests from '@/data/quests.json';
import techTree from '@/data/tech-tree.json';
import shop from '@/data/shop.json';
import rewardShips from '@/data/reward-ships.json';
import superweapons from '@/data/superweapons.json';
import bases from '@/data/bases.json';
import screenHelp from '@/data/screen-help.json';
import refits from '@/data/refits.json';
import { SceneKeys } from '@/config/SceneKeys';
import { HOME_MENU } from '@/systems/HomeMenu';
import { QUEST_EVENTS } from '@/systems/QuestSystem';
import { EVENT_NAME } from '@/systems/EventSystem';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Data integrity (#253): ids are unique, everything the data points at exists, and the rules several systems read
 * from the same data agree (the training-area bug, #241, came from two of them disagreeing). Data-only changes are
 * caught here before they reach a battle. The font's glyphs are checked by fontGlyphs.test.ts.
 */

const ROSTERS: Record<string, IShipData[]> = { IJN: ijn.ships, USN: usn.ships, KM: km.ships, RN: rn.ships, FR: fr.ships, SU: su.ships, RM: rm.ships } as unknown as Record<string, IShipData[]>;
const SHIPS = Object.values(ROSTERS).flat();
const SHIP_IDS = new Set(SHIPS.map((s) => s.id));
const WEAPON_IDS = new Set(weapons.weapons.map((w) => w.id));
const AREA_IDS = new Set(campaign.areas.map((a) => a.id));
const ITEM_IDS = new Set(items.items.map((i) => i.id));
const MEDAL_IDS = new Set(MEDALS.map((m) => m.id));
const TECH_IDS = new Set(techTree.tech.map((t) => t.id));

const dupes = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) !== i);

describe('data integrity (#253)', () => {
  it('no id is used twice within its kind', () => {
    expect(dupes(SHIPS.map((s) => s.id)), 'ships').toEqual([]);
    expect(dupes(captains.captains.map((c) => c.id)), 'captains').toEqual([]);
    expect(dupes(aircraft.aircraft.map((a) => a.id)), 'aircraft').toEqual([]);
    expect(dupes(weapons.weapons.map((w) => w.id)), 'weapons').toEqual([]);
    expect(dupes(items.items.map((i) => i.id)), 'items').toEqual([]);
    expect(dupes(campaign.areas.map((a) => a.id)), 'areas').toEqual([]);
    expect(dupes(campaign.theaters.map((t) => t.id)), 'theaters').toEqual([]);
    expect(dupes(quests.quests.map((q) => q.id)), 'quests').toEqual([]);
    expect(dupes(MEDALS.map((m) => m.id)), 'medals').toEqual([]);
    expect(dupes(techTree.tech.map((t) => t.id)), 'research').toEqual([]);
    expect(dupes(shop.entries.map((e) => e.id)), 'shop').toEqual([]);
    expect(dupes(bases.bases.map((b) => b.id)), 'bases').toEqual([]);
    expect(dupes(superweapons.superweapons.map((s) => s.id)), 'superweapons').toEqual([]);
  });

  it('ships: their weapons, classes and lead ships exist, of their own nation; years within the war\'s span', () => {
    const problems: string[] = [];
    for (const [nation, roster] of Object.entries(ROSTERS)) {
      const ids = new Set(roster.map((s) => s.id));
      for (const s of roster) {
        if (s.nation !== nation) problems.push(`${s.id}: nation ${s.nation} in the ${nation} file`);
        for (const w of s.weapons) if (!WEAPON_IDS.has(w)) problems.push(`${s.id}: weapon ${w}`);
        if (s.sisterOf && !ids.has(s.sisterOf)) problems.push(`${s.id}: sisterOf ${s.sisterOf}`);
        if (s.classOf && !ids.has(s.classOf)) problems.push(`${s.id}: classOf ${s.classOf}`);
        if (s.year === undefined || s.year < 1900 || s.year > 1950) problems.push(`${s.id}: year ${s.year}`);
      }
    }
    for (const s of superweapons.superweapons) for (const w of s.weapons) if (!WEAPON_IDS.has(w)) problems.push(`${s.id}: weapon ${w}`);
    expect(problems).toEqual([]);
  });

  it('campaign: prerequisites, enemy ships and reward ships exist; the reward ship belongs to its navy', () => {
    const problems: string[] = [];
    for (const a of campaign.areas) {
      for (const r of [...a.requires, ...((a as { requiresAny?: string[] }).requiresAny ?? [])]) if (!AREA_IDS.has(r)) problems.push(`${a.id}: requires ${r}`);
      if (!campaign.theaters.some((t) => t.id === a.theater)) problems.push(`${a.id}: theater ${a.theater}`);
      for (const id of a.enemy.ships) if (!SHIP_IDS.has(id)) problems.push(`${a.id}: enemy ${id}`);
    }
    for (const [nation, table] of Object.entries(rewardShips)) {
      for (const [area, ship] of Object.entries(table as Record<string, string>)) {
        if (!AREA_IDS.has(area)) problems.push(`reward ${nation}: area ${area}`);
        if (!ROSTERS[nation]?.some((s) => s.id === ship)) problems.push(`reward ${nation}: ship ${ship}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every theater has one final area, the same however it is found, and never a training area (#241)', () => {
    for (const t of campaign.theaters) {
      const final = theaterFinal(t.id);
      expect(final, t.id).toBeDefined();
      expect(final).toBe(theaterFinalArea(campaign, t.id));
      expect(campaign.areas.find((a) => a.id === final)?.training, t.id).toBeUndefined();
    }
    for (const id of finalAreas()) expect(campaign.theaters.some((t) => theaterFinal(t.id) === id), id).toBe(true);
  });

  it('research, quests and the shop point at research, medals and items that exist', () => {
    const problems: string[] = [];
    for (const t of techTree.tech) for (const r of t.requires) if (!TECH_IDS.has(r)) problems.push(`research ${t.id}: requires ${r}`);
    for (const q of quests.quests as Array<{ id: string; medal?: string; items?: Record<string, number> }>) {
      if (q.medal && !MEDAL_IDS.has(q.medal)) problems.push(`quest ${q.id}: medal ${q.medal}`);
      for (const i of Object.keys(q.items ?? {})) if (!ITEM_IDS.has(i)) problems.push(`quest ${q.id}: item ${i}`);
    }
    for (const e of shop.entries as Array<{ id: string; items?: Record<string, number> }>) for (const i of Object.keys(e.items ?? {})) if (!ITEM_IDS.has(i)) problems.push(`shop ${e.id}: item ${i}`);
    for (const b of bases.bases) for (const t of b.theaters) if (!campaign.theaters.some((x) => x.id === t)) problems.push(`base ${b.id}: theater ${t}`);
    expect(problems).toEqual([]);
  });

  it('help, items and refits point at screens and ships that exist (0.0.39 review)', () => {
    const scenes = new Set<string>(Object.values(SceneKeys));
    const helpIds = new Set((screenHelp.screens as Array<{ id: string }>).map((h) => h.id));
    const problems: string[] = [];
    for (const id of helpIds) if (!scenes.has(id)) problems.push(`screen-help ${id}: no such screen`);
    // Every screen the home menu opens explains itself on the first visit (the help and settings screens are their own
    // explanation; a settings sheet is planned with the help tabs).
    const selfExplained = new Set<string>([SceneKeys.HELP, SceneKeys.SETTINGS]);
    for (const tab of HOME_MENU) for (const item of tab.items) if (!helpIds.has(item.scene) && !selfExplained.has(item.scene)) problems.push(`home menu ${item.label}: no screen-help for ${item.scene}`);
    for (const i of items.items as Array<{ id: string; scene?: string }>) if (i.scene && !scenes.has(i.scene)) problems.push(`item ${i.id}: scene ${i.scene}`);
    for (const id of Object.keys(refits.ships)) if (!SHIP_IDS.has(id)) problems.push(`refit for unknown ship ${id}`);
    expect(problems).toEqual([]);
  });

  it('quest events (#318): quests name real events, every event is used, every event kind has its win', () => {
    const events = new Set<string>(QUEST_EVENTS);
    const problems: string[] = [];
    for (const q of quests.quests as Array<{ id: string; event: string }>) if (!events.has(q.event)) problems.push(`quest ${q.id}: no event ${q.event}`);
    // Medals count events by name in RecordSystem; anything neither a quest nor a medal reads is dead.
    const medalSource = readFileSync(join(process.cwd(), 'src', 'systems', 'RecordSystem.ts'), 'utf8');
    const quested = new Set((quests.quests as Array<{ event: string }>).map((q) => q.event));
    // The event kinds' wins are counted together by one medal ladder (`event_${kind}`).
    const byKind = (e: string): boolean => e.startsWith('event_') && medalSource.includes('`event_${');
    for (const e of QUEST_EVENTS) if (!quested.has(e) && !medalSource.includes(`'${e}'`) && !byKind(e)) problems.push(`event ${e}: no quest or medal uses it`);
    for (const kind of Object.keys(EVENT_NAME)) if (!events.has(`event_${kind}`)) problems.push(`event kind ${kind}: no event_${kind}`);
    expect(problems).toEqual([]);
  });
});
