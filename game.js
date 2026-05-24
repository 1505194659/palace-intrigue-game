/**
 * 后宫风云 - 纯游戏逻辑（与网络无关，便于单元测试）
 *
 * v3.0 起：
 *   - 数值/称谓从 config.json 读取
 *   - server 创建房间时调 setConfig(roomConfig) 切换上下文
 *   - newPlayerState/resolveTurn 等用当前 _cfg 取参数
 *   - 测试不传 config 时使用 config.default.json 作 fallback
 */

const RANK_NAMES = ['答应', '常在', '贵人', '嫔', '妃', '贵妃', '皇贵妃', '皇后'];
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

let _cfg = null;
function setConfig(cfg) {
  _cfg = cfg;
}
function getConfig() {
  if (!_cfg) {
    // 默认 fallback：测试场景常用
    _cfg = require('./config').getDefault();
  }
  return _cfg;
}
function emperor() { return getConfig().appellation.emperor || '圣上'; }
function maxTurns() { return getConfig().palace.maxTurns; }
function energyRegen() { return getConfig().palace.energyRegen; }
function startFavor() { return getConfig().palace.startFavor; }
function startReputation() { return getConfig().palace.startReputation; }
function startEnergy() { return getConfig().palace.startEnergy; }
function promoteReqs() { return getConfig().palace.promoteRequirements; }
function childNames() { return getConfig().palace.childNames; }
function eventChance() { return getConfig().palace.randomEventChance; }

