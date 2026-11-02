import { useState, useCallback, useEffect, useRef } from 'react';
import { AppFile, ProcessingConfig } from '../types';
import { TaskScheduler } from '../utils/taskScheduler';
import { processImage } from '../services/imageProcessor';
import { openWorkspace, persistBlob, clearWorkspace as clearWorkspaceDir, type WorkspaceHandle } from '../services/workspace';

interface UseProcessingOptions {
  config: ProcessingConfig;
  concurrency?: number;
  onTaskStart?: (file: AppFile) => void;
  onTaskComplete?: (file: AppFile) => void;
  onTaskError?: (file: AppFile, error: Error) => void;
  /** force=true 时绕过调用方的节流（暂停瞬间补一次真实进度） */
  onProgress?: (completed: number, total: number, force?: boolean) => void;
  onAllComplete?: (stats: { success: number; failed: number; skipped: number }) => void;
}

interface UseProcessingReturn {
  // State
  isProcessing: boolean;
  isPaused: boolean;
  progress: number;

  // Actions
  processFiles: (files: AppFile[]) => Promise<void>;
  processSingle: (file: AppFile) => Promise<AppFile | null>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  /** 清掉本批的产物落盘目录（「清空列表」时调用；浏览器环境是空操作） */
  clearWorkspace: () => Promise<void>;
}

