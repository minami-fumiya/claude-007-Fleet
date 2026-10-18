import { Nation } from '@/types/Nation';

export interface INationInfo {
  /** Cache key of the nation's ship JSON (see PreloadScene) */
  dataKey: string;
  short: string;
  /** Japanese navy name shown in headers */
  ja: string;
  /** Short Japanese country name for tabs and chips (国名は日本語で表示する: #21) */
  jaShort: string;
  en: string;
}

/** Playable nations, in the order the Fleet Builder tabs show them. */
export const PLAYABLE_NATIONS: Nation[] = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN];

export const NATION_INFO: Record<Nation, INationInfo> = {
  [Nation.IJN]: { dataKey: 'ijn', short: 'IJN', ja: '帝国海軍', jaShort: '日本', en: 'IMPERIAL JAPANESE NAVY' },
  [Nation.USN]: { dataKey: 'usn', short: 'USN', ja: '米国海軍', jaShort: '米国', en: 'UNITED STATES NAVY' },
  [Nation.KM]: { dataKey: 'km', short: 'KM', ja: 'ドイツ海軍', jaShort: 'ドイツ', en: 'KRIEGSMARINE' },
  [Nation.RN]: { dataKey: 'rn', short: 'RN', ja: '英国海軍', jaShort: '英国', en: 'ROYAL NAVY' },
};
