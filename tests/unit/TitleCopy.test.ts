import { describe, expect, it } from 'vitest';
import { continueLabel, titleTiles } from '@/systems/TitleCopy';
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

describe('the title button (#198)', () => {
  it('names the nation and rank to go back to, or the home port for a new save', () => {
    expect(continueLabel('日本', '少佐')).toBe('日本 · 少佐 で続ける');
    expect(continueLabel(null, null)).toBe('はじめる  →');
  });
});

