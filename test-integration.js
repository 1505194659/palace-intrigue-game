/**
 * v3.0 集成测试：五子棋模式 + 陷害决斗 + admin API
 * 跑法：node test-integration.js（自动起服务）
 */
const { spawn } = require('child_process');
const ioClient = require('socket.io-client');
const http = require('http');

const PORT = 3013;
const URL = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
const errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push(m); console.error('  ✗', m); } }

function httpReq(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: PORT, path, method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
      }, headers || {}),
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, raw: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitFor(socket, event, predicate, timeoutMs, label) {
  let lastSeen = null;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      const dump = lastSeen ? JSON.stringify({
        phase: lastSeen.phase, turn: lastSeen.turn,
        lastMove: lastSeen.gomoku && lastSeen.gomoku.lastMove,
        winner: lastSeen.gomoku && lastSeen.gomoku.winner,
        moveCount: lastSeen.gomoku && lastSeen.gomoku.moveCount,
      }) : 'no-state';
      reject(new Error(`Timeout waiting for ${event}${label ? '['+label+']' : ''}; last=${dump}`));
    }, timeoutMs || 4000);
    const handler = (data) => {
      lastSeen = data;
      if (!predicate || predicate(data)) {
        clearTimeout(t);
        socket.off(event, handler);
        resolve(data);
      }
    };
    socket.on(event, handler);
  });
}

