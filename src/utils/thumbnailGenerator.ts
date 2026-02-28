/**
 * 缩略图生成器
 * 用于生成低分辨率缩略图，减少内存占用
 */

// 缩略图配置选项
export interface ThumbnailOptions {
  maxWidth?: number;  // 默认 100
  maxHeight?: number; // 默认 100
  quality?: number;   // 默认 0.8
  type?: string;      // 默认 image/jpeg
}

// 缩略图生成结果
export interface ThumbnailResult {
  url: string;        // Blob URL
  width: number;
  height: number;
  size: number;       // 字节数
}

// 批量生成进度回调
export interface ThumbnailProgress {
  processed: number;
  total: number;
  current: ThumbnailResult | null;
}

// 默认配置
const DEFAULT_OPTIONS: Required<ThumbnailOptions> = {
  maxWidth: 100,
  maxHeight: 100,
  quality: 0.8,
  type: 'image/jpeg',
};

// 并发控制限制
const MAX_CONCURRENT = 5;

/**
 * 使用 requestIdleCallback 的兼容实现
 */
const requestIdle =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback.bind(window)
    : (callback: IdleRequestCallback) => setTimeout(callback, 1);

/**
 * 检查是否支持 createImageBitmap
 */
const supportsImageBitmap =
  typeof window !== 'undefined' && 'createImageBitmap' in window;

/**
 * 加载图片并返回 ImageBitmap 或 HTMLImageElement
 * 优先使用 createImageBitmap 以获得更好性能
 */
async function loadImage(
  file: File | Blob
): Promise<ImageBitmap | HTMLImageElement> {
  // 优先使用 createImageBitmap（更好的性能和内存管理）
  if (supportsImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file);
      return bitmap;
    } catch {
      // 回退到 Image 方式
    }
  }

  // 回退方案：使用传统 Image 标签
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * 计算缩略图尺寸，保持宽高比
 */
function calculateThumbnailSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = naturalWidth;
  let height = naturalHeight;

  // 计算缩放比例，保持宽高比
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  // 确保最小为 1 像素
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/**
 * 生成单张缩略图
 * @param file 图片文件
 * @param options 缩略图选项
 * @returns 缩略图结果
 */
export async function generateThumbnail(
  file: File | Blob,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 限制最大尺寸（安全限制）
  const maxWidth = Math.min(opts.maxWidth, 200);
  const maxHeight = Math.min(opts.maxHeight, 200);

  // 加载图片
  const source = await loadImage(file);

  // 获取原始尺寸
  const naturalWidth =
    source instanceof ImageBitmap ? source.width : source.naturalWidth;
  const naturalHeight =
    source instanceof ImageBitmap ? source.height : source.naturalHeight;

  // 计算目标尺寸
  const { width, height } = calculateThumbnailSize(
    naturalWidth,
    naturalHeight,
    maxWidth,
    maxHeight
  );

  // 创建 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', {
    alpha: false, // 不需要透明度，提高性能
  });

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 配置高质量缩放
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 绘制缩略图
  ctx.drawImage(source, 0, 0, width, height);

  // 释放 ImageBitmap 资源
  if (source instanceof ImageBitmap) {
    source.close();
  }

  // 生成 Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({
            url: URL.createObjectURL(blob),
            width,
            height,
            size: blob.size,
          });
        } else {
          reject(new Error('Failed to create thumbnail blob'));
        }
        // 清理 Canvas
        canvas.width = 1;
        canvas.height = 1;
      },
      opts.type,
      opts.quality
    );
  });
}

/**
 * 批量生成缩略图
 * @param files 图片文件数组
 * @param options 缩略图选项
 * @param onProgress 进度回调
 * @returns 缩略图结果数组
 */
export async function generateThumbnails(
  files: (File | Blob)[],
  options: ThumbnailOptions = {},
  onProgress?: (progress: ThumbnailProgress) => void
): Promise<ThumbnailResult[]> {
  const results: ThumbnailResult[] = new Array(files.length);
  const total = files.length;

  if (total === 0) {
    return [];
  }

  // 并发控制器
  let index = 0;
  let completed = 0;

  const processNext = async (): Promise<void> => {
    const currentIndex = index++;
    if (currentIndex >= total) return;

    const file = files[currentIndex];

    try {
      // 使用 requestIdle 避免阻塞主线程
      await new Promise<void>((resolve) => {
        requestIdle(() => resolve());
      });

      const result = await generateThumbnail(file, options);
      results[currentIndex] = result;
      completed++;

      // 触发进度回调
      onProgress?.({
        processed: completed,
        total,
        current: result,
      });
    } catch (error) {
      console.error(`Failed to generate thumbnail for index ${currentIndex}:`, error);
      // 创建错误占位结果
      results[currentIndex] = {
        url: '',
        width: 0,
        height: 0,
        size: 0,
      };
      completed++;

      onProgress?.({
        processed: completed,
        total,
        current: null,
      });
    }
  };

  // 启动并发任务
  const workers: Promise<void>[] = [];
  const concurrency = Math.min(MAX_CONCURRENT, total);

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (index < total) {
          await processNext();
        }
      })()
    );
  }

  await Promise.all(workers);

  return results;
}

/**
 * 释放缩略图资源
 * @param url Blob URL
 */
export function revokeThumbnail(url: string): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

/**
 * 批量释放缩略图资源
 * @param results 缩略图结果数组
 */
export function revokeThumbnails(results: ThumbnailResult[]): void {
  results.forEach((result) => {
    revokeThumbnail(result.url);
  });
}
