/**
 * 通し番号 (#249): gives every ship, captain, aircraft, ground target, weapon and item without a `no` the next free
 * number of its category, nation and type. Numbers already given are never changed, so run it after adding data
 * (and after scripts/gen-ships.ts, which keeps the sisters' numbers). The first run numbered everything oldest first:
 * ships in list order (class by class, oldest first, #246), the rest in data order. Run with
 * `npx vite-node scripts/gen-numbers.ts`; tests/unit/Numbering.test.ts checks the result.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { shipOrder } from '@/systems/ShipOrder';
import {
  AIRCRAFT_TYPE_CODE, CAPTAIN_TYPE_CODE, COMMON_NATION, GROUND_TYPE_CODE, ITEM_TYPE_CODE, NATION_CODE, nextNo, NoCategory, noPrefix,
  SHIP_TYPE_CODE, shipTypeCode, WEAPON_TYPE_CODE,
} from '@/systems/Numbering';
import { CaptainSkill } from '@/types/Captain';
import { AircraftType } from '@/types/Aircraft';
import { WeaponType } from '@/types/Weapon';

type Numbered = { id: string; no?: number };

const path = (...p: string[]): string => join(process.cwd(), 'src', 'data', ...p);
const read = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;

/** Every number already in the data, so new ones never collide across files. */
const used = new Set<number>();
/** The entries still to number, with the prefix each takes, in the order they are numbered. */
const queue: Array<{ entry: Numbered; prefix: number }> = [];
const take = (entry: Numbered, prefix: number): void => {
  if (entry.no !== undefined) used.add(entry.no);
  else queue.push({ entry, prefix });
};

/** `no` right after `id`, so it reads as part of the entry's name. */
function withNo<T extends Numbered>(o: T): T {
  if (o.no === undefined) return o;
  const { id, no, ...rest } = o;
  return { id, no, ...rest } as T;
}

// Ships, nation by nation.
const shipFiles = ['ijn', 'usn', 'km', 'rn', 'rm', 'su', 'fr'];
const ships = shipFiles.map((f) => ({ f: path('ships', `${f}.json`), data: read<{ ships: Array<IShipData & Numbered> }>(path('ships', `${f}.json`)) }));
for (const { data } of ships) {
  for (const s of shipOrder(data.ships) as Array<IShipData & Numbered>) {
    take(s, noPrefix({ category: NoCategory.Ship, nation: NATION_CODE[s.nation], type: shipTypeCode(s) }));
  }
}
const superweapons = read<{ superweapons: Array<Numbered & { nation: Nation }> }>(path('superweapons.json'));
for (const s of superweapons.superweapons) take(s, noPrefix({ category: NoCategory.Ship, nation: NATION_CODE[s.nation], type: SHIP_TYPE_CODE.Superweapon }));
const captains = read<{ captains: Array<Numbered & { nation: Nation; skill: CaptainSkill }> }>(path('captains.json'));
for (const c of captains.captains) take(c, noPrefix({ category: NoCategory.Captain, nation: NATION_CODE[c.nation], type: CAPTAIN_TYPE_CODE[c.skill] }));
const aircraft = read<{ aircraft: Array<Numbered & { nation: Nation; type: AircraftType }> }>(path('aircraft.json'));
for (const a of aircraft.aircraft) take(a, noPrefix({ category: NoCategory.Aircraft, nation: NATION_CODE[a.nation], type: AIRCRAFT_TYPE_CODE[a.type] }));
const special = read<{ convoy: Numbered; landTargets: Numbered[] }>(path('special.json'));
for (const g of [special.convoy, ...special.landTargets]) take(g, noPrefix({ category: NoCategory.Ground, nation: COMMON_NATION, type: GROUND_TYPE_CODE[g.id] }));
const weapons = read<{ weapons: Array<Numbered & { type: WeaponType }> }>(path('weapons', 'weapons.json'));
for (const w of weapons.weapons) take(w, noPrefix({ category: NoCategory.Weapon, nation: COMMON_NATION, type: WEAPON_TYPE_CODE[w.type] }));
const items = read<{ items: Numbered[] }>(path('items.json'));
for (const i of items.items) take(i, noPrefix({ category: NoCategory.Item, nation: COMMON_NATION, type: ITEM_TYPE_CODE }));

for (const { entry, prefix } of queue) {
  if (!Number.isFinite(prefix)) throw new Error(`no type code for ${entry.id}`);
  entry.no = nextNo(prefix, used);
  used.add(entry.no);
}
console.log(`numbered ${queue.length} entries (${used.size} in all)`);

// Files kept in JSON.stringify layout are written back whole; the one-entry-per-line files get `"no": n` after the id.
for (const { f, data } of ships) writeFileSync(f, JSON.stringify({ ...data, ships: data.ships.map(withNo) }, null, 2) + '\n');
writeFileSync(path('weapons', 'weapons.json'), JSON.stringify({ ...weapons, weapons: weapons.weapons.map(withNo) }, null, 2) + '\n');
writeFileSync(path('special.json'), JSON.stringify({ ...special, convoy: withNo(special.convoy), landTargets: special.landTargets.map(withNo) }, null, 2) + '\n');
const inline = (file: string, entries: Numbered[]): void => {
  let text = readFileSync(file, 'utf8');
  for (const e of entries) {
    if (text.includes(`"id": "${e.id}", "no": `)) continue;
    const at = `{ "id": "${e.id}", `;
    if (!text.includes(at)) throw new Error(`${file}: entry ${e.id} not on one line`);
    text = text.replace(at, `{ "id": "${e.id}", "no": ${e.no}, `);
  }
  writeFileSync(file, text);
};
inline(path('superweapons.json'), superweapons.superweapons);
inline(path('captains.json'), captains.captains);
inline(path('aircraft.json'), aircraft.aircraft);
inline(path('items.json'), items.items);
