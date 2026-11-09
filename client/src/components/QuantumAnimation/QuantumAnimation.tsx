/**
 * Lightweight CSS-based floating chess pieces animation
 * Simple, performant, and actually looks like chess pieces!
 */

import './QuantumAnimation.css';

const CHESS_PIECES = ['♔', '♕', '♖', '♗', '♘', '♙', '♚', '♛', '♜', '♝', '♞', '♟'];

interface FloatingPiece {
  id: number;
  symbol: string;
  size: number;
  top: number;
  delay: number;
  duration: number;
  opacity: number;
  isQuantum: boolean;
}

// Decorative random layout — computed once at module load so it stays stable
// across re-renders and never runs impure code during render.
const FLOATING_PIECES: FloatingPiece[] = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  symbol: CHESS_PIECES[Math.floor(Math.random() * CHESS_PIECES.length)]!,
  size: 20 + Math.random() * 40,
  top: Math.random() * 100,
  delay: Math.random() * 20,
  duration: 15 + Math.random() * 20,
  opacity: 0.1 + Math.random() * 0.15,
  isQuantum: Math.random() > 0.7,
}));

const PARTICLE_DOTS = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  animationDelay: `${Math.random() * 5}s`,
  animationDuration: `${3 + Math.random() * 4}s`,
}));

export function QuantumAnimation() {
  const pieces = FLOATING_PIECES;
  const particleDots = PARTICLE_DOTS;

  return (
    <div className="quantum-animation-container">
      {/* Floating chess pieces */}
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className={`floating-piece ${piece.isQuantum ? 'quantum' : ''}`}
          style={{
            fontSize: `${piece.size}px`,
            top: `${piece.top}%`,
            animationDelay: `-${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            opacity: piece.opacity,
          }}
        >
          {piece.symbol}
          {piece.isQuantum && <span className="ghost">{piece.symbol}</span>}
        </div>
      ))}

      {/* Subtle particle dots */}
      <div className="particles">
        {particleDots.map((dot) => (
          <div
            key={dot.id}
            className="particle"
            style={{
              left: dot.left,
              top: dot.top,
              animationDelay: dot.animationDelay,
              animationDuration: dot.animationDuration,
            }}
          />
        ))}
      </div>
    </div>
  );
}

