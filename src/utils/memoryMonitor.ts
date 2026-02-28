/**
 * 内存监控工具
 * 提供内存使用量检测和压力警告机制
 * 用于智能并发调度和 LRU 缓存的基础支持
 */

/**
 * 内存信息接口
 */
export interface MemoryInfo {
  /** 已使用的 JS 堆内存（字节） */
  usedJSHeapSize: number;
  /** 总 JS 堆内存（字节） */
  totalJSHeapSize: number;
  /** JS 堆内存限制（字节） */
  jsHeapSizeLimit: number;
  /** 设备内存（GB），可能不可用 */
  deviceMemory?: number;
  /** 内存使用率（0-1） */
  usageRatio: number;
}

/**
 * 内存压力级别
 */
export type PressureLevel = 'normal' | 'fair' | 'serious' | 'critical';

/**
 * 压力阈值配置
 */
export interface PressureThresholds {
  /** 轻微压力阈值（默认 0.5） */
  fair: number;
  /** 严重压力阈值（默认 0.7） */
  serious: number;
  /** 临界压力阈值（默认 0.85） */
  critical: number;
}

/**
 * 内存监控配置
 */
export interface MemoryMonitorConfig {
  /** 压力阈值 */
  thresholds?: Partial<PressureThresholds>;
  /** 检测间隔（毫秒），不设置则不自动检测 */
  checkInterval?: number;
  /** 压力变化回调 */
  onPressureChange?: (level: PressureLevel, info: MemoryInfo) => void;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 默认压力阈值
 */
const DEFAULT_THRESHOLDS: PressureThresholds = {
  fair: 0.5,
  serious: 0.7,
  critical: 0.85,
};

/**
 * 扩展 Performance 接口以包含内存信息
 */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * 扩展 Navigator 接口以包含设备内存信息
 */
interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * 获取当前内存使用情况
 * @returns 内存信息对象
 */
export function getMemoryUsage(): MemoryInfo {
  const perf = performance as PerformanceWithMemory;
  const nav = navigator as NavigatorWithDeviceMemory;

  // 默认值为 0
  let usedJSHeapSize = 0;
  let totalJSHeapSize = 0;
  let jsHeapSizeLimit = 0;

  // Chrome 支持 performance.memory
  if (perf.memory) {
    usedJSHeapSize = perf.memory.usedJSHeapSize;
    totalJSHeapSize = perf.memory.totalJSHeapSize;
    jsHeapSizeLimit = perf.memory.jsHeapSizeLimit;
  } else {
    // 对于不支持 performance.memory 的浏览器，尝试估算
    // 使用一个保守的默认值
    jsHeapSizeLimit = 2147483648; // 2GB 默认值
    totalJSHeapSize = jsHeapSizeLimit;
    usedJSHeapSize = 0; // 无法获取时返回 0
  }

  // 计算使用率
  const usageRatio = jsHeapSizeLimit > 0 ? usedJSHeapSize / jsHeapSizeLimit : 0;

  return {
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit,
    deviceMemory: nav.deviceMemory,
    usageRatio,
  };
}

/**
 * 检查当前内存压力级别
 * @param thresholds 可选的自定义阈值
 * @returns 压力级别
 */
export function checkMemoryPressure(
  thresholds?: Partial<PressureThresholds>
): PressureLevel {
  const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const { usageRatio } = getMemoryUsage();

  if (usageRatio >= mergedThresholds.critical) {
    return 'critical';
  }
  if (usageRatio >= mergedThresholds.serious) {
    return 'serious';
  }
  if (usageRatio >= mergedThresholds.fair) {
    return 'fair';
  }
  return 'normal';
}

/**
 * 将字节数转换为可读格式
 * @param bytes 字节数
 * @returns 可读字符串（如 "1.5 MB"）
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 估算对象大小（字节）
 * 用于估算 Blob、ArrayBuffer、字符串等的大小
 * @param obj 要估算大小的对象
 * @returns 估算的字节数
 */
export function estimateObjectSize(obj: unknown): number {
  if (obj === null || obj === undefined) {
    return 0;
  }

  // ArrayBuffer
  if (obj instanceof ArrayBuffer) {
    return obj.byteLength;
  }

  // TypedArray
  if (ArrayBuffer.isView(obj)) {
    return obj.byteLength;
  }

  // Blob
  if (obj instanceof Blob) {
    return obj.size;
  }

  // File
  if (obj instanceof File) {
    return obj.size;
  }

  // 字符串
  if (typeof obj === 'string') {
    // UTF-8 编码，每个字符 1-4 字节
    return new Blob([obj]).size;
  }

  // 数字
  if (typeof obj === 'number') {
    return 8; // 64 位浮点数
  }

  // 布尔值
  if (typeof obj === 'boolean') {
    return 4;
  }

  // 数组
  if (Array.isArray(obj)) {
    let size = 0;
    for (const item of obj) {
      size += estimateObjectSize(item);
    }
    // 数组本身的开销
    return size + 32;
  }

  // 普通对象
  if (typeof obj === 'object') {
    let size = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        size += estimateObjectSize(key);
        size += estimateObjectSize((obj as Record<string, unknown>)[key]);
      }
    }
    // 对象本身的开销
    return size + 56;
  }

  // 函数
  if (typeof obj === 'function') {
    return 0; // 函数大小难以估算，返回 0
  }

  return 0;
}

