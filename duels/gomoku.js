/**
 * 五子棋决斗适配器
 *
 * 复用根目录 gomoku.js 的纯算法，包装成 duels 统一接口。
 * 9x9 棋盘，黑先白后（攻方为黑），先连五子者胜。
 * 每步思考时间 timeoutSec（默认 60s），超时方判负。
 */

const gomoku = require('../gomoku');

function init(opts) {
  opts = opts || {};
  const cfg = opts.config || {};
  const sz = (cfg.gomoku && cfg.gomoku.boardSize) || 9;
  const timeoutSec = (cfg.gomoku && cfg.gomoku.moveTimeoutSec) || 60;
  const attackerIdx = opts.options && opts.options.attackerIdx != null
    ? opts.options.attackerIdx : 0;
  return {
    type: 'gomoku',
    board: gomoku.newBoard(sz),
    boardSize: sz,
    current: 0,                // playerIdx: 0=黑(攻), 1=白(守)
    attackerIdx,
    moveCount: 0,
    lastMove: null,            // {row, col, playerIdx}
    winner: null,
    timeoutSec,
    deadline: Date.now() + timeoutSec * 1000,
  };
}

function playerToColor(playerIdx, attackerIdx) {
  return playerIdx === attackerIdx ? 1 : 2;
}

function validateAction(state, playerIdx, payload) {
  if (state.winner !== null) return { ok: false, reason: '已结束' };
  if (state.current !== playerIdx) return { ok: false, reason: '尚未轮到' };
  if (!payload || typeof payload.row !== 'number' || typeof payload.col !== 'number') {
    return { ok: false, reason: '需要 row/col' };
  }
  const r = Math.floor(payload.row), c = Math.floor(payload.col);
  if (r < 0 || r >= state.boardSize || c < 0 || c >= state.boardSize) {
    return { ok: false, reason: '越界' };
  }
  if (state.board[r][c] !== 0) return { ok: false, reason: '此处已有棋子' };
  return { ok: true };
}

function applyAction(state, playerIdx, payload) {
  const r = Math.floor(payload.row), c = Math.floor(payload.col);
  const color = playerToColor(playerIdx, state.attackerIdx);
  const result = gomoku.applyMove(state.board, r, c, color);
  const events = [];
  if (!result.ok) {
    return { events: [`落子无效: ${result.reason}`] };
  }
  state.lastMove = { row: r, col: c, playerIdx, color };
  state.moveCount++;
  if (result.win) {
    state.winner = playerIdx;
    events.push(`第 ${state.moveCount} 手连五，${playerIdx === state.attackerIdx ? '攻方' : '守方'}胜`);
  } else if (result.draw) {
    state.winner = 1 - state.attackerIdx;
    events.push('棋盘已满，攻方失利');
  } else {
    state.current = 1 - playerIdx;
    state.deadline = Date.now() + state.timeoutSec * 1000;
  }
  return { events };
}

function isOver(state) { return state.winner !== null; }
function getWinner(state) { return state.winner; }

function whoseTurn(state) {
  if (state.winner !== null) return null;
  return state.current;
}

function canAct(state, playerIdx) {
  if (state.winner !== null) return false;
  return state.current === playerIdx;
}

function buildView(state, playerIdx) {
  const myColor = playerToColor(playerIdx, state.attackerIdx);
  const oppColor = myColor === 1 ? 2 : 1;
  return {
    type: 'gomoku',
    board: state.board,
    boardSize: state.boardSize,
    yourColor: myColor,
    opponentColor: oppColor,
    yourTurn: state.current === playerIdx && state.winner === null,
    moveCount: state.moveCount,
    lastMove: state.lastMove,
    winner: state.winner,
    youAreAttacker: playerIdx === state.attackerIdx,
    deadline: state.deadline,
  };
}

function getDeadline(state) { return state.deadline; }

function onTimeout(state) {
  const events = [];
  const loser = state.current;
  state.winner = 1 - loser;
  events.push(`${loser === state.attackerIdx ? '攻方' : '守方'}思虑过久，判负`);
  return { events };
}

module.exports = {
  id: 'gomoku',
  name: '五子棋',
  icon: '⚫',
  description: '黑先白后，先连五子者胜',
  init, validateAction, applyAction, isOver, getWinner,
  whoseTurn, canAct, buildView, getDeadline, onTimeout,
};