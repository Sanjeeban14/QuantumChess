import { useEffect, useRef, useState } from 'react';
import { Chessboard } from './components/Chessboard';
import { GameEndScreen } from './components/GameEndScreen';
import { Lobby } from './components/Lobby';
import { MoveNotation } from './components/MoveNotation';
import { RematchModal } from './components/RematchModal';
import { RulesModal } from './components/RulesModal/RulesModal';
import { ToastContainer } from './components/Toast';
import { useChessGame } from './hooks/useChessGame';
import { useToast } from './hooks/useToast';
import './App.css';

// Format milliseconds to MM:SS or M:SS.s for low time
function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Show tenths of seconds when under 20 seconds
  if (totalSeconds < 20) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Chess Clock Component
interface ChessClockProps {
  timeMs: number;
  isActive: boolean;
  label: string;
  isOpponent?: boolean;
}

function ChessClock({ timeMs, isActive, label, isOpponent = false }: ChessClockProps) {
  const isLowTime = timeMs < 30000; // Under 30 seconds
  const isCritical = timeMs < 10000; // Under 10 seconds

  return (
    <div
      className={`chess-clock ${isActive ? 'active' : ''} ${isLowTime ? 'low-time' : ''} ${isCritical ? 'critical' : ''} ${isOpponent ? 'opponent' : 'player'}`}
      role="timer"
      aria-label={`${label} time: ${formatTime(timeMs)}`}
    >
      <div className="clock-label">{label}</div>
      <div className="clock-time">{formatTime(timeMs)}</div>
    </div>
  );
}

