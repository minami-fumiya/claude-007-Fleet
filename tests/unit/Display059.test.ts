import { describe, expect, it } from 'vitest';
import { Objective } from '@/types/Campaign';
import { outcomeLine } from '@/systems/CommentarySystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { rankTable } from '@/systems/RankTable';
import { costCap } from '@/systems/FleetCost';
import { sweepableAreas } from '@/systems/ProgressionSystem';
import { S_HP_RATIO } from '@/systems/BattleRank';
import { MEDALS } from '@/systems/RecordSystem';
import campaign from '@/data/campaign.json';
import type { ICampaignArea } from '@/types/Campaign';

const AREAS = campaign.areas as unknown as ICampaignArea[];

describe('0.0.59 表示と全体の調整', () => {
  it('every objective has its own victory and defeat words in every navy (#398)', () => {
    for (const o of Object.values(Objective)) {
      for (const n of PLAYABLE_NATIONS) {
        const win = outcomeLine(true, o, n);
        const loss = outcomeLine(false, o, n);
        expect(win.length, `${o} ${n}`).toBeGreaterThan(3);
        expect(loss.length, `${o} ${n}`).toBeGreaterThan(3);
        expect(win).not.toBe(loss);
      }
    }
  });

  it('the rank list carries the cost cap of each rank (#406)', () => {
    for (const r of rankTable('IJN')) expect(r.costCap).toBe(costCap(r.index));
  });

  it('lists the areas with a sweep banked across the seas, fullest first (#406)', () => {
    const a = AREAS.find((x) => x.theater === 'pacific')!;
    const b = AREAS.find((x) => x.theater === 'atlantic')!;
    const now = 10 * 3_600_000;
    const p = { campaign: [a.id, b.id], perfect: [a.id, b.id], sweepCharges: { [a.id]: { charges: 1, at: now }, [b.id]: { charges: 3, at: now } } };
    const list = sweepableAreas(p, AREAS, ['pacific', 'atlantic'], now);
    expect(list.map((x) => [x.area.id, x.left])).toEqual([[b.id, 3], [a.id, 1]]);
    expect(sweepableAreas(p, AREAS, ['pacific'], now).map((x) => x.area.id)).toEqual([a.id]);
  });

  it('an S needs 80% of the HP (#407); a win beside an ally can bring its plans, with a medal (#386)', () => {
    expect(S_HP_RATIO).toBe(0.8);
    expect(MEDALS.some((m) => m.id.startsWith('lend_lease'))).toBe(true);
  });
});
