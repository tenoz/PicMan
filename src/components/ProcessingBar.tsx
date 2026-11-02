/**
 * ProcessingBar.tsx
 * 任务进度栏 —— 导入 / 处理 / 导出 共用一套样式，固定在文件列表下方。
 *
 * 布局特意分两行：
 *   第一行：状态 · 计数 · 进度条 · 百分比 · 吞吐/剩余
 *   第二行：当前文件名（独占一行）
 * 原因是文件名长短不一，塞在第一行会把进度条挤得一会长一会短。
 *
 * 这里**只显示、不操作**：暂停/继续/终止统一收在顶部工具栏，
 * 避免同一个动作在上下两处各有一套按钮（2026-10-31 起）。
 * 唯一的例外是完成态右上角的 ×——它只关掉这条提示，不影响任何任务。
 *
 * 三态：running / paused / done。done 态不立刻消失，停在原地把结果说清楚
 * （成功多少、跳过多少、失败多少、花了多久），直到下一次操作开始或手动关闭。
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pause, X } from 'lucide-react';
import type { TaskBarDone, TaskBarState } from '../utils/taskBar';
import { formatTaskBarSummary } from '../utils/taskBar';

type Tone = 'brand' | 'sky' | 'emerald';

const TONES: Record<Tone, { bar: string; text: string; ring: string }> = {
  brand: {
    bar: 'bg-brand-500',
    text: 'text-brand-600 dark:text-brand-400',
    ring: 'text-brand-500',
  },
  sky: {
    bar: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    ring: 'text-sky-500',
  },
  emerald: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'text-emerald-500',
  },
};

interface ProcessingBarProps {
  /** 是否显示 */
  visible: boolean;
  /** 主色：处理=brand，导入=sky，导出=emerald */
  tone: Tone;
  /** 状态文案，如「处理中」「导入已暂停」「处理完成」 */
  label: string;
  /** 百分比 0-100 */
  percent: number;
  /** 已完成 / 总数，缺省时不显示计数 */
  done?: number;
  total?: number;
  /** 第二行：当前文件名或阶段说明 */
  detail?: string;
  /** 第一行右侧补充信息，如「12.3 张/秒 · 剩余 28s」 */
  meta?: string;
  /** running 运行 / paused 暂停 / done 完成（缺省 running） */
  state?: TaskBarState;
  /**
   * 进度不确定：不显示百分比、不按 percent 填宽度，改成一段色块来回跑。
   * 打包 ZIP 用它——JSZip 的百分比颗粒太粗，跳来跳去不如不显示。
   */
  indeterminate?: boolean;
  /**
   * 完成态的结果快照。给了才渲染「成功 N · 跳过 M · 失败 K · 耗时 X s」，
   * 并据此决定转绿还是转琥珀——有失败就必须是琥珀，别谎报全绿。
   */
  result?: TaskBarDone;
  /** 完成态的 × */
  onDismiss?: () => void;
}

const ProcessingBarInner: React.FC<ProcessingBarProps> = ({
  visible,
  tone,
  label,
  percent,
  done,
  total,
  detail,
  meta,
  state = 'running',
  indeterminate = false,
  result,
  onDismiss,
}) => {
  if (!visible) return null;

  const c = TONES[tone];
  const isDone = state === 'done';
  const isPaused = state === 'paused';
  // 完成态一律按 100 填满：结束时的 percent 可能是小数或上一帧的中间值
  const clamped = isDone ? 100 : Math.max(0, Math.min(100, Math.round(percent)));
  const showCount = typeof done === 'number' && typeof total === 'number' && !isDone;
  const summary = result ? formatTaskBarSummary(result) : undefined;
  // 跳过不算失败（动图、处理后反而变大都是设计内行为），只有真失败才转琥珀
  const hasFailure = isDone && (result?.failed ?? 0) > 0;
  // 填充色只算一次：多个 bg-* 同时挂在同一个节点上，谁生效要看样式表顺序，不能赌
  const fillColor = isDone
    ? (hasFailure ? 'bg-amber-400' : 'bg-emerald-500')
    : isPaused ? 'bg-amber-400' : c.bar;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
      {/* 第一行：状态 / 计数 / 进度 / 百分比 / 补充信息 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          {isDone ? (
            hasFailure ? (
              <AlertTriangle size={13} className="text-amber-500" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-500" />
            )
          ) : isPaused ? (
            <Pause size={13} className="text-amber-500" fill="currentColor" />
          ) : (
            <Loader2 size={13} className={`animate-spin ${c.ring}`} />
          )}
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
        </div>

        {showCount && (
          <span className="text-[11px] font-mono tabular-nums text-gray-600 dark:text-gray-300 shrink-0">
            {done} / {total}
          </span>
        )}

        <div className="relative flex-1 min-w-[80px] h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {indeterminate && !isDone ? (
            <div className={`pb-runner ${isPaused ? 'bg-amber-400 [animation-play-state:paused]' : c.bar}`} />
          ) : (
            /*
              宽度可以带过渡了——打包那条已经改成 indeterminate，不会再有
              「数字 100%、条还在半路」的大跳变；处理/导入都是小步推进，300ms 刚好平缓。
              完成态把条纹动画停住：还动着等于告诉用户「还没完」。
            */
            <div
              className={`h-full transition-[width] duration-300 ease-out progress-stripes ${
                isDone ? '[animation-play-state:paused]' : ''
              } ${fillColor}`}
              style={{ width: `${clamped}%` }}
            />
          )}
        </div>

        {!indeterminate && (
          <span className={`text-[11px] font-mono tabular-nums w-9 text-right shrink-0 ${c.text}`}>
            {clamped}%
          </span>
        )}

        {/*
          meta 在运行态是 hidden sm:inline（窄屏可省），完成态它是唯一结论，必须常显。
        */}
        {summary ? (
          <span className="text-[11px] text-gray-600 dark:text-gray-300 shrink-0 tabular-nums">
            {summary}
          </span>
        ) : meta ? (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 tabular-nums hidden sm:inline">
            {meta}
          </span>
        ) : null}

        {isDone && onDismiss && (
          <button
            type="button"
            aria-label="关闭"
            onClick={onDismiss}
            className="shrink-0 -mr-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 第二行：文件名独占一行，避免长短不一挤压进度条。完成态没有"当前文件"可言 */}
      {detail && !isDone && (
        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
};

export const ProcessingBar = React.memo(ProcessingBarInner);

export default ProcessingBar;
