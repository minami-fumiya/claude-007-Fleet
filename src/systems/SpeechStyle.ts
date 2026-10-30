/**
 * 声の抑揚 (#383, pure): the narration read flat in one breath. A line is split into phrases at the sentence and
 * clause marks, and each phrase gets its own rate and pitch from what it says: a call to arms or a hit comes quicker
 * and higher, a loss slower and lower, and a sentence falls a little at its end. The most natural Japanese voice the
 * device has (the neural / online ones) is chosen unless the settings name one.
 */

export type SpeechMood = 'urgent' | 'grave' | 'calm';

export interface IPhrase {
  text: string;
  rate: number;
  pitch: number;
}

const URGENT = /[！!]|撃て|突撃|全艦|敵|命中|撃沈|発見|見ゆ|急げ|来襲|魚雷|戦闘配置/;
const GRAVE = /沈没|轟沈|大破|損傷|被弾|撤退|敗北|[…]|残念|戦死/;

export function phraseMood(text: string): SpeechMood {
  if (GRAVE.test(text)) return 'grave';
  if (URGENT.test(text)) return 'urgent';
  return 'calm';
}

const MOOD_VOICE: Record<SpeechMood, { rate: number; pitch: number }> = {
  urgent: { rate: 1.15, pitch: 1.12 },
  grave: { rate: 0.92, pitch: 0.88 },
  calm: { rate: 1.0, pitch: 1.0 },
};

/** The channel's own pace: the battle calls are quicker than the narration. */
const CHANNEL_RATE = { narration: 1.05, commentary: 1.25 } as const;

/**
 * Splits `text` into phrases at 。！？ and 、 (a clause shorter than 4 characters stays with the next one), each with a
 * rate and pitch. The first phrase of a sentence rises a little and its last one falls, so a line has a shape.
 */
export function speechPhrases(text: string, channel: keyof typeof CHANNEL_RATE): IPhrase[] {
  const parts = text.match(/[^。！？!?、]+[。！？!?、]*/g)?.map((p) => p.trim()).filter((p) => p !== '') ?? [];
  const merged: string[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last !== undefined && /、$/.test(last) && last.length < 4) merged[merged.length - 1] = last + p;
    else merged.push(p);
  }
  const base = CHANNEL_RATE[channel];
  let first = true;
  return merged.map((p) => {
    const end = /[。！？!?]$/.test(p);
    const m = MOOD_VOICE[phraseMood(p)];
    const shape = first ? 1.04 : end ? 0.96 : 1;
    first = end;
    return {
      text: p,
      rate: round(clamp(base * m.rate, 0.6, 1.8)),
      pitch: round(clamp(m.pitch * shape, 0.6, 1.5)),
    };
  });
}

/** How natural a voice is likely to sound: the neural and online voices first, then the enhanced ones. */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }): number {
  if (!v.lang?.toLowerCase().startsWith('ja')) return -1;
  let n = 0;
  if (/natural|neural|online/i.test(v.name)) n += 4;
  if (/premium|enhanced|拡張/i.test(v.name)) n += 3;
  if (/google/i.test(v.name)) n += 2;
  if (/nanami|keita|kyoko|otoya|o-ren|hattori/i.test(v.name)) n += 1;
  return n;
}

/** The voice to speak with: the one the settings name if the device has it, else the most natural Japanese one. */
export function pickVoice<T extends { name: string; lang: string; localService?: boolean }>(voices: readonly T[], preferred = ''): T | null {
  const ja = voices.filter((v) => voiceScore(v) >= 0);
  if (preferred) {
    const named = ja.find((v) => v.name === preferred);
    if (named) return named;
  }
  return ja.reduce<T | null>((best, v) => (best === null || voiceScore(v) > voiceScore(best) ? v : best), null);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** A voice's name short enough for a button: "Microsoft Nanami Online (Natural) - Japanese (Japan)" → "Nanami Online". */
export function shortVoiceName(name: string, max = 14): string {
  const s = name.replace(/^(Microsoft|Google|Apple)\s+/i, '').replace(/\s*[-–]\s*(Japanese|日本語).*$/i, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s || name.slice(0, max);
}
