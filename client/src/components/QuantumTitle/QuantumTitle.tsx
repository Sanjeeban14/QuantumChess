/**
 * QuantumTitle - A high-end, quantum-inspired animated title component
 *
 * QUANTUM PHYSICS METAPHORS:
 * - Wave Function: Sinusoidal oscillation of letters (Schrödinger equation)
 * - Probability Cloud: Blur/glow represents uncertainty in position
 * - Superposition: Multiple ghost states shown simultaneously
 * - Interference: Wave patterns in the background
 * - Observation: Hover collapses the wave function (stabilizes)
 */

import { useState } from 'react';
import { motion, useAnimationFrame } from 'framer-motion';
import './QuantumTitle.css';

interface QuantumTitleProps {
  isObserved?: boolean; // External hover state from parent
}

export function QuantumTitle({ isObserved = false }: QuantumTitleProps) {
  const [time, setTime] = useState(0);

  // Use external observed state (from parent hover)
  const isHovered = isObserved;

  // Continuous time for wave animations
  useAnimationFrame((t) => {
    setTime(t * 0.001); // Convert to seconds
  });

  // Generate wave interference pattern points
  const wavePoints = Array.from({ length: 60 }, (_, i) => {
    const x = (i / 59) * 100;
    const wave1 = Math.sin((i * 0.3) + time * 2) * 8;
    const wave2 = Math.sin((i * 0.5) + time * 1.5 + Math.PI) * 5;
    const y = 50 + wave1 + wave2;
    return `${x},${y}`;
  }).join(' ');

  // Letters for individual animation
  const quantumLetters = 'QUANTUM'.split('');
  const chessLetters = 'CHESS'.split('');

  return (
    <div
      className="quantum-title-container"
      role="heading"
      aria-level={1}
      aria-label="Quantum Chess"
    >
      {/* Wave Interference Pattern Background */}
      <svg className="wave-background" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <polyline
          points={wavePoints}
          fill="none"
          stroke="url(#waveGradient)"
          strokeWidth="0.5"
          className="interference-wave"
        />
        <polyline
          points={wavePoints}
          fill="none"
          stroke="url(#waveGradient)"
          strokeWidth="0.3"
          style={{ transform: 'translateY(10px)', opacity: 0.5 }}
        />
      </svg>

      {/* Electron Orbitals */}
      <div className="orbital-container">
        <motion.div
          className="orbital orbital-1"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <div className="electron" />
        </motion.div>
        <motion.div
          className="orbital orbital-2"
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          <div className="electron" />
        </motion.div>
      </div>

      {/* Main Title */}
      <div className="title-wrapper">
        {/* Main Text with Wave Animation */}
        <div className="title-main">
          {/* Superposition Ghost Layer 1 */}
          <motion.div
            className="ghost-layer ghost-1"
            animate={isHovered ? { opacity: 0 } : {
              opacity: [0.2, 0.35, 0.2],
              x: [0, 4, 0],
              y: [0, -3, 0]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Superposition Ghost Layer 2 */}
          <motion.div
            className="ghost-layer ghost-2"
            animate={isHovered ? { opacity: 0 } : {
              opacity: [0.2, 0.35, 0.2],
              x: [0, -4, 0],
              y: [0, 3, 0]
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          />

          {/* Letters */}
          <span className="word quantum-word">
            {quantumLetters.map((letter, i) => (
              <motion.span
                key={i}
                className="letter"
                animate={isHovered ? { y: 0 } : {
                  y: Math.sin(time * 3 + i * 0.5) * 3
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {letter}
              </motion.span>
            ))}
          </span>
          <span className="word chess-word">
            {chessLetters.map((letter, i) => (
              <motion.span
                key={i}
                className="letter"
                animate={isHovered ? { y: 0 } : {
                  y: Math.sin(time * 3 + (i + 7) * 0.5) * 3
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {letter}
              </motion.span>
            ))}
          </span>
        </div>

        {/* Measurement Flash on Hover */}
        <motion.div
          className="measurement-flash"
          animate={isHovered ? { opacity: [0, 0.6, 0], scale: [1, 1.3, 1] } : { opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Quantum State Notation - Chess themed */}
      <motion.div
        className="state-indicator"
        animate={{ opacity: isHovered ? 1 : 0.8 }}
      >
        {isHovered ? '|♛⟩ → |d4⟩  ✓ observed' : '|♛⟩ = 1/√2 (|d4⟩ + |e4⟩)'}
      </motion.div>
    </div>
  );
}

