/**
 * taskBar.ts
 * 三条任务进度栏（导入 / 处理 / 导出）的完成态：类型 + 文案格式化。
 * 纯函数，不碰 React，单测见 `__tests__/taskBar.test.ts`。
 */

/** 进度栏三态。三条槽位共用同一个枚举，别再各写一套 boolean 组合。 */
export type TaskBarState = 'running' | 'paused' | 'done';

/** 三条槽位 */
export type TaskBarKind = 'import' | 'process' | 'export';

/**
 * 任务结束时抓下来的快照。
 *
 * **必须在计数被清零之前抓**：导入的 `finally` 第一件事就是 `setImportDone(0)`，
 * 晚一步就只剩 0，完成态会显示「成功 0」——正好落进复盘里那类「界面说成功、实际啥也没干」。
 */
export interface TaskBarDone {
  success: number;
  /** 导出没有「跳过」的概念，不传就整段不显示；传 0 则显示「跳过 0」 */
  skipped?: number;
  failed: number;
  elapsedMs: number;
}

/**
 * 完成态第一行的结论文案。
 *
 * 「成功」永远显示；「跳过 / 失败」只要调用方给了数（哪怕是 0）就显示——
 * 显示 0 才能证明确实统计过，藏起来只会让人分不清「没有」和「没统计」。
 */
export function formatTaskBarSummary(info: TaskBarDone): string {
  const parts = [`成功 ${info.success}`];
  if (info.skipped !== undefined) parts.push(`跳过 ${info.skipped}`);
  parts.push(`失败 ${info.failed}`);
  parts.push(`耗时 ${(info.elapsedMs / 1000).toFixed(1)}s`);
  return parts.join(' · ');
}

/**
 * 三条槽位共用的「活跃标志 → 三态」推导，别在 JSX 里各写一遍三元。
 *
 * 暂停必须优先判：`useProcessing.pause()` **不会**把 `isProcessing` 置 false，
 * 暂停时两个标志同时为 true，先判 active 就永远显示不出暂停（AGENTS 坑 2）。
 */
export function resolveBarState(active: boolean, paused: boolean): TaskBarState {
  if (!active) return 'done';
  return paused ? 'paused' : 'running';
}
