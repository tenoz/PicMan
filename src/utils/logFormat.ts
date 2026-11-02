/**
 * 日志文本化：导出与自动保存共用一套格式，避免两边长得不一样。
 */
import { LogEntry } from '../types';

/** 与旧版导出格式保持一致（`[时间] [级别] 正文` + 可选 Details） */
export const formatLogsAsText = (logs: LogEntry[]): string =>
  logs
    .map(
      (l) =>
        `[${new Date(l.timestamp).toLocaleString()}] [${l.level.toUpperCase()}] ${l.message} ${
          l.details ? `\nDetails: ${l.details}` : ''
        }`
    )
    .join('\n\n');

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * 文件名用**本地时间**，不用 `toISOString()`。
 * 之前导出用 UTC，文件名是 `2026-10-31T01-19-18`，本地实际是 09:19，看图对不上时间。
 */
export const logFileName = (tag: string, now = new Date()): string => {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `picman_${stamp}_${tag}.txt`;
};

/** 自动日志按天归档：一天一个文件，全天操作追加在里面 */
export const dailyLogFileName = (now = new Date()): string =>
  `picman_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.log`;

/** 每批操作在文件里的分隔标题 */
export const batchHeader = (title: string, now = new Date()): string =>
  `\n\n========== ${now.toLocaleString()} · ${title} ==========\n`;
