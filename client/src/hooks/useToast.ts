/**
 * Toast Notification Hook
 */

import { useState, useCallback } from 'react';
import type { ToastMessage, ToastType } from '../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((
    type: ToastType, 
    message: string, 
    duration: number = 5000
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const info = useCallback((msg: string, duration?: number) => 
    addToast('info', msg, duration), [addToast]);
  
  const success = useCallback((msg: string, duration?: number) => 
    addToast('success', msg, duration), [addToast]);
  
  const warning = useCallback((msg: string, duration?: number) => 
    addToast('warning', msg, duration), [addToast]);
  
  const error = useCallback((msg: string, duration?: number) => 
    addToast('error', msg, duration ?? 8000), [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    info,
    success,
    warning,
    error
  };
}

