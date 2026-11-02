/**
 * 用本机压缩工具打包（桌面端）。
 *
 * 流程：前端把产物写进一个临时目录 → Rust 侧调 `/usr/bin/ditto` 打包 → 删临时目录。
 * 好处是整包不在 JS 堆里生成，1GB 以上的包不会把内存顶爆；代价是多一遍磁盘读写，
 * 所以默认仍用内置 JSZip，只有用户显式选择「本机压缩工具」时才走这里。
 *
 * 2026-11-01 修：原来用 `path.tempDir` 做能力探测，而 **Tauri v1 根本没有这个 API**
 * （v2 才有），探测恒为 undefined ⇒ `canZipNatively()` 永远 false，
 * 这个功能上线后一次都没真正跑过——和 AGENTS 坑 23 里 PNG 重压是同一个坑。
 * 现在统一走 `nativeBridge.resolveWorkDir()`。
 */

import { getNativeBridge, resolveWorkDir } from './nativeBridge';

export interface NativeZipResult {
  path: string;
  size: number;
  /** 实际用到的工具：ditto / zip */
  tool: string;
  /** 摆放阶段耗时：把产物摆进临时目录（硬链接的话几乎是 0） */
  stageMs?: number;
  /** 系统工具打包耗时 */
  zipMs?: number;
  /** 摆放方式：hardlink（零拷贝）/ copy（跨卷时的退路） */
  linkMode?: string;
}

/** 当前环境能否走系统压缩（桌面端且 fs/invoke 都在） */
export const canZipNatively = (): boolean => {
  const b = getNativeBridge();
  return Boolean(b?.invoke && b.fs?.writeBinaryFile && b.fs?.createDir && b.fs?.removeDir);
};

/**
 * 把一批文件写进临时目录并交给系统工具打包。
 *
 * 每个 entry 优先用 `sourcePath`（产物已在磁盘上，直接复制，不经过 JS 内存）；
 * 没有才退回 `blob`。这是「产物直接写盘」第二阶段的关键一步——
 * 408MB 的批次再也不需要在 JS 堆里存在第二份。
 *
 * @param entries 相对路径 → 内容（相对路径决定 zip 内的目录结构）
 * @param destZip 目标 zip 的绝对路径
 * @param onProgress 写入临时文件的进度回调，用于进度栏显示「写到第几个了」
 */
export async function zipEntriesNatively(
  entries: Array<{ path: string; blob?: Blob; sourcePath?: string }>,
  destZip: string,
  onProgress?: (written: number, total: number) => void
): Promise<NativeZipResult | null> {
  const bridge = getNativeBridge();
  if (!bridge?.invoke || !bridge.fs?.writeBinaryFile || !bridge.fs?.createDir) {
    return null;
  }

  const fs = bridge.fs;
  const invoke = bridge.invoke;
  let workDir = '';
  let tempBase = '';
  const t0 = performance.now();

  try {
    tempBase = await resolveWorkDir(bridge);
    workDir = `${tempBase.replace(/\/+$/, '')}/picman-zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.createDir(workDir, { recursive: true });

    let written = 0;
    let linkMode = 'copy';
    for (const entry of entries) {
      const rel = entry.path.replace(/^\/+/, '');
      const full = `${workDir}/${rel}`;
      const dir = full.substring(0, full.lastIndexOf('/'));
      if (dir) await fs.createDir(dir, { recursive: true });

      let placed = false;
      if (entry.sourcePath) {
        // 同卷硬链接：408MB 的批次从「复制几秒」变成「瞬间完成」
        try {
          linkMode = (await invoke('link_or_copy', { src: entry.sourcePath, dest: full })) as string;
          placed = true;
        } catch {
          // 源文件可能已被清理，落到下面用内存里的那份
        }
      }
      if (!placed) {
        if (!entry.blob) throw new Error(`产物既不在磁盘上也已释放：${entry.path}`);
        await fs.writeBinaryFile(full, new Uint8Array(await entry.blob.arrayBuffer()));
        linkMode = 'blob';
      }

      written += 1;
      // 上千个文件逐个回调会把父组件重渲染上千次，50 张一档
      if (onProgress && (written % 50 === 0 || written === entries.length)) {
        onProgress(written, entries.length);
      }
    }

    const stageMs = Math.round(performance.now() - t0);
    const result = (await invoke('zip_directory', { src: workDir, dest: destZip })) as NativeZipResult | null;
    if (!result) return null;

    return {
      ...result,
      stageMs,
      zipMs: Math.round(performance.now() - t0 - stageMs),
      linkMode,
    };
  } catch (err) {
    console.warn('[SystemZip] 系统压缩失败，将回退内置打包', err);
    return null;
  } finally {
    // 只删自己建的临时目录：路径必须落在工作目录下、名字必须带 picman-zip- 前缀。
    // 少一个条件都不删——用户目录里删错一次就是不可逆的数据丢失。
    const safeToRemove = Boolean(
      workDir
      && tempBase
      && workDir.startsWith(`${tempBase.replace(/\/+$/, '')}/picman-zip-`)
    );
    if (safeToRemove) {
      const removal = bridge.fs?.removeDir?.(workDir, { recursive: true });
      if (removal) {
        removal.catch(() => {
          /* 临时目录清不掉不影响结果 */
        });
      }
    }
  }
}
