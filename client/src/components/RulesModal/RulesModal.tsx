import { useEffect, useRef } from 'react';
import './RulesModal.css';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the close button when modal opens
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="rules-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
    >
      <div
        className="rules-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        <button
          className="rules-close"
          onClick={onClose}
          ref={closeButtonRef}
          aria-label="Close rules modal"
        >
          ×
        </button>
        <h2 id="rules-modal-title">⚛️ Quantum Chess Rules</h2>

        <section>
          <h3>🎯 Objective</h3>
          <p>Checkmate the opponent's King to win! Standard chess win conditions apply - checkmate, stalemate (draw), or resignation.</p>
        </section>

        <section>
          <h3>♟️ Basic Moves</h3>
          <p>All standard chess rules apply. Pieces move, capture, castle, and promote as in regular chess.</p>
        </section>

        <section>
          <h3>⚛️ Quantum Split Move</h3>
          <ul>
            <li>Click <strong>"Split Move"</strong> to enter split mode</li>
            <li>Select a piece, then choose <strong>two</strong> destination squares</li>
            <li>The piece enters <strong>superposition</strong> - it exists at both squares simultaneously with 50% probability each</li>
            <li>Superposition pieces are shown with colored borders and probability badges</li>
            <li><strong>Kings and Pawns cannot split</strong> - only Queen, Rook, Bishop, Knight can enter superposition</li>
            <li><strong>Splits cannot capture</strong> - both destination squares must be empty</li>
          </ul>
        </section>

        <section>
          <h3>🎲 Quantum Capture (Measurement)</h3>
          <ul>
            <li>When you capture a piece in superposition, <strong>quantum measurement</strong> occurs</li>
            <li>The superposition piece randomly collapses to one position based on its probabilities</li>
            <li>If it collapses to the capture square → <strong>capture succeeds</strong></li>
            <li>If it collapses elsewhere → <strong>piece escapes!</strong> Your piece still moves to the target square, but the opponent's piece survives at its other position</li>
          </ul>
        </section>

        <section>
          <h3>🔀 Collapsing Superposition</h3>
          <ul>
            <li>Moving a piece that's in superposition <strong>collapses it</strong> to the square you move from</li>
            <li>If your superposition piece gets captured, it collapses during the capture attempt</li>
          </ul>
        </section>

        <section>
          <h3>⚠️ Limits</h3>
          <ul>
            <li>Each player has a maximum number of pieces that can be in superposition at once</li>
            <li>This limit is set when creating the game room</li>
          </ul>
        </section>

        <section>
          <h3>💡 Strategy Tips</h3>
          <ul>
            <li>Split valuable pieces to make them harder to capture</li>
            <li>Attacking superposition pieces is risky - they might escape!</li>
            <li>Use splits to control more squares and create threats</li>
            <li>Remember: moving a split piece collapses it, so plan accordingly</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

