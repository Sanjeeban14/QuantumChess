import { useEffect } from 'react';
import './Toast.css';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, 0 = persistent
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
};

function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

