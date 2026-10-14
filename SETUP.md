# 手元のPCで動かす手順

## 1. 最初の1回だけ入れるもの
- Node.js（v20 以上）
- Git
- ffmpeg（映像・音の書き出しに使う）
- Claude Code
- Codex（使うときだけ）：`npm i -g @openai/codex` → `codex login`

## 2. コピーして準備
```bash
git clone https://github.com/y-tst-i/ClaudecodeHDML-.git
cd ClaudecodeHDML-
npm install
npx playwright install chromium   # 撮影・テスト用のブラウザ
```

## 3. 使う
| やりたいこと | コマンド |
|---|---|
| Claude Code で続きを作る | このフォルダで `claude`（スキルとルールは自動で読み込まれる） |
| サイトを見る | `npx vite` → `http://localhost:5173/yohi/site.html` |
| 1ファイルのHTMLに書き出す | `npx vite build --config yohi/vite.site.config.js` → `out/yohi-site/site.html` |
| 通しテスト | `node scripts/smoke-yohi-site.mjs` |
| 効果音を作り直す | `node yohi/audio/build.mjs --sfx` |

## 4. 最新を取り込む
クラウドや別のPCで作業した後は、手元で `git pull` するだけ。

## 5. 道具（スキル）の場所
- `.claude/skills/code-craft/`：コードで絵を作り、撮って確認し、直す制作ループ
- `.claude/skills/codex-images/`：Codex に素材画像を作らせる
- ほかのフォルダでも使いたいときは、この2つを `~/.claude/skills/` にコピーする
- スキルは今はこのリポジトリで育てる。別の作品を本格的に始めるときに、道具箱として分ける
