/**
 * 后宫风云 - 纯游戏逻辑（与网络无关，便于单元测试）
 *
 * 这一层不持有"房间"概念，只处理：
 *   - 玩家初始状态
 *   - 动作合法性检查
 *   - 单一动作对状态的影响
 *   - 一回合的双方动作合解
 *   - 胜负判定
 */

const RANK_NAMES = ['答应', '常在', '贵人', '嫔', '妃', '贵妃', '皇贵妃', '皇后'];
const MAX_TURNS = 15;

// 每一级升位条件（圣宠/势力/名望/子嗣）
const PROMOTE_REQ = [
  { favor: 25, power: 0,  rep: 0,  children: 0 }, // 答应 -> 常在
  { favor: 40, power: 15, rep: 15, children: 0 }, // 常在 -> 贵人
  { favor: 50, power: 25, rep: 25, children: 0 }, // 贵人 -> 嫔
  { favor: 60, power: 40, rep: 35, children: 0 }, // 嫔   -> 妃
  { favor: 65, power: 55, rep: 45, children: 0 }, // 妃   -> 贵妃
  { favor: 70, power: 65, rep: 55, children: 0 }, // 贵妃 -> 皇贵妃
  { favor: 80, power: 80, rep: 70, children: 1 }, // 皇贵妃 -> 皇后
];

const ACTIONS = ['serve', 'train_talent', 'train_beauty', 'build_power', 'sabotage', 'defend', 'try_child', 'promote'];

const ACTION_LABEL = {
  serve: '🌹 侍寝',
  train_talent: '📚 习才艺',
  train_beauty: '💄 修容貌',
  build_power: '🌐 结党羽',
  sabotage: '🗡️ 设陷害',
  defend: '🛡️ 自保身',
  try_child: '👶 求子嗣',
  promote: '👑 争晋位',
};

// 多套语录，让每月的描述不重样（深宫曲风味）
const FLAVOR = {
  serve: [
    '蒙圣眷宠幸',
    '夜召承欢',
    '红烛高照，恩泽倾注',
    '一夕魂销，月露如珠',
    '帝心独属一人时',
  ],
  train_talent: [
    '抚琴弄弦，渐入化境',
    '丹青妙笔，绘尽春色',
    '诗书琴画，才情更盛',
    '夜读《女则》，谈吐生光',
    '习字弈棋，自有风骨',
  ],
  train_beauty: [
    '梳妆修容，倾国之姿',
    '描眉画唇，一颦一笑皆成韵',
    '香沐浴兰，玉肌生辉',
    '换上新制宫装，光彩照人',
    '簪花弄影，照水成颜',
  ],
  build_power: [
    '结交六宫姐妹，势力渐丰',
    '与几位老嬷嬷相熟',
    '暗地里送了几份厚礼',
    '在内务府打通了关节',
    '得太医院某位推心置腹',
  ],
  sabotage_hit: [
    '于茶水中下了"调味"',
    '一封匿名书信送到圣前',
    '重金买通宫女，制造把柄',
    '当众设局令对方失仪',
    '借太后之口暗中进言',
  ],
  sabotage_miss: [
    '机关算尽却被识破',
    '反误了卿卿性命',
    '阴谋败露，反伤其身',
    '一着不慎，自露马脚',
    '弄巧成拙，反落口实',
  ],
  defend: [
    '闭门读经，养心静气',
    '装病免见，避其锋芒',
    '托病不出，以静制动',
    '深居简出，留意宫廷动向',
    '抄经礼佛，心无旁骛',
  ],
  try_child_hit: [
    '太医诊出喜脉',
    '夜梦红龙入怀',
    '果是天降麟儿之兆',
    '熏鸡汤中喜得佳音',
  ],
  try_child_miss: [
    '求子未应',
    '只是一场虚惊',
    '盼子心切，奈何天意',
  ],
};

const CHILD_NAMES = [
  '皓宁', '琰宁', '瑞宁', '嘉柔', '婉清', '鸿煊', '瑞泽',
  '炳辰', '韶华', '静姝', '清月', '怀瑾', '永琪', '弘历',
];

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// 可选种子的伪随机数生成器（线性同余，用于测试可复现）
function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function newPlayerState(name) {
  return {
    name: name || '佳人',
    rank: 0,
    favor: 30,
    power: 10,
    reputation: 25,
    beauty: 50,
    talent: 50,
    scheme: 50,
    energy: 100,
    children: 0,
    childrenNames: [],
    pregnant: 0,
    imprisoned: 0,
    defending: false,
  };
}

