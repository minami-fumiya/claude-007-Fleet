import Phaser from 'phaser';
import { addRuby, rubyDict, rubyMatcher } from '@/systems/RubySystem';
import type { RubyLevel } from '@/systems/SettingsSystem';

/**
 * ふりがな (#94): every text the game draws gets its readings on the way in, so no screen needs to know. Installed once
 * at start-up; 「なし」 leaves Phaser as it is.
 */
/** Phaser's own setText, kept for button labels: a reading would shrink a short label to unreadable size. */
let rawSetText: ((this: Phaser.GameObjects.Text, value: string | string[]) => Phaser.GameObjects.Text) | null = null;

/** Sets text without readings (button labels), whether or not ruby is on. */
export function plainText(t: Phaser.GameObjects.Text, value: string): Phaser.GameObjects.Text {
  return rawSetText ? rawSetText.call(t, value) : t.setText(value);
}

export function installRuby(level: RubyLevel): void {
  const dict = rubyDict(level);
  const matcher = rubyMatcher(dict);
  if (!matcher) return;
  const proto = Phaser.GameObjects.Text.prototype;
  const setText = proto.setText;
  rawSetText = setText;
  proto.setText = function (this: Phaser.GameObjects.Text, value: string | string[]) {
    const v = Array.isArray(value) ? value.map((l) => addRuby(String(l), dict, matcher)) : typeof value === 'string' ? addRuby(value, dict, matcher) : value;
    return setText.call(this, v);
  };
}
