/**
 * 桌面端 JPEG 原生编码：canvas 出 PNG 中间文件 → Rust 用 mozjpeg 编码 JPEG。
 *
 * canvas 内置的 JPEG 编码器没有 trellis 量化、不做 huffman 优化，同视觉画质下
 * 通常比 mozjpeg 大 15–25%。这里接管这一步，等于用户白得一份体积。
 *
 * 四条安全边界（与 rustPng.ts 同构）：
 * 1. 非 Tauri 环境直接返回 null（调用方回退 canvas 编码）；
 * 2. 任何一步失败返回 null，不阻断处理；
 * 3. 临时文件无论成败都删；
 * 4. 工作目录见 `nativeBridge.ts`（Tauri v1 没有 tempDir，改用 appCacheDir）。
 */

import { getNativeBridge, isNativeReady, resolveWorkDir, tempName } from './nativeBridge';

/** fastest ≈ 8ms/张、balanced ≈ 33ms、smallest ≈ 430ms（1600×1200 release 实测） */
export type JpegLevel = 'fastest' | 'balanced' | 'smallest';

interface JpegEncodeResult {
  before: number;
  after: number;
  outPath: string;
}

export interface EncodeJpegOptions {
  /** 0–100，与 canvas 的 quality（0–1）不是同一刻度，调用方需换算 */
  quality: number;
  level?: JpegLevel;
  /** 纯 TIFF 结构（不含 "Exif\0\0"） */
  exif?: Uint8Array | null;
}

/** 是否具备走原生 JPEG 编码的条件（纯检测，无副作用） */
export const canEncodeJpegNatively = (): boolean => isNativeReady(getNativeBridge());

/**
 * 把 PNG 编码成 JPEG。失败时返回 null，调用方回退 canvas 的 JPEG。
 */
export async function encodeJpegNatively(
  pngBlob: Blob,
  { quality, level = 'balanced', exif }: EncodeJpegOptions
): Promise<Blob | null> {
  const bridge = getNativeBridge();
  if (!isNativeReady(bridge) || !bridge) return null;

  const fs = bridge.fs!;
  let pngPath = '';
  let outPath = '';

  try {
    const dir = await resolveWorkDir(bridge);
    pngPath = `${dir}/${tempName('jpeg', 'png')}`;

    await fs.writeBinaryFile!(pngPath, new Uint8Array(await pngBlob.arrayBuffer()));

    const result = (await bridge.invoke!('encode_jpeg', {
      // 参数名与 Rust 侧 `rename_all = "snake_case"` 对齐
      png_path: pngPath,
      quality: Math.max(1, Math.min(100, Math.round(quality))),
      level,
      exif: exif && exif.length > 0 ? Array.from(exif) : null,
    })) as JpegEncodeResult;

    if (!result || !result.outPath || result.after <= 0) return null;
    outPath = result.outPath;

    const bytes = await fs.readBinaryFile!(outPath);
    return new Blob([bytes], { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[RustJpeg] 原生编码失败，改用 canvas 产物', err);
    return null;
  } finally {
    if (pngPath) {
      fs.removeFile?.(pngPath).catch(() => {
        /* 临时文件清不掉不影响结果 */
      });
    }
    if (outPath) {
      fs.removeFile?.(outPath).catch(() => {
        /* 同上 */
      });
    }
  }
}
