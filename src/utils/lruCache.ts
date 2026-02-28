/**
 * LRU 缓存管理器 - 用于管理 processedBlob，实现自动淘汰机制
 *
 * 功能:
 * - 基于 Map 实现的 LRU (Least Recently Used) 缓存
 * - 支持最大容量限制和最大内存限制
 * - 访问时更新访问顺序，淘汰最久未使用的条目
 * - 支持淘汰回调，用于释放资源（如 Blob URL）
 */

/** LRU 缓存配置选项 */
export interface LRUCacheOptions<K, V> {
  /** 最大容量（条目数量） */
  maxSize: number;
  /** 最大内存限制（字节），可选 */
  maxMemory?: number;
  /** 淘汰回调，当条目被淘汰时触发 */
  onEvict?: (key: K, value: V) => void;
  /** 计算值大小的函数，用于内存限制 */
  getSize?: (value: V) => number;
}

/** LRU 缓存统计信息 */
export interface LRUCacheStats {
  /** 当前条目数量 */
  size: number;
  /** 最大容量 */
  maxSize: number;
  /** 当前内存使用量（字节） */
  memoryUsage: number;
  /** 命中次数 */
  hitCount: number;
  /** 未命中次数 */
  missCount: number;
  /** 淘汰次数 */
  evictionCount: number;
}

/**
 * LRU 缓存类
 *
 * 使用 Map 保持插入顺序实现 LRU 算法：
 * - Map 的迭代顺序是插入顺序
 * - 访问/设置时将条目移动到末尾（最新）
 * - 超过容量时淘汰头部（最旧）
 *
 * @template K - 键类型
 * @template V - 值类型
 */
export class LRUCache<K, V> {
  /** 存储条目的 Map（键 -> [值, 大小]） */
  private cache: Map<K, { value: V; size: number }>;

  /** 最大容量 */
  private maxSize: number;

  /** 最大内存限制（字节） */
  private maxMemory: number;

  /** 淘汰回调 */
  private onEvict?: (key: K, value: V) => void;

  /** 计算值大小的函数 */
  private getSize: (value: V) => number;

  /** 当前内存使用量 */
  private memoryUsage: number;

  /** 命中次数 */
  private hitCount: number;

  /** 未命中次数 */
  private missCount: number;

  /** 淘汰次数 */
  private evictionCount: number;

  /**
   * 创建 LRUCache 实例
   *
   * @param options - 缓存配置选项
   */
  constructor(options: LRUCacheOptions<K, V>) {
    if (options.maxSize <= 0) {
      throw new Error('maxSize must be greater than 0');
    }

    this.cache = new Map();
    this.maxSize = options.maxSize;
    this.maxMemory = options.maxMemory ?? Infinity;
    this.onEvict = options.onEvict;
    this.getSize = options.getSize ?? (() => 0);

    this.memoryUsage = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  /**
   * 获取缓存中的值
   * 如果存在，将条目移动到最新位置（LRU）
   *
   * @param key - 键
   * @returns 值，如果不存在返回 undefined
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      this.missCount++;
      return undefined;
    }

    // 移动到最新位置（删除后重新插入）
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hitCount++;
    return entry.value;
  }

  /**
   * 设置缓存值
   * 如果已存在则更新，否则添加新条目
   * 可能触发淘汰机制
   *
   * @param key - 键
   * @param value - 值
   */
  set(key: K, value: V): void {
    const size = this.getSize(value);

    // 如果单个条目超过最大内存限制，直接拒绝
    if (size > this.maxMemory && this.maxMemory !== Infinity) {
      console.warn(`[LRUCache] Entry size (${size}) exceeds maxMemory (${this.maxMemory}), skipping`);
      return;
    }

    // 如果键已存在，先删除旧条目
    const existingEntry = this.cache.get(key);
    if (existingEntry !== undefined) {
      this.cache.delete(key);
      this.memoryUsage -= existingEntry.size;
    }

    // 淘汰条目直到有足够的空间和内存
    this.evictIfNeeded(size);

    // 添加新条目
    this.cache.set(key, { value, size });
    this.memoryUsage += size;
  }

  /**
   * 删除特定键
   *
   * @param key - 要删除的键
   * @returns 是否成功删除
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return false;
    }

    this.cache.delete(key);
    this.memoryUsage -= entry.size;

    // 触发淘汰回调
    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }

    return true;
  }

  /**
   * 检查键是否存在
   *
   * @param key - 键
   * @returns 是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 清空缓存
   * 触发所有条目的淘汰回调
   */
  clear(): void {
    // 触发所有条目的淘汰回调
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }

    this.cache.clear();
    this.memoryUsage = 0;
  }

  /**
   * 调整缓存容量
   * 如果新容量小于当前大小，会触发淘汰
   *
   * @param maxSize - 新的最大容量
   */
  resize(maxSize: number): void {
    if (maxSize <= 0) {
      throw new Error('maxSize must be greater than 0');
    }

    this.maxSize = maxSize;

    // 如果当前大小超过新容量，触发淘汰
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }

    // 检查内存限制
    while (this.memoryUsage > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * 获取缓存统计信息
   *
   * @returns 统计信息对象
   */
  getStats(): LRUCacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsage: this.memoryUsage,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
    };
  }

  /**
   * 手动删除特定键（不从 onEvict 回调）
   * 用于组件需要主动清理特定条目而不触发淘汰回调的场景
   *
   * @param key - 要删除的键
   * @returns 被删除的值，如果不存在返回 undefined
   */
  remove(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }

    this.cache.delete(key);
    this.memoryUsage -= entry.size;

    return entry.value;
  }

  /**
   * 获取缓存的键列表（按访问顺序，从早到晚）
   * 主要用于测试和调试
   *
   * @returns 键数组
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有值（按访问顺序，从早到晚）
   * 主要用于测试和调试
   *
   * @returns 值数组
   */
  values(): V[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }



  /**
   * 淘汰最久未使用的条目，直到有足够的空间和内存
   *
   * @param neededSize - 需要的新条目大小
   */
  private evictIfNeeded(neededSize: number): void {
    // 检查容量限制
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // 检查内存限制
    while (this.memoryUsage + neededSize > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * 淘汰最久未使用的条目（LRU）
   * Map 的 entries() 迭代器按插入顺序返回，第一个是最旧的
   */
  private evictLRU(): void {
    const firstEntry = this.cache.entries().next();
    if (firstEntry.done) {
      return;
    }

    const [key, entry] = firstEntry.value;
    this.cache.delete(key);
    this.memoryUsage -= entry.size;
    this.evictionCount++;

    // 触发淘汰回调
    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }
  }
}

export default LRUCache;
