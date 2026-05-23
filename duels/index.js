/**
 * 决斗池调度器
 *
 * 暴露：
 *   - listAvailable(config): 返回当前启用的决斗类型列表
 *   - pickRandom(config, rng?): 从启用池里随机抽一个 duel 模块
 *   - getById(id): 按 id 取 duel 模块
 *
 * 启用开关在 config.duels.enabled = ['gomoku', 'rps', 'guess'] 中控制。
 */

const ALL = {
  gomoku: require('./gomoku'),
  rps: require('./rps'),
  guess: require('./guess'),
};

function listAvailable(config) {
  const enabled = (config && config.duels && config.duels.enabled)
    || ['gomoku', 'rps', 'guess'];
  return enabled.filter((id) => ALL[id]).map((id) => ALL[id]);
}

function pickRandom(config, rng) {
  const list = listAvailable(config);
  if (list.length === 0) return ALL.gomoku;
  const r = rng || Math.random;
  return list[Math.floor(r() * list.length)];
}

function getById(id) {
  return ALL[id] || null;
}

module.exports = { ALL, listAvailable, pickRandom, getById };