/**
 * NotificationStack.tsx
 * 信息提示条。
 *
 * **位置**（2026-11-02 老大最终定的）：浮在顶栏上，水平居中、垂直居中于 64px 的顶栏内。
 * 之前试过顶栏下方（`top-20`），空出一条谁也不想要的缝。现在背景半透明 80% 加轻微毛玻璃，
 * 透出底下的顶栏，视觉上是「嵌在顶栏里」，但不占它的布局空间。
 *
 * **消失规则**：
 *   · 成功 / 提示：5s 自动消失，**鼠标悬停时暂停计时**（正在看就别抢走）
 *   · 警告 / 错误：常驻，必须人手动关——这类信息不该自己溜走
 *   · 最多同时 3 条，多出来折成「还有 N 条」，取消翻页
 *   · 出入都有淡入淡出
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export interface AppNotification {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'warn' | 'info';
  timestamp: number;
  task?: string;
}

/** 成功 / 提示到点就走（原来 3.5s，老大说稍微长一点） */
const AUTO_DISMISS_MS = 5000;
/** 淡出的时长；到点先播完它再真正移除 */
const EXIT_MS = 200;
/** 警告 / 错误必须手动关 */
const STICKY_TYPES = new Set<AppNotification['type']>(['warn', 'error']);
const MAX_VISIBLE = 3;

/**
 * 背景色必须是**完整类名**。写成 `bg-emerald-600` 再拼 `/80` 的话，
 * Tailwind 静态扫描时看不到那个 `/80`，透明度和底色会一起丢。
 */
const STYLES: Record<AppNotification['type'], { bg: string; Icon: typeof CheckCircle2 }> = {
  success: { bg: 'bg-emerald-600/80', Icon: CheckCircle2 },
  info: { bg: 'bg-blue-600/80', Icon: Info },
  warn: { bg: 'bg-amber-500/80', Icon: AlertTriangle },
  error: { bg: 'bg-red-600/80', Icon: XCircle },
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * 单条提示。
 *
 * 三个状态值得说明：
 *   · `hovered` 暂停计时——鼠标放上去就是在读，这时候关掉最招人烦
 *   · `leaving` 先淡出再用 `onDismiss` 真正移除。直接调 `onDismiss` 的话组件当场卸载，
 *     出场动画根本没机会播
 *   · 定时器放卡片里，卸载时 effect cleanup 一并清掉，不会「已经关了还在后台数秒」
 */
const NotificationCard: React.FC<{
  item: AppNotification;
  onDismiss: (id: number) => void;
}> = ({ item, onDismiss }) => {
  const { bg, Icon } = STYLES[item.type];
  const [hovered, setHovered] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (STICKY_TYPES.has(item.type) || hovered || leaving) return;
    const timer = window.setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, item.type, hovered, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onDismiss(item.id), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, item.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full pointer-events-auto rounded-lg shadow-lg flex items-start gap-2 pl-3 pr-1 py-2
        text-white text-xs backdrop-blur-sm transition-opacity duration-200 animate-fade-in
        ${bg} ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <Icon size={13} className="shrink-0 mt-[1px]" />
      <div className="flex-1 min-w-0">
        <div className="leading-snug break-words">{item.msg}</div>
        <div className="mt-0.5 text-[10px] text-white/70 tabular-nums">
          {formatTime(item.timestamp)}
          {item.task && <span className="ml-1">· {item.task}</span>}
        </div>
      </div>
      <button
        type="button"
        aria-label="关闭这条"
        onClick={() => setLeaving(true)}
        className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
};

interface NotificationStackProps {
  items: AppNotification[];
  onDismiss: (id: number) => void;
  onDismissAll: () => void;
}

const NotificationStackInner: React.FC<NotificationStackProps> = ({
  items,
  onDismiss,
  onDismissAll,
}) => {
  /**
   * 挑出要显示的至多 3 条：**常驻类先占位**，剩下的名额给最新的临时类。
   * 否则一条警告会被后面涌进来的一串「导出完成」挤到折叠里，等用户发现时早没了。
   */
  const { shown, hiddenCount } = useMemo(() => {
    const sticky = items.filter(i => STICKY_TYPES.has(i.type));
    const transient = items.filter(i => !STICKY_TYPES.has(i.type));

    const shownSticky = sticky.slice(-MAX_VISIBLE);
    const room = MAX_VISIBLE - shownSticky.length;
    const shownTransient = room > 0 ? transient.slice(-room) : [];

    const list = [...shownSticky, ...shownTransient].sort((a, b) => a.id - b.id);
    return { shown: list, hiddenCount: items.length - list.length };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      // h-16 = 顶栏高度，单条提示正好落在它中间；多条时不裁切，自然往下延伸
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] h-16 w-[min(560px,calc(100vw-2rem))]
        pt-3 flex flex-col items-center gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {shown.map(item => (
        <NotificationCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}

      {hiddenCount > 0 && (
        <div className="pointer-events-auto px-2 py-0.5 rounded-full bg-gray-800/85 text-white text-[10px] tabular-nums">
          还有 {hiddenCount} 条
        </div>
      )}

      {items.length > 1 && (
        <button
          type="button"
          aria-label="关闭全部"
          onClick={onDismissAll}
          className="pointer-events-auto px-2 py-0.5 rounded-full bg-gray-800/85 text-white text-[10px] hover:bg-gray-700/85 transition-colors"
        >
          全部关闭
        </button>
      )}
    </div>
  );
};

/**
 * 处理/导入期间 App 每 100ms 左右重渲染一次，通知条跟它无关。
 * 不 memo 的话这堆节点会被反复重绘；items 引用没变就跳过。
 */
export const NotificationStack = React.memo(NotificationStackInner);

export default NotificationStack;
