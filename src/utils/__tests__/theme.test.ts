/**
 * 主题三态的纯逻辑。
 *
 * 规则只有一条容易错：**手动选的就压过系统**。
 * 选「始终亮」时，系统切到深色也不该跟着变——那是用户明确表态过的。
 */
import { describe, it, expect } from 'vitest';
import { normalizeThemeMode, resolveIsDark } from '../theme';

describe('normalizeThemeMode', () => {
  it('三种合法值原样返回', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('system')).toBe('system');
  });

  it('老版本存的就是 light / dark，必须继续认', () => {
    // v1.2.2 之前 localStorage.theme 只有这两个值，升级后不能把人的选择弄丢
    expect(normalizeThemeMode('dark')).toBe('dark');
  });

  it('脏值一律回落到跟随系统，不让界面卡在某个奇怪状态', () => {
    expect(normalizeThemeMode('紫色')).toBe('system');
    expect(normalizeThemeMode('')).toBe('system');
    expect(normalizeThemeMode(null)).toBe('system');
    expect(normalizeThemeMode(undefined)).toBe('system');
    expect(normalizeThemeMode(1)).toBe('system');
    expect(normalizeThemeMode({ mode: 'dark' })).toBe('system');
  });
});

describe('resolveIsDark', () => {
  it('跟随系统：系统暗才暗', () => {
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
  });

  it('手动选亮：系统再暗也不跟', () => {
    expect(resolveIsDark('light', true)).toBe(false);
  });

  it('手动选暗：系统再亮也不跟', () => {
    expect(resolveIsDark('dark', false)).toBe(true);
  });
});
