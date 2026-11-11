/**
 * ChessEngine - Wraps chess.js for proper chess rules
 * with QUANTUM MECHANICS layer on top
 *
 * Quantum Features:
 * - Split moves: A piece can split into superposition at two squares
 * - Probability tracking: Each piece position has a probability
 * - Collapse: When capturing/measuring, superposition collapses
 * - Merge: Two positions of same piece can merge back
 */

import { Chess } from 'chess.js';
import type { Square, Move as ChessMove, PieceSymbol } from 'chess.js';

export type Player = 'white' | 'black';
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface Position {
  file: number; // 0-7 (a-h)
  rank: number; // 0-7 (1-8)
}

export interface QuantumPosition {
  position: Position;
  probability: number;
}

export interface QuantumPiece {
  id: string;
  type: PieceType;
  owner: Player;
  positions: QuantumPosition[]; // Multiple positions = superposition!
  isInSuperposition: boolean;
}

export interface QuantumGameState {
  pieces: Map<string, QuantumPiece>;
  currentPlayer: Player;
  turnNumber: number;
  gameStatus: GameStatus;
  moveHistory: MoveRecord[];
  quantumMode: boolean; // Toggle quantum mechanics on/off
  maxSuperpositions: number; // Max pieces per player in superposition (1-5)
  lastCollapseResult?: CollapseResult; // For animation
  chess: Chess;
  // Game result for resign/draw
  result?: 'white_wins' | 'black_wins' | 'draw';
  resultReason?: 'checkmate' | 'stalemate' | 'resignation' | 'timeout' | 'agreement' | 'repetition' | 'insufficient_material' | '50_move';
}

export type GameStatus =
  | 'active'
  | 'white_wins'
  | 'black_wins'
  | 'draw_stalemate'
  | 'draw_50_move'
  | 'draw_agreement'
  | 'draw_repetition'
  | 'draw_insufficient';

export interface MoveRecord {
  from: string;
  to: string;
  to2?: string; // For split moves
  piece: string;
  type: 'classical' | 'split' | 'merge' | 'capture' | 'quantum_capture';
  captured?: string;
  promotion?: PieceType;
  collapseResult?: CollapseResult;
}

export interface CollapseResult {
  pieceId: string;
  collapsedTo: Square;
  probability: number;
  wasCapture: boolean;
}

export interface QuantumMove {
  type: 'classical' | 'split';
  from: Square;
  to: Square;
  to2?: Square; // For split moves
  promotion?: PieceSymbol;
}

// Seeded random for deterministic collapse (for P2P sync)
let rngSeed = Date.now();
export function setRngSeed(seed: number) { rngSeed = seed; }
function seededRandom(): number {
  rngSeed = (rngSeed * 1103515245 + 12345) & 0x7fffffff;
  return rngSeed / 0x7fffffff;
}

// Convert position to chess.js square notation
export function posToSquare(pos: Position): Square {
  const files = 'abcdefgh';
  return `${files[pos.file]}${pos.rank + 1}` as Square;
}

// Convert chess.js square to position
export function squareToPos(square: Square): Position {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1]) - 1;
  return { file, rank };
}

// Map chess.js piece to our type
function chessPieceToType(piece: PieceSymbol): PieceType {
  const map: Record<PieceSymbol, PieceType> = {
    'k': 'king', 'q': 'queen', 'r': 'rook',
    'b': 'bishop', 'n': 'knight', 'p': 'pawn'
  };
  return map[piece];
}

/**
 * Create initial game state
 */
export function createGame(quantumMode: boolean = true, maxSuperpositions: number = 2): QuantumGameState {
  const chess = new Chess();
  const pieces = new Map<string, QuantumPiece>();

  // Extract pieces from chess.js board
  const board = chess.board();
  const pieceCount: Record<string, number> = {};

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[7 - rank]?.[file];
      if (square) {
        const owner: Player = square.color === 'w' ? 'white' : 'black';
        const type = chessPieceToType(square.type);
        const prefix = owner === 'white' ? 'w' : 'b';
        // Use 'N' for knight (standard chess notation), first letter uppercase for others
        const pieceChar = type === 'knight' ? 'N' : type[0].toUpperCase();
        const key = `${prefix}${pieceChar}`;
        pieceCount[key] = (pieceCount[key] || 0);
        const id = `${key}${pieceCount[key]++}`;

        pieces.set(id, {
          id,
          type,
          owner,
          positions: [{ position: { file, rank }, probability: 1.0 }],
          isInSuperposition: false
        });
      }
    }
  }

  return {
    pieces,
    currentPlayer: 'white',
    turnNumber: 1,
    gameStatus: 'active',
    moveHistory: [],
    quantumMode,
    maxSuperpositions,
    chess
  };
}

