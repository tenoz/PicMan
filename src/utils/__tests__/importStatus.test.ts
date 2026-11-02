import { describe, it, expect } from 'vitest';
import { describeImportStatus, isDuplicateBatch, nextImportProgress } from '../importStatus';

describe('describeImportStatus', () => {
  it('还没扫完目录时提示扫描中', () => {
    expect(describeImportStatus({ total: 0, percent: 2, currentName: '' })).toBe('正在扫描文件夹…');
  });

  it('读盘阶段显示当前文件名，不再重复 n/n', () => {
    const text = describeImportStatus({ total: 1118, percent: 42, currentName: 'IMG_2043.jpg' });
    expect(text).toBe('正在读取 IMG_2043.jpg');
    expect(text).not.toContain('1118');
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it('文件名还没有时退回通用文案', () => {
    expect(describeImportStatus({ total: 20, percent: 10, currentName: '' })).toBe('正在从磁盘读取…');
  });

  it('95% 之后进入建列表阶段', () => {
    expect(describeImportStatus({ total: 37, percent: 95, currentName: 'a.png' })).toBe(
      '已读取 37 个文件，正在建立列表…'
    );
  });
});

/**
 * 重复拖放的识别。
 *
 * 背景（2026-11-02 日志实据）：Tauri 拖放会同时走 DOM drop 与原生事件两路。
 * 两路都到 handleFilesAdded，靠 `importingRef` 挡住后一路。一旦用户中途暂停，
 * 时间差被拉大——第一路 0.2 秒就跑完、锁已复位，第二路整批被判「文件已存在」，
 * 界面于是显示「143 个文件未导入」，而东西其实好好躺在列表里。
 *
 * 判据只看数据：整批没有一个成功、且跳过的原因清一色是「文件已存在」。
 */
describe('isDuplicateBatch', () => {
  const allExist = (n: number) => Array.from({ length: n }, () => ({ reason: '文件已存在' }));

  it('整批都是「文件已存在」：这是重复拖放，不是导入失败', () => {
    expect(isDuplicateBatch({ total: 143, success: 0, skipped: allExist(143) })).toBe(true);
  });

  it('有文件真的导进来了：不是重复，按正常流程走', () => {
    expect(isDuplicateBatch({ total: 143, success: 1, skipped: allExist(142) })).toBe(false);
  });

  it('跳过原因是超限 / 损坏：那是真问题，必须继续报给用户', () => {
    expect(
      isDuplicateBatch({
        total: 2,
        success: 0,
        skipped: [{ reason: '超过大小限制' }, { reason: '文件已存在' }],
      }),
    ).toBe(false);
  });

  it('空批次不算重复，别把空拖放也吞掉', () => {
    expect(isDuplicateBatch({ total: 0, success: 0, skipped: [] })).toBe(false);
  });

  it('跳过数对不上总数（中途被终止）：不算重复', () => {
    expect(isDuplicateBatch({ total: 100, success: 0, skipped: allExist(37) })).toBe(false);
  });
});

/**
 * 导入进度条只能往前走。
 *
 * 背景（2026-11-02 老大实测）：导入时进度条「有时会来回伸缩」。
 * Tauri 拖放会同时走两路，各自维护自己的 doneCount / totalFiles，
 * 交替写同一个 percent —— 后一路从 0 开始跑，就把前一路已经推到 95% 的条拉回去。
 * 条往后缩比数字跳还刺眼，因为它看起来像「刚才那批白干了」。
 */
describe('nextImportProgress', () => {
  it('正常前进照收', () => {
    expect(nextImportProgress(0, 42)).toBe(42);
    expect(nextImportProgress(42, 43)).toBe(43);
  });

  it('想往回退的一律挡下：这正是「来回伸缩」的来源', () => {
    expect(nextImportProgress(95, 0)).toBe(95);
    expect(nextImportProgress(60, 12)).toBe(60);
  });

  it('相同值不动，省一次无意义的渲染', () => {
    expect(nextImportProgress(42, 42)).toBe(42);
  });

  it('上下限都夹住', () => {
    expect(nextImportProgress(95, 140)).toBe(100);
    expect(nextImportProgress(10, -5)).toBe(10);
  });

  it('小数四舍五入，别让宽度出现 42.70000000000001%', () => {
    expect(nextImportProgress(0, 42.6)).toBe(43);
  });
});
