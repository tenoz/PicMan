/**
 * ProcessingBar 单测：运行 / 暂停 / 完成 三种状态。
 *
 * 重点一：indeterminate —— 打包 ZIP 用它，此时**不能**再显示百分比，
 * 否则又回到「数字跳来跳去、条却对不上」的老问题（2026-11-01 用户实测）。
 *
 * 重点二：done 态 —— 任务结束后不立刻消失，停在完成态给结果（TODO 第 1 条）。
 * 有失败时必须转琥珀，不能一律转绿：复盘里 8 个坑有 5 个是「界面说成功、实际啥也没干」。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcessingBar } from '../ProcessingBar';

describe('ProcessingBar', () => {
  it('确定进度：显示百分比，宽度按 percent 填', () => {
    const { container } = render(
      <ProcessingBar visible tone="emerald" label="正在导出" percent={42} />,
    );

    expect(screen.getByText('42%')).toBeTruthy();
    const fill = container.querySelector('.progress-stripes') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('42%');
  });

  it('百分比四舍五入并夹在 0-100', () => {
    const { container } = render(
      <ProcessingBar visible tone="brand" label="处理中" percent={140} />,
    );
    expect(screen.getByText('100%')).toBeTruthy();

    const fill = container.querySelector('.progress-stripes') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('不确定进度：不显示百分比，改成来回跑的色块', () => {
    const { container } = render(
      <ProcessingBar visible tone="emerald" label="正在打包 ZIP" percent={88} indeterminate />,
    );

    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(container.querySelector('.pb-runner')).toBeTruthy();
    // 条纹填充不该同时存在，两者是互斥的两条路径
    expect(container.querySelector('.progress-stripes')).toBeNull();
  });

  it('不确定进度暂停时，色块停住并转琥珀', () => {
    const { container } = render(
      <ProcessingBar visible tone="emerald" label="打包已暂停" percent={0} indeterminate state="paused" />,
    );

    const runner = container.querySelector('.pb-runner') as HTMLElement;
    expect(runner.className).toContain('bg-amber-400');
    expect(runner.className).toContain('animation-play-state:paused');
  });

  it('visible=false 时什么都不渲染', () => {
    const { container } = render(
      <ProcessingBar visible={false} tone="brand" label="处理中" percent={10} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ProcessingBar 完成态', () => {
  it('完成态：进度填满、显示汇总、不再转圈', () => {
    const { container } = render(
      <ProcessingBar
        visible
        tone="brand"
        label="处理完成"
        percent={37}
        state="done"
        result={{ success: 374, skipped: 2, failed: 0, elapsedMs: 92400 }}
      />,
    );

    // percent 传的是 37，完成态一律按 100 填满
    const fill = container.querySelector('.progress-stripes') as HTMLElement;
    expect(fill.style.width).toBe('100%');

    expect(screen.getByText(/成功 374/)).toBeTruthy();
    // 转圈图标必须消失，否则「已完成」看着还在跑
    expect(container.querySelector('.animate-spin')).toBeNull();
    // 没有失败 → 绿色
    expect(fill.className).toContain('bg-emerald-500');
  });

  it('完成态有失败时转琥珀，不谎报成功', () => {
    const { container } = render(
      <ProcessingBar
        visible
        tone="brand"
        label="处理完成"
        percent={100}
        state="done"
        result={{ success: 370, skipped: 2, failed: 6, elapsedMs: 92400 }}
      />,
    );

    const fill = container.querySelector('.progress-stripes') as HTMLElement;
    expect(fill.className).toContain('bg-amber-400');
    expect(fill.className).not.toContain('bg-emerald-500');
  });

  it('完成态的汇总不能被窄屏断点藏掉', () => {
    render(
      <ProcessingBar
        visible
        tone="brand"
        label="处理完成"
        percent={100}
        state="done"
        result={{ success: 3, skipped: 0, failed: 0, elapsedMs: 1200 }}
      />,
    );

    // meta 在运行态是 hidden sm:inline（窄屏可省），完成态它是唯一的结论，必须常显
    const summary = screen.getByText(/成功 3/);
    expect(summary.className).not.toContain('hidden');
  });

  it('完成态可以手动关闭', () => {
    const onDismiss = vi.fn();
    render(
      <ProcessingBar
        visible
        tone="brand"
        label="处理完成"
        percent={100}
        state="done"
        result={{ success: 3, skipped: 0, failed: 0, elapsedMs: 1200 }}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /关闭/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
