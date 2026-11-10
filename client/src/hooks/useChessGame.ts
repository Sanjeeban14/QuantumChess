/**
 * Chess Game Hook - Uses chess.js for proper rule validation
 * WITH QUANTUM MECHANICS SUPPORT
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { type Square, type PieceSymbol } from 'chess.js';
import {
  createGame,
  getLegalActions,
  makeMove,
  makeSplitMove,
  isGameOver,
  setQuantumMode as setEngineQuantumMode,
  type QuantumGameState,
  type Player,
  type CollapseResult
} from '../engine/ChessEngine';
import { WebRTCConnection, type ConnectionState } from '../networking';

export interface GameMessage {
  type: 'move' | 'split' | 'fen' | 'resign' | 'rematch_request' | 'rematch_accept' | 'rematch_decline' | 'time_sync' | 'timeout';
  from?: string;
  to?: string;
  to2?: string; // For split moves
  promotion?: string;
  collapseSeed?: number;
  fen?: string;
  color?: 'white' | 'black'; // For resign message
  whiteTimeMs?: number; // Time remaining in ms
  blackTimeMs?: number; // Time remaining in ms
}

export interface TimeControl {
  minutes: number;
  increment: number;
}

export interface TimerState {
  whiteTimeMs: number;
  blackTimeMs: number;
  activeColor: 'white' | 'black' | null; // null = game not started (before white's first move)
  lastTickTime: number; // timestamp of last timer tick
}

interface UseChessGameOptions {
  serverUrl?: string;
}

const COMPUTER_MOVE_DELAY_MIN_MS = 1_000;
const COMPUTER_MOVE_DELAY_MAX_MS = 10_000;

export function useChessGame({ serverUrl = '' }: UseChessGameOptions = {}) {
  const [gameState, setGameState] = useState<QuantumGameState | null>(null);
  const [playerColor, setPlayerColor] = useState<Player>('white');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isComputerGame, setIsComputerGame] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCollapse, setLastCollapse] = useState<CollapseResult | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitFrom, setSplitFrom] = useState<Square | null>(null);
  const [splitTo1, setSplitTo1] = useState<Square | null>(null);

  // Rematch state
  const [rematchRequested, setRematchRequested] = useState(false); // We sent a request
  const [rematchReceived, setRematchReceived] = useState(false);   // We received a request

  // Peer disconnected state (game ends when peer disconnects)
  const [peerDisconnected, setPeerDisconnected] = useState(false);

  // Timer state
  const [timeControl, setTimeControl] = useState<TimeControl>({ minutes: 5, increment: 0 });
  const [timerState, setTimerState] = useState<TimerState>({
    whiteTimeMs: 5 * 60 * 1000,
    blackTimeMs: 5 * 60 * 1000,
    activeColor: null, // null = waiting for white's first move
    lastTickTime: 0
  });
  const [flaggedPlayer, setFlaggedPlayer] = useState<'white' | 'black' | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ensures we broadcast a given flag to the peer exactly once.
  const timeoutHandledRef = useRef(false);

  const connectionRef = useRef<WebRTCConnection | null>(null);

  // Handle incoming P2P messages
  const handleMessage = useCallback((data: unknown) => {
    const message = data as GameMessage;
    console.log('[Game] Received:', message.type);

    switch (message.type) {
      case 'move':
        if (message.from && message.to) {
          // Get current state to compute result outside of setState
          setGameState(prev => {
            if (!prev) return prev;
            const result = makeMove(
              prev,
              message.from as Square,
              message.to as Square,
              message.promotion as PieceSymbol | undefined,
              message.collapseSeed
            );
            if (!result.success) {
              console.error('[Game] Invalid move from peer:', result.error);
              return prev;
            }
            // Set collapse result outside setState to avoid batching issues
            if (result.collapseResult) {
              setTimeout(() => setLastCollapse(result.collapseResult!), 0);
            }
            return result.newState;
          });
        }
        break;

      case 'split':
        if (message.from && message.to && message.to2) {
          setGameState(prev => {
            if (!prev) return prev;
            const result = makeSplitMove(
              prev,
              message.from as Square,
              message.to as Square,
              message.to2 as Square
            );
            if (!result.success) {
              console.error('[Game] Invalid split from peer:', result.error);
              return prev;
            }
            return result.newState;
          });
        }
        break;

      case 'fen':
        setGameState(prev => {
          if (!prev) return prev;
          if (prev.chess.fen() !== message.fen) {
            console.warn('[Game] FEN mismatch (expected with quantum moves)');
          }
          return prev;
        });
        break;

      case 'resign':
        // Opponent resigned - mark game over with their color
        setGameState(prev => {
          if (!prev) return prev;
          const winnerStatus = message.color === 'white' ? 'black_wins' : 'white_wins';
          return {
            ...prev,
            gameStatus: winnerStatus as typeof prev.gameStatus,
            result: winnerStatus,
            resultReason: 'resignation'
          };
        });
        break;

      case 'rematch_request':
        // Opponent wants a rematch
        console.log('[Game] Rematch request received');
        setRematchReceived(true);
        break;

      case 'rematch_accept':
        // Opponent accepted our rematch request - start new game
        console.log('[Game] Rematch accepted!');
        setRematchRequested(false);
        setRematchReceived(false);
        // Reset game state with swapped colors
        setPlayerColor(prev => prev === 'white' ? 'black' : 'white');
        setGameState(createGame(true, maxSuperpositionsRef.current));
        break;

      case 'rematch_decline':
        // Opponent declined our rematch request
        console.log('[Game] Rematch declined');
        setRematchRequested(false);
        break;

      case 'timeout':
        // Opponent observed a flag — end the game consistently on both sides.
        setGameState(prev => {
          if (!prev || prev.gameStatus !== 'active') return prev;
          const winnerStatus = message.color === 'white' ? 'black_wins' : 'white_wins';
          return {
            ...prev,
            gameStatus: winnerStatus as typeof prev.gameStatus,
            result: winnerStatus,
            resultReason: 'timeout'
          };
        });
        break;

      case 'time_sync':
        // Sync timer state from opponent after their move
        if (message.whiteTimeMs !== undefined && message.blackTimeMs !== undefined) {
          setTimerState(prev => {
            // Figure out whose turn it is now (opponent just moved, so it's our turn)
            // If white time > previous, white just moved (got increment), so now black's turn
            const wasWhiteMove = message.whiteTimeMs! > prev.whiteTimeMs - 200; // 200ms tolerance
            const newActiveColor = wasWhiteMove ? 'black' : 'white';

            return {
              whiteTimeMs: message.whiteTimeMs!,
              blackTimeMs: message.blackTimeMs!,
              activeColor: prev.activeColor === null ? 'black' : newActiveColor as 'white' | 'black',
              lastTickTime: Date.now()
            };
          });
        }
        break;
    }
  }, []);

  // Track maxSuperpositions setting
  const maxSuperpositionsRef = useRef(2);

  // Handle game seed (create initial game with quantum mode ON)
  const handleGameSeed = useCallback((_seed: number) => {
    console.log('[Game] Starting new QUANTUM game with maxSuperpositions:', maxSuperpositionsRef.current);
    setGameState(createGame(true, maxSuperpositionsRef.current)); // Quantum mode enabled!
  }, []);

  // Create WebRTC connection with all callbacks
  const createConnection = useCallback(() => {
    const connection = new WebRTCConnection({
      onStateChange: setConnectionState,
      onMessage: handleMessage,
      onGameSeed: handleGameSeed,
      onPeerDisconnected: () => {
        // Peer disconnected - game ends
        setPeerDisconnected(true);
      }
    });
    return connection;
  }, [handleMessage, handleGameSeed]);

  // Initialize timer with time control settings
  const initializeTimer = useCallback((minutes: number, increment: number) => {
    const initialTimeMs = minutes * 60 * 1000;
    setTimeControl({ minutes, increment });
    setTimerState({
      whiteTimeMs: initialTimeMs,
      blackTimeMs: initialTimeMs,
      activeColor: null, // Timer starts after white's first move
      lastTickTime: 0
    });
    setFlaggedPlayer(null);
    timeoutHandledRef.current = false;
  }, []);

  // Create a new room
  const createRoom = useCallback(async (
    maxSuperpositions: number = 2,
    isPublic: boolean = false,
    timeControlParam: TimeControl = { minutes: 5, increment: 0 }
  ) => {
    try {
      setIsComputerGame(false);
      maxSuperpositionsRef.current = maxSuperpositions;
      setError(null);
      const response = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: Date.now(),
          maxSuperpositions,
          isPublic,
          timeControl: timeControlParam
        })
      });

      if (!response.ok) throw new Error('Failed to create room');

      const data = await response.json();
      setRoomId(data.room_id);
      setPlayerColor(data.player_color as Player);

      // Initialize timer with room settings
      initializeTimer(data.time_control_minutes, data.time_control_increment);

      connectionRef.current = createConnection();
      await connectionRef.current.connect(serverUrl, data.room_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  }, [serverUrl, createConnection, initializeTimer]);

  // Join an existing room
  const joinRoom = useCallback(async (targetRoomId: string) => {
    try {
      setIsComputerGame(false);
      setError(null);
      const response = await fetch(`${serverUrl}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: targetRoomId, seed: Date.now() })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to join room');
      }

      const data = await response.json();
      setRoomId(data.room_id);
      setPlayerColor(data.player_color as Player);
      // Get maxSuperpositions from room data (default 2)
      const maxSup = data.max_superpositions ?? 2;
      maxSuperpositionsRef.current = maxSup;
      setGameState(createGame(true, maxSup));

      // Initialize timer with room settings
      initializeTimer(data.time_control_minutes, data.time_control_increment);

      connectionRef.current = createConnection();
      await connectionRef.current.connect(serverUrl, data.room_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    }
  }, [serverUrl, createConnection, initializeTimer]);

  const startComputerGame = useCallback((maxSuperpositions: number = 2) => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    maxSuperpositionsRef.current = maxSuperpositions;
    setError(null);
    setRoomId(null);
    setPlayerColor('white');
    setConnectionState('disconnected');
    setIsComputerGame(true);
    setPeerDisconnected(false);
    setRematchRequested(false);
    setRematchReceived(false);
    setSplitMode(false);
    setSplitFrom(null);
    setSplitTo1(null);
    setLastCollapse(null);
    setGameState(createGame(true, maxSuperpositions));
    initializeTimer(5, 0);
  }, [initializeTimer]);

  // Handle timer update after a move
  const handleMoveTimer = useCallback((movingColor: 'white' | 'black') => {
    setTimerState(prev => {
      const now = Date.now();

      // If this is white's first move, start the clock
      if (prev.activeColor === null && movingColor === 'white') {
        return {
          ...prev,
          activeColor: 'black', // After white moves, it's black's turn
          lastTickTime: now
        };
      }

      // Add increment to the player who just moved
      const incrementMs = timeControl.increment * 1000;
      const newWhiteTime = movingColor === 'white'
        ? prev.whiteTimeMs + incrementMs
        : prev.whiteTimeMs;
      const newBlackTime = movingColor === 'black'
        ? prev.blackTimeMs + incrementMs
        : prev.blackTimeMs;

      return {
        whiteTimeMs: newWhiteTime,
        blackTimeMs: newBlackTime,
        activeColor: movingColor === 'white' ? 'black' : 'white',
        lastTickTime: now
      };
    });
  }, [timeControl.increment]);

  // Execute a classical move
  const executeMove = useCallback((from: Square, to: Square, promotion?: string): boolean => {
    if (!gameState) return false;

    // Generate a seed for collapse (for P2P determinism)
    const collapseSeed = Math.floor(Math.random() * 0x7FFFFFFF);

    const result = makeMove(gameState, from, to, promotion as PieceSymbol | undefined, collapseSeed);
    if (!result.success) {
      console.error('[Game] Invalid move:', result.error);
      return false;
    }

    if (result.collapseResult) {
      setLastCollapse(result.collapseResult);
    }

    setGameState(result.newState);

    // Update timer (add increment, switch active clock)
    handleMoveTimer(gameState.currentPlayer);

    // Send move to peer with collapse seed
    connectionRef.current?.send({ type: 'move', from, to, promotion, collapseSeed });
    connectionRef.current?.send({ type: 'fen', fen: result.newState.chess.fen() });

    // Send time sync after move
    setTimerState(current => {
      connectionRef.current?.send({
        type: 'time_sync',
        whiteTimeMs: current.whiteTimeMs,
        blackTimeMs: current.blackTimeMs
      });
      return current;
    });

    // Reset split mode
    setSplitMode(false);
    setSplitFrom(null);
    setSplitTo1(null);

    return true;
  }, [gameState, handleMoveTimer]);

  // Execute a QUANTUM SPLIT move
  const executeSplitMove = useCallback((from: Square, to1: Square, to2: Square): boolean => {
    if (!gameState) return false;

    const result = makeSplitMove(gameState, from, to1, to2);
    if (!result.success) {
      console.error('[Game] Invalid split move:', result.error);
      setError(result.error || 'Invalid split move');
      return false;
    }

    setGameState(result.newState);

    // Update timer (add increment, switch active clock)
    handleMoveTimer(gameState.currentPlayer);

    // Send split to peer
    connectionRef.current?.send({ type: 'split', from, to: to1, to2 });

    // Send time sync after move
    setTimerState(current => {
      connectionRef.current?.send({
        type: 'time_sync',
        whiteTimeMs: current.whiteTimeMs,
        blackTimeMs: current.blackTimeMs
      });
      return current;
    });

    // Reset split mode
    setSplitMode(false);
    setSplitFrom(null);
    setSplitTo1(null);

    return true;
  }, [gameState, handleMoveTimer]);

  // Toggle split mode
  const toggleSplitMode = useCallback(() => {
    setSplitMode(prev => !prev);
    setSplitFrom(null);
    setSplitTo1(null);
  }, []);

  // Handle split mode selection
  const handleSplitSelection = useCallback((square: Square, sourceSquare?: Square): 'from' | 'to1' | 'complete' | 'cancelled' => {
    if (!splitFrom) {
      const source = sourceSquare ?? square;
      setSplitFrom(source);
      if (sourceSquare && sourceSquare !== square) {
        setSplitTo1(square);
        return 'to1';
      }
      return 'from';
    } else if (!splitTo1) {
      setSplitTo1(square);
      return 'to1';
    } else {
      // Third click completes the split
      const success = executeSplitMove(splitFrom, splitTo1, square);
      if (success) {
        return 'complete';
      } else {
        setSplitMode(false);
        setSplitFrom(null);
        setSplitTo1(null);
        return 'cancelled';
      }
    }
  }, [splitFrom, splitTo1, executeSplitMove]);

  // Toggle quantum mode
  const toggleQuantumMode = useCallback(() => {
    if (!gameState) return;
    setGameState(setEngineQuantumMode(gameState, !gameState.quantumMode));
  }, [gameState]);

  // Resign the game
  const resign = useCallback(() => {
    if (!gameState || (!isComputerGame && !connectionRef.current)) return;

    connectionRef.current?.send({ type: 'resign', color: playerColor });

    // Update local game state - must update gameStatus for isGameOver to work
    const winnerStatus = playerColor === 'white' ? 'black_wins' : 'white_wins';
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        gameStatus: winnerStatus as typeof prev.gameStatus,
        result: winnerStatus,
        resultReason: 'resignation'
      };
    });
  }, [gameState, isComputerGame, playerColor]);

  // Disconnect
  const disconnect = useCallback(() => {
    // Stop timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setConnectionState('disconnected');
    setIsComputerGame(false);
    setRoomId(null);
    setGameState(null);
    setSplitMode(false);
    setSplitFrom(null);
    setSplitTo1(null);
    setRematchRequested(false);
    setRematchReceived(false);
    setPeerDisconnected(false);
    setFlaggedPlayer(null);
  }, []);

  // Request a rematch
  const requestRematch = useCallback(() => {
    if (isComputerGame) {
      setRematchRequested(false);
      setRematchReceived(false);
      setGameState(createGame(true, maxSuperpositionsRef.current));
      initializeTimer(timeControl.minutes, timeControl.increment);
      return;
    }
    if (!connectionRef.current) return;
    console.log('[Game] Sending rematch request');
    connectionRef.current.send({ type: 'rematch_request' });
    setRematchRequested(true);
  }, [isComputerGame, initializeTimer, timeControl]);

  // Accept a rematch request
  const acceptRematch = useCallback(() => {
    if (!connectionRef.current) return;
    console.log('[Game] Accepting rematch');
    connectionRef.current.send({ type: 'rematch_accept' });
    setRematchReceived(false);
    setRematchRequested(false);
    // Reset game state with swapped colors
    setPlayerColor(prev => prev === 'white' ? 'black' : 'white');
    setGameState(createGame(true, maxSuperpositionsRef.current));
    // Reset timer for new game
    initializeTimer(timeControl.minutes, timeControl.increment);
  }, [timeControl, initializeTimer]);

  // Decline a rematch request
  const declineRematch = useCallback(() => {
    if (!connectionRef.current) return;
    console.log('[Game] Declining rematch');
    connectionRef.current.send({ type: 'rematch_decline' });
    setRematchReceived(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      connectionRef.current?.disconnect();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Timer tick effect - runs every 100ms when game is active
  useEffect(() => {
    // Don't run timer if game hasn't started or is over or player flagged
    if (!gameState || timerState.activeColor === null || flaggedPlayer) {
      return;
    }

    const gameOver = isGameOver(gameState);
    if (gameOver) {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setTimerState(prev => {
        if (prev.activeColor === null) return prev;

        const now = Date.now();
        const elapsed = prev.lastTickTime > 0 ? now - prev.lastTickTime : 0;

        let newWhiteTime = prev.whiteTimeMs;
        let newBlackTime = prev.blackTimeMs;

        if (prev.activeColor === 'white') {
          newWhiteTime = Math.max(0, prev.whiteTimeMs - elapsed);
          if (newWhiteTime === 0) {
            setFlaggedPlayer('white');
          }
        } else {
          newBlackTime = Math.max(0, prev.blackTimeMs - elapsed);
          if (newBlackTime === 0) {
            setFlaggedPlayer('black');
          }
        }

        return {
          ...prev,
          whiteTimeMs: newWhiteTime,
          blackTimeMs: newBlackTime,
          lastTickTime: now
        };
      });
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [gameState, timerState.activeColor, flaggedPlayer]);

  // Handle flag (time ran out)
  useEffect(() => {
    if (flaggedPlayer && gameState) {
      // Tell the peer exactly once so both sides end on the same result,
      // instead of relying on each client independently reaching zero.
      if (!timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        connectionRef.current?.send({ type: 'timeout', color: flaggedPlayer });
      }
      const winnerStatus = flaggedPlayer === 'white' ? 'black_wins' : 'white_wins';
      setGameState(prev => {
        if (!prev || prev.gameStatus !== 'active') return prev;
        return {
          ...prev,
          gameStatus: winnerStatus as typeof prev.gameStatus,
          result: winnerStatus,
          resultReason: 'timeout'
        };
      });
    }
  }, [flaggedPlayer, gameState]);

  useEffect(() => {
    if (!isComputerGame || !gameState || gameState.currentPlayer !== 'black' ||
      isGameOver(gameState)) {
      return;
    }

    const delay = COMPUTER_MOVE_DELAY_MIN_MS
      + Math.floor(Math.random() * (COMPUTER_MOVE_DELAY_MAX_MS - COMPUTER_MOVE_DELAY_MIN_MS + 1));
    const timer = setTimeout(() => {
      const actions = getLegalActions(gameState);
      if (actions.length === 0) {
        setError('Computer could not find a legal move.');
        return;
      }

      const action = actions[Math.floor(Math.random() * actions.length)];
      const succeeded = action?.type === 'split' && action.to2
        ? executeSplitMove(action.from, action.to, action.to2)
        : action?.type === 'classical'
          ? executeMove(action.from, action.to, action.promotion)
          : false;
      if (!succeeded) {
        setError('Computer move was rejected by the chess engine.');
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isComputerGame, gameState, executeMove, executeSplitMove]);

  // Reset timer on rematch
  useEffect(() => {
    if (gameState && timerState.activeColor === null && timerState.whiteTimeMs !== timeControl.minutes * 60 * 1000) {
      // Game was reset (rematch), reinitialize timer
      initializeTimer(timeControl.minutes, timeControl.increment);
    }
  }, [gameState, timerState.activeColor, timerState.whiteTimeMs, timeControl, initializeTimer]);

  return {
    // State
    gameState, playerColor, connectionState, roomId, error,
    isMyTurn: gameState?.currentPlayer === playerColor,
    isConnected: connectionState === 'connected' || isComputerGame,
    isComputerGame,
    isGameOver: gameState ? isGameOver(gameState) : false,
    quantumMode: gameState?.quantumMode ?? false,
    lastCollapse,

    // Split mode state
    splitMode,
    splitFrom,
    splitTo1,

    // Rematch state
    rematchRequested,
    rematchReceived,

    // Peer disconnected state (game ends when peer disconnects)
    peerDisconnected,

    // Timer state
    timerState,
    timeControl,
    flaggedPlayer,

    // Actions
    createRoom, joinRoom, startComputerGame, executeMove, executeSplitMove, disconnect,
    toggleSplitMode, handleSplitSelection, toggleQuantumMode, resign,
    requestRematch, acceptRematch, declineRematch
  };
}
