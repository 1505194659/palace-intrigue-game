/**
 * 后宫风云 - 网络层（房间匹配 + 回合同步 + 广播）
 *
 * 所有游戏逻辑都委托给 ./game.js，本文件只负责：
 *   - HTTP 静态文件
 *   - Socket.IO 房间生命周期
 *   - 把动作转给 game.resolveTurn 并广播结果
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function makeRoom(code) {
  return {
    code,
    players: [],   // [{ socketId, state, action }]
    turn: 1,
    phase: 'waiting',
    log: [],
    createdAt: Date.now(),
  };
}

function findRoomBySocket(socketId) {
  for (const r of rooms.values()) {
    if (r.players.some((p) => p.socketId === socketId)) return r;
  }
  return null;
}

function broadcastRoom(room) {
  const view = (forSocket) => {
    const me = room.players.find((p) => p.socketId === forSocket);
    const op = room.players.find((p) => p.socketId !== forSocket);
    return {
      code: room.code,
      turn: room.turn,
      maxTurns: game.MAX_TURNS,
      phase: room.phase,
      log: room.log.slice(-200),
      logTotal: room.log.length, // 客户端用此判断是否有新内容（修复 6 月后日志不刷新）
      you: me ? game.publicView(me.state) : null,
      opponent: op ? game.publicView(op.state) : null,
      youReady: !!me?.action,
      opponentReady: !!op?.action,
      youHaveOpponent: room.players.length === 2,
    };
  };
  for (const p of room.players) {
    io.to(p.socketId).emit('state', view(p.socketId));
  }
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name } = {}) => {
    let code;
    do { code = genRoomCode(); } while (rooms.has(code));
    const room = makeRoom(code);
    room.players.push({
      socketId: socket.id,
      state: game.newPlayerState((name || '').slice(0, 8)),
      action: null,
    });
    rooms.set(code, room);
    socket.join(code);
    socket.emit('joined', { code, role: 'host' });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, name } = {}) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('error_msg', '房间不存在'); return; }
    if (room.players.length >= 2) { socket.emit('error_msg', '房间已满'); return; }
    if (room.phase === 'ended') { socket.emit('error_msg', '该局已结束'); return; }
    room.players.push({
      socketId: socket.id,
      state: game.newPlayerState((name || '').slice(0, 8)),
      action: null,
    });
    socket.join(code);
    socket.emit('joined', { code, role: 'guest' });
    if (room.players.length === 2 && room.phase === 'waiting') {
      room.phase = 'choosing';
      room.log.push('🎬 二位佳人入宫，宫斗开局！');
    }
    broadcastRoom(room);
  });

  socket.on('choose_action', ({ action } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'choosing') return;
    if (!game.ACTIONS.includes(action)) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (!game.isActionLegal(player.state, action)) {
      socket.emit('error_msg', '此动作当前不可执行');
      return;
    }
    player.action = action;

    if (room.players.length === 2 && room.players.every((p) => p.action)) {
      const [a, b] = room.players;
      const { log } = game.resolveTurn(a.state, b.state, a.action, b.action, room.turn);
      room.log.push(...log);
      a.action = null;
      b.action = null;

      const endResult = game.checkEnd(a.state, b.state, room.turn);
      if (endResult.ended) {
        room.phase = 'ended';
        room.log.push(`🏁 ${endResult.reason}`);
        if (endResult.winner === 'A') {
          room.log.push(`🌟 ${a.state.name} 胜出！综合分 ${game.calcScore(a.state)}`);
        } else if (endResult.winner === 'B') {
          room.log.push(`🌟 ${b.state.name} 胜出！综合分 ${game.calcScore(b.state)}`);
        }
      } else {
        room.turn += 1;
      }
    }
    broadcastRoom(room);
  });

  socket.on('rematch', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'ended') return;
    room.turn = 1;
    room.phase = room.players.length === 2 ? 'choosing' : 'waiting';
    room.log = ['🔄 重开一局，宫门再启'];
    for (const p of room.players) {
      p.state = game.newPlayerState(p.state.name);
      p.action = null;
    }
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    room.players = room.players.filter((p) => p.socketId !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      room.log.push('⚠️ 对方已离开');
      room.phase = 'ended';
      broadcastRoom(room);
    }
  });
});

// 定期清理空房
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.players.length === 0 && now - r.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[后宫风云 v2.1] 服务已启动 :${PORT}（共 ${game.MAX_TURNS} 月）`);
});
