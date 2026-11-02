/**
 * 三条进度栏（导入 / 处理 / 导出）共用一套完成态状态机。
 *
 * 这个测试守的是「别各写一份」：三条槽位如果各自维护一个 isDone state，
 * 迟早出现某条忘了清、某条没置位——v1.2.2 就养出过三个永远为 false 的死状态。
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskBarDone } from '../useTaskBarDone';

const sample = { success: 10, skipped: 0, failed: 0, elapsedMs: 1000 };

describe('useTaskBarDone', () => {
  it('初始状态下三条都没有完成态', () => {
    const { result } = renderHook(() => useTaskBarDone());
    expect(result.current.done.import).toBeUndefined();
    expect(result.current.done.process).toBeUndefined();
    expect(result.current.done.export).toBeUndefined();
  });

  it('finish 只写对应那条，另外两条不受影响', () => {
    const { result } = renderHook(() => useTaskBarDone());

    act(() => {
      result.current.finish('process', sample);
    });

    expect(result.current.done.process).toEqual(sample);
    expect(result.current.done.import).toBeUndefined();
    expect(result.current.done.export).toBeUndefined();
  });

  it('三条可以同时留着各自的完成态', () => {
    const { result } = renderHook(() => useTaskBarDone());

    act(() => {
      result.current.finish('import', { ...sample, success: 5 });
      result.current.finish('process', { ...sample, success: 6 });
      result.current.finish('export', { ...sample, success: 7 });
    });

    expect(result.current.done.import?.success).toBe(5);
    expect(result.current.done.process?.success).toBe(6);
    expect(result.current.done.export?.success).toBe(7);
  });

  it('clearAll 把三条一起清掉（任一操作开始时用）', () => {
    const { result } = renderHook(() => useTaskBarDone());

    act(() => {
      result.current.finish('import', sample);
      result.current.finish('process', sample);
    });
    act(() => {
      result.current.clearAll();
    });

    expect(result.current.done.import).toBeUndefined();
    expect(result.current.done.process).toBeUndefined();
  });

  it('dismiss 只关掉指定的那条，别误伤', () => {
    const { result } = renderHook(() => useTaskBarDone());

    act(() => {
      result.current.finish('import', sample);
      result.current.finish('process', sample);
    });
    act(() => {
      result.current.dismiss('import');
    });

    expect(result.current.done.import).toBeUndefined();
    expect(result.current.done.process).toEqual(sample);
  });

  it('同一批重复 finish 不会堆积，只留最后一次', () => {
    const { result } = renderHook(() => useTaskBarDone());

    act(() => {
      result.current.finish('process', { ...sample, success: 1 });
    });
    act(() => {
      result.current.finish('process', { ...sample, success: 2 });
    });

    expect(result.current.done.process?.success).toBe(2);
  });
});
