/**
 * 原图的磁盘路径。
 *
 * 只有 Tauri 拖放进来才有——文件本来就在磁盘上，读成 `File` 时顺手把路径挂在对象上，
 * 后面处理时就能让 Rust 直接读盘（省掉「canvas 出 PNG → IPC 写临时文件」那一大圈）。
 *
 * 浏览器里选/拖的文件没有路径（安全限制），读出来是 undefined，自动走 canvas 老路。
 */

const SRC_PATH_KEY = '__picmanSrcPath';

/** 把路径挂到 File 上。挂不上不算错，后续按"没有路径"处理 */
export function attachSrcPath(file: File, path: string): void {
  try {
    Object.defineProperty(file, SRC_PATH_KEY, {
      value: path,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  } catch {
    /* 某些环境 File 不可扩展，忽略即可 */
  }
}

export function getSrcPath(file: File): string | undefined {
  const value = (file as unknown as Record<string, unknown>)[SRC_PATH_KEY];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
