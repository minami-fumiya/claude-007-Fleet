/**
 * Line breaking for Japanese (#248, pure): 禁則処理. Phaser's advanced wrap breaks at spaces and, inside a run of
 * kana and kanji, anywhere — so a line could start with "。" or "ー", or a number lose its unit. Here a line never
 * starts with closing punctuation, small kana or the long vowel mark (nor 型 / 級, "長門型"), never ends on an opening
 * bracket, and a number keeps the counter after it ("3 隻", "12 時間" stay whole).
 */

/** Characters a line may not start with. */
const NO_START = new Set([...'、。，．・：；？！ー－～…‥）〕］｝〉》」』】’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞヽヾ%％,.:;!?)]}型級']);
/** Characters a line may not end with. */
const NO_END = new Set([...'（〔［｛〈《「『【‘“([{']);
/** Counters that stay on the line of the number before them ("3 隻", "12 時間"). */
const COUNTERS = new Set([...'割隻名人個回分秒日時週年倍番艦機門基枚件']);

const ASCII = /[0-9A-Za-z.,%:/+\-×'_#&@]/;
const DIGIT = /[0-9]/;

/** Splits a paragraph into pieces that may not be broken, with the spaces between them as their own pieces. */
export function jaTokens(text: string): string[] {
  const raw: string[] = [];
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === ' ') {
      let j = i;
      while (j < text.length && text[j] === ' ') j++;
      raw.push(text.slice(i, j));
      i = j;
    } else if (ASCII.test(ch)) {
      let j = i;
      while (j < text.length && ASCII.test(text[j])) j++;
      raw.push(text.slice(i, j));
      i = j;
    } else {
      // Surrogate pairs (emoji) stay whole.
      const cp = text.codePointAt(i) ?? 0;
      const len = cp > 0xffff ? 2 : 1;
      raw.push(text.slice(i, i + len));
      i += len;
    }
  }
  // Glue what may not be split: closing marks onto the piece before, opening marks onto the piece after, and a
  // number to the counter after it.
  const out: string[] = [];
  for (let k = 0; k < raw.length; k++) {
    const t = raw[k];
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.trim() !== '' && NO_START.has(t[0])) {
      out[out.length - 1] = prev + t;
    } else if (prev !== undefined && prev.trim() !== '' && NO_END.has(prev[prev.length - 1]) && t.trim() !== '') {
      out[out.length - 1] = prev + t;
    } else if (prev === ' ' && out.length >= 2 && DIGIT.test(out[out.length - 2].slice(-1)) && COUNTERS.has(t[0])) {
      out.pop();
      out[out.length - 1] = `${out[out.length - 1]} ${t}`;
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Wraps `text` to `width` (as measured by `measure`), paragraph by paragraph, keeping the 禁則 rules. A piece wider
 * than a whole line is split by character as a last resort.
 */
export function wrapJa(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    const flush = (): void => {
      lines.push(line.replace(/ +$/, ''));
      line = '';
    };
    for (const token of jaTokens(para)) {
      if (token.trim() === '') {
        if (line !== '') line += token;
        continue;
      }
      if (line === '' || measure(line + token) <= width) {
        line += token;
        if (measure(line) <= width) continue;
      } else {
        flush();
        line = token;
        if (measure(line) <= width) continue;
      }
      // Too wide for a line of its own: break it by character.
      const chars = [...line];
      line = '';
      for (const c of chars) {
        if (line !== '' && measure(line + c) > width) flush();
        line += c;
      }
    }
    flush();
  }
  return lines;
}

interface IWrapTarget {
  context: CanvasRenderingContext2D;
  style: { wordWrapWidth: number | null };
}

/** Phaser's wordWrap callback: wraps with the text's own font and wrap width. */
export function jaWordWrap(text: string, target: IWrapTarget): string[] {
  const width = target.style.wordWrapWidth ?? Number.POSITIVE_INFINITY;
  return wrapJa(text, width, (s) => target.context.measureText(s).width);
}
