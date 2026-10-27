import { Chess, type Square } from 'chess.js';
import type { CapturedPieces, MoveLogItem, PieceColor, PieceType } from '../types/chess';

// Standard piece values for evaluation
const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-Square Tables (White perspective - flip rank for Black)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_TABLE_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

export class ChessGameController {
  public chess: Chess;
  public moveHistory: MoveLogItem[] = [];
  public capturedPieces: CapturedPieces = { w: [], b: [] };

  constructor(fen?: string) {
    this.chess = new Chess(fen);
    this.recomputeCapturedPieces();
  }

  public reset() {
    this.chess.reset();
    this.moveHistory = [];
    this.capturedPieces = { w: [], b: [] };
  }

  public getTurn(): PieceColor {
    return this.chess.turn();
  }

  public isCheck(): boolean {
    return this.chess.inCheck();
  }

  public isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  public isDraw(): boolean {
    return this.chess.isDraw();
  }

  public isStalemate(): boolean {
    return this.chess.isStalemate();
  }

  public isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  public getGameOverReason(): string | null {
    if (this.chess.isCheckmate()) {
      return `Checkmate! ${this.chess.turn() === 'w' ? 'Black' : 'White'} wins.`;
    }
    if (this.chess.isStalemate()) {
      return 'Draw by Stalemate.';
    }
    if (this.chess.isThreefoldRepetition()) {
      return 'Draw by Threefold Repetition.';
    }
    if (this.chess.isInsufficientMaterial()) {
      return 'Draw by Insufficient Material.';
    }
    if (this.chess.isDraw()) {
      return 'Draw (50-move rule).';
    }
    return null;
  }

  public getKingSquare(color: PieceColor): string | null {
    const board = this.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === color) {
          const file = String.fromCharCode('a'.charCodeAt(0) + c);
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }
    return null;
  }

  public getPieceAt(square: string) {
    return this.chess.get(square as Square);
  }

  public getLegalMoves(square: string): string[] {
    const moves = this.chess.moves({ square: square as Square, verbose: true });
    return moves.map(m => m.to);
  }

  public getLegalMovesVerbose(square: string) {
    return this.chess.moves({ square: square as Square, verbose: true });
  }

  public makeMove(from: string, to: string, promotion: PieceType = 'q') {
    try {
      const move = this.chess.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion as 'q' | 'r' | 'b' | 'n',
      });

      if (!move) return null;

      // Track move item
      const logItem: MoveLogItem = {
        from: move.from,
        to: move.to,
        piece: move.piece as PieceType,
        color: move.color as PieceColor,
        captured: move.captured as PieceType | undefined,
        san: move.san,
        fen: this.chess.fen(),
      };
      this.moveHistory.push(logItem);

      this.recomputeCapturedPieces();
      return move;
    } catch {
      return null;
    }
  }

  public undoMove(): boolean {
    const undone = this.chess.undo();
    if (undone) {
      this.moveHistory.pop();
      this.recomputeCapturedPieces();
      return true;
    }
    return false;
  }

  public recomputeCapturedPieces() {
    const initialCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };

    const board = this.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          initialCounts[p.color][p.type] = Math.max(0, initialCounts[p.color][p.type] - 1);
        }
      }
    }

    // What remains in initialCounts has been captured
    const captured: CapturedPieces = { w: [], b: [] };
    (['p', 'n', 'b', 'r', 'q'] as PieceType[]).forEach(t => {
      // White pieces captured by black
      for (let i = 0; i < initialCounts.w[t]; i++) {
        captured.w.push(t);
      }
      // Black pieces captured by white
      for (let i = 0; i < initialCounts.b[t]; i++) {
        captured.b.push(t);
      }
    });

    this.capturedPieces = captured;
  }

  public getMaterialScore(): { white: number; black: number; diff: number } {
    let white = 0;
    let black = 0;
    const board = this.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          const val = PIECE_VALUES[p.type] || 0;
          if (p.color === 'w') white += val;
          else black += val;
        }
      }
    }
    return { white, black, diff: white - black };
  }

  // AI Move evaluation
  public getBestAIMove(difficulty: 'easy' | 'medium' | 'hard'): { from: string; to: string; promotion?: PieceType } | null {
    const legalMoves = this.chess.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    if (difficulty === 'easy') {
      // 30% chance of random move, otherwise evaluate 1-ply
      if (Math.random() < 0.35) {
        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        return { from: randomMove.from, to: randomMove.to, promotion: randomMove.promotion as PieceType };
      }
    }

    const depth = difficulty === 'hard' ? 3 : (difficulty === 'medium' ? 2 : 1);
    const isMaximizing = this.chess.turn() === 'w';

    let bestMove = legalMoves[0];
    let bestScore = isMaximizing ? -Infinity : Infinity;

    // Sort moves: Captures first
    const sortedMoves = [...legalMoves].sort((a, b) => {
      const aScore = a.captured ? (PIECE_VALUES[a.captured as PieceType] || 0) * 10 - (PIECE_VALUES[a.piece as PieceType] || 0) : 0;
      const bScore = b.captured ? (PIECE_VALUES[b.captured as PieceType] || 0) * 10 - (PIECE_VALUES[b.piece as PieceType] || 0) : 0;
      return bScore - aScore;
    });

    for (const move of sortedMoves) {
      this.chess.move(move);
      const score = this.minimax(depth - 1, -Infinity, Infinity, !isMaximizing);
      this.chess.undo();

      if (isMaximizing) {
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
    }

    return {
      from: bestMove.from,
      to: bestMove.to,
      promotion: (bestMove.promotion as PieceType) || 'q',
    };
  }

  private minimax(depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
    if (depth === 0 || this.chess.isGameOver()) {
      return this.evaluateBoard();
    }

    const moves = this.chess.moves({ verbose: true });
    if (moves.length === 0) {
      if (this.chess.inCheck()) {
        return isMaximizing ? -99999 + (3 - depth) : 99999 - (3 - depth);
      }
      return 0; // Stalemate
    }

    // Move ordering
    moves.sort((a, b) => {
      const aScore = a.captured ? (PIECE_VALUES[a.captured as PieceType] || 0) : 0;
      const bScore = b.captured ? (PIECE_VALUES[b.captured as PieceType] || 0) : 0;
      return bScore - aScore;
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        this.chess.move(move);
        const evalScore = this.minimax(depth - 1, alpha, beta, false);
        this.chess.undo();
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        this.chess.move(move);
        const evalScore = this.minimax(depth - 1, alpha, beta, true);
        this.chess.undo();
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private evaluateBoard(): number {
    let totalScore = 0;
    const board = this.chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const val = PIECE_VALUES[piece.type] || 0;
        let posBonus = 0;

        const sqIndex = piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
        switch (piece.type) {
          case 'p':
            posBonus = PAWN_TABLE[sqIndex] || 0;
            break;
          case 'n':
            posBonus = KNIGHT_TABLE[sqIndex] || 0;
            break;
          case 'b':
            posBonus = BISHOP_TABLE[sqIndex] || 0;
            break;
          case 'r':
            posBonus = ROOK_TABLE[sqIndex] || 0;
            break;
          case 'q':
            posBonus = QUEEN_TABLE[sqIndex] || 0;
            break;
          case 'k':
            posBonus = KING_TABLE_MID[sqIndex] || 0;
            break;
        }

        const score = val + posBonus;
        if (piece.color === 'w') {
          totalScore += score;
        } else {
          totalScore -= score;
        }
      }
    }

    return totalScore;
  }
}
