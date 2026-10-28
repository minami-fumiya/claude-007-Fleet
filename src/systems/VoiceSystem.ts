import { audio } from './AudioSystem';
import { channelGain } from './SettingsSystem';

/**
 * 声 (#106): narration and battle commentary through the browser's speech synthesis (Web Speech API, a Japanese
 * voice). A device without one (or with speech blocked) says nothing; the subtitles still show the words. Each kind
 * has its own volume and on / off (#105), and the global mute silences both.
 */

export type VoiceChannel = 'narration' | 'commentary';

class VoiceSystem {
  private voice: SpeechSynthesisVoice | null = null;
  private looked = false;
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
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      const v = this.japanese(synth);
      if (v) u.voice = v;
      const s = audio.settings;
      u.volume = channelGain(1, channel === 'narration' ? s.voice : s.commentary, s.muted);
      u.rate = channel === 'commentary' ? 1.25 : 1.05;
      synth.cancel();
      synth.speak(u);
      this.lastChannel = channel;
    } catch {
      // Speech unavailable: the subtitles carry the words.
    }
  }

  stop(): void {
    try {
      this.synth()?.cancel();
    } catch {
      // ignore
    }
  }

  private japanese(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
    if (!this.looked || !this.voice) {
      this.looked = true;
      this.voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ja')) ?? null;
    }
    return this.voice;
  }
}

export const voice = new VoiceSystem();
