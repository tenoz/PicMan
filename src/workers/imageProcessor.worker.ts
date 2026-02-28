/**
 * Web Worker 图片处理核心脚本
 * 
 * 在 Worker 线程中执行图片处理，避免阻塞主线程
 * 使用 OffscreenCanvas 进行离屏渲染
 */

import type { ProcessingConfig, WatermarkConfig } from '../../types';
import {
  WorkerMessageType,
  ProcessImagePayload,
  WorkerRequest,
  WorkerResponse,
  WorkerProgress,
} from './types';

// @ts-ignore - piexifjs 没有类型定义
import piexif from 'piexifjs';

// ============================================================================
// 全局状态
// ============================================================================

/** 当前活跃的任务ID */
let activeTaskId: string | null = null;

/** 取消标志 */
let isCancelled = false;

// ============================================================================
// 消息处理循环
// ============================================================================

/**
 * 监听来自主线程的消息
 */
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { taskId, type, payload } = event.data;

  switch (type) {
    case WorkerMessageType.PROCESS_IMAGE:
      if (payload) {
        await handleProcessImage(taskId, payload);
      }
      break;

    case WorkerMessageType.CANCEL:
      handleCancel(taskId);
      break;

    case WorkerMessageType.PING:
      sendResponse(taskId, true, undefined);
      break;

    default:
      sendErrorResponse(taskId, `未知的消息类型: ${type}`);
  }
});

/**
 * 处理图片处理请求
 */
