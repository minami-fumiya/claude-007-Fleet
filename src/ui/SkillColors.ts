import { CaptainSkill } from '@/types/Captain';

/** One colour per captain skill (#130), so a skill's chip and the bonus lines it adds match. */
export const SKILL_COLOR: Record<CaptainSkill, { color: number; css: string }> = {
  [CaptainSkill.Gunnery]: { color: 0xff9f43, css: '#ff9f43' },
  [CaptainSkill.Torpedo]: { color: 0x4f8cff, css: '#4f8cff' },
  [CaptainSkill.Engineering]: { color: 0xff6b6b, css: '#ff6b6b' },
  [CaptainSkill.Aviation]: { color: 0x5df2b0, css: '#5df2b0' },
  [CaptainSkill.AntiAir]: { color: 0x9be36b, css: '#9be36b' },
  [CaptainSkill.ASW]: { color: 0x61e7ff, css: '#61e7ff' },
  [CaptainSkill.Night]: { color: 0xb18cff, css: '#b18cff' },
  [CaptainSkill.Recon]: { color: 0xffe066, css: '#ffe066' },
  [CaptainSkill.Damecon]: { color: 0xff8fc7, css: '#ff8fc7' },
};

/** Abilities (#131) and traits have their own colours. */
export const ABILITY_COLOR = { color: 0xc8d6ee, css: '#c8d6ee' };
export const TRAIT_COLOR = { color: 0xffc94a, css: '#ffc94a' };
