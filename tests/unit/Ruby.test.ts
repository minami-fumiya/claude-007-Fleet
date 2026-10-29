import { describe, expect, it } from 'vitest';
import { addRuby, rubyDict, rubyMatcher } from '@/systems/RubySystem';

const dict = { 陸奥: 'むつ', 雷: 'いかづち', 雷撃: 'らいげき', 大和: 'やまと', 准尉: 'じゅんい' };

describe('ふりがな (#94)', () => {
  it('puts the reading after the word', () => {
    expect(addRuby('陸奥が出撃', dict)).toBe('陸奥〈むつ〉が出撃');
  });

  it('a one-character word only standing alone', () => {
    expect(addRuby('魚雷を撃つ', dict)).toBe('魚雷を撃つ');
    expect(addRuby('雷・電', dict)).toBe('雷〈いかづち〉・電');
  });

  it('the longest word wins', () => {
    expect(addRuby('雷撃戦', dict)).toBe('雷撃〈らいげき〉戦');
  });

  it('is idempotent and leaves romaji names alone', () => {
    const once = addRuby('准尉の陸奥', dict);
    expect(addRuby(once, dict)).toBe(once);
    expect(addRuby('大和 (Yamato)', dict)).toBe('大和 (Yamato)');
  });

  it('no kanji, no change; off reads nothing', () => {
    expect(addRuby('Fletcher 120', dict)).toBe('Fletcher 120');
    expect(rubyMatcher(rubyDict('off'))).toBeNull();
  });

  it('the hard level is part of every word', () => {
    const hard = rubyDict('hard');
    const all = rubyDict('all');
    for (const k of Object.keys(hard)) expect(all[k]).toBe(hard[k]);
    expect(Object.keys(all).length).toBeGreaterThan(Object.keys(hard).length);
    for (const [k, v] of Object.entries(all)) expect(/^[ぁ-ゖー ]+$/.test(v), k).toBe(true);
  });
});

describe('ふりがな: once a text (#94)', () => {
  it('a word repeated in one text reads the first time only', () => {
    expect(addRuby('陸奥と陸奥', { 陸奥: 'むつ' })).toBe('陸奥〈むつ〉と陸奥');
    expect(addRuby('准尉〈じゅんい〉の陸奥と准尉', { 陸奥: 'むつ', 准尉: 'じゅんい' })).toBe('准尉〈じゅんい〉の陸奥〈むつ〉と准尉');
  });
});
