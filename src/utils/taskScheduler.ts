/**
 * 智能任务调度器
 * 管理批量图片处理任务的并发执行，支持动态调整、优先级队列和内存感知
 */

import { MemoryMonitor, PressureLevel, MemoryInfo } from './memoryMonitor';

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 任务对象接口
 */
export interface Task<T = unknown> {
  /** 任务唯一标识 */
  id: string;
  /** 任务数据 */
  data: T;
  /** 任务优先级 */
  priority: TaskPriority;
  /** 任务状态 */
  status: TaskStatus;
  /** 任务创建时间 */
  createdAt: number;
  /** 任务开始时间 */
  startedAt?: number;
  /** 任务完成时间 */
  completedAt?: number;
  /** 错误信息 */
  error?: Error;
  /** 执行任务的函数 */
  execute: () => Promise<unknown>;
}

/**
 * 调度器配置
 */
export interface TaskSchedulerConfig {
  /** 初始并发数，默认根据 CPU 核心数 */
  concurrency?: number;
  /** 最大并发数限制 */
  maxConcurrency?: number;
  /** 最小并发数限制 */
  minConcurrency?: number;
  /** 是否启用自动调整并发 */
  autoAdjust?: boolean;
  /** 内存压力阈值 */
  pressureThresholds?: {
    fair: number;
    serious: number;
    critical: number;
  };
  /** 任务完成回调 */
  onTaskComplete?: (task: Task, result: unknown) => void;
  /** 任务失败回调 */
  onTaskError?: (task: Task, error: Error) => void;
  /** 所有任务完成回调 */
  onAllComplete?: () => void;
  /** 进度更新回调 */
  onProgress?: (completed: number, total: number) => void;
  /** 并发数变化回调 */
  onConcurrencyChange?: (newConcurrency: number, reason: string) => void;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 调度器统计信息
 */
export interface SchedulerStats {
  /** 总任务数 */
  total: number;
  /** 待处理任务数 */
  pending: number;
  /** 运行中任务数 */
  running: number;
  /** 已完成任务数 */
  completed: number;
  /** 失败任务数 */
  failed: number;
  /** 已取消任务数 */
  cancelled: number;
  /** 当前并发数 */
  concurrency: number;
  /** 是否正在运行 */
  isRunning: boolean;
  /** 是否已暂停 */
  isPaused: boolean;
}

/**
 * 优先级权重映射
 */
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<Omit<TaskSchedulerConfig, 'onTaskComplete' | 'onTaskError' | 'onAllComplete' | 'onProgress' | 'onConcurrencyChange'>> = {
  concurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
  maxConcurrency: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) * 2 : 8,
  minConcurrency: 1,
  autoAdjust: true,
  pressureThresholds: {
    fair: 0.5,
    serious: 0.7,
    critical: 0.85,
  },
  debug: false,
};

/**
 * 智能任务调度器类
 */
export class TaskScheduler {
  private tasks: Map<string, Task> = new Map();
  private runningTasks: Set<string> = new Set();
  private concurrency: number;
  private maxConcurrency: number;
  private minConcurrency: number;
  private autoAdjust: boolean;
  private isRunning = false;
  private isPaused = false;
  private isDestroyed = false;
  private memoryMonitor: MemoryMonitor;
  private debug: boolean;
  private checkInterval?: number;
  private callbacks: {
    onTaskComplete?: (task: Task, result: unknown) => void;
    onTaskError?: (task: Task, error: Error) => void;
    onAllComplete?: () => void;
    onProgress?: (completed: number, total: number) => void;
    onConcurrencyChange?: (newConcurrency: number, reason: string) => void;
  } = {};
  /** 防止 onAllComplete 被多次调用 */
  private hasTriggeredAllComplete = false;
  /** 待处理队列的排序缓存；新增/取消任务时置脏 */
  private pendingCache: Task[] = [];
  private pendingDirty = true;

