/**
 * useWorkerProcessor Hook
 * 封装 Worker 实例管理，提供图片处理能力
 * 支持自动降级到主线程处理
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppFile, ProcessingConfig } from '../types';
import {
  WorkerMessageType,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResponseData,
  type WorkerProgress,
  type ProcessImagePayload,
} from '../workers/types';
import { processImage as processImageMainThread } from '../../services/imageProcessor';

/** 任务信息 */
interface TaskInfo {
  taskId: string;
  fileId: string;
  startTime: number;
  resolve: (value: WorkerResponseData) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: WorkerProgress) => void;
}

/** useWorkerProcessor 返回的接口 */
export interface UseWorkerProcessorReturn {
  /** 处理图片，返回 Promise */
  processImage: (
    appFile: AppFile,
    config: ProcessingConfig,
    onProgress?: (progress: WorkerProgress) => void
  ) => Promise<WorkerResponseData>;
  /** 取消特定任务 */
  cancelTask: (taskId: string) => void;
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 活跃任务列表 */
  activeTasks: string[];
  /** Worker 是否受支持 */
  isWorkerSupported: boolean;
}

/** Worker 实例包装器 */
class WorkerWrapper {
  private worker: Worker | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private errorHandler: ((error: ErrorEvent) => void) | null = null;

  constructor(private workerUrl: string) {}

  /**
   * 获取 Worker 实例（懒加载）
   */
  getInstance(): Worker {
    if (!this.worker) {
      this.worker = new Worker(this.workerUrl, { type: 'module' });
    }
    return this.worker;
  }

  /**
   * 设置消息处理器
   */
  onMessage(handler: (event: MessageEvent) => void): void {
    this.messageHandler = handler;
    this.getInstance().onmessage = handler;
  }

  /**
   * 设置错误处理器
   */
  onError(handler: (error: ErrorEvent) => void): void {
    this.errorHandler = handler;
    this.getInstance().onerror = handler;
  }

  /**
   * 发送消息到 Worker
   */
  postMessage(message: WorkerRequest): void {
    this.getInstance().postMessage(message);
  }

