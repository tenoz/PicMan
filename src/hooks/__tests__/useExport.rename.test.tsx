/**
 * 导出到目录时的命名策略。
 *
 * 重点守住一条：**rename 模式下绝不覆盖已有文件**。
 * 2026-10-31 的真实事故：第二批导出到第一批同一目录时，因为默认后缀是空串，
 * 文件名和第一批完全一样，直接把人家处理好的图盖了。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExport } from '../useExport';
import type { AppFile } from '../../types';

/** jsdom 的 Blob 没有 arrayBuffer()，用伪 Blob 顶替 */
const fakeBlob = (): Blob =>
  ({
    type: 'image/jpeg',
    size: 12,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }) as unknown as Blob;

const makeFile = (name: string, id = name, relPath?: string): AppFile => {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  if (relPath !== undefined) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relPath, configurable: true });
  }
  return {
    id,
    file,
    status: 'success',
    processedBlob: fakeBlob(),
    previewUrl: 'blob:x',
    originalSize: 100,
    dimensions: { width: 10, height: 10 },
    importedAt: Date.now(),
  } as AppFile;
};

let disk: Set<string>;
let writes: string[];

const installTauri = () => {
  disk = new Set();
  writes = [];
  const fs = {
    exists: async (p: string) => disk.has(p),
    writeBinaryFile: async (p: string) => {
      disk.add(p);
      writes.push(p);
    },
    createDir: async () => undefined,
    metadata: async (p: string) => {
      if (!disk.has(p)) throw new Error('not found');
      return {};
    },
  };
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { fs, path: { join: vi.fn() } };
};

describe('exportToDirectory 命名策略', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('rename 模式：目标已存在时改名，绝不覆盖', async () => {
    disk.add('/out/photo.jpg'); // 模拟第一批已经导出的文件

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('photo.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/photo_1.jpg']);
    expect(disk.has('/out/photo.jpg')).toBe(true); // 老文件还在
  });

  it('rename 模式：连号往后找，_1 也被占时用 _2', async () => {
    disk.add('/out/photo.jpg');
    disk.add('/out/photo_1.jpg');

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('photo.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/photo_2.jpg']);
  });

  it('rename 模式：目标不存在时保持原名', async () => {
    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('fresh.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/fresh.jpg']);
  });

  it('rename 模式：同一批次里的同名文件也要错开', async () => {
    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory(
        [makeFile('dup.jpg', 'a'), makeFile('dup.jpg', 'b')],
        '/out'
      );
    });

    expect(writes.sort()).toEqual(['/out/dup.jpg', '/out/dup_1.jpg']);
  });

  it('overwrite 模式：按用户意图直接覆盖', async () => {
    disk.add('/out/photo.jpg');

    const { result } = renderHook(() => useExport({ exportMode: 'overwrite', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('photo.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/photo.jpg']);
  });

  it('自定义后缀仍然生效（后缀 + 冲突改名可以叠加）', async () => {
    disk.add('/out/photo_small.jpg');

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '_small' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('photo.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/photo_small_1.jpg']);
  });
});

describe('exportToDirectory 文件夹级别的判重名', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('顶层文件夹已存在 → 整批挪到「素材A_1」，不在原文件夹里逐个改名', async () => {
    disk.add('/out/素材A'); // 第一批导出的目录

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory(
        [
          makeFile('img1.jpg', 'a1', '素材A/img1.jpg'),
          makeFile('img2.jpg', 'a2', '素材A/img2.jpg'),
        ],
        '/out'
      );
    });

    expect(writes.sort()).toEqual(['/out/素材A_1/img1.jpg', '/out/素材A_1/img2.jpg']);
    // 绝不出现「原文件夹里加 _1、把两批混在一起」的情况
    expect(writes.some((p) => p.startsWith('/out/素材A/'))).toBe(false);
  });

  it('同一批里同一个文件夹只判定一次（并发调用共享结果）', async () => {
    disk.add('/out/素材A');

    const files = Array.from({ length: 8 }, (_, i) =>
      makeFile(`p${i}.jpg`, `id${i}`, `素材A/p${i}.jpg`)
    );
    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory(files, '/out');
    });

    expect(writes).toHaveLength(8);
    expect(writes.every((p) => p.startsWith('/out/素材A_1/'))).toBe(true);
  });

  it('文件夹不冲突时保持原名', async () => {
    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('img.jpg', 'x', '素材B/img.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/素材B/img.jpg']);
  });

  it('子目录结构保留', async () => {
    disk.add('/out/素材A');

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory(
        [makeFile('img.jpg', 'x', '素材A/子目录/深一层/img.jpg')],
        '/out'
      );
    });

    expect(writes).toEqual(['/out/素材A_1/子目录/深一层/img.jpg']);
  });

  it('多个文件夹：各自独立判断，互不影响', async () => {
    disk.add('/out/素材A'); // 只有 A 冲突

    const { result } = renderHook(() => useExport({ exportMode: 'rename', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory(
        [
          makeFile('a.jpg', 'a', '素材A/a.jpg'),
          makeFile('b.jpg', 'b', '素材B/b.jpg'),
        ],
        '/out'
      );
    });

    expect(writes.sort()).toEqual(['/out/素材A_1/a.jpg', '/out/素材B/b.jpg']);
  });

  it('overwrite 模式不动文件夹名，按原名写进去', async () => {
    disk.add('/out/素材A');

    const { result } = renderHook(() => useExport({ exportMode: 'overwrite', filenameSuffix: '' }));
    await act(async () => {
      await result.current.exportToDirectory([makeFile('img.jpg', 'x', '素材A/img.jpg')], '/out');
    });

    expect(writes).toEqual(['/out/素材A/img.jpg']);
  });
});
