import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LogEntry } from '../../types';
import { dailyLogFileName } from '../../utils/logFormat';

/** 内存里的假文件系统，模拟 Tauri 的 fs */
const store = new Map<string, string>();

const installTauriMock = () => {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    invoke: async () => ({}),
    fs: {
      writeTextFile: async (p: string, c: string) => {
        store.set(p, c);
      },
      readTextFile: async (p: string) => {
        if (!store.has(p)) throw new Error('not found');
        return store.get(p) as string;
      },
      exists: async (p: string) => store.has(p),
      createDir: async () => undefined,
      removeFile: async (p: string) => {
        store.delete(p);
      },
      readDir: async (dir: string) =>
        Array.from(store.keys())
          .filter((p) => p.startsWith(`${dir}/`))
          .map((p) => ({ name: p.slice(dir.length + 1), path: p })),
    },
    path: { appLogDir: async () => '/fake/logs' },
  };
};

const entry = (id: string, message: string): LogEntry => ({
  id,
  timestamp: new Date(2026, 9, 31, 10, 0, 0).getTime(),
  level: 'success',
  message,
});

describe('appendLogsToDailyFile', () => {
  beforeEach(async () => {
    store.clear();
    installTauriMock();
    const mod = await import('../autoLog');
    mod.resetAutoLogCursor();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('第一次写入：全量落到当天文件', async () => {
    const { appendLogsToDailyFile } = await import('../autoLog');
    const path = await appendLogsToDailyFile([entry('1', '第一条'), entry('2', '第二条')], '批量处理完成');

    expect(path).toBe(`/fake/logs/${dailyLogFileName()}`);
    const text = store.get(path as string) as string;
    expect(text).toContain('第一条');
    expect(text).toContain('第二条');
    expect(text).toContain('批量处理完成');
  });

  it('第二次只追加新增部分，不重复写旧内容', async () => {
    const { appendLogsToDailyFile } = await import('../autoLog');
    const first = [entry('1', '旧记录')];
    await appendLogsToDailyFile(first, '第一批');

    const second = [...first, entry('2', '新记录')];
    await appendLogsToDailyFile(second, '第二批');

    const text = store.get(`/fake/logs/${dailyLogFileName()}`) as string;
    // 旧记录只出现一次（不是整份重写）
    expect(text.split('旧记录').length - 1).toBe(1);
    expect(text).toContain('新记录');
    expect(text).toContain('第一批');
    expect(text).toContain('第二批');
  });

  it('没有新增日志时不动文件', async () => {
    const { appendLogsToDailyFile } = await import('../autoLog');
    const logs = [entry('1', '唯一一条')];
    await appendLogsToDailyFile(logs, '第一批');
    const before = store.get(`/fake/logs/${dailyLogFileName()}`);

    const path = await appendLogsToDailyFile(logs, '第二批');
    expect(path).toBeNull();
    expect(store.get(`/fake/logs/${dailyLogFileName()}`)).toBe(before);
  });

  it('空日志返回 null', async () => {
    const { appendLogsToDailyFile } = await import('../autoLog');
    expect(await appendLogsToDailyFile([], 'x')).toBeNull();
  });

  it('非桌面环境（没有 __TAURI__）返回 null，不抛错', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    const { appendLogsToDailyFile } = await import('../autoLog');
    expect(await appendLogsToDailyFile([entry('1', 'a')], 'x')).toBeNull();
  });

  it('日志被清空后重置游标，下次会写全量', async () => {
    const { appendLogsToDailyFile, resetAutoLogCursor } = await import('../autoLog');
    await appendLogsToDailyFile([entry('1', '清空前')], '第一批');

    resetAutoLogCursor();
    const again = [entry('9', '清空后')];
    await appendLogsToDailyFile(again, '第二批');

    const text = store.get(`/fake/logs/${dailyLogFileName()}`) as string;
    expect(text).toContain('清空前');
    expect(text).toContain('清空后');
  });
});

describe('pruneOldLogFiles', () => {
  const daysAgo = (n: number): string => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  };

  beforeEach(() => {
    store.clear();
    installTauriMock();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('删掉超过 90 天的日志，保留期内的不动', async () => {
    const { pruneOldLogFiles } = await import('../autoLog');
    const oldKey = `/fake/logs/picman_${daysAgo(120)}.log`;
    const edgeKey = `/fake/logs/picman_${daysAgo(91)}.log`;
    const keepKey = `/fake/logs/picman_${daysAgo(89)}.log`;
    const todayKey = `/fake/logs/picman_${daysAgo(0)}.log`;
    [oldKey, edgeKey, keepKey, todayKey].forEach((k) => store.set(k, 'x'));

    const removed = await pruneOldLogFiles((window as unknown as { __TAURI__: never }).__TAURI__, '/fake/logs');

    expect(removed).toBe(2);
    expect(store.has(oldKey)).toBe(false);
    expect(store.has(edgeKey)).toBe(false);
    expect(store.has(keepKey)).toBe(true);
    expect(store.has(todayKey)).toBe(true);
  });

  it('只删自己生成的 picman_YYYYMMDD.log，别的文件一律不碰', async () => {
    const { pruneOldLogFiles } = await import('../autoLog');
    const strayOldTxt = `/fake/logs/picman_${daysAgo(200)}_导入.txt`;
    const otherFile = '/fake/logs/important-notes.log';
    const notADate = '/fake/logs/picman_abcdefgh.log';
    [strayOldTxt, otherFile, notADate].forEach((k) => store.set(k, 'x'));

    const removed = await pruneOldLogFiles((window as unknown as { __TAURI__: never }).__TAURI__, '/fake/logs');

    expect(removed).toBe(0);
    expect(store.has(strayOldTxt)).toBe(true);
    expect(store.has(otherFile)).toBe(true);
    expect(store.has(notADate)).toBe(true);
  });

  it('没有 readDir 能力时安全返回 0', async () => {
    const { pruneOldLogFiles } = await import('../autoLog');
    expect(await pruneOldLogFiles({ fs: {} }, '/fake/logs')).toBe(0);
  });

  it('保留天数可自定义', async () => {
    const { pruneOldLogFiles } = await import('../autoLog');
    const weekAgo = `/fake/logs/picman_${daysAgo(10)}.log`;
    store.set(weekAgo, 'x');

    const removed = await pruneOldLogFiles(
      (window as unknown as { __TAURI__: never }).__TAURI__,
      '/fake/logs',
      7
    );

    expect(removed).toBe(1);
    expect(store.has(weekAgo)).toBe(false);
  });
});