  /**
   * 创建调度器实例
   * @param config 调度器配置
   */
  constructor(config: TaskSchedulerConfig = {}) {
    this.concurrency = config.concurrency ?? DEFAULT_CONFIG.concurrency;
    this.maxConcurrency = config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency;
    this.minConcurrency = config.minConcurrency ?? DEFAULT_CONFIG.minConcurrency;
    this.autoAdjust = config.autoAdjust ?? DEFAULT_CONFIG.autoAdjust;
    this.debug = config.debug ?? DEFAULT_CONFIG.debug;

    // 确保并发数在合理范围内
    this.concurrency = Math.max(
      this.minConcurrency,
      Math.min(this.concurrency, this.maxConcurrency)
    );

    // 设置回调
    this.callbacks = {
      onTaskComplete: config.onTaskComplete,
      onTaskError: config.onTaskError,
      onAllComplete: config.onAllComplete,
      onProgress: config.onProgress,
      onConcurrencyChange: config.onConcurrencyChange,
    };

    // 初始化内存监控
    this.memoryMonitor = new MemoryMonitor({
      thresholds: config.pressureThresholds ?? DEFAULT_CONFIG.pressureThresholds,
      checkInterval: this.autoAdjust ? 2000 : undefined,
      onPressureChange: this.autoAdjust ? this.handlePressureChange.bind(this) : undefined,
      debug: this.debug,
    });

    this.log('调度器初始化完成', {
      concurrency: this.concurrency,
      maxConcurrency: this.maxConcurrency,
      minConcurrency: this.minConcurrency,
      autoAdjust: this.autoAdjust,
    });
  }

