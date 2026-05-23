/**
 * duel 模块统一单测：rps, guess, gomoku
 * 跑法：node test-duels.js
 */

const rps = require('./duels/rps');
const guess = require('./duels/guess');
const gomoku = require('./duels/gomoku');
const pool = require('./duels');

let passed = 0, failed = 0;
const errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push(m); console.error('  ✗', m); } }
function section(name, fn) {
  console.log('\n=== ' + name + ' ===');
  const before = failed;
  try { fn(); } catch (e) { failed++; errors.push(name + ': ' + e.message); console.error('  ✗ EXCEPTION:', e.message, e.stack); }
  console.log(failed === before ? '  ✅ 通过' : '  ❌ ' + (failed - before) + ' 个失败');
}

// ============================================================
// 通用接口契约：每个 duel 都必须有这些函数
// ============================================================
function checkContract(mod, name) {
  for (const fn of ['init', 'validateAction', 'applyAction', 'isOver', 'getWinner',
                    'whoseTurn', 'canAct', 'buildView', 'getDeadline', 'onTimeout']) {
    assert(typeof mod[fn] === 'function', `${name}.${fn} 是函数`);
  }
  for (const meta of ['id', 'name', 'icon', 'description']) {
    assert(typeof mod[meta] === 'string' && mod[meta].length > 0, `${name}.${meta} 非空字符串`);
  }
}

section('0. 接口契约', () => {
  checkContract(rps, 'rps');
  checkContract(guess, 'guess');
  checkContract(gomoku, 'gomoku');
});

// ============================================================
// rps
// ============================================================

section('1. rps 基础流程', () => {
  const s = rps.init({});
  assert(s.score[0] === 0 && s.score[1] === 0, '初始比分 0:0');
  assert(rps.canAct(s, 0) && rps.canAct(s, 1), '双方都可行动');
  assert(rps.whoseTurn(s) === -1, 'whoseTurn 返回 -1（同时回合）');

  // P0 出 rock，未结算
  let r = rps.validateAction(s, 0, { choice: 'rock' });
  assert(r.ok, 'P0 出 rock 合法');
  rps.applyAction(s, 0, { choice: 'rock' });
  assert(s.pending[0] === 'rock', 'P0 暗选已记录');
  assert(s.score[0] === 0, '尚未结算');
  assert(!rps.canAct(s, 0), 'P0 不能再出');
  assert(rps.canAct(s, 1), 'P1 仍可出');

  // P0 重复出 -> 拒
  r = rps.validateAction(s, 0, { choice: 'paper' });
  assert(!r.ok, 'P0 重复出招被拒');

  // P1 出 scissors -> P0 赢本轮
  rps.applyAction(s, 1, { choice: 'scissors' });
  assert(s.score[0] === 1 && s.score[1] === 0, 'rock 击败 scissors，P0 胜本局');
  assert(s.rounds.length === 1, '一回合记录');
  assert(s.pending[0] === null && s.pending[1] === null, '回合后 pending 清空');

  // 第二局：双方同出 paper -> 平
  rps.applyAction(s, 0, { choice: 'paper' });
  rps.applyAction(s, 1, { choice: 'paper' });
  assert(s.score[0] === 1 && s.score[1] === 0, '平局不计分');
  assert(s.rounds[1].winner === -1, '平局 winner=-1');

  // 第三局：P0 出 paper, P1 出 rock -> P0 赢，达到 2 胜
  rps.applyAction(s, 0, { choice: 'paper' });
  rps.applyAction(s, 1, { choice: 'rock' });
  assert(s.score[0] === 2, 'P0 达到 2 胜');
  assert(rps.isOver(s), '决斗结束');
  assert(rps.getWinner(s) === 0, 'P0 是赢家');
});

section('2. rps 非法输入', () => {
  const s = rps.init({});
  assert(!rps.validateAction(s, 0, { choice: 'invalid' }).ok, '非法 choice 被拒');
  assert(!rps.validateAction(s, 2, { choice: 'rock' }).ok, '非法 player 被拒');
  assert(!rps.validateAction(s, 0, null).ok, 'null payload 被拒');
});

