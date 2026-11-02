/**
 * 外观三态切换器。
 *
 * 单独成一个组件而不是塞进 ConfigPanel：面板那边一旦 locked 会把整块
 * `pointer-events-none + inert`，主题却跟处理任务毫无关系——锁住它只会让人以为界面卡了。
 * 所以它放在面板标题行，始终可点。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitch } from '../ThemeSwitch';

describe('ThemeSwitch', () => {
  it('三个选项都在，且带可读的名字', () => {
    render(<ThemeSwitch value="system" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '始终亮色' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '始终暗色' })).toBeTruthy();
  });

  it('当前模式只有那一个按钮是按下态', () => {
    render(<ThemeSwitch value="dark" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: '始终暗色' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '始终亮色' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '跟随系统' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('点哪个回哪个，不乱猜', () => {
    const onChange = vi.fn();
    render(<ThemeSwitch value="system" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '始终亮色' }));
    expect(onChange).toHaveBeenCalledWith('light');

    fireEvent.click(screen.getByRole('button', { name: '始终暗色' }));
    expect(onChange).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByRole('button', { name: '跟随系统' }));
    expect(onChange).toHaveBeenCalledWith('system');
  });
});
