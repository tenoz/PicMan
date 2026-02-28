/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateThumbnail,
  generateThumbnails,
  revokeThumbnail,
  revokeThumbnails,
  ThumbnailOptions,
} from '../thumbnailGenerator';

// Mock URL.createObjectURL 和 URL.revokeObjectURL
let mockUrlCounter = 0;
const mockUrls = new Map<string, Blob>();

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: vi.fn((blob: Blob) => {
      const url = `blob:mock:${++mockUrlCounter}`;
      mockUrls.set(url, blob);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      mockUrls.delete(url);
    }),
  },
  writable: true,
});

// 创建测试用的模拟图片 Blob
async function createTestImageBlob(
  width: number,
  height: number,
  type = 'image/jpeg'
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 绘制简单图案
    ctx.fillStyle = '#FF5733';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Test', width / 2, height / 2);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create test blob'));
      }
    }, type);
  });
}

// 将 Blob 转换为 File
function blobToFile(blob: Blob, filename: string, type: string): File {
  return new File([blob], filename, { type });
}

describe('thumbnailGenerator', () => {
  let testBlobs: Blob[] = [];
  let createdUrls: string[] = [];

  beforeEach(async () => {
    testBlobs = [];
    createdUrls = [];
    
    // 创建测试用的图片
    const sizes = [
      { w: 800, h: 600 },   // 4:3
      { w: 1920, h: 1080 }, // 16:9
      { w: 500, h: 500 },   // 1:1
      { w: 100, h: 200 },   // 竖图
    ];
    
    for (const { w, h } of sizes) {
      const blob = await createTestImageBlob(w, h);
      testBlobs.push(blob);
    }
  });

  afterEach(() => {
    // 清理创建的 URL
    createdUrls.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  });

  describe('generateThumbnail', () => {
    it('应该成功生成单张缩略图', async () => {
      const blob = testBlobs[0];
      const result = await generateThumbnail(blob);
      createdUrls.push(result.url);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
      expect(result).toHaveProperty('size');
      
      expect(result.url).toContain('blob:');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.size).toBeGreaterThan(0);
    });

    it('应该限制缩略图尺寸不超过默认值 (100x100)', async () => {
      const blob = testBlobs[1]; // 1920x1080
      const result = await generateThumbnail(blob);
      createdUrls.push(result.url);

      expect(result.width).toBeLessThanOrEqual(100);
      expect(result.height).toBeLessThanOrEqual(100);
    });

    it('应该支持自定义尺寸选项', async () => {
      const blob = testBlobs[0];
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 50,
      };
      
      const result = await generateThumbnail(blob, options);
      createdUrls.push(result.url);

      expect(result.width).toBeLessThanOrEqual(50);
      expect(result.height).toBeLessThanOrEqual(50);
    });

    it('应该保持宽高比', async () => {
      const blob = await createTestImageBlob(800, 400); // 2:1
      testBlobs.push(blob);
      
      const options: ThumbnailOptions = {
        maxWidth: 100,
        maxHeight: 100,
      };
      
      const result = await generateThumbnail(blob, options);
      createdUrls.push(result.url);

      // 应该保持 2:1 的比例
      const ratio = result.width / result.height;
      expect(ratio).toBeCloseTo(2, 0);
    });

    it('不应该超过安全限制 (200x200)', async () => {
      const blob = testBlobs[0];
      const options: ThumbnailOptions = {
        maxWidth: 500, // 超过安全限制
        maxHeight: 500,
      };
      
      const result = await generateThumbnail(blob, options);
      createdUrls.push(result.url);

      expect(result.width).toBeLessThanOrEqual(200);
      expect(result.height).toBeLessThanOrEqual(200);
    });

    it('应该支持 File 对象输入', async () => {
      const blob = testBlobs[0];
      const file = blobToFile(blob, 'test.jpg', 'image/jpeg');
      
      const result = await generateThumbnail(file);
      createdUrls.push(result.url);

      expect(result.url).toContain('blob:');
      expect(result.width).toBeGreaterThan(0);
    });

    it('应该支持自定义图片格式和质量', async () => {
      const blob = testBlobs[0];
      const options: ThumbnailOptions = {
        type: 'image/png',
        quality: 0.5,
      };
      
      const result = await generateThumbnail(blob, options);
      createdUrls.push(result.url);

      expect(result.size).toBeGreaterThan(0);
    });

    it('小图片不应该被放大', async () => {
      // 创建一个 50x50 的小图
      const smallBlob = await createTestImageBlob(50, 50);
      
      const options: ThumbnailOptions = {
        maxWidth: 100,
        maxHeight: 100,
      };
      
      const result = await generateThumbnail(smallBlob, options);
      createdUrls.push(result.url);

      // 不应该放大
      expect(result.width).toBeLessThanOrEqual(50);
      expect(result.height).toBeLessThanOrEqual(50);
    });
  });

  describe('generateThumbnails', () => {
    it('应该批量生成多张缩略图', async () => {
      const results = await generateThumbnails(testBlobs);
      createdUrls.push(...results.map(r => r.url).filter(Boolean));

      expect(results).toHaveLength(testBlobs.length);
      
      results.forEach((result) => {
        expect(result.url).toContain('blob:');
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
      });
    });

    it('应该调用进度回调', async () => {
      const onProgress = vi.fn();
      
      await generateThumbnails(testBlobs, {}, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(testBlobs.length);
      
      // 检查最后一次调用
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.processed).toBe(testBlobs.length);
      expect(lastCall.total).toBe(testBlobs.length);
    });

    it('空数组应该返回空结果', async () => {
      const results = await generateThumbnails([]);
      
      expect(results).toHaveLength(0);
    });

    it('应该正确处理错误情况', async () => {
      // 创建一个无效的 blob
      const invalidBlob = new Blob(['invalid data'], { type: 'image/jpeg' });
      
      const onProgress = vi.fn();
      const results = await generateThumbnails([invalidBlob], {}, onProgress);

      // 错误情况应该返回空结果占位
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('');
      expect(results[0].width).toBe(0);
      expect(results[0].height).toBe(0);
    });

    it('应该正确应用批量选项', async () => {
      const options: ThumbnailOptions = {
        maxWidth: 80,
        maxHeight: 80,
        quality: 0.6,
      };
      
      const results = await generateThumbnails(testBlobs, options);
      createdUrls.push(...results.map(r => r.url).filter(Boolean));

      results.forEach((result) => {
        expect(result.width).toBeLessThanOrEqual(80);
        expect(result.height).toBeLessThanOrEqual(80);
      });
    });
  });

  describe('revokeThumbnail', () => {
    it('应该释放单个缩略图 URL', async () => {
      const blob = testBlobs[0];
      const result = await generateThumbnail(blob);
      
      // 不应该抛出错误
      expect(() => revokeThumbnail(result.url)).not.toThrow();
    });

    it('空字符串不应该报错', () => {
      expect(() => revokeThumbnail('')).not.toThrow();
    });
  });

  describe('revokeThumbnails', () => {
    it('应该批量释放缩略图 URL', async () => {
      const results = await generateThumbnails(testBlobs);
      
      // 不应该抛出错误
      expect(() => revokeThumbnails(results)).not.toThrow();
    });

    it('空数组不应该报错', () => {
      expect(() => revokeThumbnails([])).not.toThrow();
    });
  });

  describe('性能测试', () => {
    it('100 张缩略图生成应该在 2 秒内完成', async () => {
      // 创建 100 个测试图片
      const blobs: Blob[] = [];
      for (let i = 0; i < 100; i++) {
        const blob = await createTestImageBlob(200, 150);
        blobs.push(blob);
      }

      const startTime = performance.now();
      const results = await generateThumbnails(blobs);
      const endTime = performance.now();

      createdUrls.push(...results.map(r => r.url).filter(Boolean));

      const duration = endTime - startTime;
      console.log(`Generated 100 thumbnails in ${duration.toFixed(0)}ms`);

      // 断言：应该在 2 秒内完成（2000ms）
      expect(duration).toBeLessThan(2000);
      expect(results).toHaveLength(100);
    });
  });
});
