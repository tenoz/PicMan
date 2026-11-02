/**
 * 导入去重键。
 *
 * **不要带 `lastModified`**（2026-10-31 从真实日志里发现的坑）：
 * Tauri 拖放会同时触发 DOM drop 和原生 `tauri://file-drop`，两路拿到的文件其实是同一批。
 * 但原生那一路是用 `new File([data], name, { lastModified: Date.now() })` 现场造出来的，
 * 时间戳和 DOM 那一路差几毫秒 —— 一旦把 lastModified 算进去，两批的 key 就永远不相等，
 * 去重形同虚设：133 张会被导入两次、处理 266 张，白白多花一倍时间。
 *
 * 路径 + 名字 + 大小足够区分：不同目录的相同文件，`webkitRelativePath` 已经不同了。
 */
export const fileKey = (file: File): string =>
  `${file.webkitRelativePath || ''}|${file.name}|${file.size}`;
