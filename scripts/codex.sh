#!/usr/bin/env bash
# Codex への分業はすべてこれを通す（モデルと推論の深さは監督（ユーザー）が決めたもの。勝手に変えない）
#   scripts/codex.sh code   [codex exec の引数...] < 指示.md   … コードの部品を書かせる（gpt-6.1-sol / high）
#   scripts/codex.sh review [codex exec の引数...] < 指示.md   … 批評させる（gpt-6.1-sol / medium）
#   画像生成は .claude/skills/codex-images/codex-images.sh（同じく gpt-6.1-sol / medium）
set -euo pipefail
MODEL="gpt-6.1-sol"
role="${1:?code か review を指定}"; shift
case "$role" in
  code) effort=high ;;
  review) effort=medium ;;
  *) echo "role は code / review" >&2; exit 1 ;;
esac
echo "[codex] model=$MODEL effort=$effort role=$role" >&2
exec codex exec -m "$MODEL" -c model_reasoning_effort="\"$effort\"" --skip-git-repo-check "$@" -
