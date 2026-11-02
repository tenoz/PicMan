/**
 * useTaskBarDone.ts
 * 导入 / 处理 / 导出三条进度栏共用的完成态状态机。
 *
 * 为什么是一个 hook 而不是三份 state：三条槽位如果各自维护 isDone，
 * 迟早出现某条忘了清、某条没置位——v1.2.2 就养出过三个永远为 false 的死状态，
 * 进度条从不显示（AGENTS 坑 2）。
 */
import { useCallback, useState } from 'react';
import type { TaskBarDone, TaskBarKind } from '../utils/taskBar';

export function useTaskBarDone() {
  const [done, setDone] = useState<Partial<Record<TaskBarKind, TaskBarDone>>>({});

  /** 任务结束时调：把快照钉在对应的槽位上，停在完成态直到被清掉 */
  const finish = useCallback((kind: TaskBarKind, info: TaskBarDone) => {
    setDone(prev => ({ ...prev, [kind]: info }));
  }, []);

  /** 任一操作开始时调：三条一起清，新任务不留旧结论 */
  const clearAll = useCallback(() => setDone({}), []);

  /** 点完成态右上角的 × */
  const dismiss = useCallback((kind: TaskBarKind) => {
    setDone(prev => {
      if (!(kind in prev)) return prev;
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  }, []);

  return { done, finish, clearAll, dismiss };
}
