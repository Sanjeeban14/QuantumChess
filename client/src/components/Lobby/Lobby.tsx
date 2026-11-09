import { useState, lazy, Suspense } from 'react';
import './Lobby.css';
import { RulesModal } from '../RulesModal/RulesModal';
import { QuantumTitle } from '../QuantumTitle';
import { ParticleField } from '../ParticleField';

const QuantumAnimation = lazy(() =>
  import('../QuantumAnimation').then(m => ({ default: m.QuantumAnimation }))
);

interface LobbyProps {
  onPlayComputer: () => void;
}

export function Lobby({ onPlayComputer }: LobbyProps) {
  const [showRules, setShowRules] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  return (
    <div className="lobby" role="main" aria-label="Quantum Chess Lobby">
      <Suspense fallback={null}>
        <QuantumAnimation />
      </Suspense>
      <ParticleField particleCount={60} />

      <div className="lobby-card-wrapper">
        <button
          className="help-btn-card"
          onClick={() => setShowRules(true)}
          title="Game Rules"
          aria-label="Open game rules"
        >
          ?
        </button>

        <div className="lobby-card">
          <div
            className="lobby-main-area"
            onMouseEnter={() => setIsCardHovered(true)}
            onMouseLeave={() => setIsCardHovered(false)}
          >
            <QuantumTitle isObserved={isCardHovered} />
            <p className="subtitle">
              Play quantum chess locally against a computer opponent.
            </p>

            <div className="lobby-actions" role="group" aria-label="Game options">
              <button
                onClick={onPlayComputer}
                className="primary-btn create-game-btn"
                aria-label="Play against the computer"
              >
                🤖 Play Computer
              </button>
            </div>
          </div>

          <footer className="lobby-footer" aria-labelledby="how-to-play-heading">
            <h3 id="how-to-play-heading">🎯 How to Play</h3>
            <ul>
              <li><strong>Split moves</strong> put pieces in superposition (50% at two squares)</li>
              <li><strong>Captures</strong> on superposition pieces collapse them randomly</li>
              <li>If collapse favors you, <strong>capture succeeds</strong>; otherwise, the piece <strong>escapes!</strong></li>
              <li><strong>Checkmate the King to win!</strong> Standard chess win conditions apply.</li>
            </ul>
          </footer>
        </div>
      </div>

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