/**
 * 内存监控器类
 * 提供可配置的内存监控和压力检测
 */
export class MemoryMonitor {
  private thresholds: PressureThresholds;
  private checkInterval?: number;
  private onPressureChange?: (level: PressureLevel, info: MemoryInfo) => void;
  private debug: boolean;
  private currentPressure: PressureLevel = 'normal';
  private intervalId?: number;

  /**
   * 创建内存监控器实例
   * @param config 监控配置
   */
  constructor(config: MemoryMonitorConfig = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.checkInterval = config.checkInterval;
    this.onPressureChange = config.onPressureChange;
    this.debug = config.debug ?? false;

    // 如果设置了检测间隔，自动开始监控
    if (this.checkInterval && this.checkInterval > 0) {
      this.start();
    }
  }

  /**
   * 记录调试日志
   * @param message 日志消息
   * @param data 附加数据
   */
  private log(message: string, data?: unknown): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[MemoryMonitor] ${message}`, data ?? '');
    }
  }

  /**
   * 获取当前内存使用情况
   * @returns 内存信息
   */
  public getMemoryInfo(): MemoryInfo {
    return getMemoryUsage();
  }

  /**
   * 检查当前内存压力
   * @returns 压力级别
   */
  public checkPressure(): PressureLevel {
    return checkMemoryPressure(this.thresholds);
  }

  /**
   * 手动触发压力检测
   * 会触发回调（如果压力级别发生变化）
   * @returns 当前压力级别
   */
  public check(): PressureLevel {
    const info = this.getMemoryInfo();
    const newPressure = checkMemoryPressure(this.thresholds);

    if (newPressure !== this.currentPressure) {
      this.log(`压力级别变化: ${this.currentPressure} -> ${newPressure}`, info);
      this.currentPressure = newPressure;
      this.onPressureChange?.(newPressure, info);
    }

    return newPressure;
  }

  /**
   * 开始定期监控
   * @param interval 可选的间隔时间（毫秒），覆盖配置中的值
   */
  public start(interval?: number): void {
    if (this.intervalId !== undefined) {
      this.stop();
    }

    const ms = interval ?? this.checkInterval ?? 5000;
    this.intervalId = window.setInterval(() => {
      this.check();
    }, ms);

    this.log(`监控已启动，间隔: ${ms}ms`);
  }

  /**
   * 停止定期监控
   */
  public stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.log('监控已停止');
    }
  }

  /**
   * 更新压力阈值
   * @param thresholds 新的阈值配置
   */
  public setThresholds(thresholds: Partial<PressureThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.log('阈值已更新', this.thresholds);
  }

  /**
   * 获取当前阈值配置
   * @returns 当前阈值
   */
  public getThresholds(): PressureThresholds {
    return { ...this.thresholds };
  }

  /**
   * 设置压力变化回调
   * @param callback 回调函数
   */
  public setOnPressureChange(
    callback: (level: PressureLevel, info: MemoryInfo) => void
  ): void {
    this.onPressureChange = callback;
  }

  /**
   * 获取当前压力级别
   * @returns 当前压力级别
   */
  public getCurrentPressure(): PressureLevel {
    return this.currentPressure;
  }

  /**
   * 检查是否正在监控
   * @returns 是否正在监控
   */
  public isMonitoring(): boolean {
    return this.intervalId !== undefined;
  }

  /**
   * 销毁监控器，清理资源
   */
  public destroy(): void {
    this.stop();
    this.onPressureChange = undefined;
  }
}

/**
 * 创建默认的内存监控器实例
 */
export const memoryMonitor = new MemoryMonitor();

// 默认导出
export default MemoryMonitor;
