/**
 * 信息提示条（方案 A，2026-11-02 老大拍板）。
 *
 * 旧实现的问题：单条 + 翻页，多条得手动翻才看得全；永不自动消失，越积越多；
 * 背景 80% 透明，文字压在内容上；长文本靠 hover 跑马灯。
 *
 * 新规则：
 *   · 成功 / 提示：3.5s 自动消失
 *   · 警告 / 错误：常驻，必须手动关
 *   · 最多同时 3 条，多出来的折成「还有 N 条」，不再翻页
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NotificationStack, type AppNotification } from '../NotificationStack';

const make = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 1,
  msg: '处理完成',
  type: 'success',
  timestamp: Date.now(),
  ...over,
});

describe('NotificationStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('没有通知时什么都不渲染', () => {
    const { container } = render(
      <NotificationStack items={[]} onDismiss={() => {}} onDismissAll={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('渲染内容、任务名与关闭按钮', () => {
    render(
      <NotificationStack
        items={[make({ msg: '导出完成 · 成功 3', task: '导出' })]}
        onDismiss={() => {}}
        onDismissAll={() => {}}
      />,
    );

    expect(screen.getByText('导出完成 · 成功 3')).toBeTruthy();
    expect(screen.getByText('· 导出')).toBeTruthy();
  });

  it('成功类 5 秒后开始淡出，淡完才真正移除', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationStack items={[make({ id: 7 })]} onDismiss={onDismiss} onDismissAll={() => {}} />,
    );

    // 差一点还不到时间，不能提前关
    act(() => { vi.advanceTimersByTime(4900); });
    expect(onDismiss).not.toHaveBeenCalled();

    // 到点只是进入淡出，组件还在（直接卸载的话出场动画根本看不见）
    act(() => { vi.advanceTimersByTime(150); });
    expect(onDismiss).not.toHaveBeenCalled();

    // 淡出播完才真的移除
    act(() => { vi.advanceTimersByTime(250); });
    expect(onDismiss).toHaveBeenCalledWith(7);
  });

  it('鼠标悬停时暂停倒计时，移开后重新计时', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <NotificationStack items={[make({ id: 8 })]} onDismiss={onDismiss} onDismissAll={() => {}} />,
    );

    // 悬停在卡片上，推进远超 5 秒也不许消失——正在看的东西别抢走
    const card = container.querySelector('[role="status"] > div') as HTMLElement;
    fireEvent.mouseEnter(card);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(onDismiss).not.toHaveBeenCalled();

    // 移开后重新给满 5 秒。这里必须分两段推进：
    // 一次 advanceTimersByTime 里头，setLeaving 触发的 effect 要等 act 收尾才注册，
    // 中间那个 200ms 的淡出定时器还没建出来，一并推进就会漏掉
    fireEvent.mouseLeave(card);
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(onDismiss).toHaveBeenCalledWith(8);
  });

  it('警告常驻：到点也不许自己消失', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationStack
        items={[make({ id: 9, type: 'warn', msg: '处理完成：2 失败' })]}
        onDismiss={onDismiss}
        onDismissAll={() => {}}
      />,
    );

    act(() => { vi.advanceTimersByTime(10000); });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('处理完成：2 失败')).toBeTruthy();
  });

  it('错误同样常驻', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationStack
        items={[make({ id: 10, type: 'error', msg: '导出失败' })]}
        onDismiss={onDismiss}
        onDismissAll={() => {}}
      />,
    );

    act(() => { vi.advanceTimersByTime(10000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('点单条关闭：先淡出，再只关那一条', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationStack
        items={[make({ id: 3, msg: '第一条' }), make({ id: 4, msg: '第二条', type: 'warn' })]}
        onDismiss={onDismiss}
        onDismissAll={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /关闭这条/ })[0]);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(250); });
    expect(onDismiss).toHaveBeenCalledWith(3);
  });

  it('最多同时 3 条，多出来折成「还有 N 条」', () => {
    const items = [1, 2, 3, 4, 5].map(id => make({ id, msg: `第 ${id} 条`, type: 'warn' }));
    render(<NotificationStack items={items} onDismiss={() => {}} onDismissAll={() => {}} />);

    // 常驻类优先占位，取最新的 3 条
    expect(screen.getByText('第 3 条')).toBeTruthy();
    expect(screen.getByText('第 4 条')).toBeTruthy();
    expect(screen.getByText('第 5 条')).toBeTruthy();
    expect(screen.queryByText('第 1 条')).toBeNull();
    expect(screen.getByText(/还有 2 条/)).toBeTruthy();
  });

  it('警告优先占位，不会被后面涌进来的成功提示挤掉', () => {
    const items = [
      make({ id: 1, type: 'warn', msg: '有一条警告' }),
      make({ id: 2, type: 'success', msg: '成功 A' }),
      make({ id: 3, type: 'success', msg: '成功 B' }),
      make({ id: 4, type: 'success', msg: '成功 C' }),
    ];
    render(<NotificationStack items={items} onDismiss={() => {}} onDismissAll={() => {}} />);

    expect(screen.getByText('有一条警告')).toBeTruthy();
    // 3 个槽位被警告占掉 1 个，只剩 2 个给成功类 → 显示最新的两条
    expect(screen.getByText('成功 B')).toBeTruthy();
    expect(screen.getByText('成功 C')).toBeTruthy();
    expect(screen.queryByText('成功 A')).toBeNull();
  });

  it('长文本换行，不再用跑马灯', () => {
    const longMsg = '批量处理完成 · 成功 374 · 跳过 2 · 失败 0 · 耗时 92.4s · 320.5 MB → 210.2 MB（-34%）';
    const { container } = render(
      <NotificationStack items={[make({ msg: longMsg })]} onDismiss={() => {}} onDismissAll={() => {}} />,
    );

    expect(screen.getByText(longMsg)).toBeTruthy();
    expect(container.innerHTML).not.toContain('animate-marquee');
    // 也不该强行 nowrap，否则换不了行
    expect(screen.getByText(longMsg).className).not.toContain('whitespace-nowrap');
  });

  it('背景 80% 半透明，透出底下的顶栏', () => {
    const { container } = render(
      <NotificationStack items={[make({ type: 'success' })]} onDismiss={() => {}} onDismissAll={() => {}} />,
    );

    const card = container.querySelector('[role="status"] > div') as HTMLElement;
    // 类名必须写全；拼出来的 `/80` Tailwind 扫不到，透明度和底色会一起丢
    expect(card.className).toContain('bg-emerald-600/80');
  });

  it('全部关闭按钮触发 onDismissAll', () => {
    const onDismissAll = vi.fn();
    render(
      <NotificationStack
        items={[make({ id: 1 }), make({ id: 2, type: 'warn' })]}
        onDismiss={() => {}}
        onDismissAll={onDismissAll}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭全部' }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });
});
