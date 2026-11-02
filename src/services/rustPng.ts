/**
 * 桌面端 PNG 无损重压：把 canvas 导出的 PNG 交给 Rust 侧的 oxipng 再压一遍。
 *
 * canvas 的 PNG 编码器只做最朴素的 zlib 压缩、不做 filter 策略搜索，产物明显偏大；
 * oxipng 会试多组 filter + 更强 deflate，通常还能再小 10–30%（无损，不改变任何像素）。
 *
 * 三条安全边界：
 * 1. 非 Tauri 环境（浏览器）直接原样返回；
 * 2. 任何一步失败（写临时文件、调用、读回）都退回 canvas 原产物，不阻断处理；
 * 3. 优化后反而更大时也退回原产物。
 *
 * 工作目录取 `picman-tmp`（见 `nativeBridge.ts` 里关于 Tauri v1 没有 tempDir 的说明）。
 */

import { getNativeBridge, isNativeReady, resolveWorkDir, tempName } from './nativeBridge';

interface OptimizeResult {
  before: number;
  after: number;
}

/** 是否具备走原生优化的条件（纯检测，无副作用） */
export const canOptimizeNatively = (): boolean => isNativeReady(getNativeBridge());

/**
 * 对一个 PNG Blob 做无损重压，返回新的 Blob。
 * @param blob canvas 编码出的 PNG
 * @param level oxipng 的 -o 等级 0–6，默认 2（速度与体积的平衡点）
 */
export async function optimizePngInPlace(blob: Blob, level = 2): Promise<Blob> {
  const bridge = getNativeBridge();
  if (!isNativeReady(bridge) || !bridge) return blob;

  const fs = bridge.fs!;
  let tempPath = '';

  try {
    const dir = await resolveWorkDir(bridge);
    tempPath = `${dir}/${tempName('optimize', 'png')}`;

    await fs.writeBinaryFile!(tempPath, new Uint8Array(await blob.arrayBuffer()));

    const result = (await bridge.invoke!('optimize_png', { path: tempPath, level })) as OptimizeResult;

    // 没省下来就别折腾，直接用 canvas 产物
    if (!result || result.after <= 0 || result.after > result.before) {
      return blob;
    }

    const bytes = await fs.readBinaryFile!(tempPath);
    return new Blob([bytes], { type: 'image/png' });
  } catch (err) {
    console.warn('[RustPng] 原生优化失败，改用 canvas 产物', err);
    return blob;
  } finally {
    if (tempPath) {
      fs.removeFile?.(tempPath).catch(() => {
        /* 临时文件清不掉不影响结果 */
      });
    }
  }
}
