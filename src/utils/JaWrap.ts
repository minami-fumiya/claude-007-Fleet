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

const HIRAGANA = /[\u3041-\u309f]/;
/** One-kana particles: a single hiragana between kanji ends a phrase only when it is one of these (送り出す stays whole). */
const PARTICLES = new Set([...'をがはにでとのへもや']);
/** Marks after which a line may always break: the ends of sentences and clauses. */
const CLAUSE_END = new Set([...'、。，．・：；？！）〕］｝〉》」』】']);

/**
 * Groups the pieces of a paragraph into phrases (#349): a line may break between them, not inside. A phrase ends
 * after 、。 and closing brackets, before an opening bracket, at a space, and where a run of hiragana (the endings and
 * particles of a 文節) meets kanji, katakana or a number again: 「送り出すと、」「時間がたって」「資源を」. A single kana
 * between kanji is 送り仮名 (送り出す) unless it is a particle (艦を).
 */
export function jaPhrases(text: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let kana = 0;
  const close = (): void => {
    if (cur.length > 0) out.push(cur);
    cur = [];
    kana = 0;
  };
  for (const piece of jaTokens(text)) {
    if (piece.trim() === '') {
      close();
      out.push([piece]);
      kana = 0;
      continue;
    }
    const prev = cur[cur.length - 1];
    if (prev !== undefined) {
      const last = prev[prev.length - 1];
      const first = piece[0];
      const wordEnd = HIRAGANA.test(last) && !HIRAGANA.test(first) && !NO_START.has(first) && (kana > 1 || PARTICLES.has(last));
      if (CLAUSE_END.has(last) || NO_END.has(first) || wordEnd) close();
    }
    cur.push(piece);
    // Length of the run of hiragana the phrase now ends with.
    kana = [...piece].every((c) => HIRAGANA.test(c)) ? kana + [...piece].length : HIRAGANA.test(piece[piece.length - 1]) ? 1 : 0;
  }
  close();
  return out;
}

/**
 * Wraps `text` to `width` (as measured by `measure`), paragraph by paragraph: between phrases (#349), keeping the 禁則
 * rules. A phrase wider than a whole line is split between its pieces, and a piece wider than a line by character, as
 * a last resort.
 */
export function wrapJa(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    const flush = (): void => {
      lines.push(line.replace(/ +$/, ''));
      line = '';
    };
    const addPiece = (piece: string): void => {
      if (line !== '' && measure(line + piece) > width) flush();
      if (line === '' && piece.trim() === '') return;
      line += piece;
      if (measure(line) <= width) return;
      // Too wide for a line of its own: break it by character.
      const chars = [...line];
      line = '';
      for (const c of chars) {
        if (line !== '' && measure(line + c) > width) flush();
        line += c;
      }
    };
    for (const phrase of jaPhrases(para)) {
      const whole = phrase.join('');
      if (whole.trim() === '') {
        if (line !== '') line += whole;
        continue;
      }
      if (line === '' || measure(line + whole) <= width) {
        for (const piece of phrase) addPiece(piece);
        continue;
      }
      // The phrase does not fit: it starts the next line, unless it is wider than a line of its own.
      if (measure(whole) <= width) flush();
      for (const piece of phrase) addPiece(piece);
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
