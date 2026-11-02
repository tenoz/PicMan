/**
 * Utils 单元测试
 * 
 * 测试覆盖：
 * - formatBytes: 字节格式化
 * - generateId: ID 生成
 * - cn: className 合并
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatBytes, formatDurationCN, generateId, cn } from '../../utils';

describe('formatDurationCN（界面用的中文耗时）', () => {
  it('不到 1 分钟报秒', () => {
    expect(formatDurationCN(600)).toBe('0.6 秒');
    expect(formatDurationCN(11900)).toBe('11.9 秒');
  });

  it('超过 1 分钟报「X 分 Y 秒」', () => {
    expect(formatDurationCN(83000)).toBe('1 分 23 秒');
  });

  it('整分钟不带秒', () => {
    expect(formatDurationCN(180000)).toBe('3 分');
  });

  it('超过 1 小时报小时', () => {
    expect(formatDurationCN(3600000)).toBe('1 小时');
    expect(formatDurationCN(4500000)).toBe('1 小时 15 分');
  });

  it('0 或非法值报 0 秒', () => {
    expect(formatDurationCN(0)).toBe('0 秒');
    expect(formatDurationCN(-5)).toBe('0 秒');
    expect(formatDurationCN(NaN)).toBe('0 秒');
  });
});

describe('utils', () => {
  describe('formatBytes', () => {
    it('应该正确格式化 0 字节', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('应该正确格式化字节', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('应该正确格式化 KB', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10 KB');
    });

    it('应该正确格式化 MB', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
      expect(formatBytes(104857600)).toBe('100 MB');
    });

    it('应该正确格式化 GB', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(2147483648)).toBe('2 GB');
    });

    it('应该处理负数', () => {
      expect(formatBytes(-1024)).toBe('-1 KB');
      expect(formatBytes(-1572864)).toBe('-1.5 MB');
    });

    it('应该支持自定义小数位数', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 2)).toBe('1.5 KB'); // JavaScript toFixed 不保留尾随零
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });
  });

  describe('generateId', () => {
    it('应该生成 9 字符的 ID', () => {
      const id = generateId();
      expect(id.length).toBe(9);
    });

    it('每次调用应该生成不同的 ID', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      // 100 次生成 100 个不同 ID (几乎必然)
      expect(ids.size).toBe(100);
    });

    it('应该只包含字母和数字', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('cn', () => {
    it('应该合并 className 字符串', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('应该处理 falsy 值', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
      expect(cn('foo', null, undefined, 'bar')).toBe('foo bar');
    });

    it('应该处理条件 className', () => {
      const condition = true;
      expect(cn('foo', condition && 'bar')).toBe('foo bar');
      expect(cn('foo', false && 'bar')).toBe('foo');
    });

    it('应该处理数组', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
      expect(cn(['foo', false && 'bar', 'baz'])).toBe('foo baz');
    });

    it('应该处理对象语法', () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });
  });
});