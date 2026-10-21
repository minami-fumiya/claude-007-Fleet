import { describe, it, expect } from 'vitest';
import { pushRecent, RECENT_MAX, shipSearchNames, suggest } from '@/utils/SearchHistory';

describe('the name search box (#308)', () => {
  it('keeps the last few searches, newest first, without repeats', () => {
    let r: string[] = [];
    for (const q of ['金剛', '大和', ' 金剛 ', '', '長門', '陸奥', '扶桑', '山城']) r = pushRecent(r, q);
    expect(r).toEqual(['山城', '扶桑', '陸奥', '長門', '金剛'].slice(0, RECENT_MAX));
  });

  it('suggests names starting with the text first, then those containing it', () => {
    const names = ['大和', '武蔵', 'Yamato', '大淀', '朝潮', '大潮'];
    expect(suggest(names, '大')).toEqual(['大和', '大淀', '大潮']);
    expect(suggest(names, '潮')).toEqual(['朝潮', '大潮']);
    expect(suggest(names, 'yam')).toEqual(['Yamato']);
    expect(suggest(names, '  ')).toEqual([]);
    expect(suggest(names, '大', 2)).toHaveLength(2);
  });

  it('a ship is found by its Japanese and its English name', () => {
    expect(shipSearchNames([{ name: '金剛 (Kongo)' }, { name: 'Z23' }, { name: '金剛 (Kongo)' }])).toEqual(['金剛', 'Kongo', 'Z23']);
  });
});
