import { useCallback, useEffect, useState } from 'react';
import { Chessboard as ReactChessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import type { MoveRecord, QuantumGameState } from '../../engine/ChessEngine';
import { getSuperpositionPieces, getBoardPosition, findPieceAtSquare, getLegalActions, getLegalMovesFromSquare } from '../../engine/ChessEngine';
import './Chessboard.css';

const BOARD_SIZE = 640;

interface ChessboardProps {
  gameState: QuantumGameState;
  playerColor: 'white' | 'black';
  boardOrientation?: 'white' | 'black';
  isMyTurn: boolean;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  highlightedMove?: MoveRecord | null;
  splitMode?: boolean;
  splitFrom?: Square | null;
  splitTo1?: Square | null;
  onSplitSelection?: (square: Square, sourceSquare?: Square) => void;
}

export function Chessboard({
  gameState,
  playerColor,
  boardOrientation = playerColor,
  isMyTurn,
  onMove,
  highlightedMove = null,
  splitMode = false,
  splitFrom = null,
  splitTo1 = null,
  onSplitSelection
}: ChessboardProps) {
  const [boardSize, setBoardSize] = useState(BOARD_SIZE);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [captureSquare, setCaptureSquare] = useState<Square | null>(null);

  useEffect(() => {
    const updateBoardSize = () => {
      const availableWidth = window.innerWidth - 120;
      setBoardSize(Math.min(BOARD_SIZE, Math.max(240, availableWidth)));
    };

    updateBoardSize();
    window.addEventListener('resize', updateBoardSize);
    return () => window.removeEventListener('resize', updateBoardSize);
  }, []);

  useEffect(() => {
    const latestMove = gameState.moveHistory[gameState.moveHistory.length - 1];
    if (!latestMove) return;

    const capturedSquare = latestMove.type === 'quantum_capture'
      ? latestMove.collapseResult?.wasCapture
        ? latestMove.collapseResult.collapsedTo
        : null
      : latestMove.type === 'capture'
        ? latestMove.to as Square
        : null;

    if (!capturedSquare) {
      const timer = setTimeout(() => setCaptureSquare(null), 0);
      return () => clearTimeout(timer);
    }

    const showTimer = setTimeout(() => setCaptureSquare(capturedSquare), 0);
    const hideTimer = setTimeout(() => setCaptureSquare(null), 1_000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [gameState.moveHistory]);

  // Get pieces in superposition for visual indicators
  const superpositionPieces = getSuperpositionPieces(gameState);

  // Get board position from QUANTUM state (not chess.js FEN!)
  // This ensures escaped pieces are shown correctly after quantum collapse
  const quantumPosition = getBoardPosition(gameState);

  // Handle piece drop (drag and drop)
  const handlePieceDrop = useCallback(({ piece, sourceSquare, targetSquare }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean => {
    if (!isMyTurn || !targetSquare) return false;

    // Check if it's a promotion
    const pieceType = piece.pieceType;
    const isPromotion = pieceType[1]?.toLowerCase() === 'p' &&
      ((pieceType[0] === 'w' && targetSquare[1] === '8') ||
        (pieceType[0] === 'b' && targetSquare[1] === '1'));

    const promotion = isPromotion ? 'q' : undefined;

    const success = onMove(sourceSquare as Square, targetSquare as Square, promotion);
    setMoveFrom(null);
    setOptionSquares({});
    return success;
  }, [isMyTurn, onMove]);

  // Handle click to select piece and show legal moves
  const handleSquareClick = useCallback(({ square }: { piece: { pieceType: string } | null; square: string }) => {
    if (!isMyTurn) return;

    // SPLIT MODE: Handle quantum split selection
    if (splitMode && onSplitSelection) {
      onSplitSelection(square as Square, !splitFrom ? moveFrom as Square | undefined : undefined);
      return;
    }

    // If clicking on a legal move target, make the move
    if (moveFrom && optionSquares[square]) {
      // Check for promotion - need to check both chess.js and quantum state
      const chessPiece = gameState.chess.get(moveFrom as Square);
      const quantumPiece = findPieceAtSquare(gameState, moveFrom as Square);

      const isPawn = chessPiece?.type === 'p' || quantumPiece?.type === 'pawn';
      const isWhite = chessPiece?.color === 'w' || quantumPiece?.owner === 'white';
      const isPromotion = isPawn &&
        ((isWhite && square[1] === '8') ||
          (!isWhite && square[1] === '1'));

      const promotion = isPromotion ? 'q' : undefined;
      onMove(moveFrom as Square, square as Square, promotion);
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    // Get piece at square - check BOTH chess.js and quantum state
    const chessPiece = gameState.chess.get(square as Square);
    const quantumPiece = findPieceAtSquare(gameState, square as Square);

    // Check if there's a selectable piece (either from chess.js or quantum state)
    const isOurPiece = (chessPiece &&
      ((chessPiece.color === 'w' && playerColor === 'white') ||
        (chessPiece.color === 'b' && playerColor === 'black'))) ||
      (quantumPiece && quantumPiece.owner === playerColor);

    if (isOurPiece) {
      // Select the piece (no legal move indicators shown)
      setMoveFrom(square);

      // Get legal moves from this specific square (handles quantum positions correctly)
      const moves = getLegalMovesFromSquare(gameState, square as Square);
      const targetSquares: Set<string> = new Set(moves.map(m => m.to));

      const newSquares: Record<string, React.CSSProperties> = {};

      // Store target squares for move validation and highlight valid destinations.
      targetSquares.forEach(targetSq => {
        newSquares[targetSq] = {
          background: 'rgba(255, 215, 0, 0.45)',
          boxShadow: 'inset 0 0 0 3px rgba(255, 193, 7, 0.8)'
        };
      });

      // Highlight selected square only
      newSquares[square] = {
        background: 'rgba(255, 235, 59, 0.7)',
        boxShadow: 'inset 0 0 0 3px rgba(255, 193, 7, 0.95)'
      };

      setOptionSquares(newSquares);
    } else {
      // Deselect
      setMoveFrom(null);
      setOptionSquares({});
    }
  }, [isMyTurn, moveFrom, optionSquares, gameState, playerColor, onMove, splitMode, splitFrom, onSplitSelection]);

  // Custom square styles for check indication and quantum highlighting
  const customSquareStyles: Record<string, React.CSSProperties> = { ...optionSquares };

  // Highlight king in check
  if (gameState.chess.isCheck()) {
    const turn = gameState.chess.turn();
    const board = gameState.chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank]?.[file];
        if (piece?.type === 'k' && piece.color === turn) {
          const square = `${'abcdefgh'[file]}${8 - rank}`;
          customSquareStyles[square] = {
            ...customSquareStyles[square],
            background: 'radial-gradient(circle, rgba(255,0,0,.6) 0%, rgba(255,0,0,.3) 70%, transparent 100%)'
          };
        }
      }
    }
  }

  // Color palette for superposition pieces - each piece gets unique color
  // Colors are distinct and easy to tell apart
  const SUPERPOSITION_COLORS = [
    { r: 0, g: 150, b: 255 },    // Blue
    { r: 180, g: 0, b: 255 },    // Purple
    { r: 0, g: 200, b: 100 },    // Green
    { r: 255, g: 140, b: 0 },    // Orange
    { r: 255, g: 50, b: 100 },   // Pink/Red
    { r: 0, g: 220, b: 220 },    // Cyan
    { r: 255, g: 200, b: 0 },    // Gold
    { r: 100, g: 100, b: 255 },  // Indigo
    { r: 255, g: 100, b: 255 },  // Magenta
    { r: 100, g: 255, b: 100 },  // Lime
  ];

  // Hash function for stable color assignment based on pieceId
  const hashPieceId = (pieceId: string): number => {
    let hash = 0;
    for (let i = 0; i < pieceId.length; i++) {
      const char = pieceId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  // Get stable color for each piece based on its ID (won't change when new pieces added)
  const getColorForPiece = (pieceId: string) => {
    const hash = hashPieceId(pieceId);
    return SUPERPOSITION_COLORS[hash % SUPERPOSITION_COLORS.length]!;
  };

  // Build color map for rendering
  const pieceColorMap = new Map<string, typeof SUPERPOSITION_COLORS[0]>();
  superpositionPieces.forEach(sp => {
    if (!pieceColorMap.has(sp.pieceId)) {
      pieceColorMap.set(sp.pieceId, getColorForPiece(sp.pieceId));
    }
  });

  // Highlight superposition pieces with quantum glow
  superpositionPieces.forEach(sp => {
    const color = pieceColorMap.get(sp.pieceId) || SUPERPOSITION_COLORS[0]!;

    customSquareStyles[sp.square] = {
      ...customSquareStyles[sp.square],
      boxShadow: `inset 0 0 20px rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0.6, sp.probability)})`,
      border: `3px solid rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`
    };
  });

  // Highlight split mode selections
  if (splitMode) {
    const splitSource = splitFrom ?? moveFrom;
    const splitActions = getLegalActions(gameState).filter(
      action => action.type === 'split' && action.from === splitSource
    );
    const splitTargets = new Set<string>();

    splitActions.forEach(action => {
      if (action.type === 'split') {
        if (!splitTo1 || action.to === splitTo1 || action.to2 === splitTo1) {
          splitTargets.add(action.to);
          if (action.to2) splitTargets.add(action.to2);
        }
      }
    });

    splitTargets.delete(splitSource ?? '');
    if (splitTo1) splitTargets.delete(splitTo1);

    splitTargets.forEach(square => {
      customSquareStyles[square] = {
        ...customSquareStyles[square],
        background: 'rgba(255, 215, 0, 0.45)',
        boxShadow: 'inset 0 0 0 3px rgba(255, 193, 7, 0.8)'
      };
    });

    if (splitFrom) {
      customSquareStyles[splitFrom] = {
        ...customSquareStyles[splitFrom],
        background: 'rgba(255, 235, 59, 0.7)',
        boxShadow: 'inset 0 0 0 3px rgba(255, 193, 7, 0.95)'
      };
    }
    if (splitTo1) {
      customSquareStyles[splitTo1] = {
        ...customSquareStyles[splitTo1],
        background: 'rgba(255, 193, 7, 0.8)',
        boxShadow: 'inset 0 0 0 4px rgba(255, 160, 0, 0.95)'
      };
    }
  }

  if (captureSquare) {
    customSquareStyles[captureSquare] = {
      ...customSquareStyles[captureSquare],
      animation: 'capture-flash 1s ease-out'
    };
  }

  if (highlightedMove) {
    const highlightedSquares = [highlightedMove.from, highlightedMove.to];
    if (highlightedMove.to2) {
      highlightedSquares.push(highlightedMove.to2);
    }

    highlightedSquares.forEach(square => {
      customSquareStyles[square] = {
        ...customSquareStyles[square],
        background: 'rgba(255, 215, 0, 0.65)',
        boxShadow: 'inset 0 0 0 4px rgba(255, 193, 7, 0.95)'
      };
    });
  }

  return (
    <div className="chessboard-wrapper">
      <ReactChessboard
        options={{
          position: quantumPosition,  // Use quantum position, not chess.js FEN!
          onPieceDrop: handlePieceDrop,
          onSquareClick: handleSquareClick,
          boardOrientation,
          squareStyles: customSquareStyles,
          animationDurationInMs: 200,
          allowDragging: isMyTurn && !splitMode,
          boardStyle: {
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            width: `${boardSize}px`,
            height: `${boardSize}px`
          },
          darkSquareStyle: { backgroundColor: '#779556' },
          lightSquareStyle: { backgroundColor: '#ebecd0' }
        }}
      />

      {/* Probability badges for superposition pieces */}
      {superpositionPieces.map((sp, idx) => {
        const color = pieceColorMap.get(sp.pieceId) || SUPERPOSITION_COLORS[0]!;
        // Create a gradient from the piece's assigned color
        const badgeColor = `linear-gradient(135deg, rgb(${color.r}, ${color.g}, ${color.b}) 0%, rgb(${Math.floor(color.r * 0.7)}, ${Math.floor(color.g * 0.7)}, ${Math.floor(color.b * 0.7)}) 100%)`;

        return (
          <div
            key={`${sp.pieceId}-${sp.square}-${idx}`}
            className="probability-badge"
            style={{
              position: 'absolute',
              background: badgeColor,
              ...getSquarePosition(sp.square, boardOrientation, boardSize)
            }}
          >
            {Math.round(sp.probability * 100)}%
          </div>
        );
      })}

      {/* Split mode indicator */}
      {splitMode && (
        <div className="split-mode-indicator">
          ⚛️ SPLIT MODE
          {splitFrom && <span> | From: {splitFrom}</span>}
          {splitTo1 && <span> | To1: {splitTo1}</span>}
          {splitFrom && splitTo1 && <span> | Click 2nd target</span>}
          {splitFrom && !splitTo1 && <span> | Click 1st target</span>}
          {!splitFrom && <span> | Click piece to split</span>}
        </div>
      )}

      {/* Game status overlay */}
      {gameState.gameStatus !== 'active' && (
        <div className="game-over-overlay">
          <div className="game-over-text">
            {gameState.gameStatus === 'white_wins' && '👑 White Wins!'}
            {gameState.gameStatus === 'black_wins' && '👑 Black Wins!'}
            {gameState.gameStatus.startsWith('draw') && '🤝 Draw'}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to calculate badge position based on square
function getSquarePosition(square: string, orientation: 'white' | 'black', boardSize: number): { top: string; left: string } {
  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(square[1]!) - 1;   // 1=0, 8=7

  const squareSize = boardSize / 8;

  let x = file * squareSize;
  let y = (7 - rank) * squareSize;

  if (orientation === 'black') {
    x = (7 - file) * squareSize;
    y = rank * squareSize;
  }

  return {
    top: `${y + 2}px`,
    left: `${x + squareSize - 28}px`
  };
}
