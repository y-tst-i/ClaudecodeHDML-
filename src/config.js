// 作品全体の「定数」。ここを変えると映像もWebも同時に変わる。
export const CONFIG = {
  width: 1280,
  height: 720,
  fps: 30,
  bpm: 128,
  duration: 15, // 秒
  theme: '#FF481B', // テーマカラー（ポスター世界の色）
  ink: '#0B0B0C',
  paper: '#F4F1EA',
  seed: 20260101, // 乱数の種。同じ種なら毎回まったく同じ映像になる
};

export const BEAT = 60 / CONFIG.bpm;
