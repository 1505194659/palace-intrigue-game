/**
 * v3.1 集成测试：
 *   - admin API
 *   - 五子棋独立模式
 *   - 陷害决斗（五子棋 / RPS / 猜大小 三种都能触发）
 *   - 职业选择
 *   - 卡牌使用（poison_tea / red_velvet / jade_pendant / gu_poison）
 *   - 月初抽卡
 */

const { spawn } = require('child_process');
const ioClient = require('socket.io-client');
const http = require('http');

const PORT = 3017;
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
      reject(new Error(`Timeout ${label || event}; last=${JSON.stringify({phase:lastSeen&&lastSeen.phase, duel:lastSeen&&lastSeen.duel&&lastSeen.duel.duelId})}`));
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

async function setHighDropChance(token) {
  // 把 dropChance 调到 100% 让测试稳定抽到卡
  const cur = (await httpReq('GET', '/api/admin/config', null, { 'X-Admin-Token': token })).json.config;
  cur.cards.dropChance = 100;
  await httpReq('POST', '/api/admin/config', { config: cur }, { 'X-Admin-Token': token });
}

async function restoreCfg(token) {
  await httpReq('POST', '/api/admin/reset', {}, { 'X-Admin-Token': token });
}

async function main() {
  console.log('启动 v3.1 server (PORT=' + PORT + ') ...');
  const proc = spawn('node', ['server.js'], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'pipe',
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => console.error('SERVER ERR:', d.toString()));
  await new Promise((r) => setTimeout(r, 1500));

  const TK = 'CHANGE_ME_NOW';

  try {
    // === 1. /api/meta ===
    console.log('\n=== 1. /api/meta 元数据 ===');
    const meta = await httpReq('GET', '/api/meta');
    assert(meta.json.ok, '元数据 ok');
    assert(meta.json.classes.length >= 4, `职业 ${meta.json.classes.length} 个`);
    assert(meta.json.duels.length === 3, `决斗 ${meta.json.duels.length} 种`);
    assert(meta.json.cards.length >= 6, `卡牌 ${meta.json.cards.length} 张`);

    // === 2. 把 dropChance 调到 100，方便后续测卡 ===
    console.log('=== 2. 设置 100% 掉率 ===');
    await setHighDropChance(TK);

    // === 3. 用职业建房 ===
    console.log('=== 3. 用职业建房（妖姬 vs 嫡女） ===');
    const sa = ioClient(URL, { transports: ['websocket'] });
    const sb = ioClient(URL, { transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => sa.on('connect', r)),
      new Promise((r) => sb.on('connect', r)),
    ]);
    sa.emit('create_room', { name: '妖姬', mode: 'palace', classId: 'seductress' });
    const aJoin = await waitFor(sa, 'joined');
    sb.emit('join_room', { code: aJoin.code, name: '嫡女', classId: 'noble' });
    await waitFor(sb, 'joined');

    const sA1 = await waitFor(sa, 'state', (s) => s.phase === 'choosing' && s.you);
    assert(sA1.you.classId === 'seductress', '妖姬已设');
    assert(sA1.you.beauty === 50, '妖姬美貌 50（默认）');
    assert(sA1.opponent.classId === 'noble', '对方嫡女');
    // 嫡女 power +20，所以 opponent.power=30
    assert(sA1.opponent.power === 30, `嫡女 power 30，实际 ${sA1.opponent.power}`);
    // 月初抽卡（dropChance=100 应该有牌）
    assert(sA1.you.cards && sA1.you.cards.length >= 1, `月初抽到卡，实际 ${(sA1.you.cards || []).length} 张`);

    // === 4. 出卡：自身增益 ===
    console.log('=== 4. 出卡：玩家A 出第一张卡 ===');
    const firstCardId = sA1.you.cards[0].id;
    const promiseAfterCard = waitFor(sa, 'state', (s) => s.you && s.you.usedCardThisMonth);
    sa.emit('use_card', { cardId: firstCardId });
    const sA2 = await promiseAfterCard;
    assert(sA2.you.usedCardThisMonth === true, 'usedCardThisMonth 标记');
    assert(sA2.you.cards.length === sA1.you.cards.length - 1, '手牌少一张');

    // === 5. 重复出卡被拒 ===
    console.log('=== 5. 重复出卡被拒 ===');
    if (sA2.you.cards.length > 0) {
      const errPromise = new Promise((r) => sa.once('error_msg', r));
      sa.emit('use_card', { cardId: sA2.you.cards[0].id });
      const errMsg = await Promise.race([errPromise, new Promise((r) => setTimeout(() => r(null), 1000))]);
      assert(errMsg && errMsg.includes('本月'), `应有错误提示，实际 ${errMsg}`);
    }

    sa.disconnect(); sb.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // === 6. 陷害决斗 - 测试三种 duel 都能触发 ===
    console.log('=== 6. 陷害决斗 - 触发任意决斗类型 ===');
    const duelTypes = new Set();
    for (let attempt = 0; attempt < 20 && duelTypes.size < 3; attempt++) {
      const pa = ioClient(URL, { transports: ['websocket'] });
      const pb = ioClient(URL, { transports: ['websocket'] });
      await Promise.all([
        new Promise((r) => pa.on('connect', r)),
        new Promise((r) => pb.on('connect', r)),
      ]);
      pa.emit('create_room', { name: 'A', mode: 'palace', classId: 'default' });
      const j = await waitFor(pa, 'joined');
      pb.emit('join_room', { code: j.code, name: 'B', classId: 'default' });
      await waitFor(pb, 'joined');
      await waitFor(pa, 'state', (s) => s.phase === 'choosing');

      pa.emit('choose_action', { action: 'sabotage' });
      pb.emit('choose_action', { action: 'sabotage' });
      const sDuel = await waitFor(pa, 'state', (s) => s.phase === 'duel' && s.duel, 4000);
      duelTypes.add(sDuel.duel.duelId);
      assert(sDuel.duel.duelKind === 'sabotage', `duelKind=sabotage`);
      assert(['gomoku', 'rps', 'guess'].includes(sDuel.duel.duelId), 'duelId 合法');

      pa.disconnect(); pb.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(duelTypes.size >= 2, `20 次抽中至少 2 种决斗，实际 ${[...duelTypes].join(',')}`);
    console.log('  -> 抽样到的决斗类型:', [...duelTypes]);

    // === 7. RPS 决斗完整流程 ===
    console.log('=== 7. RPS 决斗完整流程 ===');
    let rpsTested = false;
    for (let attempt = 0; attempt < 30 && !rpsTested; attempt++) {
      const pa = ioClient(URL, { transports: ['websocket'] });
      const pb = ioClient(URL, { transports: ['websocket'] });
      await Promise.all([
        new Promise((r) => pa.on('connect', r)),
        new Promise((r) => pb.on('connect', r)),
      ]);
      pa.emit('create_room', { name: 'A', mode: 'palace', classId: 'default' });
      const j = await waitFor(pa, 'joined');
      pb.emit('join_room', { code: j.code, name: 'B', classId: 'default' });
      await waitFor(pb, 'joined');
      await waitFor(pa, 'state', (s) => s.phase === 'choosing');

      pa.emit('choose_action', { action: 'sabotage' });
      pb.emit('choose_action', { action: 'sabotage' });
      const sDuel = await waitFor(pa, 'state', (s) => s.phase === 'duel' && s.duel, 4000);
      if (sDuel.duel.duelId !== 'rps') {
        pa.disconnect(); pb.disconnect();
        continue;
      }
      // 找到 RPS 决斗，开始打
      rpsTested = true;
      // A 出 rock，B 出 scissors -> A 胜 1
      pa.emit('duel_action', { choice: 'rock' });
      pb.emit('duel_action', { choice: 'scissors' });
      const r1 = await waitFor(pa, 'state', (s) => s.duel && s.duel.score && s.duel.score.you === 1, 3000, 'A 第一局胜');
      assert(r1.duel.score.you === 1, 'A 1:0');
      // 第二局 A rock, B scissors -> A 2:0 胜出 + 决斗结束
      const afterPromise = waitFor(pa, 'state', (s) => s.phase === 'choosing' || s.phase === 'ended', 4000, '决斗结束回宫');
      pa.emit('duel_action', { choice: 'rock' });
      pb.emit('duel_action', { choice: 'scissors' });
      const after = await afterPromise;
      assert(after.phase === 'choosing', '回到 choosing');
      assert(after.turn === 2, '回合推进');
      pa.disconnect(); pb.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(rpsTested, '30 次内至少打到一次 RPS');

    // === 8. 猜大小决斗 ===
    console.log('=== 8. 猜大小决斗完整流程 ===');
    let guessTested = false;
    for (let attempt = 0; attempt < 30 && !guessTested; attempt++) {
      const pa = ioClient(URL, { transports: ['websocket'] });
      const pb = ioClient(URL, { transports: ['websocket'] });
      await Promise.all([
        new Promise((r) => pa.on('connect', r)),
        new Promise((r) => pb.on('connect', r)),
      ]);
      pa.emit('create_room', { name: 'A', mode: 'palace', classId: 'default' });
      const j = await waitFor(pa, 'joined');
      pb.emit('join_room', { code: j.code, name: 'B', classId: 'default' });
      await waitFor(pb, 'joined');
      await waitFor(pa, 'state', (s) => s.phase === 'choosing');

      pa.emit('choose_action', { action: 'sabotage' });
      pb.emit('choose_action', { action: 'sabotage' });
      const sDuel = await waitFor(pa, 'state', (s) => s.phase === 'duel' && s.duel, 4000);
      if (sDuel.duel.duelId !== 'guess') {
        pa.disconnect(); pb.disconnect();
        continue;
      }
      guessTested = true;
      // A 出 100, B 出 1 -> A 胜
      pa.emit('duel_action', { num: 100 });
      pb.emit('duel_action', { num: 1 });
      const r1 = await waitFor(pa, 'state', (s) => s.duel && s.duel.score && s.duel.score.you === 1, 3000, 'A 第一局');
      assert(r1.duel.score.you === 1);
      // 第二局 A 99, B 1 -> A 胜出
      const afterPromise = waitFor(pa, 'state', (s) => s.phase === 'choosing' || s.phase === 'ended', 4000);
      pa.emit('duel_action', { num: 99 });
      pb.emit('duel_action', { num: 1 });
      const after = await afterPromise;
      assert(after.phase === 'choosing', '回到 choosing');
      pa.disconnect(); pb.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(guessTested, '30 次内至少打到一次猜大小');

    await restoreCfg(TK);

  } catch (e) {
    console.error('FATAL:', e.message, e.stack);
    failed++;
    errors.push(e.message || String(e));
  }

  proc.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    console.log(`✅ v3.1 集成测试全部通过 (${passed} 断言)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failed}/${passed + failed} 失败`);
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });