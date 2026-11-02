/**
 * 扁平化导出的目录结构。
 *
 * 语义（2026-11-01 老大定的）：拖进一个目录 `a`，导出时**最外层照样是 `a`**，
 * 只把 `a` 里面的子目录摊平：`a/b1/x.jpg` + `a/b2/y.jpg` → `目标/a/x.jpg` + `目标/a/y.jpg`。
 * 不是把所有文件直接丢在目标目录根下。
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

const makeFile = (name: string, id: string, relPath?: string): AppFile => {
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
let copies: Array<{ from: string; to: string }>;
let invokeMock: ReturnType<typeof vi.fn>;

const installTauri = () => {
  disk = new Set();
  writes = [];
  copies = [];
  invokeMock = vi.fn().mockResolvedValue({ path: '/out/out.zip', size: 1, tool: 'ditto' });
  const fs = {
    exists: async (p: string) => disk.has(p),
    writeBinaryFile: async (p: string) => {
      disk.add(p);
      writes.push(p);
    },
    copyFile: async (from: string, to: string) => {
      copies.push({ from, to });
      disk.add(to);
    },
    createDir: async () => undefined,
    removeDir: async () => undefined,
    metadata: async (p: string) => {
      if (!disk.has(p)) throw new Error('not found');
      return {};
    },
  };
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    fs,
    // 本机压缩要走 resolveWorkDir()：它按 appCacheDir 往下建 picman-tmp
    path: { join: () => '', appCacheDir: async () => '/tmp/picman-cache' },
    invoke: invokeMock,
  };
};

const exportFiles = async (files: AppFile[], flattenExport: boolean) => {
  const { result } = renderHook(() => useExport({ flattenExport, exportMode: 'rename', filenameSuffix: '' }));
  await act(async () => {
    await result.current.exportToDirectory(files, '/out');
  });
  return writes;
};

describe('exportToDirectory 扁平化', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('保留最外层目录，只摊平里面的子目录', async () => {
    const out = await exportFiles(
      [makeFile('x.jpg', '1', 'a/b1/x.jpg'), makeFile('y.jpg', '2', 'a/b2/y.jpg')],
      true,
    );
    expect(out.sort()).toEqual(['/out/a/x.jpg', '/out/a/y.jpg']);
  });

  it('不同子目录里的同名文件不会互相覆盖', async () => {
    const out = await exportFiles(
      [makeFile('x.jpg', '1', 'a/b1/x.jpg'), makeFile('x.jpg', '2', 'a/b2/x.jpg')],
      true,
    );
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
    expect(out.some(p => p.endsWith('/a/x.jpg'))).toBe(true);
    expect(out.some(p => p.endsWith('/a/x_1.jpg'))).toBe(true);
  });

  it('散文件没有顶层目录，直接铺在目标目录下', async () => {
    const out = await exportFiles([makeFile('x.jpg', '1'), makeFile('y.jpg', '2')], true);
    expect(out).toEqual(['/out/x.jpg', '/out/y.jpg']);
  });

  it('关掉扁平化时保留完整层级', async () => {
    const out = await exportFiles([makeFile('x.jpg', '1', 'a/b1/x.jpg')], false);
    expect(out).toEqual(['/out/a/b1/x.jpg']);
  });

  it('目标目录里已有同名文件夹时整批换名，不混进旧文件夹', async () => {
    disk.add('/out/a'); // 模拟上次已经导出过 a/
    const out = await exportFiles([makeFile('x.jpg', '1', 'a/b1/x.jpg')], true);
    expect(out).toEqual(['/out/a_1/x.jpg']);
  });
});

describe('产物直接写盘：导出走磁盘路径', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('目录导出优先 copyFile，不把产物读回 JS 内存', async () => {
    const f: AppFile = {
      ...makeFile('x.jpg', '1', 'a/x.jpg'),
      processedPath: '/tmp/picman-cache/picman-tmp/work-1/0000_x.jpg',
    };

    await exportFiles([f], false);

    // copyFile 不经过 writeBinaryFile，所以断言要看 copies 和磁盘
    expect(copies).toHaveLength(1);
    expect(copies[0].from).toBe('/tmp/picman-cache/picman-tmp/work-1/0000_x.jpg');
    expect(copies[0].to).toBe('/out/a/x.jpg');
    expect(disk.has('/out/a/x.jpg')).toBe(true);
  });

  it('磁盘文件已经不在时，退回内存里的 Blob', async () => {
    const f: AppFile = {
      ...makeFile('x.jpg', '1', 'a/x.jpg'),
      processedPath: '/tmp/picman-cache/picman-tmp/work-1/gone.jpg',
    };
    // 让 copyFile 抛错，模拟源文件被清掉
    const fs = (window as unknown as { __TAURI__?: { fs: Record<string, unknown> } }).__TAURI__!.fs;
    fs.copyFile = async () => {
      throw new Error('not found');
    };

    const out = await exportFiles([f], false);

    expect(out).toEqual(['/out/a/x.jpg']);
    expect(writes).toContain('/out/a/x.jpg');
  });

  it('没有 processedPath 时照旧写 Blob（浏览器与老数据）', async () => {
    const out = await exportFiles([makeFile('x.jpg', '1', 'a/x.jpg')], false);

    expect(out).toEqual(['/out/a/x.jpg']);
    expect(copies).toHaveLength(0);
    expect(writes).toContain('/out/a/x.jpg');
  });

  it('只有磁盘路径、没有 Blob 的文件也能导出', async () => {
    const f: AppFile = {
      ...makeFile('x.jpg', '1', 'a/x.jpg'),
      processedBlob: undefined,
      processedPath: '/tmp/picman-cache/picman-tmp/work-1/0000_x.jpg',
    };

    await exportFiles([f], false);

    expect(copies).toHaveLength(1);
    expect(disk.has('/out/a/x.jpg')).toBe(true);
  });

  it('本机压缩时直接从工作目录复制，不把 Blob 读回内存', async () => {
    const big: AppFile = {
      ...makeFile('a.jpg', '1', '杂图/a.jpg'),
      processedSize: 350 * 1024 * 1024,
      processedBlob: undefined, // 只剩磁盘路径也要能打
      processedPath: '/tmp/picman-cache/picman-tmp/work-1/0000_a.jpg',
    };
    const { result } = renderHook(() => useExport({ filenameSuffix: '', flattenExport: false }));

    await act(async () => {
      await result.current.exportToZip([big], { outputDir: '/out' });
    });

    expect(invokeMock).toHaveBeenCalledWith('zip_directory', expect.anything());
    // 摆进临时目录走的是 Rust 的 link_or_copy（同卷硬链接，零拷贝），不是 fs.copyFile
    expect(invokeMock).toHaveBeenCalledWith(
      'link_or_copy',
      expect.objectContaining({ src: '/tmp/picman-cache/picman-tmp/work-1/0000_a.jpg' }),
    );
  });
});

describe('打包引擎自动切换', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('批次超过内存安全线时，自动改用本机压缩而不是 JSZip', async () => {
    // processedSize 才是体积判定的依据，blob 本身给个小的就够
    const big: AppFile = { ...makeFile('a.jpg', '1'), processedSize: 350 * 1024 * 1024 };
    const { result } = renderHook(() => useExport({ filenameSuffix: '', flattenExport: false }));

    await act(async () => {
      await result.current.exportToZip([big], { outputDir: '/out' });
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'zip_directory',
      expect.objectContaining({ dest: expect.stringContaining('/out/') }),
    );
  });

  it('小批次仍走内置 JSZip，不惊动本机压缩', async () => {
    const small: AppFile = { ...makeFile('a.jpg', '1'), processedSize: 1024 };
    const { result } = renderHook(() => useExport({ filenameSuffix: '', flattenExport: false }));

    await act(async () => {
      await result.current.exportToZip([small], { outputDir: '/out' });
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('同名的压缩包已存在时改名，绝不覆盖上一次的包', async () => {
    disk.add('/out/杂图.zip'); // 模拟第一次打包的成果
    const big: AppFile = {
      ...makeFile('x.jpg', '1', '杂图/a.jpg'),
      processedSize: 350 * 1024 * 1024,
    };
    const { result } = renderHook(() => useExport({ filenameSuffix: '', flattenExport: false }));

    await act(async () => {
      await result.current.exportToZip([big], { outputDir: '/out' });
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'zip_directory',
      expect.objectContaining({ dest: '/out/杂图_1.zip' }),
    );
  });
});
