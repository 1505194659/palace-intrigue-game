/**
 * 后宫风云 v3.1 - 网络层
 *
 * v3.1 新增：
 *   - 决斗池：陷害判定从 5 子棋改为随机抽 [gomoku, rps, guess] 之一
 *   - 角色职业：建房时选 classId（默认 default）
 *   - 道具卡牌：每月初有几率掉落，可主动出牌
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const game = require('./game');
const duels = require('./duels');
const config = require('./config');

config.load();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });

app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  // 立绘/PNG/JPG 等静态资源浏览器缓存 30 天, HTML 不缓存
  maxAge: '30d',
  etag: true,
  setHeaders(res, filePath) {
    if (/\.html?$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
  },
}));

const PORT = process.env.PORT || 3000;

// ============================================================
// admin API
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

app.get('/api/admin/rooms', checkToken, (req, res) => {
  const list = Array.from(rooms.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(summarizeRoom);
  res.json({ ok: true, rooms: list });
});

app.post('/api/admin/rooms/:code/end', checkToken, (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ ok: false, error: '房间不存在' });
  clearTimeoutIfAny(room);
  room.phase = 'ended';
  room.duel = null;
  room.pendingActions = null;
  room.log.push('🛠️ 管理员已结束此房间');
  broadcastRoom(room);
  res.json({ ok: true, room: summarizeRoom(room) });
});

app.post('/api/admin/portrait-head', checkToken, (req, res) => {
  try {
    const allowed = new Set(['default', 'talent', 'seductress', 'schemer', 'noble', 'healer']);
    const id = String((req.body && req.body.id) || '');
    const image = String((req.body && req.body.image) || '');
    if (!allowed.has(id)) return res.status(400).json({ ok: false, error: '未知角色' });
    const m = image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ ok: false, error: '只支持 JPEG data URL' });
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 1024 || buf.length > 220 * 1024) {
      return res.status(400).json({ ok: false, error: '图片大小异常' });
    }
    const dir = path.join(__dirname, 'public', 'portraits', 'heads');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${id}.jpg`);
    fs.writeFileSync(out, buf);
    res.json({ ok: true, file: `portraits/heads/${id}.jpg`, bytes: buf.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 公开元数据：职业列表 + 决斗池信息（供前端展示）
app.get('/api/meta', (req, res) => {
  const cfg = config.get();
  const enabledClasses = (cfg.classes && cfg.classes.enabled) || ['default'];
  const classList = enabledClasses
    .filter((id) => cfg.classes && cfg.classes[id])
    .map((id) => {
      const c = cfg.classes[id];
      return { id: c.id, name: c.name, icon: c.icon, description: c.description };
    });
  const enabledDuels = (cfg.duels && cfg.duels.enabled) || ['gomoku'];
  const duelList = enabledDuels.map((id) => {
    const d = duels.getById(id);
    return d ? { id: d.id, name: d.name, icon: d.icon, description: d.description } : null;
  }).filter(Boolean);
  const enabledCards = (cfg.cards && cfg.cards.enabled) ? (cfg.cards.list || []) : [];
  res.json({
    ok: true,
    appellation: cfg.appellation,
    classes: classList,
    duels: duelList,
    cards: enabledCards.map((c) => ({ id: c.id, name: c.name, icon: c.icon, description: c.description, type: c.type })),
    palace: { maxTurns: cfg.palace.maxTurns },
    ui: cfg.ui || { sakuraCount: 45, sakuraSpeed: 80 },
  });
});

// ============================================================
// 房间
// ============================================================

const rooms = new Map();
const RECONNECT_GRACE_MS = 5 * 60 * 1000;

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
    phase: 'waiting',
    log: [],
    config: config.get(),
    createdAt: Date.now(),
    duel: null,           // { module, state, type }
    pendingActions: null, // 决斗等待时暂存动作
  };
}

function makePlayerSession(extra) {
  return Object.assign({
    token: crypto.randomBytes(16).toString('hex'),
    socketId: null,
    role: 'guest',
    disconnectedAt: null,
  }, extra);
}

function findRoomBySocket(socketId) {
  for (const r of rooms.values()) {
    if (r.players.some((p) => p.socketId === socketId)) return r;
  }
  return null;
}

function scheduleDisconnectCleanup(room) {
  if (room._disconnectTimer) clearTimeout(room._disconnectTimer);
  room._disconnectTimer = setTimeout(() => {
    const now = Date.now();
    const before = room.players.length;
    room.players = room.players.filter((p) => {
      return p.socketId || !p.disconnectedAt || now - p.disconnectedAt < RECONNECT_GRACE_MS;
    });
    if (room.players.length === 0) {
      clearTimeoutIfAny(room);
      rooms.delete(room.code);
      return;
    }
    if (before !== room.players.length && room.phase !== 'ended') {
      clearTimeoutIfAny(room);
      room.log.push('⚠️ 对方已离开');
      room.phase = 'ended';
      broadcastRoom(room);
      return;
    }
    if (room.players.some((p) => !p.socketId && p.disconnectedAt)) {
      scheduleDisconnectCleanup(room);
    }
  }, RECONNECT_GRACE_MS + 500);
}

function markPlayerConnected(room, player, socket) {
  player.socketId = socket.id;
  player.disconnectedAt = null;
  player._disconnectNotice = false;
  socket.join(room.code);
}

function leaveRoom(room, player, message) {
  clearTimeoutIfAny(room);
  room.players = room.players.filter((p) => p !== player);
  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }
  room.log.push(message || '⚠️ 对方已退出房间');
  room.phase = 'ended';
  room.duel = null;
  room.pendingActions = null;
  broadcastRoom(room);
}

function summarizeRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    turn: room.turn,
    maxTurns: room.config && room.config.palace ? room.config.palace.maxTurns : null,
    createdAt: room.createdAt,
    playerCount: room.players.length,
    duel: room.duel ? {
      id: room.duel.module.id,
      name: room.duel.module.name,
      kind: room.duel.kind,
    } : null,
    players: room.players.map((p) => ({
      name: p.state && p.state.name,
      role: p.role || 'guest',
      connected: !!p.socketId,
      classId: p.state && p.state.classId,
      rankName: p.state && typeof p.state.rank === 'number' ? game.RANK_NAMES[p.state.rank] : null,
      score: p.score || 0,
      actionReady: !!p.action,
      rematchReady: !!p.rematchReady,
      disconnectedAt: p.disconnectedAt || null,
    })),
    logTail: room.log.slice(-6).map((item) => (typeof item === 'string' ? item : item && item.text)).filter(Boolean),
  };
}

function useRoomConfig(room) {
  game.setConfig(room.config);
}

// ============================================================
// 视图
// ============================================================

function buildDuelView(room, forSocket) {
  if (!room.duel) return null;
  const idx = room.players.findIndex((p) => p.socketId === forSocket);
  if (idx < 0) return null;
  const view = room.duel.module.buildView(room.duel.state, idx);
  view.duelId = room.duel.module.id;
  view.duelName = room.duel.module.name;
  view.duelIcon = room.duel.module.icon;
  view.duelKind = room.duel.kind;       // 'sabotage' | 'standalone'
  return view;
}

// 过滤私有 log：只显示 string 或 {private:<myName>} 的项；
// 把 {text, private} 拍平成 string；对手的私有 log 整条丢掉
function filterLogForPlayer(log, myName) {
  const out = [];
  for (const item of log) {
    if (typeof item === 'string') { out.push(item); continue; }
    if (item && typeof item === 'object') {
      if (!item.private || item.private === myName) out.push(item.text);
    }
  }
  return out;
}

function buildPalaceView(room, forSocket) {
  const me = room.players.find((p) => p.socketId === forSocket);
  const op = room.players.find((p) => p.socketId !== forSocket);
  const myName = me ? me.state.name : '';
  const visible = filterLogForPlayer(room.log, myName);
  return {
    code: room.code,
    mode: 'palace',
    turn: room.turn,
    maxTurns: room.config.palace.maxTurns,
    phase: room.phase,
    log: visible.slice(-200),
    logTotal: visible.length,
    appellation: room.config.appellation,
    you: me ? game.publicView(me.state, { self: true }) : null,
    opponent: op ? game.publicView(op.state, { self: false }) : null,
    youReady: !!(me && me.action),
    opponentReady: !!(op && op.action),
    youHaveOpponent: room.players.length === 2,
    duel: buildDuelView(room, forSocket),
    rematch: {
      youReady: !!(me && me.rematchReady),
      opponentReady: !!(op && op.rematchReady),
      yourClassId: me ? me.rematchClassId : null,
      opponentClassId: op ? op.rematchClassId : null,
    },
  };
}

function buildGomokuStandaloneView(room, forSocket) {
  const me = room.players.find((p) => p.socketId === forSocket);
  const op = room.players.find((p) => p.socketId !== forSocket);
  return {
    code: room.code,
    mode: 'gomoku',
    phase: room.phase,
    log: room.log.slice(-50),
    logTotal: room.log.length,
    you: me ? { name: me.state.name, score: me.score || 0 } : null,
    opponent: op ? { name: op.state.name, score: op.score || 0 } : null,
    youHaveOpponent: room.players.length === 2,
    duel: buildDuelView(room, forSocket),
    rematch: {
      youReady: !!(me && me.rematchReady),
      opponentReady: !!(op && op.rematchReady),
    },
  };
}

function broadcastRoom(room) {
  for (const p of room.players) {
    if (!p.socketId) continue;
    const view = room.mode === 'gomoku'
      ? buildGomokuStandaloneView(room, p.socketId)
      : buildPalaceView(room, p.socketId);
    io.to(p.socketId).emit('state', view);
  }
}

// ============================================================
// 决斗生命周期（支持任意 duel 模块）
// ============================================================

function startDuel(room, opts) {
  opts = opts || {};
  let mod;
  if (opts.module) {
    mod = opts.module;
  } else {
    mod = duels.pickRandom(room.config);
  }
  const state = mod.init({ config: room.config, options: { attackerIdx: opts.attackerIdx != null ? opts.attackerIdx : 0 } });
  room.duel = { module: mod, state, kind: opts.kind || 'standalone' };
  room.phase = 'duel';
  scheduleDuelTimeout(room);
}

function clearTimeoutIfAny(room) {
  if (room._timer) {
    clearTimeout(room._timer);
    room._timer = null;
  }
}

function scheduleDuelTimeout(room) {
  clearTimeoutIfAny(room);
  if (!room.duel) return;
  const deadline = room.duel.module.getDeadline(room.duel.state);
  if (!deadline) return;
  const ms = Math.max(500, deadline - Date.now() + 500);
  room._timer = setTimeout(() => {
    if (!room.duel || room.duel.module.isOver(room.duel.state)) return;
    const r = room.duel.module.onTimeout(room.duel.state);
    if (r && r.events) for (const e of r.events) room.log.push('⏱️ ' + e);
    if (room.duel.module.isOver(room.duel.state)) {
      finalizeDuel(room);
    } else {
      // 同时回合（rps/guess）超时后可能进入下一回合
      scheduleDuelTimeout(room);
    }
    broadcastRoom(room);
  }, ms);
}

function finalizeDuel(room) {
  clearTimeoutIfAny(room);
  if (!room.duel) return;
  const winnerIdx = room.duel.module.getWinner(room.duel.state); // 0|1|null|-1(draw)
  const kind = room.duel.kind;

  if (kind === 'standalone') {
    if (winnerIdx === 0 || winnerIdx === 1) {
      const w = room.players[winnerIdx];
      w.score = (w.score || 0) + 1;
      room.log.push(`🏆 ${w.state.name} 获胜（${room.duel.module.name}）`);
    } else {
      room.log.push('🤝 不分胜负');
    }
    room.phase = 'ended';
    room.duel = null;
    return;
  }

  // sabotage: 翻译胜负为 forceSabotage
  const pa = room.pendingActions;
  room.duel = null;
  if (!pa) {
    room.phase = 'choosing';
    return;
  }
  const [a, b] = room.players;
  const opts = {};
  if (pa.actA === 'sabotage') {
    opts.forceSabotageA = (winnerIdx === 0) ? 'hit' : 'miss';
  }
  if (pa.actB === 'sabotage') {
    opts.forceSabotageB = (winnerIdx === 1) ? 'hit' : 'miss';
  }

  room.log.push(`⚔️ 决斗已分胜负，回到宫斗`);
  useRoomConfig(room);
  const { log: tlog } = game.resolveTurn(a.state, b.state, pa.actA, pa.actB, room.turn, undefined, opts);
  room.log.push(...tlog);

  a.action = null; b.action = null;
  room.pendingActions = null;

  const endResult = game.checkEnd(a.state, b.state, room.turn);
  if (endResult.ended) {
    finishPalaceGame(room, endResult);
  } else {
    advanceToNextTurn(room);
  }
}

function finishPalaceGame(room, endResult) {
  room.phase = 'ended';
  room.log.push(`🏁 ${endResult.reason}`);
  const [a, b] = room.players;
  if (endResult.winner === 'A') {
    room.log.push(`🌟 ${a.state.name} 胜出！综合分 ${game.calcScore(a.state)}`);
  } else if (endResult.winner === 'B') {
    room.log.push(`🌟 ${b.state.name} 胜出！综合分 ${game.calcScore(b.state)}`);
  }
}

// 推进到下一月：抽卡 + 状态更新
function advanceToNextTurn(room) {
  room.turn += 1;
  room.phase = 'choosing';
  useRoomConfig(room);
  const subLog = [];
  for (const p of room.players) {
    game.onTurnStart(p.state, subLog, undefined, room.turn === 1);
  }
  if (subLog.length) room.log.push(...subLog);
}

// ============================================================
// 触发陷害决斗的判定
// ============================================================

function shouldTriggerSabotageDuel(room) {
  const cfg = room.config;
  if (!cfg.gomoku || !cfg.gomoku.sabotageDuel) return false;
  const [a, b] = room.players;
  const aSab = a.action === 'sabotage';
  const bSab = b.action === 'sabotage';
  if (!aSab && !bSab) return false;
  if (aSab && b.action === 'defend') return false;
  if (bSab && a.action === 'defend') return false;
  if (aSab && (a.state.imprisoned > 0 || a.state.energy < 20)) return false;
  if (bSab && (b.state.imprisoned > 0 || b.state.energy < 20)) return false;
  // 御赐宝剑：必中跳过决斗
  if (aSab && a.state.shields && a.state.shields.guaranteed) return false;
  if (bSab && b.state.shields && b.state.shields.guaranteed) return false;
  return true;
}

// ============================================================
// Socket.IO
// ============================================================

io.on('connection', (socket) => {
  socket.on('create_room', ({ name, mode, classId } = {}) => {
    let code;
    do { code = genRoomCode(); } while (rooms.has(code));
    const room = makeRoom(code, mode);
    useRoomConfig(room);
    if (room.mode === 'gomoku') {
      room.players.push(makePlayerSession({
        socketId: socket.id,
        role: 'host',
        state: { name: (name || '').slice(0, 8) || '棋手' },
        score: 0,
      }));
    } else {
      const validClassIds = (room.config.classes && room.config.classes.enabled) || ['default'];
      const cid = validClassIds.includes(classId) ? classId : 'default';
      room.players.push(makePlayerSession({
        socketId: socket.id,
        role: 'host',
        state: game.newPlayerState((name || '').slice(0, 8), cid),
        action: null,
      }));
    }
    rooms.set(code, room);
    socket.join(code);
    socket.emit('joined', { code, role: 'host', mode: room.mode, token: room.players[0].token });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, name, classId } = {}) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('error_msg', '房间不存在'); return; }
    if (room.players.length >= 2) { socket.emit('error_msg', '房间已满'); return; }
    if (room.phase === 'ended') { socket.emit('error_msg', '该局已结束'); return; }
    useRoomConfig(room);
    if (room.mode === 'gomoku') {
      room.players.push(makePlayerSession({
        socketId: socket.id,
        role: 'guest',
        state: { name: (name || '').slice(0, 8) || '棋手' },
        score: 0,
      }));
    } else {
      const validClassIds = (room.config.classes && room.config.classes.enabled) || ['default'];
      const cid = validClassIds.includes(classId) ? classId : 'default';
      room.players.push(makePlayerSession({
        socketId: socket.id,
        role: 'guest',
        state: game.newPlayerState((name || '').slice(0, 8), cid),
        action: null,
      }));
    }
    socket.join(code);
    socket.emit('joined', { code, role: 'guest', mode: room.mode, token: room.players[room.players.length - 1].token });
    if (room.players.length === 2 && room.phase === 'waiting') {
      if (room.mode === 'gomoku') {
        room.log.push('🎬 棋逢对手，请先手落子');
        startDuel(room, { module: duels.getById('gomoku'), kind: 'standalone', attackerIdx: 0 });
      } else {
        room.phase = 'choosing';
        room.log.push('🎬 二位佳人入宫，宫斗开局！');
        // 第一月开始时双方都执行 onTurnStart
        const subLog = [];
        for (const p of room.players) game.onTurnStart(p.state, subLog, undefined, true);
        if (subLog.length) room.log.push(...subLog);
      }
    }
    broadcastRoom(room);
  });

  socket.on('reconnect_room', ({ code, token } = {}) => {
    code = (code || '').toUpperCase().trim();
    token = (token || '').trim();
    const room = rooms.get(code);
    if (!room || !token) {
      socket.emit('error_msg', '重连失败：房间不存在');
      return;
    }
    const player = room.players.find((p) => p.token === token);
    if (!player) {
      socket.emit('error_msg', '重连失败：身份已失效');
      return;
    }
    markPlayerConnected(room, player, socket);
    if (room._disconnectTimer) {
      clearTimeout(room._disconnectTimer);
      room._disconnectTimer = null;
    }
    if (room.players.some((p) => !p.socketId && p.disconnectedAt)) {
      scheduleDisconnectCleanup(room);
    }
    socket.emit('joined', {
      code: room.code,
      role: player.role || 'guest',
      mode: room.mode,
      token: player.token,
      reconnected: true,
    });
    room.log.push(`🔌 ${player.state.name} 已重连`);
    broadcastRoom(room);
  });

  socket.on('leave_room', ({ code, token } = {}) => {
    code = (code || '').toUpperCase().trim();
    token = (token || '').trim();
    const room = findRoomBySocket(socket.id) || (code ? rooms.get(code) : null);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id || (token && p.token === token));
    if (!player) return;
    socket.leave(room.code);
    leaveRoom(room, player, `⚠️ ${player.state.name} 已退出房间`);
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
        let attackerIdx = 0;
        if (a.action !== 'sabotage' && b.action === 'sabotage') attackerIdx = 1;
        const mod = duels.pickRandom(room.config);
        const intro = a.action === 'sabotage' && b.action === 'sabotage'
          ? `${a.state.name} 与 ${b.state.name} 双方暗中布局`
          : `${room.players[attackerIdx].state.name} 暗中布局`;
        room.log.push(`⚔️ ${intro}，「${mod.name}」决胜负！`);
        startDuel(room, { module: mod, kind: 'sabotage', attackerIdx });
      } else {
        const [a, b] = room.players;
        const { log } = game.resolveTurn(a.state, b.state, a.action, b.action, room.turn);
        room.log.push(...log);
        a.action = null;
        b.action = null;
        const endResult = game.checkEnd(a.state, b.state, room.turn);
        if (endResult.ended) {
          finishPalaceGame(room, endResult);
        } else {
          advanceToNextTurn(room);
        }
      }
    }
    broadcastRoom(room);
  });

  socket.on('use_card', ({ cardId } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.mode !== 'palace' || room.phase !== 'choosing') return;
    const me = room.players.find((p) => p.socketId === socket.id);
    const op = room.players.find((p) => p.socketId !== socket.id);
    if (!me || !op) return;
    useRoomConfig(room);
    const log = [];
    const r = game.useCard(me.state, op.state, cardId, log);
    if (!r.ok) {
      socket.emit('error_msg', r.reason || '使用失败');
      return;
    }
    if (log.length) room.log.push(...log);
    broadcastRoom(room);
  });

  // 通用决斗动作（gomoku/rps/guess 都用此事件）
  socket.on('duel_action', (payload = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.duel || room.phase !== 'duel') return;
    if (room.duel.module.isOver(room.duel.state)) return;
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx < 0) return;
    const mod = room.duel.module;
    if (!mod.canAct(room.duel.state, idx)) {
      socket.emit('error_msg', '尚未轮到');
      return;
    }
    const v = mod.validateAction(room.duel.state, idx, payload);
    if (!v.ok) {
      socket.emit('error_msg', v.reason || '动作无效');
      return;
    }
    const r = mod.applyAction(room.duel.state, idx, payload);
    if (r && r.events && r.events.length) {
      for (const e of r.events) room.log.push('⚔️ ' + e);
    }
    if (mod.isOver(room.duel.state)) {
      finalizeDuel(room);
    } else {
      scheduleDuelTimeout(room);
    }
    broadcastRoom(room);
  });

  // 兼容旧客户端的 place_stone（v3.0 用）
  socket.on('place_stone', ({ row, col } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.duel || room.duel.module.id !== 'gomoku') return;
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx < 0) return;
    const mod = room.duel.module;
    if (!mod.canAct(room.duel.state, idx)) return;
    const v = mod.validateAction(room.duel.state, idx, { row, col });
    if (!v.ok) {
      socket.emit('error_msg', v.reason || '落子无效');
      return;
    }
    mod.applyAction(room.duel.state, idx, { row, col });
    if (mod.isOver(room.duel.state)) finalizeDuel(room);
    else scheduleDuelTimeout(room);
    broadcastRoom(room);
  });

  socket.on('rematch', ({ classId } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'ended') return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const validClassIds = room.mode === 'gomoku'
      ? null
      : ((room.config.classes && room.config.classes.enabled) || ['default']);

    // 记录该玩家"再战"意愿 + 想要的新职业
    if (room.mode !== 'gomoku') {
      const wanted = classId || (player.state && player.state.classId) || 'default';
      player.rematchClassId = validClassIds.includes(wanted) ? wanted : 'default';
    }
    player.rematchReady = true;

    // 把"对方还没按"的状态先广播一次, 客户端可以显示等待
    if (room.players.length === 2 && !room.players.every((p) => p.rematchReady)) {
      const waitingName = room.players.find((p) => !p.rematchReady).state.name;
      // 仅追加一条等待提示, 避免日志爆炸: 只在第一次按时加
      if (!room._rematchLogged) {
        room.log.push(`⏳ ${player.state.name} 已请求再战，等待 ${waitingName} 同意`);
        room._rematchLogged = true;
      }
      broadcastRoom(room);
      return;
    }

    // 双方都按了 (或单人房) → 真正重开
    clearTimeoutIfAny(room);
    useRoomConfig(room);
    delete room._rematchLogged;

    if (room.mode === 'gomoku') {
      room.log = ['🔄 再来一局'];
      room.duel = null;
      for (const p of room.players) { p.rematchReady = false; }
      const attackerIdx = room.players[0].score >= (room.players[1].score || 0) ? 1 : 0;
      startDuel(room, { module: duels.getById('gomoku'), kind: 'standalone', attackerIdx });
    } else {
      room.turn = 1;
      room.phase = room.players.length === 2 ? 'choosing' : 'waiting';
      room.log = ['🔄 重开一局，宫门再启'];
      room.duel = null;
      room.pendingActions = null;
      for (const p of room.players) {
        const cid = p.rematchClassId || (p.state && p.state.classId) || 'default';
        const finalCid = validClassIds.includes(cid) ? cid : 'default';
        p.state = game.newPlayerState(p.state.name, finalCid);
        p.action = null;
        p.rematchReady = false;
        delete p.rematchClassId;
      }
      if (room.phase === 'choosing') {
        const subLog = [];
        for (const p of room.players) game.onTurnStart(p.state, subLog, undefined, true);
        if (subLog.length) room.log.push(...subLog);
      }
    }
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.socketId = null;
    player.disconnectedAt = Date.now();
    if (!player._disconnectNotice && room.players.some((p) => p.socketId)) {
      room.log.push(`⚠️ ${player.state.name} 连接暂断，5分钟内回来会自动重连`);
      player._disconnectNotice = true;
      broadcastRoom(room);
    }
    scheduleDisconnectCleanup(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.players.length === 0 && now - r.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
    } else if (r.players.length > 0 && r.players.every((p) => !p.socketId && p.disconnectedAt && now - p.disconnectedAt > RECONNECT_GRACE_MS)) {
      clearTimeoutIfAny(r);
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  const cfg = config.get();
  const enabledDuels = (cfg.duels && cfg.duels.enabled) || [];
  console.log(`[后宫风云 v3.1] 服务已启动 :${PORT}（${cfg.palace.maxTurns} 月，决斗池: ${enabledDuels.join('/')}）`);
});
