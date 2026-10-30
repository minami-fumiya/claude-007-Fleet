import { describe, it, expect } from 'vitest';
import { emptyRecord, MEDALS, noteEnemies, noteTune, parseRecord } from '@/systems/RecordSystem';
import { bookState, collectionLabel, collectionRate, TABS } from '@/systems/EncyclopediaSystem';
import { pickVoice, phraseMood, shortVoiceName, speechPhrases, voiceScore } from '@/systems/SpeechStyle';
import { bombardLineup, GROUND_KINDS, GROUND_WEAPONS } from '@/systems/GroundSystem';
import { TUNES, tunesOf } from '@/systems/MusicScore';
import { medalContext } from '@/utils/MedalContext';
import { emptyNationProgress } from '@/utils/ProgressStore';
import special from '@/data/special.json';
import campaign from '@/data/campaign.json';

describe('図鑑 (#384 #387)', () => {
  it('notes every enemy met and counts the ships sunk by id', () => {
    let r = noteEnemies(emptyRecord(), [{ id: 'yamato', sunk: true }, { id: 'fubuki', sunk: false }, { id: 'fubuki', sunk: true }, { id: 'gw_usn_aa', sunk: false }]);
    r = noteEnemies(r, [{ id: 'yamato', sunk: true }]);
    expect(r.encountered).toEqual(['yamato', 'fubuki', 'gw_usn_aa']);
    expect(r.kills).toEqual({ yamato: 2, fubuki: 1 });
    // Kept through a save and back.
    const back = parseRecord(JSON.parse(JSON.stringify(r)));
    expect(back.encountered).toEqual(r.encountered);
    expect(back.kills).toEqual(r.kills);
    // A save from before 0.0.54 reads with empty lists.
    expect(parseRecord({}).encountered).toEqual([]);
    expect(parseRecord({ kills: { a: -1, b: 'x' } }).kills).toEqual({});
  });

  it('a ship is owned, met or unseen; the collection line shows the share', () => {
    expect(bookState('a', ['a'], ['a'])).toBe('owned');
    expect(bookState('b', ['a'], ['b'])).toBe('met');
    expect(bookState('c', ['a'], ['b'])).toBe('unseen');
    expect(collectionLabel('日本の艦艇', 12, 25)).toBe('日本の艦艇 12 / 25 (48%)');
    expect(collectionRate(99, 100)).toBe(99);
    expect(collectionRate(0, 0)).toBe(0);
    expect(TABS).toContain('music');
  });

  it('ships met count towards the book medal, with those owned', () => {
    const nations = { IJN: { ...emptyNationProgress(['nagato', 'mutsu']) } };
    expect(medalContext({ nations, record: { encountered: ['nagato', 'iowa', 'gw_usn_aa'] } }).shipsKnown).toBe(3);
  });
});

describe('地上兵器の種類 (#384)', () => {
  it('eleven kinds a navy, the new ones among them', () => {
    expect(Object.keys(GROUND_KINDS)).toHaveLength(11);
    expect(GROUND_WEAPONS).toHaveLength(77);
    expect(GROUND_WEAPONS.find((g) => g.id === 'gw_ijn_seaplane_base')?.airWing).toBeDefined();
  });

  it('the islands field every kind somewhere across the areas', () => {
    const seen = new Set<string>();
    for (const a of campaign.areas) for (const depth of [1, 9]) for (const id of bombardLineup(special.bombardLayout, a.id, 'IJN', depth)) seen.add(id);
    for (const kind of Object.keys(GROUND_KINDS)) expect(seen.has(`gw_ijn_${kind}`), kind).toBe(true);
  });
});

describe('音楽室 (#383)', () => {
  it('lists a navy’s tunes, then the shared themes; notes each tune once', () => {
    const ijn = tunesOf('IJN');
    expect(ijn.map((t) => t.role)).toEqual(['home', 'map', 'battle', 'night', 'crisis', 'boss']);
    const r = noteTune(noteTune(emptyRecord(), 'ijn'), 'ijn');
    expect(r.tunesHeard).toEqual(['ijn']);
    expect(noteTune(r, 'ijn')).toBe(r);
  });

  it('the music room medal asks for every tune at its top', () => {
    const top = MEDALS.find((m) => m.id === 'music_room_3');
    expect(top?.goal).toBe(TUNES.length);
    expect(top?.value({ ...emptyRecord(), tunesHeard: TUNES.map((t) => t.id) }, { clearedTheaters: [] })).toBe(TUNES.length);
  });
});

describe('声の抑揚 (#383)', () => {
  it('splits a line into phrases with their own rate and pitch', () => {
    const p = speechPhrases('敵艦隊見ゆ。全艦、戦闘配置につけ！', 'narration');
    expect(p.map((x) => x.text)).toEqual(['敵艦隊見ゆ。', '全艦、戦闘配置につけ！']);
    expect(p[1].rate).toBeGreaterThan(1.05);
    const grave = speechPhrases('駆逐艦が沈没しました。', 'narration')[0];
    expect(grave.pitch).toBeLessThan(1);
    expect(grave.rate).toBeLessThan(1.05);
    expect(phraseMood('補給を終えました')).toBe('calm');
    expect(speechPhrases('', 'commentary')).toEqual([]);
  });

  it('prefers the natural voices, or the one the settings name', () => {
    const voices = [
      { name: 'Kyoko', lang: 'ja-JP' }, { name: 'Microsoft Nanami Online (Natural) - Japanese (Japan)', lang: 'ja-JP' }, { name: 'Samantha', lang: 'en-US' },
    ];
    expect(pickVoice(voices)?.name).toContain('Nanami');
    expect(pickVoice(voices, 'Kyoko')?.name).toBe('Kyoko');
    expect(pickVoice(voices, 'Gone')?.name).toContain('Nanami');
    expect(pickVoice([{ name: 'Samantha', lang: 'en-US' }])).toBeNull();
    expect(voiceScore({ name: 'Samantha', lang: 'en-US' })).toBe(-1);
    expect(shortVoiceName('Microsoft Nanami Online (Natural) - Japanese (Japan)')).toBe('Nanami Online');
  });
});
