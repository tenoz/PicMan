/**
 * 智能任务调度器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler, Task, TaskPriority } from '../taskScheduler';

// 模拟延迟函数
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 创建一个简单的测试任务
const createTestTask = (
  id: string,
  duration: number = 10,
  priority: TaskPriority = 'normal',
  shouldFail: boolean = false
): Omit<Task, 'id' | 'status' | 'createdAt'> => ({
  data: { id, duration },
  priority,
  execute: async () => {
    await delay(duration);
    if (shouldFail) {
      throw new Error(`Task ${id} failed`);
    }
    return `Result of ${id}`;
  },
});

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler({
      concurrency: 2,
      autoAdjust: false,
      debug: false,
    });
  });

  afterEach(() => {
    scheduler.destroy();
  });

  describe('基本功能', () => {
    it('应该正确初始化调度器', () => {
      const stats = scheduler.getStats();
      expect(stats.total).toBe(0);
      expect(stats.concurrency).toBe(2);
      expect(stats.isRunning).toBe(false);
      expect(stats.isPaused).toBe(false);
    });

    it('应该能够添加任务', () => {
      const taskId = scheduler.addTask(createTestTask('task1'));
      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');

      const stats = scheduler.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('应该能够批量添加任务', () => {
      const tasks = [
        createTestTask('task1'),
        createTestTask('task2'),
        createTestTask('task3'),
      ];
      const taskIds = scheduler.addTasks(tasks);
      expect(taskIds).toHaveLength(3);

      const stats = scheduler.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(3);
    });

    it('应该能够获取任务', () => {
      const taskId = scheduler.addTask(createTestTask('task1'));
      const task = scheduler.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.data).toEqual({ id: 'task1', duration: 10 });
      expect(task?.priority).toBe('normal');
    });

    it('应该返回 undefined 当任务不存在时', () => {
      const task = scheduler.getTask('non-existent');
      expect(task).toBeUndefined();
    });
  });

  describe('任务执行', () => {
    it('应该能够执行单个任务', async () => {
      const onComplete = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
        onTaskComplete: onComplete,
      });

      scheduler.addTask(createTestTask('task1', 5));
      scheduler.start();

      await scheduler.waitForComplete();

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          data: { id: 'task1', duration: 5 },
        }),
        'Result of task1'
      );

      scheduler.destroy();
    });

    it('应该能够并发执行多个任务', async () => {
      const executionOrder: string[] = [];
      const scheduler = new TaskScheduler({
        concurrency: 3,
        autoAdjust: false,
      });

      // 创建3个任务，每个任务记录开始时间
      for (let i = 1; i <= 3; i++) {
        scheduler.addTask({
          data: { id: `task${i}` },
          priority: 'normal',
          execute: async () => {
            executionOrder.push(`start-${i}`);
            await delay(20);
            executionOrder.push(`end-${i}`);
            return i;
          },
        });
      }

      scheduler.start();
      await scheduler.waitForComplete();

      // 验证所有任务都并发开始
      expect(executionOrder.filter((e) => e.startsWith('start'))).toHaveLength(3);
      expect(executionOrder.filter((e) => e.startsWith('end'))).toHaveLength(3);

      scheduler.destroy();
    });

    it('应该正确处理任务失败', async () => {
      const onError = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
        onTaskError: onError,
      });

      scheduler.addTask(createTestTask('task1', 5, 'normal', true));
      scheduler.start();

      await scheduler.waitForComplete();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: expect.any(Error),
        }),
        expect.any(Error)
      );

      const stats = scheduler.getStats();
      expect(stats.failed).toBe(1);

      scheduler.destroy();
    });

    it('应该在所有任务完成时触发回调', async () => {
      const onAllComplete = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
        onAllComplete,
      });

      scheduler.addTask(createTestTask('task1', 5));
      scheduler.addTask(createTestTask('task2', 5));
      scheduler.start();

      await scheduler.waitForComplete();

      expect(onAllComplete).toHaveBeenCalledTimes(1);

      scheduler.destroy();
    });

    it('应该报告进度', async () => {
      const onProgress = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
        onProgress,
      });

      scheduler.addTask(createTestTask('task1', 5));
      scheduler.addTask(createTestTask('task2', 5));
      scheduler.start();

      await scheduler.waitForComplete();

      // 进度应该被报告多次
      expect(onProgress).toHaveBeenCalled();
      // 最终进度应该是 2/2
      expect(onProgress).toHaveBeenLastCalledWith(2, 2);

      scheduler.destroy();
    });
  });

  describe('暂停和恢复', () => {
    it('应该能够暂停处理', async () => {
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      scheduler.addTask(createTestTask('task1', 50));
      scheduler.start();

      // 等待任务开始
      await delay(10);

      scheduler.pause();
      expect(scheduler.getStats().isPaused).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.running + stats.pending).toBeGreaterThan(0);

      scheduler.destroy();
    });

    it('应该能够恢复处理', async () => {
      const onComplete = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
        onTaskComplete: onComplete,
      });

      scheduler.addTask(createTestTask('task1', 20));
      scheduler.start();

      // 暂停
      await delay(5);
      scheduler.pause();

      // 恢复
      scheduler.resume();
      expect(scheduler.getStats().isPaused).toBe(false);

      await scheduler.waitForComplete();

      expect(onComplete).toHaveBeenCalledTimes(1);

      scheduler.destroy();
    });

    it('暂停时不应该启动新任务', async () => {
      const executionOrder: string[] = [];
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      scheduler.addTask({
        data: { id: 'task1' },
        priority: 'normal',
        execute: async () => {
          executionOrder.push('task1');
          await delay(30);
          return 1;
        },
      });

      scheduler.addTask({
        data: { id: 'task2' },
        priority: 'normal',
        execute: async () => {
          executionOrder.push('task2');
          return 2;
        },
      });

      scheduler.start();

      // 等待第一个任务开始
      await delay(10);
      scheduler.pause();

      // 等待第一个任务完成
      await delay(50);

      // task2 不应该被执行
      expect(executionOrder).toContain('task1');
      expect(executionOrder).not.toContain('task2');

      scheduler.destroy();
    });
  });

  describe('取消任务', () => {
    it('应该能够取消待处理的任务', () => {
      scheduler.addTask(createTestTask('task1'));
      const taskId2 = scheduler.addTask(createTestTask('task2'));

      const cancelled = scheduler.cancel(taskId2);
      expect(cancelled).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.cancelled).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('不应该能够取消运行中的任务', async () => {
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      const taskId = scheduler.addTask(createTestTask('task1', 50));
      scheduler.start();

      // 等待任务开始
      await delay(10);

      const cancelled = scheduler.cancel(taskId);
      expect(cancelled).toBe(false);

      scheduler.destroy();
    });

    it('应该能够批量取消任务', () => {
      const taskIds = scheduler.addTasks([
        createTestTask('task1'),
        createTestTask('task2'),
        createTestTask('task3'),
      ]);

      const cancelledCount = scheduler.cancelMultiple(taskIds);
      expect(cancelledCount).toBe(3);

      const stats = scheduler.getStats();
      expect(stats.cancelled).toBe(3);
    });
  });

  describe('并发控制', () => {
    it('应该能够设置并发数', () => {
      scheduler.setConcurrency(4);
      expect(scheduler.getConcurrency()).toBe(4);

      scheduler.setConcurrency(1);
      expect(scheduler.getConcurrency()).toBe(1);
    });

    it('应该限制并发数在最小和最大值之间', () => {
      const scheduler = new TaskScheduler({
        concurrency: 2,
        maxConcurrency: 4,
        minConcurrency: 1,
        autoAdjust: false,
      });

      scheduler.setConcurrency(0);
      expect(scheduler.getConcurrency()).toBe(1); // 最小值

      scheduler.setConcurrency(100);
      expect(scheduler.getConcurrency()).toBe(4); // 最大值

      scheduler.destroy();
    });

    it('应该触发并发数变化回调', () => {
      const onConcurrencyChange = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
        onConcurrencyChange,
      });

      scheduler.setConcurrency(4);

      expect(onConcurrencyChange).toHaveBeenCalledWith(4, '手动调整');

      scheduler.destroy();
    });

    it('应该遵守并发限制', async () => {
      let runningCount = 0;
      let maxRunningCount = 0;
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
      });

      // 创建5个任务
      for (let i = 1; i <= 5; i++) {
        scheduler.addTask({
          data: { id: `task${i}` },
          priority: 'normal',
          execute: async () => {
            runningCount++;
            maxRunningCount = Math.max(maxRunningCount, runningCount);
            await delay(20);
            runningCount--;
            return i;
          },
        });
      }

      scheduler.start();
      await scheduler.waitForComplete();

      // 最大并发数应该不超过 2
      expect(maxRunningCount).toBeLessThanOrEqual(2);

      scheduler.destroy();
    });
  });

  describe('优先级队列', () => {
    it('应该按优先级顺序执行任务', async () => {
      const executionOrder: string[] = [];
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      // 添加不同优先级的任务
      scheduler.addTask({
        data: { id: 'low' },
        priority: 'low',
        execute: async () => {
          executionOrder.push('low');
          return 1;
        },
      });

      scheduler.addTask({
        data: { id: 'critical' },
        priority: 'critical',
        execute: async () => {
          executionOrder.push('critical');
          return 2;
        },
      });

      scheduler.addTask({
        data: { id: 'normal' },
        priority: 'normal',
        execute: async () => {
          executionOrder.push('normal');
          return 3;
        },
      });

      scheduler.addTask({
        data: { id: 'high' },
        priority: 'high',
        execute: async () => {
          executionOrder.push('high');
          return 4;
        },
      });

      scheduler.start();
      await scheduler.waitForComplete();

      // 执行顺序应该按优先级：critical > high > normal > low
      expect(executionOrder).toEqual(['critical', 'high', 'normal', 'low']);

      scheduler.destroy();
    });

    it('应该优先执行等待时间较长的任务', async () => {
      const executionOrder: string[] = [];
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      // 添加第一个普通优先级任务
      scheduler.addTask({
        data: { id: 'older' },
        priority: 'normal',
        execute: async () => {
          executionOrder.push('older');
          return 1;
        },
      });

      // 等待一段时间
      await delay(100);

      // 添加第二个普通优先级任务
      scheduler.addTask({
        data: { id: 'newer' },
        priority: 'normal',
        execute: async () => {
          executionOrder.push('newer');
          return 2;
        },
      });

      scheduler.start();
      await scheduler.waitForComplete();

      // 先添加的任务应该先执行
      expect(executionOrder).toEqual(['older', 'newer']);

      scheduler.destroy();
    });
  });

  describe('统计信息', () => {
    it('应该正确报告统计信息', async () => {
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
      });

      scheduler.addTask(createTestTask('task1', 10));
      scheduler.addTask(createTestTask('task2', 10));
      scheduler.addTask(createTestTask('task3', 10, 'normal', true));

      const taskId4 = scheduler.addTask(createTestTask('task4'));
      scheduler.cancel(taskId4);

      scheduler.start();
      await scheduler.waitForComplete();

      const stats = scheduler.getStats();
      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);

      scheduler.destroy();
    });
  });

  describe('清空任务', () => {
    it('应该能够清空所有任务', () => {
      scheduler.addTasks([
        createTestTask('task1'),
        createTestTask('task2'),
        createTestTask('task3'),
      ]);

      scheduler.clear(true);

      const stats = scheduler.getStats();
      expect(stats.total).toBe(0);
    });

    it('默认不清空运行中的任务', async () => {
      const scheduler = new TaskScheduler({
        concurrency: 1,
        autoAdjust: false,
      });

      scheduler.addTask(createTestTask('task1', 50));
      scheduler.addTask(createTestTask('task2'));
      scheduler.start();

      // 等待任务开始
      await delay(10);

      scheduler.clear(); // 不清空运行中的任务

      const stats = scheduler.getStats();
      expect(stats.running).toBe(1);
      expect(stats.pending).toBe(0);

      scheduler.destroy();
    });
  });

  describe('销毁', () => {
    it('应该能够销毁调度器', () => {
      scheduler.destroy();

      expect(() => scheduler.addTask(createTestTask('task1'))).toThrow('调度器已被销毁');
    });
  });

  describe('静态方法', () => {
    it('应该返回默认并发数', () => {
      const defaultConcurrency = TaskScheduler.getDefaultConcurrency();
      expect(typeof defaultConcurrency).toBe('number');
      expect(defaultConcurrency).toBeGreaterThanOrEqual(1);
    });

    it('应该返回建议的最大并发数', () => {
      const maxConcurrency = TaskScheduler.getSuggestedMaxConcurrency();
      const defaultConcurrency = TaskScheduler.getDefaultConcurrency();
      expect(maxConcurrency).toBe(defaultConcurrency * 2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空队列', async () => {
      const onAllComplete = vi.fn();
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
        onAllComplete,
      });

      scheduler.start();

      // 等待一小段时间
      await delay(50);

      // 没有任务时不应该触发 onAllComplete
      expect(onAllComplete).not.toHaveBeenCalled();

      scheduler.destroy();
    });

    it('应该处理快速连续的任务添加', async () => {
      const results: string[] = [];
      const scheduler = new TaskScheduler({
        concurrency: 2,
        autoAdjust: false,
      });

      // 快速添加多个任务
      for (let i = 0; i < 10; i++) {
        scheduler.addTask({
          data: { id: `task${i}` },
          priority: 'normal',
          execute: async () => {
            results.push(`task${i}`);
            await delay(5);
            return i;
          },
        });
      }

      scheduler.start();
      await scheduler.waitForComplete();

      expect(results).toHaveLength(10);

      scheduler.destroy();
    });

    it('应该正确处理任务 ID 重复的情况', () => {
      const customId = 'custom-id';

      const id1 = scheduler.addTask({
        ...createTestTask('task1'),
        id: customId,
      });

      const id2 = scheduler.addTask({
        ...createTestTask('task2'),
        id: customId,
      });

      // 第二个任务应该覆盖第一个
      expect(id1).toBe(customId);
      expect(id2).toBe(customId);

      const stats = scheduler.getStats();
      expect(stats.total).toBe(1);
    });
  });
});
