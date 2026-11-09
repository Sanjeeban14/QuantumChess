/**
 * ParticleField - Interactive particles that react to mouse movement
 * Creates a quantum probability field effect
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './ParticleField.css';

interface Particle {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  color: string;
  animDuration: number;
  animDelay: number;
}

interface ParticleFieldProps {
  particleCount?: number;
}

export function ParticleField({ particleCount = 30 }: ParticleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const animationRef = useRef<number | undefined>(undefined);

  // Initialize particles
  useEffect(() => {
    const colors = ['#00f0ff', '#8b5cf6', '#d946ef', '#06b6d4', '#a855f7'];
    const newParticles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      newParticles.push({
        id: i,
        x,
        y,
        baseX: x,
        baseY: y,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        animDuration: 2 + Math.random() * 2,
        animDelay: Math.random() * 2
      });
    }
    setParticles(newParticles);
  }, [particleCount]);

  // Handle mouse movement
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: -1000, y: -1000 });
  }, []);

  // Animate particles based on mouse proximity
  useEffect(() => {
    const animate = () => {
      setParticles(prev => prev.map(particle => {
        const dx = mousePos.x - particle.baseX;
        const dy = mousePos.y - particle.baseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 25;

        if (distance < maxDistance && mousePos.x >= 0) {
          // Push particles away from mouse
          const force = (maxDistance - distance) / maxDistance;
          const angle = Math.atan2(dy, dx);
          const pushX = particle.baseX - Math.cos(angle) * force * 8;
          const pushY = particle.baseY - Math.sin(angle) * force * 8;

          return {
            ...particle,
            x: particle.x + (pushX - particle.x) * 0.15,
            y: particle.y + (pushY - particle.y) * 0.15
          };
        } else {
          // Return to base position
          return {
            ...particle,
            x: particle.x + (particle.baseX - particle.x) * 0.08,
            y: particle.y + (particle.baseY - particle.y) * 0.08
          };
        }
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mousePos]);

  return (
    <div
      ref={containerRef}
      className="particle-field"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          className="field-particle"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.4, 0.7, 0.4]
          }}
          transition={{
            duration: particle.animDuration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: particle.animDelay
          }}
        />
      ))}
    </div>
  );
}

