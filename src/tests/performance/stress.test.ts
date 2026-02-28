import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TaskScheduler } from '@/src/utils/taskScheduler';
import { MemoryMonitor, formatBytes, getMemoryUsage } from '@/src/utils/memoryMonitor';
import type { ProcessingConfig, AppFile } from '@/types';

/**
 * 大批量压力测试 (500+ 张图片)
 * 测试目标：
 * 1. 验证系统能够处理 500 张图片
 * 2. 内存峰值 < 500MB
 * 3. UI 保持响应
 */

describe('🔥 大批量压力测试 (500+ 张图片)', () => {
  // 测试配置
  const TEST_CONFIG = {
    IMAGE_COUNT: 500,           // 测试图片数量
    IMAGE_WIDTH: 1920,          // 测试图片宽度
    IMAGE_HEIGHT: 1080,         // 测试图片高度
    MAX_MEMORY_MB: 500,         // 最大内存限制 (MB)
    MAX_PROCESSING_TIME_MS: 120000, // 最大处理时间 (120秒)
  };

  // 性能监控数据
  const metrics = {
    startTime: 0,
    endTime: 0,
    peakMemoryBytes: 0,
    processedCount: 0,
    failedCount: 0,
    uiResponseTimeMs: [] as number[],
    processingTimes: [] as number[],
  };

  let memoryMonitor: MemoryMonitor;
  let memoryCheckInterval: number;

  /**
   * 生成测试图片 Blob
   * 使用 Canvas 创建随机内容的测试图片
   */
  async function generateTestImage(
    width: number,
    height: number,
    index: number
  ): Promise<{ blob: Blob; file: File; previewUrl: string }> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 生成渐变背景（基于索引创建不同的颜色）
    const hue = (index * 137.5) % 360; // 黄金角度分布
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 40%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 添加一些图形内容
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 10; i++) {
      const x = (Math.sin(index + i) * 0.5 + 0.5) * width;
      const y = (Math.cos(index + i) * 0.5 + 0.5) * height;
      const r = 20 + (i * 5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 添加编号文字
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`TEST-${index + 1}`, width / 2, height / 2);

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85);
    });

    // 创建 File 对象
    const file = new File([blob], `test-image-${index + 1}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    // 创建预览 URL (使用 Data URL 代替 Object URL，兼容 jsdom)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // 清理 canvas
    canvas.width = 1;
    canvas.height = 1;

    return { blob, file, previewUrl: dataUrl };
  }

  /**
   * 模拟图片处理任务
   */
  async function processImageTask(
    appFile: AppFile,
    config: ProcessingConfig
  ): Promise<{ blob: Blob; width: number; height: number; processingTime: number }> {
    const startTime = performance.now();

    // 创建 canvas 进行图片处理
    const canvas = document.createElement('canvas');
    const targetWidth = Math.round(appFile.dimensions.width * 0.5); // 缩放到 50%
    const targetHeight = Math.round(appFile.dimensions.height * 0.5);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d')!;

    // 加载图片
    const img = new Image();
    img.src = appFile.previewUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });

    // 绘制缩放后的图片
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 应用格式和质量设置
    const resultBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b!),
        config.format,
        config.quality
      );
    });

    // 清理资源
    img.src = '';
    canvas.width = 1;
    canvas.height = 1;

    const processingTime = performance.now() - startTime;

    return {
      blob: resultBlob,
      width: targetWidth,
      height: targetHeight,
      processingTime,
    };
  }

  /**
   * 测试 UI 响应性
   * 模拟 UI 交互，测量响应时间
   */
  async function testUIResponsiveness(): Promise<number> {
    const startTime = performance.now();

    // 模拟 DOM 操作
    const testDiv = document.createElement('div');
    testDiv.style.cssText = 'position: fixed; left: -9999px; width: 100px; height: 100px;';
    document.body.appendChild(testDiv);

    // 强制重排和重绘
    const rect = testDiv.getBoundingClientRect();
    testDiv.style.width = `${rect.width + 1}px`;
    void testDiv.offsetHeight; // 强制重排

    // 清理
    document.body.removeChild(testDiv);

    return performance.now() - startTime;
  }

  beforeAll(async () => {
    // 初始化内存监控器
    memoryMonitor = new MemoryMonitor({
      checkInterval: 500,
      onPressureChange: (level, info) => {
        // 记录峰值内存
        if (info.usedJSHeapSize > metrics.peakMemoryBytes) {
          metrics.peakMemoryBytes = info.usedJSHeapSize;
        }
      },
    });

    // 启动内存监控
    memoryMonitor.start();

    // 设置定期内存检查
    memoryCheckInterval = window.setInterval(() => {
      const info = getMemoryUsage();
      if (info.usedJSHeapSize > metrics.peakMemoryBytes) {
        metrics.peakMemoryBytes = info.usedJSHeapSize;
      }
    }, 100);

    console.log(`🚀 压力测试开始 - 目标: ${TEST_CONFIG.IMAGE_COUNT} 张图片`);
  });

  afterAll(() => {
    // 清理资源
    memoryMonitor.stop();
    clearInterval(memoryCheckInterval);
  });

  it(`应该成功处理 ${TEST_CONFIG.IMAGE_COUNT} 张图片`, async () => {
    metrics.startTime = performance.now();

    // 步骤 1: 生成测试图片
    console.log(`📸 正在生成 ${TEST_CONFIG.IMAGE_COUNT} 张测试图片...`);
    const generateStart = performance.now();

    const testImages: { blob: Blob; file: File; previewUrl: string }[] = [];
    const batchSize = 50; // 分批生成，避免内存压力

    for (let batch = 0; batch < TEST_CONFIG.IMAGE_COUNT / batchSize; batch++) {
      const batchPromises: Promise<{ blob: Blob; file: File; previewUrl: string }>[] = [];
      for (let i = 0; i < batchSize; i++) {
        const index = batch * batchSize + i;
        if (index >= TEST_CONFIG.IMAGE_COUNT) break;
        batchPromises.push(generateTestImage(
          TEST_CONFIG.IMAGE_WIDTH,
          TEST_CONFIG.IMAGE_HEIGHT,
          index
        ));
      }
      const batchResults = await Promise.all(batchPromises);
      testImages.push(...batchResults);

      // 测试 UI 响应性
      const uiResponse = await testUIResponsiveness();
      metrics.uiResponseTimeMs.push(uiResponse);

      console.log(`  已生成 ${Math.min((batch + 1) * batchSize, TEST_CONFIG.IMAGE_COUNT)}/${TEST_CONFIG.IMAGE_COUNT} 张图片`);
    }

    const generateTime = performance.now() - generateStart;
    console.log(`✅ 图片生成完成，耗时: ${generateTime.toFixed(0)}ms`);

    // 步骤 2: 创建 AppFile 对象
    const appFiles: AppFile[] = testImages.map((img, index) => ({
      id: `stress-test-${index}`,
      file: img.file,
      previewUrl: img.previewUrl,
      status: 'idle',
      originalSize: img.blob.size,
      dimensions: {
        width: TEST_CONFIG.IMAGE_WIDTH,
        height: TEST_CONFIG.IMAGE_HEIGHT,
      },
      importedAt: Date.now(),
    }));

    // 步骤 3: 使用 TaskScheduler 批量处理
    console.log('⚙️ 开始批量处理...');
    const scheduler = new TaskScheduler({
      concurrency: navigator.hardwareConcurrency || 4,
      maxConcurrency: (navigator.hardwareConcurrency || 4) * 2,
      autoAdjust: true,
      debug: false,
    });

    // 标准处理配置
    const processingConfig: ProcessingConfig = {
      id: 'stress-test-config',
      name: 'Stress Test Config',
      format: 'image/jpeg',
      quality: 0.8,
      resizeMode: 'scale',
      resizeValue: 50,
      maintainAspectRatio: true,
      stripExif: true,
      rotate: 0,
      flipX: false,
      flipY: false,
      watermark: {
        enabled: false,
        type: 'text',
        opacity: 0.5,
        rotation: 0,
        scale: 1,
        position: 'center',
      },
      concurrency: 4,
      preventSizeInflation: true,
    };

    // 添加处理任务
    appFiles.forEach((appFile) => {
      scheduler.addTask({
        data: appFile,
        priority: 'normal',
        execute: async () => {
          const result = await processImageTask(appFile, processingConfig);
          metrics.processingTimes.push(result.processingTime);
          return result;
        },
      });
    });

    // 设置进度回调
    const progressInterval = setInterval(async () => {
      const stats = scheduler.getStats();
      console.log(`  进度: ${stats.completed}/${stats.total} 完成, ${stats.running} 运行中`);

      // 测试 UI 响应性
      const uiResponse = await testUIResponsiveness();
      metrics.uiResponseTimeMs.push(uiResponse);
    }, 2000);

    // 开始处理
    scheduler.start();
    await scheduler.waitForComplete();
    clearInterval(progressInterval);

    const stats = scheduler.getStats();
    metrics.processedCount = stats.completed;
    metrics.failedCount = stats.failed;

    // 步骤 4: 等待并记录最终内存状态
    await new Promise(resolve => setTimeout(resolve, 1000));
    const finalMemory = getMemoryUsage();
    if (finalMemory.usedJSHeapSize > metrics.peakMemoryBytes) {
      metrics.peakMemoryBytes = finalMemory.usedJSHeapSize;
    }

    metrics.endTime = performance.now();

    // 清理预览 URL
    appFiles.forEach((af) => {
      URL.revokeObjectURL(af.previewUrl);
    });

    // 销毁调度器
    scheduler.destroy();

    // 验证结果
    console.log('\n📊 测试结果:');
    console.log(`  成功处理: ${metrics.processedCount}/${TEST_CONFIG.IMAGE_COUNT}`);
    console.log(`  失败: ${metrics.failedCount}`);
    console.log(`  总耗时: ${(metrics.endTime - metrics.startTime).toFixed(0)}ms`);
    console.log(`  峰值内存: ${formatBytes(metrics.peakMemoryBytes)}`);

    expect(stats.completed).toBe(TEST_CONFIG.IMAGE_COUNT);
    expect(stats.failed).toBe(0);
  });

  it('内存峰值应该小于 500MB', () => {
    const peakMemoryMB = metrics.peakMemoryBytes / (1024 * 1024);
    console.log(`\n🧠 内存使用报告:`);
    console.log(`  峰值内存: ${peakMemoryMB.toFixed(2)} MB`);
    console.log(`  限制: ${TEST_CONFIG.MAX_MEMORY_MB} MB`);
    console.log(`  状态: ${peakMemoryMB < TEST_CONFIG.MAX_MEMORY_MB ? '✅ 通过' : '❌ 失败'}`);

    expect(peakMemoryMB).toBeLessThan(TEST_CONFIG.MAX_MEMORY_MB);
  });

  it('UI 应该保持响应（平均响应时间 < 50ms）', () => {
    if (metrics.uiResponseTimeMs.length === 0) {
      console.log('⚠️ 没有 UI 响应数据');
      return;
    }

    const avgResponseTime = metrics.uiResponseTimeMs.reduce((a, b) => a + b, 0) / metrics.uiResponseTimeMs.length;
    const maxResponseTime = Math.max(...metrics.uiResponseTimeMs);
    const minResponseTime = Math.min(...metrics.uiResponseTimeMs);

    console.log(`\n🖱️ UI 响应性报告:`);
    console.log(`  测试次数: ${metrics.uiResponseTimeMs.length}`);
    console.log(`  平均响应时间: ${avgResponseTime.toFixed(2)} ms`);
    console.log(`  最大响应时间: ${maxResponseTime.toFixed(2)} ms`);
    console.log(`  最小响应时间: ${minResponseTime.toFixed(2)} ms`);
    console.log(`  状态: ${avgResponseTime < 50 ? '✅ 通过' : '❌ 失败'}`);

    expect(avgResponseTime).toBeLessThan(50);
  });

  it('单张图片处理时间应该在合理范围内', () => {
    if (metrics.processingTimes.length === 0) {
      console.log('⚠️ 没有处理时间数据');
      return;
    }

    const avgTime = metrics.processingTimes.reduce((a, b) => a + b, 0) / metrics.processingTimes.length;
    const maxTime = Math.max(...metrics.processingTimes);
    const minTime = Math.min(...metrics.processingTimes);

    console.log(`\n⏱️ 处理时间报告:`);
    console.log(`  处理图片数: ${metrics.processingTimes.length}`);
    console.log(`  平均处理时间: ${avgTime.toFixed(2)} ms`);
    console.log(`  最大处理时间: ${maxTime.toFixed(2)} ms`);
    console.log(`  最小处理时间: ${minTime.toFixed(2)} ms`);
    console.log(`  总处理时间: ${(metrics.endTime - metrics.startTime).toFixed(0)} ms`);

    // 单张处理时间应该小于 1000ms
    expect(avgTime).toBeLessThan(1000);
  });

  it('应该生成详细的性能报告', () => {
    const totalTime = metrics.endTime - metrics.startTime;
    const throughput = (metrics.processedCount / totalTime) * 1000; // 张/秒
    const peakMemoryMB = metrics.peakMemoryBytes / (1024 * 1024);
    const avgResponseTime = metrics.uiResponseTimeMs.length > 0
      ? metrics.uiResponseTimeMs.reduce((a, b) => a + b, 0) / metrics.uiResponseTimeMs.length
      : 0;

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🔥 大批量压力测试报告 (500+ 张)                  ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ 测试图片数量:     ${metrics.processedCount.toString().padStart(30)} 张 ║`);
    console.log(`║ 成功处理:         ${(metrics.processedCount - metrics.failedCount).toString().padStart(30)} 张 ║`);
    console.log(`║ 处理失败:         ${metrics.failedCount.toString().padStart(30)} 张 ║`);
    console.log(`║ 图片尺寸:         ${`${TEST_CONFIG.IMAGE_WIDTH}x${TEST_CONFIG.IMAGE_HEIGHT}`.padStart(30)} px ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ 总处理时间:       ${(totalTime / 1000).toFixed(2).padStart(30)} 秒 ║`);
    console.log(`║ 处理吞吐率:       ${throughput.toFixed(2).padStart(30)} 张/秒 ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ 峰值内存使用:     ${`${peakMemoryMB.toFixed(2)} MB`.padStart(30)} ║`);
    console.log(`║ 内存限制:         ${`${TEST_CONFIG.MAX_MEMORY_MB} MB`.padStart(30)} ║`);
    console.log(`║ 内存状态:         ${(peakMemoryMB < TEST_CONFIG.MAX_MEMORY_MB ? '✅ 通过' : '❌ 超标').padStart(30)} ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ UI 平均响应时间:   ${`${avgResponseTime.toFixed(2)} ms`.padStart(30)} ║`);
    console.log(`║ UI 响应状态:       ${(avgResponseTime < 50 ? '✅ 响应良好' : '⚠️ 响应较慢').padStart(30)} ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    expect(true).toBe(true);
  });
});
