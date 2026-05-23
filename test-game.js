/**
 * 后宫风云 - 鲁棒性测试套件
 *
 * 跑法：node test-game.js
 *
 * 覆盖场景：
 *   1.  初始状态
 *   2.  动作合法性（含禁足/怀孕/体力不足等边界）
 *   3.  动作执行后数值边界（50 次随机）
 *   4.  圣宠不归零（30 个随机种子）
 *   5.  完整 10 月对局（5 种策略 × 50 局）
 *   6.  怀孕生子流程（20 个种子）
 *   7.  晋位完整链路
 *   8.  胜负判定各分支
 *   9.  日志一致性（每月必有"📜"标记）
 *   10. publicView 字段完整
 *   11. 200 场随机对局压力测试 + 不变量
 *   12. 修复回归：6 月后日志总长仍递增
 *   13. 修复回归：圣宠永远 ≥ 5
 */

const game = require('./game');
const {
  newPlayerState, applyAction, resolveTurn, isActionLegal, calcScore, checkEnd,
  publicView, MAX_TURNS, ACTIONS, RANK_NAMES, makeRng,
} = game;

let passed = 0;
let failed = 0;
const errors = [];

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; errors.push(msg); console.error('  ✗', msg); }
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg} — 预期 ${expected}, 实际 ${actual}`);
}

function assertInRange(v, lo, hi, msg) {
  assert(v >= lo && v <= hi, `${msg}: ${v} 不在 [${lo}, ${hi}]`);
}

function assertStateValid(s, ctx = '') {
  assertInRange(s.favor, 0, 100, `${ctx} favor`);
  assertInRange(s.power, 0, 100, `${ctx} power`);
  assertInRange(s.reputation, 0, 100, `${ctx} reputation`);
  assertInRange(s.beauty, 0, 100, `${ctx} beauty`);
  assertInRange(s.talent, 0, 100, `${ctx} talent`);
  assertInRange(s.scheme, 0, 100, `${ctx} scheme`);
  assertInRange(s.energy, 0, 100, `${ctx} energy`);
  assertInRange(s.rank, 0, 7, `${ctx} rank`);
  assertInRange(s.children, 0, 20, `${ctx} children`);
  assertInRange(s.pregnant, 0, 3, `${ctx} pregnant`);
  assertInRange(s.imprisoned, 0, 5, `${ctx} imprisoned`);
  assert(typeof s.name === 'string' && s.name.length > 0, `${ctx} name 有效`);
  assert(Array.isArray(s.childrenNames), `${ctx} childrenNames 是数组`);
  assert(s.childrenNames.length === s.children, `${ctx} 子嗣数与名字数一致`);
}

function section(name, fn) {
  console.log(`\n=== ${name} ===`);
  const beforeFails = failed;
  try {
    fn();
  } catch (e) {
    failed++;
    console.error('  ✗ 抛出异常:', e.message);
    console.error(e.stack);
    errors.push(`${name}: ${e.message}`);
  }
  const newFails = failed - beforeFails;
  console.log(newFails === 0 ? `  ✅ 通过` : `  ❌ ${newFails} 个失败`);
}

// ============================================================
// 1. 初始状态
// ============================================================
section('1. 初始状态', () => {
  const s = newPlayerState('甄嬛');
  assertEq(s.name, '甄嬛', '名字');
  assertEq(s.rank, 0, '初始位分=答应');
  assertEq(s.children, 0, '初始无子嗣');
  assertEq(s.pregnant, 0, '初始未怀孕');
  assertEq(s.imprisoned, 0, '初始未禁足');
  assertStateValid(s, '初始');
  assert(s.favor >= 20, '初始圣宠 ≥ 20');
  assert(s.energy >= 80, '初始体力 ≥ 80');
  assert(Array.isArray(s.childrenNames), '初始 childrenNames 是数组');
});

// ============================================================
// 2. 动作合法性
// ============================================================
section('2. 动作合法性', () => {
  const s = newPlayerState('A');
  assert(isActionLegal(s, 'serve'), '初始 serve 合法');
  assert(isActionLegal(s, 'defend'), 'defend 永远合法（非禁足）');
  assert(!isActionLegal(s, 'try_child'), '初始 try_child 不合法 (favor < 50)');

  s.energy = 5;
  assert(!isActionLegal(s, 'serve'), '体力5时 serve 不合法');
  assert(!isActionLegal(s, 'sabotage'), '体力5时 sabotage 不合法');
  assert(!isActionLegal(s, 'train_talent'), '体力5时 train_talent 不合法');
  assert(isActionLegal(s, 'defend'), '体力5时 defend 仍合法');

  s.energy = 100;
  s.imprisoned = 1;
  for (const a of ACTIONS) {
    if (a === 'defend') {
      assert(isActionLegal(s, a), `禁足时 ${a} 仍合法`);
    } else {
      assert(!isActionLegal(s, a), `禁足时 ${a} 应不合法`);
    }
  }

  s.imprisoned = 0;
  s.pregnant = 2;
  s.favor = 70;
  s.energy = 100;
  assert(!isActionLegal(s, 'serve'), '怀孕时 serve 不合法');
  assert(!isActionLegal(s, 'try_child'), '怀孕时 try_child 不合法');
  assert(isActionLegal(s, 'train_talent'), '怀孕时 train_talent 仍合法');

  s.pregnant = 0;
  s.rank = 7;
  assert(!isActionLegal(s, 'promote'), '皇后不能再升');

  s.rank = 0;
  s.favor = 0;
  s.power = 0;
  s.reputation = 0;
  assert(!isActionLegal(s, 'promote'), '初始无圣宠时升位不合法');

  s.favor = 100; s.power = 100; s.reputation = 100;
  assert(isActionLegal(s, 'promote'), '满足条件升位合法');
});

// ============================================================
// 3. 动作执行后数值边界
// ============================================================
section('3. 动作数值不越界（50 次随机起点 × 8 动作）', () => {
  for (let trial = 0; trial < 50; trial++) {
    const seedRng = makeRng(trial + 1);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.favor = Math.floor(seedRng() * 100);
    b.favor = Math.floor(seedRng() * 100);
    a.energy = 60;
    b.energy = 60;
    a.scheme = Math.floor(seedRng() * 100);
    b.scheme = Math.floor(seedRng() * 100);

    for (const action of ACTIONS) {
      const aClone = JSON.parse(JSON.stringify(a));
      const bClone = JSON.parse(JSON.stringify(b));
      aClone.childrenNames = aClone.childrenNames || [];
      bClone.childrenNames = bClone.childrenNames || [];
      const log = [];
      try {
        applyAction(aClone, bClone, action, log, makeRng(trial * 10 + 1));
      } catch (e) {
        failed++;
        errors.push(`applyAction(${action}) 抛异常: ${e.message}`);
        continue;
      }
      assertStateValid(aClone, `trial ${trial} ${action} self`);
      assertStateValid(bClone, `trial ${trial} ${action} other`);
      assert(log.length > 0, `trial ${trial} ${action} 必产生日志`);
    }
  }
});

// ============================================================
// 4. 圣宠不归零（持续被陷害仍 ≥ 5）
// ============================================================
section('4. 圣宠地板保护：持续被陷害仍 ≥ 5', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    b.scheme = 95; // 让 B 心计很高，陷害更容易得手

    for (let turn = 1; turn <= 10; turn++) {
      // A 一直防守，B 一直陷害（虽然防守免疫陷害，但用 train_talent 替代以触发陷害）
      resolveTurn(a, b, 'train_talent', 'sabotage', turn, rng);
    }
    assert(a.favor >= 5, `seed ${seed}: A 圣宠 ${a.favor} 不应低于 5`);
    assert(b.favor >= 5, `seed ${seed}: B 圣宠 ${b.favor} 不应低于 5`);
    assertStateValid(a, `seed ${seed} A`);
    assertStateValid(b, `seed ${seed} B`);
  }
});

// ============================================================
// 5. 完整对局 - 多种策略
// ============================================================
section('5. 5 策略 × 各 10 场，全部正常结束', () => {
  const strategies = {
    'serve-spam': () => 'serve',
    'sabotage-spam': () => 'sabotage',
    'random': (rng) => ACTIONS[Math.floor(rng() * ACTIONS.length)],
    'defensive': (rng) => rng() < 0.7 ? 'defend' : 'train_talent',
    'aggressive': (rng) => ['serve', 'sabotage', 'build_power'][Math.floor(rng() * 3)],
  };
  const stratNames = Object.keys(strategies);

  for (let n = 0; n < 50; n++) {
    const sa = stratNames[n % 5];
    const sb = stratNames[(n + 2) % 5];
    const rng = makeRng(n * 7 + 3);
    const a = newPlayerState('小甲');
    const b = newPlayerState('小乙');
    let turn = 1;
    let ended = false;
    let logCnt = 0;

    while (turn <= MAX_TURNS && !ended) {
      let actA = strategies[sa](rng);
      let actB = strategies[sb](rng);
      if (!isActionLegal(a, actA)) actA = 'defend';
      if (!isActionLegal(b, actB)) actB = 'defend';

      const r = resolveTurn(a, b, actA, actB, turn, rng);
      logCnt += r.log.length;

      assertStateValid(a, `${sa} vs ${sb} #${n} T${turn} A`);
      assertStateValid(b, `${sa} vs ${sb} #${n} T${turn} B`);

      const end = checkEnd(a, b, turn);
      if (end.ended) {
        ended = true;
        assert(['A', 'B', null].includes(end.winner), `${sa}vs${sb}#${n} winner 合法`);
      }
      turn++;
    }
    assert(ended, `${sa} vs ${sb} #${n} 必须结束`);
    assert(logCnt >= 30, `${sa} vs ${sb} #${n} 日志至少 30 行（实际 ${logCnt}）`);
  }
});

