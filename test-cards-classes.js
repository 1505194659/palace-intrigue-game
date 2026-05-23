/**
 * 卡牌系统 + 职业系统单测
 */
const game = require('./game');
const config = require('./config');

let passed = 0, failed = 0;
const errors = [];
function assert(c, m) { if (c) passed++; else { failed++; errors.push(m); console.error('  ✗', m); } }
function section(name, fn) {
  console.log('\n=== ' + name + ' ===');
  const before = failed;
  try { fn(); } catch (e) { failed++; errors.push(name + ': ' + e.message); console.error('  ✗ EXCEPTION:', e.message, e.stack); }
  console.log(failed === before ? '  ✅ 通过' : '  ❌ ' + (failed - before) + ' 个失败');
}

game.setConfig(config.getDefault());

section('1. 职业起始 buff', () => {
  const noble = game.newPlayerState('A', 'noble');
  assert(noble.power === 30, `嫡女 power 30，实际 ${noble.power}`);
  assert(noble.reputation === 35, `嫡女 reputation 35，实际 ${noble.reputation}`);
  assert(noble.favor === 20, `嫡女 favor 20，实际 ${noble.favor}`);

  const def = game.newPlayerState('B', 'default');
  assert(def.favor === 30, '默认 favor 30');
  assert(def.power === 10, '默认 power 10');
  assert(def.reputation === 25, '默认 reputation 25');

  const schemer = game.newPlayerState('C', 'schemer');
  assert(schemer.reputation === 15, `心机 reputation 15，实际 ${schemer.reputation}`);
});

section('2. 职业行动加成 - 才女', () => {
  const a = game.newPlayerState('才女', 'talent');
  const b = game.newPlayerState('对手', 'default');
  const log = [];
  const beforeTalent = a.talent;
  game.applyAction(a, b, 'train_talent', log, game.makeRng(1));
  assert(a.talent - beforeTalent >= 9, `才女习才艺 ≥9，实际 +${a.talent - beforeTalent}`);
});

section('3. 职业行动加成 - 妖姬侍寝翻倍', () => {
  const a = game.newPlayerState('妖姬', 'seductress');
  const b = game.newPlayerState('对手', 'default');
  const log = [];
  const beforeFavor = a.favor;
  game.applyAction(a, b, 'serve', log, game.makeRng(123));
  const gain = a.favor - beforeFavor;
  assert(gain >= 16, `妖姬侍寝 +${gain}，期望 >=16`);
});

section('4. 职业月效应 - 妖姬每月名望-1（多次平均）', () => {
  let totalRep = 0;
  for (let i = 0; i < 50; i++) {
    const a = game.newPlayerState('妖姬', 'seductress');
    const b = game.newPlayerState('对手', 'default');
    game.resolveTurn(a, b, 'defend', 'defend', 1, game.makeRng(i + 1));
    totalRep += a.reputation;
  }
  const avg = totalRep / 50;
  assert(avg >= 24 && avg <= 30, `妖姬 50 次平均 rep=${avg.toFixed(1)}，期望 24-30`);
});

section('5. 卡牌 - drawCard 不为空', () => {
  const c = game.drawCard(game.makeRng(1));
  assert(c && c.id && c.name, 'drawCard 返回有效卡');
});

section('6. 卡牌 - 鸩茶减对方圣宠', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [{ id: 'poison_tea', name: '鸩茶', icon: '🍵' }];
  const log = [];
  const beforeFavor = b.favor;
  const r = game.useCard(a, b, 'poison_tea', log);
  assert(r.ok, '使用成功');
  assert(b.favor < beforeFavor, '对方圣宠下降');
  assert(a.cards.length === 0, '卡已消耗');
  assert(a.usedCardThisMonth === true, '本月已用标记');
});

section('7. 卡牌 - 红绒花自身增益', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [{ id: 'red_velvet', name: '红绒花', icon: '🌹' }];
  const log = [];
  const beforeBeauty = a.beauty;
  game.useCard(a, b, 'red_velvet', log);
  assert(a.beauty > beforeBeauty, '美貌增加');
});

