/**
 * 桌面端「直读原图转码」：Rust 从磁盘直接读原图 → 解码 → mozjpeg 编码。
 *
 * 和 `rustJpeg.ts` 的区别：那条路是「canvas 出 PNG 中间件 → 写盘 → Rust 编码」，
 * 2.88MB 的中间件光写盘就要 330ms（Tauri v1 的 IPC 把字节数组当 JSON 传）。
 * 原图本来就在磁盘上，直接读就省掉这两步——实测 3000×2000 单张 712ms → 265ms。
 *
 * 只适用于「原图没有任何编辑动作」：旋转/缩放/水印都得让 canvas 来做，
 * 而且带 EXIF Orientation 的图也不能直读（浏览器解码时会自动转正，Rust 不会）。
 */
import { getNativeBridge, isNativeReady, resolveWorkDir } from './nativeBridge';
import type { JpegLevel } from './rustJpeg';

export interface TranscodeOptions {
  /** 0–100 */
  quality: number;
  level?: JpegLevel;
  /** 纯 TIFF 结构（不含 "Exif\0\0"），Rust 侧会自己补前缀 */
  exif?: Uint8Array | null;
}

interface TranscodeCommandResult {
  before: number;
  after: number;
  outPath: string;
}

/** 是否具备直读转码的条件（纯检测，无副作用） */
export const canTranscodeNatively = (): boolean => isNativeReady(getNativeBridge());

/**
 * 把磁盘上的原图直接转成 JPEG。失败返回 null，调用方退回 canvas 路径。
 */
export async function transcodeToJpeg(
  srcPath: string,
  { quality, level = 'balanced', exif }: TranscodeOptions
): Promise<Blob | null> {
  const bridge = getNativeBridge();
  if (!isNativeReady(bridge) || !bridge) return null;

  const fs = bridge.fs!;
  let outPath = '';

  try {
    const dir = await resolveWorkDir(bridge);

    const result = (await bridge.invoke!('transcode_to_jpeg', {
      src_path: srcPath,
      out_dir: dir,
      quality: Math.max(1, Math.min(100, Math.round(quality))),
      level,
      exif: exif && exif.length > 0 ? Array.from(exif) : null,
    })) as TranscodeCommandResult;

    if (!result || !result.outPath || result.after <= 0) return null;
    outPath = result.outPath;

    const bytes = await fs.readBinaryFile!(outPath);
    return new Blob([bytes], { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[RustTranscode] 直读转码失败，改用 canvas 路径', err);
    return null;
  } finally {
    if (outPath) {
      fs.removeFile?.(outPath).catch(() => {
        /* 临时文件清不掉不影响结果 */
      });
    }
  }
}