// ============================================================
// 6. 怀孕生子完整流程
// ============================================================
section('6. 怀孕→3月→生子流程', () => {
  let conceived = 0;
  let births = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed * 13);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.favor = 90; a.energy = 100;

    let attempts = 0;
    while (a.pregnant === 0 && attempts < 8) {
      a.energy = 100;
      const log = [];
      applyAction(a, b, 'try_child', log, rng);
      attempts++;
    }
    if (a.pregnant === 0) continue;
    conceived++;

    assert(!isActionLegal(a, 'try_child'), `seed ${seed} 怀孕中不能再求子`);
    assert(!isActionLegal(a, 'serve'), `seed ${seed} 怀孕中不能侍寝`);

    const initChildren = a.children;
    for (let i = 0; i < 4; i++) {
      resolveTurn(a, b, 'defend', 'defend', i + 1, rng);
    }
    if (a.children > initChildren) {
      births++;
      assert(a.childrenNames.length === a.children, `seed ${seed} 子嗣名数=子嗣数`);
      assert(typeof a.childrenNames[a.childrenNames.length - 1] === 'string',
        `seed ${seed} 子嗣有名字`);
    }
  }
  assert(conceived >= 10, `20 次至少 10 次怀孕（实际 ${conceived}）`);
  assert(births === conceived, `所有怀孕都正常生子（${births}/${conceived}）`);
});

