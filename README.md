# Code Showreel Starter

FunTech の「Claude Code × three.js でショーリール → 体験型サイト」のワークフローを、
**自分の手で一周するための最小キット**です。素材ゼロ・コードだけで 15 秒の映像が出ます。

![cuts](docs/cuts/C02_out.png)

## 使い方

```bash
npm install
npm run dev                 # http://localhost:5173/              … 映像（ループ再生）
                            # http://localhost:5173/?mode=experience … 体験型サイト
npm run render              # out/showreel.mp4 を書き出し（ffmpeg が必要）
npm run cuts                # docs/CUTSHEET.md（はじめ/おわり画像つきカット表）を生成
npm run probe -- 2.5 5 12   # 指定秒のフレームだけ out/probe/sheet.png に並べて確認
```

| 映像とWebで共有しているもの | ファイル |
|---|---|
| 時間割（絵コンテ）・ステッカー転換 | `src/timeline.js` |
| シーン（質感切替 / 美術館 / ガラス破砕） | `src/scenes/` |
| 遷移アクション（クリック・ドラッグで進む） | `src/experience.js` |
| カット表のデータとFB欄 | `src/cuts.js` → `docs/CUTSHEET.md` |

学び方は [docs/LEARNING.md](docs/LEARNING.md) を見てください。