function publicView(p) {
  return {
    name: p.name,
    rank: p.rank,
    rankName: RANK_NAMES[p.rank],
    favor: p.favor,
    power: p.power,
    reputation: p.reputation,
    beauty: p.beauty,
    talent: p.talent,
    scheme: p.scheme,
    energy: p.energy,
    children: p.children,
    childrenNames: (p.childrenNames || []).slice(),
    pregnant: p.pregnant,
    imprisoned: p.imprisoned,
  };
}

function calcScore(p) {
  return p.rank * 100 + p.favor + p.power + p.reputation + p.children * 50;
}

function isActionLegal(state, action) {
  if (state.imprisoned > 0) return action === 'defend';
  switch (action) {
    case 'serve': return state.energy >= 25 && state.pregnant === 0;
    case 'train_talent':
    case 'train_beauty':
    case 'build_power':
      return state.energy >= 10;
    case 'sabotage':
      return state.energy >= 20;
    case 'defend':
      return true;
    case 'try_child':
      return state.favor >= 50 && state.pregnant === 0 && state.energy >= 30;
    case 'promote': {
      if (state.rank >= 7) return false;
      const req = PROMOTE_REQ[state.rank];
      return state.favor >= req.favor && state.power >= req.power
        && state.reputation >= req.rep && state.children >= req.children;
    }
    default: return false;
  }
}

// 单方动作：self 执行 action，可能影响 self 与 other
function applyAction(self, other, action, log, rng) {
  if (self.imprisoned > 0 && action !== 'defend') {
    log.push(`🚫 ${self.name} 被禁足，无法行动`);
    return;
  }

  switch (action) {
    case 'serve': {
      self.energy = clamp(self.energy - 25, 0, 100);
      const gain = randInt(8, 14, rng) + Math.floor((self.beauty + self.talent) / 30);
      self.favor = clamp(self.favor + gain, 0, 100);
      log.push(`🌹 ${self.name} ${pick(FLAVOR.serve, rng)} (+${gain} 圣宠)`);
      break;
    }
    case 'train_talent': {
      self.energy = clamp(self.energy - 10, 0, 100);
      const g = randInt(6, 11, rng);
      self.talent = clamp(self.talent + g, 0, 100);
      log.push(`📚 ${self.name} ${pick(FLAVOR.train_talent, rng)} (+${g} 才艺)`);
      break;
    }
    case 'train_beauty': {
      self.energy = clamp(self.energy - 10, 0, 100);
      const g = randInt(6, 11, rng);
      self.beauty = clamp(self.beauty + g, 0, 100);
      log.push(`💄 ${self.name} ${pick(FLAVOR.train_beauty, rng)} (+${g} 美貌)`);
      break;
    }
    case 'build_power': {
      self.energy = clamp(self.energy - 10, 0, 100);
      const g = randInt(10, 15, rng);
      self.power = clamp(self.power + g, 0, 100);
      log.push(`🌐 ${self.name} ${pick(FLAVOR.build_power, rng)} (+${g} 势力)`);
      break;
    }
    case 'sabotage': {
      self.energy = clamp(self.energy - 20, 0, 100);
      if (other.defending) {
        log.push(`🛡️ ${other.name} 早有防备，${self.name} 阴谋落空`);
        self.scheme = clamp(self.scheme - 3, 0, 100);
        self.reputation = clamp(self.reputation - 3, 0, 100);
        break;
      }
      const atk = self.scheme + randInt(0, 25, rng);
      const def = other.scheme + randInt(0, 20, rng);
      if (atk > def) {
        const dmg = randInt(10, 18, rng);
        const newFavor = Math.max(5, other.favor - dmg);
        const actualDmg = other.favor - newFavor;
        other.favor = newFavor;
        log.push(`🗡️ ${self.name} ${pick(FLAVOR.sabotage_hit, rng)}，${other.name} 圣宠 -${actualDmg}`);
        if (randInt(1, 100, rng) <= 22) {
          other.imprisoned = 1;
          log.push(`⛓️ 圣上震怒，${other.name} 禁足 1 月`);
        }
        self.scheme = clamp(self.scheme + 2, 0, 100);
        self.reputation = clamp(self.reputation - 3, 0, 100);
      } else {
        log.push(`💥 ${self.name} ${pick(FLAVOR.sabotage_miss, rng)}`);
        self.favor = Math.max(5, self.favor - 4);
        self.reputation = clamp(self.reputation - 5, 0, 100);
      }
      break;
    }
    case 'defend': {
      self.energy = clamp(self.energy + 20, 0, 100);
      self.scheme = clamp(self.scheme + 4, 0, 100);
      self.reputation = clamp(self.reputation + 3, 0, 100);
      log.push(`🛡️ ${self.name} ${pick(FLAVOR.defend, rng)}`);
      break;
    }
    case 'try_child': {
      self.energy = clamp(self.energy - 30, 0, 100);
      if (randInt(1, 100, rng) <= 55) {
        self.pregnant = 3;
        log.push(`✨ ${self.name} ${pick(FLAVOR.try_child_hit, rng)} (3 月待产)`);
      } else {
        log.push(`💔 ${self.name} ${pick(FLAVOR.try_child_miss, rng)}`);
      }
      break;
    }
    case 'promote': {
      const req = PROMOTE_REQ[self.rank];
      const ok = self.rank < 7
        && self.favor >= req.favor
        && self.power >= req.power
        && self.reputation >= req.rep
        && self.children >= req.children;
      if (ok) {
        self.rank += 1;
        self.favor = Math.max(15, self.favor - 15);
        self.reputation = Math.max(20, self.reputation - 10);
        log.push(`👑 ${self.name} 晋封 ${RANK_NAMES[self.rank]}！`);
      } else {
        log.push(`📉 ${self.name} 资历不足，晋封未果`);
      }
      break;
    }
  }
}