export function useProcessing(options: UseProcessingOptions): UseProcessingReturn {
  const {
    config,
    concurrency = 2,
    onTaskStart,
    onTaskComplete,
    onTaskError,
    onProgress,
    onAllComplete,
  } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  /**
   * 最新配置的 ref。
   * 任务入队时会把 `processSingleFileInternal` 整个函数捕获进 scheduler，
   * 如果它依赖 `config`，暂停期间改了格式/质量，继续跑的还是**入队那一刻**的旧配置。
   * 改为执行时读 ref，暂停→改配置→继续 才能按新方案处理剩余文件。
   */
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const schedulerRef = useRef<TaskScheduler | null>(null);
  const stopRef = useRef(false);
  const hasPausedRef = useRef(false);
  const statsRef = useRef({ success: 0, failed: 0, skipped: 0 });
  /**
   * 批次令牌 + 同步运行标记。
   * 用 ref 而不是 `isProcessing` state 做守卫：cancel() 之后 state 要等下一次渲染才更新，
   * 用户立刻点「全部处理」会被旧的 true 拦住，表现就是"要点两次才开始"。
   * 令牌用来丢掉被取消批次的迟到回调（scheduler 在飞的任务会继续跑完）。
   */
  const runIdRef = useRef(0);
  const runningRef = useRef(false);
  /** 本批产物的落盘目录（桌面端）；浏览器环境恒为 null，继续走内存 */
  const workspaceRef = useRef<WorkspaceHandle | null>(null);
  /** 落盘文件名的序号，只需保证同一批次内不重名 */
  const persistIndexRef = useRef(0);
  /** 已完成的真实张数：暂停时用它补一次进度，避免进度条停在节流丢掉的那个旧值 */
  const progressRef = useRef({ completed: 0, total: 0 });

  // Process single file logic (extracted for reuse)
  const processSingleFileInternal = useCallback(async (file: AppFile): Promise<AppFile | null> => {
    const startTime = performance.now();
    // 单张覆盖优先；否则一律读"此刻"的全局配置（暂停中改过配置也要生效）
    const currentConfig = file.customConfig || configRef.current;

    // 单张处理入口（processSingle）不经过 processFiles，这里兜一次目录创建
    if (!workspaceRef.current) {
      workspaceRef.current = await openWorkspace();
    }

    // Mark as processing
    onTaskStart?.(file);

    try {
      // Animation guard - skip processing for animated images
      if (file.isAnimated) {
        // 动图原样输出，没必要再复制一份：拖放时记下的源路径直接就是产物
        const srcPath = (file.file as File & { __picmanSrcPath?: string }).__picmanSrcPath;
        const processedFile: AppFile = {
          ...file,
          processedBlob: file.file,
          processedPath: srcPath,
          processedSize: file.file.size,
          status: 'success',
          processingTime: performance.now() - startTime,
          isSkipped: true,
        };
        statsRef.current.skipped++;
        onTaskComplete?.(processedFile);
        return processedFile;
      }

      // Process with main thread (Canvas API)
      const result = await processImage(file, currentConfig);

      // Smart size inflation guard
      const isSizeLarger = result.blob.size > file.originalSize;
      const isFormatChanged = file.file.type !== currentConfig.format;
      const isResized = currentConfig.resizeMode !== 'original';
      const isRotated = (currentConfig.rotate || 0) % 360 !== 0;
      const isFlipped = currentConfig.flipX || currentConfig.flipY;
      const hasWatermark = currentConfig.watermark.enabled;
      const hasEdits = isFormatChanged || isResized || isRotated || isFlipped || hasWatermark;

      // 体积膨胀兜底：always = 只要变大就回退（含改格式）；only-when-no-edit = 旧行为
      const policy = currentConfig.sizeInflationPolicy ?? 'always';
      const shouldFallback =
        currentConfig.preventSizeInflation !== false &&
        isSizeLarger &&
        (policy === 'always' || !hasEdits);

      let finalBlob = result.blob;
      let finalWidth = result.width;
      let finalHeight = result.height;
      let isSkipped = false;
      let inflation: AppFile['inflation'];

      if (shouldFallback) {
        finalBlob = file.file;
        finalWidth = file.dimensions.width;
        finalHeight = file.dimensions.height;
        isSkipped = true;
        statsRef.current.skipped++;
        inflation = {
          attemptedSize: result.blob.size,
          deltaPercent: Math.round(
            ((result.blob.size - file.originalSize) / Math.max(1, file.originalSize)) * 100
          ),
        };
      }

      // 产物落盘（桌面端）。**落盘成功就不再攥着 Blob**——内存占用从此与批次大小脱钩，
      // 几百张的批次不再需要 1.5GB 预算兜底（P3 第 3 步，2026-11-02）。
      // 落盘失败或浏览器环境仍然保留 Blob，功能一点不少。
      let processedPath: string | undefined;
      const ws = workspaceRef.current;
      if (ws) {
        processedPath = (await persistBlob(ws, persistIndexRef.current++, file.file.name, finalBlob)) ?? undefined;
      }

      const processedFile: AppFile = {
        ...file,
        processedBlob: processedPath ? undefined : finalBlob,
        processedPath,
        // 体积始终取真实产物的大小，跟 Blob 在不在内存里无关
        processedSize: finalBlob.size,
        status: 'success',
        processingTime: performance.now() - startTime,
        dimensions: { width: finalWidth, height: finalHeight },
        isSkipped,
        inflation,
      };

      statsRef.current.success++;
      onTaskComplete?.(processedFile);
      return processedFile;

    } catch (err: any) {
      statsRef.current.failed++;
      const errorFile = {
        ...file,
        status: 'error' as const,
        errorMessage: err.message || '未知错误',
      };
      onTaskError?.(file, err);
      return null;
    }
  }, [onTaskStart, onTaskComplete, onTaskError]);

  // Process multiple files
  const processFiles = useCallback(async (filesToProcess: AppFile[]) => {
    if (runningRef.current) return;

    // Filter to files that need processing
    let queue = filesToProcess.filter(f => f.status !== 'success');
    if (queue.length === 0 && filesToProcess.length > 0) {
      queue = [...filesToProcess];
    }
    if (queue.length === 0) return;

    // 每批开一个新的落盘目录；浏览器环境返回 null，后续继续走内存
    workspaceRef.current = await openWorkspace();
    persistIndexRef.current = 0;

    const runId = ++runIdRef.current;
    runningRef.current = true;
    setIsProcessing(true);
    setIsPaused(false);
    setProgress(0);
    stopRef.current = false;
    hasPausedRef.current = false;
    statsRef.current = { success: 0, failed: 0, skipped: 0 };

    const total = queue.length;
    let completed = 0;
    progressRef.current = { completed: 0, total };

    // Create scheduler
    schedulerRef.current = new TaskScheduler({
      concurrency: concurrency,
      maxConcurrency: concurrency * 2,
      minConcurrency: 1,
      autoAdjust: true,
      debug: false,
      onTaskComplete: () => {
        if (runIdRef.current !== runId) return;
        completed++;
        progressRef.current = { completed, total };
        const prog = Math.min((completed / total) * 100, 100);
        setProgress(prog);
        onProgress?.(completed, total);
      },
      onTaskError: () => {
        if (runIdRef.current !== runId) return;
        completed++;
        progressRef.current = { completed, total };
        const prog = Math.min((completed / total) * 100, 100);
        setProgress(prog);
        onProgress?.(completed, total);
      },
      onAllComplete: () => {
        // 被取消的批次不许再改状态：否则会覆盖新批次刚设好的 isProcessing
        if (runIdRef.current !== runId) return;
        runningRef.current = false;
        setIsProcessing(false);
        if (hasPausedRef.current) {
          setIsPaused(true);
        } else {
          setIsPaused(false);
        }
        onAllComplete?.(statsRef.current);
        schedulerRef.current?.destroy();
        schedulerRef.current = null;
      },
    });

    // Add tasks
    for (const fileSnapshot of queue) {
      if (stopRef.current) break;

      schedulerRef.current.addTask({
        id: fileSnapshot.id,
        data: fileSnapshot,
        priority: 'normal',
        execute: async () => {
          if (stopRef.current) {
            hasPausedRef.current = true;
            throw new Error('Processing paused by user');
          }
          return await processSingleFileInternal(fileSnapshot);
        },
      });
    }

    schedulerRef.current.start();
  }, [concurrency, processSingleFileInternal, onProgress, onAllComplete]);

  // Process single file externally
  const processSingle = useCallback(async (file: AppFile): Promise<AppFile | null> => {
    return await processSingleFileInternal(file);
  }, [processSingleFileInternal]);

  // Pause
  const pause = useCallback(() => {
    if (isProcessing) {
      stopRef.current = true;
      schedulerRef.current?.pause();
      setIsPaused(true);
      // 强制补一次：调用方对进度做了节流，暂停时最后那张的计数可能刚被丢掉。
      // total 为 0 表示一个任务都还没开始，这时别回调——会把进度栏的总数清零导致它消失
      if (progressRef.current.total > 0) {
        onProgress?.(progressRef.current.completed, progressRef.current.total, true);
      }
    }
  }, [isProcessing, onProgress]);

  // Resume
  const resume = useCallback(() => {
    if (isPaused) {
      stopRef.current = false;
      schedulerRef.current?.resume();
      setIsProcessing(true);
      setIsPaused(false);
    }
  }, [isPaused]);

  // Cancel
  const cancel = useCallback(() => {
    // 令牌先推进：在飞任务的迟到回调全部作废
    runIdRef.current += 1;
    runningRef.current = false;
    stopRef.current = true;
    schedulerRef.current?.pause();
    schedulerRef.current?.destroy();
    schedulerRef.current = null;
    setIsProcessing(false);
    setIsPaused(false);
    setProgress(0);
  }, []);

  /**
   * 清掉本批的落盘目录（「清空列表」时调用）。
   * 目录删掉后必须把 ref 置空——否则下一批会往一个不存在的路径里写。
   */
  const clearWorkspace = useCallback(async () => {
    const ws = workspaceRef.current;
    workspaceRef.current = null;
    persistIndexRef.current = 0;
    if (ws) await clearWorkspaceDir(ws);
  }, []);

  return {
    isProcessing,
    isPaused,
    progress,
    processFiles,
    processSingle,
    pause,
    resume,
    cancel,
    clearWorkspace,
  };
}