  /**
   * 终止 Worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.messageHandler = null;
      this.errorHandler = null;
    }
  }
}

/** Worker 路径 */
const WORKER_URL = '/src/workers/imageProcessor.worker.ts';

/** 最大重试次数 */
const MAX_RETRIES = 2;

/**
 * 检测浏览器是否支持 Worker
 */
const checkWorkerSupport = (): boolean => {
  return typeof Worker !== 'undefined';
};

/**
 * 生成唯一任务 ID
 */
const generateTaskId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 将 File 转换为 ArrayBuffer
 */
const fileToArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * useWorkerProcessor Hook
 * 管理 Worker 实例，提供图片处理能力
 */
export function useWorkerProcessor(): UseWorkerProcessorReturn {
  // Worker 实例引用
  const workerRef = useRef<WorkerWrapper | null>(null);
  // 活跃任务映射
  const tasksRef = useRef<Map<string, TaskInfo>>(new Map());
  // 重试计数映射
  const retryCountRef = useRef<Map<string, number>>(new Map());

  // 状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [isWorkerSupported] = useState(() => checkWorkerSupport());

  /**
   * 获取 Worker 实例（懒加载 + 缓存）
   */
  const getWorker = useCallback((): WorkerWrapper => {
    if (!workerRef.current) {
      workerRef.current = new WorkerWrapper(WORKER_URL);

      // 设置消息处理器
      workerRef.current.onMessage((event: MessageEvent) => {
        const data = event.data as WorkerResponse | WorkerProgress;

        if ('kind' in data && data.kind === 'progress') {
          // 处理进度更新
          const progress = data as WorkerProgress;
          const task = tasksRef.current.get(progress.taskId);
          if (task?.onProgress) {
            task.onProgress(progress);
          }
        } else if ('success' in data) {
          // 处理响应
          const response = data as WorkerResponse;
          const task = tasksRef.current.get(response.taskId);

          if (task) {
            if (response.success && response.data) {
              task.resolve(response.data);
            } else {
              task.reject(new Error(response.error || 'Worker processing failed'));
            }

            // 清理任务
            tasksRef.current.delete(response.taskId);
            retryCountRef.current.delete(response.taskId);
            updateActiveTasks();
          }
        }
      });

      // 设置错误处理器
      workerRef.current.onError((error: ErrorEvent) => {
        console.error('[useWorkerProcessor] Worker error:', error);

        // 将所有活跃任务标记为失败
        tasksRef.current.forEach((task) => {
          task.reject(new Error(`Worker error: ${error.message}`));
        });
        tasksRef.current.clear();
        retryCountRef.current.clear();
        updateActiveTasks();

        // 终止当前 Worker 以便下次重新创建
        workerRef.current?.terminate();
        workerRef.current = null;
      });
    }

    return workerRef.current;
  }, []);

  /**
   * 更新活跃任务列表
   */
  const updateActiveTasks = useCallback(() => {
    const tasks = Array.from(tasksRef.current.keys());
    setActiveTasks(tasks);
    setIsProcessing(tasks.length > 0);
  }, []);

  /**
   * 使用主线程处理（降级方案）
   */
  const processWithMainThread = useCallback(
    async (
      appFile: AppFile,
      config: ProcessingConfig,
      onProgress?: (progress: WorkerProgress) => void
    ): Promise<WorkerResponseData> => {
      const taskId = generateTaskId();

      // 发送初始进度
      onProgress?.({
        taskId,
        progress: 0,
        message: '正在加载图片...',
        phase: 'loading',
      });

      try {
        onProgress?.({
          taskId,
          progress: 30,
          message: '正在处理图片...',
          phase: 'processing',
        });

        const result = await processImageMainThread(appFile, config);

        onProgress?.({
          taskId,
          progress: 80,
          message: '正在编码...',
          phase: 'encoding',
        });

        // 计算处理后文件大小
        const processedSize = result.blob.size;
        const isSkipped =
          config.preventSizeInflation && processedSize > appFile.originalSize;

        onProgress?.({
          taskId,
          progress: 100,
          message: '处理完成',
          phase: 'encoding',
        });

        return {
          blob: result.blob,
          width: result.width,
          height: result.height,
          processedSize,
          isSkipped,
        };
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    []
  );

  /**
   * 使用 Worker 处理图片
   */
  const processWithWorker = useCallback(
    async (
      appFile: AppFile,
      config: ProcessingConfig,
      onProgress?: (progress: WorkerProgress) => void
    ): Promise<WorkerResponseData> => {
      const taskId = generateTaskId();

      return new Promise(async (resolve, reject) => {
        try {
          // 读取文件数据
          const imageData = await fileToArrayBuffer(appFile.file);

          // 创建任务信息
          const taskInfo: TaskInfo = {
            taskId,
            fileId: appFile.id,
            startTime: Date.now(),
            resolve,
            reject,
            onProgress,
          };

          // 存储任务
          tasksRef.current.set(taskId, taskInfo);
          updateActiveTasks();

          // 构建 payload
          const payload: ProcessImagePayload = {
            taskId,
            imageData,
            filename: appFile.file.name,
            mimeType: appFile.file.type,
            originalDimensions: appFile.dimensions,
            config,
          };

          // 发送消息到 Worker
          const request: WorkerRequest = {
            taskId,
            type: WorkerMessageType.PROCESS_IMAGE,
            payload,
          };

          getWorker().postMessage(request);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [getWorker, updateActiveTasks]
  );

  /**
   * 处理图片（自动选择 Worker 或主线程）
   */
  const processImage = useCallback(
    async (
      appFile: AppFile,
      config: ProcessingConfig,
      onProgress?: (progress: WorkerProgress) => void
    ): Promise<WorkerResponseData> => {
      const taskId = generateTaskId();

      const attemptProcess = async (retryCount: number): Promise<WorkerResponseData> => {
        try {
          // 如果支持 Worker 且未达到最大重试次数，使用 Worker
          if (isWorkerSupported && retryCount < MAX_RETRIES) {
            return await processWithWorker(appFile, config, onProgress);
          }

          // 否则使用主线程（降级方案）
          console.warn(
            `[useWorkerProcessor] Falling back to main thread for task ${taskId}` +
              (retryCount > 0 ? ` (retry ${retryCount})` : '')
          );
          return await processWithMainThread(appFile, config, onProgress);
        } catch (error) {
          // 如果是 Worker 错误且可以重试，切换到主线程
          if (isWorkerSupported && retryCount < MAX_RETRIES) {
            console.warn(
              `[useWorkerProcessor] Worker failed, retrying with main thread:`,
              error
            );
            return attemptProcess(retryCount + 1);
          }
          throw error;
        }
      };

      return attemptProcess(0);
    },
    [isWorkerSupported, processWithWorker, processWithMainThread]
  );

  /**
   * 取消特定任务
   */
  const cancelTask = useCallback((taskId: string): void => {
    const task = tasksRef.current.get(taskId);
    if (task) {
      // 发送取消消息到 Worker
      if (isWorkerSupported && workerRef.current) {
        const request: WorkerRequest = {
          taskId,
          type: WorkerMessageType.CANCEL,
        };
        workerRef.current.postMessage(request);
      }

      // 拒绝任务 Promise
      task.reject(new Error('Task cancelled'));

      // 清理任务
      tasksRef.current.delete(taskId);
      retryCountRef.current.delete(taskId);
      updateActiveTasks();
    }
  }, [isWorkerSupported, updateActiveTasks]);

  /**
   * 清理所有任务和 Worker
   */
  const cleanup = useCallback((): void => {
    // 取消所有活跃任务
    tasksRef.current.forEach((task) => {
      task.reject(new Error('Worker cleanup'));
    });
    tasksRef.current.clear();
    retryCountRef.current.clear();

    // 终止 Worker
    workerRef.current?.terminate();
    workerRef.current = null;

    updateActiveTasks();
  }, [updateActiveTasks]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    processImage,
    cancelTask,
    isProcessing,
    activeTasks,
    isWorkerSupported,
  };
}

export default useWorkerProcessor;