section('3. rps 视图隐藏对方未亮的选择', () => {
  const s = rps.init({});
  rps.applyAction(s, 0, { choice: 'rock' });
  const v0 = rps.buildView(s, 0);
  const v1 = rps.buildView(s, 1);
  assert(v0.yourPending === 'rock', 'P0 视图看到自己的选择');
  assert(v1.yourPending === null, 'P1 视图看不到对方选择');
  assert(v1.opponentPicked === true, 'P1 知道对方已出');
  assert(v0.yourTurn === false && v1.yourTurn === true, 'turn 状态正确');
});

section('4. rps 超时', () => {
  const s = rps.init({});
  // 双方都没出 -> 超时
  rps.onTimeout(s);
  assert(s.rounds.length === 1 && s.rounds[0].winner === -1, '双方超时为平局');
  assert(s.score[0] === 0 && s.score[1] === 0, '不计分');

  // P0 出，P1 不出 -> P0 胜本轮
  rps.applyAction(s, 0, { choice: 'rock' });
  rps.onTimeout(s);
  assert(s.score[0] === 1, '只 P0 出招，P0 胜本轮');
});

// ============================================================
// guess
// ============================================================

section('5. guess 基础流程', () => {
  const s = guess.init({});
  let r = guess.validateAction(s, 0, { num: 50 });
  assert(r.ok, '50 合法');
  guess.applyAction(s, 0, { num: 50 });
  guess.applyAction(s, 1, { num: 75 });
  assert(s.score[1] === 1, 'P1 出 75 > 50，P1 胜本局');
  assert(s.rounds[0].winner === 1, '记录正确');
});

section('6. guess 边界 / 非法输入', () => {
  const s = guess.init({});
  assert(!guess.validateAction(s, 0, { num: 0 }).ok, '0 被拒');
  assert(!guess.validateAction(s, 0, { num: 101 }).ok, '101 被拒');
  assert(!guess.validateAction(s, 0, { num: 1.5 }).ok, '小数被拒');
  assert(!guess.validateAction(s, 0, { num: 'abc' }).ok, '字符串被拒');
  assert(guess.validateAction(s, 0, { num: 1 }).ok, '1 合法');
  assert(guess.validateAction(s, 0, { num: 100 }).ok, '100 合法');
});

section('7. guess 同数平局重抽', () => {
  const s = guess.init({});
  guess.applyAction(s, 0, { num: 50 });
  guess.applyAction(s, 1, { num: 50 });
  assert(s.score[0] === 0 && s.score[1] === 0, '平局不计分');
  assert(s.rounds[0].winner === -1, '记录平局');
  // 还能继续出
  assert(guess.canAct(s, 0) && guess.canAct(s, 1), '双方仍可继续');
});

section('8. guess 完整三局两胜', () => {
  const s = guess.init({});
  // 第 1 局：P0 出 100, P1 出 1 -> P0 胜
  guess.applyAction(s, 0, { num: 100 });
  guess.applyAction(s, 1, { num: 1 });
  assert(s.score[0] === 1, '第 1 局 P0 胜');
  // 第 2 局：P0 出 50, P1 出 99 -> P1 胜
  guess.applyAction(s, 0, { num: 50 });
  guess.applyAction(s, 1, { num: 99 });
  assert(s.score[1] === 1, '第 2 局 P1 胜');
  // 第 3 局：P0 出 80, P1 出 70 -> P0 胜
  guess.applyAction(s, 0, { num: 80 });
  guess.applyAction(s, 1, { num: 70 });
  assert(guess.isOver(s) && guess.getWinner(s) === 0, 'P0 2:1 胜');
});

section('9. guess 超时', () => {
  const s = guess.init({});
  guess.applyAction(s, 0, { num: 50 });
  guess.onTimeout(s);
  assert(s.score[0] === 1, 'P1 未出，P0 胜本轮');
});

