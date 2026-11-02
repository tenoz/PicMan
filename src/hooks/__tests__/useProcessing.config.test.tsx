/**
 * 回归测试：处理中暂停 → 改配置 → 继续，剩余文件必须按新配置处理。
 *
 * 关键点：任务入队时会把 `processSingleFileInternal` 整个函数交给 scheduler，
 * 如果它闭包捕获 `config`，后续任务永远用「入队那一刻」的旧配置。
 * 这个测试走**真实 TaskScheduler**（不 mock），用挂起的 processImage 卡住第一个任务，
 * 在它跑的时候改配置，再放行，检查第二个任务拿到的 format。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProcessing } from '../useProcessing';
import { DEFAULT_CONFIG } from '../../constants';
import { processImage } from '../../services/imageProcessor';
import type { AppFile, ProcessingConfig } from '../../types';

vi.mock('../../services/imageProcessor', () => ({
  processImage: vi.fn(async () => ({
    blob: new Blob(['processed-result']),
    width: 10,
    height: 10,
  })),
}));

const makeFile = (id: string): AppFile => ({
  id,
  file: new File(['original-content'], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: '',
  status: 'idle',
  originalSize: 16,
  dimensions: { width: 100, height: 80 },
  importedAt: Date.now(),
});

describe('处理中修改配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('暂停期间切到 JPG，继续后剩余文件用 JPG 而不是入队时的 PNG', async () => {
    // 第一个任务卡在 processImage 里，等我们改完配置再放行
    let releaseFirst: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    vi.mocked(processImage).mockImplementationOnce(async () => {
      await gate;
      return { blob: new Blob(['first']), width: 10, height: 10 };
    });

    const files = [makeFile('a'), makeFile('b')];
    // processFiles 只负责把任务塞进调度器，不会等全部跑完，所以用 onAllComplete 做完成信号
    let resolveAll: (() => void) | null = null;
    const allDone = new Promise<void>((resolve) => { resolveAll = resolve; });

    const { result, rerender } = renderHook(
      ({ config }: { config: ProcessingConfig }) =>
        useProcessing({ config, concurrency: 1, onAllComplete: () => resolveAll?.() }),
      { initialProps: { config: { ...DEFAULT_CONFIG, format: 'image/png' } } },
    );

    act(() => {
      void result.current.processFiles(files);
    });

    // 等第一个任务真的进入 processImage
    await waitFor(() => expect(processImage).toHaveBeenCalledTimes(1));

    // 此刻等同于「暂停 → 面板切成 JPG 90%」
    rerender({ config: { ...DEFAULT_CONFIG, format: 'image/jpeg', quality: 0.9 } });

    await act(async () => {
      releaseFirst?.();
      await allDone;
    });

    const calls = vi.mocked(processImage).mock.calls;
    expect(calls.length).toBe(2);
    // 第一个任务按旧配置（PNG），第二个必须吃到新配置（JPG）
    expect((calls[0][1] as ProcessingConfig).format).toBe('image/png');
    expect((calls[1][1] as ProcessingConfig).format).toBe('image/jpeg');
    expect((calls[1][1] as ProcessingConfig).quality).toBeCloseTo(0.9);
  });
});
