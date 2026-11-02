/**
 * 完成态汇总文案的单测。
 *
 * 为什么要单独测：完成态那一行是用户最终看到的结论。
 * 复盘里 8 个坑有 5 个是「界面说成功、实际啥也没干」，所以规则定死：
 * 「成功」永远显示，「跳过 / 失败」只要调方给了数（哪怕是 0）就必须显示，
 * 显示 0 才能证明"确实统计过"，藏起来只会让人分不清"没有"和"没统计"。
 */
import { describe, it, expect } from 'vitest';
import { formatTaskBarSummary, resolveBarState } from '../taskBar';

describe('formatTaskBarSummary', () => {
  it('四项齐全时按固定顺序拼', () => {
    expect(
      formatTaskBarSummary({ success: 374, skipped: 2, failed: 0, elapsedMs: 92400 }),
    ).toBe('成功 374 · 跳过 2 · 失败 0 · 耗时 92.4s');
  });

  it('跳过的 0 也要显示，不能省', () => {
    expect(
      formatTaskBarSummary({ success: 10, skipped: 0, failed: 0, elapsedMs: 1200 }),
    ).toBe('成功 10 · 跳过 0 · 失败 0 · 耗时 1.2s');
  });

  it('导出没有「跳过」概念，传 undefined 时整段不出现', () => {
    expect(
      formatTaskBarSummary({ success: 210, failed: 3, elapsedMs: 41000 }),
    ).toBe('成功 210 · 失败 3 · 耗时 41.0s');
  });

  it('耗时保留一位小数，不足 1 秒也照样显示', () => {
    expect(
      formatTaskBarSummary({ success: 1, failed: 0, elapsedMs: 340 }),
    ).toBe('成功 1 · 失败 0 · 耗时 0.3s');
  });
});

describe('resolveBarState', () => {
  it('任务在跑：running', () => {
    expect(resolveBarState(true, false)).toBe('running');
  });

  it('暂停优先于运行：useProcessing.pause() 不会把 isProcessing 置 false，两个标志会同时为 true', () => {
    expect(resolveBarState(true, true)).toBe('paused');
  });

  it('任务已结束：done（此时 paused 是残留值，必须被忽略）', () => {
    expect(resolveBarState(false, false)).toBe('done');
    expect(resolveBarState(false, true)).toBe('done');
  });
});
