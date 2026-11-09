import { describe, expect, it } from 'vitest';
import { EXPORT_EVERY_SORTIES, exportDue, exported, lastExportText, NO_EXPORT, parseExportState } from '@/utils/ExportReminder';

describe('0.0.71 セーブの書き出し (#116)', () => {
  it('asks once a player has played a while without ever writing the save out', () => {
    expect(exportDue(NO_EXPORT, EXPORT_EVERY_SORTIES - 1, '0.0.71-alpha')).toBeNull();
    expect(exportDue(NO_EXPORT, EXPORT_EVERY_SORTIES, '0.0.71-alpha')).toBe('never');
  });

  it('asks again after ten more sorties, or on a new version', () => {
    const s = exported(1000, 40, '0.0.71-alpha');
    expect(exportDue(s, 45, '0.0.71-alpha')).toBeNull();
    expect(exportDue(s, 40 + EXPORT_EVERY_SORTIES, '0.0.71-alpha')).toBe('sorties');
    expect(exportDue(s, 41, '0.0.72-alpha')).toBe('version');
  });

  it('reads a broken record as never written out', () => {
    expect(parseExportState(null)).toEqual(NO_EXPORT);
    expect(parseExportState('{oops')).toEqual(NO_EXPORT);
    expect(parseExportState('{"lastAt":"x","sorties":-3,"version":7}')).toEqual(NO_EXPORT);
    expect(parseExportState(JSON.stringify(exported(5, 6, 'v')))).toEqual({ lastAt: 5, sorties: 6, version: 'v' });
  });

  it('says when it was last written out', () => {
    expect(lastExportText(NO_EXPORT)).toBe('まだ書き出していません');
    expect(lastExportText(exported(Date.UTC(2026, 10, 9, 0, 5), 0, ''))).toMatch(/^2026\/11\/09 \d\d:05$/);
  });
});
