import { describe, it, expect } from 'vitest';
import { jaPhrases, jaTokens, wrapJa } from '@/utils/JaWrap';

/** One unit a character: full and half width alike, enough to see where lines break. */
const len = (s: string): number => [...s].length;

describe('Japanese line breaking (#248)', () => {
  it('no line starts with closing punctuation, small kana or ー', () => {
    const text = '資源は時間で回復します。新しい国は駆逐艦から始まります。ショップでゴールドを使えます。';
    for (let w = 4; w <= 20; w++) {
      for (const line of wrapJa(text, w, len).slice(1)) {
        expect('、。ーっゃゅょッャュョ）」'.includes(line[0]), `width ${w}: "${line}"`).toBe(false);
      }
    }
  });

  it('no line ends on an opening bracket', () => {
    const text = '作戦「東洋艦隊決戦」で勝利すると（報酬）が出ます';
    for (let w = 3; w <= 14; w++) {
      for (const line of wrapJa(text, w + 1, len)) expect('「（'.includes(line[line.length - 1]), `width ${w}: "${line}"`).toBe(false);
    }
  });

  it('a number keeps its counter, and numbers are never split', () => {
    expect(jaTokens('駆逐艦 3 隻で出撃')).toContain('3 隻');
    expect(jaTokens('燃料 1,000 を使う')).toContain('1,000');
    for (let w = 4; w <= 12; w++) {
      const lines = wrapJa('敵の駆逐艦 12 隻と巡洋艦 3 隻を撃沈せよ', w, len);
      expect(lines.some((l) => l.startsWith('隻')), `width ${w}: ${lines.join('|')}`).toBe(false);
      expect(lines.join(''), `width ${w}`).toContain('12 隻');
    }
  });

  it('keeps every character, breaks paragraphs where the text does, and trims spaces at line ends', () => {
    const text = '一行目の文です。\n二行目の文は少し長めにしてあります。';
    const lines = wrapJa(text, 8, len);
    expect(lines.every((l) => len(l) <= 9)).toBe(true);
    expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/\n/g, '').replace(/ /g, ''));
    expect(lines.indexOf('一行目の文です。')).toBe(0);
    expect(wrapJa('a b', 1, len).every((l) => !l.endsWith(' ') && !l.startsWith(' '))).toBe(true);
  });

  it('a piece wider than a line is split by character as a last resort', () => {
    expect(wrapJa('ABCDEFGHIJ', 4, len)).toEqual(['ABCD', 'EFGH', 'IJ']);
  });

  it('breaks between phrases, at 、。 and where a word ends, not inside a word (#349)', () => {
    const text = '遠征: 出撃していない艦を送り出すと、時間がたって資源を持ち帰ります (保有上限まで)。艦は小さい順に自動で選ばれます。';
    expect(jaPhrases('送り出すと、時間がたって資源を').map((p) => p.join(''))).toEqual(['送り出すと、', '時間がたって', '資源を']);
    expect(jaPhrases('艦を持ち帰ります').map((p) => p.join(''))).toEqual(['艦を', '持ち帰ります']);
    for (let w = 12; w <= 40; w++) {
      const lines = wrapJa(text, w, len);
      const joined = lines.join('|');
      // Words the old wrap cut: 「上限ま|で」「時間がた|って」「持ち帰|ります」.
      for (const word of ['上限まで', 'たって', '持ち帰ります', '小さい', '自動で']) {
        expect(joined.includes(word) || !text.includes(word), `width ${w}: ${joined}`).toBe(true);
      }
      expect(lines.join('').replace(/ /g, ''), `width ${w}`).toBe(text.replace(/ /g, ''));
    }
  });

  it('splits a phrase only when it is wider than a line', () => {
    // 「ありがとうございました」 is one phrase: it fills the line after 「本日は」 (too long for a line of its own).
    expect(wrapJa('本日はありがとうございました', 10, len)[0]).toBe('本日はありがとうござ');
    // A phrase that fits the next line goes there when this one is mostly full.
    expect(wrapJa('戦闘の結果を確かめます', 8, len)).toEqual(['戦闘の結果を', '確かめます']);
  });
});
