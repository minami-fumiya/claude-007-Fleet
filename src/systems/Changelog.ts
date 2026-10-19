import changelogData from '@/data/changelog.json';

/** What changed in each version (#205, pure), newest first, in the words the title screen shows. */
export interface IChangelogEntry {
  version: string;
  title: string;
  items: string[];
}

export const CHANGELOG = (changelogData as { entries: IChangelogEntry[] }).entries;

/** "0.0.16-alpha.1" → [0, 0, 16, 1]: numbers in order, so versions compare as numbers. */
function versionParts(v: string): number[] {
  return (v.match(/\d+/g) ?? []).map(Number);
}

/** Negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The entries to show on opening `current` (#205): every version after `lastSeen` up to `current`, newest first.
 * A player who never saw one (`lastSeen` '') gets only the current version's, and a new player (`fresh`) none.
 */
export function unseenEntries(entries: readonly IChangelogEntry[], lastSeen: string, current: string, fresh: boolean): IChangelogEntry[] {
  if (fresh) return [];
  const upTo = entries.filter((e) => compareVersions(e.version, current) <= 0);
  if (!lastSeen) return upTo.filter((e) => compareVersions(e.version, current) === 0);
  return upTo.filter((e) => compareVersions(e.version, lastSeen) > 0).sort((a, b) => compareVersions(b.version, a.version));
}
