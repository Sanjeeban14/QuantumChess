import { useState, useEffect } from 'react';
import './OpenGames.css';

interface OpenGame {
  room_id: string;
  max_superpositions: number;
  created_at: string;
  waiting_seconds: number;
}

interface OpenGamesProps {
  serverUrl: string;
  onJoinGame: (roomId: string) => Promise<void>;
  isConnecting: boolean;
  serverStatus: 'checking' | 'online' | 'offline';
}

export function OpenGames({ serverUrl, onJoinGame, isConnecting, serverStatus }: OpenGamesProps) {
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch open games and refresh periodically
  useEffect(() => {
    if (serverStatus !== 'online') {
      setOpenGames([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchOpenGames = async () => {
      try {
        const response = await fetch(`${serverUrl}/api/rooms/open`);
        if (response.ok && isMounted) {
          const games = await response.json();
          setOpenGames(games);
        }
      } catch {
        // Silently fail - server might be starting up
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOpenGames();
    // Refresh every 5 seconds
    const refreshInterval = setInterval(fetchOpenGames, 5000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [serverUrl, serverStatus]);

  const formatWaitTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (serverStatus !== 'online') {
    return null;
  }

  return (
    <div className="open-games">
      <div className="open-games-header">
        <h3>🎯 Open Challenges</h3>
        <span className="game-count">
          {isLoading ? '...' : `${openGames.length} game${openGames.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {isLoading ? (
        <div className="open-games-loading">
          <div className="mini-spinner" />
          <span>Loading...</span>
        </div>
      ) : openGames.length === 0 ? (
        <div className="open-games-empty">
          <p>No open games right now</p>
          <p className="hint">Create a public game to appear here!</p>
        </div>
      ) : (
        <div className="open-games-list">
          {openGames.map((game) => (
            <div key={game.room_id} className="open-game-item">
              <div className="game-info">
                <span className="game-id">{game.room_id}</span>
                <span className="game-settings">
                  ⚛️ {game.max_superpositions} superposition{game.max_superpositions !== 1 ? 's' : ''}
                </span>
                <span className="waiting-time">⏱️ {formatWaitTime(game.waiting_seconds)}</span>
              </div>
              <button
                className="join-btn"
                onClick={() => onJoinGame(game.room_id)}
                disabled={isConnecting}
              >
                {isConnecting ? '...' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

