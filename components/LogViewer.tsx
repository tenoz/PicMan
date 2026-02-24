
import React, { useRef, useEffect, useState } from 'react';
import { X, Terminal, Copy, Trash2, AlertCircle, Info, CheckCircle, AlertTriangle, Download, Check, Filter } from 'lucide-react';
import { LogEntry } from '../types';
import { saveFile } from '../utils';

interface LogViewerProps {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, isOpen, onClose, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false); // Default: Only show errors/warns

  const filteredLogs = showAll 
    ? logs 
    : logs.filter(l => l.level === 'error' || l.level === 'warn');
  
  // Sort logs: Newest first (reverse the array since logs are appended in App.tsx)
  const displayLogs = [...filteredLogs].reverse();

  // Auto-scroll to top when new logs arrive or filter changes (since newest are at top)
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, isOpen, showAll]);

  if (!isOpen) return null;

  const generateLogText = () => {
    // Export all logs regardless of filter so full context is preserved
    // Standard log export usually keeps chronological order (oldest first), which 'logs' already is.
    return logs.map(l => `[${new Date(l.timestamp).toLocaleString()}] [${l.level.toUpperCase()}] ${l.message} ${l.details ? `\nDetails: ${l.details}` : ''}`).join('\n\n');
  };

  const handleCopyAll = () => {
    const text = generateLogText();
    navigator.clipboard.writeText(text);
  };

  const handleExport = async () => {
    const text = generateLogText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await saveFile(blob, `picman_logs_${timestamp}.txt`);
  };

  const handleCopySingle = (log: LogEntry) => {
    const text = `[${new Date(log.timestamp).toLocaleString()}] [${log.level.toUpperCase()}] ${log.message} ${log.details || ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle size={13} className="text-red-500" />;
      case 'warn': return <AlertTriangle size={13} className="text-amber-500" />;
      case 'success': return <CheckCircle size={13} className="text-green-500" />;
      default: return <Info size={13} className="text-blue-500" />;
    }
  };

  const getColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30';
      case 'warn': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30';
      case 'success': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30';
      default: return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-gray-500 dark:text-gray-400" />
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200">运行日志</h3>
            <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full text-gray-500 dark:text-gray-400 font-mono">
              {filteredLogs.length} / {logs.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            
            {/* Filter Toggle */}
            <button 
                onClick={() => setShowAll(!showAll)}
                className={`px-2 py-1 text-[10px] rounded border transition-all flex items-center gap-1 font-medium ${
                    showAll 
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-800' 
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                }`}
                title={showAll ? "点击仅显示异常日志" : "点击显示所有日志"}
            >
                <Filter size={12} />
                {showAll ? '显示全部' : '仅看异常'}
            </button>

            <div className="w-px h-3 bg-gray-300 dark:bg-gray-700 mx-1"></div>

            <button 
              onClick={handleCopyAll}
              className="p-1.5 text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="复制全部日志 (包含隐藏)"
            >
              <Copy size={14} />
            </button>
            <button 
              onClick={handleExport}
              className="p-1.5 text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="导出日志为文件"
            >
              <Download size={14} />
            </button>
            <button 
              onClick={onClear}
              className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="清空日志"
            >
              <Trash2 size={14} />
            </button>
            <div className="w-px h-3 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <button 
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Log List */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50 dark:bg-black font-mono text-xs"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 opacity-50">
              <Terminal size={32} strokeWidth={1} />
              <p className="text-[10px]">暂无日志记录</p>
            </div>
          ) : filteredLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 opacity-50">
              <CheckCircle size={32} strokeWidth={1} className="text-green-500/50" />
              <p className="text-[10px]">一切正常 (无异常日志)</p>
              <button onClick={() => setShowAll(true)} className="text-[10px] text-brand-500 hover:underline">查看全部日志</button>
            </div>
          ) : (
            displayLogs.map((log) => (
              <div 
                key={log.id} 
                className={`group p-1.5 rounded border flex gap-2 items-start ${getColor(log.level)}`}
              >
                <div className="mt-0.5 flex-shrink-0 opacity-70">
                  {getIcon(log.level)}
                </div>
                <div className="flex-1 break-all whitespace-pre-wrap min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 opacity-60 text-[9px] leading-none">
                     <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                     <span className="w-px h-2 bg-current opacity-30"></span>
                     <span className="uppercase font-bold tracking-wider">{log.level}</span>
                  </div>
                  <div className="leading-snug">
                    {log.message}
                  </div>
                  {log.details && (
                    <div className="mt-1 p-1 bg-black/5 dark:bg-white/5 rounded border border-black/5 dark:border-white/5 text-[9px] font-mono opacity-80 overflow-x-auto whitespace-pre">
                      {log.details}
                    </div>
                  )}
                </div>
                {/* Single Copy Button */}
                <div className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                   <button 
                     onClick={() => handleCopySingle(log)}
                     className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                     title="复制此条日志"
                   >
                     {copiedId === log.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                   </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-800 text-[9px] text-gray-400 bg-white dark:bg-gray-900 rounded-b-xl flex justify-between shrink-0">
           <span>日志仅保存在本地内存中，刷新页面后消失</span>
           <span>PicMan Logger v1.0</span>
        </div>
      </div>
    </div>
  );
};
