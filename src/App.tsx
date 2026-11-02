
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ImportZone } from './components/ImportZone';
import { ConfigPanel } from './components/ConfigPanel';
import { VirtualFileList } from './components/VirtualFileList';
import { ProcessingBar } from './components/ProcessingBar';
import { LogViewer } from './components/LogViewer';
import { ThemeSwitch } from './components/ThemeSwitch';
import { NotificationStack, type AppNotification } from './components/NotificationStack';
import { useTaskBarDone } from './hooks/useTaskBarDone';
import { resolveBarState } from './utils/taskBar';
import { AppFile, ProcessingConfig, ProcessingReport, OutputFormat, LogEntry, LogLevel, SortOption } from './types';
import { DEFAULT_CONFIG, MAX_FILE_SIZE_MB, SUGGESTED_BATCH_LIMIT, PRESETS, APP_INFO } from './constants';
import { DEFAULT_RENAME_RULE, buildExportName } from './utils/rename';
import { generateId, loadFromStorage, saveToStorage, formatBytes, formatDurationCN, getStorageSize, saveFile, generateDummyImage, getWebGLMaxTextureSize, checkIsAnimated } from './utils';
import JSZip from 'jszip';

import { useExport } from './hooks/useExport';
import { useProcessing } from './hooks/useProcessing';
import { Play, Pause, Download, Trash2, AlertOctagon, X, Info, Eye, Database, Plus, ChevronDown, Check, FolderInput, FilePlus, Archive, Layers, Folder, Command, Loader2, Zap, Aperture, ScrollText, FlaskConical, MonitorSmartphone, MemoryStick, Volume2, VolumeX } from 'lucide-react';
import { playSuccessSound, playPauseSound } from './utils/sound';
import { readImageSize } from './utils/imageSize';
import { describeImportStatus, isDuplicateBatch, nextImportProgress } from './utils/importStatus';
import { normalizeThemeMode, resolveIsDark, type ThemeMode } from './utils/theme';
import { appendLogsToDailyFile, resetAutoLogCursor } from './services/autoLog';
import { pruneOldWorkspaces, readBlobFromPath } from './services/workspace';
import { mimeOf } from './utils/mime';
import { fileKey } from './utils/fileKey';
import { attachSrcPath } from './utils/fileSrcPath';
import { describeProcessingConfig } from './utils/configDescription';

// --- 模块级纯函数与常量（放组件外，保证引用稳定，列表 memo 才生效） ---

const MAX_LOG_ENTRIES = 2000;

const getFileExtension = (filename: string): string => {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
};

const getExtensionFromMime = (mime: string) => {
    switch(mime) {
        case 'image/png': return 'png';
        case 'image/webp': return 'webp';
        case 'image/gif': return 'gif';
        case 'image/bmp': return 'bmp';
        default: return 'jpg';
    }
};

const sortFileList = (list: AppFile[], method: SortOption): AppFile[] => {
  const sorted = [...list];
  switch (method) {
    case 'time_desc':
      return sorted.sort((a, b) => b.importedAt - a.importedAt);
    case 'time_asc':
      return sorted.sort((a, b) => a.importedAt - b.importedAt);
    case 'name_asc':
      return sorted.sort((a, b) => a.file.name.localeCompare(b.file.name));
    case 'name_desc':
      return sorted.sort((a, b) => b.file.name.localeCompare(a.file.name));
    case 'size_asc':
      return sorted.sort((a, b) => a.originalSize - b.originalSize);
    case 'size_desc':
      return sorted.sort((a, b) => b.originalSize - a.originalSize);
    case 'type_asc':
      return sorted.sort((a, b) => getFileExtension(a.file.name).localeCompare(getFileExtension(b.file.name)));
    case 'type_desc':
      return sorted.sort((a, b) => getFileExtension(b.file.name).localeCompare(getFileExtension(a.file.name)));
    default:
      return sorted;
  }
};

/** 桌面端目录选择框（避免为它新增 @ts-ignore） */
type TauriOpenDialog = (options: {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
}) => Promise<string | string[] | null>;

const getTauriOpenDialog = (): TauriOpenDialog | undefined =>
  (window as unknown as { __TAURI__?: { dialog?: { open?: TauriOpenDialog } } }).__TAURI__?.dialog?.open;

/**
 * 面型「停止」图标：实心圆 + 镂空方块。
 * lucide 的 Square / CircleStop 都是描边风格，小尺寸下看着像个空心口，故手绘一个。
 */
const StopIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.2 7h6.4c.44 0 .8.36.8.8v4.4c0 .44-.36.8-.8.8H8.8a.8.8 0 0 1-.8-.8V9.8c0-.44.36-.8.8-.8Z"
    />
  </svg>
);


