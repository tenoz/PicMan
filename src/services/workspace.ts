/**
 * 处理产物的磁盘工作区。
 *
 * 现状：处理完的图全部留在内存（`AppFile.processedBlob`），靠 1.5GB 预算兜底，
 * 批次一大就 OOM，超预算还会被 LRU 淘汰、导出时直接跳过。
 * 把产物落到磁盘后，内存占用就与批次大小无关了。
 *
 * 目录布局（落在 `fs.scope` 的 `$HOME/**` 内）：
 *   ~/Library/Caches/<bundle>/picman-tmp/work-<时间戳>-<随机>/0001_原文件名.jpg
 *
 * 用 `work-` 前缀是为了跟 `picman-tmp` 里 PNG/JPEG 中间件写的临时文件分开——
 * 清理时只认自己建的目录，别的一律不碰。
 */
import { getNativeBridge, resolveWorkDir } from './nativeBridge';

/** 目录名前缀，清理逻辑只认这个前缀 */
const WORK_PREFIX = 'work-';

/** 超过这个时长的历史批次在启动时清掉 */
const KEEP_HOURS = 24;

export interface WorkspaceHandle {
  /** 形如 20261101T211500-ab12cd，供日志和清理使用 */
  batchId: string;
  /** 本批次的绝对目录 */
  dir: string;
}

/** 当前环境能不能落盘（桌面端才有） */
export const isWorkspaceAvailable = (): boolean => {
  const bridge = getNativeBridge();
  return Boolean(bridge?.fs?.writeBinaryFile && bridge.fs?.createDir && bridge.path?.appCacheDir);
};

const stamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** 从目录名解析批次时间；解析不出来返回 null */
const parseBatchTime = (batchId: string): Date | null => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-/.exec(batchId);
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  );
};

/** 为本批次建一个工作目录；桌面端不可用时返回 null（浏览器继续用内存） */
export async function openWorkspace(): Promise<WorkspaceHandle | null> {
  if (!isWorkspaceAvailable()) return null;
  const bridge = getNativeBridge();
  if (!bridge) return null;

  try {
    const base = await resolveWorkDir(bridge);
    const batchId = `${stamp(new Date())}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = `${base.replace(/\/+$/, '')}/${WORK_PREFIX}${batchId}`;
    await bridge.fs?.createDir?.(dir, { recursive: true });
    return { batchId, dir };
  } catch (err) {
    console.warn('[Workspace] 工作目录创建失败，退回内存', err);
    return null;
  }
}

/**
 * 把一个产物写进工作目录，返回绝对路径；失败返回 null（调用方继续用内存里的 Blob）。
 *
 * 文件名前缀序号：不同子目录里的同名文件（`a/x.jpg` 和 `b/x.jpg`）落盘后
 * 必须能区分开，否则后写的会把先写的盖掉。
 */
export async function persistBlob(
  handle: WorkspaceHandle,
  index: number,
  fileName: string,
  blob: Blob,
): Promise<string | null> {
  const bridge = getNativeBridge();
  if (!bridge?.fs?.writeBinaryFile) return null;

  try {
    const safe = fileName.replace(/[/\\:*?"<>|]/g, '_').trim() || 'image';
    const path = `${handle.dir}/${String(index).padStart(4, '0')}_${safe}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await bridge.fs.writeBinaryFile(path, bytes);
    return path;
  } catch (err) {
    console.warn('[Workspace] 产物落盘失败，退回内存', err);
    return null;
  }
}

/**
 * 从磁盘把产物读回来（预览、单张下载用）。
 *
 * 产物不再常驻内存之后，这两条路必须能"用的时候读一张、用完就扔"。
 * 读不到就返回 null，由调用方决定退路——别在这里抛，调用方拿不到栈也做不了什么。
 */
export async function readBlobFromPath(path: string, mime: string): Promise<Blob | null> {
  const bridge = getNativeBridge();
  if (!bridge?.fs?.readBinaryFile) return null;

  try {
    const bytes = await bridge.fs.readBinaryFile(path);
    return new Blob([bytes], { type: mime });
  } catch (err) {
    console.warn('[Workspace] 读取产物失败', err);
    return null;
  }
}

/**
 * 删掉某个批次的工作目录（「清空列表」时调用）。
 *
 * 安全边界：只删我们自己建的、名字以 `work-` 开头的目录。
 * 少一个条件都不删——临时目录里还有别的模块的文件，误删一次就是别人的数据没了。
 */
export async function clearWorkspace(handle: WorkspaceHandle): Promise<void> {
  const bridge = getNativeBridge();
  if (!bridge?.fs?.removeDir) return;
  if (!handle.dir.includes(`/${WORK_PREFIX}`)) {
    console.warn('[Workspace] 拒绝删除非工作目录', handle.dir);
    return;
  }
  try {
    await bridge.fs.removeDir(handle.dir, { recursive: true });
  } catch (err) {
    console.warn('[Workspace] 清理工作目录失败', err);
  }
}

/**
 * 清理超过保留期的历史批次（应用启动时调用）。
 *
 * 只处理 `work-` 前缀且时间解析得出的目录；解析不出来的一律跳过。
 * @returns 被删掉的目录数
 */
export async function pruneOldWorkspaces(keepHours = KEEP_HOURS): Promise<number> {
  const bridge = getNativeBridge();
  if (!bridge?.fs?.readDir || !bridge.fs?.removeDir) return 0;

  const cutoff = Date.now() - keepHours * 3600 * 1000;
  let removed = 0;

  try {
    const base = await resolveWorkDir(bridge);
    const entries = await bridge.fs.readDir(base);

    for (const entry of entries) {
      if (!entry.name.startsWith(WORK_PREFIX)) continue;
      const time = parseBatchTime(entry.name.slice(WORK_PREFIX.length));
      if (!time || time.getTime() >= cutoff) continue;

      try {
        await bridge.fs.removeDir(entry.path || `${base}/${entry.name}`, { recursive: true });
        removed += 1;
      } catch {
        /* 单个目录删不掉不影响其它 */
      }
    }
  } catch (err) {
    console.warn('[Workspace] 清理历史批次失败', err);
  }

  return removed;
}