// ============================================================
// 7. 晋位完整链路 0→7
// ============================================================
section('7. 晋位 0→7 完整链路', () => {
  const a = newPlayerState('A');
  const b = newPlayerState('B');
  const rng = makeRng(99);
  a.children = 5; // 满足皇后条件

  for (let target = 1; target <= 7; target++) {
    a.favor = 100;
    a.power = 100;
    a.reputation = 100;
    assert(isActionLegal(a, 'promote'), `升至 ${target} 时 promote 应合法`);
    const log = [];
    applyAction(a, b, 'promote', log, rng);
    assertEq(a.rank, target, `升到 ${RANK_NAMES[target]}`);
    assert(log.some((l) => l.includes(RANK_NAMES[target])), `日志含 ${RANK_NAMES[target]}`);
    assert(a.favor >= 15, `升位后圣宠地板 15 (实际 ${a.favor})`);
  }

  assert(!isActionLegal(a, 'promote'), '皇后不能再升');
  const log = [];
  applyAction(a, b, 'promote', log, rng);
  assertEq(a.rank, 7, '继续 promote 不会越界');
});

// ============================================================
// 8. 胜负判定各分支
// ============================================================
section('8. 胜负判定各分支', () => {
  const a = newPlayerState('A');
  const b = newPlayerState('B');

  assert(!checkEnd(a, b, 5).ended, '中途未结束');

  a.rank = 7;
  let r = checkEnd(a, b, 3);
  assert(r.ended && r.winner === 'A', 'A 升皇后立胜');

  b.rank = 7;
  a.favor = 80; b.favor = 30;
  r = checkEnd(a, b, 3);
  assert(r.ended && r.winner === 'A', '双皇后比分');

  a.rank = 0; b.rank = 0;
  a.favor = 80; b.favor = 30;
  a.power = 50; b.power = 50;
  a.reputation = 50; b.reputation = 50;
  r = checkEnd(a, b, MAX_TURNS);
  assert(r.ended && r.winner === 'A', '十月期满高分胜');

  // 平局
  const c = newPlayerState('C');
  const d = newPlayerState('D');
  r = checkEnd(c, d, MAX_TURNS);
  assert(r.ended && r.winner === null, '完全平局 winner=null');
});

