/**
 * 后宫风云 v3.0 - 网络层
 *
 * 功能：
 *   - 静态文件
 *   - Socket.IO 房间管理（palace 或 gomoku 模式）
 *   - 五子棋逻辑（独立模式 + 陷害决斗）
 *   - admin REST API（GET/POST /api/admin/config）
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const game = require('./game');
const gomoku = require('./gomoku');
const config = require('./config');

config.load();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });

app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ============================================================
// admin API（密码保护）
// ============================================================

function checkToken(req, res, next) {
  const token = req.header('X-Admin-Token') || (req.body && req.body._token) || req.query.token;
  const cfg = config.getRaw();
  if (!cfg.adminToken || cfg.adminToken === 'CHANGE_ME_NOW') {
    if (token !== 'CHANGE_ME_NOW') {
      return res.status(401).json({ ok: false, error: '请先设置 adminToken（默认 CHANGE_ME_NOW，登录后立即修改）' });
    }
  } else if (token !== cfg.adminToken) {
    return res.status(401).json({ ok: false, error: 'Token 无效' });
  }
  next();
}

app.get('/api/admin/config', checkToken, (req, res) => {
  res.json({ ok: true, config: config.get() });
});

app.post('/api/admin/config', checkToken, (req, res) => {
  try {
    const next = req.body && req.body.config;
    if (!next) return res.status(400).json({ ok: false, error: '缺少 config' });
    delete next._token;
    config.save(next);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/reset', checkToken, (req, res) => {
  try {
    config.reset();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/stats', checkToken, (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    palaceRooms: Array.from(rooms.values()).filter((r) => r.mode === 'palace').length,
    gomokuRooms: Array.from(rooms.values()).filter((r) => r.mode === 'gomoku').length,
    activeRooms: Array.from(rooms.values()).filter((r) => r.players.length === 2).length,
  });
});

// ============================================================
// 房间管理
// ============================================================

const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function makeRoom(code, mode) {
  return {
    code,
    mode: mode === 'gomoku' ? 'gomoku' : 'palace',
    players: [],
    turn: 1,
    phase: 'waiting',  // waiting -> choosing -> duel -> ended
    log: [],
    config: config.get(), // 房间创建时快照配置
    createdAt: Date.now(),
    // gomoku 子状态（独立模式 OR 陷害决斗时使用）
    gomoku: null,
    // 暂存的本月动作（陷害决斗等待时使用）
    pendingActions: null,
  };
}

function findRoomBySocket(socketId) {
  for (const r of rooms.values()) {
    if (r.players.some((p) => p.socketId === socketId)) return r;
  }
  return null;
}

// 切换 game 模块的配置上下文（每次操作前调用）
function useRoomConfig(room) {
  game.setConfig(room.config);
}

function buildPalaceView(room, forSocket) {
  const me = room.players.find((p) => p.socketId === forSocket);
  const op = room.players.find((p) => p.socketId !== forSocket);
  return {
    code: room.code,
    mode: 'palace',
    turn: room.turn,
    maxTurns: room.config.palace.maxTurns,
    phase: room.phase,
    log: room.log.slice(-200),
    logTotal: room.log.length,
    appellation: room.config.appellation,
    you: me ? game.publicView(me.state) : null,
    opponent: op ? game.publicView(op.state) : null,
    youReady: !!(me && me.action),
    opponentReady: !!(op && op.action),
    youHaveOpponent: room.players.length === 2,
    gomoku: room.gomoku ? buildGomokuSubView(room, forSocket) : null,
  };
}

function buildGomokuSubView(room, forSocket) {
  const me = room.players.find((p) => p.socketId === forSocket);
  const myColor = me && me.color;
  return {
    board: room.gomoku.board,
    current: room.gomoku.current,
    yourColor: myColor,
    yourTurn: room.gomoku.current === myColor,
    winner: room.gomoku.winner,
    duel: room.gomoku.duel || null, // 'sabotage' | 'standalone'
    lastMove: room.gomoku.lastMove || null,
    moveCount: room.gomoku.moveCount,
    deadline: room.gomoku.deadline,
  };
}

function buildGomokuView(room, forSocket) {
  const me = room.players.find((p) => p.socketId === forSocket);
  const op = room.players.find((p) => p.socketId !== forSocket);
  return {
    code: room.code,
    mode: 'gomoku',
    phase: room.phase,
    log: room.log.slice(-50),
    logTotal: room.log.length,
    you: me ? { name: me.state.name, color: me.color, score: me.score || 0 } : null,
    opponent: op ? { name: op.state.name, color: op.color, score: op.score || 0 } : null,
    youHaveOpponent: room.players.length === 2,
    gomoku: room.gomoku ? buildGomokuSubView(room, forSocket) : null,
  };
}

function broadcastRoom(room) {
  for (const p of room.players) {
    const view = room.mode === 'gomoku'
      ? buildGomokuView(room, p.socketId)
      : buildPalaceView(room, p.socketId);
    io.to(p.socketId).emit('state', view);
  }
}

// ============================================================
// 五子棋小局生命周期
// ============================================================

function startGomokuMatch(room, opts) {
  const sz = room.config.gomoku.boardSize;
  const board = gomoku.newBoard(sz);
  // 谁是黑（先手）
  const blackIdx = (opts && opts.blackIdx != null) ? opts.blackIdx : 0;
  room.players[blackIdx].color = 1;
  room.players[1 - blackIdx].color = 2;
  room.gomoku = {
    board,
    current: 1, // 黑先
    winner: null,
    duel: opts.duel || 'standalone',
    moveCount: 0,
    lastMove: null,
    deadline: Date.now() + (room.config.gomoku.moveTimeoutSec * 1000),
  };
  room.phase = 'duel';
  scheduleTimeout(room);
}

function clearTimeoutIfAny(room) {
  if (room._timer) {
    clearTimeout(room._timer);
    room._timer = null;
  }
}

function scheduleTimeout(room) {
  clearTimeoutIfAny(room);
  const ms = room.config.gomoku.moveTimeoutSec * 1000;
  room._timer = setTimeout(() => {
    if (!room.gomoku || room.gomoku.winner) return;
    // 当前色超时 -> 对方判负
    const loser = room.gomoku.current;
    const winner = loser === 1 ? 2 : 1;
    room.gomoku.winner = winner;
    room.log.push(`⏱️ ${room.players.find(p => p.color === loser).state.name} 思虑过久，判负`);
    finalizeGomoku(room);
  }, ms + 500);
}

function finalizeGomoku(room) {
  clearTimeoutIfAny(room);
  if (room.mode === 'gomoku') {
    // 独立模式：胜负即结束局，可重开
    const winnerColor = room.gomoku.winner;
    if (winnerColor === 'draw') {
      room.log.push('🤝 棋逢对手，和局');
    } else if (winnerColor) {
      const w = room.players.find((p) => p.color === winnerColor);
      w.score = (w.score || 0) + 1;
      room.log.push(`🏆 ${w.state.name} 获胜（${winnerColor === 1 ? '执黑' : '执白'}）`);
    }
    room.phase = 'ended';
  } else {
    // 陷害决斗：把胜负翻译成 sabotage 结果，然后调用 resolveTurn
    const pa = room.pendingActions;
    if (!pa) {
      room.phase = 'choosing';
      return;
    }
    const [a, b] = room.players;
    const winnerColor = room.gomoku.winner;
    let winnerIdx = -1;
    if (winnerColor === 1 || winnerColor === 2) {
      winnerIdx = room.players.findIndex((p) => p.color === winnerColor);
    } // draw -> 双方都判 miss

    let opts = {};
    if (pa.actA === 'sabotage') {
      opts.forceSabotageA = (winnerIdx === 0) ? 'hit' : 'miss';
    }
    if (pa.actB === 'sabotage') {
      opts.forceSabotageB = (winnerIdx === 1) ? 'hit' : 'miss';
    }

    room.log.push(`⚔️ 棋局已分胜负，回到宫斗`);
    useRoomConfig(room);
    const { log } = game.resolveTurn(a.state, b.state, pa.actA, pa.actB, room.turn, undefined, opts);
    room.log.push(...log);

    a.action = null;
    b.action = null;
    room.pendingActions = null;
    room.gomoku = null;

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
      room.phase = 'choosing';
    }
  }
}

// ============================================================
// 决定该回合是否触发陷害决斗
// ============================================================

function shouldTriggerSabotageDuel(room) {
  if (!room.config.gomoku.sabotageDuel) return false;
  const [a, b] = room.players;
  const aSab = a.action === 'sabotage';
  const bSab = b.action === 'sabotage';
  if (!aSab && !bSab) return false;
  // 自保挡掉陷害，不触发决斗
  if (aSab && b.action === 'defend') return false;
  if (bSab && a.action === 'defend') return false;
  // 体力不足/被禁足时陷害也无效
  if (aSab && (a.state.imprisoned > 0 || a.state.energy < 20)) return false;
  if (bSab && (b.state.imprisoned > 0 || b.state.energy < 20)) return false;
  return true;
}

// ============================================================
// Socket.IO 事件
// ============================================================

io.on('connection', (socket) => {
  socket.on('create_room', ({ name, mode } = {}) => {
    let code;
    do { code = genRoomCode(); } while (rooms.has(code));
    const room = makeRoom(code, mode);
    useRoomConfig(room);
    if (room.mode === 'gomoku') {
      room.players.push({
        socketId: socket.id,
        state: { name: (name || '').slice(0, 8) || '棋手' },
        score: 0,
      });
    } else {
      room.players.push({
        socketId: socket.id,
        state: game.newPlayerState((name || '').slice(0, 8)),
        action: null,
      });
    }
    rooms.set(code, room);
    socket.join(code);
    socket.emit('joined', { code, role: 'host', mode: room.mode });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, name } = {}) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('error_msg', '房间不存在'); return; }
    if (room.players.length >= 2) { socket.emit('error_msg', '房间已满'); return; }
    if (room.phase === 'ended') { socket.emit('error_msg', '该局已结束'); return; }
    useRoomConfig(room);
    if (room.mode === 'gomoku') {
      room.players.push({
        socketId: socket.id,
        state: { name: (name || '').slice(0, 8) || '棋手' },
        score: 0,
      });
    } else {
      room.players.push({
        socketId: socket.id,
        state: game.newPlayerState((name || '').slice(0, 8)),
        action: null,
      });
    }
    socket.join(code);
    socket.emit('joined', { code, role: 'guest', mode: room.mode });
    if (room.players.length === 2 && room.phase === 'waiting') {
      if (room.mode === 'gomoku') {
        room.log.push('🎬 棋逢对手，请先手落子');
        startGomokuMatch(room, { duel: 'standalone', blackIdx: 0 });
      } else {
        room.phase = 'choosing';
        room.log.push('🎬 二位佳人入宫，宫斗开局！');
      }
    }
    broadcastRoom(room);
  });

  socket.on('choose_action', ({ action } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.mode !== 'palace' || room.phase !== 'choosing') return;
    if (!game.ACTIONS.includes(action)) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    useRoomConfig(room);
    if (!game.isActionLegal(player.state, action)) {
      socket.emit('error_msg', '此动作当前不可执行');
      return;
    }
    player.action = action;

    if (room.players.length === 2 && room.players.every((p) => p.action)) {
      if (shouldTriggerSabotageDuel(room)) {
        const [a, b] = room.players;
        room.pendingActions = { actA: a.action, actB: b.action };
        // 攻方为黑（如果双方都陷害，建房者为黑）
        let blackIdx = 0;
        if (a.action !== 'sabotage' && b.action === 'sabotage') blackIdx = 1;
        room.log.push(`⚔️ ${a.action === 'sabotage' ? a.state.name : ''}${a.action === 'sabotage' && b.action === 'sabotage' ? ' 与 ' + b.state.name : (b.action === 'sabotage' ? b.state.name : '')} 暗中布局，棋决胜负！`);
        startGomokuMatch(room, { duel: 'sabotage', blackIdx });
      } else {
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
    }
    broadcastRoom(room);
  });

  socket.on('place_stone', ({ row, col } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.gomoku || room.gomoku.winner || room.phase !== 'duel') return;
    const me = room.players.find((p) => p.socketId === socket.id);
    if (!me) return;
    if (me.color !== room.gomoku.current) {
      socket.emit('error_msg', '尚未轮到');
      return;
    }
    const r = Number(row), c = Number(col);
    const result = gomoku.applyMove(room.gomoku.board, r, c, me.color);
    if (!result.ok) {
      socket.emit('error_msg', result.reason || '落子无效');
      return;
    }
    room.gomoku.lastMove = { row: r, col: c, color: me.color };
    room.gomoku.moveCount++;
    if (result.win) {
      room.gomoku.winner = me.color;
    } else if (result.draw) {
      room.gomoku.winner = 'draw';
    } else {
      room.gomoku.current = me.color === 1 ? 2 : 1;
      room.gomoku.deadline = Date.now() + (room.config.gomoku.moveTimeoutSec * 1000);
      scheduleTimeout(room);
    }
    if (room.gomoku.winner) {
      finalizeGomoku(room);
    }
    broadcastRoom(room);
  });

  socket.on('rematch', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'ended') return;
    clearTimeoutIfAny(room);
    useRoomConfig(room);
    if (room.mode === 'gomoku') {
      room.log = [`🔄 再来一局`];
      room.gomoku = null;
      // 上一局赢家执白先手？保持简单：黑白互换
      const blackIdx = room.players[0].color === 1 ? 1 : 0;
      startGomokuMatch(room, { duel: 'standalone', blackIdx });
    } else {
      room.turn = 1;
      room.phase = room.players.length === 2 ? 'choosing' : 'waiting';
      room.log = ['🔄 重开一局，宫门再启'];
      room.gomoku = null;
      room.pendingActions = null;
      for (const p of room.players) {
        p.state = game.newPlayerState(p.state.name);
        p.action = null;
      }
    }
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    clearTimeoutIfAny(room);
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

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.players.length === 0 && now - r.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[后宫风云 v3.0] 服务已启动 :${PORT}（共 ${config.get().palace.maxTurns} 月，五子棋 ${config.get().gomoku.boardSize}x${config.get().gomoku.boardSize}）`);
});