import { distanceGain, SoundKind, SoundThrottle } from './SoundRules';
import { channelGain, ISettings, parseSettings } from './SettingsSystem';
import { BATTLE_TEMPO, FANFARE, timeline, tuneFor, tuneLength } from './MusicScore';

/**
 * Synthesised sound (WebAudio): no audio files, every effect and the background music are built from
 * oscillators and filtered noise. One instance for the whole page; it starts silent until the first
 * user gesture unlocks the AudioContext, and remembers the settings in localStorage.
 *
 * The music (#93): the title keeps the soft chord bed; the home port and the battle play the navy's public-domain
 * naval tune (MusicScore), the battle faster. 国別 BGM off in the settings brings the chord bed back everywhere.
 */

/** Pre-settings mute flag, read once for older players. */
const LEGACY_MUTE_KEY = 'ww2fleet.audio.muted';
const SETTINGS_KEY = 'ww2fleet.settings.v1';
/** Gains at volume 100; the default 80 matches the levels before volume settings existed. */
const SFX_VOLUME = 0.625;
const BGM_VOLUME = 0.175;
const BGM_FADE_S = 1.5;
/** Chord roots (Hz) cycled by the music; minor-ish for battle, calmer for the menus. */
const CHORDS: Record<'menu' | 'battle', number[][]> = {
  menu: [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]],
  battle: [[110, 130.8, 164.8], [98, 116.5, 146.8], [87.3, 110, 130.8], [103.8, 123.5, 155.6]],
};
const CHORD_S = 4;
/** The tune is scheduled this far ahead, checked this often. */
const LOOKAHEAD_S = 1.2;
const SCHEDULE_MS = 400;
/** A breath between passes of the tune. */
const TUNE_GAP_S = 2;

export type MusicMood = 'title' | 'menu' | 'battle';

type AudioCtor = typeof AudioContext;

class AudioSystem {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private bgm: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private throttle = new SoundThrottle();
  private mood: MusicMood | null = null;
  /** The navy whose tune plays (#93) */
  private nation: string | undefined;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private chordIndex = 0;
  /** Context time the next pass of the tune starts */
  private tuneAt = 0;
  /** The playing tune's own output: a whole pass is scheduled at once, so a switch fades this out and drops it */
  private tuneOut: GainNode | null = null;
  settings: ISettings;

