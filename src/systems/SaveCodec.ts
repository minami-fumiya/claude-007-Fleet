import { IProgress, parseProgress } from '@/utils/ProgressStore';

/**
 * Save transfer codes (pure): progress as base64 JSON behind a version prefix, so it survives copy and
 * paste between devices. Decoding validates before anything is applied.
 */

export const SAVE_PREFIX = 'WW2F1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(code: string): string {
  const bin = atob(code);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeSave(progress: IProgress): string {
  return SAVE_PREFIX + toBase64(JSON.stringify(progress));
}

/** The progress in a save code, or null if the code is not a valid save. */
export function decodeSave(code: string): IProgress | null {
  const trimmed = code.replace(/\s+/g, '');
  if (!trimmed.startsWith(SAVE_PREFIX)) return null;
  try {
    const json = fromBase64(trimmed.slice(SAVE_PREFIX.length));
    const data: unknown = JSON.parse(json);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    return parseProgress(json);
  } catch {
    return null;
  }
}
