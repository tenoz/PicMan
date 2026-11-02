/**
 * 导入进度栏第二行文案。
 * 计数（412 / 1118）已经显示在进度栏第一行，这里只讲「现在在干什么」。
 */
export interface ImportStatusInput {
  /** 扫描到的文件总数，0 表示还在扫目录 */
  total: number;
  /** 0-100 */
  percent: number;
  /** 最近一个开始读取的文件名，空串表示还没读到 */
  currentName: string;
}

export function describeImportStatus({ total, percent, currentName }: ImportStatusInput): string {
  if (total === 0) return '正在扫描文件夹…';
  if (percent >= 95) return `已读取 ${total} 个文件，正在建立列表…`;
  if (currentName) return `正在读取 ${currentName}`;
  return '正在从磁盘读取…';
}

/**
 * 这一批是不是「重复拖放」。
 *
 * Tauri 拖放会同时走 DOM drop 与原生事件两路，两路最终都调 `handleFilesAdded`，
 * 靠 `importingRef` 挡住后一路。这个锁有盲区：**它只看「是否正在导入」，不看「数据是否已经在了」**。
 * 用户中途一暂停，两路的时间差被拉开——第一路 0.2 秒跑完、锁复位，第二路整批被判「文件已存在」，
 * 界面于是显示「143 个文件未导入」，而文件其实好好躺在列表里（2026-11-02 日志实据）。
 *
 * 判据只看数据：没有一个成功、跳过的原因清一色「文件已存在」、且数目对得上。
 * 只要有一条别的失败原因（超限、损坏），那就是真问题，必须照常报给用户。
 */
export function isDuplicateBatch(result: {
  total: number;
  success: number;
  skipped: { reason: string }[];
}): boolean {
  if (result.total <= 0) return false;
  if (result.success > 0) return false;
  if (result.skipped.length !== result.total) return false;
  return result.skipped.every(s => s.reason === '文件已存在');
}

/**
 * 导入进度只进不退。
 *
 * Tauri 拖放会同时走两路，**每路都有自己的 `doneCount` / `totalFiles`**，交替写同一个
 * percent。后一路从 0 开始跑，就把前一路已经推到 95% 的条拉回去——表现是**进度条来回伸缩**
 * （2026-11-02 老大实测）。条往回缩比数字跳更刺眼：看起来像「刚才那批白干了」。
 *
 * 归零不走这里：新批次由 `reset` 显式把基准放回 0，否则下批永远卡在 100。
 */
export function nextImportProgress(current: number, incoming: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(incoming)));
  return Math.max(current, clamped);
}
