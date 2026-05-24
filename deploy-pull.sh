#!/bin/bash
# 涓€閿媺浠ｇ爜 + 閮ㄧ讲 (鑷姩闀滃儚鍥為€€)
# 鐢ㄦ硶: bash deploy-pull.sh
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

ORIGIN_URL="https://github.com/1505194659/palace-intrigue-game.git"
MIRRORS=(
  "$ORIGIN_URL"
  "https://gitclone.com/github.com/1505194659/palace-intrigue-game.git"
  "https://kkgithub.com/1505194659/palace-intrigue-game.git"
  "https://hub.gitmirror.com/https://github.com/1505194659/palace-intrigue-game.git"
)

# 淇濈暀鏈湴鏈彁浜ゆ敼鍔?(config.json 涓嶄細琚?stash, 鍦?.gitignore)
echo "[pull] stash 鏈湴淇敼 (濡傛湁)"
git stash push -u -m "auto-stash-$(date +%s)" 2>/dev/null || true

PULLED=0
for url in "${MIRRORS[@]}"; do
  echo "[pull] 灏濊瘯: $url"
  git remote set-url origin "$url"
  if timeout 60 git pull --rebase origin main; then
    echo "[pull] OK  via $url"
    PULLED=1
    break
  else
    echo "[pull] FAIL via $url"
  fi
done

# 鎷夊畬鍚庡垏鍥炰富婧? 鏂逛究鎵嬪姩鎿嶄綔
git remote set-url origin "$ORIGIN_URL"

# 鎭㈠ stash (濡傛湁)
git stash pop 2>/dev/null || true

if [ "$PULLED" -ne 1 ]; then
  echo "鉁?鎵€鏈夐暅鍍忓潎澶辫触, 璇锋鏌ョ綉缁?
  exit 1
fi

bash "$PROJECT_DIR/deploy.sh"