/**
 * Find piece at a given square
 */
export function findPieceAtSquare(state: QuantumGameState, square: Square): QuantumPiece | null {
  return getPiecesAtSquare(state, square)[0] ?? null;
}

function getPiecesAtSquare(state: QuantumGameState, square: Square): QuantumPiece[] {
  const pos = squareToPos(square);
  return [...state.pieces.values()].filter(piece =>
    piece.positions.some(qPos =>
      qPos.position.file === pos.file && qPos.position.rank === pos.rank && qPos.probability > 0
    )
  );
}

/**
 * Get superposition pieces for display
 */
export function getSuperpositionPieces(state: QuantumGameState): Array<{
  square: Square;
  pieceType: string;
  probability: number;
  pieceId: string;
}> {
  const result: Array<{ square: Square; pieceType: string; probability: number; pieceId: string }> = [];

  for (const [, piece] of state.pieces) {
    if (piece.isInSuperposition) {
      for (const qPos of piece.positions) {
        if (qPos.probability > 0.01) {
          const square = posToSquare(qPos.position);
          const color = piece.owner === 'white' ? 'w' : 'b';
          const typeChar = piece.type === 'knight' ? 'N' : piece.type[0].toUpperCase();
          result.push({
            square,
            pieceType: `${color}${typeChar}`,
            probability: qPos.probability,
            pieceId: piece.id
          });
        }
      }
    }
  }

  return result;
}

/**
 * Get all legal moves for current player
 */
export function getLegalMoves(state: QuantumGameState): ChessMove[] {
  return state.chess.moves({ verbose: true });
}

/**
 * Get actions that the engine's move executors can apply for the current player.
 */
export function getLegalActions(state: QuantumGameState): QuantumMove[] {
  const legalMoves = getLegalMoves(state);
  const knownMoves = new Set(
    legalMoves.map(move => `${move.from}:${move.to}:${move.promotion ?? ''}`)
  );
  for (const piece of state.pieces.values()) {
    if (piece.owner !== state.currentPlayer || !piece.isInSuperposition) continue;
    for (const position of piece.positions) {
      const from = posToSquare(position.position);
      if (state.chess.get(from)) continue;
      for (const move of getLegalMovesFromSquare(state, from)) {
        const key = `${move.from}:${move.to}:${move.promotion ?? ''}`;
        if (!knownMoves.has(key)) {
          legalMoves.push(move);
          knownMoves.add(key);
        }
      }
    }
  }

  const actions: QuantumMove[] = legalMoves
    .filter(move => makeMove(state, move.from, move.to, move.promotion, 0).success)
    .map(move => ({
      type: 'classical',
      from: move.from,
      to: move.to,
      promotion: move.promotion
    }));

  if (!state.quantumMode) return actions;

  const superpositionCount = [...state.pieces.values()].filter(
    piece => piece.owner === state.currentPlayer && piece.isInSuperposition
  ).length;
  if (superpositionCount >= state.maxSuperpositions) return actions;

  const targetsBySource = new Map<Square, Set<Square>>();
  for (const move of legalMoves) {
    const targets = targetsBySource.get(move.from) ?? new Set<Square>();
    targets.add(move.to);
    targetsBySource.set(move.from, targets);
  }

  for (const [from, targetSet] of targetsBySource) {
    const piece = findPieceAtSquare(state, from);
    if (!piece || piece.owner !== state.currentPlayer ||
      piece.type === 'king' || piece.type === 'pawn' || piece.isInSuperposition) {
      continue;
    }

    const targets = [...targetSet].filter(target => getPiecesAtSquare(state, target).length === 0);
    for (let first = 0; first < targets.length; first++) {
      for (let second = first + 1; second < targets.length; second++) {
        const to = targets[first];
        const to2 = targets[second];
        if (to && to2 && makeSplitMove(state, from, to, to2).success) {
          actions.push({ type: 'split', from, to, to2 });
        }
      }
    }
  }

  return actions;
}

