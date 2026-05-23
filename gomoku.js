/**
 * 五子棋纯逻辑（与网络无关，便于单测）
 *
 * 棋盘是 size × size 的二维数组：0=空，1=黑(先手)，2=白
 * 颜色与玩家身份在外层映射，本模块只关心棋子。
 */

const DEFAULT_SIZE = 9;
const WIN_LEN = 5;

function newBoard(size = DEFAULT_SIZE) {
  const b = new Array(size);
  for (let i = 0; i < size; i++) {
    b[i] = new Array(size).fill(0);
  }
  return b;
}

function inBounds(board, r, c) {
  return r >= 0 && r < board.length && c >= 0 && c < board.length;
}

function isEmpty(board, r, c) {
  return inBounds(board, r, c) && board[r][c] === 0;
}

function place(board, r, c, color) {
  if (!inBounds(board, r, c)) return { ok: false, reason: '越界' };
  if (board[r][c] !== 0) return { ok: false, reason: '此处已有棋子' };
  if (color !== 1 && color !== 2) return { ok: false, reason: '非法颜色' };
  board[r][c] = color;
  return { ok: true };
}

// 从 (r, c) 起朝 (dr, dc) 方向数同色（含起点）
function countDir(board, r, c, dr, dc, color) {
  let n = 0;
  while (inBounds(board, r, c) && board[r][c] === color) {
    n++;
    r += dr;
    c += dc;
  }
  return n;
}

// 判断刚下在 (r, c) 的颜色是否连五
function checkWin(board, r, c, color) {
  if (!inBounds(board, r, c) || board[r][c] !== color) return false;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    // 正向含 (r,c)，反向从 (r-dr,c-dc) 起且不含 (r,c)，两段无交集
    const total = countDir(board, r, c, dr, dc, color)
      + countDir(board, r - dr, c - dc, -dr, -dc, color);
    if (total >= WIN_LEN) return true;
  }
  return false;
}

function isFull(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell === 0) return false;
    }
  }
  return true;
}

function applyMove(board, r, c, color) {
  const placed = place(board, r, c, color);
  if (!placed.ok) return { ok: false, reason: placed.reason };
  const win = checkWin(board, r, c, color);
  const draw = !win && isFull(board);
  return { ok: true, win, draw };
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

module.exports = {
  DEFAULT_SIZE, WIN_LEN,
  newBoard, inBounds, isEmpty, place, checkWin, isFull, applyMove, cloneBoard,
};