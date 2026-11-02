import { useState, useCallback } from 'react';
import { LogEntry, LogLevel } from '../types';
import { generateId } from '../utils';

interface UseNotificationsOptions {
  autoDismissMs?: number;
  onLog?: (entry: LogEntry) => void;
}

interface UseNotificationsReturn {
  // State
  notification: { msg: string; type: 'success' | 'error' } | null;
  logs: LogEntry[];
  
  // Computed
  hasErrorLogs: boolean;
  errorCount: number;
  
  // Actions
  notify: (msg: string, type: 'success' | 'error') => void;
  addLog: (message: string, level?: LogLevel, details?: string) => void;
  clearLogs: () => void;
  dismissNotification: () => void;
}

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const { autoDismissMs = 3000, onLog } = options;
  
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Computed
  const hasErrorLogs = logs.some(l => l.level === 'error');
  const errorCount = logs.filter(l => l.level === 'error').length;

  // Show notification (auto-dismiss)
  const notify = useCallback((msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    
    // Auto dismiss
    setTimeout(() => {
      setNotification(prev => {
        // Only clear if it's the same message (prevents race conditions)
        if (prev?.msg === msg) return null;
        return prev;
      });
    }, autoDismissMs);
  }, [autoDismissMs]);

  // Dismiss notification manually
  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // Add log entry
  const addLog = useCallback((message: string, level: LogLevel = 'info', details?: string) => {
    const entry: LogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    
    setLogs(prev => [...prev, entry]);
    onLog?.(entry);
  }, [onLog]);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    notification,
    logs,
    hasErrorLogs,
    errorCount,
    notify,
    addLog,
    clearLogs,
    dismissNotification,
  };
}