/**
 * Get legal moves for a piece at a specific square, including alternate
 * superposition branches and pawn captures against an untracked branch.
 */
export function getLegalMovesFromSquare(state: QuantumGameState, square: Square): ChessMove[] {
  const piece = findPieceAtSquare(state, square);
  const tempChess = new Chess(state.chess.fen());
  if (!tempChess.get(square) && piece?.isInSuperposition) {
    // Find where chess.js currently has this piece
    let chessSquare: Square | null = null;
    for (const qPos of piece.positions) {
      const sq = posToSquare(qPos.position);
      const pieceAtSq = tempChess.get(sq);
      if (pieceAtSq &&
        pieceAtSq.color === (piece.owner === 'white' ? 'w' : 'b') &&
        chessPieceToType(pieceAtSq.type) === piece.type) {
        chessSquare = sq;
        break;
      }
    }

    if (chessSquare && chessSquare !== square) {
      const pieceColor = piece.owner === 'white' ? 'w' : 'b';
      const pieceTypeChar = (piece.type === 'knight' ? 'n' : piece.type[0]) as PieceSymbol;
      tempChess.remove(chessSquare);
      if (!tempChess.put({ type: pieceTypeChar, color: pieceColor }, square)) return [];
    }
  }

  if (!tempChess.get(square)) return [];

  // chess.js tracks only one branch of a split piece. Let pawns capture an
  // opponent's other branch by temporarily representing it as an occupied target.
  if (state.quantumMode && piece?.type === 'pawn') {
    const from = squareToPos(square);
    const captureRank = from.rank + (piece.owner === 'white' ? 1 : -1);
    for (const file of [from.file - 1, from.file + 1]) {
      if (file < 0 || file > 7 || captureRank < 0 || captureRank > 7) continue;
      const target = posToSquare({ file, rank: captureRank });
      if (tempChess.get(target)) continue;

      const enemy = [...state.pieces.values()].find(candidate =>
        candidate.owner !== piece.owner &&
        candidate.isInSuperposition &&
        candidate.positions.some(position =>
          position.position.file === file && position.position.rank === captureRank
        )
      );
      if (!enemy) continue;

      const color = enemy.owner === 'white' ? 'w' : 'b';
      const type = (enemy.type === 'knight' ? 'n' : enemy.type[0]) as PieceSymbol;
      tempChess.put({ type, color }, target);
    }
  }

  return tempChess.moves({ square, verbose: true });
}

/**
 * Check if a move is legal
 */
export function isLegalMove(state: QuantumGameState, from: Square, to: Square): boolean {
  const moves = state.chess.moves({ square: from, verbose: true });
  return moves.some(m => m.to === to);
}

/**
 * Make a classical move (handles quantum captures with collapse)
 */
