/**
 * 石头剪刀布对决（三局两胜）
 *
 * 玩法：双方暗选 rock/paper/scissors，同步揭晓；三局两胜
 * 攻方/守方对称，没有先手优势
 *
 * 统一 duel 接口（与 duels/gomoku.js 对齐）：
 *   init(opts), validateAction, applyAction, isOver, getWinner,
 *   whoseTurn, canAct, buildView, getDeadline, onTimeout
 */

const CHOICES = ['rock', 'paper', 'scissors'];
const ICONS = { rock: '✊', paper: '✋', scissors: '✌️' };
// rock 赢 scissors；scissors 赢 paper；paper 赢 rock
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const BEST_OF = 3;
const WIN_TO = Math.ceil(BEST_OF / 2);
const ROUND_TIMEOUT_SEC = 20;

function init(opts) {
  opts = opts || {};
  const cfg = opts.config || {};
  const timeoutSec = (cfg.duels && cfg.duels.rpsTimeoutSec) || ROUND_TIMEOUT_SEC;
  const attackerIdx = opts.options && opts.options.attackerIdx != null
    ? opts.options.attackerIdx : 0;
  return {
    type: 'rps',
    rounds: [],            // [{a, b, winner: 0|1|-1}]
    score: [0, 0],         // [A 胜局数, B 胜局数]
    pending: [null, null], // 当前回合各自的暗选
    winner: null,
    attackerIdx,
    bestOf: BEST_OF,
    winTo: WIN_TO,
    timeoutSec,
    deadline: Date.now() + timeoutSec * 1000,
  };
}

function validateAction(state, playerIdx, payload) {
  if (state.winner !== null) return { ok: false, reason: '已结束' };
  if (playerIdx !== 0 && playerIdx !== 1) return { ok: false, reason: '非法 player' };
  if (state.pending[playerIdx]) return { ok: false, reason: '本回合已出招' };
  if (!payload || !CHOICES.includes(payload.choice)) {
    return { ok: false, reason: '非法选择' };
  }
  return { ok: true };
}

function applyAction(state, playerIdx, payload) {
  state.pending[playerIdx] = payload.choice;
  const events = [];
  // 双方都出 -> 结算本轮
  if (state.pending[0] && state.pending[1]) {
    const a = state.pending[0], b = state.pending[1];
    let roundWinner;
    if (a === b) roundWinner = -1;
    else if (BEATS[a] === b) roundWinner = 0;
    else roundWinner = 1;
    state.rounds.push({ a, b, winner: roundWinner });
    if (roundWinner === 0 || roundWinner === 1) state.score[roundWinner] += 1;
    state.pending = [null, null];
    state.deadline = Date.now() + state.timeoutSec * 1000;

    const aIcon = ICONS[a], bIcon = ICONS[b];
    if (roundWinner === -1) {
      events.push(`第 ${state.rounds.length} 局：双方同出 ${aIcon}，平局`);
    } else {
      events.push(`第 ${state.rounds.length} 局：${aIcon} vs ${bIcon}，${roundWinner === 0 ? '攻方' : '守方'}胜`);
    }

    if (state.score[0] >= WIN_TO) state.winner = 0;
    else if (state.score[1] >= WIN_TO) state.winner = 1;
  }
  return { events };
}

function isOver(state) { return state.winner !== null; }
function getWinner(state) { return state.winner; }

// rps 是同时回合：返回 -1 表示"双方都可以"
function whoseTurn(state) {
  if (state.winner !== null) return null;
  return -1;
}

function canAct(state, playerIdx) {
  if (state.winner !== null) return false;
  return !state.pending[playerIdx];
}

function buildView(state, playerIdx) {
  const op = 1 - playerIdx;
  return {
    type: 'rps',
    rounds: state.rounds,
    score: { you: state.score[playerIdx], opponent: state.score[op] },
    yourPending: state.pending[playerIdx],
    opponentPicked: !!state.pending[op],
    yourTurn: !state.pending[playerIdx] && state.winner === null,
    winner: state.winner,
    youAreAttacker: playerIdx === state.attackerIdx,
    bestOf: state.bestOf,
    winTo: state.winTo,
    deadline: state.deadline,
    choices: CHOICES,
  };
}

function getDeadline(state) { return state.deadline; }

function onTimeout(state) {
  // 谁还没出招就判谁负本轮（如果双方都没出 -> 平局，但仍消耗时间，重置 deadline）
  const events = [];
  const a = state.pending[0], b = state.pending[1];
  if (a && !b) {
    state.score[0] += 1;
    state.rounds.push({ a, b: 'timeout', winner: 0 });
    events.push(`第 ${state.rounds.length} 局：守方超时，攻方胜`);
  } else if (!a && b) {
    state.score[1] += 1;
    state.rounds.push({ a: 'timeout', b, winner: 1 });
    events.push(`第 ${state.rounds.length} 局：攻方超时，守方胜`);
  } else if (!a && !b) {
    state.rounds.push({ a: 'timeout', b: 'timeout', winner: -1 });
    events.push(`第 ${state.rounds.length} 局：双方均超时，平局`);
  }
  state.pending = [null, null];
  state.deadline = Date.now() + state.timeoutSec * 1000;
  if (state.score[0] >= WIN_TO) state.winner = 0;
  else if (state.score[1] >= WIN_TO) state.winner = 1;
  return { events };
}

module.exports = {
  id: 'rps',
  name: '石头剪刀布',
  icon: '✊',
  description: '三局两胜，同时出招',
  init, validateAction, applyAction, isOver, getWinner,
  whoseTurn, canAct, buildView, getDeadline, onTimeout,
  CHOICES, ICONS, BEATS,
};
