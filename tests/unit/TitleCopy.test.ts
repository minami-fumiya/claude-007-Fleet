import { describe, expect, it } from 'vitest';
import { titleTiles } from '@/systems/TitleCopy';
import { Formation } from '@/types/Formation';
import { Objective } from '@/types/Campaign';

describe('title copy (#197)', () => {
  it('counts the formations and objectives the game really has', () => {
    for (const portrait of [true, false]) {
      const [, formation, objective] = titleTiles(portrait);
      expect(formation.body).toContain(`全 ${Object.values(Formation).length} 種`);
      expect(formation.body).not.toContain('ほか');
      expect(objective.body).toContain(`${Object.values(Objective).length} 種`);
    }
  });
});