// 25% 概率每月触发一个宫廷小事件（深宫曲风味）
function maybeRandomEvent(a, b, log, rng) {
  if (randInt(1, 100, rng) > 25) return;
  const events = [
    () => {
      const t = rng() < 0.5 ? a : b;
      const g = randInt(3, 8, rng);
      t.favor = clamp(t.favor + g, 0, 100);
      log.push(`🎀 ${t.name} 偶遇圣上微服，得赏赐 (+${g} 圣宠)`);
    },
    () => {
      const t = rng() < 0.5 ? a : b;
      const g = randInt(4, 8, rng);
      t.reputation = clamp(t.reputation + g, 0, 100);
      log.push(`📜 ${t.name} 在六宫中以德行闻名 (+${g} 名望)`);
    },
    () => {
      const winner = a.talent > b.talent ? a : (b.talent > a.talent ? b : null);
      if (winner) {
        winner.reputation = clamp(winner.reputation + 5, 0, 100);
        log.push(`🎼 太后召见，${winner.name} 才艺出众 (+5 名望)`);
      } else {
        log.push(`🎼 太后召见两位佳人共献才艺`);
      }
    },
    () => {
      const t = rng() < 0.5 ? a : b;
      t.energy = clamp(t.energy + 15, 0, 100);
      log.push(`💊 太医送来调理药膳，${t.name} 神清气爽 (+15 体力)`);
    },
    () => {
      const t = rng() < 0.5 ? a : b;
      const g = randInt(2, 5, rng);
      t.favor = Math.max(5, t.favor - g);
      log.push(`🍃 ${t.name} 御前失仪，圣上微愠 (-${g} 圣宠)`);
    },
    () => {
      const winner = a.power > b.power ? a : (b.power > a.power ? b : null);
      if (winner) {
        winner.power = clamp(winner.power + 3, 0, 100);
        log.push(`🪶 朝中风向暗合，${winner.name} 势力更进一步 (+3 势力)`);
      }
    },
  ];
  pick(events, rng)();
}

