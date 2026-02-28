/**
 * 图片处理性能基准测试
 * 测试缩略图生成、Canvas 操作和批量处理的性能
 */
import { bench, describe } from 'vitest';
import { generateThumbnail, generateThumbnails, ThumbnailResult } from '../../../utils/thumbnailGenerator';

// 辅助函数：创建测试图片 Blob
async function createTestImageBlob(width: number, height: number, type: string = 'image/jpeg'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // 绘制测试图案
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#FF6B6B');
  gradient.addColorStop(0.5, '#4ECDC4');
  gradient.addColorStop(1, '#45B7D1');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // 添加一些几何图形
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 50 + 20,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, type, 0.9);
  });
}

// 清理缩略图资源
function cleanupThumbnails(results: ThumbnailResult[]) {
  results.forEach((result) => {
    if (result.url) {
      URL.revokeObjectURL(result.url);
    }
  });
}

describe('缩略图生成性能测试', () => {
  let smallImageBlob: Blob;   // 640x480
  let mediumImageBlob: Blob;  // 1920x1080
  let largeImageBlob: Blob;   // 3840x2160
  
  // 测试前准备图片数据
  bench('准备测试图片', async () => {
    smallImageBlob = await createTestImageBlob(640, 480);
    mediumImageBlob = await createTestImageBlob(1920, 1080);
    largeImageBlob = await createTestImageBlob(3840, 2160);
  }, {
    iterations: 1,
    warmupIterations: 0,
  });

  // 小图缩略图生成
  bench('小图缩略图生成 (640x480 → 100x100)', async () => {
    const result = await generateThumbnail(smallImageBlob, {
      maxWidth: 100,
      maxHeight: 100,
      quality: 0.8,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  // 中图缩略图生成
  bench('中图缩略图生成 (1920x1080 → 100x100)', async () => {
    const result = await generateThumbnail(mediumImageBlob, {
      maxWidth: 100,
      maxHeight: 100,
      quality: 0.8,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  // 大图缩略图生成
  bench('大图缩略图生成 (3840x2160 → 100x100)', async () => {
    const result = await generateThumbnail(largeImageBlob, {
      maxWidth: 100,
      maxHeight: 100,
      quality: 0.8,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  // 不同质量设置对比
  bench('高质量缩略图生成 (quality: 0.95)', async () => {
    const result = await generateThumbnail(mediumImageBlob, {
      maxWidth: 100,
      maxHeight: 100,
      quality: 0.95,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  bench('低质量缩略图生成 (quality: 0.5)', async () => {
    const result = await generateThumbnail(mediumImageBlob, {
      maxWidth: 100,
      maxHeight: 100,
      quality: 0.5,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  // 批量生成测试
  bench('批量缩略图生成 - 10张', async () => {
    const blobs = Array.from({ length: 10 }, () => mediumImageBlob);
    const results = await generateThumbnails(blobs, {
      maxWidth: 100,
      maxHeight: 100,
    });
    cleanupThumbnails(results);
  }, {
    iterations: 5,
    warmupIterations: 1,
  });

  bench('批量缩略图生成 - 50张', async () => {
    const blobs = Array.from({ length: 50 }, () => mediumImageBlob);
    const results = await generateThumbnails(blobs, {
      maxWidth: 100,
      maxHeight: 100,
    });
    cleanupThumbnails(results);
  }, {
    iterations: 3,
    warmupIterations: 1,
  });
});

describe('Canvas 操作性能测试', () => {
  // Canvas 绘制性能
  bench('Canvas 绘制 - 1920x1080 填充', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#FF6B6B';
      ctx.fillRect(0, 0, 1920, 1080);
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
  });

  bench('Canvas 绘制 - 复杂图案', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // 绘制渐变背景
      const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
      gradient.addColorStop(0, '#FF6B6B');
      gradient.addColorStop(0.5, '#4ECDC4');
      gradient.addColorStop(1, '#45B7D1');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1920, 1080);
      
      // 绘制多个圆形
      for (let i = 0; i < 100; i++) {
        ctx.beginPath();
        ctx.arc(
          Math.random() * 1920,
          Math.random() * 1080,
          Math.random() * 50 + 10,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5})`;
        ctx.fill();
      }
    }
  }, {
    iterations: 50,
    warmupIterations: 5,
  });

  // toBlob 性能测试
  bench('Canvas toBlob - JPEG', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#4ECDC4';
      ctx.fillRect(0, 0, 1920, 1080);
    }
    
    await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
  }, {
    iterations: 20,
    warmupIterations: 3,
  });

  bench('Canvas toBlob - PNG', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#4ECDC4';
      ctx.fillRect(0, 0, 1920, 1080);
    }
    
    await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  }, {
    iterations: 20,
    warmupIterations: 3,
  });

  // 图片缩放性能
  bench('Canvas 图片缩放 - 4K 到 1080P', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 3840;
    sourceCanvas.height = 2160;
    const sourceCtx = sourceCanvas.getContext('2d');
    
    if (sourceCtx) {
      sourceCtx.fillStyle = '#FF6B6B';
      sourceCtx.fillRect(0, 0, 3840, 2160);
    }
    
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = 1920;
    targetCanvas.height = 1080;
    const targetCtx = targetCanvas.getContext('2d');
    
    if (targetCtx) {
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = 'high';
      targetCtx.drawImage(sourceCanvas, 0, 0, 1920, 1080);
    }
  }, {
    iterations: 20,
    warmupIterations: 3,
  });
});

describe('图片格式处理性能测试', () => {
  let testImageBlob: Blob;
  
  // 准备测试图片
  bench('准备 2K 测试图片', async () => {
    testImageBlob = await createTestImageBlob(2560, 1440, 'image/jpeg');
  }, {
    iterations: 1,
    warmupIterations: 0,
  });

  // 不同格式缩略图生成对比
  bench('生成 JPEG 格式缩略图', async () => {
    const result = await generateThumbnail(testImageBlob, {
      maxWidth: 200,
      maxHeight: 200,
      type: 'image/jpeg',
      quality: 0.9,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });

  bench('生成 WebP 格式缩略图', async () => {
    const result = await generateThumbnail(testImageBlob, {
      maxWidth: 200,
      maxHeight: 200,
      type: 'image/webp',
      quality: 0.9,
    });
    URL.revokeObjectURL(result.url);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });
});

describe('内存使用测试', () => {
  bench('大量缩略图生成 - 内存稳定性', async () => {
    const blob = await createTestImageBlob(1920, 1080);
    const results: ThumbnailResult[] = [];
    
    // 生成 20 张缩略图
    for (let i = 0; i < 20; i++) {
      const result = await generateThumbnail(blob, {
        maxWidth: 200,
        maxHeight: 200,
      });
      results.push(result);
    }
    
    // 清理资源
    cleanupThumbnails(results);
  }, {
    iterations: 3,
    warmupIterations: 1,
  });

  bench('Canvas 创建与销毁 - 内存回收', () => {
    const canvases: HTMLCanvasElement[] = [];
    
    // 创建多个 Canvas
    for (let i = 0; i < 50; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#4ECDC4';
        ctx.fillRect(0, 0, 1920, 1080);
      }
      canvases.push(canvas);
    }
    
    // 清理
    canvases.forEach((canvas) => {
      canvas.width = 1;
      canvas.height = 1;
    });
    canvases.length = 0;
  }, {
    iterations: 10,
    warmupIterations: 2,
  });
});