export function makeMove(
  state: QuantumGameState,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
  collapseSeed?: number
): { success: boolean; newState: QuantumGameState; error?: string; collapseResult?: CollapseResult } {
  try {
    // Check if moving piece is in superposition at a different position than chess.js knows
    const movingPiece = findPieceAtSquare(state, from);
    const fromPos = squareToPos(from);
    const hasFriendlyTarget = getPiecesAtSquare(state, to).some(piece =>
      piece.owner === state.currentPlayer && piece.id !== movingPiece?.id
    );
    if (hasFriendlyTarget) {
      return { success: false, newState: state, error: 'Cannot move onto a friendly piece' };
    }

    // Clone the chess state
    const newChess = new Chess(state.chess.fen());

    // If the piece is in superposition, chess.js might not know about this position
    // We need to check if chess.js has a piece at 'from', and if not, temporarily add one
    const chessHasPieceAtFrom = newChess.get(from) !== null;

    if (!chessHasPieceAtFrom && movingPiece && movingPiece.isInSuperposition) {
      // The piece is at a quantum position that chess.js doesn't know about
      // We need to validate this move by temporarily placing the piece there

      // Find where chess.js thinks this piece is (the first split position)
      const chessPosition = movingPiece.positions.find(p => {
        const sq = posToSquare(p.position);
        const pieceAtSq = newChess.get(sq);
        if (!pieceAtSq) return false;
        return pieceAtSq.color === (movingPiece.owner === 'white' ? 'w' : 'b') &&
          chessPieceToType(pieceAtSq.type) === movingPiece.type;
      });

      if (chessPosition) {
        // Rebuild the board with the piece moved to the clicked 'from' square,
        // since chess.js only tracks one branch of a superposition.
        const pieceColor = movingPiece.owner === 'white' ? 'w' : 'b';
        const pieceTypeChar = movingPiece.type === 'knight' ? 'n' : movingPiece.type[0];

        // Remove piece from original position and place at 'from'
        const chessSquare = posToSquare(chessPosition.position);
        newChess.remove(chessSquare);
        newChess.put({ type: pieceTypeChar as PieceSymbol, color: pieceColor }, from);
      }
    }

    // A pawn's diagonal capture of an untracked superposition branch must be
    // represented on the temporary chess.js board for its legal move check.
    const toPos = squareToPos(to);
    const quantumCapture = state.quantumMode && [...state.pieces.values()].find(piece =>
      piece.owner !== state.currentPlayer &&
      piece.isInSuperposition &&
      piece.positions.some(position =>
        position.position.file === toPos.file && position.position.rank === toPos.rank
      )
    );
    if (!newChess.get(to) && quantumCapture) {
      const color = quantumCapture.owner === 'white' ? 'w' : 'b';
      const type = (quantumCapture.type === 'knight' ? 'n' : quantumCapture.type[0]) as PieceSymbol;
      newChess.put({ type, color }, to);
    }

    const move = newChess.move({ from, to, promotion });

    if (!move) {
      return { success: false, newState: state, error: 'Invalid move' };
    }

    // Update quantum pieces
    const newPieces = new Map(state.pieces);

    // Find the piece that moved (fromPos already calculated above)
    let collapseResult: CollapseResult | undefined;

    let movedPiece: QuantumPiece | undefined;
    for (const [, piece] of newPieces) {
      const atFrom = piece.positions.find(
        p => p.position.file === fromPos.file && p.position.rank === fromPos.rank
      );
      if (atFrom && piece.owner === state.currentPlayer) {
        movedPiece = {
          ...piece,
          positions: [...piece.positions],
          isInSuperposition: false // Moving collapses the piece if it was in superposition
        };
        break;
      }
    }

    if (movedPiece) {
      // If piece was in superposition, it collapses to the moved position
      movedPiece.positions = [{ position: toPos, probability: 1.0 }];
      movedPiece.isInSuperposition = false;

      // Handle promotion
      if (move.promotion) {
        movedPiece.type = chessPieceToType(move.promotion);
      }

      newPieces.set(movedPiece.id, movedPiece);

      // Handle castling - also move the rook!
      // chess.js flags: 'k' = kingside castle, 'q' = queenside castle
      if (move.flags.includes('k') || move.flags.includes('q')) {
        const isKingside = move.flags.includes('k');
        const rank = state.currentPlayer === 'white' ? 0 : 7;

        // Find the rook that needs to move
        const rookFromFile = isKingside ? 7 : 0;  // h-file or a-file
        const rookToFile = isKingside ? 5 : 3;    // f-file or d-file

        for (const [id, piece] of newPieces) {
          if (piece.type === 'rook' && piece.owner === state.currentPlayer) {
            const rookPos = piece.positions.find(
              p => p.position.file === rookFromFile && p.position.rank === rank
            );
            if (rookPos) {
              const updatedRook: QuantumPiece = {
                ...piece,
                positions: [{ position: { file: rookToFile, rank }, probability: 1.0 }],
                isInSuperposition: false
              };
              newPieces.set(id, updatedRook);
              break;
            }
          }
        }
      }

      // Handle capture - with quantum collapse!
      // We check BOTH:
      // 1. Chess.js capture (move.captured) - for pieces chess.js knows about
      // 2. Quantum superposition pieces at target - chess.js might not know about these!

      // For en passant, the captured pawn is NOT at toPos - it's on the same rank as fromPos
      const isEnPassant = move.flags.includes('e');
      let capturedPos = toPos;
      if (isEnPassant) {
        capturedPos = { file: toPos.file, rank: fromPos.rank };
      }

      // Check for any enemy piece at the target position (quantum or classical)
      for (const [id, piece] of newPieces) {
        // Skip the piece that just moved (the attacker)
        if (id === movedPiece.id) continue;

        if (piece.owner !== state.currentPlayer) {
          const atCapturePos = piece.positions.find(
            p => p.position.file === capturedPos.file && p.position.rank === capturedPos.rank
          );
          if (atCapturePos) {
            // If captured piece is in superposition, COLLAPSE it first!
            if (piece.isInSuperposition && state.quantumMode) {
              if (collapseSeed !== undefined) setRngSeed(collapseSeed);
              const roll = seededRandom();

              const pieceColor = piece.owner === 'white' ? 'w' : 'b';
              const pieceTypeChar = piece.type === 'knight' ? 'n' : piece.type[0];

              // CRITICAL: First, remove the piece from ALL its chess.js positions
              // Chess.js only knows about ONE position (the first split target),
              // but we need to ensure consistency
              for (const pos of piece.positions) {
                const sq = posToSquare(pos.position);
                const pieceAtSq = newChess.get(sq);
                if (pieceAtSq && pieceAtSq.color === pieceColor &&
                  (pieceAtSq.type === pieceTypeChar ||
                    (piece.type === 'knight' && pieceAtSq.type === 'n'))) {
                  newChess.remove(sq);
                }
              }

              // Check if capture succeeds based on probability at that square
              if (roll < atCapturePos.probability) {
                // Capture succeeds - piece was "really" there, it's already removed
                newPieces.delete(id);
                collapseResult = {
                  pieceId: id,
                  collapsedTo: posToSquare(capturedPos),
                  probability: atCapturePos.probability,
                  wasCapture: true
                };
              } else {
                // Capture "fails" - piece wasn't there! It collapses to other position
                const otherPositions = piece.positions.filter(
                  p => p.position.file !== capturedPos.file || p.position.rank !== capturedPos.rank
                );
                if (otherPositions.length > 0) {
                  const collapsed = otherPositions[0]!;
                  const collapsedPiece: QuantumPiece = {
                    ...piece,
                    positions: [{ position: collapsed.position, probability: 1.0 }],
                    isInSuperposition: false
                  };
                  newPieces.set(id, collapsedPiece);

                  // Put the escaped piece at its collapse position
                  const escapeSquare = posToSquare(collapsed.position);
                  newChess.put({ type: pieceTypeChar as PieceSymbol, color: pieceColor }, escapeSquare);

                  collapseResult = {
                    pieceId: id,
                    collapsedTo: escapeSquare,
                    probability: collapsed.probability,
                    wasCapture: false
                  };
                }
              }
            } else {
              // Classical piece capture - delete if chess.js captured OR if our piece moved to this square
              // (handles case where chess.js didn't know about the enemy piece)
              newPieces.delete(id);

              // Also remove from chess.js if it's still there
              const captureSquare = posToSquare(capturedPos);
              const pieceStillThere = newChess.get(captureSquare);
              if (pieceStillThere && pieceStillThere.color !== (state.currentPlayer === 'white' ? 'w' : 'b')) {
                newChess.remove(captureSquare);
              }
            }
            break;
          }
        }
      }
    }

    // Determine game status
    let gameStatus: GameStatus = 'active';
    if (newChess.isCheckmate()) {
      gameStatus = state.currentPlayer === 'white' ? 'white_wins' : 'black_wins';
    } else if (newChess.isStalemate()) {
      gameStatus = 'draw_stalemate';
    } else if (newChess.isDraw()) {
      if (newChess.isThreefoldRepetition()) gameStatus = 'draw_repetition';
      else if (newChess.isInsufficientMaterial()) gameStatus = 'draw_insufficient';
      else gameStatus = 'draw_50_move';
    }

    const newState: QuantumGameState = {
      pieces: newPieces,
      currentPlayer: state.currentPlayer === 'white' ? 'black' : 'white',
      turnNumber: state.turnNumber + 1,
      gameStatus,
      moveHistory: [...state.moveHistory, {
        from, to,
        piece: movedPiece?.id || 'unknown',
        type: collapseResult ? 'quantum_capture' : (move.captured ? 'capture' : 'classical'),
        captured: move.captured ? 'captured' : undefined,
        promotion: move.promotion ? chessPieceToType(move.promotion) : undefined,
        collapseResult
      }],
      quantumMode: state.quantumMode,
      maxSuperpositions: state.maxSuperpositions,
      lastCollapseResult: collapseResult,
      chess: newChess
    };

    return { success: true, newState, collapseResult };
  } catch (error) {
    return {
      success: false,
      newState: state,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Make a SPLIT MOVE - piece enters quantum superposition at two squares
 * Both target squares must be valid moves from the source
 */
export function makeSplitMove(
  state: QuantumGameState,
  from: Square,
  to1: Square,
  to2: Square
): { success: boolean; newState: QuantumGameState; error?: string } {
  if (!state.quantumMode) {
    return { success: false, newState: state, error: 'Quantum mode is disabled' };
  }

  // Both targets must be legal moves
  const moves = state.chess.moves({ square: from, verbose: true });
  const move1Valid = moves.some(m => m.to === to1);
  const move2Valid = moves.some(m => m.to === to2);

  if (!move1Valid || !move2Valid) {
    return { success: false, newState: state, error: 'Invalid split move targets' };
  }

  if (to1 === to2) {
    return { success: false, newState: state, error: 'Split targets must be different' };
  }

  // Split moves cannot land on occupied squares.
  if (getPiecesAtSquare(state, to1).length > 0 || getPiecesAtSquare(state, to2).length > 0) {
    return { success: false, newState: state, error: 'Cannot split to an occupied square' };
  }

  // Find the piece
  const piece = findPieceAtSquare(state, from);
  if (!piece || piece.owner !== state.currentPlayer) {
    return { success: false, newState: state, error: 'No valid piece at source' };
  }

  // Kings cannot split (would break check detection)
  if (piece.type === 'king') {
    return { success: false, newState: state, error: 'Kings cannot enter superposition' };
  }

  // Pawns cannot split (keeps the game simpler)
  if (piece.type === 'pawn') {
    return { success: false, newState: state, error: 'Pawns cannot enter superposition' };
  }

  // Pieces already in superposition cannot split again
  if (piece.isInSuperposition) {
    return { success: false, newState: state, error: 'Piece is already in superposition' };
  }

  // Limit: Max N pieces per player in superposition (configurable)
  const maxSuperpositions = state.maxSuperpositions ?? 2;
  let superpositionCount = 0;
  for (const [, p] of state.pieces) {
    if (p.owner === state.currentPlayer && p.isInSuperposition) {
      superpositionCount++;
    }
  }
  if (superpositionCount >= maxSuperpositions) {
    return {
      success: false,
      newState: state,
      error: `Max ${maxSuperpositions} pieces in superposition allowed`
    };
  }

  // Clone state
  const newPieces = new Map(state.pieces);
  const newPiece: QuantumPiece = {
    ...piece,
    positions: [
      { position: squareToPos(to1), probability: 0.5 },
      { position: squareToPos(to2), probability: 0.5 }
    ],
    isInSuperposition: true
  };
  newPieces.set(piece.id, newPiece);

  // For chess.js, we move to the first position (main branch)
  const newChess = new Chess(state.chess.fen());
  newChess.move({ from, to: to1 });

  // Check game status after split move (checkmate, stalemate, etc.)
  let gameStatus: GameStatus = 'active';
  if (newChess.isCheckmate()) {
    gameStatus = state.currentPlayer === 'white' ? 'white_wins' : 'black_wins';
  } else if (newChess.isStalemate()) {
    gameStatus = 'draw_stalemate';
  } else if (newChess.isDraw()) {
    if (newChess.isThreefoldRepetition()) gameStatus = 'draw_repetition';
    else if (newChess.isInsufficientMaterial()) gameStatus = 'draw_insufficient';
    else gameStatus = 'draw_50_move';
  }

  const newState: QuantumGameState = {
    pieces: newPieces,
    currentPlayer: state.currentPlayer === 'white' ? 'black' : 'white',
    turnNumber: state.turnNumber + 1,
    gameStatus,
    moveHistory: [...state.moveHistory, {
      from, to: to1, to2,
      piece: piece.id,
      type: 'split'
    }],
    quantumMode: state.quantumMode,
    maxSuperpositions: state.maxSuperpositions,
    chess: newChess
  };

  return { success: true, newState };
}

/**
 * Collapse a superposition - randomly choose one position based on probabilities
 */
export function collapsePiece(
  state: QuantumGameState,
  pieceId: string,
  seed?: number
): { newState: QuantumGameState; collapsedTo: Square; probability: number } | null {
  const piece = state.pieces.get(pieceId);
  if (!piece || !piece.isInSuperposition) return null;

  if (seed !== undefined) setRngSeed(seed);
  const roll = seededRandom();

  // Pick position based on cumulative probability
  let cumulative = 0;
  let chosenPos = piece.positions[0]!;
  for (const qPos of piece.positions) {
    cumulative += qPos.probability;
    if (roll < cumulative) {
      chosenPos = qPos;
      break;
    }
  }

  const newPieces = new Map(state.pieces);
  const newPiece: QuantumPiece = {
    ...piece,
    positions: [{ position: chosenPos.position, probability: 1.0 }],
    isInSuperposition: false
  };
  newPieces.set(pieceId, newPiece);

  // Update chess.js to reflect the collapsed position
  // This is tricky - we need to rebuild the board
  const collapsedSquare = posToSquare(chosenPos.position);

  return {
    newState: { ...state, pieces: newPieces },
    collapsedTo: collapsedSquare,
    probability: chosenPos.probability
  };
}

/**
 * Check game status
 */
export function isGameOver(state: QuantumGameState): boolean {
  return state.gameStatus !== 'active';
}

export function isInCheck(state: QuantumGameState): boolean {
  return state.chess.isCheck();
}

/**
 * Check if a piece is in superposition
 */
export function isPieceInSuperposition(state: QuantumGameState, square: Square): boolean {
  const piece = findPieceAtSquare(state, square);
  return piece?.isInSuperposition ?? false;
}

/**
 * Get probability of piece at square
 */
export function getProbabilityAtSquare(state: QuantumGameState, square: Square): number {
  const pos = squareToPos(square);
  for (const [, piece] of state.pieces) {
    for (const qPos of piece.positions) {
      if (qPos.position.file === pos.file && qPos.position.rank === pos.rank) {
        return qPos.probability;
      }
    }
  }
  return 0;
}

/**
 * Get board position for react-chessboard
 * Returns { [square]: { pieceType: "wK" } } format
 *
 * IMPORTANT: When multiple pieces are on the same square (e.g., a classical piece
 * and a superposition piece), we prioritize classical pieces over superposition pieces.
 * This ensures that when a classical piece moves to a square occupied by a quantum
 * superposition, the classical piece is visible and the superposition is "underneath".
 */
export function getBoardPosition(state: QuantumGameState): Record<string, { pieceType: string }> {
  const position: Record<string, { pieceType: string }> = {};
  // Track which squares have classical (non-superposition) pieces
  const classicalSquares = new Set<string>();

  // First pass: Place classical pieces (not in superposition)
  for (const [, piece] of state.pieces) {
    if (!piece.isInSuperposition) {
      for (const qPos of piece.positions) {
        if (qPos.probability > 0.01) {
          const square = posToSquare(qPos.position);
          const color = piece.owner === 'white' ? 'w' : 'b';
          const typeChar = piece.type === 'knight' ? 'N' : piece.type[0].toUpperCase();
          position[square] = { pieceType: `${color}${typeChar}` };
          classicalSquares.add(square);
        }
      }
    }
  }

  // Second pass: Place superposition pieces, but only on empty squares
  // (don't overwrite classical pieces)
  for (const [, piece] of state.pieces) {
    if (piece.isInSuperposition) {
      for (const qPos of piece.positions) {
        if (qPos.probability > 0.01) {
          const square = posToSquare(qPos.position);
          // Only place superposition piece if no classical piece is there
          if (!classicalSquares.has(square)) {
            const color = piece.owner === 'white' ? 'w' : 'b';
            const typeChar = piece.type === 'knight' ? 'N' : piece.type[0].toUpperCase();
            position[square] = { pieceType: `${color}${typeChar}` };
          }
        }
      }
    }
  }

  return position;
}

/**
 * Clone game state
 */
export function cloneState(state: QuantumGameState): QuantumGameState {
  return {
    pieces: new Map(Array.from(state.pieces.entries()).map(([k, v]) => [k, {
      ...v,
      positions: [...v.positions.map(p => ({ ...p, position: { ...p.position } }))]
    }])),
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    gameStatus: state.gameStatus,
    moveHistory: [...state.moveHistory],
    quantumMode: state.quantumMode,
    maxSuperpositions: state.maxSuperpositions,
    chess: new Chess(state.chess.fen())
  };
}

/**
 * Toggle quantum mode
 */
export function setQuantumMode(state: QuantumGameState, enabled: boolean): QuantumGameState {
  return { ...state, quantumMode: enabled };
}

/**
 * Generate Quantum FEN - a serialized representation of the game state
 * Format: STANDARD_FEN | TURN | QUANTUM_DATA
 * Quantum data: pieceId:sq1@prob1,sq2@prob2;pieceId2:...
 * Example: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w | 1 | wN1:f3@50,h3@50
 */
export function toQuantumFEN(state: QuantumGameState): string {
  const standardFen = state.chess.fen().split(' ').slice(0, 2).join(' ');

  // Build quantum data for superposition pieces
  const quantumParts: string[] = [];
  for (const [id, piece] of state.pieces) {
    if (piece.isInSuperposition) {
      const positions = piece.positions
        .map(p => `${posToSquare(p.position)}@${Math.round(p.probability * 100)}`)
        .join(',');
      quantumParts.push(`${id}:${positions}`);
    }
  }

  const quantumData = quantumParts.length > 0 ? quantumParts.join(';') : '-';

  return `${standardFen} | ${state.turnNumber} | ${quantumData}`;
}

/**
 * Get a human-readable game log
 */
export function getGameLog(state: QuantumGameState): string {
  const lines: string[] = [
    `=== Quantum Chess Game Log ===`,
    `Turn: ${state.turnNumber}`,
    `Current Player: ${state.currentPlayer}`,
    `Status: ${state.gameStatus}`,
    `Quantum Mode: ${state.quantumMode ? 'ON' : 'OFF'}`,
    ``,
    `QFEN: ${toQuantumFEN(state)}`,
    ``,
    `=== Move History ===`
  ];

  for (let i = 0; i < state.moveHistory.length; i++) {
    const move = state.moveHistory[i];
    let moveStr = `${i + 1}. ${move.piece} ${move.from}->${move.to}`;
    if (move.type === 'split' && move.to2) {
      moveStr = `${i + 1}. ${move.piece} SPLIT ${move.from}->${move.to}/${move.to2}`;
    } else if (move.type === 'quantum_capture' && move.collapseResult) {
      const cr = move.collapseResult;
      moveStr += ` [COLLAPSE: ${cr.pieceId} -> ${cr.collapsedTo} (${Math.round(cr.probability * 100)}%) ${cr.wasCapture ? '✓ Captured' : '✗ Escaped'}]`;
    } else if (move.captured) {
      moveStr += ` x${move.captured}`;
    }
    lines.push(moveStr);
  }

  // Superposition pieces
  lines.push('');
  lines.push('=== Superposition Pieces ===');
  for (const [id, piece] of state.pieces) {
    if (piece.isInSuperposition) {
      const positions = piece.positions
        .map(p => `${posToSquare(p.position)}(${Math.round(p.probability * 100)}%)`)
        .join(' + ');
      lines.push(`${id}: ${positions}`);
    }
  }

  return lines.join('\n');
}
