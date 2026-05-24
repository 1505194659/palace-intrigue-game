/**
 * 暗选数对决（4 张牌，每张限用一次）
 *
 * 玩法：双方各持手牌 [20, 40, 60, 80]，每局同时暗选一张，
 *      大者赢一分；不论输赢两人都消耗该张牌。
 *      先到 2 胜的赢；4 张全用完后按总分判，攻方平局占优。
 *
 * 统一 duel 接口（与 duels/gomoku.js / duels/rps.js 对齐）
 */

const CARD_VALUES = [20, 40, 60, 80];
const BEST_OF = CARD_VALUES.length;    // 4 局
const WIN_TO = 2;
const ROUND_TIMEOUT_SEC = 25;

function init(opts) {
  opts = opts || {};
  const cfg = opts.config || {};
  const timeoutSec = (cfg.duels && cfg.duels.guessTimeoutSec) || ROUND_TIMEOUT_SEC;
  const attackerIdx = opts.options && opts.options.attackerIdx != null
    ? opts.options.attackerIdx : 0;
  return {
    type: 'guess',
    rounds: [],
    score: [0, 0],
    pending: [null, null],
    hands: [CARD_VALUES.slice(), CARD_VALUES.slice()],
    winner: null,
    attackerIdx,
    bestOf: BEST_OF,
    winTo: WIN_TO,
    cardValues: CARD_VALUES.slice(),
    timeoutSec,
    deadline: Date.now() + timeoutSec * 1000,
  };
}

function _finalizeIfDone(state) {
  if (state.score[0] >= WIN_TO) { state.winner = 0; return; }
  if (state.score[1] >= WIN_TO) { state.winner = 1; return; }
  // 双方手牌都空 → 按总分判
  if (state.hands[0].length === 0 && state.hands[1].length === 0) {
    if (state.score[0] > state.score[1]) state.winner = 0;
    else if (state.score[1] > state.score[0]) state.winner = 1;
    else state.winner = state.attackerIdx; // 平局攻方占优
  }
}

function validateAction(state, playerIdx, payload) {
  if (state.winner !== null) return { ok: false, reason: '已结束' };
  if (playerIdx !== 0 && playerIdx !== 1) return { ok: false, reason: '非法 player' };
  if (state.pending[playerIdx] != null) return { ok: false, reason: '本回合已出牌' };
  if (!payload || payload.num == null) return { ok: false, reason: '缺少 num' };
  const n = Number(payload.num);
  if (!Number.isInteger(n)) return { ok: false, reason: '非法数字' };
  const hand = (state.hands && state.hands[playerIdx]) || [];
  if (!hand.includes(n)) {
    return { ok: false, reason: '该牌已用过或不在手牌' };
  }
  return { ok: true };
}

function applyAction(state, playerIdx, payload) {
  const n = Number(payload.num);
  state.pending[playerIdx] = n;
  // 从手牌移除
  state.hands = state.hands || [CARD_VALUES.slice(), CARD_VALUES.slice()];
  state.hands[playerIdx] = state.hands[playerIdx].filter((v) => v !== n);
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
      events.push(`第 ${state.rounds.length} 局：双方同选 ${a}，两张均消耗，平局`);
    } else {
      events.push(`第 ${state.rounds.length} 局：${a} vs ${b}，${roundWinner === 0 ? '攻方' : '守方'}胜`);
    }
    _finalizeIfDone(state);
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
  if (state.pending[playerIdx] != null) return false;
  return state.hands && state.hands[playerIdx] && state.hands[playerIdx].length > 0;
}

function buildView(state, playerIdx) {
  const op = 1 - playerIdx;
  const myHand = (state.hands && state.hands[playerIdx]) || [];
  const opHandSize = (state.hands && state.hands[op]) ? state.hands[op].length : 0;
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
    cardValues: state.cardValues || CARD_VALUES.slice(),
    yourHand: myHand.slice(),
    opponentHandSize: opHandSize,
    deadline: state.deadline,
  };
}

function getDeadline(state) { return state.deadline; }

function onTimeout(state) {
  const events = [];
  const a = state.pending[0], b = state.pending[1];
  // 超时的一方判定为出最小牌（系统代抽）
  function _autoPick(idx) {
    const hand = state.hands[idx] || [];
    return hand.length ? Math.min(...hand) : null;
  }
  let av = a, bv = b;
  if (a == null) av = _autoPick(0);
  if (b == null) bv = _autoPick(1);
  if (av != null) state.hands[0] = state.hands[0].filter((v) => v !== av);
  if (bv != null) state.hands[1] = state.hands[1].filter((v) => v !== bv);
  if (av != null && bv != null) {
    let w;
    if (av > bv) w = 0;
    else if (bv > av) w = 1;
    else w = -1;
    state.rounds.push({ a: av, b: bv, winner: w, timedOut: true });
    if (w === 0 || w === 1) state.score[w] += 1;
    events.push(`第 ${state.rounds.length} 局：超时强抽 ${av} vs ${bv}，${w < 0 ? '平局' : (w === 0 ? '攻方' : '守方') + '胜'}`);
  }
  state.pending = [null, null];
  state.deadline = Date.now() + state.timeoutSec * 1000;
  _finalizeIfDone(state);
  return { events };
}

module.exports = {
  id: 'guess',
  name: '暗选数',
  icon: '🎲',
  description: '各持 4 张数牌 (20/40/60/80)，每局同选一张大者胜，每张只能用一次',
  init, validateAction, applyAction, isOver, getWinner,
  whoseTurn, canAct, buildView, getDeadline, onTimeout,
  CARD_VALUES,
};
