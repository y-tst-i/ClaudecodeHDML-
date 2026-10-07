#!/usr/bin/env bash
# Codex CLI（ChatGPT ログイン）の画像生成で素材を作り、指定フォルダに PNG で保存する。
#
#   codex-images.sh login                         … ログイン状態を確認し、未ログインならデバイス認証を始める
#   codex-images.sh generate <出力フォルダ> <依頼文ファイル> [参考画像 ...]
#
# 依頼文ファイルには「どんな画像を・どのファイル名で」作るかを書く（ファイル名は英数字の .png）。
# 参考画像（キャラの設定画など）を渡すと、それを見ながら描かせる。
set -euo pipefail

ensure_codex() {
  if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI を入れています…" >&2
    npm install -g @openai/codex >/dev/null 2>&1
  fi
}

logged_in() {
  codex login status 2>&1 | grep -qi "logged in using"
}

case "${1:-}" in
  login)
    ensure_codex
    if logged_in; then
      echo "LOGGED_IN"
      exit 0
    fi
    log="${TMPDIR:-/tmp}/codex-login.log"
    # デバイス認証：表示される URL を開いてコードを入れると完了する（15分有効）
    nohup codex login --device-auth >"$log" 2>&1 </dev/null &
    echo "LOGIN_PID=$!"
    for _ in $(seq 1 20); do
      if grep -q "auth.openai.com" "$log" 2>/dev/null && grep -qE "[A-Z0-9]{4}-[A-Z0-9]{4,}" "$log"; then break; fi
      sleep 1
    done
    sed -e 's/\x1b\[[0-9;]*m//g' "$log"
    echo "LOGIN_LOG=$log"
    ;;
  generate)
    out="${2:?出力フォルダを指定してください}"
    prompt="${3:?依頼文ファイルを指定してください}"
    shift 3
    ensure_codex
    if ! logged_in; then
      echo "NOT_LOGGED_IN: 先に「$0 login」でログインしてください" >&2
      exit 3
    fi
    mkdir -p "$out"
    out="$(cd "$out" && pwd)"
    refs=()
    for img in "$@"; do refs+=(-i "$(cd "$(dirname "$img")" && pwd)/$(basename "$img")"); done
    {
      cat "$prompt"
      cat <<'RULES'

---
# 画像の作り方（必ず守る）
- 画像生成ツール（image generation）を使い、依頼された画像を **1枚ずつ** 生成する
- 生成した画像は、**今の作業フォルダの直下** に、指定どおりのファイル名（英数字）で PNG として保存する
- 背景を透明にするよう指定された画像は透明にする。できない場合は真っ白な無地の背景にする
- 添付の参考画像があれば、その人物・キャラ・画風・配色に合わせる
- コードを書いたり、ほかのファイルを作ったりしない。最後に、保存したファイル名の一覧だけを書く
RULES
    } | codex exec --skip-git-repo-check --sandbox workspace-write -C "$out" ${refs[@]+"${refs[@]}"} -
    echo "---- 作った画像 ----"
    find "$out" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.webp' \) -newer "$prompt" -printf '%f\t%s bytes\n' | sort
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac
