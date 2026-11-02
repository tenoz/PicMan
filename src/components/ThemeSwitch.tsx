/**
 * ThemeSwitch.tsx
 * 外观三态：跟随系统 / 始终亮色 / 始终暗色。
 *
 * 为什么是三个小按钮而不是一个循环切的大按钮：两态按钮看不出「现在是不是跟着系统」，
 * 用户点了两下还在原地打转。三个并排一眼就知道当前处在哪一档。
 *
 * 位置在顶栏右侧，尺寸跟旁边那排 18px 图标按键对齐（2026-11-02 老大要求：
 * 原先左边面板里那个是重复入口，去掉，只留这一处）。
 */
import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'system', label: '跟随系统', Icon: Monitor },
  { mode: 'light', label: '始终亮色', Icon: Sun },
  { mode: 'dark', label: '始终暗色', Icon: Moon },
];

interface ThemeSwitchProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

export const ThemeSwitch: React.FC<ThemeSwitchProps> = ({ value, onChange }) => (
  <div
    role="group"
    aria-label="外观"
    className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800"
  >
    {OPTIONS.map(({ mode, label, Icon }) => (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        title={label}
        aria-label={label}
        aria-pressed={value === mode}
        className={`p-1.5 rounded-md transition-colors ${
          value === mode
            ? 'bg-white dark:bg-gray-600 text-brand-600 dark:text-brand-300 shadow-sm'
            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
        }`}
      >
        <Icon size={16} />
      </button>
    ))}
  </div>
);

export default ThemeSwitch;
