export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type GameMode = 'pass_and_play' | 'vs_ai' | 'sandbox';
export type BotDifficulty = 'easy' | 'medium' | 'hard';
export type DestructionStyle = 'shatter' | 'burst' | 'dissolve';
export type GraphicsQuality = 'high' | 'balanced' | 'performance';

export interface GameSettings {
  graphics: GraphicsQuality;
  destructionStyle: DestructionStyle;
  botDifficulty: BotDifficulty;
  soundEnabled: boolean;
  autoRotateBoard: boolean;
  showLegalMoves: boolean;
}

export interface CapturedPieces {
  w: PieceType[];
  b: PieceType[];
}

export interface MoveLogItem {
  from: string;
  to: string;
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  san: string;
  fen: string;
}

export interface BoardSquare {
  file: string; // 'a' - 'h'
  rank: number; // 1 - 8
  name: string; // 'e4'
  isDark: boolean;
}
