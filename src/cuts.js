// カット表のデータ。`npm run cuts` で docs/CUTSHEET.md と はじめ/おわり の画像が生成される。
// fb にフィードバックを書いて Claude Code に「カット表のFBを反映して」と頼む、を繰り返す。
export const CUTS = [
  { id: 'C01', start: 0.0, end: 1.2, motion: 'オブジェクトが奥から弾けるように登場', web: '—', fb: '' },
  { id: 'C02', start: 1.2, end: 4.5, motion: 'ビートごとにクローム/ワイヤー/トゥーン/赤リムへ質感が切り替わる。奥にCODE/ONLY/MOTION', web: '3回クリック', fb: '' },
  { id: 'C03', start: 4.5, end: 5.6, motion: 'ステッカーが画面を覆い、剥がれると美術館', web: '—', fb: '' },
  { id: 'C04', start: 5.6, end: 9.4, motion: '素材の図鑑。像ごとに画角を変え ease-in-out で巡る', web: 'ドラッグで歩く', fb: '' },
  { id: 'C05', start: 9.4, end: 11.4, motion: 'ステッカー転換 → テーマカラーのポスター', web: 'クリックで割る', fb: '' },
  { id: 'C06', start: 11.4, end: 15.0, motion: 'ポスターが割れて破片が飛散、白地にロゴ', web: 'Replay', fb: '' },
];