  constructor() {
    let stored: string | null = null;
    let legacyMuted = false;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem(SETTINGS_KEY);
        legacyMuted = localStorage.getItem(LEGACY_MUTE_KEY) === '1';
      }
    } catch {
      // Storage blocked: defaults.
    }
    this.settings = parseSettings(stored, legacyMuted);
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  /** Creates / resumes the AudioContext; call from a user gesture. */
  unlock(): void {
    const Ctor = (globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxGain();
      this.sfx.connect(this.ctx.destination);
      this.bgm = this.ctx.createGain();
      this.bgm.gain.value = 0;
      this.bgm.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      if (this.mood) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  /** Changes and saves settings, applying them to the playing sound. */
  update(patch: Partial<ISettings>): void {
    const tuneChanged = patch.nationalBgm !== undefined && patch.nationalBgm !== this.settings.nationalBgm;
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    if (!this.ctx || !this.sfx || !this.bgm) return;
    const now = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.sfxGain(), now, 0.05);
    this.bgm.gain.setTargetAtTime(this.mood ? this.bgmGain() : 0, now, 0.2);
    if (tuneChanged && this.mood) this.startMusic();
  }

  private sfxGain(): number {
    return channelGain(SFX_VOLUME, this.settings.sfx, this.settings.muted, this.settings.sfxOn);
  }

  private bgmGain(): number {
    return channelGain(BGM_VOLUME, this.settings.bgm, this.settings.muted, this.settings.bgmOn);
  }

  /** Plays an effect; `distance` from the listener (camera centre) attenuates it. */
  play(kind: SoundKind, distance = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted || !this.settings.sfxOn) return;
    const gain = distanceGain(distance);
    if (gain <= 0.01 || !this.throttle.tryPlay(kind, ctx.currentTime * 1000)) return;
    switch (kind) {
      case 'gun':
        this.burst(0.22, 900, gain * 0.6);
        this.thump(80, 0.18, gain * 0.5);
        break;
      case 'bigGun':
        this.burst(0.5, 600, gain * 0.9);
        this.thump(48, 0.45, gain);
        break;
      case 'explosion':
        this.burst(0.9, 420, gain);
        this.thump(40, 0.6, gain * 0.7);
        break;
      case 'splash':
        this.burst(0.3, 1800, gain * 0.35, 'bandpass');
        break;
      case 'torpedo':
        this.burst(0.25, 2500, gain * 0.3, 'highpass');
        break;
      case 'depthCharge':
        this.thump(34, 0.9, gain);
        this.burst(0.7, 300, gain * 0.5);
        break;
      case 'plane':
        this.drone(110, 1.4, gain * 0.25);
        break;
      case 'ui':
        this.thump(880, 0.06, 0.25, 'sine');
        break;
      case 'uiBack':
        this.thump(520, 0.07, 0.22, 'sine');
        break;
      // 撃沈 (#104): a big ship's magazine goes up and its hull groans; a small one is a short blast and a column of water.
      case 'sinkLarge':
        this.burst(1.6, 380, gain);
        this.thump(32, 2.6, gain);
        this.drone(55, 3.2, gain * 0.35);
        break;
      case 'sinkMedium':
        this.burst(1.2, 450, gain * 0.9);
        this.thump(42, 1.6, gain * 0.8);
        break;
      case 'sinkSmall':
        this.burst(0.8, 600, gain * 0.8);
        this.burst(0.6, 1600, gain * 0.35, 'bandpass');
        break;
      case 'ownSink':
        this.siren(660, 440, 1.2, 0.18);
        this.thump(30, 2.4, gain);
        break;
      case 'hit':
        this.burst(0.25, 1400, gain * 0.7);
        this.thump(120, 0.2, gain * 0.5, 'square');
        break;
      case 'ricochet':
        this.thump(2400, 0.3, gain * 0.2, 'triangle');
        break;
      case 'nearMiss':
        this.burst(0.5, 1200, gain * 0.5, 'bandpass');
        break;
      case 'alarm':
        this.siren(880, 660, 1.2, 0.2);
        break;
      case 'torpedoHit':
        this.thump(36, 1.2, gain);
        this.burst(1.0, 900, gain * 0.7, 'bandpass');
        break;
      case 'torpedoLaunch':
        this.burst(0.4, 3200, gain * 0.25, 'highpass');
        break;
      case 'aaFire':
        for (let i = 0; i < 4; i++) this.burst(0.08, 1800, gain * 0.25, 'bandpass', i * 0.11);
        break;
      case 'planeDown':
        this.siren(900, 200, 0.7, gain * 0.15);
        break;
      case 'launch':
        this.drone(160, 0.9, gain * 0.3);
        break;
      case 'bombDrop':
        this.siren(1200, 500, 0.5, gain * 0.12);
        break;
      case 'dive':
        this.burst(0.9, 500, gain * 0.4, 'bandpass');
        break;
      case 'surface':
        this.burst(0.9, 1400, gain * 0.4, 'bandpass');
        break;
      case 'sonar':
        this.thump(1320, 1.2, 0.18, 'sine');
        break;
      case 'notify':
        this.thump(1046, 0.18, 0.2, 'sine');
        this.thump(1318, 0.25, 0.2, 'sine', 0.12);
        break;
      case 'victory':
        this.phrase(FANFARE, 180, 0.22);
        break;
      case 'defeat':
        this.phrase(['C5:1', 'A4:1', 'F4:1', 'D4:3'], 120, 0.2);
        break;
    }
  }

  /** The navy whose tune the home port and the battle play (#93). */
  setNation(nation: string | undefined): void {
    if (this.nation === nation) return;
    this.nation = nation;
    if (this.ctx && this.mood && this.mood !== 'title') this.startMusic();
  }

  /** Starts (or switches) the background music with a fade. */
  music(mood: MusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    if (this.ctx) this.startMusic();
  }

  private startMusic(): void {
    const ctx = this.ctx!;
    const bgm = this.bgm!;
    const mood = this.mood!;
    bgm.gain.cancelScheduledValues(ctx.currentTime);
    bgm.gain.setTargetAtTime(this.bgmGain(), ctx.currentTime, BGM_FADE_S / 3);
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.tuneOut) {
      const old = this.tuneOut;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => old.disconnect(), 1500);
      this.tuneOut = null;
    }
    this.chordIndex = 0;
    const tune = mood === 'title' || !this.settings.nationalBgm ? undefined : tuneFor(this.nation);
    if (tune) {
      // The tune, scheduled a little ahead of the clock and looped with a breath between passes.
      const bpm = tune.bpm * (mood === 'battle' ? BATTLE_TEMPO : 1);
      const notes = timeline(tune.notes, bpm);
      const pass = tuneLength(tune.notes, bpm) + TUNE_GAP_S;
      const out = ctx.createGain();
      out.connect(bgm);
      this.tuneOut = out;
      this.tuneAt = ctx.currentTime + 0.2;
      let scheduledTo = this.tuneAt;
      const schedule = (): void => {
        const until = ctx.currentTime + LOOKAHEAD_S;
        while (scheduledTo < until) {
          const start = this.tuneAt;
          for (const n of notes) {
            const at = start + n.at;
            if (at < scheduledTo || at >= scheduledTo + pass) continue;
            if (n.freq !== null) this.brass(n.freq, n.duration * 0.9, at, out);
          }
          scheduledTo = start + pass;
          this.tuneAt = start + pass;
        }
      };
      schedule();
      this.musicTimer = setInterval(schedule, SCHEDULE_MS);
      return;
    }
    const chords = CHORDS[mood === 'battle' ? 'battle' : 'menu'];
    const playChord = (): void => {
      const chord = chords[this.chordIndex++ % chords.length];
      for (const f of chord) this.pad(f, CHORD_S + 1);
    };
    playChord();
    this.musicTimer = setInterval(playChord, CHORD_S * 1000);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Filtered noise with a sharp attack and exponential decay. */
  private burst(duration: number, cutoff: number, volume: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.sfx!);
    src.start(t);
    src.stop(t + duration);
  }

  /** A pitched hit that drops in pitch (the low "boom" of a gun or blast). */
  private thump(freq: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.sfx!);
    osc.start(t);
    osc.stop(t + duration);
  }

  /** A rising and falling tone (alarms, a plane going down, a falling bomb). */
  private siren(from: number, to: number, duration: number, volume: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.linearRampToValueAtTime(to, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.linearRampToValueAtTime(0.001, t + duration);
    osc.connect(filter).connect(g).connect(this.sfx!);
    osc.start(t);
    osc.stop(t + duration);
  }

  /** Engine drone that swells and fades (aircraft passing). */
  private drone(freq: number, duration: number, volume: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + duration * 0.4);
    g.gain.linearRampToValueAtTime(0.001, t + duration);
    osc.connect(filter).connect(g).connect(this.sfx!);
    osc.start(t);
    osc.stop(t + duration);
  }

  /** A short melody on the effects channel (the victory fanfare, the defeat jingle). */
  private phrase(notes: readonly string[], bpm: number, volume: number): void {
    const t0 = this.ctx!.currentTime;
    for (const n of timeline(notes, bpm)) if (n.freq !== null) this.brass(n.freq, n.duration * 0.9, t0 + n.at, this.sfx!, volume);
  }

  /** A brass-like note (sawtooth through a lowpass that opens on the attack) for the tunes. */
  private brass(freq: number, duration: number, at: number, out: AudioNode = this.bgm!, volume = 0.5): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 1.5, at);
    filter.frequency.linearRampToValueAtTime(freq * 4, at + 0.05);
    filter.frequency.linearRampToValueAtTime(freq * 2.5, at + Math.min(duration, 0.4));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.03);
    g.gain.setValueAtTime(volume * 0.8, at + Math.max(0.04, duration - 0.06));
    g.gain.linearRampToValueAtTime(0.001, at + duration);
    osc.connect(filter).connect(g).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** One soft, slowly swelling chord note for the music bed. */
  private pad(freq: number, duration: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.18, t + duration * 0.3);
      g.gain.linearRampToValueAtTime(0.001, t + duration);
      osc.connect(g).connect(this.bgm!);
      osc.start(t);
      osc.stop(t + duration);
    }
  }
}

export const audio = new AudioSystem();
