/**
 * Save backups (pure). Before a stored save is migrated to a new format, replaced by an import or reset, or found
 * unreadable, its raw text is kept here so a release can never lose a player's progress for good: 設定 lists the
 * backups and restores one. The newest MAX_BACKUPS are kept.
 */

export const BACKUP_KEY = 'ww2fleet.progress.backups';
export const MAX_BACKUPS = 5;

export type BackupReason = 'migration' | 'broken' | 'import' | 'reset' | 'restore';

export interface ISaveBackup {
  /** Epoch ms the backup was taken */
  at: number;
  /** Save version of the raw text (0 = unknown / unreadable) */
  version: number;
  reason: BackupReason;
  /** The stored save exactly as it was */
  raw: string;
}

export const BACKUP_REASON_LABEL: Record<BackupReason, string> = {
  migration: '更新前',
  broken: '読み込めなかったデータ',
  import: 'セーブコード読み込み前',
  reset: 'リセット前',
  restore: '復元前',
};

/** Tolerant parse of the stored list (anything malformed is dropped). */
export function parseBackups(raw: string | null): ISaveBackup[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((b): b is ISaveBackup =>
      typeof b === 'object' && b !== null && typeof b.at === 'number' && typeof b.version === 'number'
      && typeof b.reason === 'string' && b.reason in BACKUP_REASON_LABEL && typeof b.raw === 'string');
  } catch {
    return [];
  }
}

/** Adds a backup (newest first), skipping one identical to the newest, and keeps at most `max`. */
export function addBackup(list: ISaveBackup[], backup: ISaveBackup, max = MAX_BACKUPS): ISaveBackup[] {
  if (list[0]?.raw === backup.raw) return list;
  return [backup, ...list].slice(0, max);
}

/** The version a raw stored save claims (1 for a pre-v2 flat save, 0 when unreadable). */
export function rawVersion(raw: string): number {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return 0;
    const v = (data as Record<string, unknown>).version;
    return typeof v === 'number' && Number.isFinite(v) ? v : 1;
  } catch {
    return 0;
  }
}

/** "2026/10/18 14:05 · v4 · 更新前" */
export function backupLabel(b: ISaveBackup): string {
  const d = new Date(b.at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const when = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${when} · v${b.version || '?'} · ${BACKUP_REASON_LABEL[b.reason]}`;
}