// ============================================================
// 9. 日志一致性
// ============================================================
section('9. 日志一致性：每月必有"📜"标记', () => {
  const rng = makeRng(2024);
  const a = newPlayerState('A');
  const b = newPlayerState('B');
  let allLog = [];
  for (let t = 1; t <= 10; t++) {
    const r = resolveTurn(a, b, 'serve', 'serve', t, rng);
    allLog.push(...r.log);
    const monthMarkers = allLog.filter((l) => l.startsWith('📜'));
    assertEq(monthMarkers.length, t, `第 ${t} 月后应有 ${t} 个月份标记`);
    assert(monthMarkers[t - 1].includes(`第 ${t} 月`), `第 ${t} 月标记内容正确`);
  }
});

// ============================================================
// 10. publicView 字段完整
// ============================================================
section('10. publicView 字段完整', () => {
  const a = newPlayerState('A');
  a.children = 2;
  a.childrenNames = ['婉清', '皓宁'];
  const v = publicView(a);
  const required = ['name', 'rank', 'rankName', 'favor', 'power', 'reputation',
    'beauty', 'talent', 'scheme', 'energy',
    'children', 'childrenNames', 'pregnant', 'imprisoned'];
  for (const f of required) {
    assert(f in v, `publicView 含 ${f}`);
  }
  assert(typeof v.rankName === 'string' && v.rankName.length > 0, 'rankName 有效');
  assert(Array.isArray(v.childrenNames), 'childrenNames 是数组');
  // publicView 必须返回独立副本（不能让客户端能反向修改服务端状态）
  v.childrenNames.push('盗版');
  assertEq(a.childrenNames.length, 2, 'publicView 返回独立副本');
});

// ============================================================
// 11. 压力测试 200 场随机对局
// ============================================================
section('11. 压力测试 200 场随机对局', () => {
  let stats = { ended: 0, total: 0, totalTurns: 0, exceptions: 0, invalidStates: 0 };
  for (let g = 0; g < 200; g++) {
    const rng = makeRng(g + 10000);
    const a = newPlayerState('甲');
    const b = newPlayerState('乙');
    let turn = 1;
    let ended = false;
    try {
      while (turn <= MAX_TURNS + 2 && !ended) {
        let actA = ACTIONS[Math.floor(rng() * ACTIONS.length)];
        let actB = ACTIONS[Math.floor(rng() * ACTIONS.length)];
        if (!isActionLegal(a, actA)) actA = 'defend';
        if (!isActionLegal(b, actB)) actB = 'defend';
        resolveTurn(a, b, actA, actB, turn, rng);

        for (const s of [a, b]) {
          if (s.favor < 0 || s.favor > 100 || s.power < 0 || s.power > 100
              || s.reputation < 0 || s.reputation > 100
              || s.energy < 0 || s.energy > 100
              || s.rank < 0 || s.rank > 7
              || s.childrenNames.length !== s.children) {
            stats.invalidStates++;
            console.error(`  [Game ${g}, T${turn}] 非法状态:`, s);
          }
        }

        const end = checkEnd(a, b, turn);
        if (end.ended) ended = true;
        turn++;
      }
      if (ended) stats.ended++;
      stats.total++;
      stats.totalTurns += turn - 1;
    } catch (e) {
      stats.exceptions++;
      console.error(`  [Game ${g}] 抛出:`, e.message);
    }
  }
  assertEq(stats.exceptions, 0, '0 异常');
  assertEq(stats.invalidStates, 0, '0 非法状态');
  assertEq(stats.ended, stats.total, `全部正常结束 (${stats.ended}/${stats.total})`);
  console.log(`     平均 ${(stats.totalTurns / stats.total).toFixed(2)} 回合/场`);
});

