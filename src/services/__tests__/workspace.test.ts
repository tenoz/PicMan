/**
 * 产物工作区：目录创建、落盘、清理的安全边界。
 *
 * 重点守两件事：
 * 1. 浏览器环境（没有 __TAURI__）必须安静地返回 null，不能抛错
 * 2. 清理只认自己建的 `work-` 目录，别的一律不碰
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isWorkspaceAvailable,
  openWorkspace,
  persistBlob,
  readBlobFromPath,
  clearWorkspace,
  pruneOldWorkspaces,
} from '../workspace';

/** jsdom 的 Blob 没有 arrayBuffer()，用伪 Blob 顶替 */
const fakeBlob = (): Blob =>
  ({
    type: 'image/jpeg',
    size: 3,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }) as unknown as Blob;

let writes: Array<{ path: string; bytes: Uint8Array }>;
let removed: string[];
let listing: Array<{ name: string; path: string }>;

const installTauri = () => {
  writes = [];
  removed = [];
  listing = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    fs: {
      writeBinaryFile: async (path: string, bytes: Uint8Array) => {
        writes.push({ path, bytes });
      },
      createDir: async () => undefined,
      removeDir: async (path: string) => {
        removed.push(path);
      },
      readDir: async () => listing,
    },
    path: { appCacheDir: async () => '/tmp/picman-cache' },
  };
};

const uninstallTauri = () => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
};

describe('workspace', () => {
  afterEach(() => uninstallTauri());

  describe('浏览器环境（无 Tauri）', () => {
    beforeEach(() => uninstallTauri());

    it('探测为不可用', () => {
      expect(isWorkspaceAvailable()).toBe(false);
    });

    it('建目录返回 null，落盘返回 null，不抛错', async () => {
      expect(await openWorkspace()).toBeNull();
      expect(await persistBlob({ batchId: 'x', dir: '/tmp/x' }, 0, 'a.jpg', fakeBlob())).toBeNull();
    });

    it('读回产物也返回 null——浏览器里产物本来就在内存', async () => {
      expect(await readBlobFromPath('/tmp/x.jpg', 'image/jpeg')).toBeNull();
    });
  });

  describe('桌面端', () => {
    beforeEach(() => installTauri());

    it('建出带 work- 前缀的批次目录', async () => {
      const ws = await openWorkspace();
      expect(ws).not.toBeNull();
      expect(ws!.dir).toContain('/tmp/picman-cache/picman-tmp/work-');
      expect(ws!.batchId).toMatch(/^\d{8}T\d{6}-/);
    });

    it('落盘时序号补齐四位，路径非法字符替换掉', async () => {
      const ws = await openWorkspace();
      const path = await persistBlob(ws!, 3, 'sub/a:b.jpg', fakeBlob());

      expect(path).toBe(`${ws!.dir}/0003_sub_a_b.jpg`);
      expect(writes).toHaveLength(1);
      expect(Array.from(writes[0].bytes)).toEqual([1, 2, 3]);
    });

    it('同名不同目录的文件落盘后不会互相覆盖', async () => {
      const ws = await openWorkspace();
      await persistBlob(ws!, 0, 'x.jpg', fakeBlob());
      await persistBlob(ws!, 1, 'x.jpg', fakeBlob());
      expect(new Set(writes.map(w => w.path)).size).toBe(2);
    });

    it('清空列表时删掉整个批次目录', async () => {
      const ws = await openWorkspace();
      await clearWorkspace(ws!);
      expect(removed).toEqual([ws!.dir]);
    });

    it('拒绝删除工作目录以外的路径', async () => {
      await clearWorkspace({ batchId: 'x', dir: '/Users/pxdog/Documents' });
      expect(removed).toEqual([]);
    });

    it('清理历史批次：只删超期且名字能解析的 work- 目录', async () => {
      listing = [
        { name: 'work-20200101T000000-old', path: '/tmp/picman-cache/picman-tmp/work-20200101T000000-old' },
        { name: 'work-29990101T000000-future', path: '/tmp/picman-cache/picman-tmp/work-29990101T000000-future' },
        { name: 'work-garbage', path: '/tmp/picman-cache/picman-tmp/work-garbage' },
        { name: 'png-temp-file', path: '/tmp/picman-cache/picman-tmp/png-temp-file' },
      ];

      const count = await pruneOldWorkspaces();

      expect(count).toBe(1);
      expect(removed).toEqual(['/tmp/picman-cache/picman-tmp/work-20200101T000000-old']);
    });

    it('从路径读回产物，MIME 用调用方给的', async () => {
      (window as unknown as { __TAURI__: { fs: Record<string, unknown> } }).__TAURI__.fs.readBinaryFile =
        async () => new Uint8Array([9, 8, 7]);

      const blob = await readBlobFromPath('/tmp/picman-cache/work-a/0001_x.png', 'image/png');

      expect(blob).not.toBeNull();
      expect(blob!.type).toBe('image/png');
      expect(blob!.size).toBe(3);
    });

    it('读失败返回 null，让调用方自己决定退路', async () => {
      (window as unknown as { __TAURI__: { fs: Record<string, unknown> } }).__TAURI__.fs.readBinaryFile =
        async () => { throw new Error('磁盘上的临时文件已经被清了'); };

      expect(await readBlobFromPath('/nope.png', 'image/png')).toBeNull();
    });
  });
});