// 同时解析双方一回合
function resolveTurn(stateA, stateB, actionA, actionB, turn, rng) {
  rng = rng || Math.random;
  const log = [`📜 第 ${turn} 月`];
  log.push(`${stateA.name} 选择了 ${ACTION_LABEL[actionA]}`);
  log.push(`${stateB.name} 选择了 ${ACTION_LABEL[actionB]}`);

  stateA.defending = actionA === 'defend';
  stateB.defending = actionB === 'defend';

  applyAction(stateA, stateB, actionA, log, rng);
  applyAction(stateB, stateA, actionB, log, rng);

  // 同选侍寝 -> 比拼美貌+才艺
  if (actionA === 'serve' && actionB === 'serve'
      && stateA.imprisoned === 0 && stateB.imprisoned === 0) {
    const aMag = stateA.beauty + stateA.talent + randInt(0, 15, rng);
    const bMag = stateB.beauty + stateB.talent + randInt(0, 15, rng);
    if (aMag > bMag + 5) {
      stateA.favor = clamp(stateA.favor + 5, 0, 100);
      stateB.favor = Math.max(5, stateB.favor - 2);
      log.push(`💞 圣上更怜爱 ${stateA.name} (+5 圣宠)，${stateB.name} 黯然 (-2)`);
    } else if (bMag > aMag + 5) {
      stateB.favor = clamp(stateB.favor + 5, 0, 100);
      stateA.favor = Math.max(5, stateA.favor - 2);
      log.push(`💞 圣上更怜爱 ${stateB.name} (+5 圣宠)，${stateA.name} 黯然 (-2)`);
    } else {
      log.push(`🤍 两位佳人不分伯仲`);
    }
  }

  // 同选结党 -> 互相牵制
  if (actionA === 'build_power' && actionB === 'build_power') {
    stateA.power = Math.max(0, stateA.power - 3);
    stateB.power = Math.max(0, stateB.power - 3);
    log.push(`⚖️ 双方同争势力，互相牵制 (-3 势力 各)`);
  }

  // 怀孕推进 / 生子
  for (const s of [stateA, stateB]) {
    if (s.pregnant > 0) {
      s.pregnant -= 1;
      if (s.pregnant === 0) {
        s.children += 1;
        const childName = pick(CHILD_NAMES, rng);
        s.childrenNames = (s.childrenNames || []).concat([childName]);
        s.favor = clamp(s.favor + 25, 0, 100);
        s.reputation = clamp(s.reputation + 15, 0, 100);
        log.push(`👶 ${s.name} 诞下龙嗣，赐名"${childName}" (+1 子嗣，+25 圣宠，+15 名望)`);
      } else {
        log.push(`🤰 ${s.name} 怀胎 ${3 - s.pregnant} 月`);
      }
    }
    if (s.imprisoned > 0) {
      s.imprisoned -= 1;
      if (s.imprisoned === 0) log.push(`🔓 ${s.name} 解除禁足`);
    }
  }

  // 体力自然恢复
  for (const s of [stateA, stateB]) {
    s.energy = clamp(s.energy + 8, 0, 100);
  }

  // 随机事件
  maybeRandomEvent(stateA, stateB, log, rng);

  return { log };
}

// 胜负判定（不修改状态）
function checkEnd(stateA, stateB, turn) {
  if (stateA.rank >= 7 && stateB.rank >= 7) {
    return {
      ended: true,
      winner: calcScore(stateA) >= calcScore(stateB) ? 'A' : 'B',
      reason: '同登后位，以总分定夺',
    };
  }
  if (stateA.rank >= 7) {
    return { ended: true, winner: 'A', reason: `${stateA.name} 荣登后位，母仪天下！` };
  }
  if (stateB.rank >= 7) {
    return { ended: true, winner: 'B', reason: `${stateB.name} 荣登后位，母仪天下！` };
  }
  if (turn >= MAX_TURNS) {
    const sa = calcScore(stateA);
    const sb = calcScore(stateB);
    if (sa === sb) return { ended: true, winner: null, reason: `${MAX_TURNS} 月已过，二人并立` };
    return {
      ended: true,
      winner: sa > sb ? 'A' : 'B',
      reason: `${MAX_TURNS} 月已过，以圣眷与势力定胜负`,
    };
  }
  return { ended: false };
}

module.exports = {
  RANK_NAMES, MAX_TURNS, PROMOTE_REQ, ACTIONS, ACTION_LABEL,
  newPlayerState, publicView, calcScore,
  isActionLegal, applyAction, resolveTurn, checkEnd,
  makeRng, clamp,
};
