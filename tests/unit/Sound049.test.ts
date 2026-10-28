import { describe, it, expect } from 'vitest';
import { MAX_SOUNDS, shipSize, sinkSound, SOUND_MS, SoundThrottle } from '@/systems/SoundRules';
import { BATTLE_TEMPO, noteFreq, parseNote, timeline, TUNES, tuneFor, tuneLength } from '@/systems/MusicScore';
import {
  battleLine, bearingWord, COMMENTARY_RULES, emptyCommentary, fillLine, ICommentaryLine, LINE_SEC, logLines, narrationLine, next, raise, STALE_SEC,
} from '@/systems/CommentarySystem';
import { shakeFor, SHAKE_RANGE, vibrateFor } from '@/systems/FeedbackRules';
import { ShipClass } from '@/types/ShipClass';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('効果音 (#104)', () => {
  it('a sinking sounds by the ship’s size, ours apart', () => {
    expect(sinkSound(ShipClass.Battleship, false)).toBe('sinkLarge');
    expect(sinkSound(ShipClass.Carrier, false)).toBe('sinkLarge');
    expect(sinkSound(ShipClass.Cruiser, false)).toBe('sinkMedium');
    expect(sinkSound(ShipClass.Destroyer, false)).toBe('sinkSmall');
    expect(sinkSound(ShipClass.Submarine, false)).toBe('sinkSmall');
    expect(sinkSound(ShipClass.Battleship, true)).toBe('ownSink');
    expect(shipSize(ShipClass.Cruiser)).toBe('medium');
  });

  it('caps the sounds at once, but never drops a sinking or an alarm', () => {
    const t = new SoundThrottle();
    const kinds = ['gun', 'bigGun', 'explosion', 'splash', 'torpedo', 'depthCharge', 'plane', 'hit', 'ricochet', 'nearMiss', 'torpedoHit', 'torpedoLaunch', 'aaFire', 'planeDown', 'launch', 'bombDrop', 'dive', 'surface'] as const;
    let played = 0;
    for (const k of kinds) if (t.tryPlay(k, 0)) played++;
    expect(played).toBe(MAX_SOUNDS);
    expect(t.active(0)).toBe(MAX_SOUNDS);
    expect(t.tryPlay('sinkLarge', 1)).toBe(true);
    expect(t.tryPlay('alarm', 1)).toBe(true);
    // Once they end, there is room again.
    expect(t.tryPlay('sonar', 5000)).toBe(true);
    expect(SOUND_MS.sinkLarge).toBeGreaterThan(SOUND_MS.sinkSmall);
  });
});

describe('国別 BGM (#93)', () => {
  it('every playable navy has a tune whose notes all parse', () => {
    for (const n of PLAYABLE_NATIONS) {
      const tune = tuneFor(n);
      expect(tune, n).toBeDefined();
      for (const note of tune!.notes) {
        const { pitch, beats } = parseNote(note);
        expect(beats, `${n} ${note}`).toBeGreaterThan(0);
        expect(pitch === 'R' || noteFreq(pitch) !== null, `${n} ${note}`).toBe(true);
      }
      expect(tuneLength(tune!.notes, tune!.bpm), n).toBeGreaterThan(8);
    }
    expect(new Set(TUNES.map((t) => t.nation)).size).toBe(TUNES.length);
  });

  it('pitches and timing', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('C5')).toBeCloseTo(523.25, 1);
    expect(noteFreq('F#4')).toBeCloseTo(369.99, 1);
    expect(noteFreq('Bb3')).toBeCloseTo(233.08, 1);
    expect(noteFreq('R')).toBeNull();
    const t = timeline(['C4:1', 'R:1', 'G4:2'], 120);
    expect(t.map((e) => [e.at, e.duration])).toEqual([[0, 0.5], [0.5, 0.5], [1, 1]]);
    expect(tuneLength(['C4:1', 'G4:2'], 60)).toBe(3);
    expect(BATTLE_TEMPO).toBeGreaterThan(1);
  });

  it('every tune’s source and rights are written down', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'specs', 'systems', 'audio.md'), 'utf8');
    for (const t of TUNES) expect(doc, t.title).toContain(t.title);
  });
});

