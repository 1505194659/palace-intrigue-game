/**
 * 猜大小对决（三局两胜）
 *
 * 玩法：双方暗选 1-100 整数，同步揭晓，大者胜（平局重选）
 * 攻方/守方对称
 *
 * 统一 duel 接口（与 duels/gomoku.js / duels/rps.js 对齐）
 */

const RANGE_MIN = 1;
const RANGE_MAX = 100;
const BEST_OF = 3;
const WIN_TO = Math.ceil(BEST_OF / 2);
const ROUND_TIMEOUT_SEC = 25;

function init(opts) {
  opts = opts || {};
  const cfg = opts.config || {};
  const timeoutSec = (cfg.duels && cfg.duels.guessTimeoutSec) || ROUND_TIMEOUT_SEC;
  const attackerIdx = opts.options && opts.options.attackerIdx != null
    ? opts.options.attackerIdx : 0;
  return {
    type: 'guess',
    rounds: [],            // [{a, b, winner: 0|1|-1}]
    score: [0, 0],
    pending: [null, null],
    winner: null,
    attackerIdx,
    bestOf: BEST_OF,
    winTo: WIN_TO,
    range: [RANGE_MIN, RANGE_MAX],
    timeoutSec,
    deadline: Date.now() + timeoutSec * 1000,
  };
}

function validateAction(state, playerIdx, payload) {
  if (state.winner !== null) return { ok: false, reason: '已结束' };
  if (playerIdx !== 0 && playerIdx !== 1) return { ok: false, reason: '非法 player' };
  if (state.pending[playerIdx] != null) return { ok: false, reason: '本回合已出数' };
  if (!payload || payload.num == null) return { ok: false, reason: '缺少 num' };
  const n = Number(payload.num);
  if (!Number.isInteger(n) || n < RANGE_MIN || n > RANGE_MAX) {
    return { ok: false, reason: `请输入 ${RANGE_MIN}-${RANGE_MAX} 的整数` };
  }
  return { ok: true };
}

function applyAction(state, playerIdx, payload) {
  const n = Number(payload.num);
  state.pending[playerIdx] = n;
  const events = [];
  if (state.pending[0] != null && state.pending[1] != null) {
    const a = state.pending[0], b = state.pending[1];
    let roundWinner;
    if (a > b) roundWinner = 0;
    else if (b > a) roundWinner = 1;
    else roundWinner = -1;
    state.rounds.push({ a, b, winner: roundWinner });
    if (roundWinner === 0 || roundWinner === 1) state.score[roundWinner] += 1;
    state.pending = [null, null];
    state.deadline = Date.now() + state.timeoutSec * 1000;

    if (roundWinner === -1) {
      events.push(`第 ${state.rounds.length} 局：双方同选 ${a}，平局重抽`);
    } else {
      events.push(`第 ${state.rounds.length} 局：${a} vs ${b}，${roundWinner === 0 ? '攻方' : '守方'}胜`);
    }

    if (state.score[0] >= WIN_TO) state.winner = 0;
    else if (state.score[1] >= WIN_TO) state.winner = 1;
  }
  return { events };
}

function isOver(state) { return state.winner !== null; }
function getWinner(state) { return state.winner; }

function whoseTurn(state) {
  if (state.winner !== null) return null;
  return -1;
}

function canAct(state, playerIdx) {
  if (state.winner !== null) return false;
  return state.pending[playerIdx] == null;
}

function buildView(state, playerIdx) {
  const op = 1 - playerIdx;
  return {
    type: 'guess',
    rounds: state.rounds,
    score: { you: state.score[playerIdx], opponent: state.score[op] },
    yourPending: state.pending[playerIdx],
    opponentPicked: state.pending[op] != null,
    yourTurn: state.pending[playerIdx] == null && state.winner === null,
    winner: state.winner,
    youAreAttacker: playerIdx === state.attackerIdx,
    bestOf: state.bestOf,
    winTo: state.winTo,
    range: state.range,
    deadline: state.deadline,
  };
}

function getDeadline(state) { return state.deadline; }

function onTimeout(state) {
  const events = [];
  const a = state.pending[0], b = state.pending[1];
  if (a != null && b == null) {
    state.score[0] += 1;
    state.rounds.push({ a, b: 'timeout', winner: 0 });
    events.push(`第 ${state.rounds.length} 局：守方超时，攻方胜`);
  } else if (a == null && b != null) {
    state.score[1] += 1;
    state.rounds.push({ a: 'timeout', b, winner: 1 });
    events.push(`第 ${state.rounds.length} 局：攻方超时，守方胜`);
  } else if (a == null && b == null) {
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
  id: 'guess',
  name: '猜大小',
  icon: '🎲',
  description: '暗选 1-100，三局两胜大者赢',
  init, validateAction, applyAction, isOver, getWinner,
  whoseTurn, canAct, buildView, getDeadline, onTimeout,
  RANGE_MIN, RANGE_MAX,
};
