import rubyData from '@/data/ruby.json';
import type { RubyLevel } from './SettingsSystem';

/**
 * ふりがな (#94, pure): the reading after a hard word, small and in angle brackets (陸奥〈むつ〉). Phaser's text has no
 * ruby, so the reading follows the word on the same line, which never breaks a layout's lines. Words come from
 * src/data/ruby.json: `hard` ones show at 「難しい語のみ」, the rest join them at 「すべて」.
 */

const KANJI = '\\u4e00-\\u9fff々';
const HAS_KANJI = new RegExp(`[${KANJI}]`);

export type RubyDict = Readonly<Record<string, string>>;

/** The words a level reads, hard words always among them. */
export function rubyDict(level: RubyLevel, data: { hard: RubyDict; all: RubyDict } = rubyData as { hard: RubyDict; all: RubyDict }): RubyDict {
  if (level === 'off') return {};
  return level === 'hard' ? data.hard : { ...data.all, ...data.hard };
}

/**
 * The matcher for a dictionary: longest words first; a one-character word only standing alone (雷 but not 魚雷); never a
 * word already followed by its reading or by a romaji name in brackets (大和 (Yamato)).
 */
export function rubyMatcher(dict: RubyDict): RegExp | null {
  const words = Object.keys(dict).sort((a, b) => b.length - a.length);
  if (words.length === 0) return null;
  const esc = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alts = words.map((w) => ([...w].length === 1 ? `(?<![${KANJI}])${esc(w)}(?![${KANJI}])` : esc(w)));
  return new RegExp(`(?:${alts.join('|')})(?!〈| ?\\()`, 'g');
}

/**
 * The text with readings after its hard words, each word's first time only (a list of names reads once); text without
 * kanji comes back as it is.
 */
export function addRuby(text: string, dict: RubyDict, matcher: RegExp | null = rubyMatcher(dict)): string {
  if (!matcher || !HAS_KANJI.test(text)) return text;
  const seen = new Set<string>();
  // A word read earlier in the text (on an earlier set, its reading is already there) is not read again.
  if (text.includes('〈')) for (const w of Object.keys(dict)) if (text.includes(`${w}〈`)) seen.add(w);
  return text.replace(matcher, (w) => {
    if (!dict[w] || seen.has(w)) return w;
    seen.add(w);
    return `${w}〈${dict[w]}〉`;
  });
}
