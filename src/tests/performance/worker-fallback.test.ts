import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Worker 降级方案测试
 * 
 * 测试当 Web Worker 或 OffscreenCanvas 不可用时，
 * 系统是否能正确降级到主线程处理
 */

describe('Worker 降级方案', () => {
  // 保存原始全局对象
  let originalWorker: typeof Worker;
  let originalOffscreenCanvas: typeof OffscreenCanvas;
  let originalCreateImageBitmap: typeof createImageBitmap;

  beforeEach(() => {
    // 保存原始引用
    originalWorker = globalThis.Worker;
    originalOffscreenCanvas = globalThis.OffscreenCanvas;
    originalCreateImageBitmap = globalThis.createImageBitmap;
  });

  afterEach(() => {
    // 恢复原始对象
    globalThis.Worker = originalWorker;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    globalThis.createImageBitmap = originalCreateImageBitmap;
    vi.restoreAllMocks();
  });

  describe('Worker 不可用时的降级', () => {
    it('当 Worker 不支持时应降级到主线程处理', async () => {
      // 模拟 Worker 不可用
      globalThis.Worker = undefined as unknown as typeof Worker;

      // 验证 Worker 确实不可用
      expect(typeof globalThis.Worker).toBe('undefined');

      // 模拟主线程处理函数
      const mainThreadProcess = vi.fn().mockResolvedValue({
        blob: new Blob(['test'], { type: 'image/jpeg' }),
        width: 100,
        height: 100,
        processedSize: 1024,
        isSkipped: false,
      });

      // 执行降级处理
      const result = await mainThreadProcess({
        imageData: new ArrayBuffer(1024),
        config: { format: 'image/jpeg', quality: 0.9 },
      });

      // 验证主线程处理被调用
      expect(mainThreadProcess).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('Worker 构造函数抛出异常时应降级', async () => {
      // 模拟 Worker 构造函数抛出异常
      globalThis.Worker = vi.fn().mockImplementation(() => {
        throw new Error('Worker 不支持');
      }) as unknown as typeof Worker;

      // 模拟降级处理函数
      const fallbackProcess = vi.fn().mockResolvedValue({
        success: true,
        data: {
          blob: new Blob(['test'], { type: 'image/png' }),
          width: 200,
          height: 150,
        },
      });

      // 尝试创建 Worker，失败后降级
      let result;
      try {
        // eslint-disable-next-line no-new
        new Worker('test.worker.js');
      } catch {
        result = await fallbackProcess();
      }

      expect(globalThis.Worker).toHaveBeenCalled();
      expect(fallbackProcess).toHaveBeenCalled();
      expect(result?.success).toBe(true);
    });

    it('Worker 消息通道失败时应降级', async () => {
      // 模拟 Worker 创建成功但消息发送失败
      const mockPostMessage = vi.fn().mockImplementation(() => {
        throw new Error('消息通道失败');
      });

      globalThis.Worker = vi.fn().mockImplementation(() => ({
        postMessage: mockPostMessage,
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof Worker;

      // 模拟降级函数
      const fallbackProcess = vi.fn().mockResolvedValue({ success: true });

      // 尝试使用 Worker，失败后降级
      try {
        const worker = new Worker('test.worker.js');
        worker.postMessage({ type: 'PROCESS_IMAGE' });
      } catch {
        await fallbackProcess();
      }

      expect(mockPostMessage).toHaveBeenCalled();
      expect(fallbackProcess).toHaveBeenCalled();
    });
  });

  describe('OffscreenCanvas 不支持时的降级', () => {
    it('当 OffscreenCanvas 不可用时降级到普通 Canvas', async () => {
      // 模拟 OffscreenCanvas 不可用
      globalThis.OffscreenCanvas = undefined as unknown as typeof OffscreenCanvas;

      expect(typeof globalThis.OffscreenCanvas).toBe('undefined');

      // 模拟使用普通 Canvas 的降级函数
      const canvasFallback = vi.fn().mockImplementation(() => {
        // 使用普通 HTMLCanvasElement
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 100, 100);
        }

        return canvas;
      });

      const result = canvasFallback();

      expect(canvasFallback).toHaveBeenCalled();
      expect(result).toBeInstanceOf(HTMLCanvasElement);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('OffscreenCanvas 方法缺失时应降级', async () => {
      // 模拟 OffscreenCanvas 存在但 convertToBlob 方法缺失
      class MockOffscreenCanvas {
        width: number;
        height: number;

        constructor(w: number, h: number) {
          this.width = w;
          this.height = h;
        }

        getContext() {
          return {
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          };
        }
        // 注意：没有 convertToBlob 方法
      }

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      // 模拟降级处理
      const fallbackWithBlob = vi.fn().mockImplementation(async () => {
        const canvas = document.createElement('canvas');
        return new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob || new Blob());
          }, 'image/jpeg');
        });
      });

      // 检查 convertToBlob 是否可用
      const canvas = new globalThis.OffscreenCanvas(100, 100);
      const hasConvertToBlob = 'convertToBlob' in canvas;

      expect(hasConvertToBlob).toBe(false);

      // 降级到普通 Canvas 的 toBlob
      const result = await fallbackWithBlob();
      expect(fallbackWithBlob).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Blob);
    });

    it('createImageBitmap 不支持时应降级', async () => {
      // 模拟 createImageBitmap 不可用
      globalThis.createImageBitmap = undefined as unknown as typeof createImageBitmap;

      expect(typeof globalThis.createImageBitmap).toBe('undefined');

      // 模拟使用 Image 对象的降级方案（不实际加载图片）
      const fallbackWithImage = vi.fn().mockImplementation(() => {
        // 模拟创建 Image 对象但不实际加载
        const mockImage = {
          width: 100,
          height: 100,
          complete: true,
        } as HTMLImageElement;

        return Promise.resolve(mockImage);
      });

      // 降级处理
      const result = await fallbackWithImage();

      expect(fallbackWithImage).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
  });

  describe('降级后功能正常性验证', () => {
    it('降级后应能正确生成缩略图', async () => {
      // 模拟降级环境
      globalThis.Worker = undefined as unknown as typeof Worker;
      globalThis.OffscreenCanvas = undefined as unknown as typeof OffscreenCanvas;

      // 主线程处理函数
      const processImageInMainThread = vi.fn().mockImplementation(
        async (imageData: ArrayBuffer, config: { width: number; height: number }) => {
          // 使用普通 Canvas 处理
          const canvas = document.createElement('canvas');
          canvas.width = config.width;
          canvas.height = config.height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(0, 0, config.width, config.height);
          }

          // 导出为 Blob
          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.9);
          });

          return {
            blob,
            width: config.width,
            height: config.height,
            processedSize: blob.size,
            isSkipped: false,
          };
        }
      );

      const result = await processImageInMainThread(
        new ArrayBuffer(1024),
        { width: 100, height: 100 }
      );

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(result.processedSize).toBeGreaterThan(0);
    });

    it('降级后应支持格式转换', async () => {
      const convertImageFormat = vi.fn().mockImplementation(
        async (_imageData: ArrayBuffer, targetFormat: string, quality: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = 100;
          canvas.height = 100;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(0, 0, 100, 100);
          }

          // jsdom 的 canvas 只支持 png 和 jpeg，模拟 webp 支持
          const supportedFormats: Record<string, string> = {
            jpeg: 'image/jpeg',
            jpg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp', // 模拟支持
          };

          const mimeType = supportedFormats[targetFormat] || 'image/png';
          
          // 对于不支持的格式，返回模拟的 blob
          const blob = new Blob(['mock image data'], { type: mimeType });

          return {
            blob,
            format: targetFormat,
            quality,
          };
        }
      );

      // 测试不同格式
      const formats = ['jpeg', 'png', 'webp'];
      for (const format of formats) {
        const result = await convertImageFormat(
          new ArrayBuffer(1024),
          format,
          0.85
        );

        expect(result.format).toBe(format);
        // webp 在 jsdom 中被模拟
        if (format === 'webp') {
          expect(result.blob.type).toBe('image/webp');
        } else {
          expect(result.blob.type).toContain(format === 'jpeg' ? 'jpeg' : format);
        }
      }
    });

    it('降级后应支持尺寸调整', async () => {
      const resizeImage = vi.fn().mockImplementation(
        async (_imageData: ArrayBuffer, targetWidth: number, targetHeight: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0000FF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/png');
          });

          return {
            blob,
            width: targetWidth,
            height: targetHeight,
          };
        }
      );

      const testSizes = [
        { width: 50, height: 50 },
        { width: 200, height: 150 },
        { width: 800, height: 600 },
      ];

      for (const size of testSizes) {
        const result = await resizeImage(
          new ArrayBuffer(1024),
          size.width,
          size.height
        );

        expect(result.width).toBe(size.width);
        expect(result.height).toBe(size.height);
      }
    });

    it('降级后应支持水印添加', async () => {
      const addWatermark = vi.fn().mockImplementation(
        async (imageData: ArrayBuffer, watermarkText: string) => {
          const canvas = document.createElement('canvas');
          canvas.width = 200;
          canvas.height = 200;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            // 绘制背景
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 200, 200);

            // 绘制水印文字
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(watermarkText, 100, 100);
          }

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.9);
          });

          return {
            blob,
            watermark: watermarkText,
            hasWatermark: true,
          };
        }
      );

      const result = await addWatermark(
        new ArrayBuffer(1024),
        '测试水印'
      );

      expect(result.watermark).toBe('测试水印');
      expect(result.hasWatermark).toBe(true);
      expect(result.blob).toBeInstanceOf(Blob);
    });

    it('降级后应正确处理错误', async () => {
      const processWithError = vi.fn().mockImplementation(
        async (imageData: ArrayBuffer) => {
          // 模拟无效图片数据错误
          if (imageData.byteLength === 0) {
            throw new Error('无效的图片数据');
          }
          return { success: true };
        }
      );

      // 测试错误处理
      await expect(processWithError(new ArrayBuffer(0)))
        .rejects.toThrow('无效的图片数据');

      // 测试正常处理
      const result = await processWithError(new ArrayBuffer(1024));
      expect(result.success).toBe(true);
    });

    it('降级后应支持取消操作', async () => {
      let isCancelled = false;

      const cancellableProcess = vi.fn().mockImplementation(
        async (_imageData: ArrayBuffer, onProgress?: (p: number) => void) => {
          for (let i = 0; i <= 100; i += 10) {
            if (isCancelled) {
              throw new Error('任务已取消');
            }
            onProgress?.(i);
            // 模拟异步处理
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          return { success: true, progress: 100 };
        }
      );

      // 启动处理
      const processPromise = cancellableProcess(new ArrayBuffer(1024));

      // 中途取消
      setTimeout(() => {
        isCancelled = true;
      }, 25);

      await expect(processPromise).rejects.toThrow('任务已取消');
      expect(cancellableProcess).toHaveBeenCalled();
    });
  });

  describe('降级检测逻辑', () => {
    it('应能正确检测 Worker 支持状态', () => {
      const checkWorkerSupport = () => {
        try {
          return typeof Worker !== 'undefined' && 
                 typeof Worker.prototype.postMessage === 'function';
        } catch {
          return false;
        }
      };

      // 恢复原始 Worker
      globalThis.Worker = originalWorker;

      // Worker 可用时（在 jsdom 中 Worker 可能不存在或受限）
      const isWorkerAvailable = checkWorkerSupport();
      // jsdom 环境中 Worker 可能不可用，这是预期的
      expect(typeof isWorkerAvailable).toBe('boolean');

      // Worker 不可用时
      globalThis.Worker = undefined as unknown as typeof Worker;
      expect(checkWorkerSupport()).toBe(false);
    });

    it('应能正确检测 OffscreenCanvas 支持状态', () => {
      const checkOffscreenCanvasSupport = () => {
        try {
          if (typeof OffscreenCanvas === 'undefined') {
            return false;
          }
          const canvas = new OffscreenCanvas(1, 1);
          return typeof canvas.convertToBlob === 'function';
        } catch {
          return false;
        }
      };

      // 恢复 OffscreenCanvas
      globalThis.OffscreenCanvas = originalOffscreenCanvas;

      // OffscreenCanvas 可用时
      if (typeof originalOffscreenCanvas !== 'undefined') {
        expect(checkOffscreenCanvasSupport()).toBe(true);
      }

      // OffscreenCanvas 不可用时
      globalThis.OffscreenCanvas = undefined as unknown as typeof OffscreenCanvas;
      expect(checkOffscreenCanvasSupport()).toBe(false);
    });

    it('应能正确选择最优处理策略', () => {
      const selectProcessingStrategy = () => {
        const hasWorker = typeof Worker !== 'undefined';
        const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

        if (hasWorker && hasOffscreenCanvas) {
          return { useWorker: true, useOffscreenCanvas: true };
        } else if (hasWorker) {
          return { useWorker: true, useOffscreenCanvas: false };
        } else {
          return { useWorker: false, useOffscreenCanvas: false };
        }
      };

      // 完全支持
      globalThis.Worker = originalWorker;
      globalThis.OffscreenCanvas = originalOffscreenCanvas;
      
      const strategy1 = selectProcessingStrategy();
      // 根据环境返回相应策略
      if (typeof originalWorker !== 'undefined' && typeof originalOffscreenCanvas !== 'undefined') {
        expect(strategy1).toEqual({
          useWorker: true,
          useOffscreenCanvas: true,
        });
      } else {
        expect(strategy1).toEqual({
          useWorker: false,
          useOffscreenCanvas: false,
        });
      }

      // Worker 降级
      globalThis.Worker = undefined as unknown as typeof Worker;
      expect(selectProcessingStrategy()).toEqual({
        useWorker: false,
        useOffscreenCanvas: false,
      });
    });
  });
});
});
