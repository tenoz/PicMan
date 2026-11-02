
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { X, Terminal, Copy, Trash2, AlertCircle, Info, CheckCircle, AlertTriangle, Download, Check } from 'lucide-react';
import { LogEntry } from '../types';
import { saveFile } from '../utils';
import { formatLogsAsText, logFileName } from '../utils/logFormat';

interface LogViewerProps {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

interface LogRowProps {
  log: LogEntry;
  copied: boolean;
  onCopy: () => void;
  colorClass: string;
  icon: React.ReactNode;
}

/** 单条日志：明细超过 3 行时默认折叠，点一下展开 */
const LogRow: React.FC<LogRowProps> = ({ log, copied, onCopy, colorClass, icon }) => {
  const detailLines = useMemo(() => (log.details ? log.details.split('\n').length : 0), [log.details]);
  const collapsible = detailLines > 3;
  const [expanded, setExpanded] = useState(!collapsible);

  return (
    <div className={`group p-1.5 rounded border flex gap-2 items-start ${colorClass}`}>
      <div className="mt-0.5 flex-shrink-0 opacity-70">{icon}</div>
      <div className="flex-1 break-all whitespace-pre-wrap min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 opacity-60 text-[9px] leading-none">
          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
          <span className="w-px h-2 bg-current opacity-30"></span>
          <span className="uppercase font-bold tracking-wider">{log.level}</span>
        </div>
        <div className="leading-snug">{log.message}</div>

        {log.details && (
          <>
            {!expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-1 text-[10px] px-1.5 py-0.5 rounded border border-current/30 opacity-70 hover:opacity-100 transition-opacity"
              >
                展开明细（{detailLines} 行）
              </button>
            )}
            {expanded && (
              <>
                <div className="mt-1 p-1 bg-black/5 dark:bg-white/5 rounded border border-black/5 dark:border-white/5 text-[9px] font-mono opacity-80 overflow-x-auto whitespace-pre max-h-64 overflow-y-auto">
                  {log.details}
                </div>
                {collapsible && (
                  <button
                    onClick={() => setExpanded(false)}
                    className="mt-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                  >
                    收起
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
        <button
          onClick={onCopy}
          className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          title="复制此条日志"
        >
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
};

export const LogViewer: React.FC<LogViewerProps> = ({ logs, isOpen, onClose, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** 日志分类：正常（info+success）/ 异常（warn）/ 错误（error） */
  const [tab, setTab] = useState<'normal' | 'warn' | 'error'>('normal');

  const counts = useMemo(() => {
    let normal = 0, warn = 0, error = 0;
    for (const l of logs) {
      if (l.level === 'warn') warn++;
      else if (l.level === 'error') error++;
      else normal++;
    }
    return { normal, warn, error };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (tab === 'warn') return logs.filter(l => l.level === 'warn');
    if (tab === 'error') return logs.filter(l => l.level === 'error');
    return logs.filter(l => l.level === 'info' || l.level === 'success');
  }, [logs, tab]);

  // 最新在前
  const displayLogs = useMemo(() => [...filteredLogs].reverse(), [filteredLogs]);

  // Auto-scroll to top when new logs arrive or filter changes (since newest are at top)
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, isOpen, tab]);

  if (!isOpen) return null;

  const generateLogText = () => {
    // Export all logs regardless of filter so full context is preserved
    return formatLogsAsText(logs);
  };

  const handleCopyAll = () => {
    const text = generateLogText();
    navigator.clipboard.writeText(text);
  };

  const handleExport = async () => {
    const text = generateLogText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    // 文件名用本地时间（以前用 toISOString 是 UTC，跟日志里的时间对不上）
    await saveFile(blob, logFileName('手动导出'));
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

        {/* Tabs：正常 / 异常 / 错误 */}
        <div className="flex px-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          {([
            { key: 'normal', label: '正常', count: counts.normal },
            { key: 'warn', label: '异常', count: counts.warn },
            { key: 'error', label: '错误', count: counts.error },
          ] as const).map((t) => {
            const active = tab === t.key;
            const activeColor = t.key === 'error'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : t.key === 'warn'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-brand-600 text-brand-600 dark:text-brand-400';
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  active ? activeColor : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
                <span className="tabular-nums text-[10px] px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  {t.count}
                </span>
              </button>
            );
          })}
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
              {tab === 'error'
                ? <CheckCircle size={32} strokeWidth={1} className="text-green-500/50" />
                : <Info size={32} strokeWidth={1} />}
              <p className="text-[10px]">
                {tab === 'normal' ? '暂无正常日志' : tab === 'warn' ? '没有警告' : '没有错误'}
              </p>
            </div>
          ) : (
            displayLogs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                copied={copiedId === log.id}
                onCopy={() => handleCopySingle(log)}
                colorClass={getColor(log.level)}
                icon={getIcon(log.level)}
              />
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
