/**
 * BlobManager - 统一管理 Blob URL 的创建和销毁
 *
 * 功能:
 * - 使用引用计数机制管理 Blob URL 生命周期
 * - 相同 Blob 多次创建返回相同 URL，增加引用计数
 * - 自动在引用为0时销毁 URL
 */

interface BlobEntry {
  /** 引用的 Blob 对象 */
  blob: Blob;
  /** 创建的 Object URL */
  url: string;
  /** 引用计数 */
  refCount: number;
  /** 创建时间戳 */
  createdAt: number;
}

interface BlobStats {
  /** 管理的 Blob 总数 */
  totalCount: number;
  /** 待释放的 URL 数量（引用计数 > 0） */
  activeCount: number;
  /** 待销毁的 URL 数量（引用计数 = 0，但未清理） */
  pendingReleaseCount: number;
}

/**
 * Blob 管理器类
 * 提供单例模式，通过 BlobManager.getInstance() 获取实例
 */
export class BlobManager {
  private static instance: BlobManager | null = null;

  /** URL 到条目映射 */
  private urlMap: Map<string, BlobEntry> = new Map();

  /** Blob 内容哈希到 URL 映射（用于相同 Blob 复用） */
  private blobMap: Map<string, string> = new Map();

  private constructor() {
    // 私有构造函数，确保单例模式
  }

  /**
   * 获取 BlobManager 单例实例
   */
  public static getInstance(): BlobManager {
    if (!BlobManager.instance) {
      BlobManager.instance = new BlobManager();
    }
    return BlobManager.instance;
  }

  /**
   * 销毁单例实例（主要用于测试）
   */
  public static destroyInstance(): void {
    if (BlobManager.instance) {
      BlobManager.instance.releaseAll();
      BlobManager.instance = null;
    }
  }

  /**
   * 创建 Blob URL
   * 如果相同的 Blob 已经存在，则增加引用计数并返回已有 URL
   *
   * @param blob - 要创建 URL 的 Blob 对象
   * @returns 创建的 Object URL 字符串
   */
  public create(blob: Blob): string {
    const blobKey = this.getBlobKey(blob);

    // 检查是否已存在相同的 Blob
    const existingUrl = this.blobMap.get(blobKey);
    if (existingUrl) {
      const entry = this.urlMap.get(existingUrl);
      if (entry) {
        entry.refCount++;
        return existingUrl;
      }
    }

    // 创建新的 URL
    const url = URL.createObjectURL(blob);
    const entry: BlobEntry = {
      blob,
      url,
      refCount: 1,
      createdAt: Date.now(),
    };

    this.urlMap.set(url, entry);
    this.blobMap.set(blobKey, url);

    return url;
  }

  /**
   * 释放 Blob URL
   * 减少引用计数，当引用为0时调用 revokeObjectURL
   *
   * @param url - 要释放的 Object URL
   */
  public release(url: string): void {
    const entry = this.urlMap.get(url);
    if (!entry) {
      console.warn(`[BlobManager] 尝试释放不存在的 URL: ${url}`);
      return;
    }

    entry.refCount--;

    if (entry.refCount <= 0) {
      // 引用为0，销毁 URL
      URL.revokeObjectURL(url);
      this.urlMap.delete(url);

      // 从 blobMap 中移除
      const blobKey = this.getBlobKey(entry.blob);
      this.blobMap.delete(blobKey);
    }
  }

  /**
   * 释放所有管理的 Blob URL
   * 强制销毁所有 URL，无论引用计数如何
   */
  public releaseAll(): void {
    for (const [url, entry] of this.urlMap) {
      URL.revokeObjectURL(url);
      console.log(
        `[BlobManager] 强制释放 URL (引用计数: ${entry.refCount}): ${url}`
      );
    }
    this.urlMap.clear();
    this.blobMap.clear();
  }

  /**
   * 获取当前管理的统计信息
   *
   * @returns 统计信息对象
   */
  public getStats(): BlobStats {
    let activeCount = 0;
    let pendingReleaseCount = 0;

    for (const entry of this.urlMap.values()) {
      if (entry.refCount > 0) {
        activeCount++;
      } else {
        pendingReleaseCount++;
      }
    }

    return {
      totalCount: this.urlMap.size,
      activeCount,
      pendingReleaseCount,
    };
  }

  /**
   * 获取指定 URL 的引用计数
   * 主要用于测试和调试
   *
   * @param url - Object URL
   * @returns 引用计数，如果不存在返回 -1
   */
  public getRefCount(url: string): number {
    const entry = this.urlMap.get(url);
    return entry ? entry.refCount : -1;
  }

  /**
   * 检查 URL 是否由当前管理器管理
   *
   * @param url - Object URL
   * @returns 是否被管理
   */
  public has(url: string): boolean {
    return this.urlMap.has(url);
  }

  /**
   * 生成 Blob 的唯一键
   * 使用 size 和 type 组合作为简单标识
   * 注意：这不保证 100% 唯一，但对于相同文件足够
   *
   * @param blob - Blob 对象
   * @returns 唯一键字符串
   */
  private getBlobKey(blob: Blob): string {
    return `${blob.size}-${blob.type}`;
  }
}

/**
 * 获取 BlobManager 单例实例
 * 使用 getter 函数确保总是返回当前有效的实例
 */
export const blobManager = BlobManager.getInstance();

/**
 * 获取 BlobManager 实例（动态）
 * 当不确定实例是否被销毁时，使用此函数
 */
export const getBlobManager = (): BlobManager => BlobManager.getInstance();

export default BlobManager;
