/**
 * 五子棋逻辑单元测试
 * 跑法：node test-gomoku.js
 */
const g = require('./gomoku');

let passed = 0, failed = 0;
const errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push(m); console.error('  ✗', m); } }
function section(name, fn) {
  console.log('\n=== ' + name + ' ===');
  const before = failed;
  try { fn(); } catch (e) { failed++; errors.push(name + ': ' + e.message); console.error('  ✗ EXCEPTION:', e.message); }
  console.log(failed === before ? '  ✅ 通过' : '  ❌ ' + (failed - before) + ' 个失败');
}

section('1. 棋盘创建', () => {
  const b = g.newBoard();
  assert(b.length === 9, '默认 9x9');
  assert(b[0].length === 9, '行长度');
  let allZero = true;
  for (const r of b) for (const c of r) if (c !== 0) allZero = false;
  assert(allZero, '初始全空');
  const b15 = g.newBoard(15);
  assert(b15.length === 15, '可指定大小');
});

section('2. 落子 - 基础', () => {
  const b = g.newBoard();
  let r = g.place(b, 0, 0, 1);
  assert(r.ok, '左上角合法');
  assert(b[0][0] === 1, '棋子已写入');
  r = g.place(b, 0, 0, 2);
  assert(!r.ok && r.reason === '此处已有棋子', '不能重复落子');
  r = g.place(b, -1, 0, 1);
  assert(!r.ok, '越界拒绝(负行)');
  r = g.place(b, 0, 9, 1);
  assert(!r.ok, '越界拒绝(超列)');
  r = g.place(b, 1, 1, 3);
  assert(!r.ok, '非法颜色拒绝');
  r = g.place(b, 1, 1, 0);
  assert(!r.ok, '颜色 0 也拒绝');
});

section('3. 横向连五', () => {
  const b = g.newBoard();
  for (let c = 0; c < 4; c++) g.place(b, 4, c, 1);
  assert(!g.checkWin(b, 4, 3, 1), '4 子未连五');
  g.place(b, 4, 4, 1);
  assert(g.checkWin(b, 4, 4, 1), '5 子横向连五');
});

section('4. 竖向连五', () => {
  const b = g.newBoard();
  for (let r = 1; r <= 5; r++) g.place(b, r, 3, 2);
  assert(g.checkWin(b, 5, 3, 2), '5 子竖向连五');
});

section('5. 撇方向连五 (\\\\)', () => {
  const b = g.newBoard();
  for (let i = 0; i < 5; i++) g.place(b, i, i, 1);
  assert(g.checkWin(b, 4, 4, 1), '5 子主对角线');
});

section('6. 捺方向连五 (/)', () => {
  const b = g.newBoard();
  for (let i = 0; i < 5; i++) g.place(b, i, 4 - i, 2);
  assert(g.checkWin(b, 4, 0, 2), '5 子副对角线');
});

section('7. 中间落子完成连五', () => {
  const b = g.newBoard();
  g.place(b, 4, 0, 1);
  g.place(b, 4, 1, 1);
  g.place(b, 4, 3, 1);
  g.place(b, 4, 4, 1);
  assert(!g.checkWin(b, 4, 4, 1), '尚有缺口未连五');
  g.place(b, 4, 2, 1);
  assert(g.checkWin(b, 4, 2, 1), '中间补上完成连五');
});

section('8. 6 子也算赢（连五检测）', () => {
  const b = g.newBoard();
  for (let c = 1; c <= 6; c++) g.place(b, 4, c, 1);
  assert(g.checkWin(b, 4, 6, 1), '6 子也满足 ≥5 条件');
});

section('9. 颜色不混淆', () => {
  const b = g.newBoard();
  g.place(b, 0, 0, 1);
  g.place(b, 0, 1, 2);
  g.place(b, 0, 2, 1);
  g.place(b, 0, 3, 2);
  g.place(b, 0, 4, 1);
  assert(!g.checkWin(b, 0, 4, 1), '间隔不算连五');
  assert(!g.checkWin(b, 0, 4, 2), '间隔(白)也不算');
});

section('10. applyMove 综合', () => {
  const b = g.newBoard();
  let r = g.applyMove(b, 4, 4, 1);
  assert(r.ok && !r.win && !r.draw, '第一手 ok');
  r = g.applyMove(b, 4, 4, 2);
  assert(!r.ok, '同一格再下失败');
  for (let c = 0; c < 4; c++) g.applyMove(b, 0, c, 1);
  r = g.applyMove(b, 0, 4, 1);
  assert(r.ok && r.win && !r.draw, '连五返回 win=true');
});

section('11. 满盘平局检测', () => {
  const b = g.newBoard(3);
  // 3x3 没有连五的可能（需要 5 个）
  let next = 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      g.place(b, r, c, next);
      next = next === 1 ? 2 : 1;
    }
  }
  assert(g.isFull(b), '满盘');
  assert(!g.checkWin(b, 0, 0, 1), '3x3 不会有连五');
});

section('12. 边界落子', () => {
  const b = g.newBoard();
  // 右上角连五
  for (let i = 0; i < 5; i++) g.place(b, i, 8, 1);
  assert(g.checkWin(b, 4, 8, 1), '靠边竖向连五');
});

section('13. cloneBoard', () => {
  const b = g.newBoard();
  g.place(b, 0, 0, 1);
  const c = g.cloneBoard(b);
  c[0][0] = 2;
  assert(b[0][0] === 1, '克隆独立');
});

section('14. 压力测试 - 大量随机落子无异常', () => {
  for (let trial = 0; trial < 100; trial++) {
    const b = g.newBoard();
    let color = 1;
    let moves = 0;
    while (moves < 81) {
      const r = Math.floor(Math.random() * 9);
      const c = Math.floor(Math.random() * 9);
      const res = g.applyMove(b, r, c, color);
      if (!res.ok) continue;
      moves++;
      if (res.win || res.draw) break;
      color = color === 1 ? 2 : 1;
    }
  }
  assert(true, '压力测试无异常');
});

console.log('\n' + '='.repeat(60));
if (failed === 0) {
  console.log('✅ 五子棋全部通过 (' + passed + ' 断言)');
  process.exit(0);
} else {
  console.log('❌ ' + failed + '/' + (passed + failed) + ' 失败');
  errors.forEach((e) => console.log('  -', e));
  process.exit(1);
}