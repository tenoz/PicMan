/**
 * BlobManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlobManager, blobManager, getBlobManager } from '../blobManager';

// 模拟 URL.createObjectURL 和 URL.revokeObjectURL
global.URL.createObjectURL = vi.fn((blob: Blob) => {
  return `blob:mock-url-${blob.size}-${Date.now()}`;
});

global.URL.revokeObjectURL = vi.fn();

describe('BlobManager', () => {
  beforeEach(() => {
    // 每次测试前销毁实例并重新创建
    BlobManager.destroyInstance();
  });

  afterEach(() => {
    // 清理
    BlobManager.destroyInstance();
    vi.clearAllMocks();
  });

  describe('单例模式', () => {
    it('getInstance 应返回相同实例', () => {
      const instance1 = BlobManager.getInstance();
      const instance2 = BlobManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('destroyInstance 应销毁实例', () => {
      const instance1 = BlobManager.getInstance();
      BlobManager.destroyInstance();
      const instance2 = BlobManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('create 方法', () => {
    it('应创建新的 Blob URL', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test content'], { type: 'text/plain' });

      const url = manager.create(blob);

      expect(url).toBeDefined();
      expect(url.startsWith('blob:')).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('相同 Blob 应返回相同 URL 并增加引用计数', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['same content'], { type: 'text/plain' });

      const url1 = manager.create(blob);
      const url2 = manager.create(blob);

      // 应返回相同 URL
      expect(url1).toBe(url2);
      // URL.createObjectURL 只应被调用一次
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      // 引用计数应为 2
      expect(manager.getRefCount(url1)).toBe(2);
    });

    it('不同 Blob 应创建不同 URL', () => {
      const manager = BlobManager.getInstance();
      const blob1 = new Blob(['content A'], { type: 'text/plain' });
      const blob2 = new Blob(['content B longer'], { type: 'text/plain' });

      const url1 = manager.create(blob1);
      const url2 = manager.create(blob2);

      expect(url1).not.toBe(url2);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('release 方法', () => {
    it('应减少引用计数', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);
      expect(manager.getRefCount(url)).toBe(1);

      manager.release(url);
      expect(manager.getRefCount(url)).toBe(-1); // 已被删除
    });

    it('引用为 0 时应调用 revokeObjectURL', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);
      manager.release(url);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('多次释放应正确减少计数', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);
      manager.create(blob); // 引用计数 = 2
      expect(manager.getRefCount(url)).toBe(2);

      manager.release(url);
      expect(manager.getRefCount(url)).toBe(1);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      manager.release(url);
      expect(manager.getRefCount(url)).toBe(-1);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('释放不存在的 URL 应警告但不报错', () => {
      const manager = BlobManager.getInstance();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      manager.release('blob:non-existent-url');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('尝试释放不存在的 URL')
      );
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('releaseAll 方法', () => {
    it('应释放所有管理的 URL', () => {
      const manager = BlobManager.getInstance();
      const blob1 = new Blob(['content A'], { type: 'text/plain' });
      const blob2 = new Blob(['content B longer'], { type: 'text/plain' });

      const url1 = manager.create(blob1);
      const url2 = manager.create(blob2);

      manager.releaseAll();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url2);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);

      const stats = manager.getStats();
      expect(stats.totalCount).toBe(0);
    });

    it('即使引用计数大于 0 也应强制释放', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);
      manager.create(blob); // 引用计数 = 2

      manager.releaseAll();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      expect(manager.has(url)).toBe(false);
    });
  });

  describe('getStats 方法', () => {
    it('应返回正确的统计信息', () => {
      const manager = BlobManager.getInstance();
      const blob1 = new Blob(['content A'], { type: 'text/plain' });
      const blob2 = new Blob(['content B longer'], { type: 'text/plain' });

      manager.create(blob1);
      manager.create(blob2);
      const url3 = manager.create(new Blob(['content C much longer string'], { type: 'text/plain' }));

      // 释放一个
      manager.release(url3);

      const stats = manager.getStats();
      expect(stats.totalCount).toBe(2);
      expect(stats.activeCount).toBe(2);
      expect(stats.pendingReleaseCount).toBe(0);
    });

    it('空管理器应返回零统计', () => {
      const manager = BlobManager.getInstance();
      const stats = manager.getStats();

      expect(stats.totalCount).toBe(0);
      expect(stats.activeCount).toBe(0);
      expect(stats.pendingReleaseCount).toBe(0);
    });
  });

  describe('has 方法', () => {
    it('应正确检查 URL 是否被管理', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);

      expect(manager.has(url)).toBe(true);
      expect(manager.has('blob:other-url')).toBe(false);
    });
  });

  describe('getRefCount 方法', () => {
    it('应返回正确的引用计数', () => {
      const manager = BlobManager.getInstance();
      const blob = new Blob(['test'], { type: 'text/plain' });

      const url = manager.create(blob);
      expect(manager.getRefCount(url)).toBe(1);

      manager.create(blob);
      expect(manager.getRefCount(url)).toBe(2);
    });

    it('不存在的 URL 应返回 -1', () => {
      const manager = BlobManager.getInstance();
      expect(manager.getRefCount('blob:non-existent')).toBe(-1);
    });
  });
});

describe('blobManager 导出', () => {
  it('blobManager 应是 BlobManager 实例', () => {
    expect(blobManager).toBeInstanceOf(BlobManager);
  });

  it('getBlobManager 应返回当前实例', () => {
    // 先销毁旧实例
    BlobManager.destroyInstance();
    // 获取新实例
    const current = getBlobManager();
    // 应该和 getInstance 返回相同
    expect(current).toBe(BlobManager.getInstance());
  });
});