// ============================================================
// 12. 修复回归：log 总长持续递增
// ============================================================
section('12. [回归] log 总长每回合都递增（修复 6月后日志不刷新）', () => {
  const rng = makeRng(777);
  const a = newPlayerState('A');
  const b = newPlayerState('B');
  let totalLogLines = 0;
  let prevTotal = 0;
  for (let t = 1; t <= 10; t++) {
    const r = resolveTurn(a, b, 'train_talent', 'train_beauty', t, rng);
    totalLogLines += r.log.length;
    assert(totalLogLines > prevTotal, `第 ${t} 月日志总长应递增 (${prevTotal} -> ${totalLogLines})`);
    prevTotal = totalLogLines;
  }
  assert(totalLogLines >= 30, '10 月日志总长应 ≥ 30 条');
});

// ============================================================
// 13. 修复回归：圣宠永远 ≥ 5（含 promote 后）
// ============================================================
section('13. [回归] promote 后圣宠 ≥ 15（地板）', () => {
  const a = newPlayerState('A');
  const b = newPlayerState('B');
  // 故意把圣宠刚好够升位
  a.favor = 30; a.power = 0; a.reputation = 0; a.children = 0;
  const log = [];
  applyAction(a, b, 'promote', log, makeRng(1));
  assertEq(a.rank, 1, '升一级');
  assert(a.favor >= 15, `升位后圣宠 ${a.favor} ≥ 15`);
});

// ============================================================
// 14. 边缘场景：连续怀孕、连续禁足、双皇后
// ============================================================
section('14. 边缘场景', () => {
  // 14.1 连续生 2 胎
  {
    const rng = makeRng(2026);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.favor = 90; a.energy = 100;
    let births = 0;
    for (let trial = 0; trial < 30 && births < 2; trial++) {
      if (a.pregnant === 0) {
        a.energy = 100;
        const log = [];
        applyAction(a, b, 'try_child', log, rng);
      }
      if (a.pregnant > 0) {
        const before = a.children;
        resolveTurn(a, b, 'defend', 'defend', trial + 1, rng);
        if (a.children > before) births++;
      }
    }
    assert(births >= 2, `应能连续生 2 胎，实际 ${births}`);
    assert(a.childrenNames.length === a.children, '子嗣名字数=子嗣数');
  }

  // 14.2 解除禁足
  {
    const rng = makeRng(33);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.imprisoned = 1;
    resolveTurn(a, b, 'defend', 'defend', 1, rng);
    assertEq(a.imprisoned, 0, '一回合后解除禁足');
  }

  // 14.3 同时升至皇后
  {
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.rank = 7; b.rank = 7;
    a.favor = 50; b.favor = 50;
    const r = checkEnd(a, b, 3);
    assert(r.ended, '双皇后判定结束');
  }

  // 14.4 极端：条件不足时 promote 应该失败且不改变 rank
  {
    const rng = makeRng(44);
    const a = newPlayerState('A');
    const b = newPlayerState('B');
    a.favor = 5;          // 远低于答应升常在所需 30
    a.power = 0;
    a.reputation = 0;
    for (let t = 1; t <= 5; t++) {
      const r = resolveTurn(a, b, 'promote', 'promote', t, rng);
      assert(r.log.some((l) => l.includes('资历不足') && l.includes(a.name)),
        `第 ${t} 月 ${a.name} promote 失败应有"资历不足"提示`);
    }
    assertEq(a.rank, 0, '条件不足的 promote 不会改变 rank');
  }
});

// ============================================================
// 收尾
// ============================================================
console.log('\n' + '='.repeat(60));
if (failed === 0) {
  console.log(`✅ 全部通过 (${passed} 个断言, ${passed + failed} 总数)`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} 个失败 / ${passed + failed} 个断言`);
  console.log('\n失败列表（前 20）：');
  errors.slice(0, 20).forEach((e) => console.log('  -', e));
  process.exit(1);
}