function App() {
  // --- State ---
  /**
   * 外观三态：跟随系统 / 始终亮 / 始终暗（2026-11-02）。
   * 老版本 localStorage.theme 只有 'light' | 'dark'，normalize 后会原样保留，人的选择不丢。
   * 新装默认 'system'——系统是深色的用户一打开就该是深色。
   */
  const [theme, setTheme] = useState<ThemeMode>(() =>
    normalizeThemeMode(loadFromStorage<unknown>('theme', 'system')),
  );
  /** 系统当前是不是深色。只在 theme === 'system' 时才被采纳 */
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [files, setFiles] = useState<AppFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('time_desc');
  
  // Load config with migration check for deprecated formats
  const [config, setConfig] = useState<ProcessingConfig>(() => {
    const loaded = loadFromStorage('lastConfig', DEFAULT_CONFIG);
    // Migration: If legacy 'image/avif' is found, fallback to jpeg since avif is removed.
    if ((loaded.format as string) === 'image/avif') {
        loaded.format = 'image/jpeg';
    }
    // Migration: Ensure preventSizeInflation exists
    if (loaded.preventSizeInflation === undefined) {
        loaded.preventSizeInflation = true;
    }
    // Migration: 旧配置没有体积策略，默认严格（变大就回退）
    if (loaded.sizeInflationPolicy === undefined) {
        loaded.sizeInflationPolicy = 'always';
    }
    // Migration: 打包方式与分组
    if (loaded.zipEngine === undefined) {
        loaded.zipEngine = 'builtin';
    }
    if (loaded.zipLayout === undefined) {
        loaded.zipLayout = 'single';
    }
    if (loaded.importConcurrency === undefined) {
        loaded.importConcurrency = 6;
    }
    // Migration: JPEG 编码引擎 / PNG 重压档位。
    // 2026-10-31：实测原生 JPEG 慢 16 倍、oxipng -o2 慢 30 倍，默认值全部退回"快"。
    // 以 pngOptimize 是否缺失作为一次性迁移标记——老配置（包括昨天被写成 native 的）统一重置一次，
    // 之后用户手动切的选择不会再被覆盖。
    if (loaded.pngOptimize === undefined) {
        loaded.pngOptimize = 'off';
        loaded.jpegEngine = 'builtin';
    }
    if (loaded.jpegEngine === undefined) {
        loaded.jpegEngine = 'builtin';
    }
    if (loaded.jpegLevel === undefined) {
        loaded.jpegLevel = 'balanced';
    }
    // Migration: 旧的「文件名后缀」→ 完整重命名规则
    if (loaded.renameRule === undefined) {
        loaded.renameRule = {
            ...DEFAULT_RENAME_RULE,
            suffix: loaded.filenameSuffix ?? '',
        };
    } else {
        // 已有规则可能来自加字段之前的版本，缺的键用默认值补齐
        loaded.renameRule = { ...DEFAULT_RENAME_RULE, ...loaded.renameRule };
    }
    return loaded;
  });
  
  // 处理状态：统一读 useProcessing 的返回值，组件内不再另存一份
  // （原先的 isProcessing/isPaused/processingProgress 三个 state 从未被置 true，导致进度区永不显示）
  const [procStats, setProcStats] = useState<{ done: number; total: number; current?: string }>({
    done: 0,
    total: 0,
  });
  const procStartedAtRef = useRef<number | null>(null);
  /**
   * 三条进度栏（导入 / 处理 / 导出）的完成态，共用一套状态机。
   * 任务结束时 finish 一条快照，停在完成态；任一操作开始时 clearAll。
   */
  const taskBars = useTaskBarDone();
  /** 稳定引用的 clearAll：下面的 useCallback 直接依赖 taskBars 对象会每次重建 */
  const clearTaskBars = taskBars.clearAll;
  /**
   * 处理批次作废标记：点终止时置 true。
   * cancel 只是不再派新任务，**已经在跑的那几张会继续跑完**并回调 onTaskComplete，
   * 不挡住的话会把旧格式（比如 PNG）的产物写回列表，出现"终止后列表还有上一轮结果"。
   */
  const procCanceledRef = useRef(false);
  /** 进度/当前文件名的高频回调节流，避免每张图都让整个 App 重渲染 */
  const procProgressTickRef = useRef(0);
  const procProgressTimerRef = useRef<number | null>(null);
  const procProgressPendingRef = useRef<{ done: number; total: number } | null>(null);
  const procNameTickRef = useRef(0);
  const procCurrentNameRef = useRef('');

  // 文件列表的 ref 镜像：导入去重要用"最新"列表，不能依赖闭包里可能已过期的 files
  const filesRef = useRef<AppFile[]>([]);
  useEffect(() => { filesRef.current = files; }, [files]);
  // 正在导入中的去重键，防止同一批文件被并发导入两次
  const importInflightKeys = useRef(new Set<string>());
  // 当前这一批的**完整**键集：并发触发时第二路立刻就能认出来是同一批
  const importBatchKeys = useRef(new Set<string>());
  // 导入串行化：并发触发时排队，而不是让两路同时改列表
  const importingRef = useRef(false);
  const importQueueRef = useRef<File[]>([]);
  /**
   * Tauri 拖放的入口去重：同一次拖放会触发两次 `tauri://file-drop`（原生事件重复投递），
   * 两路都会完整读一遍磁盘，还会各自把自己的 `doneCount` 写进同一组进度状态——
   * 表现就是**导入进度条来回伸缩**（2026-11-02 老大实测）。
   * 这里按路径指纹挡住第二条：整条链路跑完才放开，中途任何 return 都由 finally 兜住。
   */
  const dropFingerprintRef = useRef('');
  const dropBusyRef = useRef(false);

  // 处理期间的列表更新攒批：100ms 合并一次，避免"每完成一张就全量 map 一遍"
  const pendingPatches = useRef(new Map<string, Partial<AppFile>>());
  const flushTimer = useRef<number | null>(null);
  const sessionBytesRef = useRef({ original: 0, processed: 0 });
  // 逐张处理明细先攒着，批次结束写一条可展开的汇总，避免上千条日志刷屏
  const batchDetailRef = useRef<string[]>([]);
  /** 跳过原因要分开记：动图 vs 处理后反而变大，两者的处理建议完全不同 */
  const animatedSkippedRef = useRef<string[]>([]);
  const inflationSkippedRef = useRef<string[]>([]);

  const patchFile = useCallback((id: string, patch: Partial<AppFile>) => {
    const merged = { ...(pendingPatches.current.get(id) ?? {}), ...patch };
    pendingPatches.current.set(id, merged);
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      const batch = pendingPatches.current;
      pendingPatches.current = new Map();
      if (batch.size === 0) return;
      setFiles(prev => prev.map(f => {
        const p = batch.get(f.id);
        return p ? { ...f, ...p } : f;
      }));
    }, 100);
  }, []);
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importDone, setImportDone] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importCurrentName, setImportCurrentName] = useState('');
  const [isImportPaused, setIsImportPaused] = useState(false);

  /**
   * 导入进度与计数的「地板」。
   *
   * Tauri 拖放会同时走两路，每路各有自己的 `doneCount`，交替写同一组数字。
   * 后一路从 0 开始跑，就把前一路推到 95% 的条拉回去——表现是**进度条来回伸缩**
   * （2026-11-02 老大实测）。所以这里只允许往前走，往回的一律丢掉。
   * 归零只能走 `resetImportProgress`，它会把地板一起放下来，否则下批永远卡在 100。
   */
  const importProgressFloorRef = useRef(0);
  const importDoneFloorRef = useRef(0);
  const pushImportProgress = useCallback((next: number) => {
    const v = nextImportProgress(importProgressFloorRef.current, next);
    if (v === importProgressFloorRef.current) return;
    importProgressFloorRef.current = v;
    setImportProgress(v);
  }, []);
  const pushImportDone = useCallback((next: number) => {
    const v = Math.max(0, Math.round(next));
    if (v <= importDoneFloorRef.current) return;
    importDoneFloorRef.current = v;
    setImportDone(v);
  }, []);
  const resetImportProgress = useCallback(() => {
    importProgressFloorRef.current = 0;
    importDoneFloorRef.current = 0;
    setImportProgress(0);
    setImportDone(0);
  }, []);
  
  // Zipping State - P0: 使用 useExport hook，不再需要本地状态
  // const [isZipping, setIsZipping] = useState(false);
  // const [zipProgress, setZipProgress] = useState(0);

  // Download State
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  /** 正在导出的文件名：进度栏第二行显示，避免用户只看到百分比 */
  const [exportCurrentName, setExportCurrentName] = useState('');
  /** 导出进度节流时间戳 */
  const exportTickRef = useRef(0);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  // 暂停状态只有一个源头：useExport 的 isDownloadPaused（解构名 hookIsDownloadPaused）。
  // 这里曾有一个同名本地 state，全项目没人 set 过，导致按钮永远显示「暂停」（2026-10-31 B5）

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  /** 通知 id 自增：原来用 Date.now()，同一毫秒发两条会撞成同一个 id */
  const notificationSeqRef = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => loadFromStorage('picman_sound_enabled', true));
  const [skippedFiles, setSkippedFiles] = useState<{name: string, reason: string}[]>([]);
  
  // Info Modal State
  const [showInfo, setShowInfo] = useState(false);
  const [infoTab, setInfoTab] = useState<'about' | 'testing'>('about');
  
  // Test Tab State
  const [testSettings, setTestSettings] = useState({ count: 50, resolution: 1024 });
  const [browserCaps, setBrowserCaps] = useState<{ cores: number, maxTexture: number }>({ cores: 0, maxTexture: 0 });

  // Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  /** 最新日志快照：addLog 里同步维护，落盘直接读它 */
  const logsRef = useRef<LogEntry[]>([]);
  /** 把本次新增的日志追加到当天的日志文件（桌面端），一天一个文件 */
  const persistLogs = useCallback((title: string) => {
    void appendLogsToDailyFile(logsRef.current, title).then((path) => {
      if (path) console.info('[AutoLog] 日志已追加:', path);
    });
  }, []);

  // Processing Control Refs
  const stopDownloadRef = useRef(false);
  const pauseDownloadRef = useRef(false);
  const stopImportRef = useRef(false);
  const pauseImportRef = useRef(false);
  // 导入批次令牌：点「停止」时自增，正在读盘的批次据此判断自己已作废。
  // 只靠 stopImportRef 不行——handleFilesAdded 的 finally 会把它复位（2026-10-31 B2）
  const importRunIdRef = useRef(0);
  // 最近一个开始读取的文件名：并发下只留最后一个，避免每张都 setState
  const importCurrentNameRef = useRef('');
  const stopZipRef = useRef(false);
  const pauseZipRef = useRef(false);
  
  // Preview State
  const [previewFile, setPreviewFile] = useState<AppFile | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  
  const [storageSize, setStorageSize] = useState(0);
  
  // Hidden Input Refs
  const addFilesInputRef = useRef<HTMLInputElement>(null);
  const addFolderInputRef = useRef<HTMLInputElement>(null);

  // 初始化导出 hook (渐进式迁移 P0)
  const {
    isExporting: hookIsExporting,
    isZipping: hookIsZipping,
    isZipPaused: hookIsZipPaused,
    isDownloadPaused: hookIsDownloadPaused,
    zipProgress: hookZipProgress,
    zipDetail: hookZipDetail,
    exportProgress: hookExportProgress,
    exportToZip,
    exportToDirectory,
    cancelExport,
    cancelZip,
    toggleZipPause,
    toggleDownloadPause,
    terminateZip,
    terminateDownload,
  } = useExport({
    // 完整重命名规则；老配置没有这个字段时 loadConfig 已按 filenameSuffix 迁移过
    renameRule: config.renameRule ?? DEFAULT_RENAME_RULE,
    exportMode: config.exportMode,
    flattenExport: config.flattenExport,
    onExportStart: (count) => {
      // 新任务开始：三条完成态一起清，旧结论不许留在新任务旁边
      taskBars.clearAll();
      addLog(`开始导出 ${count} 个文件...`, 'info', '导出');
      setFailedFiles([]);
    },
    onExportProgress: (current, total, fileName) => {
      // 节流 80ms，最后一个文件必刷（否则进度停在 99%）
      const now = Date.now();
      if (current < total && now - exportTickRef.current < 80) return;
      exportTickRef.current = now;
      setDownloadProgress({ current, total });
      if (fileName) setExportCurrentName(fileName);
    },
    onExportComplete: (stats) => {
      const elapsed = stats.elapsedMs !== undefined ? ` · 耗时 ${(stats.elapsedMs / 1000).toFixed(1)}s` : '';
      const msg = `导出完成 · 成功 ${stats.success}${stats.failed > 0 ? ` · 失败 ${stats.failed}` : ''}${elapsed}`;
      addLog(
        msg,
        stats.failed > 0 ? 'warn' : 'success'
      );
      // 导出必须落盘：只写内存的话，出问题时日志文件里一个字都查不到
      // （2026-11-01 排查「打包没生成 zip」时就卡在这里，日志里完全没有导出记录）
      persistLogs(msg);
      // 导出没有「跳过」概念，skipped 不传，完成态那一行就不出现「跳过 0」
      taskBars.finish('export', {
        success: stats.success,
        failed: stats.failed,
        elapsedMs: stats.elapsedMs ?? 0,
      });
    },
    onExportError: (error) => {
      addLog('导出失败', 'error', error.message);
      persistLogs(`导出失败 · ${error.message}`);
    },
    // 打包关键事实（引擎 / 输出目录 / 实际写出的路径与大小）——全部进运行日志
    onExportNotice: (message, level = 'info') => addLog(message, level, '导出'),
    /*
      打包完成后直接把**文件名**报出来。
      长包名 + 结尾的 _1/_2，在 Finder 里看着和上一个一模一样，
      用户会以为没导出（2026-11-01 老大翻目录翻半天，其实三个包都在）。
    */
    onZipFilesWritten: (paths) => {
      if (paths.length === 0) return;
      const names = paths.map(p => p.split('/').pop() || p);
      showNotification(
        names.length === 1
          ? `已生成 ${names[0]}`
          : `已生成 ${names.length} 个压缩包：${names.slice(0, 2).join('、')}${names.length > 2 ? '…' : ''}`,
        'success',
        '导出',
      );
    },
  });

  // 初始化处理 hook (渐进式迁移 P0)
  const {
    isProcessing: hookIsProcessing,
    isPaused: hookIsPaused,
    progress: hookProcessingProgress,
    processFiles: hookProcessFiles,
    processSingle: hookProcessSingle,
    pause: hookPause,
    resume: hookResume,
    cancel: hookCancel,
    clearWorkspace: hookClearWorkspace,
  } = useProcessing({
    config,
    concurrency: config.concurrency || 2,
    onTaskStart: (file: AppFile) => {
      // 终止后仍在飞的任务：只丢掉它的回调，别把旧格式的结果写回列表
      if (procCanceledRef.current) return;
      patchFile(file.id, { status: 'processing', errorMessage: undefined, isSkipped: false });
      procCurrentNameRef.current = file.file.name;
      // 当前文件名节流 150ms：连续 1000 张时每张都 setState 会把主线程压满
      const now = Date.now();
      if (now - procNameTickRef.current > 150) {
        procNameTickRef.current = now;
        setProcStats(prev => ({ ...prev, current: file.file.name }));
      }
      if (procStartedAtRef.current === null) procStartedAtRef.current = Date.now();
    },
    onTaskComplete: (file: AppFile) => {
      if (procCanceledRef.current) return;
      patchFile(file.id, file);
      sessionBytesRef.current.original += file.originalSize;
      sessionBytesRef.current.processed += file.processedSize ?? 0;
      if (file.isSkipped) {
        // isSkipped 有两个来源：真·动图，以及处理后反而变大被「严格跳过」挡回来。
        // 原来两种都写成"检测到动态图片"，jpg 被说成动图，连排查方向都带偏过一次（2026-11-01）。
        if (file.inflation) {
          inflationSkippedRef.current.push(`${file.file.name} +${file.inflation.deltaPercent}%`);
        } else {
          animatedSkippedRef.current.push(file.file.name);
        }
      } else {
        // 汇总到批次明细里，不逐张写日志（上千张会把日志页刷满、导出文件几 MB）
        const note = file.inflation ? ` · 体积会增 ${file.inflation.deltaPercent}% 已保留原图` : '';
        batchDetailRef.current.push(
          `${file.file.name} · ${formatBytes(file.processedSize || 0)} · ${(file.processingTime || 0).toFixed(0)}ms${note}`
        );
      }
    },
    onTaskError: (file: AppFile, error: Error) => {
      if (procCanceledRef.current) return;
      patchFile(file.id, { status: 'error', errorMessage: error.message });
      addLog(`处理失败: ${file.file.name}`, 'error', `Error: ${error.message}`);
    },
    onProgress: (completed: number, total: number, force?: boolean) => {
      if (procCanceledRef.current) return;
      const push = (done: number, ttl: number) => {
        setProcStats(prev => ({ ...prev, done, total: ttl, current: procCurrentNameRef.current || prev.current }));
      };
      // 暂停/结束时的补刷：直接写，绕过节流
      if (force) {
        procProgressPendingRef.current = null;
        push(completed, total);
        return;
      }
      const now = Date.now();
      if (completed >= total || now - procProgressTickRef.current >= 100) {
        procProgressTickRef.current = now;
        procProgressPendingRef.current = null;
        push(completed, total);
        return;
      }
      // 节流窗口内：记下最新值，窗口结束时补发。
      // 只丢弃不补发的话，暂停那一刻的计数就永久丢了（进度停在 1/12 而列表已完成 2 张）
      procProgressPendingRef.current = { done: completed, total };
      if (procProgressTimerRef.current === null) {
        procProgressTimerRef.current = window.setTimeout(() => {
          procProgressTimerRef.current = null;
          const pending = procProgressPendingRef.current;
          procProgressPendingRef.current = null;
          if (pending && !procCanceledRef.current) {
            procProgressTickRef.current = Date.now();
            push(pending.done, pending.total);
          }
        }, 100);
      }
    },
    onAllComplete: (stats: { success: number; failed: number; skipped: number }) => {
      if (procCanceledRef.current) return;
      // 耗时基准必须与 procStartedAtRef 一致（都是 Date.now）。混用 performance.now() 会算出负数
      const elapsedMs = procStartedAtRef.current ? Date.now() - procStartedAtRef.current : 0;
      procStartedAtRef.current = null;

      // 完成态快照：停在进度栏里给用户一个结论，直到下一次操作开始
      taskBars.finish('process', {
        success: stats.success,
        skipped: stats.skipped,
        failed: stats.failed,
        elapsedMs,
      });

      // 汇总日志：一次操作只留一条可回溯的记录
      const { original, processed } = sessionBytesRef.current;
      const savedPercent = original > 0 ? Math.round(((original - processed) / original) * 100) : 0;
      const sizeSummary = original > 0
        ? ` · ${formatBytes(original)} → ${formatBytes(processed)}（${savedPercent >= 0 ? '-' : '+'}${Math.abs(savedPercent)}%）`
        : '';
      // 跳过原因分类汇总（原来逐张写 warn，1872 张就是把日志刷成 960KB）
      const skipParts: string[] = [];
      if (animatedSkippedRef.current.length > 0) {
        skipParts.push(`动图 ${animatedSkippedRef.current.length} 张：为保留动效直接输出原文件`);
      }
      if (inflationSkippedRef.current.length > 0) {
        const preview = inflationSkippedRef.current.slice(0, 10).join('、');
        const more = inflationSkippedRef.current.length > 10
          ? ` 等共 ${inflationSkippedRef.current.length} 张`
          : '';
        skipParts.push(`处理后反而变大、已保留原图 ${inflationSkippedRef.current.length} 张：${preview}${more}`);
      }

      const detailParts: string[] = [];
      if (batchDetailRef.current.length > 0) {
        detailParts.push(`${batchDetailRef.current.length} 张明细（文件名 · 体积 · 耗时）：\n${batchDetailRef.current.join('\n')}`);
      }
      if (skipParts.length > 0) detailParts.push(skipParts.join('；'));

      addLog(
        `批量处理完成 · 成功 ${stats.success} · 跳过 ${stats.skipped} · 失败 ${stats.failed} · 耗时 ${(elapsedMs / 1000).toFixed(1)}s${sizeSummary}`,
        stats.failed > 0 ? 'warn' : 'success',
        detailParts.length > 0 ? detailParts.join('\n\n') : undefined
      );
      batchDetailRef.current = [];
      animatedSkippedRef.current = [];
      inflationSkippedRef.current = [];

      if (stats.skipped > 0 || stats.failed > 0) {
        showNotification(`处理完成：${stats.success}成功，${stats.skipped}跳过，${stats.failed}失败`, stats.failed > 0 ? 'warn' : 'success', '处理');
      } else {
        showNotification('处理完成！', 'success', '处理');
      }
      if (soundEnabled) playSuccessSound();

      // 只在处理完成时落一份：追加到当天日志文件，不生成新文件
      persistLogs(`批量处理完成 · 成功 ${stats.success} · 跳过 ${stats.skipped} · 失败 ${stats.failed}`);
    }
  });

  // 处理相关状态：全部来自 useProcessing，组件内不做第二份副本
  const isProcessing = hookIsProcessing;
  const isPaused = hookIsPaused;
  const processingProgress = hookProcessingProgress;

  // --- Effects ---
  // 跟随系统：系统在设置里切深浅色时，界面要当场变，不用重启
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 实际用不用暗色只在 resolveIsDark 一处算，挂 class 和顶栏图标都读它
  const isDark = resolveIsDark(theme, systemPrefersDark);

  useEffect(() => {
    // 挂在 <html> 上：body 里的浮层、portal 全都在它下面，一处挂全都能命中。
    // 首屏那一下由 index.html 的内联脚本提前设好，避免深色系统用户看到白闪。
    document.documentElement.classList.toggle('dark', isDark);
    saveToStorage('theme', theme);
  }, [isDark, theme]);

  useEffect(() => {
    saveToStorage('picman_sound_enabled', soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const success = saveToStorage('lastConfig', config);
    if (!success) {
        showNotification("配置未保存: 本地存储空间已满 (可能水印图过大)", 'error', '配置');
        addLog("无法保存配置到本地存储，可能是水印图片过大或配额不足", "warn");
    }
  }, [config]);

  // Update storage size when info modal opens
  useEffect(() => {
    if (showInfo) {
      setStorageSize(getStorageSize());
    }
  }, [showInfo, config, theme]);

  // Check browser caps
  useEffect(() => {
    setBrowserCaps({
        cores: navigator.hardwareConcurrency || 1,
        maxTexture: getWebGLMaxTextureSize()
    });
  }, []);

  // Handle Preview URL creation
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    const resolvePreview = async () => {
        if (!previewFile) {
            setActivePreviewUrl(null);
            return;
        }

        // 处理结果：内存里有 Blob 直接用（浏览器环境）；
        // 桌面端产物只在磁盘上，读回一张用完就扔，不常驻内存
        if (previewFile.status === 'success') {
            if (previewFile.processedBlob) {
                url = URL.createObjectURL(previewFile.processedBlob);
                setActivePreviewUrl(url);
                return;
            }
            if (previewFile.processedPath) {
                const blob = await readBlobFromPath(previewFile.processedPath, mimeOf(previewFile));
                // 读的时候用户可能已经关了预览 —— 先判再赋值，别把已经 cleanup 的 url 漏掉
                if (cancelled) return;
                if (blob) {
                    url = URL.createObjectURL(blob);
                    setActivePreviewUrl(url);
                    return;
                }
            }
            // 读不回来（临时目录被清过）就往下走，退回原图
        }

        // If it's an animated file, the stored previewUrl is static.
        // For the full preview modal, we want to show the REAL file (animation).
        if (previewFile.isAnimated) {
            url = URL.createObjectURL(previewFile.file);
            setActivePreviewUrl(url);
        } else {
            setActivePreviewUrl(previewFile.previewUrl);
        }
    };

    void resolvePreview();

    return () => {
        cancelled = true;
        if (url) URL.revokeObjectURL(url);
    };
  }, [previewFile]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        // Select all currently loaded files
        setSelectedIds(new Set(files.map(f => f.id)));
      }
      if (e.key === 'Escape') {
        if (previewFile) {
             setPreviewFile(null);
        } else if (showInfo) {
             setShowInfo(false);
        } else if (showLogs) {
             setShowLogs(false);
        } else {
             // Menu closed
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewFile, files, showInfo, showLogs]);



  // --- Window Close / Exit Handling ---
  // Check if there are pending tasks (imported but not processed, or processed but not exported)
  const hasPendingTasks = useMemo(() => {
    const hasUnprocessed = files.some(f => f.status === 'idle' || f.status === 'processing');
    const hasUnexported = files.some(f => f.status === 'success' && f.processedBlob);
    return hasUnprocessed || hasUnexported;
  }, [files]);

  // Handle Cmd+Q and exit requests from Tauri
  useEffect(() => {
    const setupExitListener = async () => {
      // @ts-ignore
      const tauri = window.__TAURI__;
      if (!tauri?.event) return;

      const { listen } = tauri.event;
      const { confirm } = tauri.dialog;
      
      // Listen for exit request from Tauri backend
      const unlisten = await listen('app-exit-requested', async () => {
        if (hasPendingTasks) {
          // Use Tauri's dialog API instead of browser confirm
          const confirmed = await confirm('您有未完成的任务：\n\n' +
            '• 部分文件尚未转换\n' +
            '• 部分文件尚未导出\n\n' +
            '确定要退出应用吗？', 
            { title: '确认退出', type: 'warning' }
          );
          
          if (confirmed) {
            // User confirmed exit - actually exit the app
            // @ts-ignore
            await tauri.process.exit(0);
          }
          // If not confirmed, do nothing and app keeps running
        } else {
          // No pending tasks - exit immediately
          // @ts-ignore
          await tauri.process.exit(0);
        }
      });

      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupExitListener().then(fn => { unlistenFn = fn; });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [hasPendingTasks]);


  // --- Helpers ---
  /**
   * 发一条提示。
   *
   * 留最近 50 条上限：警告和错误是常驻的（不自动消失），挂一天不关就会越积越多。
   * 超过上限的本来也被折叠在「还有 N 条」里，丢掉最旧的不会让人漏看新消息。
   */
  const showNotification = (msg: string, type: AppNotification['type'], task?: string) => {
    const id = ++notificationSeqRef.current;
    setNotifications(prev => [...prev, { id, msg, type, timestamp: Date.now(), task }].slice(-50));
  };

  /**
   * 关掉一条。**必须是稳定引用**：NotificationCard 的自动消失计时器把它写进 effect 依赖，
   * 每次渲染换新函数的话计时器会被反复重置，3.5 秒永远走不完。
   */
  const dismissNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAllNotifications = useCallback(() => setNotifications([]), []);

  // --- 导入/导出控制函数 ---
  const toggleImportPause = () => {
    if (isImportPaused) {
      pauseImportRef.current = false;
      setIsImportPaused(false);
    } else {
      pauseImportRef.current = true;
      setIsImportPaused(true);
    }
  };

  const terminateImport = () => {
    stopImportRef.current = true;
    pauseImportRef.current = false; // 解除暂停以便退出
    importRunIdRef.current += 1; // 作废正在读盘的批次
    setIsImportPaused(false);
  };

  const addLog = useCallback((message: string, level: LogLevel = 'info', details?: string) => {
    const entry: LogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    // 同步维护快照：日志落盘紧跟在 addLog 后面，等 React 渲染再更新 ref 会漏掉最后一条
    const next = logsRef.current.length >= MAX_LOG_ENTRIES
      ? [...logsRef.current.slice(logsRef.current.length - MAX_LOG_ENTRIES + 1), entry]
      : [...logsRef.current, entry];
    logsRef.current = next;
    setLogs(next);
  }, []);

  const handleClearCache = (type: 'config' | 'all') => {
    // 1. Calculate size BEFORE clearing
    const sizeBefore = getStorageSize();

    if (type === 'config') {
      localStorage.removeItem('lastConfig');
      setConfig(DEFAULT_CONFIG);
      addLog('用户重置了全局配置', 'info');
    } else if (type === 'all') {
      localStorage.clear();
      setConfig(DEFAULT_CONFIG);
      // 清缓存要把外观也还原成出厂默认：跟随系统，不是硬钉成亮色
      setTheme('system');
      addLog('用户清空了所有本地缓存', 'warn');
    }

    // 2. Wait for React effects to run and re-save the default values (persistence)
    // This ensures we measure the STABLE size after reset.
    setTimeout(() => {
        const sizeAfter = getStorageSize();
        setStorageSize(sizeAfter); // Update UI
        
        const freed = Math.max(0, sizeBefore - sizeAfter);
        
        if (freed > 1024) { // Only show if freed > 1KB
            showNotification(`已重置，释放了 ${formatBytes(freed)} 空间`, 'success', '配置');
        } else {
            showNotification('已重置为默认设置 (空间占用极低)', 'success', '配置');
        }
    }, 100);
  };

  const handleSortChange = useCallback((method: SortOption) => {
    setSortOption(method);
    setFiles(prev => sortFileList(prev, method));
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handlePreview = useCallback((file: AppFile) => {
    setPreviewFile(file);
  }, []);

  // --- Handlers ---

  const handleFilesAdded = async (newFiles: File[], opts?: { keepProgress?: boolean }) => {
    if (newFiles.length === 0) return;

    // 并发导入守卫：
    //   · 同一批被重复触发（Tauri 拖放会同时走 DOM drop 与原生事件）→ 忽略
    //   · 内容不同的批次 → 排队串行处理，避免两路并发各自用旧列表覆盖掉对方
    if (importingRef.current) {
      const sameBatch = newFiles.every(f => importBatchKeys.current.has(fileKey(f)));
      if (sameBatch) {
        addLog(`忽略重复的导入触发：${newFiles.length} 个文件正在导入中`, 'info');
        return;
      }
      importQueueRef.current.push(...newFiles);
      addLog(`${newFiles.length} 个文件已排队，等待当前导入结束`, 'info');
      return;
    }
    importingRef.current = true;
    importBatchKeys.current = new Set(newFiles.map(fileKey));
    // 记下进入时的批次令牌：运行中被「终止」会推进它，这批读到的文件一律作废
    const runId = importRunIdRef.current;

    try {

    if (!opts?.keepProgress) {
      stopImportRef.current = false;
    }
    pauseImportRef.current = false;
    // 新任务开始：三条完成态一起清
    taskBars.clearAll();
    setIsImporting(true);
    const progressBase = opts?.keepProgress ? 95 : 0;
    const progressSpan = opts?.keepProgress ? 5 : 100;
    // 80ms 节流：每 2 张就 setImportProgress 的话，1000 张会产生 500 次整页渲染
    let lastReportAt = 0;
    const reportProgress = (index: number) => {
      const now = Date.now();
      if (now - lastReportAt < 80 && index < totalCount - 1) return;
      lastReportAt = now;
      pushImportProgress(progressBase + ((index + 1) / totalCount) * progressSpan);
    };
    if (!opts?.keepProgress) {
      resetImportProgress();
    }

    const processedFiles: AppFile[] = [];
    const newSkipped: {name: string, reason: string}[] = [];
    const timestamp = Date.now();
    const importT0 = performance.now();
    const totalCount = newFiles.length;

    let totalAddedSize = 0;
    let hasAnimated = false;

    // 去重键一次性建好：既避免每条都 files.some（O(n·m)），也能挡住同批次里的重复
    // 同时并入"正在进行的导入"的键——Tauri 拖放会同时触发 DOM drop 与原生事件，
    // 两路并发进来时共享同一个 Set 才不会各自导入一遍
    const dedupeKeys = new Set(filesRef.current.map(f => fileKey(f.file)));
    for (const k of importInflightKeys.current) dedupeKeys.add(k);

    for (const [index, f] of newFiles.entries()) {
      // 终止检查
      if (stopImportRef.current) break;

      // 暂停等待
      if (pauseImportRef.current) {
        await new Promise<void>(resolve => {
          const check = setInterval(() => {
            if (!pauseImportRef.current || stopImportRef.current) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        });
        if (stopImportRef.current) break;
      }

      // 1. Silent Ignore for system files
      if (f.name === '.DS_Store' || f.name === 'Thumbs.db') {
        reportProgress(index);
        continue;
      }

      // Dedupe Logic:
      const key = fileKey(f);
      if (dedupeKeys.has(key)) {
        newSkipped.push({ name: f.name, reason: '文件已存在' });
        reportProgress(index);
        continue;
      }
      dedupeKeys.add(key);
      importInflightKeys.current.add(key);
      
      // Size check
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        newSkipped.push({ name: f.name, reason: '超过大小限制' });
        reportProgress(index);
        continue;
      }

      let previewUrl = "";
      try {
        // Check for animation
        const isAnimated = await checkIsAnimated(f);
        if (isAnimated) hasAnimated = true;

        previewUrl = URL.createObjectURL(f);

        // 只读文件头拿宽高：不解码、不生成缩略图。
        // 缩略图是整个导入阶段最后一笔开销，去掉后每张只剩一次 64KB 读取。
        const dimensions = (await readImageSize(f)) ?? { width: 0, height: 0 };

        processedFiles.push({
          id: generateId(),
          file: f,
          previewUrl, // 原图 blob URL：预览弹窗与处理管线共用
          status: 'idle',
          originalSize: f.size,
          dimensions,
          // Slight offset to ensure stable sort for batch import
          importedAt: timestamp + index,
          isAnimated: isAnimated
        });
        totalAddedSize += f.size;
      } catch (e) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        newSkipped.push({ name: f.name, reason: '文件损坏或无法读取' });
        addLog(`文件读取失败: ${f.name}`, 'error', (e as any).message);
      }
      
      // 让出主线程给 UI（节流后不需要每 2 张就让一次）
      reportProgress(index);
      if (index % 8 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const terminated = stopImportRef.current || importRunIdRef.current !== runId;

    /*
      整批都是「文件已存在」＝ 同一次拖放的第二路又跑了一遍。
      Tauri 拖放会同时走 DOM drop 与原生事件两路，两路都到这儿，原本靠 importingRef 挡后一路；
      但那个锁只看「是否正在导入」，不看「数据是否已经在了」——用户中途一暂停，两路时间差被拉开，
      第一路早就跑完、锁复位，第二路整批判「已存在」，界面于是报「143 个文件未导入」，
      而文件其实好好躺在列表里（2026-11-02 日志实据）。
      这不是失败，静默忽略即可；真有超限/损坏的文件时 isDuplicateBatch 会返回 false，照常报。
    */
    const duplicateBatch = isDuplicateBatch({
      total: totalCount,
      success: processedFiles.length,
      skipped: newSkipped,
    });

    if (duplicateBatch) {
      addLog(`这批 ${totalCount} 个文件已经全部在列表里，重复触发已忽略`, 'info', '导入');
    } else if (newSkipped.length > 0) {
      setSkippedFiles(prev => [...newSkipped, ...prev]);
      newSkipped.forEach(s => addLog(`跳过文件: ${s.name}`, 'warn', s.reason));
    }
    
    if (processedFiles.length > 0 && !terminated) {
      // 函数式合并：并发导入（Tauri 拖放会同时触发 DOM 与原生事件）时不会互相覆盖
      setFiles(prev => sortFileList([...processedFiles, ...prev], sortOption));
      
      // Default Select All New Files
      setSelectedIds(prev => {
        const next = new Set(prev);
        processedFiles.forEach(f => next.add(f.id));
        return next;
      });
      
      const typeDist = processedFiles.map(f => f.file.type).slice(0, 5).join(', ');
      addLog(
          `导入完成 · ${processedFiles.length} 个文件 · 耗时 ${((performance.now() - importT0) / 1000).toFixed(1)}s`,
          'success',
          `总大小: ${formatBytes(totalAddedSize)}\n` +
          `文件类型分布: ${typeDist}${processedFiles.length > 5 ? '...' : ''}`
      );

      if (hasAnimated) {
          showNotification(`检测到动图，缩略图已生成静态帧以优化性能。`, 'success', '导入');
      }
    }

    if (terminated) {
      // 点停止就是放弃这一批：已读到的也丢掉，连同 blob URL 一起释放
      processedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
      showNotification(`导入已终止，本次读到的 ${processedFiles.length} 个文件已丢弃`, 'warn', '导入');
      addLog(`用户终止了导入任务，已丢弃 ${processedFiles.length}/${totalCount} 个文件`, 'warn');
    } else if (!duplicateBatch) {
      // 完成态：必须在 finally 清零计数之前抓，否则只剩 0。
      // 被终止的批次是「作废」，重复触发的那一批是「什么都没发生」，两者都不留完成态——
      // 否则会把第一路刚写好的「导入完成 · 成功 143」覆盖成「成功 0 · 跳过 143」。
      taskBars.finish('import', {
        success: processedFiles.length,
        skipped: newSkipped.length,
        failed: 0,
        elapsedMs: performance.now() - importT0,
      });
    }

    } finally {
      setIsImporting(false);
      setIsImportPaused(false);
      resetImportProgress();
      setImportTotal(0);
      setImportCurrentName('');
      importCurrentNameRef.current = '';
      // 停止/暂停标志**不在这里复位**：Tauri 那条读盘链路还在跑，先清掉会让它继续读完整批。
      // 下一批导入在函数开头复位（2026-10-31 B2）
      importingRef.current = false;
      importBatchKeys.current.clear();
      // 排队的批次依次处理（串行，不会互相覆盖）
      const queued = importQueueRef.current.splice(0);
      if (queued.length > 0) {
        // 还有排队批次：**不能清 inflight 键**，否则下一批会把自己重新导一遍。
        // 2026-10-31 实测：清早了会让 133 张变成 266 张（Tauri 双路触发 + filesRef 还没刷新）
        void handleFilesAdded(queued);
      } else {
        importInflightKeys.current.clear();
      }
    }
  };

  // --- Tauri File Drop Integration ---
  // We use a ref to hold the current handleFilesAdded function to avoid effect re-binding
  const handleFilesAddedRef = useRef(handleFilesAdded);
  useEffect(() => { handleFilesAddedRef.current = handleFilesAdded; }, [handleFilesAdded]);

  useEffect(() => {
    // @ts-ignore
    const tauri = window.__TAURI__;
    if (!tauri) return;

    let unlistenFn: (() => void) | undefined;

    const setupTauriDrop = async () => {
      try {
        // Listen for the global Tauri file drop event
        unlistenFn = await tauri.event.listen('tauri://file-drop', async (event: any) => {
           const paths = event.payload as string[];
           if (!paths || !Array.isArray(paths) || paths.length === 0) return;

           /*
             入口去重：同一次拖放会投递两次这个事件，两路都读盘、都写进度，
             条就来回伸缩（2026-11-02 实测）。按**排序后的路径**认人，同一批直接忽略。
             注意这是「同一时刻只有一批在跑」的判断，不是「数据是否已存在」——
             后者由 handleFilesAdded 里的 isDuplicateBatch 管，两者别混。
           */
           const dropFingerprint = [...paths].sort().join('\n');
           if (dropBusyRef.current && dropFingerprintRef.current === dropFingerprint) {
              addLog(`忽略重复的拖放事件：同一批 ${paths.length} 个路径正在导入`, 'info', '导入');
              return;
           }
           dropFingerprintRef.current = dropFingerprint;
           dropBusyRef.current = true;

           try {
              // 新一轮拖入＝全新批次：先清掉上一批可能残留的停止/暂停信号。
              // 不清的话，只要终止过一次，读盘循环（while (!stopImportRef.current)）就一次都不执行，
              // 表现是"未找到支持的图片文件"+ 进度卡在 95%，之后再也导不进来（2026-10-31 实测）
              stopImportRef.current = false;
              pauseImportRef.current = false;
              setIsImportPaused(false);

              // Trigger global loading state
              // 全新批次：先把进度地板放下，否则上一批的 95% 会挡住这轮的 2%
              resetImportProgress();
              setIsImporting(true);
              pushImportProgress(2);

              const collectedFiles: File[] = [];
              const SUPPORTED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
              const isSupported = (p: string) => {
                const name = p.split(/[\\/]/).pop() || '';
                if (!name || name.startsWith('.') || name === 'Thumbs.db') return false;
                const ext = name.split('.').pop()?.toLowerCase() || '';
                return SUPPORTED_EXTS.includes(ext);
              };

              // 阶段 1：只遍历目录收集候选路径，不读文件内容
              type Pending = { path: string; basePath: string; root: string };
              const pending: Pending[] = [];

              const collect = async (path: string, folderName?: string) => {
                 const root = folderName || path.split(/[\\/]/).pop() || 'Unknown';
                 const walk = (nodes: any[], basePath: string) => {
                    for (const node of nodes) {
                       if (node.children) walk(node.children, basePath);
                       else if (isSupported(node.path)) pending.push({ path: node.path, basePath, root });
                    }
                 };
                 try {
                    const entries = await tauri.fs.readDir(path, { recursive: true });
                    walk(entries, path);
                 } catch {
                    if (isSupported(path)) pending.push({ path, basePath: path, root });
                 }
              };

              for (const p of paths) await collect(p);

              const totalFiles = pending.length;
              setImportTotal(totalFiles);
              setImportDone(0);

              if (totalFiles === 0) {
                 showNotification('未找到支持的图片文件', 'error', '导入');
                 setIsImporting(false);
                 resetImportProgress();
                 setImportCurrentName('');
                 importCurrentNameRef.current = '';
                 return;
              }

              // 阶段 2：并发读文件内容。原来这里是逐个 await，1.4GB 全耗在这
              // 进度按"已读文件数"走 0→95%，80ms 节流一次
              const CONCURRENCY = Math.max(1, Math.min(32, config.importConcurrency || 6));
              const runId = importRunIdRef.current;
              let cursor = 0;
              let doneCount = 0;
              let lastTick = 0;

              const readOne = async (item: Pending) => {
                 const name = item.path.split(/[\\/]/).pop()!;
                 // 只记在 ref 里，等节流点再提交 state（1118 张不能每张都触发渲染）
                 importCurrentNameRef.current = name;
                 try {
                    const data = await tauri.fs.readBinaryFile(item.path);
                    const ext = name.split('.').pop()?.toLowerCase() || '';
                    let mime = 'image/jpeg';
                    if (ext === 'png') mime = 'image/png';
                    else if (ext === 'webp') mime = 'image/webp';
                    else if (ext === 'gif') mime = 'image/gif';
                    else if (ext === 'bmp') mime = 'image/bmp';

                    const relativePath = item.path.replace(item.basePath, '').replace(/^[\\/]/, '');
                    const webkitRelativePath = relativePath ? `${item.root}/${relativePath}` : item.root;

                    const file = new File([data], name, { type: mime, lastModified: Date.now() });
                    Object.defineProperty(file, 'webkitRelativePath', {
                       value: webkitRelativePath,
                       writable: false,
                       configurable: true,
                    });
                    // 记住原图在磁盘上的位置：处理时可让 Rust 直接读，省掉 PNG 中间件那一圈
                    attachSrcPath(file, item.path);
                    collectedFiles.push(file);
                 } catch (err) {
                    console.warn(`Failed to read Tauri file: ${item.path}`, err);
                    addLog(`Tauri 读取文件失败: ${name}`, 'warn', String(err));
                 } finally {
                    doneCount++;
                    const now = Date.now();
                    if (now - lastTick > 80 || doneCount === totalFiles) {
                       lastTick = now;
                       pushImportDone(doneCount);
                       setImportCurrentName(importCurrentNameRef.current);
                       pushImportProgress((doneCount / totalFiles) * 95);
                    }
                 }
              };

              await Promise.all(
                 Array.from({ length: Math.min(CONCURRENCY, totalFiles) }, async () => {
                    while (cursor < pending.length && !stopImportRef.current) {
                       // 暂停挂起：手上这个文件读完再停，不会留下半截数据（2026-10-31 B1）
                       if (pauseImportRef.current) {
                          await new Promise<void>(resolve => {
                             const check = setInterval(() => {
                                if (!pauseImportRef.current || stopImportRef.current) {
                                   clearInterval(check);
                                   resolve();
                                }
                             }, 100);
                          });
                       }
                       if (stopImportRef.current || importRunIdRef.current !== runId) break;
                       const item = pending[cursor++];
                       await readOne(item);
                    }
                 })
              );

              // 用户在读盘途中点了停止：这一批直接丢弃，绝不回灌进列表
              // （旧代码无条件调 handleFilesAdded，半分钟后文件自己冒出来，2026-10-31 B2）
              if (importRunIdRef.current !== runId) {
                 addLog(`导入已终止，本次读到的 ${collectedFiles.length} 个文件已丢弃`, 'warn');
                 showNotification('导入已终止，已读到的文件已丢弃', 'warn', '导入');
                 setIsImporting(false);
                 setIsImportPaused(false);
                 resetImportProgress();
                 setImportTotal(0);
                 setImportCurrentName('');
                 importCurrentNameRef.current = '';
                 return;
              }

              pushImportProgress(95);

              if (collectedFiles.length > 0) {
                  await handleFilesAddedRef.current(collectedFiles, { keepProgress: true });
              } else {
                  showNotification("未找到支持的图片文件", 'error', '导入');
                  // 一定要收尾：否则进度条停在 95%，isImporting 永远为 true（2026-10-31 实测）
                  setIsImporting(false);
                  setIsImportPaused(false);
                  resetImportProgress();
                  setImportTotal(0);
                  setImportCurrentName('');
                  importCurrentNameRef.current = '';
              }
           } finally {
              // 无论正常结束、中途 return 还是抛错，都要放开入口锁；
              // 漏放一次，之后同一个文件夹就再也拖不进来了
              dropBusyRef.current = false;
           }
        });
      } catch (e) {
        console.error("Failed to setup Tauri drop listener", e);
      }
    };

    setupTauriDrop();

    return () => {
       if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleGenerateTestImages = async () => {
    setShowInfo(false); // Close modal to show progress
    addLog(`开始生成压力测试数据: ${testSettings.count} 张, ${testSettings.resolution}px`, "info");
    
    const dummyFiles: File[] = [];
    const width = testSettings.resolution;
    const height = Math.round(width * 0.75); // 4:3
    
    try {
        for (let i = 0; i < testSettings.count; i++) {
            const blob = await generateDummyImage(width, height, `Test ${i + 1} (${width}px)`);
            const file = new File([blob], `benchmark_test_${i + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
            dummyFiles.push(file);
            // Allow UI update during generation too
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        await handleFilesAdded(dummyFiles);
        showNotification("测试数据生成完成", "success", '测试');
    } catch (e) {
        console.error(e);
        showNotification("生成测试数据失败", "error", '测试');
    }
  };

  const handleAddMoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(Array.from(e.target.files));
      e.target.value = ''; // Reset
    }
  };

  const handleFolderAddChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        // 释放预览 URL 与缩略图 URL（动图两者可能是同一个）
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);


  const handleRemoveFiles = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setFiles(prev => {
      const toRemove = prev.filter(f => idSet.has(f.id));
      toRemove.forEach(f => {
        URL.revokeObjectURL(f.previewUrl);
      });
      return prev.filter(f => !idSet.has(f.id));
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    addLog(`批量移除了 ${ids.length} 个文件`, 'info');
  }, [addLog]);

  const handleClearAll = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (files.length === 0) return;

    // 释放所有资源
    files.forEach(f => {
      URL.revokeObjectURL(f.previewUrl);
    });

    // 产物的落盘目录一起清掉，别在缓存盘里留一堆孤儿文件
    void hookClearWorkspace();

    setFiles([]);
    setSelectedIds(new Set());
    setSkippedFiles([]);
    // 列表都空了，完成态还挂着「处理完成 · 成功 374」会前后矛盾
    taskBars.clearAll();
    showNotification("列表已清空", 'success', '文件');
    addLog('清空了所有文件列表并释放内存', 'info');
  };

  /**
   * 启动时清掉超过 24 小时的历史落盘批次。
   * 只在启动跑一次：中途处理时清理可能删到正在用的目录。
   */
  useEffect(() => {
    void pruneOldWorkspaces().then((removed) => {
      if (removed > 0) {
        addLog(`清理了 ${removed} 个历史产物目录`, 'info', '产物写盘');
      }
    });
  }, [addLog]);

  // P0: 处理逻辑已完全迁移到 useProcessing hook
  // handleProcessFiles, handleProcessSingle 直接使用 hook 的 processFiles/processSingle

  const handleProcessFiles = useCallback((filesToProcess: AppFile[]) => {
    hookProcessFiles(filesToProcess);
  }, [hookProcessFiles]);

  const handleProcessSingle = useCallback(async (file: AppFile) => {
    // 单张处理不走 onAllComplete，进不了完成态体系；但上一批的「处理完成 · 成功 374」
    // 必须撤掉，否则它会挂在这里继续描述一件早就结束的事。
    clearTaskBars();
    await hookProcessSingle(file);
  }, [hookProcessSingle, clearTaskBars]);


  const handleDownloadSingle = useCallback(async (file: AppFile) => {
    const mime = mimeOf(file);
    const ext = getExtensionFromMime(mime);

    const originalName = file.file.name;
    // 单张下载没有批次，序号取规则的起始值（index 固定 0）
    const finalName = buildExportName(originalName, config.renameRule ?? DEFAULT_RENAME_RULE, 0, ext);

    // 桌面端产物只在磁盘上：按需读回一张，保存完就可以扔
    let blob = file.processedBlob;
    if (!blob && file.processedPath) {
      blob = (await readBlobFromPath(file.processedPath, mime)) ?? undefined;
    }
    if (!blob) {
      // 临时目录被清过 / 文件被删了。别静默什么都不做，那正是复盘里那类"点了没反应"
      showNotification('这张的产物已经找不到了，重新处理一次即可', 'warn', '下载');
      return;
    }

    await saveFile(blob, finalName);
  }, [config.renameRule]);

  // P0: 使用 useExport hook 的目录导出
  const handleDownloadAll = async (interactive: boolean = true, filesToExport?: AppFile[]) => {
    // @ts-ignore
    const tauri = window.__TAURI__;
    if (!tauri) {
      showNotification('自动导出功能仅在桌面版可用', 'warn', '导出');
      return;
    }

    const successFiles = (filesToExport || files).filter(f => f.status === 'success' && (f.processedBlob || f.processedPath));
    const missingCount = (filesToExport || files).filter(f => f.status === 'success' && !f.processedBlob && !f.processedPath).length;
    if (successFiles.length === 0) {
      showNotification(
        missingCount > 0
          ? `没有可导出的文件（${missingCount} 张找不到产物，需重新处理）`
          : `没有可导出的文件（成功${(filesToExport || files).filter(f => f.status === 'success').length}个，但产物为空）`,
        'warn',
        '导出'
      );
      return;
    }
    if (missingCount > 0) {
      addLog(`导出跳过 ${missingCount} 张：找不到产物（临时目录被清过或处理被终止），重新处理后可再导出`, 'warn');
    }

    // 让用户选择导出目录
    let exportDir: string | null = null;

    if (interactive) {
      const dialog = tauri.dialog;
      try {
        const result = await dialog.open({
          directory: true,
          multiple: false,
          title: '选择导出目录'
        });

        if (result === null) {
          // 用户主动关掉了选择框，不需要再弹提示（只留一条日志备查）
          addLog('已取消导出（未选择目录）', 'info');
          return;
        }

        if (Array.isArray(result)) {
          exportDir = result[0];
        } else {
          exportDir = result;
        }
      } catch (err: any) {
        console.error('打开目录对话框失败:', err);
        showNotification('打开目录对话框失败: ' + err.message, 'error', '导出');
        return;
      }

      if (!exportDir) {
        showNotification('未选择导出目录', 'warn', '导出');
        return;
      }
    }

    addLog(`开始导出到目录: ${exportDir}`, 'info', `模式: ${config.exportMode || 'rename'}`);
    setIsDownloadingAll(true);
    setFailedFiles([]);
    setExportCurrentName('');

    try {
      const result = await exportToDirectory(successFiles, exportDir!);

      setFailedFiles(result.failedFiles);

      if (result.cancelled) {
        // 终止时别报「导出完成」：用户会以为整个目录都导好了（2026-10-31 反馈）
        const cancelMsg = `导出已终止 · 已写入 ${result.exported} 个文件，其余未处理（已写入的不会删除）`;
        showNotification(cancelMsg, 'warn', '导出');
        addLog(cancelMsg, 'warn', `导出目录: ${exportDir}`);
      } else {
        const msg = `自动导出完成: ${result.exported}个成功${result.failed > 0 ? `, ${result.failed}个失败` : ''}`;
        showNotification(msg, result.failed > 0 ? 'error' : 'success', '导出');
        addLog(msg, result.failed > 0 ? 'warn' : 'success', `导出目录: ${exportDir}`);
        if (soundEnabled && result.failed === 0) playSuccessSound();
      }
    } catch (err: any) {
      console.error('自动导出失败', err);
      showNotification('自动导出失败', 'error', '导出');
      addLog('自动导出失败', 'error', err.message);
    } finally {
      setIsDownloadingAll(false);
      setExportCurrentName('');
    }
  };


  // P0: 使用 useExport hook 的打包导出
  const handleExportZip = async () => {
    const successFiles = files.filter(f => f.status === 'success' && (f.processedBlob || f.processedPath));
    // 找不到产物的条目导不出来，必须让用户知道少了几张
    const missingCount = files.filter(f => f.status === 'success' && !f.processedBlob && !f.processedPath).length;
    if (successFiles.length === 0) {
      showNotification(
        missingCount > 0
          ? `没有可导出的文件（${missingCount} 张找不到产物，需重新处理）`
          : '没有可导出的文件',
        'error',
        '导出'
      );
      return;
    }
    if (missingCount > 0) {
      addLog(`打包导出跳过 ${missingCount} 张：找不到产物，需重新处理`, 'warn');
    }

    // 桌面端先选一次目录：之后无论切几个包，都直接写进去，不再逐个弹保存框
    let outputDir: string | undefined;
    const openDialog = getTauriOpenDialog();
    if (openDialog) {
      try {
        const picked = await openDialog({ directory: true, multiple: false, title: '选择 ZIP 保存目录' });
        if (!picked) {
          // 用户刚关掉对话框，他自己知道——不再弹黄色提示
          addLog('已取消打包导出', 'info');
          return;
        }
        outputDir = Array.isArray(picked) ? picked[0] : picked;
      } catch (err) {
        showNotification('打开目录对话框失败: ' + (err as Error).message, 'error', '导出');
        return;
      }
    }

    try {
      const ok = await exportToZip(successFiles, {
        outputDir,
        layout: config.zipLayout,
        engine: config.zipEngine,
      });
      if (!ok) {
        // exportToZip 返回 false 的三种情况：保存被取消、写盘失败、打包中途被终止。
        // 原来这里什么都不说，用户点了「打包下载」之后界面上毫无反应（2026-11-01 反馈）。
        showNotification('打包没有完成：保存被取消或写入失败，磁盘上没有生成压缩包', 'error', '导出');
      }
    } catch (err) {
      // 分组 / 命名阶段抛错时 exportToZip 的 try 还没进，会漏成未处理的 rejection。
      // 兜住，至少让人知道失败了、错在哪。
      const msg = err instanceof Error ? err.message : String(err);
      addLog('打包导出失败', 'error', msg);
      showNotification(`打包导出失败：${msg}`, 'error', '导出');
    }
  };

  // --- Computed ---
  const stats = useMemo<ProcessingReport>(() => {
    const processed = files.filter(f => f.status === 'success');
    return {
      total: files.length,
      success: processed.length,
      failed: files.filter(f => f.status === 'error').length,
      totalOriginalSize: files.reduce((acc, curr) => acc + curr.originalSize, 0),
      totalProcessedSize: processed.reduce((acc, curr) => acc + (curr.processedSize || 0), 0),
      totalTime: processed.reduce((acc, curr) => acc + (curr.processingTime || 0), 0)
    };
  }, [files]);

  /** 总量变化百分比：正数=变小（好），负数=变大。列表底部统计栏用 */
  const savedPercent = useMemo(() => {
    if (stats.totalOriginalSize <= 0) return 0;
    return Math.round(((stats.totalOriginalSize - stats.totalProcessedSize) / stats.totalOriginalSize) * 100);
  }, [stats]);

  const hasErrorLog = useMemo(() => logs.some(l => l.level === 'error'), [logs]);
  // 完成态也是显示条件：任务结束后进度栏要留在原地，直到下一次操作开始
  const showProcessingBar =
    !!taskBars.done.process || ((isProcessing || isPaused) && procStats.total > 0);
  // 导出的活跃 / 暂停标志：label 与 state 都要用，算一次别抄三遍
  const exportBarActive = hookIsZipping || isDownloadingAll;
  const exportBarPaused = hookIsZipping ? hookIsZipPaused : hookIsDownloadPaused;



  // Compute selected files for batch processing actions from toolbar
  const handleBatchProcess = () => {
    // 新任务开始：三条完成态一起清
    taskBars.clearAll();
      // Process selected files, or all if none selected
      const targetFiles = selectedIds.size > 0
         ? files.filter(f => selectedIds.has(f.id))
         : files;

      // 重置进度栏计数与本次会话的体积累计（queue 的真实长度由 hook 的 onProgress 首次回调校正）
      const queueLength = targetFiles.filter(f => f.status !== 'success').length || targetFiles.length;
      // 新批次开始：上一批的"作废标记"必须清掉，否则这一批的回调全被丢掉
      procCanceledRef.current = false;
      procProgressTickRef.current = 0;
      procNameTickRef.current = 0;
      procCurrentNameRef.current = '';
      // 上一批没来得及补发的进度也要丢弃，否则会盖掉新批次刚设好的计数
      if (procProgressTimerRef.current !== null) {
        window.clearTimeout(procProgressTimerRef.current);
        procProgressTimerRef.current = null;
      }
      procProgressPendingRef.current = null;
      setProcStats({ done: 0, total: queueLength });
      procStartedAtRef.current = Date.now();
      sessionBytesRef.current = { original: 0, processed: 0 };
      batchDetailRef.current = [];
      animatedSkippedRef.current = [];
      inflationSkippedRef.current = [];

      // 把本次用的配置记进日志：事后查"为什么这批体积比上批大"时没有配置就无从判断
      addLog(`开始处理 ${targetFiles.length} 张`, 'info', `配置: ${describeProcessingConfig(config)}`);

      hookProcessFiles(targetFiles);
  };

  // P0: 处理控制方法，全部通过 useProcessing hook
  const toggleProcessing = () => {
    // 暂停中必须优先判「继续」：hook 的 pause() 不会把 isProcessing 置 false，
    // 两个标志同时为 true，先判 isProcessing 就永远走不到恢复分支（2026-10-31 B3）
    if (hookIsPaused) {
      // 恢复处理
      hookResume();
      addLog("恢复了处理任务", "info");
    } else if (hookIsProcessing) {
      // 触发暂停
      hookPause();
      addLog("用户手动暂停了处理任务", "warn");
      if (soundEnabled) playPauseSound();
    } else {
      // 开始新任务
      handleBatchProcess();
    }
  };

  const terminateProcessing = () => {
    // 先作废这一批：cancel 之后还在跑的那几张完成时会回调，不挡住就会把旧格式的产物写回列表
    procCanceledRef.current = true;
    if (procProgressTimerRef.current !== null) {
      window.clearTimeout(procProgressTimerRef.current);
      procProgressTimerRef.current = null;
    }
    procProgressPendingRef.current = null;
    hookCancel();
    // 终止 = 这一批作废，所有非待处理状态一律回到待处理（含已成功的）。
    // 只重置 processing 的话，下次点处理会把 success 当成"已完成"跳过（2026-10-31 B4）
    setFiles((prev: AppFile[]) => prev.map((f: AppFile) => (
      f.status === 'idle' ? f : {
        ...f,
        status: 'idle' as const,
        errorMessage: undefined,
        processedBlob: undefined,
        processedPath: undefined,
        processedSize: undefined,
        processingTime: undefined,
        inflation: undefined,
        isSkipped: false,
      }
    )));
    sessionBytesRef.current = { original: 0, processed: 0 };
    procStartedAtRef.current = null;
    setProcStats(prev => ({ ...prev, done: 0, total: 0, current: '' }));
    showNotification('处理已终止，队列已重置', 'warn', '处理');
    addLog(
      '用户终止了处理任务',
      'warn',
      batchDetailRef.current.length > 0
        ? `本次已完成的 ${batchDetailRef.current.length} 张已重置为待处理：\n${batchDetailRef.current.join('\n')}`
        : undefined
    );
    batchDetailRef.current = [];
    animatedSkippedRef.current = [];
    inflationSkippedRef.current = [];
  };

  /**
   * 当前活跃任务。同一时刻只有一个主任务在跑，顶部工具栏按它决定按钮行为，
   * 底部的 ProcessingBar 只负责显示（2026-10-31 B6：去掉上下两套按钮）
   */
  const activeTaskKind: 'import' | 'process' | 'zip' | 'download' | null =
    isImporting ? 'import'
      : (hookIsProcessing || hookIsPaused) ? 'process'
        : hookIsZipping ? 'zip'
          : isDownloadingAll ? 'download'
            : null;

  const isActiveTaskPaused =
    activeTaskKind === 'import' ? isImportPaused
      : activeTaskKind === 'process' ? hookIsPaused
        : activeTaskKind === 'zip' ? hookIsZipPaused
          : activeTaskKind === 'download' ? hookIsDownloadPaused
            : false;

  const activeTaskLabel = (() => {
    switch (activeTaskKind) {
      case 'import': return isImportPaused ? '继续导入' : '暂停导入';
      case 'process': return hookIsPaused ? '继续' : '暂停';
      case 'zip': return hookIsZipPaused ? '继续打包' : '暂停打包';
      case 'download': return hookIsDownloadPaused ? '继续导出' : '暂停导出';
      default: return '全部处理';
    }
  })();

  const toggleActiveTask = () => {
    switch (activeTaskKind) {
      case 'import': return toggleImportPause();
      case 'zip': return toggleZipPause();
      case 'download': return toggleDownloadPause();
      default: return toggleProcessing();
    }
  };

  const terminateActiveTask = () => {
    switch (activeTaskKind) {
      case 'import': return terminateImport();
      case 'zip': return terminateZip();
      case 'download': return terminateDownload();
      case 'process': return terminateProcessing();
    }
  };

  return (
    // .dark 只挂在 <html> 上（见上面的 effect），这一层不再重复挂——两处判断迟早会不一致
    <div className="h-screen flex flex-col font-sans transition-colors duration-200">
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        multiple 
        ref={addFilesInputRef}
        onChange={handleAddMoreChange}
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"
      />
      <input 
        type="file" 
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple 
        ref={addFolderInputRef}
        onChange={handleFolderAddChange}
        className="hidden"
      />

      {/* 信息提示条：成功/提示 3.5s 自动消失，警告/错误常驻，最多同时显示 3 条 */}
      <NotificationStack
        items={notifications}
        onDismiss={dismissNotification}
        onDismissAll={dismissAllNotifications}
      />

      {/* Log Viewer Modal */}
      <LogViewer 
        logs={logs} 
        isOpen={showLogs} 
        onClose={() => setShowLogs(false)} 
        onClear={() => { logsRef.current = []; resetAutoLogCursor(); setLogs([]); }} 
      />

      {/* Preview Modal */}
      {previewFile && activePreviewUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewFile(null)}
        >
           <button 
             onClick={() => setPreviewFile(null)}
             className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
           >
             <X size={32} />
           </button>
           
           <div 
             className="relative max-w-full max-h-full flex flex-col items-center" 
             onClick={e => e.stopPropagation()}
           >
              <img 
                src={activePreviewUrl} 
                alt="Preview" 
                className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl bg-[#1e1e1e]" // dark bg for transparency
              />
              <div className="mt-4 text-white text-center">
                 <p className="font-medium text-lg">{previewFile.file.name}</p>
                 <p className="text-sm text-gray-400">
                    {previewFile.status === 'success' && previewFile.processedSize 
                      ? `${formatBytes(previewFile.processedSize)} (优化后)` 
                      : formatBytes(previewFile.originalSize)
                    }
                    {previewFile.isAnimated && <span className="ml-2 px-1.5 py-0.5 bg-yellow-500 text-black text-[10px] rounded font-bold">ANIMATED</span>}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Info Modal with Tabs */}
      {showInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
           <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
             {/* Header */}
             <div className="flex justify-between items-start px-6 pt-5 pb-0 shrink-0">
                 <div>
                   <h2 className="text-xl font-bold flex items-center gap-2 text-brand-600">
                     {APP_INFO.name} <span className="text-sm bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full border border-brand-100">{APP_INFO.version}</span>
                   </h2>
                 </div>
                 <button 
                   onClick={() => setShowInfo(false)} 
                   className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 absolute right-4 top-4"
                 >
                   <X size={20} />
                 </button>
             </div>
             
             {/* Tabs */}
             <div className="flex px-6 border-b border-gray-100 dark:border-gray-700 mt-4 space-x-6">
                <button 
                  onClick={() => setInfoTab('about')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    infoTab === 'about' 
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                   关于软件
                </button>
                <button
                  onClick={() => setInfoTab('testing')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    infoTab === 'testing' 
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                   <FlaskConical size={14} /> 实验室
                </button>
             </div>
             
             {/* Scrollable Body */}
             <div className="flex-1 overflow-y-auto p-6">
                {infoTab === 'about' && (
                  <div className="space-y-6">
                    {/* Description */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                       {APP_INFO.description}
                    </p>

                    {/* Features */}
                    <div>
                       <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2.5 flex items-center gap-2 text-sm">
                         <Zap size={16} className="text-amber-500 fill-amber-500/20"/> 主要功能
                       </h3>
                       <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                         {APP_INFO.features.map((feat, i) => (
                           <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2 bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 transition-colors hover:border-brand-200 dark:hover:border-brand-900 group">
                              <Check size={13} className="text-brand-500 mt-0.5 flex-shrink-0" strokeWidth={3} />
                              <span className="leading-snug">{feat}</span>
                           </li>
                         ))}
                       </ul>
                    </div>
                    
                    {/* Storage Management */}
                    <div className="pt-2">
                      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2.5 flex items-center gap-2 text-sm">
                         <Database size={16} className="text-gray-400" /> 本地存储管理
                      </h3>
                      
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">已用空间</span>
                          <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{formatBytes(storageSize)} / ~5MB</span>
                        </div>
                        
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-4 overflow-hidden">
                           <div 
                             className="bg-brand-500 h-1.5 rounded-full transition-all duration-500" 
                             style={{ width: `${Math.min((storageSize / (5 * 1024 * 1024)) * 100, 100)}%` }}
                           />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => handleClearCache('config')}
                            className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 shadow-sm"
                          >
                            重置配置
                          </button>
                          <button 
                            onClick={() => handleClearCache('all')}
                            className="px-3 py-2 text-xs border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors"
                          >
                            清空所有缓存
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {infoTab === 'testing' && (
                  <div className="space-y-6">
                     {/* System Info */}
                     <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                         <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <MonitorSmartphone size={16} className="text-blue-500" />
                           环境检测
                         </h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                               <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">CPU 逻辑核心数</div>
                               <div className="text-xl font-mono font-bold text-gray-800 dark:text-white">{browserCaps.cores}</div>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                               <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">WebGL Max Texture Size</div>
                               <div className="text-xl font-mono font-bold text-gray-800 dark:text-white">{browserCaps.maxTexture > 0 ? browserCaps.maxTexture : 'Unknown'}</div>
                            </div>
                         </div>
                         <p className="text-[10px] text-gray-400 mt-2">
                            * 最大纹理尺寸决定了浏览器能处理的单张图片最大分辨率。超过此限制可能导致黑屏或崩溃。
                         </p>
                     </div>

                     {/* Stress Generator */}
                     <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-100 dark:border-purple-800/50">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <FlaskConical size={16} className="text-purple-500" />
                           压力测试生成器
                         </h3>
                         <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                   <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">生成数量</label>
                                   <select 
                                     value={testSettings.count}
                                     onChange={(e) => setTestSettings(s => ({...s, count: parseInt(e.target.value)}))}
                                     className="w-full text-xs p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                   >
                                      <option value="10">10 张 (轻量)</option>
                                      <option value="50">50 张 (标准)</option>
                                      <option value="100">100 张 (高压)</option>
                                      <option value="200">200 张 (极限)</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">图片分辨率 (宽)</label>
                                   <select 
                                     value={testSettings.resolution}
                                     onChange={(e) => setTestSettings(s => ({...s, resolution: parseInt(e.target.value)}))}
                                     className="w-full text-xs p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                   >
                                      <option value="1024">SD (1024px)</option>
                                      <option value="1920">HD (1920px)</option>
                                      <option value="3840">4K (3840px)</option>
                                      <option value="7680">8K (7680px - 大图预警)</option>
                                      <option value="10000">10K (极限测试)</option>
                                   </select>
                                </div>
                             </div>
                             
                             <button 
                                onClick={handleGenerateTestImages}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow-lg shadow-purple-500/20 transition-all active:scale-95"
                             >
                                生成测试数据并开始
                             </button>
                             <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70">
                                提示：选择 8K 或 10K 分辨率可以触发大图内存保护逻辑的警告。
                             </p>
                         </div>
                     </div>

                     {/* Memory Tools */}
                     <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <MemoryStick size={16} className="text-gray-500" />
                           内存管理
                         </h3>
                         <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                               如果有大量 ObjectURL 未释放，可能会占用浏览器内存。
                            </span>
                            <button 
                               onClick={() => {
                                   alert("垃圾回收提示已发送。浏览器会自动在空闲时回收未引用的 Blob URL。");
                               }}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <Trash2 size={12} /> 手动触发 GC 提示
                            </button>
                         </div>
                     </div>
                  </div>
                )}
             </div>

             {/* Footer - Fixed */}
             <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-center text-[10px] text-gray-400 shrink-0 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-2xl">
                本地离线处理 • 无数据上传 • 安全隐私
             </div>
           </div>
        </div>
      )}

      {/* Header - Redesigned */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-6 sticky top-0 z-40 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-500/20 shrink-0">
             <Aperture size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white leading-none mb-0.5 whitespace-nowrap">
              {APP_INFO.name}
            </h1>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 hidden sm:inline">
                 专业离线批量处理工具
               </span>
               <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700">
                  {APP_INFO.version}
               </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           
           <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-800 pl-3">
             <button
                onClick={() => setShowLogs(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 relative"
                title="查看日志"
             >
                <ScrollText size={18} />
                {hasErrorLog && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>
                )}
             </button>
             <button 
               onClick={() => setSoundEnabled(s => !s)}
               className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
               title={soundEnabled ? '关闭声音提示' : '开启声音提示'}
             >
               {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
             </button>
             <button 
               onClick={() => { setShowInfo(true); setInfoTab('about'); }}
               className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
               title="关于 PicMan"
             >
               <Info size={18} />
             </button>
             {/* 外观三态只此一处：左边面板里那个重复入口已去掉（2026-11-02 老大要求） */}
             <ThemeSwitch value={theme} onChange={setTheme} />
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-row overflow-hidden max-w-[1920px] mx-auto w-full">
        
        {/* Left: Configuration - Static Sidebar */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0 h-[calc(100vh-64px)] overflow-hidden z-20">
           <ConfigPanel 
              config={config} 
              setConfig={setConfig} 
              locked={isProcessing || isPaused}
            />
        </aside>

        {/* Center: Work Area */}
        <section className="flex-1 flex flex-col p-4 overflow-hidden bg-gray-100 dark:bg-gray-900 h-[calc(100vh-64px)]">
           
           {/* Skipped Files Alert */}
           {skippedFiles.length > 0 && (
             <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start justify-between">
                <div className="flex-1 max-h-32 overflow-y-auto">
                   <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-2">
                     <AlertOctagon size={14} /> {skippedFiles.length} 个文件未导入
                   </h4>
                   <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-1">
                      {skippedFiles.map((err, idx) => (
                        <li key={idx}><span className="font-mono bg-white/50 dark:bg-black/20 px-1 rounded">{err.name}</span>: {err.reason}</li>
                      ))}
                   </ul>
                </div>
                <button 
                  onClick={() => setSkippedFiles([])}
                  className="p-1 hover:bg-amber-100 dark:hover:bg-amber-800/50 rounded text-amber-600"
                >
                  <X size={14} />
                </button>
             </div>
           )}

           {/* Toolbar - Compact Redesign：列表为空时只在导入中露出来，保证暂停/终止有入口 */}
           {(files.length > 0 || activeTaskKind === 'import') && (
           <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Left Side: Actions */}
                  <div className="flex items-center gap-2">
                       {/* 统一任务按钮：导入 / 处理 / 打包 / 导出 共用，暂停中显示「继续」 */}
                       <button
                         onClick={toggleActiveTask}
                         className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-md shadow-sm transition-all active:scale-95 bg-brand-600 hover:bg-brand-700 hover:shadow-brand-500/30"
                       >
                         {/* 没有任务在跑时必须给播放图标：终止后按钮是「全部处理」，不能还画着暂停 */}
                         {activeTaskKind === null || isActiveTaskPaused
                           ? <Play size={16} fill="currentColor" />
                           : <Pause size={16} fill="currentColor" />}
                         <span>{activeTaskLabel}</span>
                       </button>

                       {/* 同一槽位：任务进行中放「终止」，空闲时放「清空」
                           用户视角更顺——终止完这个位置自然变成下一步能做的事 */}
                       {activeTaskKind !== null ? (
                         <button
                           onClick={terminateActiveTask}
                           className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-md transition-all"
                           title="终止当前任务"
                         >
                           <StopIcon size={14} />
                           <span>终止</span>
                         </button>
                       ) : files.length > 0 ? (
                         <button
                           onClick={handleClearAll}
                           className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-md transition-all"
                           title="清空列表"
                         >
                           <Trash2 size={16} />
                           <span>清空</span>
                         </button>
                       ) : null}

                       {/* Divider */}
                       <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block"></div>
                       
{/* Add Buttons - Compact Group：同样常驻，忙碌时禁用 */}
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/50 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <button 
                               onClick={() => addFilesInputRef.current?.click()}
                               disabled={isProcessing || hookIsZipping || isImporting}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                               <FilePlus size={14} /> 
                               <span>添加文件</span>
                            </button>
                            <button 
                               onClick={() => addFolderInputRef.current?.click()}
                               disabled={isProcessing || hookIsZipping || isImporting}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                               <FolderInput size={14} /> 
                               <span>添加文件夹</span>
                            </button>
                        </div>
                  </div>
                  
                  {/* Right Side: Downloads & Stats Summary */}
                  <div className="flex items-center gap-3 ml-auto">
                     {/* Download Actions */}
                     {stats.success > 0 && !isProcessing && (
                        <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/10 p-0.5 rounded-lg border border-blue-100 dark:border-blue-800">
                            {/* 0. Export Mode Selector */}
                            <div className="flex items-center gap-0.5 px-1">
                               <button
                                  onClick={() => setConfig({...config, exportMode: 'rename'})}
                                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                                     config.exportMode === 'rename' || !config.exportMode
                                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                  }`}
                                  title="重命名保存：添加后缀避免覆盖原文件"
                               >
                                  重命名
                               </button>
                               <button
                                  onClick={() => setConfig({...config, exportMode: 'overwrite'})}
                                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                                     config.exportMode === 'overwrite'
                                        ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                  }`}
                                  title="覆盖保存：直接替换原文件"
                               >
                                  覆盖
                               </button>
                            </div>

{/* 1. Download Individual */}
                            <button
                               onClick={() => handleDownloadAll(true)}
                               disabled={hookIsZipping}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-white dark:hover:bg-gray-800 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-50"
                               title="全部下载（按原目录结构导出）"
                            >
                               <Download size={14} />
                               <span>全部下载</span>
                             </button>

                             {/* 2. Export ZIP */}
                             <button
                                onClick={handleExportZip}
                                disabled={hookIsZipping}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-white dark:hover:bg-gray-800 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-50"
                                title="批量打包下载所有处理成功的图片"
                             >
                                {hookIsZipping ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                               <span>打包下载</span>
                           </button>

                        </div>
                     )}
                  </div>
              </div>

              {/* Stats Bar - Simplified & Compact */}
              <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                     <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                        总计: <span className="text-gray-700 dark:text-gray-300">{stats.total}</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        成功: <span className="text-green-600 dark:text-green-400">{stats.success}</span>
                     </div>
                     {stats.failed > 0 && (
                        <div className="flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                           失败: <span className="text-red-600 dark:text-red-400">{stats.failed}</span>
                        </div>
                     )}
                     {stats.success > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                           <span>
                              原始尺寸：<b className="text-gray-700 dark:text-gray-300">{formatBytes(stats.totalOriginalSize)}</b>
                           </span>
                           <span>
                              处理后：<b className="text-gray-700 dark:text-gray-300">{formatBytes(stats.totalProcessedSize)}</b>
                           </span>
                           <span>
                              共优化：<b className="text-brand-600 dark:text-brand-400">
                                 {formatBytes(stats.totalOriginalSize - stats.totalProcessedSize)}
                                 {stats.totalOriginalSize > 0 && (
                                   `（${savedPercent >= 0 ? '-' : '+'}${Math.abs(savedPercent)}%）`
                                 )}
                              </b>
                           </span>
                           <span>
                              耗时：<b className="text-gray-700 dark:text-gray-300">{formatDurationCN(stats.totalTime)}</b>
                           </span>
                        </div>
                     )}
                  </div>
           </div>
           )}

           {/* Drop Zone or List */}
           <div className="flex-1 overflow-hidden flex flex-col gap-3">
              {files.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                   <div className="w-full max-w-2xl transform scale-90 lg:scale-100 transition-transform">
                     <ImportZone onFilesAdded={handleFilesAdded} />
                   </div>
                </div>
              ) : (
                <VirtualFileList 
                   files={files} 
                   onRemove={handleRemoveFile}
                   onRemoveFiles={handleRemoveFiles}
                   selectedIds={selectedIds}
                   onToggleSelection={toggleSelection}
                   onSetSelection={setSelection}
                   onProcessSingle={handleProcessSingle}
                   onProcessFiles={handleProcessFiles}
                   onDownloadSingle={handleDownloadSingle}
                   onPreview={handlePreview}
                   sortOption={sortOption}
                   onSortChange={handleSortChange}
                />
              )}
           </div>

           {/* 任务进度栏：导入 / 处理 / 导出 共用一套样式，可同时出现（如导出中又导入）。
               任务结束后不停留消失，停在完成态给结论，直到下一次操作开始或点 × 关掉。 */}
           <div className="flex-shrink-0 mt-3 space-y-2 empty:hidden">
             {(isImporting || taskBars.done.import) && (
               <ProcessingBar
                 visible
                 tone="sky"
                 label={isImporting ? (isImportPaused ? '导入已暂停' : '导入中') : '导入完成'}
                 state={resolveBarState(isImporting, isImportPaused)}
                 percent={importProgress}
                 done={importTotal > 0 ? importDone : undefined}
                 total={importTotal > 0 ? importTotal : undefined}
                 detail={isImporting
                   ? describeImportStatus({
                       total: importTotal,
                       percent: importProgress,
                       currentName: importCurrentName,
                     })
                   : undefined}
                 result={taskBars.done.import}
                 onDismiss={() => taskBars.dismiss('import')}
               />
             )}

             <ProcessingBar
               visible={showProcessingBar}
               tone="brand"
               label={isPaused ? '已暂停' : isProcessing ? '处理中' : '处理完成'}
               state={resolveBarState(isProcessing || isPaused, isPaused)}
               percent={processingProgress}
               done={procStats.done}
               total={procStats.total}
               detail={procStats.current ? `当前：${procStats.current}` : undefined}
               meta={(() => {
                 const elapsed = procStartedAtRef.current ? Date.now() - procStartedAtRef.current : 0;
                 const speed = elapsed > 0 && procStats.done > 0 ? procStats.done / (elapsed / 1000) : 0;
                 const remainMs = speed > 0 && procStats.total > procStats.done
                   ? ((procStats.total - procStats.done) / speed) * 1000
                   : NaN;
                 const parts: string[] = [];
                 if (speed > 0) parts.push(`${speed.toFixed(1)} 张/秒`);
                 if (Number.isFinite(remainMs) && remainMs > 0) parts.push(`剩余 ${Math.round(remainMs / 1000)}s`);
                 return parts.join(' · ') || undefined;
               })()}
               result={taskBars.done.process}
               onDismiss={() => taskBars.dismiss('process')}
             />

             {(hookIsZipping || isDownloadingAll || taskBars.done.export) && (
               <ProcessingBar
                 visible
                 tone="emerald"
                 label={
                   exportBarActive
                     ? (hookIsZipping
                         ? (hookIsZipPaused ? '打包已暂停' : '正在打包 ZIP')
                         : (hookIsDownloadPaused ? '导出已暂停' : '正在导出'))
                     : '导出完成'
                 }
                 state={resolveBarState(exportBarActive, exportBarPaused)}
                 percent={
                   hookIsZipping
                     ? hookZipProgress
                     : (downloadProgress.total > 0 ? (downloadProgress.current / downloadProgress.total) * 100 : 0)
                 }
                 done={hookIsZipping ? undefined : downloadProgress.current}
                 total={hookIsZipping ? undefined : downloadProgress.total}
                 detail={hookIsZipping ? (hookZipDetail || '分块打包并下载') : (exportCurrentName ? `正在导出：${exportCurrentName}` : '按原目录结构写入磁盘')}
                 indeterminate={hookIsZipping}
                 result={taskBars.done.export}
                 onDismiss={() => taskBars.dismiss('export')}
               />
             )}
           </div>
        </section>
      </main>
    </div>
  );
}

export default App;