async function main() {
  console.log('启动 v3.0 server (PORT=' + PORT + ') ...');
  const proc = spawn('node', ['server.js'], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'pipe',
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => console.error('SERVER ERR:', d.toString()));

  await new Promise((r) => setTimeout(r, 1500));

  try {
    // === 1. admin API 健康检查 ===
    console.log('\n=== 1. admin API: 错误 token ===');
    const bad = await httpReq('GET', '/api/admin/config', null, { 'X-Admin-Token': 'wrong' });
    assert(bad.status === 401, '错误 token 应返回 401');

    console.log('=== 2. admin API: 默认 token CHANGE_ME_NOW ===');
    const ok = await httpReq('GET', '/api/admin/config', null, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(ok.status === 200 && ok.json.ok, '默认 token 应能查询');
    assert(ok.json.config.appellation.emperor, 'config 包含 emperor');

    console.log('=== 3. admin API: 修改皇帝名 ===');
    const cur = ok.json.config;
    const original = cur.appellation.emperor;
    cur.appellation.emperor = '乾隆';
    const upd = await httpReq('POST', '/api/admin/config', { config: cur }, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(upd.status === 200 && upd.json.ok, '修改成功');

    const verify = await httpReq('GET', '/api/admin/config', null, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(verify.json.config.appellation.emperor === '乾隆', '皇帝名已是乾隆');

    console.log('=== 4. admin API: 非法 maxTurns ===');
    const badcfg = JSON.parse(JSON.stringify(verify.json.config));
    badcfg.palace.maxTurns = 100;
    const bad2 = await httpReq('POST', '/api/admin/config', { config: badcfg }, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(bad2.status === 400, '越界 maxTurns 应被拒');

    console.log('=== 5. admin API: stats ===');
    const stats = await httpReq('GET', '/api/admin/stats', null, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(stats.json.ok && typeof stats.json.rooms === 'number', 'stats 字段正常');

    // === 6. 五子棋独立模式 ===
    console.log('\n=== 6. 五子棋独立模式：建房 + 加入 ===');
    const sa = ioClient(URL, { transports: ['websocket'] });
    const sb = ioClient(URL, { transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => sa.on('connect', r)),
      new Promise((r) => sb.on('connect', r)),
    ]);
    sa.emit('create_room', { name: '阿黑', mode: 'gomoku' });
    const aJoin = await waitFor(sa, 'joined');
    assert(aJoin.mode === 'gomoku', '建房 mode=gomoku');
    sb.emit('join_room', { code: aJoin.code, name: '阿白' });
    const bJoin = await waitFor(sb, 'joined');
    assert(bJoin.mode === 'gomoku', '加入 mode=gomoku');

    // 收到棋局开始的 state
    const aState1 = await waitFor(sa, 'state', (s) => s.gomoku && s.phase === 'duel');
    assert(aState1.gomoku.board.length === aState1.gomoku.board[0].length, '棋盘是正方');
    assert(aState1.gomoku.yourColor === 1, 'A 是黑');
    assert(aState1.gomoku.yourTurn === true, 'A 先手');
    const bState1 = await waitFor(sb, 'state', (s) => s.gomoku);
    assert(bState1.gomoku.yourColor === 2, 'B 是白');
    assert(bState1.gomoku.yourTurn === false, 'B 等待');

    // 模拟 5 子横向连胜（黑：(0,0..4)；白随便走）
    console.log('=== 7. 五子棋落子并胜出 ===');
    let finalA = null;
    for (let i = 0; i < 5; i++) {
      const isLast = i === 4;
      const aWait = waitFor(sa, 'state',
        (s) => isLast
          ? (s.phase === 'ended')
          : (s.gomoku && s.gomoku.lastMove && s.gomoku.lastMove.row === 0 && s.gomoku.lastMove.col === i && s.gomoku.lastMove.color === 1),
        4000, isLast ? '等A端结束' : `A 落子 (0,${i})`);
      sa.emit('place_stone', { row: 0, col: i });
      const aSt = await aWait;
      if (isLast) finalA = aSt;
      if (i < 4) {
        const bWait = waitFor(sb, 'state',
          (s) => s.gomoku && s.gomoku.lastMove && s.gomoku.lastMove.row === 8 && s.gomoku.lastMove.col === i && s.gomoku.lastMove.color === 2,
          4000, `B 落子 (8,${i})`);
        sb.emit('place_stone', { row: 8, col: i });
        await bWait;
      }
    }
    assert(finalA.gomoku.winner === 1, 'A 黑胜');
    assert(finalA.you.score === 1, 'A 得 1 分');

    sa.disconnect(); sb.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // === 8. palace 模式：陷害决斗 ===
    console.log('\n=== 8. palace 模式：陷害决斗触发 ===');
    const pa = ioClient(URL, { transports: ['websocket'] });
    const pb = ioClient(URL, { transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => pa.on('connect', r)),
      new Promise((r) => pb.on('connect', r)),
    ]);
    pa.emit('create_room', { name: '宫A', mode: 'palace' });
    const paJoin = await waitFor(pa, 'joined');
    assert(paJoin.mode === 'palace', '宫斗 mode=palace');
    pb.emit('join_room', { code: paJoin.code, name: '宫B' });
    await waitFor(pb, 'joined');

    // 等开局
    let paS = await waitFor(pa, 'state', (s) => s.phase === 'choosing');
    let pbS = await waitFor(pb, 'state', (s) => s.phase === 'choosing');
    assert(paS.appellation.emperor === '乾隆', '使用了修改后的 emperor 名');

    // 双方陷害 -> 触发决斗
    pa.emit('choose_action', { action: 'sabotage' });
    pb.emit('choose_action', { action: 'sabotage' });

    const duelA = await waitFor(pa, 'state', (s) => s.phase === 'duel', 4000);
    assert(duelA.gomoku && duelA.gomoku.duel === 'sabotage', '触发 sabotage 决斗');
    assert(duelA.gomoku.yourColor === 1, '建房者执黑');

    let afterDuel = null;
    for (let i = 0; i < 5; i++) {
      const isLast = i === 4;
      const aWait = waitFor(pa, 'state',
        (s) => isLast
          ? (s.phase === 'choosing' || s.phase === 'ended')
          : (s.gomoku && s.gomoku.lastMove && s.gomoku.lastMove.row === 4 && s.gomoku.lastMove.col === i),
        4000, isLast ? '决斗后回宫' : `A决斗 (4,${i})`);
      pa.emit('place_stone', { row: 4, col: i });
      const st = await aWait;
      if (isLast) afterDuel = st;
      if (i < 4) {
        const bWait = waitFor(pb, 'state',
          (s) => s.gomoku && s.gomoku.lastMove && s.gomoku.lastMove.row === 0 && s.gomoku.lastMove.col === i,
          4000, `B决斗 (0,${i})`);
        pb.emit('place_stone', { row: 0, col: i });
        await bWait;
      }
    }
    assert(afterDuel.phase === 'choosing', '决斗后回到 choosing');
    assert(afterDuel.turn === 2, '回合推进到 2');
    assert(afterDuel.log.some((l) => l.includes('棋决胜负')), '日志有"棋决胜负"');
    assert(afterDuel.log.some((l) => l.includes('棋局已分胜负')), '日志有"棋局已分胜负"');

    pa.disconnect(); pb.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // 还原 config 到默认（清理）
    const reset = await httpReq('POST', '/api/admin/reset', {}, { 'X-Admin-Token': 'CHANGE_ME_NOW' });
    assert(reset.status === 200, 'reset 成功');

  } catch (e) {
    console.error('FATAL:', e.message);
    failed++;
    errors.push(e.message);
  }

  proc.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    console.log(`✅ 集成测试全部通过 (${passed} 断言)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failed}/${passed + failed} 失败`);
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });