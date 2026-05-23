#!/bin/bash
# 后宫风云 - 一键部署脚本
# 用法（首次部署后）：
#   cd /www/wwwroot/palace-intrigue-game && git pull && bash deploy.sh
#
# 自动处理：依赖安装、跑游戏逻辑测试、PM2 进程不存在则自动创建

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="palace-game"
PORT="${PORT:-3000}"

cd "$PROJECT_DIR"

echo "============================================================"
echo "  后宫风云 一键部署"
echo "  项目目录: $PROJECT_DIR"
echo "============================================================"

echo ""
echo "[1/7] 验证关键文件 ..."
for f in game.js server.js public/index.html package.json; do
  if [ ! -f "$f" ]; then
    echo "  X 缺少 $f"
    exit 1
  fi
done
echo "  OK 关键文件齐全"

VERSION=$(grep -oE 'v[0-9]+\.[0-9]+' public/index.html | head -1)
echo "  -> 当前前端版本: $VERSION"

echo ""
echo "[2/7] 安装/更新依赖 ..."
npm install --production --registry=https://registry.npmmirror.com --silent 2>&1 | tail -5

echo ""
echo "[3/7] 跑游戏逻辑测试 ..."
if [ -f test-game.js ]; then
  if node test-game.js > /tmp/palace-test.log 2>&1; then
    tail -3 /tmp/palace-test.log
    echo "  OK 测试通过"
  else
    echo "  X 测试失败，部署中止！"
    tail -25 /tmp/palace-test.log
    exit 1
  fi
else
  echo "  WARN test-game.js 不存在，跳过"
fi

echo ""
echo "[4/7] 启动/重启 PM2 进程 ..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  echo "  -> 进程已存在，执行 restart"
  pm2 restart "$APP_NAME" --update-env
else
  echo "  -> 进程不存在，执行 start"
  pm2 start server.js --name "$APP_NAME"
fi
pm2 save > /dev/null
sleep 2

echo ""
echo "[5/7] 进程状态 ..."
pm2 status

echo ""
echo "[6/7] 启动日志 ..."
pm2 logs "$APP_NAME" --lines 8 --nostream

echo ""
echo "[7/7] 端口监听检查 ..."
PORT_LINE=$(ss -ltnp 2>/dev/null | grep ":$PORT " || netstat -ltnp 2>/dev/null | grep ":$PORT " || true)
if [ -n "$PORT_LINE" ]; then
  echo "  OK 端口 $PORT 监听中"
  echo "  $PORT_LINE"
else
  echo "  X 端口 $PORT 未监听！"
  pm2 logs "$APP_NAME" --lines 20 --nostream --err
  exit 1
fi

echo ""
echo "============================================================"
echo "  部署完成！请强制刷新浏览器访问游戏"
echo "============================================================"