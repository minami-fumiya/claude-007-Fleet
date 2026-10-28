import data from '@/data/music.json';

/**
 * 国別 BGM (#93, pure): each navy's public-domain naval tune as notes — pitch and length — that the WebAudio synth
 * plays (no recordings: a recording has its performers' rights). The home port plays it at its own tempo, a battle
 * faster; the title keeps the old chord bed. docs/specs/systems/audio.md has every tune's source and why it is free.
 */

export interface ITune {
  id: string;
  nation: string;
  title: string;
  composer: string;
  year: number;
  bpm: number;
  notes: string[];
}

export const TUNES = (data as unknown as { tunes: ITune[] }).tunes;
export const FANFARE = (data as unknown as { fanfare: string[] }).fanfare;
/** A battle plays the tune this much faster. */
export const BATTLE_TEMPO = 1.25;

export function tuneFor(nation: string | undefined): ITune | undefined {
  return TUNES.find((t) => t.nation === nation);
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Hz of a pitch like "C5", "F#4" or "Bb3" (A4 = 440); null for a rest ("R") or anything malformed. */
export function noteFreq(pitch: string): number | null {
  const m = /^([A-G])([#b]?)(\d)$/.exec(pitch);
  if (!m) return null;
  const semis = SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}

export interface INoteEvent {
  /** Seconds from the start of the tune */
  at: number;
  duration: number;
  /** null = rest */
  freq: number | null;
}

/** "G4:1.5" → its pitch and beats; a malformed entry is a one-beat rest. */
export function parseNote(note: string): { pitch: string; beats: number } {
  const [pitch, beats] = note.split(':');
  const b = Number(beats);
  return { pitch: pitch ?? 'R', beats: Number.isFinite(b) && b > 0 ? b : 1 };
}

/** The tune laid out in seconds at `bpm`. */
export function timeline(notes: readonly string[], bpm: number): INoteEvent[] {
  const beat = 60 / Math.max(1, bpm);
  let at = 0;
  return notes.map((n) => {
    const { pitch, beats } = parseNote(n);
    const ev = { at, duration: beats * beat, freq: noteFreq(pitch) };
    at += beats * beat;
    return ev;
  });
}

/** Seconds one pass of the tune lasts at `bpm`. */
export function tuneLength(notes: readonly string[], bpm: number): number {
  const t = timeline(notes, bpm);
  const last = t[t.length - 1];
  return last ? last.at + last.duration : 0;
}
