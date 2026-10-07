// MAKO CITY の世界観トークン。映像・サイトで共有する。
export const CONFIG = {
  width: 1280,
  height: 720,
  fps: 30,
  bpm: 140,
  duration: 15,
  seed: 1997,
  mako: '#3dffa0', // 魔晄の緑
  night: '#020806',
  paper: '#f2f0ea',
  ink: '#07090a',
  // 宝珠の5色（緑・赤・黄・青・紫）と、その世界の言葉
  orbs: [
    { color: '#3dff8a', word: 'MAGIC' },
    { color: '#ff3b2f', word: 'SUMMON' },
    { color: '#ffd23a', word: 'COMMAND' },
    { color: '#3a8bff', word: 'SUPPORT' },
    { color: '#b05cff', word: 'INDEPENDENT' },
  ],
  // PS1 → HD に切り替わる時刻（C02 のダイブ中、ビート頭）
  hdAt: 4.29,
};
export const BEAT = 60 / CONFIG.bpm;
