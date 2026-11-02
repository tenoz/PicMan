import { describe, it, expect } from 'vitest';
import { formatLogsAsText, logFileName } from '../logFormat';
import { LogEntry } from '../../types';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'x',
  timestamp: new Date(2026, 9, 31, 9, 7, 43).getTime(),
  level: 'success',
  message: '批量处理完成',
  ...over,
});

describe('logFileName', () => {
  it('用本地时间，不用 UTC', () => {
    // 2026-10-31 09:07:43 本地 → 20261031_090743
    const name = logFileName('处理', new Date(2026, 9, 31, 9, 7, 43));
    expect(name).toBe('picman_20261031_090743_处理.txt');
  });

  it('月份/日/时/分/秒都补零', () => {
    const name = logFileName('导出', new Date(2026, 0, 5, 3, 4, 5));
    expect(name).toBe('picman_20260105_030405_导出.txt');
  });

  it('文件名带场景标签，便于区分', () => {
    const now = new Date(2026, 9, 31, 9, 7, 43);
    expect(logFileName('导入', now)).toContain('_导入');
    expect(logFileName('处理', now)).toContain('_处理');
  });
});

describe('formatLogsAsText', () => {
  it('单条日志：时间 + 级别 + 正文', () => {
    const text = formatLogsAsText([entry()]);
    expect(text).toContain('[SUCCESS]');
    expect(text).toContain('批量处理完成');
  });

  it('有 details 时输出 Details 行', () => {
    const text = formatLogsAsText([entry({ details: '总大小: 159.1 MB' })]);
    expect(text).toContain('Details: 总大小: 159.1 MB');
  });

  it('没有 details 时不输出空的 Details', () => {
    const text = formatLogsAsText([entry()]);
    expect(text).not.toContain('Details:');
  });

  it('多条之间用空行分隔，顺序保持写入顺序', () => {
    const text = formatLogsAsText([
      entry({ message: '第一条', level: 'info' }),
      entry({ message: '第二条', level: 'error' }),
    ]);
    expect(text.indexOf('第一条')).toBeLessThan(text.indexOf('第二条'));
    expect(text).toContain('\n\n');
  });

  it('空数组返回空串', () => {
    expect(formatLogsAsText([])).toBe('');
  });
});
