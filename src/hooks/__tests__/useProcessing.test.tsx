/**
 * useProcessing Hook 单元测试
 * 
 * 测试覆盖：
 * - 初始状态
 * - 暂停/继续/取消
 * - Worker 支持检测
 * - 基础状态转换
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessing } from '../useProcessing';
import { DEFAULT_CONFIG } from '../../constants';
import type { AppFile, ProcessingConfig } from '../../types';

// Mock imageProcessor service
vi.mock('../../services/imageProcessor', () => ({
  processImage: vi.fn().mockResolvedValue({
    blob: new Blob(['processed'], { type: 'image/png' }),
    width: 800,
    height: 600,
  }),
}));

// Mock TaskScheduler
vi.mock('../utils/taskScheduler', () => ({
  TaskScheduler: vi.fn().mockImplementation(() => ({
    addTask: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe('useProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('应该返回初始状态', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.progress).toBe(0);
    });

    it('应该支持自定义并发数', () => {
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          concurrency: 4,
        })
      );
      
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('pause / resume / cancel', () => {
    it('pause 在非处理状态应该无效', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(result.current.isPaused).toBe(false);
      
      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(false);
    });

    it('resume 在非暂停状态应该无效', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      
      act(() => {
        result.current.resume();
      });

      expect(result.current.isProcessing).toBe(false);
    });

    it('cancel 应该重置状态', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      act(() => {
        result.current.cancel();
      });

      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.progress).toBe(0);
    });
  });

  describe('processFiles 基础行为', () => {
    it('空列表应该直接返回 (无副作用)', async () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      await act(async () => {
        await result.current.processFiles([]);
      });

      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('回调函数支持', () => {
    it('应该支持 onTaskStart 回调配置', () => {
      const onTaskStart = vi.fn();
      
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          onTaskStart,
        })
      );
      
      // 只是验证回调配置不会导致错误
      expect(result.current.isProcessing).toBe(false);
    });

    it('应该支持 onTaskComplete 回调配置', () => {
      const onTaskComplete = vi.fn();
      
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          onTaskComplete,
        })
      );
      
      expect(result.current.isProcessing).toBe(false);
    });

    it('应该支持 onTaskError 回调配置', () => {
      const onTaskError = vi.fn();
      
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          onTaskError,
        })
      );
      
      expect(result.current.isProcessing).toBe(false);
    });

    it('应该支持 onProgress 回调配置', () => {
      const onProgress = vi.fn();
      
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          onProgress,
        })
      );
      
      expect(result.current.isProcessing).toBe(false);
    });

    it('应该支持 onAllComplete 回调配置', () => {
      const onAllComplete = vi.fn();
      
      const { result } = renderHook(() => 
        useProcessing({ 
          config: { format: 'png', quality: 80 } as any,
          onAllComplete,
        })
      );
      
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('processSingle 方法存在性', () => {
    it('processSingle 应该是函数', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(typeof result.current.processSingle).toBe('function');
    });

    it('processFiles 应该是函数', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(typeof result.current.processFiles).toBe('function');
    });

    it('pause 应该是函数', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(typeof result.current.pause).toBe('function');
    });

    it('resume 应该是函数', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(typeof result.current.resume).toBe('function');
    });

    it('cancel 应该是函数', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      expect(typeof result.current.cancel).toBe('function');
    });
  });

  describe('状态一致性', () => {
    it('初始状态 isProcessing 和 isPaused 应该互斥', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      // 初始状态都不是
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it('cancel 后状态应该重置', () => {
      const { result } = renderHook(() => 
        useProcessing({ config: { format: 'png', quality: 80 } as any })
      );
      
      act(() => {
        result.current.cancel();
      });

      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.progress).toBe(0);
    });
  });

  describe('体积膨胀兜底策略', () => {
    // processImage 被 mock 成固定返回 9 字节的 Blob，因此 originalSize < 9 即触发"变大"
    const makeAppFile = (overrides: Partial<AppFile> = {}): AppFile => ({
      id: 'f1',
      file: new File(['orig'], 'a.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:mock',
      status: 'idle',
      originalSize: 4,
      dimensions: { width: 100, height: 100 },
      importedAt: Date.now(),
      ...overrides,
    });

    const run = async (config: ProcessingConfig, file: AppFile) => {
      const { result } = renderHook(() => useProcessing({ config }));
      let out: AppFile | null = null;
      await act(async () => {
        out = await result.current.processSingle(file);
      });
      return out as AppFile | null;
    };

    it('严格策略：改格式后变大也保留原图', async () => {
      const file = makeAppFile();
      // 从 jpeg 转 png -> hasEdits 为 true，但严格策略仍然回退
      const out = await run(
        { ...DEFAULT_CONFIG, format: 'image/png', sizeInflationPolicy: 'always' },
        file
      );

      expect(out?.isSkipped).toBe(true);
      expect(out?.processedBlob).toBe(file.file);
      expect(out?.processedSize).toBe(4);
      expect(out?.inflation?.attemptedSize).toBe(9);
    });

    it('严格策略：记录膨胀百分比', async () => {
      const out = await run(
        { ...DEFAULT_CONFIG, format: 'image/png', sizeInflationPolicy: 'always' },
        makeAppFile()
      );
      // (9 - 4) / 4 = 125%
      expect(out?.inflation?.deltaPercent).toBe(125);
    });

    it('仅无损编辑：改格式时不回退，保留处理结果', async () => {
      const file = makeAppFile();
      const out = await run(
        { ...DEFAULT_CONFIG, format: 'image/png', sizeInflationPolicy: 'only-when-no-edit' },
        file
      );

      expect(out?.isSkipped).toBe(false);
      expect(out?.processedBlob).not.toBe(file.file);
      expect(out?.inflation).toBeUndefined();
    });

    it('仅无损编辑：未改格式时仍回退', async () => {
      const out = await run(
        { ...DEFAULT_CONFIG, format: 'image/jpeg', sizeInflationPolicy: 'only-when-no-edit' },
        makeAppFile()
      );

      expect(out?.isSkipped).toBe(true);
    });

    it('关闭防止体积变大后不回退', async () => {
      const file = makeAppFile();
      const out = await run(
        {
          ...DEFAULT_CONFIG,
          format: 'image/png',
          preventSizeInflation: false,
          sizeInflationPolicy: 'always',
        },
        file
      );

      expect(out?.isSkipped).toBe(false);
      expect(out?.processedSize).toBe(9);
    });
  });
});
