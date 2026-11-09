import type { QuantumGameState, Player } from '../../engine/ChessEngine';
import './GameEndScreen.css';

interface GameEndScreenProps {
  gameState: QuantumGameState;
  playerColor: Player;
  onOk: () => void;
  onRematch: () => void;
  onBackToLobby: () => void;
  rematchRequested: boolean;
}

export function GameEndScreen({
  gameState,
  playerColor,
  onOk,
  onRematch,
  onBackToLobby,
  rematchRequested
}: GameEndScreenProps) {
  const isWinner =
    (gameState.gameStatus === 'white_wins' && playerColor === 'white') ||
    (gameState.gameStatus === 'black_wins' && playerColor === 'black');

  const isDraw = gameState.gameStatus?.startsWith('draw');

  const getTitle = () => {
    if (isDraw) return '🤝 Draw!';
    if (isWinner) return '🎉 Victory!';
    return '😔 Defeat';
  };

  const getSubtitle = () => {
    // Check for resignation
    if (gameState.resultReason === 'resignation') {
      return gameState.gameStatus === 'white_wins'
        ? 'Black resigned'
        : 'White resigned';
    }
    // Check for timeout
    if (gameState.resultReason === 'timeout') {
      return gameState.gameStatus === 'white_wins'
        ? 'White wins on time!'
        : 'Black wins on time!';
    }
    switch (gameState.gameStatus) {
      case 'white_wins': return 'White wins by checkmate!';
      case 'black_wins': return 'Black wins by checkmate!';
      case 'draw_stalemate': return 'Game ended in stalemate';
      case 'draw_50_move': return 'Draw by 50-move rule';
      case 'draw_agreement': return 'Draw by agreement';
      case 'draw_repetition': return 'Draw by threefold repetition';
      case 'draw_insufficient': return 'Draw by insufficient material';
      default: return '';
    }
  };

  // Count pieces
  const piecesArray = Array.from(gameState.pieces.values());
  const whitePieces = piecesArray.filter(p => p.owner === 'white').length;
  const blackPieces = piecesArray.filter(p => p.owner === 'black').length;

  // Count quantum moves (split)
  const quantumMoves = gameState.moveHistory.filter(
    m => m.type === 'split'
  ).length;

  return (
    <div
      className="game-end-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-end-title"
      aria-describedby="game-end-subtitle"
    >
      <div className={`game-end-modal ${isWinner ? 'winner' : isDraw ? 'draw' : 'loser'}`}>
        <h1 id="game-end-title" className="end-title">{getTitle()}</h1>
        <p id="game-end-subtitle" className="end-subtitle">{getSubtitle()}</p>

        <div className="game-stats" aria-label="Game statistics">
          <h3>📊 Game Summary</h3>
          <div className="stat-grid" role="list">
            <div className="stat" role="listitem">
              <span className="stat-value" aria-label={`${gameState.turnNumber} turns`}>{gameState.turnNumber}</span>
              <span className="stat-label">Turns</span>
            </div>
            <div className="stat" role="listitem">
              <span className="stat-value" aria-label={`${gameState.moveHistory.length} moves`}>{gameState.moveHistory.length}</span>
              <span className="stat-label">Moves</span>
            </div>
            <div className="stat" role="listitem">
              <span className="stat-value" aria-label={`${quantumMoves} quantum splits`}>{quantumMoves}</span>
              <span className="stat-label">Quantum Splits</span>
            </div>
            <div className="stat" role="listitem">
              <span className="stat-value" aria-label={`White captured ${16 - whitePieces}, Black captured ${16 - blackPieces}`}>{16 - whitePieces}/{16 - blackPieces}</span>
              <span className="stat-label">Captured</span>
            </div>
          </div>
        </div>

        <div className="end-actions" role="group" aria-label="Game end actions">
          <button className="action-btn ok-btn" onClick={onOk} aria-label="Dismiss game end screen">
            ✓ OK
          </button>
          <button
            className={`action-btn rematch-btn ${rematchRequested ? 'pending' : ''}`}
            onClick={onRematch}
            disabled={rematchRequested}
            aria-label={rematchRequested ? 'Waiting for opponent to accept rematch' : 'Request rematch'}
          >
            {rematchRequested ? '⏳ Waiting...' : '🔄 Rematch'}
          </button>
        </div>
        <button className="back-to-lobby-btn" onClick={onBackToLobby} aria-label="Return to lobby">
          ← Back to Lobby
        </button>
      </div>
    </div>
  );
}

