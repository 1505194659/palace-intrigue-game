/**
 * 配置加载/保存模块
 *
 * 设计：
 *   - config.default.json 是 git 跟踪的默认值
 *   - config.json 是运行时配置（admin 后台修改它），不入 git
 *   - 启动时若 config.json 不存在，从 default 复制
 *   - get() 返回深克隆，避免外部误改
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, 'config.default.json');
const RUNTIME_PATH = path.join(__dirname, 'config.json');

let cached = null;

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** default 打底，runtime 覆盖；缺字段自动从 default 补全（版本升级友好） */
function deepMerge(base, override) {
  if (override === undefined || override === null) return deepClone(base);
  if (base === undefined || base === null) return deepClone(override);
  if (Array.isArray(base) || Array.isArray(override)) {
    return deepClone(Array.isArray(override) ? override : base);
  }
  if (typeof base !== 'object' || typeof override !== 'object') {
    return override !== undefined ? deepClone(override) : deepClone(base);
  }
  const out = deepClone(base);
  for (const key of Object.keys(override)) {
    const b = base[key];
    const o = override[key];
    if (o !== null && typeof o === 'object' && !Array.isArray(o)
        && b !== null && typeof b === 'object' && !Array.isArray(b)) {
      out[key] = deepMerge(b, o);
    } else {
      out[key] = deepClone(o);
    }
  }
  return out;
}

function load() {
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  if (!fs.existsSync(RUNTIME_PATH)) {
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(defaults, null, 2), 'utf8');
    console.log('[config] 已从 config.default.json 初始化 config.json');
    cached = defaults;
    return cached;
  }
  const runtime = JSON.parse(fs.readFileSync(RUNTIME_PATH, 'utf8'));
  const merged = deepMerge(defaults, runtime);
  const runtimeRaw = JSON.stringify(runtime, null, 2);
  const mergedRaw = JSON.stringify(merged, null, 2);
  if (mergedRaw !== runtimeRaw) {
    fs.writeFileSync(RUNTIME_PATH, mergedRaw, 'utf8');
    console.log('[config] 已从 config.default.json 补全缺失字段（保留已有自定义项）');
  }
  cached = merged;
  return cached;
}

function get() {
  if (!cached) load();
  return deepClone(cached);
}

function getRaw() {
  if (!cached) load();
  return cached;
}

function save(newConfig) {
  // 简单校验
  if (!newConfig || typeof newConfig !== 'object') {
    throw new Error('config 必须是对象');
  }
  if (!newConfig.appellation || !newConfig.palace || !newConfig.gomoku) {
    throw new Error('config 缺少必要顶级字段');
  }
  const max = newConfig.palace.maxTurns;
  if (typeof max !== 'number' || max < 5 || max > 30) {
    throw new Error('palace.maxTurns 必须在 5-30 之间');
  }
  if (!Array.isArray(newConfig.palace.promoteRequirements)
      || newConfig.palace.promoteRequirements.length !== 7) {
    throw new Error('promoteRequirements 必须是 7 项数组');
  }
  fs.writeFileSync(RUNTIME_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
  cached = newConfig;
  return cached;
}

function reset() {
  if (fs.existsSync(RUNTIME_PATH)) fs.unlinkSync(RUNTIME_PATH);
  cached = null;
  return load();
}

function getDefault() {
  const raw = fs.readFileSync(DEFAULT_PATH, 'utf8');
  return JSON.parse(raw);
}

module.exports = { load, get, getRaw, save, reset, getDefault };