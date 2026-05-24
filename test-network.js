/**
 * 后宫风云 - 网络层端到端测试
 * 用 socket.io-client 模拟两位玩家完整跑一局，验证：
 *   1. 房间创建 / 加入
 *   2. 双方可见对方状态
 *   3. 动作选择 → 双方 ready → 自动结算 → 推进回合
 *   4. **修复回归**：6 月之后 logTotal 仍然递增（之前的 bug：客户端日志卡死）
 *   5. 非法动作被拒绝
 *   6. 游戏结束 + 重开 + 断线
 */
const { io } = require('socket.io-client');

const PORT = process.env.PORT || 3010;
const URL = `http://localhost:${PORT}`;

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

let passed = 0, failed = 0;
const errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push(m); console.error('  ✗', m); } }
function assertEq(a, b, m) { assert(a === b, `${m} — 预期 ${b}, 实际 ${a}`); }

(async () => {
  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });
  let aState = null, bState = null;
  let roomCode = null;
  const aErrors = [];
  const bErrors = [];

  a.on('joined', ({ code }) => { roomCode = code; });
  a.on('state', (s) => { aState = s; });
  b.on('state', (s) => { bState = s; });
  a.on('error_msg', (m) => aErrors.push(m));
  b.on('error_msg', (m) => bErrors.push(m));

  await Promise.all([
    new Promise((r) => a.on('connect', r)),
    new Promise((r) => b.on('connect', r)),
  ]);

  // 1. 创房 & 加入
  a.emit('create_room', { name: '甄嬛' });
  await delay(200);
  assert(roomCode && /^[A-Z0-9]{5}$/.test(roomCode), `房号格式正确 (${roomCode})`);

  b.emit('join_room', { code: roomCode, name: '华妃' });
  await delay(300);
  assert(aState?.youHaveOpponent, 'A 感知到对手');
  assert(bState?.youHaveOpponent, 'B 感知到对手');
  assertEq(aState.phase, 'choosing', 'A phase=choosing');
  assertEq(aState.you.name, '甄嬛', 'A.you 名字');
  assertEq(aState.opponent.name, '华妃', 'A.opp 名字');

  // 验证 v2 新字段
  assert('reputation' in aState.you, 'you 含 reputation 字段');
  assert(Array.isArray(aState.you.childrenNames), 'you 含 childrenNames 数组');
  assert(typeof aState.logTotal === 'number', 'state 含 logTotal 字段');

  // 2. 跑到游戏结束，记录 logTotal 是否单调递增
  const maxTurns = aState.maxTurns || 15;
  const logTotals = [aState.logTotal];
  for (let t = 1; t <= maxTurns + 2; t++) {
    if (aState.phase === 'ended') break;
    a.emit('choose_action', { action: 'train_talent' });
    await delay(120);
    assert(aState.youReady, `T${t} A 已 ready`);
    assert(bState.opponentReady, `T${t} B 看到 A 已 ready`);

    b.emit('choose_action', { action: 'train_beauty' });
    await delay(350);
    if (aState.phase === 'ended') break;
    logTotals.push(aState.logTotal);
  }

  // 3. 验证 logTotal 单调递增（核心回归测试）
  let monotonic = true;
  for (let i = 1; i < logTotals.length; i++) {
    if (logTotals[i] <= logTotals[i - 1]) { monotonic = false; break; }
  }
  assert(monotonic, `logTotal 单调递增 (${logTotals.join(',')})`);

  // 4. 关键：6 月之后 logTotal 应远超 30（旧 bug：截断到 30 就不变了）
  if (logTotals.length >= 7) {
    assert(logTotals[6] > 30, `第 7 个采样点 logTotal=${logTotals[6]} 应 > 30（修复回归）`);
  }

  // 5. 局已结束
  await delay(200);
  assertEq(aState.phase, 'ended', `${maxTurns} 月后游戏结束`);

  // 6. 非法动作 - 在已结束的房里尝试，应当被忽略
  // v3.8: rematch 需要双方都按一次才开局
  a.emit('rematch');
  await delay(200);
  assertEq(aState.phase, 'ended', '仅 a 按 rematch 时仍为 ended');
  assert(aState.rematch && aState.rematch.youReady, 'a 已记为就绪');
  assert(aState.rematch && !aState.rematch.opponentReady, 'b 还未就绪');
  b.emit('rematch');
  await delay(200);
  assertEq(aState.phase, 'choosing', '双方都按后回到 choosing');
  assertEq(aState.turn, 1, 'rematch 后 turn=1');
  // v3.1: 月初可能抽卡，logTotal=1（重开） + 0~2（双方抽卡）
  assert(aState.logTotal >= 1 && aState.logTotal <= 3,
    `rematch 后 logTotal 重置 (1-3)，实际 ${aState.logTotal}`);

  // 试图求子（初始 favor=30 < 50，必定不合法）
  const beforeErrCount = aErrors.length;
  a.emit('choose_action', { action: 'try_child' });
  await delay(200);
  assert(aErrors.length > beforeErrCount, '非法 try_child 被服务端拒绝');

  // 7. 断线处理
  b.disconnect();
  await delay(300);
  assertEq(aState.phase, 'ended', 'B 断线后 A 进入 ended');
  assert(aState.log.some((l) => l.includes('对方已离开')), '日志含"对方已离开"');

  a.disconnect();

  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    console.log(`✅ 网络层全部通过 (${passed} 断言)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failed}/${passed + failed} 失败`);
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
})().catch((e) => {
  console.error('测试抛异常：', e);
  process.exit(1);
});
