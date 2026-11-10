/**
 * MoveNotation - Displays chess moves in standard algebraic notation
 * Like chess.com/lichess notation panel with navigation
 */

import { useEffect, useRef } from 'react';
import type { QuantumGameState, MoveRecord } from '../../engine/ChessEngine';
import './MoveNotation.css';

interface MoveNotationProps {
  gameState: QuantumGameState;
  viewingMoveIndex: number | null; // null = live view, number = viewing specific move
  onNavigate?: (moveIndex: number | null) => void;
  isGameOver?: boolean;
}

function formatMoveNotation(move: MoveRecord, _moveIndex: number): { notation: string; isQuantum: boolean } {
  // Format piece symbol (uppercase for pieces, empty for pawns)
  // Piece ID format: wK0 (white King), bN1 (black Knight), wP2 (white Pawn), etc.
  const pieceChar = move.piece.charAt(1).toUpperCase();
  const pieceSymbol = pieceChar === 'P' ? '' : pieceChar; // K for King, N for Knight, etc.

  const from = move.from;
  const to = move.to;

  // Handle different move types
  if (move.type === 'split' && move.to2) {
    // Quantum split move: Nf3⟨g5⟩ (superposition)
    return {
      notation: `${pieceSymbol}${from}⟨${to}|${move.to2}⟩`,
      isQuantum: true
    };
  }

  if (move.type === 'quantum_capture' && move.collapseResult) {
    // Quantum capture with collapse result
    const symbol = move.collapseResult.wasCapture ? '×' : '⊘';
    const prob = Math.round(move.collapseResult.probability * 100);
    return {
      notation: `${pieceSymbol}${from}${symbol}${to}[${prob}%]`,
      isQuantum: true
    };
  }

  if (move.type === 'capture' || move.captured) {
    // Regular capture: Bxe5
    return {
      notation: `${pieceSymbol}${from}×${to}`,
      isQuantum: false
    };
  }

  // Check for castling
  if (move.piece.includes('K')) {
    if (from === 'e1' && to === 'g1') return { notation: 'O-O', isQuantum: false };
    if (from === 'e1' && to === 'c1') return { notation: 'O-O-O', isQuantum: false };
    if (from === 'e8' && to === 'g8') return { notation: 'O-O', isQuantum: false };
    if (from === 'e8' && to === 'c8') return { notation: 'O-O-O', isQuantum: false };
  }

  // Regular move: Nf3, e4
  let notation = `${pieceSymbol}${to}`;
  if (move.promotion) {
    notation += `=${move.promotion.charAt(0).toUpperCase()}`;
  }

  return { notation, isQuantum: false };
}

export function MoveNotation({
  gameState,
  viewingMoveIndex,
  onNavigate,
  isGameOver: _isGameOver = false
}: MoveNotationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const moves = gameState.moveHistory;
  const totalMoves = moves.length;

  // Auto-scroll to bottom when new moves are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [totalMoves]);

  // Navigation state
  const isViewingHistory = viewingMoveIndex !== null;
  const currentViewIndex = viewingMoveIndex ?? totalMoves - 1;

  // Group moves into pairs (white, black)
  const movePairs: Array<{
    number: number;
    whiteIndex: number;
    blackIndex: number;
    white?: { notation: string; isQuantum: boolean };
    black?: { notation: string; isQuantum: boolean };
  }> = [];

  for (let i = 0; i < moves.length; i += 2) {
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];

    movePairs.push({
      number: Math.floor(i / 2) + 1,
      whiteIndex: i,
      blackIndex: i + 1,
      white: whiteMove ? formatMoveNotation(whiteMove, i) : undefined,
      black: blackMove ? formatMoveNotation(blackMove, i + 1) : undefined
    });
  }

  return (
    <aside className="move-notation" aria-label="Move history">
      <div className="notation-header">
        <span className="notation-title" id="moves-title">📜 Moves</span>
        <span className="move-total" aria-live="polite">
          {isViewingHistory ? `${currentViewIndex + 1}/${totalMoves}` : `${totalMoves} moves`}
        </span>
      </div>

      <div
        className={`notation-body ${movePairs.length > 0 ? 'has-moves' : ''}`}
        ref={scrollRef}
        role="log"
        aria-labelledby="moves-title"
        aria-live="polite"
        aria-atomic="false"
      >
        {movePairs.length === 0 ? (
          <div className="notation-empty" role="status">Game not started</div>
        ) : (
          <div role="list" aria-label="List of moves">
            {movePairs.map((pair) => (
              <div key={pair.number} className="notation-row" role="listitem">
                <span className="move-num" aria-hidden="true">{pair.number}.</span>
                <span
                  className={`white-move ${pair.white?.isQuantum ? 'quantum' : ''} ${viewingMoveIndex === pair.whiteIndex ? 'viewing' : ''}`}
                  onClick={() => pair.white && onNavigate?.(pair.whiteIndex)}
                  aria-label={`Move ${pair.number} white: ${pair.white?.notation || 'pending'}${pair.white?.isQuantum ? ' (quantum)' : ''}`}
                >
                  {pair.white?.notation || '...'}
                </span>
                <span
                  className={`black-move ${pair.black?.isQuantum ? 'quantum' : ''} ${viewingMoveIndex === pair.blackIndex ? 'viewing' : ''}`}
                  onClick={() => pair.black && onNavigate?.(pair.blackIndex)}
                  aria-label={pair.black ? `Move ${pair.number} black: ${pair.black.notation}${pair.black.isQuantum ? ' (quantum)' : ''}` : ''}
                >
                  {pair.black?.notation || ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </aside>
  );
}
