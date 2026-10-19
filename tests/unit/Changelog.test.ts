import { describe, expect, it } from 'vitest';
import { CHANGELOG, compareVersions, IChangelogEntry, unseenEntries } from '@/systems/Changelog';

const E = (version: string): IChangelogEntry => ({ version, title: version, items: ['x'] });
const LOG = [E('0.0.26-alpha'), E('0.0.25-alpha'), E('0.0.24-alpha'), E('0.0.16-alpha.1')];

describe('changelog on the title screen (#205)', () => {
  it('compares versions as numbers', () => {
    expect(compareVersions('0.0.9-alpha', '0.0.10-alpha')).toBeLessThan(0);
    expect(compareVersions('0.0.16-alpha.1', '0.0.16-alpha')).toBeGreaterThan(0);
    expect(compareVersions('0.0.25-alpha', '0.0.25-alpha')).toBe(0);
  });

  it('shows every version after the last one seen, up to this one, newest first', () => {
    expect(unseenEntries(LOG, '0.0.24-alpha', '0.0.26-alpha', false).map((e) => e.version)).toEqual(['0.0.26-alpha', '0.0.25-alpha']);
    expect(unseenEntries(LOG, '0.0.26-alpha', '0.0.26-alpha', false)).toEqual([]);
    // Entries for a version not out yet stay hidden.
    expect(unseenEntries(LOG, '0.0.24-alpha', '0.0.25-alpha', false).map((e) => e.version)).toEqual(['0.0.25-alpha']);
  });

  it('a player who never saw one gets this version only; a new player none', () => {
    expect(unseenEntries(LOG, '', '0.0.26-alpha', false).map((e) => e.version)).toEqual(['0.0.26-alpha']);
    expect(unseenEntries(LOG, '', '0.0.26-alpha', true)).toEqual([]);
  });

  it('the data is newest first, with a title and 1〜8 lines each', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    for (const e of CHANGELOG) {
      expect(e.title.length, e.version).toBeGreaterThan(0);
      expect(e.items.length, e.version).toBeGreaterThanOrEqual(1);
      expect(e.items.length, e.version).toBeLessThanOrEqual(8);
    }
  });
});
