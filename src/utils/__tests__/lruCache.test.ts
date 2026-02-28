/**
 * LRUCache 单元测试
 *
 * 测试覆盖：
 * - 基本操作（get, set, delete, has, clear）
 * - LRU 淘汰逻辑
 * - 内存限制
 * - 淘汰回调
 * - 容量调整
 * - 统计信息
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from '../lruCache';

describe('LRUCache', () => {
  describe('基本操作', () => {
    it('应该创建指定容量的缓存', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      expect(cache.getStats().maxSize).toBe(3);
    });

    it('应该拒绝非法容量', () => {
      expect(() => new LRUCache<string, number>({ maxSize: 0 })).toThrow('maxSize must be greater than 0');
      expect(() => new LRUCache<string, number>({ maxSize: -1 })).toThrow('maxSize must be greater than 0');
    });

    it('应该存储和获取值', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('应该返回 undefined 当键不存在', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('应该检查键是否存在', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('应该删除键并返回是否成功', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.delete('a')).toBe(false);
    });

    it('应该清空缓存', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });

    it('应该更新已存在的键', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('a', 100);
      expect(cache.get('a')).toBe(100);
    });
  });

  describe('LRU 淘汰逻辑', () => {
    it('应该在超过容量时淘汰最旧的条目', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // 应该淘汰 'a'

      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('访问应该更新条目的位置（LRU）', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // 访问 'a'，使其变为最新
      cache.set('c', 3); // 应该淘汰 'b' 而不是 'a'

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('更新应该更新条目的位置（LRU）', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 10); // 更新 'a'，使其变为最新
      cache.set('c', 3); // 应该淘汰 'b' 而不是 'a'

      expect(cache.get('a')).toBe(10);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('应该按正确顺序淘汰多个条目', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // 淘汰 'a'
      cache.set('e', 5); // 淘汰 'b'

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.has('e')).toBe(true);
    });
  });

  describe('内存限制', () => {
    it('应该根据内存限制淘汰条目', () => {
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        maxMemory: 100,
        getSize: (value) => value,
      });

      cache.set('a', 50);
      cache.set('b', 40);
      cache.set('c', 30); // 总内存 120 > 100，需要淘汰

      expect(cache.getStats().memoryUsage).toBeLessThanOrEqual(100);
    });

    it('应该正确跟踪内存使用量', () => {
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        getSize: (value) => value,
      });

      cache.set('a', 10);
      expect(cache.getStats().memoryUsage).toBe(10);

      cache.set('b', 20);
      expect(cache.getStats().memoryUsage).toBe(30);

      cache.set('a', 15); // 更新 'a'
      expect(cache.getStats().memoryUsage).toBe(35);

      cache.delete('a');
      expect(cache.getStats().memoryUsage).toBe(20);
    });

    it('清空缓存时应该重置内存使用量', () => {
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        getSize: (value) => value,
      });

      cache.set('a', 10);
      cache.set('b', 20);
      cache.clear();

      expect(cache.getStats().memoryUsage).toBe(0);
    });

    it('应该拒绝超过内存限制的单个条目', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        maxMemory: 50,
        getSize: (value) => value,
      });

      cache.set('a', 100); // 超过 maxMemory

      expect(cache.has('a')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('淘汰回调', () => {
    it('应该在淘汰时触发回调', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>({
        maxSize: 2,
        onEvict,
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // 淘汰 'a'

      expect(onEvict).toHaveBeenCalledWith('a', 1);
      expect(onEvict).toHaveBeenCalledTimes(1);
    });

    it('应该在删除时触发回调', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>({
        maxSize: 2,
        onEvict,
      });

      cache.set('a', 1);
      cache.delete('a');

      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('应该在清空时触发所有条目的回调', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        onEvict,
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();

      expect(onEvict).toHaveBeenCalledTimes(3);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
      expect(onEvict).toHaveBeenCalledWith('b', 2);
      expect(onEvict).toHaveBeenCalledWith('c', 3);
    });

    it('应该在内存限制触发淘汰时调用回调', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>({
        maxSize: 10,
        maxMemory: 100,
        onEvict,
        getSize: (value) => value,
      });

      cache.set('a', 60);
      cache.set('b', 50); // 需要淘汰 'a'

      expect(onEvict).toHaveBeenCalledWith('a', 60);
    });
  });

  describe('容量调整', () => {
    it('应该调整容量并触发必要的淘汰', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.resize(2);

      expect(cache.getStats().maxSize).toBe(2);
      expect(cache.getStats().size).toBe(2);
    });

    it('应该拒绝非法的新容量', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });
      expect(() => cache.resize(0)).toThrow('maxSize must be greater than 0');
      expect(() => cache.resize(-1)).toThrow('maxSize must be greater than 0');
    });

    it('调整容量时应该触发淘汰回调', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        onEvict,
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.resize(1);

      expect(onEvict).toHaveBeenCalledTimes(2);
    });
  });

  describe('统计信息', () => {
    it('应该正确统计命中和未命中', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set('a', 1);
      cache.get('a'); // 命中
      cache.get('a'); // 命中
      cache.get('nonexistent'); // 未命中
      cache.get('nonexistent'); // 未命中

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(2);
    });

    it('应该正确统计淘汰次数', () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // 淘汰 'a'
      cache.set('d', 4); // 淘汰 'b'

      expect(cache.getStats().evictionCount).toBe(2);
    });

    it('应该正确报告当前大小和容量', () => {
      const cache = new LRUCache<string, number>({ maxSize: 5 });

      cache.set('a', 1);
      cache.set('b', 2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });
  });

  describe('keys 和 values 方法', () => {
    it('应该按访问顺序返回键', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // 更新 'a' 的位置

      // Map 的迭代顺序是插入顺序，'a' 被重新插入到最后
      expect(cache.keys()).toEqual(['b', 'c', 'a']);
    });

    it('应该按访问顺序返回值', () => {
      const cache = new LRUCache<string, number>({ maxSize: 3 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // 更新 'a' 的位置

      expect(cache.values()).toEqual([2, 3, 1]);
    });
  });

  describe('实际使用场景', () => {
    it('应该正确处理 Blob URL 场景', () => {
      // 模拟 Blob URL 管理
      const revokedUrls: string[] = [];
      const mockRevokeObjectURL = (url: string) => {
        revokedUrls.push(url);
      };

      interface BlobCacheEntry {
        url: string;
        size: number;
      }

      const cache = new LRUCache<string, BlobCacheEntry>({
        maxSize: 3,
        maxMemory: 1000,
        getSize: (entry) => entry.size,
        onEvict: (key, entry) => {
          mockRevokeObjectURL(entry.url);
        },
      });

      // 添加条目
      cache.set('img1', { url: 'blob:1', size: 300 });
      cache.set('img2', { url: 'blob:2', size: 300 });
      cache.set('img3', { url: 'blob:3', size: 300 });

      // 访问 img1，使其变为最新
      cache.get('img1');

      // 添加新条目，触发淘汰（应该淘汰 img2）
      cache.set('img4', { url: 'blob:4', size: 300 });

      expect(revokedUrls).toContain('blob:2');
      expect(cache.has('img1')).toBe(true);
      expect(cache.has('img2')).toBe(false);
    });

    it('应该在内存压力下正确淘汰', () => {
      const evictedKeys: string[] = [];
      const cache = new LRUCache<string, number>({
        maxSize: 100,
        maxMemory: 500,
        getSize: (value) => value,
        onEvict: (key) => {
          evictedKeys.push(key);
        },
      });

      // 添加大量大文件
      cache.set('big1', 200);
      cache.set('big2', 200);
      cache.set('big3', 200);

      // 尝试添加更多，触发内存淘汰
      cache.set('big4', 200);

      expect(cache.getStats().memoryUsage).toBeLessThanOrEqual(500);
      expect(evictedKeys.length).toBeGreaterThan(0);
    });
  });
});
