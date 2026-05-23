#!/bin/bash
# 后宫风云 v3.0 部署脚本（基于 GitHub）
# 使用：bash deploy.sh
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="palace-game"
PORT="${PORT:-3000}"

cd "$PROJECT_DIR"

echo "================================"
echo "  后宫风云 v3.0 部署"
echo "  路径: $PROJECT_DIR"
echo "================================"

echo
echo "[1/8] 检查 node ..."
for f in game.js server.js public/index.html package.json gomoku.js config.js config.default.json public/admin.html; do
  if [ ! -f "$f" ]; then
    echo "  ✗ 缺少 $f"
    exit 1
  fi
done
node --version || { echo "  ✗ 没装 Node"; exit 1; }

echo "[2/8] 安装依赖 ..."
npm install --production --registry=https://registry.npmmirror.com --silent 2>&1 | tail -5

echo "[3/8] 初始化 config.json（如不存在） ..."
if [ ! -f "config.json" ]; then
  cp config.default.json config.json
  echo "  -> 已从 config.default.json 创建 config.json"
  echo "  ⚠️  请记得登录 /admin.html 修改 adminToken（默认 CHANGE_ME_NOW）"
else
  echo "  -> config.json 已存在，保留运行时配置不动"
fi

echo "[4/8] 跑核心测试 ..."
if [ -f test-game.js ]; then
  node test-game.js > /tmp/palace-test.log 2>&1 || {
    echo "  ✗ 游戏逻辑测试失败"
    tail -25 /tmp/palace-test.log
    exit 1
  }
  echo "  -> 宫斗逻辑：通过"
fi
if [ -f test-gomoku.js ]; then
  node test-gomoku.js > /tmp/palace-gomoku.log 2>&1 || {
    echo "  ✗ 五子棋测试失败"
    tail -20 /tmp/palace-gomoku.log
    exit 1
  }
  echo "  -> 五子棋逻辑：通过"
fi

echo "[5/8] 启动 / 重启 PM2 进程 ..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  echo "  -> 进程已存在，执行 restart"
  pm2 restart "$APP_NAME" --update-env
else
  echo "  -> 进程不存在，执行 start"
  PORT="$PORT" pm2 start server.js --name "$APP_NAME" --update-env
fi
pm2 save > /dev/null

echo "[6/8] 等待启动 ..."
sleep 2

echo "[7/8] 健康检查 ..."
pm2 status

echo "[8/8] 端口监听检查 ..."
PORT_LINE=$(ss -ltnp 2>/dev/null | grep ":$PORT" || netstat -ltnp 2>/dev/null | grep ":$PORT" || true)
if [ -n "$PORT_LINE" ]; then
  echo "  ✓ 服务正在监听端口 $PORT"
  echo "  $PORT_LINE"
else
  echo "  ✗ 未检测到 $PORT 端口监听"
  pm2 logs "$APP_NAME" --lines 20 --nostream --err
  exit 1
fi

echo
echo "================================"
echo "  ✅ 部署成功！服务已就绪"
echo "  游戏：    http://<your-ip>:$PORT/"
echo "  管理：    http://<your-ip>:$PORT/admin.html"
echo "  默认 token: CHANGE_ME_NOW（首次登录后请修改）"
echo "================================"