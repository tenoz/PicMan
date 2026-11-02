/**
 * 处理产物落盘的接入点。
 *
 * 这一步（P3 第二刀 第 1 步）不改变导出行为，只是让产物多一条磁盘路径——
 * 但它必须真的写下去，否则后面「导出走路径」就无从谈起。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessing } from '../useProcessing';
import { DEFAULT_CONFIG } from '../../constants';
import type { AppFile } from '../../types';

/** jsdom 的 Blob 没有 arrayBuffer()，用伪 Blob 顶替 */
const fakeBlob = (): Blob =>
  ({
    type: 'image/jpeg',
    size: 10,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }) as unknown as Blob;

vi.mock('../../services/imageProcessor', () => ({
  processImage: vi.fn(async () => ({
    blob: {
      type: 'image/jpeg',
      size: 10,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    },
    width: 10,
    height: 10,
  })),
}));

const makeFile = (id = '1', name = 'a.jpg'): AppFile => ({
  id,
  file: new File(['x'], name, { type: 'image/jpeg' }),
  previewUrl: 'blob:x',
  status: 'idle',
  originalSize: 100,
  dimensions: { width: 10, height: 10 },
  importedAt: Date.now(),
});

let writes: string[];
let removed: string[];

/**
 * 轮询等条件成立，别拿 `await processFiles()` 当「处理完了」。
 *
 * `processFiles` 只是把任务交给 TaskScheduler 然后 `start()` 就返回，
 * 真正的处理与写盘发生在那之后。原来直接断言 writes[1] 是在赌时序，
 * 机器一忙就拿到 undefined（2026-11-02 反复出现的那个「1 failed」就是它）。
 * 同类教训见 AGENTS 坑 14：时序测试靠固定 sleep 抢窗口迟早出事。
 */
const waitFor = async (cond: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('等待条件超时');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const installTauri = () => {
  writes = [];
  removed = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    fs: {
      writeBinaryFile: async (path: string) => {
        writes.push(path);
      },
      createDir: async () => undefined,
      removeDir: async (path: string) => {
        removed.push(path);
      },
      readDir: async () => [],
    },
    path: { appCacheDir: async () => '/tmp/picman-cache' },
  };
};

describe('处理产物落盘', () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('处理完写进工作目录：带 processedPath，但不再留 Blob', async () => {
    installTauri();
    let completed: AppFile | null = null;

    const { result } = renderHook(() =>
      useProcessing({
        config: DEFAULT_CONFIG,
        onTaskComplete: (f) => {
          completed = f;
        },
      }),
    );

    await act(async () => {
      await result.current.processFiles([makeFile()]);
      await waitFor(() => completed !== null && writes.length >= 1);
    });

    expect(completed).not.toBeNull();
    expect(completed!.processedPath).toContain('/tmp/picman-cache/picman-tmp/work-');
    // 落盘成功就不再攥着 Blob：内存占用从此与批次大小脱钩（P3 第 3 步，2026-11-02）
    expect(completed!.processedBlob).toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('0000_a.jpg');
  });

  it('浏览器环境不落盘，也不报错', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    let completed: AppFile | null = null;

    const { result } = renderHook(() =>
      useProcessing({
        config: DEFAULT_CONFIG,
        onTaskComplete: (f) => {
          completed = f;
        },
      }),
    );

    await act(async () => {
      await result.current.processFiles([makeFile()]);
      await waitFor(() => completed !== null);
    });

    expect(completed).not.toBeNull();
    expect(completed!.processedPath).toBeUndefined();
    expect(completed!.processedBlob).toBeTruthy();
  });

  it('清空时删掉本批目录，之后重新处理会开新目录', async () => {
    installTauri();
    const { result } = renderHook(() => useProcessing({ config: DEFAULT_CONFIG }));

    await act(async () => {
      await result.current.processFiles([makeFile()]);
      await waitFor(() => writes.length >= 1);
    });
    const firstDir = writes[0].slice(0, writes[0].lastIndexOf('/'));

    await act(async () => {
      await result.current.clearWorkspace();
    });
    expect(removed).toEqual([firstDir]);

    await act(async () => {
      await result.current.processFiles([makeFile('2', 'b.jpg')]);
      await waitFor(() => writes.length >= 2);
    });

    const secondDir = writes[1].slice(0, writes[1].lastIndexOf('/'));
    expect(secondDir).not.toBe(firstDir);
  });
});
