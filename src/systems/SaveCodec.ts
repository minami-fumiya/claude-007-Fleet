import { ISave, parseSave } from '@/utils/ProgressStore';

/**
 * Save transfer codes (pure): the whole save (every nation, v2) as base64 JSON behind a prefix, so it survives copy
 * and paste between devices. Decoding validates before anything is applied; codes made from a v1 save still load
 * (they are migrated like a v1 save in storage).
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

export function encodeSave(save: ISave): string {
  return SAVE_PREFIX + toBase64(JSON.stringify(save));
}

/** The save in a code, or null if the code is not a valid save. */
export function decodeSave(code: string): ISave | null {
  const trimmed = code.replace(/\s+/g, '');
  if (!trimmed.startsWith(SAVE_PREFIX)) return null;
  try {
    const json = fromBase64(trimmed.slice(SAVE_PREFIX.length));
    const data: unknown = JSON.parse(json);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    return parseSave(json);
  } catch {
    return null;
  }
}