const FLAVOR = {
  serve: ['蒙恩宠幸', '夜召承欢', '红烛高照，恩泽倾注', '一夕魂销，月露如珠', '帝心独属一人时'],
  train_talent: ['抚琴弄弦，渐入化境', '丹青妙笔，绘尽春色', '诗书琴画，才情更盛', '夜读《女则》，谈吐生光', '习字弈棋，自有风骨'],
  train_beauty: ['梳妆修容，倾国之姿', '描眉画唇，一颦一笑皆成韵', '香沐浴兰，玉肌生辉', '换上新制宫装，光彩照人', '簪花弄影，照水成颜'],
  build_power: ['结交六宫姐妹，势力渐丰', '与几位老嬷嬷相熟', '暗地里送了几份厚礼', '在内务府打通了关节', '得太医院某位推心置腹'],
  sabotage_hit: ['于茶水中下了"调味"', '一封匿名书信送到御前', '重金买通宫女，制造把柄', '当众设局令对方失仪', '借太后之口暗中进言'],
  sabotage_miss: ['机关算尽却被识破', '反误了卿卿性命', '阴谋败露，反伤其身', '一着不慎，自露马脚', '弄巧成拙，反落口实'],
  defend: ['闭门读经，养心静气', '装病免见，避其锋芒', '托病不出，以静制动', '深居简出，留意宫廷动向', '抄经礼佛，心无旁骛'],
  try_child_hit: ['太医诊出喜脉', '夜梦红龙入怀', '果是天降麟儿之兆', '熏鸡汤中喜得佳音'],
  try_child_miss: ['求子未应', '只是一场虚惊', '盼子心切，奈何天意'],
};

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randInt(min, max, rng) { return Math.floor(rng() * (max - min + 1)) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ============================================================
// 卡牌系统
// ============================================================

function _cardsList() {
  const cfg = getConfig();
  return (cfg.cards && cfg.cards.list) || [];
}

function _cardsCfg() {
  const cfg = getConfig();
  return cfg.cards || { enabled: false, dropChance: 0, maxHand: 3 };
}

function getCardById(id) {
  return _cardsList().find((c) => c.id === id) || null;
}

function drawCard(rng) {
  rng = rng || Math.random;
  const list = _cardsList();
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

function isCardLegal(self, cardId) {
  const c = _cardsCfg();
  if (!c.enabled) return { ok: false, reason: '卡牌系统已关闭' };
  if (self.usedCardThisMonth) return { ok: false, reason: '本月已使用过道具' };
  if (!self.cards || !self.cards.find((x) => x.id === cardId)) {
    return { ok: false, reason: '你没有这张卡' };
  }
  if (self.imprisoned > 0) {
    // 禁足时只允许被动盾或自身增益
    const card = getCardById(cardId);
    if (!card || (card.type !== 'passive' && card.effect !== 'self_buff' && card.effect !== 'self_shield_event')) {
      return { ok: false, reason: '禁足期间不可使用主动卡' };
    }
  }
  return { ok: true };
}

// 应用卡牌效果。返回 { ok, log: string }
function useCard(self, other, cardId, log) {
  const check = isCardLegal(self, cardId);
  if (!check.ok) return { ok: false, reason: check.reason };
  const card = getCardById(cardId);
  // 移除手牌
  const idx = self.cards.findIndex((c) => c.id === cardId);
  self.cards.splice(idx, 1);
  self.usedCardThisMonth = true;

  switch (card.effect) {
    case 'favor_damage': {
      const dmg = card.value || 10;
      const before = other.favor;
      other.favor = Math.max(5, other.favor - dmg);
      log.push(`🍵 ${self.name} 使了「${card.name}」，${other.name} 圣宠 -${before - other.favor}`);
      break;
    }
    case 'self_buff': {
      let parts = [];
      if (card.favor)   { self.favor   = clamp(self.favor   + card.favor,   0, 100); parts.push(`+${card.favor} 圣宠`); }
      if (card.power)   { self.power   = clamp(self.power   + card.power,   0, 100); parts.push(`+${card.power} 势力`); }
      if (card.rep)     { self.reputation = clamp(self.reputation + card.rep, 0, 100); parts.push(`+${card.rep} 名望`); }
      if (card.beauty)  { self.beauty  = clamp(self.beauty  + card.beauty,  0, 100); parts.push(`+${card.beauty} 美貌`); }
      if (card.talent)  { self.talent  = clamp(self.talent  + card.talent,  0, 100); parts.push(`+${card.talent} 才艺`); }
      if (card.scheme)  { self.scheme  = clamp(self.scheme  + card.scheme,  0, 100); parts.push(`+${card.scheme} 心计`); }
      if (card.energy)  { self.energy  = clamp(self.energy  + card.energy,  0, 100); parts.push(`+${card.energy} 体力`); }
      log.push(`${card.icon} ${self.name} 用了「${card.name}」 (${parts.join('，')})`);
      break;
    }
    case 'opp_debuff': {
      self.nextMonthDebuff = self.nextMonthDebuff || {};
      // 标记给对方下月生效
      other._pendingDebuff = other._pendingDebuff || {};
      if (card.energy_next) {
        other._pendingDebuff.energyMinus = (other._pendingDebuff.energyMinus || 0) + card.energy_next;
      }
      if (card.favor_next) {
        other._pendingDebuff.favorMinus = (other._pendingDebuff.favorMinus || 0) + card.favor_next;
      }
      log.push(`${card.icon} ${self.name} 暗下「${card.name}」，${other.name} 下月将受其害`);
      break;
    }
    case 'shield_sabotage': {
      self.shields = self.shields || {};
      self.shields.sabotage = true;
      log.push(`${card.icon} ${self.name} 持「${card.name}」，下次陷害必将被挡`);
      break;
    }
    case 'self_shield_event': {
      self.shields = self.shields || {};
      self.shields.event = true;
      log.push(`${card.icon} ${self.name} 焚「${card.name}」，本月免疫一次负面事件`);
      break;
    }
    // reveal_last（密信）已废弃 - 起居注本身已能看到对方动作
    default:
      log.push(`${card.icon || '🎴'} ${self.name} 使用了「${card.name}」`);
  }
  return { ok: true, card };
}

function onTurnStart(state, log, rng, isFirstTurn) {
  rng = rng || Math.random;
  const c = _cardsCfg();
  state.cards = state.cards || [];
  state.shields = state.shields || {};
  state.nextMonthDebuff = state.nextMonthDebuff || {};
  state.usedCardThisMonth = false;
  state.revealedAction = null;

  // 应用上月被对方种下的 debuff（龟甲符可挡）
  if (state._pendingDebuff) {
    if (state.shields && state.shields.event) {
      delete state.shields.event;
      log.push(`🔮 ${state.name} 龟甲符护体，下月负面尽散`);
    } else {
      if (state._pendingDebuff.energyMinus) {
        const before = state.energy;
        state.energy = Math.max(0, state.energy - state._pendingDebuff.energyMinus);
        log.push(`🦋 ${state.name} 蛊毒发作，体力 -${before - state.energy}`);
      }
      if (state._pendingDebuff.favorMinus) {
        const before = state.favor;
        state.favor = Math.max(5, state.favor - state._pendingDebuff.favorMinus);
        log.push(`🔥 ${state.name} 凤诏施压，圣宠 -${before - state.favor}`);
      }
    }
    delete state._pendingDebuff;
  }

  // 抽卡（首月也可抽）
  if (c.enabled && state.cards.length < (c.maxHand || 3)) {
    const chance = (c.dropChance || 0) / 100;
    if (rng() < chance) {
      const card = drawCard(rng);
      if (card) {
        state.cards.push({ id: card.id, name: card.name, icon: card.icon });
        log.push(`🎁 ${state.name} 偶得「${card.name}」`);
      }
    }
  }
}

function onTurnEnd(state) {
  state.shields = state.shields || {};
  // event 盾是"本月有效"
  if (state.shields.event) delete state.shields.event;
  state.usedCardThisMonth = false;
  state.revealedAction = null;
}

function newPlayerState(name, classId) {
  const cfg = getConfig();
  const cls = (cfg.classes && cfg.classes[classId]) || (cfg.classes && cfg.classes.default) || null;
  const s = {
    name: name || cfg.appellation.concubineLabel || '佳人',
    classId: cls ? cls.id : 'default',
    rank: 0,
    favor: startFavor(),
    power: 10,
    reputation: startReputation(),
    beauty: 50,
    talent: 50,
    scheme: 50,
    energy: startEnergy(),
    children: 0,
    childrenNames: [],
    pregnant: 0,
    imprisoned: 0,
    defending: false,
    cards: [],            // 手牌：[{id, name, icon, type, ...}]
    usedCardThisMonth: false,
    shields: {},          // 被动卡占位：{ sabotage: true, event: true }
    nextMonthDebuff: {},  // 下月生效的负面：{ energyMinus: 25 }
    revealedAction: null, // 兼容旧字段（密信道具已废弃）
    lastAction: null,     // 自己上一月做的动作
  };
  if (cls) {
    if (typeof cls.initFavorDelta === 'number') s.favor = clamp(s.favor + cls.initFavorDelta, 5, 100);
    if (typeof cls.initPowerDelta === 'number') s.power = clamp(s.power + cls.initPowerDelta, 0, 100);
    if (typeof cls.initRepDelta === 'number') s.reputation = clamp(s.reputation + cls.initRepDelta, 0, 100);
  }
  return s;
}

function publicView(p, opts) {
  opts = opts || {};
  const view = {
    name: p.name,
    classId: p.classId || 'default',
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
    cardsCount: (p.cards || []).length,
    shields: Object.assign({}, p.shields || {}),
  };
  // 自己看到完整手牌；对手只能看到张数
  if (opts.self) {
    view.cards = (p.cards || []).slice();
    view.usedCardThisMonth = !!p.usedCardThisMonth;
    view.revealedAction = p.revealedAction || null;
    view.nextMonthDebuff = Object.assign({}, p.nextMonthDebuff || {});
  }
  return view;
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
    case 'build_power': return state.energy >= 10;
    case 'sabotage': return state.energy >= 20;
    case 'defend': return true;
    case 'try_child': return state.favor >= 50 && state.pregnant === 0 && state.energy >= 30;
    case 'promote': {
      if (state.rank >= 7) return false;
      const req = promoteReqs()[state.rank];
      return state.favor >= req.favor && state.power >= req.power
        && state.reputation >= req.rep && state.children >= req.children;
    }
    default: return false;
  }
}

// forceSabotage: 'hit' | 'miss' | undefined - 用于决斗强制陷害结果
function applyAction(self, other, action, log, rng, forceSabotage) {
  if (self.imprisoned > 0 && action !== 'defend') {
    log.push(`🚫 ${self.name} 被禁足，无法行动`);
    return;
  }
  const E = emperor();
  const cfg = getConfig();
  const cls = (cfg.classes && cfg.classes[self.classId]) || null;

  switch (action) {
    case 'serve': {
      self.energy = clamp(self.energy - 25, 0, 100);
      let gain = randInt(8, 14, rng) + Math.floor((self.beauty + self.talent) / 30);
      if (cls && typeof cls.serveBonus === 'number') gain = Math.max(1, gain + cls.serveBonus);
      if (cls && typeof cls.serveMultiplier === 'number') gain = Math.round(gain * cls.serveMultiplier);
      self.favor = clamp(self.favor + gain, 0, 100);
      log.push(`🌹 ${self.name} ${pick(FLAVOR.serve, rng)} (+${gain} 圣宠)`);
      break;
    }
    case 'train_talent': {
      self.energy = clamp(self.energy - 10, 0, 100);
      let g = randInt(6, 11, rng);
      if (cls && typeof cls.trainBonus === 'number') g += cls.trainBonus;
      self.talent = clamp(self.talent + g, 0, 100);
      log.push(`📚 ${self.name} ${pick(FLAVOR.train_talent, rng)} (+${g} 才艺)`);
      break;
    }
    case 'train_beauty': {
      self.energy = clamp(self.energy - 10, 0, 100);
      let g = randInt(6, 11, rng);
      if (cls && typeof cls.trainBonus === 'number') g += cls.trainBonus;
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
        // 被发现陷害他人：圣宠和名望都受损
        self.favor = Math.max(5, self.favor - 6);
        break;
      }
      let success;
      if (forceSabotage === 'hit') success = true;
      else if (forceSabotage === 'miss') success = false;
      else {
        const sabBonus = (cls && cls.sabotageAtkBonus) || 0;
        const atk = self.scheme + sabBonus + randInt(0, 25, rng);
        const def = other.scheme + randInt(0, 20, rng);
        success = atk > def;
      }
      if (success) {
        // 玉佩被动：自动免疫一次陷害
        if (other.shields && other.shields.sabotage) {
          delete other.shields.sabotage;
          log.push(`💍 ${other.name} 玉佩生辉，${self.name} 阴谋无效`);
          self.scheme = clamp(self.scheme - 2, 0, 100);
          break;
        }
        const dmg = randInt(10, 18, rng);
        const newFavor = Math.max(5, other.favor - dmg);
        const actualDmg = other.favor - newFavor;
        other.favor = newFavor;
        log.push(`🗡️ ${self.name} ${pick(FLAVOR.sabotage_hit, rng)}，${other.name} 圣宠 -${actualDmg}`);
        // 滑胎：怀孕中被陷害成功，30% 概率小产
        if (other.pregnant > 0 && randInt(1, 100, rng) <= 30) {
          // 龟甲符可挡（也算下月负面）
          if (other.shields && other.shields.event) {
            delete other.shields.event;
            log.push(`🔮 ${other.name} 龟甲符闪光，护住胎气`);
          } else {
            const mLeft = other.pregnant;
            other.pregnant = 0;
            other.favor = Math.max(5, other.favor - 15);
            other.reputation = Math.max(0, other.reputation - 8);
            log.push(`💔 ${other.name} 胎气受惊，小产 (-15 圣宠 -8 名望，痛失 ${mLeft} 月胎)`);
          }
        }
        if (randInt(1, 100, rng) <= 22) {
          other.imprisoned = 1;
          log.push(`⛓️ ${E}震怒，${other.name} 禁足 1 月`);
        }
        self.scheme = clamp(self.scheme + 2, 0, 100);
        self.reputation = clamp(self.reputation - 3, 0, 100);
      } else {
        // 陷害失败：阴谋败露，惩罚加重
        log.push(`💥 ${self.name} ${pick(FLAVOR.sabotage_miss, rng)}`);
        self.favor = Math.max(5, self.favor - 8);
        self.reputation = clamp(self.reputation - 8, 0, 100);
        self.scheme = clamp(self.scheme - 2, 0, 100);
        // 25% 概率反被禁足 1 月（弄巧成拙）
        if (randInt(1, 100, rng) <= 25) {
          self.imprisoned = 1;
          log.push(`⛓️ 阴谋败露，${self.name} 反被禁足 1 月`);
        }
      }
      break;
    }
    case 'defend': {
      const bonus = (cls && cls.defendEnergyBonus) || 0;
      self.energy = clamp(self.energy + 20 + bonus, 0, 100);
      self.scheme = clamp(self.scheme + 4, 0, 100);
      self.reputation = clamp(self.reputation + 3, 0, 100);
      log.push(`🛡️ ${self.name} ${pick(FLAVOR.defend, rng)}`);
      break;
    }
    case 'try_child': {
      self.energy = clamp(self.energy - 30, 0, 100);
      const baseChance = 55 + ((cls && cls.tryChildBonus) || 0);
      if (randInt(1, 100, rng) <= baseChance) {
        self.pregnant = 3;
        log.push(`✨ ${self.name} ${pick(FLAVOR.try_child_hit, rng)} (3 月待产)`);
      } else {
        log.push(`💔 ${self.name} ${pick(FLAVOR.try_child_miss, rng)}`);
      }
      break;
    }
    case 'promote': {
      const req = promoteReqs()[self.rank];
      const ok = self.rank < 7
        && self.favor >= req.favor && self.power >= req.power
        && self.reputation >= req.rep && self.children >= req.children;
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

// 检测某事件目标是否有"龟甲符"护盾，若有且事件为负面 -> 取消并消耗护盾
function _shieldedFromNegative(target, log, kind) {
  if (target.shields && target.shields.event) {
    delete target.shields.event;
    log.push(`🔮 ${target.name} 龟甲符闪光，化解 ${kind}`);
    return true;
  }
  return false;
}

function maybeRandomEvent(a, b, log, rng) {
  if (randInt(1, 100, rng) > eventChance()) return;
  const E = emperor();
  const events = [
    () => {
      const t = rng() < 0.5 ? a : b;
      const g = randInt(3, 8, rng);
      t.favor = clamp(t.favor + g, 0, 100);
      log.push(`🎀 ${t.name} 偶遇${E}微服，得赏赐 (+${g} 圣宠)`);
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
        log.push('🎼 太后召见两位佳人共献才艺');
      }
    },
    () => {
      const t = rng() < 0.5 ? a : b;
      t.energy = clamp(t.energy + 15, 0, 100);
      log.push(`💊 太医送来调理药膳，${t.name} 神清气爽 (+15 体力)`);
    },
    () => {
      const t = rng() < 0.5 ? a : b;
      if (_shieldedFromNegative(t, log, '一次失仪')) return;
      const g = randInt(2, 5, rng);
      t.favor = Math.max(5, t.favor - g);
      log.push(`🍃 ${t.name} 御前失仪，${E}微愠 (-${g} 圣宠)`);
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

// opts.forceSabotageA/B: 'hit'|'miss' - 决斗后由 server 传入
function resolveTurn(stateA, stateB, actionA, actionB, turn, rng, opts) {
  rng = rng || Math.random;
  opts = opts || {};
  const log = [`📜 第 ${turn} 月`];
  log.push(`${stateA.name} 选择了 ${ACTION_LABEL[actionA]}`);
  log.push(`${stateB.name} 选择了 ${ACTION_LABEL[actionB]}`);

  stateA.defending = actionA === 'defend';
  stateB.defending = actionB === 'defend';
  // 记录本月动作（用于起居注回放）
  stateA.lastAction = actionA;
  stateB.lastAction = actionB;

  applyAction(stateA, stateB, actionA, log, rng, opts.forceSabotageA);
  applyAction(stateB, stateA, actionB, log, rng, opts.forceSabotageB);

  const E = emperor();
  if (actionA === 'serve' && actionB === 'serve'
      && stateA.imprisoned === 0 && stateB.imprisoned === 0) {
    const aMag = stateA.beauty + stateA.talent + randInt(0, 15, rng);
    const bMag = stateB.beauty + stateB.talent + randInt(0, 15, rng);
    if (aMag > bMag + 5) {
      stateA.favor = clamp(stateA.favor + 5, 0, 100);
      stateB.favor = Math.max(5, stateB.favor - 2);
      log.push(`💞 ${E}更怜爱 ${stateA.name} (+5 圣宠)，${stateB.name} 黯然 (-2)`);
    } else if (bMag > aMag + 5) {
      stateB.favor = clamp(stateB.favor + 5, 0, 100);
      stateA.favor = Math.max(5, stateA.favor - 2);
      log.push(`💞 ${E}更怜爱 ${stateB.name} (+5 圣宠)，${stateA.name} 黯然 (-2)`);
    } else {
      log.push('🤍 两位佳人不分伯仲');
    }
  }

  if (actionA === 'build_power' && actionB === 'build_power') {
    stateA.power = Math.max(0, stateA.power - 3);
    stateB.power = Math.max(0, stateB.power - 3);
    log.push('⚖️ 双方同争势力，互相牵制 (-3 势力 各)');
  }

  for (const s of [stateA, stateB]) {
    if (s.pregnant > 0) {
      s.pregnant -= 1;
      if (s.pregnant === 0) {
        s.children += 1;
        const childName = pick(childNames(), rng);
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

  for (const s of [stateA, stateB]) {
    s.energy = clamp(s.energy + energyRegen(), 0, 100);
  }

  // 职业月效应（如妖姬每月 -1 名望）
  const cfg = getConfig();
  for (const s of [stateA, stateB]) {
    const cls = (cfg.classes && cfg.classes[s.classId]) || null;
    if (cls && typeof cls.monthlyRepLoss === 'number' && cls.monthlyRepLoss > 0) {
      const loss = Math.min(s.reputation, cls.monthlyRepLoss);
      if (loss > 0) {
        s.reputation = Math.max(0, s.reputation - loss);
        log.push(`💋 ${s.name}「${cls.name}」之名引人议论 (-${loss} 名望)`);
      }
    }
  }

  maybeRandomEvent(stateA, stateB, log, rng);

  // 月末清理：清除一次性盾（event 盾在 onTurnEnd 里处理）
  for (const s of [stateA, stateB]) onTurnEnd(s);

  return { log };
}

function checkEnd(stateA, stateB, turn) {
  const max = maxTurns();
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
  if (turn >= max) {
    const sa = calcScore(stateA);
    const sb = calcScore(stateB);
    if (sa === sb) return { ended: true, winner: null, reason: `${max} 月已过，二人并立` };
    return {
      ended: true,
      winner: sa > sb ? 'A' : 'B',
      reason: `${max} 月已过，以圣眷与势力定胜负`,
    };
  }
  return { ended: false };
}

module.exports = {
  RANK_NAMES, ACTIONS, ACTION_LABEL,
  // 兼容老调用方式：动态从 config 读
  get MAX_TURNS() { return maxTurns(); },
  get PROMOTE_REQ() { return promoteReqs(); },
  setConfig, getConfig,
  newPlayerState, publicView, calcScore,
  isActionLegal, applyAction, resolveTurn, checkEnd,
  // 卡牌
  drawCard, useCard, isCardLegal, getCardById,
  onTurnStart, onTurnEnd,
  makeRng, clamp,
};