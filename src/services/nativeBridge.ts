/**
 * Tauri 桥接的公共部分：能力探测 + 一个确定可写的临时工作目录。
 *
 * **为什么不用 `tempDir()`**：Tauri **v1** 的 `path` API 里根本没有 `tempDir`
 * （那是 v2 才加的，v1 只有 appCacheDir / appLocalDataDir / homeDir 这一批）。
 * 早期 `rustPng.ts` 按 `path.tempDir` 探测，探测结果永远是 undefined，
 * 于是 PNG 无损重压在真机上一直静默跳过、退回 canvas 产物——功能"有"，但从没跑过。
 *
 * 现在统一用 `appCacheDir`（macOS 下在 `~/Library/Caches/<bundle>`，落在
 * `tauri.conf.json` 的 `fs.scope` 里的 `$HOME/**` 范围内，可写），
 * 再往里建一个 `picman-tmp/` 子目录放中间文件。
 */

interface TauriFs {
  writeBinaryFile?: (path: string, contents: Uint8Array) => Promise<void>;
  readBinaryFile?: (path: string) => Promise<Uint8Array>;
  removeFile?: (path: string) => Promise<void>;
  removeDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  /** 磁盘到磁盘复制：导出时用它取代「读进 JS 内存再写出去」 */
  copyFile?: (from: string, to: string) => Promise<void>;
  createDir?: (path: string, options?: { recursive?: boolean }) => Promise<unknown>;
  writeTextFile?: (path: string, contents: string) => Promise<void>;
  readTextFile?: (path: string) => Promise<string>;
  exists?: (path: string) => Promise<boolean>;
  readDir?: (path: string) => Promise<{ name: string; path: string }[]>;
}

interface TauriPath {
  appCacheDir?: () => Promise<string>;
  appLocalDataDir?: () => Promise<string>;
  appLogDir?: () => Promise<string>;
  logDir?: () => Promise<string>;
  homeDir?: () => Promise<string>;
}

export interface NativeBridge {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  fs?: TauriFs;
  path?: TauriPath;
}

/** 临时目录候选，按优先级依次尝试 */
const DIR_CANDIDATES: (keyof TauriPath)[] = ['appCacheDir', 'appLocalDataDir', 'homeDir'];

export const getNativeBridge = (): NativeBridge | null =>
  (window as unknown as { __TAURI__?: NativeBridge }).__TAURI__ ?? null;

/** 是否具备走原生能力的条件（纯检测，无副作用） */
export const isNativeReady = (bridge: NativeBridge | null): boolean => {
  if (!bridge?.invoke || !bridge.fs?.writeBinaryFile || !bridge.fs?.readBinaryFile) return false;
  return DIR_CANDIDATES.some((key) => typeof bridge.path?.[key] === 'function');
};

/**
 * 拿到 `picman-tmp` 工作目录（不存在则创建）。
 * 三级兜底，全部失败才抛错——调用方按"原生不可用"处理。
 */
export async function resolveWorkDir(bridge: NativeBridge): Promise<string> {
  const fsApi = bridge.fs;
  for (const key of DIR_CANDIDATES) {
    const resolver = bridge.path?.[key];
    if (typeof resolver !== 'function') continue;
    try {
      const base = await resolver();
      if (!base) continue;
      const dir = `${base.replace(/\/+$/, '')}/picman-tmp`;
      try {
        await fsApi?.createDir?.(dir, { recursive: true });
      } catch {
        /* 目录已存在也能用，交给后面的写文件去暴露真实问题 */
      }
      return dir;
    } catch {
      /* 换下一个候选 */
    }
  }
  throw new Error('找不到可写的临时目录');
}

/** 名字里带时间戳 + 随机串，避免并发处理时撞名 */
export const tempName = (prefix: string, ext: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

/** 日志目录候选：macOS 下 appLogDir 是 `~/Library/Logs/<bundle>` */
const LOG_DIR_CANDIDATES: (keyof TauriPath)[] = ['appLogDir', 'logDir', 'appLocalDataDir'];

/**
 * 拿到日志目录（不存在则创建）。
 * 全部失败返回 null —— 自动保存日志是锦上添花，不能影响主流程。
 */
export async function resolveLogDir(bridge: NativeBridge): Promise<string | null> {
  for (const key of LOG_DIR_CANDIDATES) {
    const resolver = bridge.path?.[key];
    if (typeof resolver !== 'function') continue;
    try {
      const dir = await resolver();
      if (!dir) continue;
      const clean = dir.replace(/\/+$/, '');
      try {
        await bridge.fs?.createDir?.(clean, { recursive: true });
      } catch {
        /* 已存在也正常 */
      }
      return clean;
    } catch {
      /* 换下一个候选 */
    }
  }
  return null;
}
