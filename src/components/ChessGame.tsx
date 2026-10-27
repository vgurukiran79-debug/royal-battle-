import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  Undo2,
  Camera,
  Settings,
  Volume2,
  VolumeX,
  Swords,
  Bot,
  User,
  History,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Trophy,
  Flame,
  Sparkles,
  Zap,
  Play
} from 'lucide-react';
import type {
  GameMode,
  BotDifficulty,
  DestructionStyle,
  GraphicsQuality,
  GameSettings,
  PieceColor,
  PieceType,
  MoveLogItem
} from '../types/chess';
import { ChessGameController } from '../chess/chessEngine';
import { ChessSceneManager } from '../three/chessScene';
import { sound } from '../audio/soundEffects';

const PIECE_SYMBOLS: Record<PieceType, { w: string; b: string; name: string }> = {
  p: { w: '♙', b: '♟', name: 'Pawn' },
  n: { w: '♘', b: '♞', name: 'Knight' },
  b: { w: '♗', b: '♝', name: 'Bishop' },
  r: { w: '♖', b: '♜', name: 'Rook' },
  q: { w: '♕', b: '♛', name: 'Queen' },
  k: { w: '♔', b: '♚', name: 'King' },
};

export const ChessGame: React.FC = () => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<ChessSceneManager | null>(null);
  const engineRef = useRef<ChessGameController>(new ChessGameController());

  // Game UI States
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [gameMode, setGameMode] = useState<GameMode>('vs_ai');
  const [turn, setTurn] = useState<PieceColor>('w');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [isCheck, setIsCheck] = useState<boolean>(false);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Promotion state
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: PieceColor;
  } | null>(null);

  // Settings
  const [settings, setSettings] = useState<GameSettings>({
    graphics: 'high',
    destructionStyle: 'shatter',
    botDifficulty: 'medium',
    soundEnabled: true,
    autoRotateBoard: false,
    showLegalMoves: true,
  });

  // UI Panels
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);

  // Stats
  const [moveHistory, setMoveHistory] = useState<MoveLogItem[]>([]);
  const [capturedWhite, setCapturedWhite] = useState<PieceType[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<PieceType[]>([]);
  const [materialDiff, setMaterialDiff] = useState<number>(0);

  // Sync settings with audio and scene
  useEffect(() => {
    sound.enabled = settings.soundEnabled;
    if (sceneManagerRef.current) {
      sceneManagerRef.current.destructionStyle = settings.destructionStyle;
      sceneManagerRef.current.setQuality(settings.graphics);
    }
  }, [settings]);

  // Update game state metrics
  const refreshGameState = useCallback(() => {
    const engine = engineRef.current;
    const currentTurn = engine.getTurn();
    setTurn(currentTurn);
    setIsCheck(engine.isCheck());
    setMoveHistory([...engine.moveHistory]);
    setCapturedWhite([...engine.capturedPieces.w]);
    setCapturedBlack([...engine.capturedPieces.b]);

    const { diff } = engine.getMaterialScore();
    setMaterialDiff(diff);

    if (engine.isGameOver()) {
      const reason = engine.getGameOverReason();
      setGameOverReason(reason);
      if (engine.isCheckmate()) {
        sound.playVictory();
      }
    } else {
      setGameOverReason(null);
    }

    // Update king check visual indicator
    if (sceneManagerRef.current) {
      if (engine.isCheck()) {
        const kingSq = engine.getKingSquare(currentTurn);
        sceneManagerRef.current.boardManager.setCheckIndicator(kingSq);
        sound.playCheck();
      } else {
        sceneManagerRef.current.boardManager.setCheckIndicator(null);
      }
    }
  }, []);

  // Execute a move programmatically and visually
  const executeMove = useCallback(
    async (from: string, to: string, promotion: PieceType = 'q') => {
      const engine = engineRef.current;
      const scene = sceneManagerRef.current;
      if (!scene) return;

      const movingPiece = engine.getPieceAt(from);
      const targetPiece = engine.getPieceAt(to);
      const isEnPassant = movingPiece?.type === 'p' && !targetPiece && from[0] !== to[0];
      const capturedType = targetPiece?.type || (isEnPassant ? 'p' : undefined);

      // Make move in rules engine
      const move = engine.makeMove(from, to, promotion);
      if (!move) return;

      // Clear highlights
      scene.boardManager.clearHighlights();
      setSelectedSquare(null);
      setLegalMoves([]);

      // Highlight last move squares
      scene.boardManager.setLastMove(from, to);

      // Animate 3D piece movement and destruction
      await scene.animateMove(from, to, capturedType, move.promotion ? (promotion as PieceType) : undefined);

      // Handle castling rook movement
      if (move.flags.includes('k')) {
        // Kingside castle: rook from h1/h8 to f1/f8
        const rank = move.color === 'w' ? '1' : '8';
        await scene.animateMove(`h${rank}`, `f${rank}`, undefined);
      } else if (move.flags.includes('q')) {
        // Queenside castle: rook from a1/a8 to d1/d8
        const rank = move.color === 'w' ? '1' : '8';
        await scene.animateMove(`a${rank}`, `d${rank}`, undefined);
      }

      // Handle en passant victim removal if applicable
      if (isEnPassant) {
        const victimRank = move.color === 'w' ? '5' : '4';
        const epVictimSquare = `${to[0]}${victimRank}`;
        const epMesh = scene.pieces.get(epVictimSquare);
        if (epMesh) {
          scene.scene.remove(epMesh);
          scene.pieces.delete(epVictimSquare);
        }
      }

      // Auto rotate board if pass and play
      if (settings.autoRotateBoard && gameMode === 'pass_and_play') {
        scene.flipCamera(engine.getTurn() === 'b');
      }

      refreshGameState();

      // Trigger AI turn if gameMode === 'vs_ai' and turn is Black and game is not over
      if (gameMode === 'vs_ai' && engine.getTurn() === 'b' && !engine.isGameOver()) {
        setIsAiThinking(true);
        setTimeout(async () => {
          const aiMove = engine.getBestAIMove(settings.botDifficulty);
          setIsAiThinking(false);
          if (aiMove) {
            await executeMove(aiMove.from, aiMove.to, aiMove.promotion || 'q');
          }
        }, 350);
      }
    },
    [gameMode, settings.autoRotateBoard, settings.botDifficulty, refreshGameState]
  );

  // Square click handling from 3D raycast
  const handleSquareClick = useCallback(
    (square: string) => {
      if (isAnimating || isAiThinking || !!gameOverReason) return;

      const engine = engineRef.current;
      const scene = sceneManagerRef.current;
      if (!scene) return;

      const currentTurn = engine.getTurn();

      // In vs_ai mode, player only controls White
      if (gameMode === 'vs_ai' && currentTurn !== 'w') return;

      const clickedPiece = engine.getPieceAt(square);

      // Case 1: Selecting one of player's own pieces
      if (clickedPiece && clickedPiece.color === currentTurn) {
        // Deselect if clicking the already selected piece again
        if (selectedSquare === square) {
          sound.playSelect();
          setSelectedSquare(null);
          setLegalMoves([]);
          scene.boardManager.clearHighlights();
          return;
        }

        sound.playSelect();
        setSelectedSquare(square);
        const verboseMoves = engine.getLegalMovesVerbose(square);
        const destinations = verboseMoves.map(m => m.to as string);
        const captureDestinations = new Set<string>(
          verboseMoves
            .filter(m => !!m.captured || m.flags.includes('e'))
            .map(m => m.to as string)
        );
        setLegalMoves(destinations);

        // Highlight selected square (shows even if no legal moves available)
        scene.boardManager.setSelectedSquare(square);
        if (settings.showLegalMoves) {
          scene.boardManager.setLegalMoves(destinations, dest => captureDestinations.has(dest));
        } else {
          scene.boardManager.setLegalMoves([], () => false);
        }
        return;
      }

      // Case 2: Player has already selected a piece, now clicking destination
      if (selectedSquare) {
        if (legalMoves.includes(square)) {
          const movingPiece = engine.getPieceAt(selectedSquare);
          // Check for pawn promotion: reaching 8th rank for white or 1st rank for black
          const isPromotion =
            movingPiece?.type === 'p' &&
            ((movingPiece.color === 'w' && square[1] === '8') ||
              (movingPiece.color === 'b' && square[1] === '1'));

          if (isPromotion) {
            setPendingPromotion({
              from: selectedSquare,
              to: square,
              color: movingPiece.color as PieceColor,
            });
            return;
          }

          executeMove(selectedSquare, square);
        } else {
          // Deselect
          setSelectedSquare(null);
          setLegalMoves([]);
          scene.boardManager.clearHighlights();
        }
      }
    },
    [isAnimating, isAiThinking, gameOverReason, gameMode, selectedSquare, legalMoves, settings.showLegalMoves, executeMove]
  );

  // Initialize 3D Scene
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const sceneManager = new ChessSceneManager(canvasMountRef.current, {
      onSquareClick: handleSquareClick,
      onAnimationStateChange: setIsAnimating,
    });
    sceneManagerRef.current = sceneManager;

    // Load initial board pieces
    sceneManager.setupPiecesFromFEN(engineRef.current.chess.fen());
    refreshGameState();

    return () => {
      sceneManager.dispose();
      sceneManagerRef.current = null;
    };
  }, [handleSquareClick, refreshGameState]);

  // Restart match
  const handleRestart = (newMode?: GameMode) => {
    const engine = engineRef.current;
    const scene = sceneManagerRef.current;
    if (!scene) return;

    if (newMode) setGameMode(newMode);
    engine.reset();
    scene.setupPiecesFromFEN(engine.chess.fen());
    scene.boardManager.clearHighlights();
    scene.boardManager.setLastMove(null, null);
    scene.boardManager.setCheckIndicator(null);
    scene.resetCamera();

    setSelectedSquare(null);
    setLegalMoves([]);
    setGameOverReason(null);
    setIsAiThinking(false);
    refreshGameState();
  };

  // Undo move
  const handleUndo = () => {
    if (isAnimating || isAiThinking) return;
    const engine = engineRef.current;
    const scene = sceneManagerRef.current;
    if (!scene) return;

    // In vs_ai mode, undo two plies (player's move and AI's move)
    const undoCount = gameMode === 'vs_ai' && engine.getTurn() === 'w' ? 2 : 1;
    let didUndo = false;

    for (let i = 0; i < undoCount; i++) {
      if (engine.undoMove()) {
        didUndo = true;
      }
    }

    if (didUndo) {
      scene.setupPiecesFromFEN(engine.chess.fen());
      scene.boardManager.clearHighlights();
      const lastMove = engine.moveHistory[engine.moveHistory.length - 1];
      if (lastMove) {
        scene.boardManager.setLastMove(lastMove.from, lastMove.to);
      } else {
        scene.boardManager.setLastMove(null, null);
      }
      setSelectedSquare(null);
      setLegalMoves([]);
      refreshGameState();
      sound.playMove();
    }
  };

  // Handle promotion choice
  const handleChoosePromotion = (promoPiece: PieceType) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    executeMove(from, to, promoPiece);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0d14] select-none font-sans text-slate-100">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-0" />

      {/* Opening Hero / Title Screen */}
      {!gameStarted && (
        <div className="absolute inset-0 z-40 bg-black/75 flex flex-col items-center justify-center p-6 backdrop-blur-xs">
          <div className="max-w-md w-full bg-[#121620] border border-[#d4af37]/40 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="flex justify-center mb-2">
              <div className="w-16 h-16 rounded-full bg-[#1a2130] border border-[#d4af37] flex items-center justify-center text-[#d4af37] shadow-lg">
                <Swords className="w-8 h-8" />
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-wider text-slate-50 uppercase">
                Royal Battle
              </h1>
              <p className="text-xs uppercase tracking-widest text-[#d4af37] mt-1 font-medium">
                3D Destruction Chess
              </p>
              <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                Experience high-stakes chess in an obsidian citadel. Every capture shatters pieces into physical 3D fragments.
              </p>
            </div>

            <div className="space-y-3 pt-2 text-left">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Choose Game Mode
              </span>

              {/* Mode 1: Play vs AI */}
              <button
                type="button"
                onClick={() => setGameMode('vs_ai')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  gameMode === 'vs_ai'
                    ? 'border-[#d4af37] bg-[#1d2433] text-white shadow-md'
                    : 'border-slate-800 bg-[#151a24] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bot className={`w-5 h-5 ${gameMode === 'vs_ai' ? 'text-[#d4af37]' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-semibold text-sm">Single Player vs AI Bot</div>
                    <div className="text-xs text-slate-400">Play White against the Citadel Engine</div>
                  </div>
                </div>
                {gameMode === 'vs_ai' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[#d4af37]/20 text-[#d4af37] font-medium">
                    {settings.botDifficulty.toUpperCase()}
                  </span>
                )}
              </button>

              {/* Mode 2: Pass & Play */}
              <button
                type="button"
                onClick={() => setGameMode('pass_and_play')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  gameMode === 'pass_and_play'
                    ? 'border-[#d4af37] bg-[#1d2433] text-white shadow-md'
                    : 'border-slate-800 bg-[#151a24] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className={`w-5 h-5 ${gameMode === 'pass_and_play' ? 'text-[#d4af37]' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-semibold text-sm">Pass & Play (2 Players)</div>
                    <div className="text-xs text-slate-400">Play locally with a friend on one screen</div>
                  </div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setGameStarted(true);
                sound.playMove();
              }}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b38f28] text-slate-950 font-bold text-sm tracking-wide uppercase hover:brightness-110 shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              Enter The Citadel
            </button>
          </div>
        </div>
      )}

      {/* TOP STATUS BAR (UNOBSTRUCTED COMPACT STRIP) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[94vw] max-w-4xl flex items-center justify-between px-5 py-2.5 bg-[#121622]/90 border border-slate-800/80 rounded-2xl shadow-xl pointer-events-auto">
        {/* Left: Brand Wordmark & Mode */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-wider text-slate-100 uppercase">
            Royal Battle
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-slate-400 font-medium">
            {gameMode === 'vs_ai' ? `vs AI (${settings.botDifficulty})` : '2 Players (Local)'}
          </span>
        </div>

        {/* Center: Turn Status & Alert */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-[#1a202c] border border-slate-700/60 rounded-full text-xs font-semibold">
            <span
              className={`w-3 h-3 rounded-full border ${
                turn === 'w' ? 'bg-[#ede7da] border-slate-400' : 'bg-[#151821] border-slate-600'
              }`}
            />
            <span>{turn === 'w' ? 'White Turn' : 'Black Turn'}</span>
            {isAiThinking && (
              <span className="text-[#d4af37] text-xs font-normal animate-pulse">
                (Bot Thinking...)
              </span>
            )}
          </div>

          {isCheck && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-950/80 border border-red-600/70 rounded-full text-red-200 text-xs font-bold animate-bounce">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>CHECK</span>
            </div>
          )}
        </div>

        {/* Right: Captured Pieces & Advantage */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1 text-slate-300">
            <span className="text-slate-400">Captured:</span>
            <div className="flex max-w-[120px] overflow-hidden text-sm">
              {capturedWhite.slice(-6).map((p, i) => (
                <span key={i} className="text-slate-200" title={`White ${PIECE_SYMBOLS[p].name}`}>
                  {PIECE_SYMBOLS[p].w}
                </span>
              ))}
            </div>
            {materialDiff !== 0 && (
              <span className={`font-bold ml-1 ${materialDiff > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {materialDiff > 0 ? `+${materialDiff / 100}` : `${materialDiff / 100}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE BOTTOM CONTROL DOCK */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto">
        {/* Dock Toggle Tab */}
        <button
          type="button"
          onClick={() => setIsDockCollapsed(c => !c)}
          className="mb-1 px-3 py-0.5 bg-[#121622]/90 border border-slate-800 border-b-0 rounded-t-lg text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
        >
          {isDockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Hide Controls
            </>
          )}
        </button>

        {/* Unified Bottom Bar */}
        {!isDockCollapsed && (
          <div className="flex items-center gap-2 p-2 bg-[#121622]/95 border border-slate-800 rounded-2xl shadow-2xl max-w-[94vw] overflow-x-auto">
            {/* Undo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={isAnimating || isAiThinking || moveHistory.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] active:bg-[#2d3748] disabled:opacity-40 disabled:pointer-events-none text-slate-200 text-xs font-semibold transition-all border border-slate-700/50"
              title="Undo last move"
            >
              <Undo2 className="w-4 h-4 text-slate-300" />
              <span>Undo</span>
            </button>

            {/* Restart */}
            <button
              type="button"
              onClick={() => handleRestart()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] active:bg-[#2d3748] text-slate-200 text-xs font-semibold transition-all border border-slate-700/50"
              title="Restart current match"
            >
              <RotateCcw className="w-4 h-4 text-slate-300" />
              <span>Restart</span>
            </button>

            <div className="w-[1px] h-6 bg-slate-800 mx-1" />

            {/* Camera Reset */}
            <button
              type="button"
              onClick={() => sceneManagerRef.current?.resetCamera()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] text-slate-200 text-xs font-semibold transition-all border border-slate-700/50"
              title="Reset camera angle"
            >
              <Camera className="w-4 h-4 text-[#d4af37]" />
              <span>Reset View</span>
            </button>

            {/* Flip Board (180 deg) */}
            <button
              type="button"
              onClick={() => {
                const isBlack = turn === 'b';
                sceneManagerRef.current?.flipCamera(!isBlack);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] text-slate-200 text-xs font-semibold transition-all border border-slate-700/50"
              title="Flip board perspective"
            >
              <Swords className="w-4 h-4 text-slate-300" />
              <span>Flip Board</span>
            </button>

            <div className="w-[1px] h-6 bg-slate-800 mx-1" />

            {/* Move History Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(h => !h)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                showHistoryDrawer
                  ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#d4af37]'
                  : 'bg-[#1a202c] hover:bg-[#252e3e] border-slate-700/50 text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History ({moveHistory.length})</span>
            </button>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
              className="p-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] text-slate-200 transition-all border border-slate-700/50"
              title={settings.soundEnabled ? 'Mute sound' : 'Enable sound'}
            >
              {settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] text-slate-200 transition-all border border-slate-700/50"
              title="Destruction FX & Graphics Settings"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        )}
      </div>

      {/* MOVE HISTORY DRAWER */}
      {showHistoryDrawer && (
        <div className="absolute right-5 bottom-20 z-30 w-72 max-h-80 bg-[#121622]/95 border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Move History
            </span>
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(false)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1 font-mono text-xs pr-1">
            {moveHistory.length === 0 ? (
              <div className="text-slate-500 text-center py-6">No moves made yet</div>
            ) : (
              Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                const whiteMove = moveHistory[i * 2];
                const blackMove = moveHistory[i * 2 + 1];
                return (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/50">
                    <span className="text-slate-500 w-8">{i + 1}.</span>
                    <span className="text-slate-200 font-semibold w-24">
                      {whiteMove ? whiteMove.san : ''}
                    </span>
                    <span className="text-slate-400 font-semibold w-24">
                      {blackMove ? blackMove.san : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* PAWN PROMOTION SELECTION MODAL */}
      {pendingPromotion && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121620] border border-[#d4af37] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 uppercase tracking-wide mb-1">
              Pawn Promotion
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Select which royal rank your champion ascends to:
            </p>

            <div className="grid grid-cols-2 gap-3">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleChoosePromotion(type)}
                  className="flex flex-col items-center justify-center p-4 bg-[#1a2130] hover:bg-[#252f44] border border-slate-700/80 hover:border-[#d4af37] rounded-xl transition-all group"
                >
                  <span className="text-3xl mb-1 text-slate-100 group-hover:scale-110 transition-transform">
                    {PIECE_SYMBOLS[type][pendingPromotion.color]}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    {PIECE_SYMBOLS[type].name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {gameOverReason && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#121620] border border-[#d4af37] rounded-2xl p-8 max-w-md w-full text-center shadow-2xl space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#1e2638] border border-[#d4af37] flex items-center justify-center text-[#d4af37]">
              <Trophy className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-wide text-slate-100">
                Battle Concluded
              </h2>
              <p className="text-sm font-semibold text-[#d4af37] mt-1">
                {gameOverReason}
              </p>
            </div>

            <p className="text-xs text-slate-400">
              Total moves: {moveHistory.length} · Citadel honors the victor.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleRestart()}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b38f28] text-slate-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 transition-all"
              >
                Rematch
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameStarted(false);
                  handleRestart();
                }}
                className="px-4 py-3 rounded-xl bg-[#1a2130] hover:bg-[#252f44] text-slate-300 font-semibold text-xs transition-all border border-slate-700"
              >
                Change Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#d4af37]" /> Game & Visual Settings
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            {/* Destruction Style */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Destruction Effect Style
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'shatter', label: 'Shatter', icon: Flame },
                  { id: 'burst', label: 'Energy Burst', icon: Zap },
                  { id: 'dissolve', label: 'Dissolve', icon: Sparkles },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setSettings(s => ({ ...s, destructionStyle: item.id as DestructionStyle }))
                      }
                      className={`flex flex-col items-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        settings.destructionStyle === item.id
                          ? 'border-[#d4af37] bg-[#1d2433] text-[#d4af37]'
                          : 'border-slate-800 bg-[#161a24] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-1" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Graphics Tier */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Graphics Quality
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['high', 'balanced', 'performance'] as GraphicsQuality[]).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, graphics: q }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                      settings.graphics === q
                        ? 'border-[#d4af37] bg-[#1d2433] text-[#d4af37]'
                        : 'border-slate-800 bg-[#161a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Bot Difficulty (when in AI mode) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Bot Difficulty
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, botDifficulty: d }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                      settings.botDifficulty === d
                        ? 'border-[#d4af37] bg-[#1d2433] text-[#d4af37]'
                        : 'border-slate-800 bg-[#161a24] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {d === 'easy' ? 'Apprentice' : d === 'medium' ? 'Tactician' : 'Grandmaster'}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-slate-300">Auto-Rotate Board in 2-Player</span>
                <input
                  type="checkbox"
                  checked={settings.autoRotateBoard}
                  onChange={e => setSettings(s => ({ ...s, autoRotateBoard: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-[#d4af37] focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-slate-300">Show Legal Move Indicators</span>
                <input
                  type="checkbox"
                  checked={settings.showLegalMoves}
                  onChange={e => setSettings(s => ({ ...s, showLegalMoves: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-[#d4af37] focus:ring-0"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#1a202c] hover:bg-[#252e3e] text-slate-200 text-xs font-bold uppercase tracking-wider transition-all border border-slate-700/60"
            >
              Save & Return
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
