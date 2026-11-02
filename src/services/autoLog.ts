/**
 * 日志自动保存：**一天一个文件，每次只追加新产生的记录**。
 *
 * 之前是「每次操作存一份全量快照」，处理 5 次就是 5 个文件，每个都比上一个大一圈
 * （第 5 份里装着前 4 份的全部内容）。现在改成：
 * - 文件名按天：`picman_20261031.log`
 * - 内容只写增量（上次落盘之后新产生的日志），批次之间用一行分隔标题隔开
 *
 * 位置：`appLogDir()`（macOS 下是 `~/Library/Logs/<bundle-id>/`）。
 * 浏览器环境没有文件系统，直接跳过，不影响任何主流程。
 */
import { LogEntry } from '../types';
import { batchHeader, dailyLogFileName, formatLogsAsText } from '../utils/logFormat';
import { getNativeBridge, resolveLogDir } from './nativeBridge';

/**
 * 上次写到哪一条（用日志 id 作游标）。
 * 模块级变量，App 重启会重置——重启后第一次写会补一份全量，正好补上上下文。
 */
let lastPersistedId: string | null = null;

/** 只认自己生成的日志文件，别的文件一律不碰 */
const LOG_FILE_PATTERN = /^picman_(\d{4})(\d{2})(\d{2})\.log$/;

/** 自动日志保留天数 */
export const LOG_KEEP_DAYS = 90;

/**
 * 删掉超过保留期的日志文件。
 *
 * 安全边界：只删「日志目录下、文件名严格是 `picman_YYYYMMDD.log`、且日期早于保留期」的文件。
 * 名字对不上或日期解析不出来的一律跳过——这个函数只负责自己的文件，不能顺手清掉用户别的东西。
 */
export async function pruneOldLogFiles(
  bridge: { fs?: { readDir?: (p: string) => Promise<{ name: string; path: string }[]>; removeFile?: (p: string) => Promise<void> } },
  dir: string,
  keepDays = LOG_KEEP_DAYS
): Promise<number> {
  const fs = bridge.fs;
  if (!fs?.readDir || !fs.removeFile) return 0;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - keepDays);

  let removed = 0;
  try {
    const entries = await fs.readDir(dir);
    for (const entry of entries) {
      const m = LOG_FILE_PATTERN.exec(entry.name ?? '');
      if (!m) continue;

      const fileDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (Number.isNaN(fileDate.getTime())) continue;
      if (fileDate >= cutoff) continue;

      try {
        await fs.removeFile(entry.path || `${dir}/${entry.name}`);
        removed += 1;
      } catch {
        /* 单个文件删不掉不影响其它 */
      }
    }
  } catch (err) {
    console.warn('[AutoLog] 清理旧日志失败', err);
  }
  return removed;
}

/**
 * 追加写入当天日志文件。
 * @param logs 当前全量日志（内部自行截取增量）
 * @param title 批次标题，写进分隔行
 * @returns 实际写入的路径；跳过或失败返回 null
 */
export async function appendLogsToDailyFile(logs: LogEntry[], title: string): Promise<string | null> {
  if (!logs || logs.length === 0) return null;

  const bridge = getNativeBridge();
  if (!bridge?.fs?.writeTextFile) return null;

  // 只取「上次落盘之后」的新记录；游标失效（日志被清空过）就退回全量
  let startIndex = 0;
  if (lastPersistedId) {
    const idx = logs.findIndex((l) => l.id === lastPersistedId);
    startIndex = idx >= 0 ? idx + 1 : 0;
  }
  const fresh = logs.slice(startIndex);
  if (fresh.length === 0) return null;

  const fs = bridge.fs;
  try {
    const dir = await resolveLogDir(bridge);
    if (!dir) return null;

    const file = `${dir}/${dailyLogFileName()}`;

    // Tauri v1 的 fs 没有 append，只能读旧内容拼上新内容再整体写回。
    // 一天的日志量级是几十 KB，这点开销可以忽略。
    let existing = '';
    try {
      if (await fs.exists?.(file)) {
        existing = (await fs.readTextFile?.(file)) ?? '';
      }
    } catch {
      /* 读不到就当空文件，重写一份总比丢日志强 */
    }

    await fs.writeTextFile(file, existing + batchHeader(title) + formatLogsAsText(fresh));
    lastPersistedId = fresh[fresh.length - 1].id;

    // 顺手清掉超过保留期的旧日志（只动自己生成的 picman_YYYYMMDD.log）
    const pruned = await pruneOldLogFiles(bridge, dir);
    if (pruned > 0) console.info(`[AutoLog] 已清理 ${pruned} 个超过 ${LOG_KEEP_DAYS} 天的日志`);

    return file;
  } catch (err) {
    console.warn('[AutoLog] 写日志失败', err);
    return null;
  }
}

/** 日志被清空时重置游标（否则下次会误判成"没有新增"） */
export const resetAutoLogCursor = (): void => {
  lastPersistedId = null;
};
