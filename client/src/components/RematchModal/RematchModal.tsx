import './RematchModal.css';

interface RematchModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function RematchModal({ onAccept, onDecline }: RematchModalProps) {
  return (
    <div className="rematch-modal-overlay">
      <div className="rematch-modal">
        <div className="rematch-icon">🔄</div>
        <h2>Rematch Request</h2>
        <p>Your opponent wants a rematch!</p>
        <div className="rematch-actions">
          <button className="rematch-accept-btn" onClick={onAccept}>
            ✓ Accept
          </button>
          <button className="rematch-decline-btn" onClick={onDecline}>
            ✗ Decline
          </button>
        </div>
      </div>
    </div>
  );
}