  /**
   * 记录调试日志
   */
  private log(message: string, data?: unknown): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[TaskScheduler] ${message}`, data ?? '');
    }
  }

  /**
   * 处理内存压力变化
   */
  private handlePressureChange(level: PressureLevel, info: MemoryInfo): void {
    if (!this.autoAdjust || this.isDestroyed) return;

    const oldConcurrency = this.concurrency;
    let newConcurrency = oldConcurrency;
    let reason = '';

    switch (level) {
      case 'critical':
        newConcurrency = Math.max(1, Math.floor(oldConcurrency * 0.25));
        reason = '内存压力严重，大幅降低并发';
        break;
      case 'serious':
        newConcurrency = Math.max(1, Math.floor(oldConcurrency * 0.5));
        reason = '内存压力较高，降低并发';
        break;
      case 'fair':
        newConcurrency = Math.max(1, oldConcurrency - 1);
        reason = '内存压力轻微，适当降低并发';
        break;
      case 'normal':
        // 压力正常时，可以适度恢复并发
        if (oldConcurrency < this.maxConcurrency) {
          newConcurrency = Math.min(this.maxConcurrency, oldConcurrency + 1);
          reason = '内存压力正常，适度提升并发';
        }
        break;
    }

    // 确保在范围内
    newConcurrency = Math.max(this.minConcurrency, Math.min(newConcurrency, this.maxConcurrency));

    if (newConcurrency !== oldConcurrency) {
      this.concurrency = newConcurrency;
      this.log(reason, { old: oldConcurrency, new: newConcurrency, memory: info });
      this.callbacks.onConcurrencyChange?.(newConcurrency, reason);

      // 如果正在运行，尝试处理更多任务或暂停部分
      if (this.isRunning && !this.isPaused) {
        this.processQueue();
      }
    }
  }

  /**
   * 获取任务优先级分数（用于排序）
   */
  private getTaskPriorityScore(task: Task): number {
    const weight = PRIORITY_WEIGHTS[task.priority];
    const age = Date.now() - task.createdAt;
    // 年龄权重：等待越久的任务优先级略微提升
    const ageBonus = Math.min(age / 60000, 1); // 最多加 1 分（等待1分钟）
    return weight + ageBonus;
  }

  /**
   * 获取待处理任务队列（已排序）
   * 缓存排序结果：只有新增/取消任务时才置脏重排，避免每完成一个任务就把全表重排一遍
   */
  private getPendingQueue(): Task[] {
    if (this.pendingDirty) {
      this.pendingCache = Array.from(this.tasks.values())
        .filter((task) => task.status === 'pending')
        .sort((a, b) => this.getTaskPriorityScore(b) - this.getTaskPriorityScore(a));
      this.pendingDirty = false;
      return this.pendingCache;
    }
    // 状态会变化，取用时过滤掉已启动/已取消的，但不再重排
    this.pendingCache = this.pendingCache.filter((task) => task.status === 'pending');
    return this.pendingCache;
  }

  /**
   * 添加任务
   * @param task 任务对象
   * @returns 任务 ID
   */
  public addTask<T>(task: Omit<Task<T>, 'id' | 'status' | 'createdAt'> & { id?: string }): string {
    if (this.isDestroyed) {
      throw new Error('调度器已被销毁，无法添加任务');
    }

    const fullTask: Task = {
      ...task,
      id: task.id ?? this.generateId(),
      status: 'pending',
      createdAt: Date.now(),
    } as Task;

    this.tasks.set(fullTask.id, fullTask);
    this.pendingDirty = true;
    this.log('添加任务', { id: fullTask.id, priority: fullTask.priority });

    // 如果正在运行，尝试处理
    if (this.isRunning && !this.isPaused) {
      // 使用 setTimeout 避免阻塞
      setTimeout(() => this.processQueue(), 0);
    }

    return fullTask.id;
  }

  /**
   * 批量添加任务
   * @param tasks 任务数组
   * @returns 任务 ID 数组
   */
  public addTasks<T>(tasks: Array<Omit<Task<T>, 'id' | 'status' | 'createdAt'> & { id?: string }>): string[] {
    return tasks.map((task) => this.addTask(task));
  }

  /**
   * 取消任务
   * @param taskId 任务 ID
   * @returns 是否成功取消
   */
  public cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'pending') {
      task.status = 'cancelled';
      this.pendingDirty = true;
      this.log('取消任务', { id: taskId });
      this.reportProgress();
      return true;
    }

    // 运行中的任务无法直接取消，但会标记
    if (task.status === 'running') {
      this.log('任务正在运行，标记为取消', { id: taskId });
      return false;
    }

    return false;
  }

  /**
   * 批量取消任务
   * @param taskIds 任务 ID 数组
   * @returns 成功取消的数量
   */
  public cancelMultiple(taskIds: string[]): number {
    return taskIds.filter((id) => this.cancel(id)).length;
  }

  /**
   * 暂停处理
   */
  public pause(): void {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.log('调度器已暂停');
  }

  /**
   * 恢复处理
   */
  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.log('调度器已恢复');
    this.processQueue();
  }

  /**
  /**
   * 开始处理任务
   */
  public start(): void {
    if (this.isRunning || this.isDestroyed) return;

    this.isRunning = true;
    this.isPaused = false;
    this.hasTriggeredAllComplete = false; // 重置标志
    this.log('调度器开始运行');
    this.processQueue();
  }

  /**
   * 停止处理（不清除任务）
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.isPaused = false;
    this.log('调度器已停止');
  }


  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning || this.isPaused || this.isDestroyed) return;

    // 检查当前运行中的任务数
    const availableSlots = this.concurrency - this.runningTasks.size;
    if (availableSlots <= 0) return;

    // 获取待处理任务
    const pendingQueue = this.getPendingQueue();
    if (pendingQueue.length === 0) {
      // 检查是否所有任务都已完成（只触发一次）
      if (this.runningTasks.size === 0 && this.tasks.size > 0 && !this.hasTriggeredAllComplete) {
        this.hasTriggeredAllComplete = true;
        this.callbacks.onAllComplete?.();
      }
      return;
    }


    // 启动新任务
    const tasksToStart = pendingQueue.slice(0, availableSlots);

    // 使用 Promise.allSettled 并行启动
    await Promise.allSettled(
      tasksToStart.map((task) => this.executeTask(task))
    );

    // 如果还有可用槽位和待处理任务，继续处理
    if (this.isRunning && !this.isPaused) {
      setTimeout(() => this.processQueue(), 0);
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: Task): Promise<void> {
    if (task.status !== 'pending') return;

    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.add(task.id);

    this.log('开始执行任务', { id: task.id });

    try {
      const result = await task.execute();

      // 注意：运行中的任务不响应 cancel（cancel 只处理 pending），所以这里不需要
      // 再判断 cancelled —— 那是个永远走不到的分支，TS 也会把它标成死代码。
      task.status = 'completed';
      task.completedAt = Date.now();
      this.log('任务完成', { id: task.id, duration: task.completedAt - task.startedAt });
      this.callbacks.onTaskComplete?.(task, result);
    } catch (error) {
      task.status = 'failed';
      task.error = error as Error;
      task.completedAt = Date.now();
      this.log('任务失败', { id: task.id, error: (error as Error).message });
      this.callbacks.onTaskError?.(task, error as Error);
    } finally {
      this.runningTasks.delete(task.id);
      this.reportProgress();

      // 尝试启动下一个任务
      if (this.isRunning && !this.isPaused) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }

  /**
   * 报告进度
   */
  private reportProgress(): void {
    const stats = this.getStats();
    this.callbacks.onProgress?.(stats.completed, stats.total);
  }

  /**
   * 设置并发数
   * @param n 并发数
   */
  public setConcurrency(n: number): void {
    const oldConcurrency = this.concurrency;
    this.concurrency = Math.max(this.minConcurrency, Math.min(n, this.maxConcurrency));

    if (this.concurrency !== oldConcurrency) {
      this.log('并发数已调整', { old: oldConcurrency, new: this.concurrency });
      this.callbacks.onConcurrencyChange?.(this.concurrency, '手动调整');

      // 如果正在运行，尝试处理更多任务
      if (this.isRunning && !this.isPaused && this.concurrency > oldConcurrency) {
        this.processQueue();
      }
    }
  }

  /**
   * 获取当前并发数
   */
  public getConcurrency(): number {
    return this.concurrency;
  }

  /**
   * 获取任务
   * @param taskId 任务 ID
   */
  public getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  public getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取统计信息
   */
  public getStats(): SchedulerStats {
    // 单次遍历统计，原来是 6 次全量 filter
    let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0;
    for (const t of this.tasks.values()) {
      switch (t.status) {
        case 'pending': pending++; break;
        case 'running': running++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'cancelled': cancelled++; break;
      }
    }
    return {
      total: this.tasks.size,
      pending,
      running,
      completed,
      failed,
      cancelled,
      concurrency: this.concurrency,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
    };
  }

  /**
   * 清空所有任务
   * @param includeRunning 是否包括运行中的任务
   */
  public clear(includeRunning = false): void {
    this.pendingDirty = true;
    if (includeRunning) {
      this.tasks.clear();
      this.runningTasks.clear();
    } else {
      // 只清除非运行中的任务
      for (const [id, task] of this.tasks) {
        if (task.status !== 'running') {
          this.tasks.delete(id);
        }
      }
    }
    this.log('任务队列已清空', { includeRunning });
  }

  /**
   * 等待所有任务完成
   * @param timeout 可选的超时时间（毫秒）
   * @returns Promise，在所有任务完成时 resolve，超时 reject
   */
  public async waitForComplete(timeout?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: number | undefined;
      
      const checkComplete = () => {
        const stats = this.getStats();
        if (stats.pending === 0 && stats.running === 0) {
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        } else if (!this.isDestroyed) {
          // 继续检查，使用 setTimeout 避免阻塞
          setTimeout(checkComplete, 100);
        }
      };
      
      // 设置超时
      if (timeout && timeout > 0) {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`等待任务完成超时 (${timeout}ms)`));
        }, timeout);
      }
      
      checkComplete();
    });
  }


  /**
   * 销毁调度器
   */
  public destroy(): void {
    this.stop();
    this.isDestroyed = true;
    this.memoryMonitor.destroy();
    this.tasks.clear();
    this.runningTasks.clear();
    this.callbacks = {};
    this.log('调度器已销毁');
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取默认并发数（基于 CPU 核心数）
   */
  public static getDefaultConcurrency(): number {
    if (typeof navigator !== 'undefined') {
      return navigator.hardwareConcurrency || 4;
    }
    return 4;
  }

  /**
   * 获取建议的最大并发数
   */
  public static getSuggestedMaxConcurrency(): number {
    return TaskScheduler.getDefaultConcurrency() * 2;
  }
}

/**
 * 创建默认调度器实例
 */
export const taskScheduler = new TaskScheduler();

// 默认导出
export default TaskScheduler;
