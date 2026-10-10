# Claude Code への引き継ぎ（このフォルダを開いた状態で、下の文章をそのまま貼る）

```
このフォルダは、解説動画「絵のなかを、キャラが歩くまで（背景の絵 + VRM + ARDY）」の方法を
手順・計算スクリプト・動画の数値メモにまとめたものです。SKILL.md を最初に読んでください。
目的: 私のPCで、一枚絵の背景の中をVRMキャラがARDYの動きで歩く素材を作れる状態にすること。

最初にやること（順番に。各段階で私に結果を見せて、次へ進む前に確認を取る）:
1. `sh scripts/selftest.sh` を実行して、計算スクリプトが私の環境で動くか確認する
   （numpy・scipy・Pillow が無ければ入れる）。
2. `nvidia-smi` で私のGPUとVRAMを確認し、結果を教えて。NVIDIA GPUが無い／VRAMが少ない場合は、
   ARDYを入れる前に止まって相談する（勝手に進めない）。
3. GPUがあれば https://github.com/nv-tlabs/ardy を別フォルダにcloneして、READMEの手順で導入する。
   Meta-Llama-3-8B-Instruct はHugging Faceで私の利用申請が必要なので、承認の状況を私に確認する。
   トークンやパスワードは私が入力する。あなたは聞かず・保存せず・ファイルに書かない。
4. `python scripts/generate.py "A person walks forward." --model core --duration 5 --seed 0 --output walk`
   で動きを1本作り、`python scripts/foot_correct.py inspect outputs/walk.npz` で
   キー名・fps・足の接地の形式を確認する。
5. 骨格の関節番号（左右の hip / knee / ankle / toe）を npz とARDYのコードから調べて map.json を作り、
   `foot_correct.py flatten` を実行して、直す前後のつま先の角度を比べて報告する。

守ること:
- SKILL.md の「未確認」に書いてあることは、推測で埋めずに、確認できた事実だけ報告する。
- 私の元の絵・動き・VRMファイルは上書きしない（出力は別名で保存）。
- 動かない・合わないものがあれば、うまくいったふりをせず、そのまま報告する。
```

## 補足
- スキルとして使う場合は、このフォルダ全体を `~/.claude/skills/picture-walk-vrm-ardy/`
  （Windowsは `C:\Users\<ユーザー名>\.claude\skills\picture-walk-vrm-ardy\`）に置く。
- `references/video-notes.md` に、動画から読み取った数値と、検算の結果（合った／合わなかった）が入っている。