// ============================================================
// gomoku 适配器（沿用根目录 gomoku.js 算法）
// ============================================================

section('10. gomoku 适配器基础', () => {
  const s = gomoku.init({});
  assert(s.boardSize === 9, '默认 9x9');
  assert(s.current === 0, '攻方先手');
  assert(s.winner === null, '初始无赢家');
  assert(gomoku.canAct(s, 0) === true, '攻方可行动');
  assert(gomoku.canAct(s, 1) === false, '守方暂时不能');

  let r = gomoku.validateAction(s, 1, { row: 0, col: 0 });
  assert(!r.ok, '非当前方落子被拒');

  r = gomoku.validateAction(s, 0, { row: 0, col: 0 });
  assert(r.ok, '攻方第一手合法');
  gomoku.applyAction(s, 0, { row: 0, col: 0 });
  assert(s.current === 1, '轮到守方');
});

section('11. gomoku 攻方连五胜出', () => {
  const s = gomoku.init({});
  // 攻方在第 0 行连五；守方下不冲突的位置
  for (let i = 0; i < 5; i++) {
    gomoku.applyAction(s, 0, { row: 0, col: i });
    if (i < 4) gomoku.applyAction(s, 1, { row: 8, col: i });
  }
  assert(gomoku.isOver(s), '决斗结束');
  assert(gomoku.getWinner(s) === 0, '攻方胜');
});

section('12. gomoku 视图', () => {
  const s = gomoku.init({});
  gomoku.applyAction(s, 0, { row: 4, col: 4 });
  const v0 = gomoku.buildView(s, 0);
  const v1 = gomoku.buildView(s, 1);
  assert(v0.youAreAttacker && !v1.youAreAttacker, 'attacker 标记');
  assert(v0.yourColor === 1 && v1.yourColor === 2, '颜色映射');
  assert(!v0.yourTurn && v1.yourTurn, '当前轮')
});

section('13. gomoku 超时判负', () => {
  const s = gomoku.init({});
  gomoku.applyAction(s, 0, { row: 0, col: 0 });
  // 现在 current=1，守方超时 -> 攻方(0) 胜
  gomoku.onTimeout(s);
  assert(gomoku.isOver(s), '超时结束');
  assert(gomoku.getWinner(s) === 0, '守方超时，攻方胜');
});

// ============================================================
// pool 调度器
// ============================================================

section('14. pool 调度器', () => {
  const list = pool.listAvailable({ duels: { enabled: ['gomoku', 'rps', 'guess'] } });
  assert(list.length === 3, '3 种 duel 全启用');

  const list2 = pool.listAvailable({ duels: { enabled: ['rps'] } });
  assert(list2.length === 1 && list2[0] === rps, '只启用 rps');

  // 默认不传 config 用全部
  const all = pool.listAvailable();
  assert(all.length === 3, '默认 3 种');

  // pickRandom 总能取出一个 module
  for (let i = 0; i < 30; i++) {
    const m = pool.pickRandom({});
    assert(typeof m.init === 'function', 'pickRandom 返回有效模块');
  }

  assert(pool.getById('rps') === rps, 'getById 正确');
  assert(pool.getById('xxx') === null, '不存在返回 null');
});

section('15. pool 抽样分布粗略均匀', () => {
  const counts = { gomoku: 0, rps: 0, guess: 0 };
  for (let i = 0; i < 600; i++) {
    counts[pool.pickRandom({}).id]++;
  }
  // 每个不少于 100 次（200 期望 ± 合理范围）
  assert(counts.gomoku > 100 && counts.rps > 100 && counts.guess > 100,
    `分布合理：${JSON.stringify(counts)}`);
});

// ============================================================
console.log('\n' + '='.repeat(60));
if (failed === 0) {
  console.log('✅ duel 模块全部通过 (' + passed + ' 断言)');
  process.exit(0);
} else {
  console.log('❌ ' + failed + '/' + (passed + failed) + ' 失败');
  errors.forEach((e) => console.log('  -', e));
  process.exit(1);
}
