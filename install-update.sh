#!/bin/bash
# 不依赖 git 的部署: 多镜像下载 zip + rsync 同步 + deploy.sh
# 用法: bash install-update.sh
set -e

TARGET="${TARGET:-/www/wwwroot/palace-intrigue-game}"
TMP="/tmp/palace-update-$$"
mkdir -p "$TMP"
cd "$TMP"

MIRRORS=(
  "https://kkgithub.com/1505194659/palace-intrigue-game/archive/refs/heads/main.zip"
  "https://hub.gitmirror.com/https://github.com/1505194659/palace-intrigue-game/archive/refs/heads/main.zip"
  "https://gh-proxy.com/https://github.com/1505194659/palace-intrigue-game/archive/refs/heads/main.zip"
  "https://gh.llkk.cc/https://github.com/1505194659/palace-intrigue-game/archive/refs/heads/main.zip"
  "https://github.com/1505194659/palace-intrigue-game/archive/refs/heads/main.zip"
)

OK=0
for u in "${MIRRORS[@]}"; do
  echo "[zip] try: $u"
  if curl -L --connect-timeout 15 --max-time 90 -o main.zip "$u" 2>/dev/null; then
    SZ=$(stat -c%s main.zip 2>/dev/null || stat -f%z main.zip)
    if [ "$SZ" -gt 200000 ]; then
      echo "[zip] OK ($SZ bytes) from $u"
      OK=1
      break
    fi
  fi
  rm -f main.zip
done

if [ "$OK" -ne 1 ]; then
  echo "[zip] all mirrors failed"
  rm -rf "$TMP"
  exit 1
fi

unzip -q -o main.zip
SRC="$TMP/palace-intrigue-game-main"
[ -d "$SRC" ] || { echo "解压后找不到目录 $SRC"; exit 1; }

# 同步到 TARGET, 保留运行时 config.json / .git / node_modules
echo "[rsync] $SRC/ -> $TARGET/"
mkdir -p "$TARGET"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='config.json' \
  --exclude='package-lock.json' \
  "$SRC/" "$TARGET/"

cd "$TARGET"
echo "[deploy] bash deploy.sh"
bash deploy.sh

echo "[clean] $TMP"
rm -rf "$TMP"

echo
echo "==== 版本自检 ===="
grep -q "display:block !important" public/index.html && echo "  ✓ 卡片铺满  (v3.7.1+)" || echo "  ✗ 卡片铺满  缺"
grep -q "portraits/default.jpg" public/portraits.js  && echo "  ✓ 立绘压缩  (v3.8+)"   || echo "  ✗ 立绘压缩  缺"
grep -q "rematchClassId" server.js                   && echo "  ✓ 再战修复  (v3.9+)"   || echo "  ✗ 再战修复  缺"