async function handleProcessImage(
  taskId: string,
  payload: ProcessImagePayload
): Promise<void> {
  // 检查是否有其他任务正在运行
  if (activeTaskId !== null && activeTaskId !== taskId) {
    sendErrorResponse(taskId, '已有其他任务正在处理中');
    return;
  }

  activeTaskId = taskId;
  isCancelled = false;

  try {
    const result = await processImageInWorker(taskId, payload);
    
    if (isCancelled) {
      sendErrorResponse(taskId, '任务已取消');
      return;
    }

    sendResponse(taskId, true, result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendErrorResponse(taskId, errorMessage);
  } finally {
    if (activeTaskId === taskId) {
      activeTaskId = null;
    }
  }
}

/**
 * 处理取消请求
 */
function handleCancel(taskId: string): void {
  if (activeTaskId === taskId) {
    isCancelled = true;
  }
  // 发送确认响应
  sendResponse(taskId, true, undefined);
}

// ============================================================================
// 响应发送辅助函数
// ============================================================================

/**
 * 发送成功响应
 */
function sendResponse(
  taskId: string,
  success: boolean,
  data?: {
    blob: Blob;
    width: number;
    height: number;
    processedSize: number;
    isSkipped: boolean;
  },
  error?: string
): void {
  const response: WorkerResponse = {
    taskId,
    success,
    data,
    error,
  };
  self.postMessage({ ...response, kind: 'response' });
}

/**
 * 发送错误响应
 */
function sendErrorResponse(taskId: string, error: string): void {
  sendResponse(taskId, false, undefined, error);
}

/**
 * 发送进度更新
 */
function sendProgress(
  taskId: string,
  progress: number,
  message: string,
  phase?: WorkerProgress['phase']
): void {
  const progressData: WorkerProgress = {
    taskId,
    progress,
    message,
    phase,
  };
  self.postMessage({ ...progressData, kind: 'progress' });
}

// ============================================================================
// 图片处理核心逻辑
// ============================================================================

/**
 * 在 Worker 中处理图片
 * 这是主处理函数，负责整个处理流程
 */
async function processImageInWorker(
  taskId: string,
  payload: ProcessImagePayload
): Promise<{
  blob: Blob;
  width: number;
  height: number;
  processedSize: number;
  isSkipped: boolean;
}> {
  const { imageData, filename, mimeType, originalDimensions, config } = payload;
  const t0 = performance.now();

  console.debug(`[Worker] 开始处理: ${filename} (任务ID: ${taskId})`);

  // 阶段 1: 加载图片 (0-20%)
  sendProgress(taskId, 5, '正在加载图片...', 'loading');
  
  const imageBitmap = await loadImageBitmap(imageData, mimeType);
  checkCancelled(taskId);

  sendProgress(taskId, 20, '图片加载完成', 'loading');
  console.debug(`[Worker] 原图尺寸: ${imageBitmap.width}x${imageBitmap.height}`);

  // 阶段 2: 计算目标尺寸 (20-30%)
  sendProgress(taskId, 25, '计算目标尺寸...', 'processing');
  
  const { targetWidth, targetHeight, canvasWidth, canvasHeight } = calculateDimensions(
    imageBitmap.width,
    imageBitmap.height,
    config
  );
  checkCancelled(taskId);

  sendProgress(taskId, 30, `目标尺寸: ${targetWidth}x${targetHeight}`, 'processing');

  // 阶段 3: 创建 OffscreenCanvas 并应用变换 (30-60%)
  sendProgress(taskId, 35, '创建画布...', 'processing');
  
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d', { alpha: true });
  
  if (!ctx) {
    throw new Error('无法创建 2D 渲染上下文');
  }

  // 设置高质量渲染
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // JPEG/BMP 格式需要白色背景（不支持透明）
  if (config.format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  sendProgress(taskId, 40, '应用变换...', 'processing');

  // 应用变换：平移、旋转、翻转
  const angleInRadians = (config.rotate * Math.PI) / 180;
  
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate(angleInRadians);
  ctx.scale(config.flipX ? -1 : 1, config.flipY ? -1 : 1);
  
  ctx.drawImage(
    imageBitmap,
    -targetWidth / 2,
    -targetHeight / 2,
    targetWidth,
    targetHeight
  );
  
  ctx.restore();
  checkCancelled(taskId);

  sendProgress(taskId, 60, '变换完成', 'processing');

  // 阶段 4: 应用水印 (60-80%)
  if (config.watermark.enabled) {
    sendProgress(taskId, 65, '应用水印...', 'watermark');
    await drawWatermark(ctx, canvasWidth, canvasHeight, config.watermark);
    checkCancelled(taskId);
    sendProgress(taskId, 80, '水印应用完成', 'watermark');
  }

  // 阶段 5: 编码输出 (80-95%)
  sendProgress(taskId, 85, '编码输出...', 'encoding');
  
  let resultBlob = await canvas.convertToBlob({
    type: config.format,
    quality: config.quality,
  });
  
  checkCancelled(taskId);

  // 阶段 6: EXIF 保留处理 (95-100%)
  if (!config.stripExif && config.format === 'image/jpeg' && typeof imageData !== 'string') {
    sendProgress(taskId, 90, '处理 EXIF...', 'encoding');
    resultBlob = await preserveExif(resultBlob, imageData, config);
    checkCancelled(taskId);
  }

  sendProgress(taskId, 95, '完成编码', 'encoding');

  // 智能体积兜底：如果处理后体积增大，保留原图
  const originalSize = imageData instanceof ArrayBuffer ? imageData.byteLength : 0;
  let isSkipped = false;
  
  if (config.preventSizeInflation && originalSize > 0 && resultBlob.size > originalSize) {
    console.debug(`[Worker] 处理后体积增大 (${resultBlob.size} > ${originalSize})，保留原图`);
    resultBlob = new Blob([imageData], { type: mimeType });
    isSkipped = true;
  }

  const t1 = performance.now();
  console.debug(`[Worker] 处理完成，耗时: ${(t1 - t0).toFixed(0)}ms`);

  sendProgress(taskId, 100, '处理完成', 'encoding');

  // 清理资源
  imageBitmap.close();

  return {
    blob: resultBlob,
    width: canvasWidth,
    height: canvasHeight,
    processedSize: resultBlob.size,
    isSkipped,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查任务是否被取消
 */
function checkCancelled(taskId: string): void {
  if (isCancelled && activeTaskId === taskId) {
    throw new Error('任务已取消');
  }
}

/**
 * 加载图片为 ImageBitmap
 */
async function loadImageBitmap(
  imageData: ArrayBuffer | string,
  mimeType: string
): Promise<ImageBitmap> {
  let blob: Blob;

  if (typeof imageData === 'string') {
    // Data URL 格式
    const response = await fetch(imageData);
    blob = await response.blob();
  } else {
    // ArrayBuffer 格式
    blob = new Blob([imageData], { type: mimeType });
  }

  return await createImageBitmap(blob);
}

/**
 * 计算目标尺寸和画布尺寸
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  config: ProcessingConfig
): {
  targetWidth: number;
  targetHeight: number;
  canvasWidth: number;
  canvasHeight: number;
} {
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  // 应用尺寸调整
  if (config.resizeMode === 'fixed_width') {
    targetWidth = config.resizeValue;
    if (config.maintainAspectRatio) {
      targetHeight = Math.round((originalHeight / originalWidth) * targetWidth);
    }
  } else if (config.resizeMode === 'fixed_height') {
    targetHeight = config.resizeValue;
    if (config.maintainAspectRatio) {
      targetWidth = Math.round((originalWidth / originalHeight) * targetHeight);
    }
  } else if (config.resizeMode === 'scale') {
    const ratio = config.resizeValue / 100;
    targetWidth = Math.round(originalWidth * ratio);
    targetHeight = Math.round(originalHeight * ratio);
  }

  // 确保最小尺寸为 1
  targetWidth = Math.max(1, targetWidth);
  targetHeight = Math.max(1, targetHeight);

  // 计算旋转后的画布尺寸
  const angleInRadians = (config.rotate * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(angleInRadians));
  const absSin = Math.abs(Math.sin(angleInRadians));

  const canvasWidth = Math.ceil(targetWidth * absCos + targetHeight * absSin);
  const canvasHeight = Math.ceil(targetWidth * absSin + targetHeight * absCos);

  return { targetWidth, targetHeight, canvasWidth, canvasHeight };
}

/**
 * 绘制水印
 */
async function drawWatermark(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  wm: WatermarkConfig
): Promise<void> {
  ctx.save();
  ctx.globalAlpha = wm.opacity;

  // 计算水印位置
  const positions: { x: number; y: number }[] = [];

  if (wm.position === 'tile') {
    const spacingX = width / 3;
    const spacingY = height / 3;
    for (let x = 0; x < width; x += Math.max(150, spacingX)) {
      for (let y = 0; y < height; y += Math.max(150, spacingY)) {
        positions.push({ x: x + (y % 2 === 0 ? 0 : 50), y });
      }
    }
  } else {
    const padding = Math.min(width, height) * 0.05;
    switch (wm.position) {
      case 'top-left':
        positions.push({ x: padding, y: padding });
        break;
      case 'top-right':
        positions.push({ x: width - padding, y: padding });
        break;
      case 'bottom-left':
        positions.push({ x: padding, y: height - padding });
        break;
      case 'bottom-right':
        positions.push({ x: width - padding, y: height - padding });
        break;
      case 'center':
      default:
        positions.push({ x: width / 2, y: height / 2 });
        break;
    }
  }

  // 加载水印图片（如果需要）
  let wmImageBitmap: ImageBitmap | null = null;
  if (wm.type === 'image' && wm.imageSrc) {
    try {
      const response = await fetch(wm.imageSrc);
      const blob = await response.blob();
      wmImageBitmap = await createImageBitmap(blob);
    } catch (e) {
      console.warn('[Worker] 水印图片加载失败:', e);
    }
  }

  // 在每个位置绘制水印
  positions.forEach((pos) => {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    ctx.scale(wm.scale, wm.scale);

    if (wm.type === 'text' && wm.text) {
      const baseSize = wm.fontSize || Math.min(width, height) * 0.05;
      ctx.font = `bold ${baseSize}px system-ui, sans-serif`;
      ctx.fillStyle = wm.color || '#ffffff';

      // 设置文字对齐
      if (wm.position === 'center' || wm.position === 'tile') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      } else if (wm.position.includes('left')) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
      }

      // 添加阴影
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(wm.text, 0, 0);
    } else if (wm.type === 'image' && wmImageBitmap) {
      const w = wmImageBitmap.width;
      const h = wmImageBitmap.height;
      ctx.drawImage(wmImageBitmap, -w / 2, -h / 2, w, h);
    }

    ctx.restore();
  });

  // 清理水印图片资源
  if (wmImageBitmap) {
    wmImageBitmap.close();
  }

  ctx.restore();
}

/**
 * 保留 EXIF 数据
 */
async function preserveExif(
  processedBlob: Blob,
  originalImageData: ArrayBuffer,
  config: ProcessingConfig
): Promise<Blob> {
  try {
    // 将原始数据转换为 Data URL 以提取 EXIF
    const originalDataURL = await arrayBufferToDataURL(originalImageData, 'image/jpeg');

    // 提取 EXIF
    let exifObj: Record<string, any> | undefined;
    try {
      exifObj = piexif.load(originalDataURL);
    } catch (e) {
      // 原图可能没有 EXIF
      console.debug('[Worker] 原图没有 EXIF 数据');
    }

    if (exifObj) {
      // 删除方向标签（因为我们已经在画布上应用了旋转）
      if (exifObj['0th'] && exifObj['0th'][piexif.ImageIFD.Orientation]) {
        delete exifObj['0th'][piexif.ImageIFD.Orientation];
      }

      // 将处理后的图片转换为 Data URL
      const processedDataURL = await blobToDataURL(processedBlob);

      // 插入 EXIF
      const exifStr = piexif.dump(exifObj);
      const finalDataURL = piexif.insert(exifStr, processedDataURL);

      // 转换回 Blob
      return dataURLToBlob(finalDataURL);
    }
  } catch (error) {
    console.error('[Worker] EXIF 处理失败:', error);
    // 失败时返回原始处理结果
  }

  return processedBlob;
}

/**
 * ArrayBuffer 转 Data URL
 */
function arrayBufferToDataURL(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Blob 转 Data URL
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(new Error('FileReader 错误'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Data URL 转 Blob
 */
function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error('无效的 DataURL 格式');

  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// ============================================================================
// Worker 启动确认
// ============================================================================

console.debug('[Worker] 图片处理 Worker 已启动');
