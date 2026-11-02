import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppFile, ProcessingConfig } from '../../types';
import { DEFAULT_CONFIG } from '../../constants';
import { attachSrcPath } from '../../utils/fileSrcPath';
import { resolveDirectTranscode } from '../imageProcessor';

/** 造一张「原图」：默认不带 EXIF（orientation 按 1 处理） */
const makeFile = (withSrcPath = true): AppFile => {
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  if (withSrcPath) attachSrcPath(file, '/Volumes/SSD/photo/a.jpg');
  return {
    id: 'f1',
    file,
    previewUrl: 'blob:x',
    status: 'idle',
    originalSize: 1024,
    dimensions: { width: 800, height: 600 },
    importedAt: Date.now(),
  };
};

const makeConfig = (over: Partial<ProcessingConfig> = {}): ProcessingConfig => ({
  ...DEFAULT_CONFIG,
  format: 'image/jpeg',
  jpegEngine: 'native',
  rotate: 0,
  flipX: false,
  flipY: false,
  resizeMode: 'original',
  watermark: { ...DEFAULT_CONFIG.watermark, enabled: false },
  ...over,
});

/** 模拟桌面端环境 */
const installTauri = () => {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    invoke: async () => ({}),
    fs: {
      writeBinaryFile: async () => undefined,
      readBinaryFile: async () => new Uint8Array(),
    },
    path: { appCacheDir: async () => '/fake/cache' },
  };
};

describe('resolveDirectTranscode（能不能走 Rust 直读）', () => {
  beforeEach(() => installTauri());
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('条件全满足时返回磁盘路径', async () => {
    expect(await resolveDirectTranscode(makeFile(), makeConfig())).toBe('/Volumes/SSD/photo/a.jpg');
  });

  it('目标不是 JPEG → 不走', async () => {
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ format: 'image/png' }))).toBeNull();
  });

  it('用内置编码 → 不走（原生才需要绕开中间件）', async () => {
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ jpegEngine: 'builtin' }))).toBeNull();
  });

  it('有旋转 / 翻转 → 不走（几何变换只有 canvas 能做）', async () => {
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ rotate: 90 }))).toBeNull();
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ flipX: true }))).toBeNull();
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ flipY: true }))).toBeNull();
  });

  it('有缩放 → 不走', async () => {
    expect(await resolveDirectTranscode(makeFile(), makeConfig({ resizeMode: 'fixed_width' }))).toBeNull();
  });

  it('开了水印 → 不走', async () => {
    const config = makeConfig({ watermark: { ...DEFAULT_CONFIG.watermark, enabled: true, text: 'x' } });
    expect(await resolveDirectTranscode(makeFile(), config)).toBeNull();
  });

  it('动图 → 不走', async () => {
    const file = makeFile();
    file.isAnimated = true;
    expect(await resolveDirectTranscode(file, makeConfig())).toBeNull();
  });

  it('没有磁盘路径（浏览器导入）→ 不走', async () => {
    expect(await resolveDirectTranscode(makeFile(false), makeConfig())).toBeNull();
  });

  it('非桌面端 → 不走', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    expect(await resolveDirectTranscode(makeFile(), makeConfig())).toBeNull();
  });
});