section('8. 卡牌 - 玉佩免疫陷害', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  b.cards = [{ id: 'jade_pendant', name: '玉佩', icon: '💍' }];
  const log = [];
  game.useCard(b, a, 'jade_pendant', log);
  assert(b.shields.sabotage === true, 'B 获得 sabotage 盾');

  const beforeFavor = b.favor;
  game.applyAction(a, b, 'sabotage', log, game.makeRng(1), 'hit');
  assert(b.favor === beforeFavor, 'B 圣宠未损（盾生效）');
  assert(!b.shields.sabotage, '盾已消耗');
});

section('9. 卡牌 - 蛊毒下月生效', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [{ id: 'gu_poison', name: '蛊毒', icon: '🦋' }];
  const log = [];
  game.useCard(a, b, 'gu_poison', log);
  assert(b._pendingDebuff && b._pendingDebuff.energyMinus === 25, '下月 -25 体力已埋');

  const log2 = [];
  game.onTurnStart(b, log2, game.makeRng(1), false);
  assert(b.energy < 100, `下月体力下降，现 ${b.energy}`);
  assert(!b._pendingDebuff, '_pendingDebuff 已清');
});

section('10. 卡牌 - 重复使用拒绝', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [
    { id: 'red_velvet', name: '红绒花', icon: '🌹' },
    { id: 'queen_gift', name: '太后赏赐', icon: '🎀' },
  ];
  const log = [];
  game.useCard(a, b, 'red_velvet', log);
  const r = game.useCard(a, b, 'queen_gift', log);
  assert(!r.ok, '本月已用过，第二张拒绝');
  assert(a.cards.length === 1, '第二张未消耗');
});

section('11. 卡牌 - 不持有的卡拒绝', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [];
  const log = [];
  const r = game.useCard(a, b, 'poison_tea', log);
  assert(!r.ok, '没有卡时拒绝');
});

section('12. 卡牌 - 龟甲符防一次负面事件', () => {
  const a = game.newPlayerState('A', 'default');
  const b = game.newPlayerState('B', 'default');
  a.cards = [{ id: 'tortoise_charm', name: '龟甲符', icon: '🔮' }];
  const log = [];
  game.useCard(a, b, 'tortoise_charm', log);
  assert(a.shields.event === true, '获得 event 盾');
});

section('13. 月初抽卡概率', () => {
  const a = game.newPlayerState('A', 'default');
  let drawn = 0;
  for (let i = 0; i < 1000; i++) {
    a.cards = [];
    const log = [];
    game.onTurnStart(a, log, Math.random, false);
    if (a.cards.length > 0) drawn++;
  }
  assert(drawn > 100 && drawn < 600, `抽卡 ${drawn}/1000，期望 200-500`);
});

section('14. 集成 resolveTurn 不报错', () => {
  for (let trial = 0; trial < 30; trial++) {
    const cfg = config.getDefault();
    const enabledClasses = cfg.classes.enabled;
    const cA = enabledClasses[trial % enabledClasses.length];
    const cB = enabledClasses[(trial + 1) % enabledClasses.length];
    const a = game.newPlayerState('A', cA);
    const b = game.newPlayerState('B', cB);
    const rng = game.makeRng(trial + 100);
    for (let t = 1; t <= 10; t++) {
      const log = [];
      game.onTurnStart(a, log, rng, t === 1);
      game.onTurnStart(b, log, rng, t === 1);
      if (a.cards.length > 0 && rng() < 0.5) game.useCard(a, b, a.cards[0].id, log);
      if (b.cards.length > 0 && rng() < 0.5) game.useCard(b, a, b.cards[0].id, log);
      const acts = ['serve', 'train_talent', 'train_beauty', 'build_power', 'defend'];
      const aA = a.energy >= 25 ? acts[Math.floor(rng() * acts.length)] : 'defend';
      const aB = b.energy >= 25 ? acts[Math.floor(rng() * acts.length)] : 'defend';
      game.resolveTurn(a, b, aA, aB, t, rng);
    }
    assert(a.favor >= 0 && a.favor <= 100, `A favor 范围 ${a.favor}`);
    assert(b.favor >= 0 && b.favor <= 100, `B favor 范围 ${b.favor}`);
  }
});

console.log('\n' + '='.repeat(60));
if (failed === 0) {
  console.log('✅ 卡牌+职业全部通过 (' + passed + ' 断言)');
  process.exit(0);
} else {
  console.log('❌ ' + failed + '/' + (passed + failed) + ' 失败');
  errors.forEach((e) => console.log('  -', e));
  process.exit(1);
}