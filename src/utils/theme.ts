/**
 * theme.ts
 * 外观三态：跟随系统 / 始终亮 / 始终暗。
 *
 * 为什么不直接在 App 里写三元：判「现在该不该用暗色」散在三处（挂 class、顶栏图标、
 * 面板选中态）就会各写一份，迟早有一处忘了改。收敛成两个纯函数，单测钉住。
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const VALID_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** 存储里的值可能是老版本写的、也可能是脏数据，统一收敛成合法三态 */
export function normalizeThemeMode(raw: unknown): ThemeMode {
  return VALID_MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system';
}

/**
 * 现在实际该用暗色吗。
 *
 * `mode` 是手动选择时优先——用户选了「始终亮」，系统切深色也不跟，
 * 否则「手动」等于没生效。
 */
export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  if (mode === 'system') return systemPrefersDark;
  return mode === 'dark';
}
