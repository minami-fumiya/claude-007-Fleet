import { distanceGain, SoundKind, SoundThrottle } from './SoundRules';
import { channelGain, ISettings, parseSettings } from './SettingsSystem';

/**
 * Synthesised sound (WebAudio): no audio files, every effect and the background music are built from
 * oscillators and filtered noise. One instance for the whole page; it starts silent until the first
 * user gesture unlocks the AudioContext, and remembers the volume / mute settings in localStorage.
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

type AudioCtor = typeof AudioContext;

class AudioSystem {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private bgm: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private throttle = new SoundThrottle();
  private mood: 'menu' | 'battle' | null = null;
  private chordTimer: ReturnType<typeof setInterval> | null = null;
  private chordIndex = 0;
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
      if (this.mood) this.startMusic(this.mood);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  /** Changes and saves settings, applying them to the playing sound. */
  update(patch: Partial<ISettings>): void {
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
  }

  private sfxGain(): number {
    return channelGain(SFX_VOLUME, this.settings.sfx, this.settings.muted);
  }

  private bgmGain(): number {
    return channelGain(BGM_VOLUME, this.settings.bgm, this.settings.muted);
  }

  /** Plays an effect; `distance` from the listener (camera centre) attenuates it. */
  play(kind: SoundKind, distance = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted) return;
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
    }
  }

  /** Starts (or switches) the background music with a fade. */
  music(mood: 'menu' | 'battle'): void {
    if (this.mood === mood) return;
    this.mood = mood;
    if (this.ctx) this.startMusic(mood);
  }

  private startMusic(mood: 'menu' | 'battle'): void {
    const ctx = this.ctx!;
    const bgm = this.bgm!;
    bgm.gain.cancelScheduledValues(ctx.currentTime);
    bgm.gain.setTargetAtTime(this.bgmGain(), ctx.currentTime, BGM_FADE_S / 3);
    if (this.chordTimer) clearInterval(this.chordTimer);
    this.chordIndex = 0;
    const playChord = (): void => {
      const chord = CHORDS[mood][this.chordIndex++ % CHORDS[mood].length];
      for (const f of chord) this.pad(f, CHORD_S + 1);
    };
    playChord();
    this.chordTimer = setInterval(playChord, CHORD_S * 1000);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Filtered noise with a sharp attack and exponential decay. */
  private burst(duration: number, cutoff: number, volume: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.sfx!);
    src.start(t);
    src.stop(t + duration);
  }

  /** A pitched hit that drops in pitch (the low "boom" of a gun or blast). */
  private thump(freq: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.sfx!);
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
