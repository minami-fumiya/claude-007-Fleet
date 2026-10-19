/**
 * `npm run balance` (#223): the figures of a release's balance review, as Markdown for docs/balance/<version>.md.
 * Economy by stage (#222) and build / repair times by ship. The targets themselves are unit tests.
 */
import ijn from '@/data/ships/ijn.json';
import { ECONOMY, hourBudget, steelBuildsPerHour } from '@/systems/EconomyModel';
import { RESOURCE_KEYS, RESOURCE_LABEL } from '@/systems/ResourceSystem';
import { buildCost, buildTimeMs, shipGrade } from '@/systems/ShipyardSystem';
import { repairCost, repairTimeMs, SUNK_HP_FRACTION } from '@/systems/DockSystem';
import { LEDGER_LABEL, LedgerCategory } from '@/systems/LedgerSystem';
import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';

const fmt = (r: IResources): string => RESOURCE_KEYS.map((k) => r[k].toLocaleString('en-US')).join(' / ');
const label = (k: string): string => LEDGER_LABEL[k as LedgerCategory] ?? k;
const out: string[] = [];

out.push('## 資源の収支 (1 時間, 燃 / 弾 / 鋼 / ボ)', '');
for (const p of ECONOMY.phases) {
  const b = hourBudget(p);
  out.push(`### ${p.label}`, '', '| 内訳 | 燃 / 弾 / 鋼 / ボ |', '|---|---|');
  for (const [k, v] of Object.entries(b.income)) out.push(`| + ${label(k)} | ${fmt(v)} |`);
  for (const [k, v] of Object.entries(b.spending)) out.push(`| − ${label(k)} | ${fmt(v)} |`);
  out.push(`| **収入** | ${fmt(b.totalIn)} |`, `| **支出** | ${fmt(b.totalOut)} |`, `| **差し引き** | ${fmt(b.net)} |`, '');
  const ratio = RESOURCE_KEYS.map((k) => `${RESOURCE_LABEL[k]} ${b.totalOut[k] > 0 ? (b.totalIn[k] / b.totalOut[k]).toFixed(2) : '—'}`).join('・');
  const builds = RESOURCE_KEYS.filter((k) => b.buildCost[k] > 0).map((k) => `${RESOURCE_LABEL[k]} ${(b.net[k] / b.buildCost[k]).toFixed(1)}`).join('・');
  out.push(`- 収入 ÷ 支出: ${ratio}`, `- 余りで建造できる ${p.build} (資源ごと): ${builds} (鋼材 ${steelBuildsPerHour(b).toFixed(1)} 隻)`, '');
}

out.push('## 建造と入渠 (日本艦)', '', '| 艦 | 格 | 建造 (分) | 建造費 燃/弾/鋼/ボ | 大破からの入渠 (分) | 入渠の鋼材 |', '|---|---|---|---|---|---|');
for (const s of (ijn.ships as IShipData[]).filter((x) => !x.fictional)) {
  const name = s.name.replace(/\s*\(.*\)\s*$/, '');
  const repair = repairTimeMs(s.hp, SUNK_HP_FRACTION, 1, s.shipClass) / 60_000;
  out.push(`| ${name} | ${shipGrade(s)} | ${(buildTimeMs(s) / 60_000).toFixed(1)} | ${fmt(buildCost(s)).replace(/ \/ /g, '/')} | ${repair.toFixed(1)} | ${repairCost(s.hp, SUNK_HP_FRACTION).steel} |`);
}

console.log(out.join('\n'));