describe('戦闘実況 (#106)', () => {
  const line = (kind: ICommentaryLine['kind'], at: number): ICommentaryLine => ({ kind, text: kind, at });

  it('says the most important waiting line first, one at a time', () => {
    let s = emptyCommentary();
    s = raise(s, line('ownHit', 0), 'normal');
    s = raise(s, line('flagshipDanger', 0), 'normal');
    const a = next(s, 0);
    expect(a.line?.kind).toBe('flagshipDanger');
    expect(next(a.state, 1).line).toBeNull();
    const b = next(a.state, LINE_SEC);
    expect(b.line?.kind).toBe('ownHit');
    expect(b.state.log.map((l) => l.kind)).toEqual(['flagshipDanger', 'ownHit']);
  });

  it('does not repeat a kind within its gap, and the rate setting stretches it', () => {
    let s = emptyCommentary();
    s = raise(s, line('ownHit', 0), 'normal');
    s = next(s, 0).state;
    expect(raise(s, line('ownHit', 5), 'normal').queue).toHaveLength(0);
    expect(raise(s, line('ownHit', COMMENTARY_RULES.ownHit.gapSec), 'normal').queue).toHaveLength(1);
    expect(raise(s, line('ownHit', COMMENTARY_RULES.ownHit.gapSec), 'few').queue).toHaveLength(0);
    expect(raise(s, line('ownHit', COMMENTARY_RULES.ownHit.gapSec / 2), 'many').queue).toHaveLength(1);
  });

  it('drops stale small talk but keeps the important lines; 少ない skips the small talk', () => {
    let s = emptyCommentary();
    s = raise(s, line('winning', 0), 'normal');
    s = raise(s, line('ownSunk', 0), 'normal');
    const r = next({ ...s, busyUntil: 0 }, STALE_SEC + 1);
    expect(r.line?.kind).toBe('ownSunk');
    expect(r.state.queue).toHaveLength(0);
    expect(raise(emptyCommentary(), line('ownHit', 0), 'few').queue).toHaveLength(0);
    expect(raise(emptyCommentary(), line('ownSunk', 0), 'few').queue).toHaveLength(1);
  });

  it('words come from the data, a navy’s own first', () => {
    expect(battleLine('enemySunk', 'IJN', { class: '戦艦', name: '大和' })).toBe('敵戦艦 大和、撃沈確認');
    expect(battleLine('enemySunk', 'FR', { class: '駆逐艦', name: 'X' })).toBe('敵駆逐艦 X、撃沈');
    expect(narrationLine('promotion', { rank: '少佐' })).toBe('少佐に昇進しました');
    expect(fillLine('{a}-{b}', { a: '1' })).toBe('1-');
    expect(bearingWord(0, 0, 0, -100)).toBe('北');
    expect(bearingWord(0, 0, 100, 0)).toBe('東');
    expect(bearingWord(0, 0, -100, 100)).toBe('南西');
    expect(logLines([{ kind: 'start', text: '戦闘開始', at: 135.4 }])).toEqual(['02:15  戦闘開始']);
  });
});

describe('揺れと振動 (#107)', () => {
  it('a battleship sinking shakes more than a destroyer, near more than far; off means none', () => {
    const big = shakeFor('enemySunk', 'large', 0, 'strong')!;
    const small = shakeFor('enemySunk', 'small', 0, 'strong')!;
    expect(big.intensity).toBeGreaterThan(small.intensity);
    expect(shakeFor('enemySunk', 'large', 0, 'weak')!.intensity).toBeLessThan(big.intensity);
    expect(shakeFor('enemySunk', 'large', SHAKE_RANGE, 'strong')).toBeNull();
    expect(shakeFor('ownSunk', 'large', 0, 'off')).toBeNull();
  });

  it('buzzes the phone for our own ship and a big kill, never when off', () => {
    expect(vibrateFor('ownSunk', 'large', true)).not.toBeNull();
    expect(vibrateFor('enemySunk', 'large', true)).not.toBeNull();
    expect(vibrateFor('enemySunk', 'small', true)).toBeNull();
    expect(vibrateFor('ownHeavy', 'medium', false)).toBeNull();
  });
});