function App() {
  // Toast notifications
  const { toasts, removeToast, success, error: showError, warning, info } = useToast();

  const {
    gameState,
    playerColor,
    isComputerGame,
    connectionState,
    error,
    isMyTurn,
    isConnected,
    isGameOver: gameOver,
    quantumMode,
    lastCollapse,
    splitMode,
    splitFrom,
    splitTo1,
    rematchRequested,
    rematchReceived,
    peerDisconnected,
    timerState,
    startComputerGame,
    executeMove,
    disconnect,
    toggleSplitMode,
    handleSplitSelection,
    resign,
    requestRematch,
    acceptRematch,
    declineRematch
  } = useChessGame();

  // Track if we've shown the connected message
  const hasShownConnectedRef = useRef(false);

  // Move navigation state (null = live view)
  const [viewingMoveIndex, setViewingMoveIndex] = useState<number | null>(null);

  // Resign confirmation state
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  // Rules modal state
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Game end modal dismissed state
  const [gameEndDismissed, setGameEndDismissed] = useState(false);

  // Show toast notifications for state changes
  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error, showError]);

  // Show collapse notification as toast
  useEffect(() => {
    if (lastCollapse) {
      const emoji = lastCollapse.wasCapture ? '💥' : '👻';
      const result = lastCollapse.wasCapture ? 'Captured!' : 'Escaped!';
      const msg = `${emoji} ${lastCollapse.pieceId} → ${lastCollapse.collapsedTo} (${Math.round(lastCollapse.probability * 100)}%) ${result}`;
      if (lastCollapse.wasCapture) {
        success(msg, 4000);
      } else {
        warning(msg, 4000);
      }
    }
  }, [lastCollapse, success, warning]);

  useEffect(() => {
    // Only show "Connected" once per session
    if (isConnected && gameState && !hasShownConnectedRef.current) {
      hasShownConnectedRef.current = true;
      success(isComputerGame ? 'Game started. You play as white.' : 'Connected! Game started.', 3000);
    }
    // Reset when disconnected
    if (!isConnected) {
      hasShownConnectedRef.current = false;
    }
  }, [isConnected, isComputerGame, gameState, success]);

  useEffect(() => {
    if (connectionState === 'connecting') {
      info('Connecting to peer...', 3000);
    }
  }, [connectionState, info]);

  // Reset game end dismissed state when game status changes to game over
  // (The GameEndScreen modal handles showing the result, no toast needed)
  useEffect(() => {
    if (gameState?.gameStatus && gameState.gameStatus !== 'active') {
      setGameEndDismissed(false);
    }
  }, [gameState?.gameStatus]);

  // Show lobby if not in a game
  // BUT: If peer disconnected, stay in game to show the "connection lost" overlay
  if (!gameState || (!isConnected && !peerDisconnected)) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
        <Lobby
          onPlayComputer={() => startComputerGame()}
        />
      </>
    );
  }

  // Show game
  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="game-container" role="main" aria-label="Quantum Chess Game">
        <header className="game-info" role="banner">
          <div className="player-info" aria-label={`Playing as ${playerColor}`}>
            Playing as: <strong>{playerColor}</strong>
            {quantumMode && <span className="quantum-badge" aria-label="Quantum mode enabled">⚛️ Quantum</span>}
          </div>
          <div
            className="turn-info"
            role="status"
            aria-live="polite"
            aria-label={gameOver
              ? `Game Over: ${gameState.gameStatus.replace('_', ' ')}`
              : isMyTurn ? 'Your turn' : isComputerGame ? "Computer's turn" : "Opponent's turn"
            }
          >
            {gameOver
              ? `Game Over: ${gameState.gameStatus.replace('_', ' ')}`
              : isMyTurn ? '🎯 Your turn' : isComputerGame ? "⏳ Computer's turn" : "⏳ Opponent's turn"
            }
          </div>
          {gameState.chess.isCheck() && !gameOver && (
            <div className="check-warning" role="alert" aria-live="assertive">⚠️ Check!</div>
          )}

        </header>

        <div className="board-and-notation" role="region" aria-label="Chess board and move history">
          <div className="board-with-clocks">
            {/* Opponent's Clock - above board, aligned right (h-file) */}
            <div className="clock-row opponent-clock-row">
              <ChessClock
                timeMs={playerColor === 'white' ? timerState.blackTimeMs : timerState.whiteTimeMs}
                isActive={timerState.activeColor === (playerColor === 'white' ? 'black' : 'white')}
                label={isComputerGame ? 'Computer' : 'Opponent'}
                isOpponent
              />
            </div>

            <Chessboard
              gameState={gameState}
              playerColor={playerColor}
              isMyTurn={isMyTurn}
              onMove={executeMove}
              splitMode={splitMode}
              splitFrom={splitFrom}
              splitTo1={splitTo1}
              onSplitSelection={handleSplitSelection}
            />

            {/* Player's Clock - below board, aligned left (a-file) */}
            <div className="clock-row player-clock-row">
              <ChessClock
                timeMs={playerColor === 'white' ? timerState.whiteTimeMs : timerState.blackTimeMs}
                isActive={timerState.activeColor === playerColor}
                label="You"
              />
            </div>
          </div>

          <MoveNotation
            gameState={gameState}
            viewingMoveIndex={viewingMoveIndex}
            onNavigate={setViewingMoveIndex}
            isGameOver={gameOver}
          />
        </div>

        <nav className="game-controls" role="toolbar" aria-label="Game controls">

          <div className="move-count" aria-label={`Current move: ${gameState.turnNumber}`}>Move: {gameState.turnNumber}</div>

          {/* Quantum controls */}
          {quantumMode && isMyTurn && !gameOver && (
            <button
              className={`split-btn ${splitMode ? 'active' : ''}`}
              onClick={toggleSplitMode}
              aria-pressed={splitMode}
              aria-label={splitMode ? 'Cancel split move mode' : 'Enable split move mode'}
            >
              {splitMode ? '❌ Cancel Split' : '⚛️ Split Move'}
            </button>
          )}

          {/* Resign button */}
          {!gameOver && (
            <button
              className="resign-btn"
              onClick={() => setShowResignConfirm(true)}
              aria-label="Resign game"
            >
              🏳️ Resign
            </button>
          )}

          {/* Rematch button - always visible after game ends */}
          {gameOver && (
            <button
              className={`rematch-btn ${rematchRequested ? 'pending' : ''}`}
              onClick={requestRematch}
              disabled={rematchRequested}
              aria-label={rematchRequested ? 'Waiting for opponent to accept rematch' : 'Request rematch'}
            >
              {rematchRequested ? '⏳ Waiting...' : '🔄 Rematch'}
            </button>
          )}
        </nav>

        {/* Resign confirmation popup */}
        {showResignConfirm && (
          <div className="resign-overlay" role="dialog" aria-modal="true" aria-labelledby="resign-title">
            <div className="resign-popup">
              <h3 id="resign-title">🏳️ Resign Game?</h3>
              <p>Are you sure you want to resign? This will give your opponent the win.</p>
              <div className="resign-buttons" role="group" aria-label="Resign confirmation buttons">
                <button
                  className="resign-confirm"
                  onClick={() => {
                    resign();
                    setShowResignConfirm(false);
                  }}
                  aria-label="Confirm resignation"
                >
                  Yes, Resign
                </button>
                <button
                  className="resign-cancel"
                  onClick={() => setShowResignConfirm(false)}
                  aria-label="Cancel resignation"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Peer disconnected overlay - game ends when connection is lost */}
        {peerDisconnected && !gameOver && (
          <div className="peer-disconnected-overlay" role="alertdialog" aria-modal="true" aria-labelledby="disconnect-title">
            <div className="peer-disconnected-popup">
              <div className="disconnect-icon" aria-hidden="true">📡</div>
              <h3 id="disconnect-title">Connection Lost</h3>
              <p>The connection to your opponent was lost. The game has ended.</p>
              <button className="back-btn" onClick={disconnect} aria-label="Return to lobby">
                ← Back to Lobby
              </button>
            </div>
          </div>
        )}

        {/* Quantum quick tips with help button */}
        {quantumMode && (
          <div className="quantum-tips-container">
            <button className="help-btn-inline" onClick={() => setShowRulesModal(true)} aria-label="Open game rules">
              ?
            </button>
            <div className="quantum-instructions">
              <strong>⚛️ Quick Tips:</strong>
              <ul>
                <li><strong>Split:</strong> Put a piece in two places at once (50/50)</li>
                <li><strong>Capture:</strong> Superposition pieces collapse randomly - they might escape!</li>
                <li><strong>Limit:</strong> Max {gameState.maxSuperpositions} pieces in superposition per player</li>
              </ul>
            </div>
          </div>
        )}

        {/* Help button - only show when not in quantum mode (tips container has its own) */}
        {!quantumMode && (
          <button className="help-btn" onClick={() => setShowRulesModal(true)}>
            ?
          </button>
        )}

        {/* Rules modal */}
        <RulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />

        {/* Game End modal */}
        {gameOver && !gameEndDismissed && (
          <GameEndScreen
            gameState={gameState}
            playerColor={playerColor}
            onOk={() => setGameEndDismissed(true)}
            onRematch={requestRematch}
            onBackToLobby={disconnect}
            rematchRequested={rematchRequested}
          />
        )}

        {/* Rematch Request modal - shows when opponent requests rematch */}
        {rematchReceived && (
          <RematchModal
            onAccept={() => {
              acceptRematch();
              setGameEndDismissed(false);
            }}
            onDecline={declineRematch}
          />
        )}
      </div>
    </>
  );
}

export default App;
