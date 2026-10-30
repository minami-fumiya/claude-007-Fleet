import { audio } from './AudioSystem';
import { channelGain } from './SettingsSystem';
import { pickVoice, speechPhrases } from './SpeechStyle';

/**
 * 声 (#106): narration and battle commentary through the browser's speech synthesis (Web Speech API, a Japanese
 * voice). A device without one (or with speech blocked) says nothing; the subtitles still show the words. Each kind
 * has its own volume and on / off (#105), and the global mute silences both.
 */

export type VoiceChannel = 'narration' | 'commentary';

class VoiceSystem {
  private voice: SpeechSynthesisVoice | null = null;
  private looked = false;
  /** The settings' voice the lookup was made for */
  private chosen = '';
  /** The channel last spoken: battle calls don't cut the narration off, they wait for it (subtitles still show) */
  private lastChannel: VoiceChannel | null = null;

  private synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  /** Whether the channel would speak now (the subtitles follow their own setting). */
  enabled(channel: VoiceChannel): boolean {
    const s = audio.settings;
    return !s.muted && (channel === 'narration' ? s.voiceOn && s.voice > 0 : s.commentaryOn && s.commentary > 0);
  }

  /** Says `text` on a channel; a new line cuts the old one off rather than queueing behind it. */
  say(text: string, channel: VoiceChannel): void {
    const synth = this.synth();
    if (!synth || !text || !this.enabled(channel)) return;
    if (channel === 'commentary' && this.lastChannel === 'narration' && synth.speaking) return;
    try {
      // 抑揚 (#383): one utterance a phrase, each with its own rate and pitch, queued so they follow on.
      const v = this.japanese(synth);
      const s = audio.settings;
      const volume = channelGain(1, channel === 'narration' ? s.voice : s.commentary, s.muted);
      synth.cancel();
      for (const p of speechPhrases(text, channel)) {
        const u = new SpeechSynthesisUtterance(p.text);
        u.lang = 'ja-JP';
        if (v) u.voice = v;
        u.volume = volume;
        u.rate = p.rate;
        u.pitch = p.pitch;
        synth.speak(u);
      }
      this.lastChannel = channel;
    } catch {
      // Speech unavailable: the subtitles carry the words.
    }
  }

  /** The device's Japanese voices, most natural first (#383: the settings pick one). */
  voices(): string[] {
    const synth = this.synth();
    if (!synth) return [];
    try {
      return synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ja')).map((v) => v.name);
    } catch {
      return [];
    }
  }

  stop(): void {
    try {
      this.synth()?.cancel();
    } catch {
      // ignore
    }
  }

  /** The voice the settings name, else the most natural Japanese one (#383); looked up again when the choice changes. */
  private japanese(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
    const want = audio.settings.voiceName;
    if (!this.looked || !this.voice || this.chosen !== want) {
      this.looked = true;
      this.chosen = want;
      this.voice = pickVoice(synth.getVoices(), want);
    }
    return this.voice;
  }
}

export const voice = new VoiceSystem();
