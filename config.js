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

function load() {
  let raw;
  if (fs.existsSync(RUNTIME_PATH)) {
    raw = fs.readFileSync(RUNTIME_PATH, 'utf8');
  } else {
    // 首次启动：从 default 复制一份
    raw = fs.readFileSync(DEFAULT_PATH, 'utf8');
    fs.writeFileSync(RUNTIME_PATH, raw, 'utf8');
    console.log('[config] 已从 config.default.json 初始化 config.json');
  }
  cached = JSON.parse(raw);
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