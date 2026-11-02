/**
 * configPresets.ts
 * 设置预设：内置档位 + 用户自定义预设的存取与套用。
 *
 * 关键约束：预设只覆盖「输出长什么样」的字段，**不动**并发、打包方式、导出路径、
 * 导出模式这些跟机器/场景绑定的配置。切个画质档不应该把别人的 8 路并发改成 2。
 */

import { DEFAULT_CONFIG } from '../constants';
import { ProcessingConfig, WatermarkConfig } from '../types';

export interface ConfigPreset {
  id: string;
  name: string;
  /** 内置预设不可删除、不可覆盖 */
  builtin?: boolean;
  config: ProcessingConfig;
  /** 自定义预设的创建时间 */
  createdAt?: number;
}

export const CUSTOM_PRESETS_KEY = 'customPresets';

/** 套用预设时会覆盖的字段（改这里记得同步 applyPreset） */
export const PRESET_FIELD_KEYS = [
  'format',
  'quality',
  'stripExif',
  'resizeMode',
  'resizeValue',
  'maintainAspectRatio',
  'rotate',
  'flipX',
  'flipY',
  'watermark',
  'preventSizeInflation',
  'sizeInflationPolicy',
  'jpegEngine',
  'jpegLevel',
  'pngOptimize',
  'filenameSuffix',
] as const;

const base = (over: Partial<ProcessingConfig>): ProcessingConfig => ({
  ...DEFAULT_CONFIG,
  ...over,
  watermark: { ...DEFAULT_CONFIG.watermark },
});

/**
 * 内置预设。
 * 前三档对应老大的排序「质量 > 大小 > 耗时」：90 / 82 / 72 三挡 JPEG 质量，
 * 视觉差异与体积差都在可感知范围内，其余参数一律跟随默认。
 */
export const BUILTIN_PRESETS: ConfigPreset[] = [
  {
    id: 'quality-first',
    name: '画质优先',
    builtin: true,
    config: base({ format: 'image/jpeg', quality: 0.9 }),
  },
  {
    id: 'balanced',
    name: '均衡',
    builtin: true,
    config: base({ format: 'image/jpeg', quality: 0.82 }),
  },
  {
    id: 'small-size',
    name: '小体积',
    builtin: true,
    config: base({ format: 'image/jpeg', quality: 0.72 }),
  },
  {
    id: 'web-optimized',
    name: '网页优化',
    builtin: true,
    config: base({
      format: 'image/webp',
      quality: 0.75,
      stripExif: true,
      preventSizeInflation: true,
    }),
  },
  {
    id: 'hd-archive',
    name: '高清存档',
    builtin: true,
    config: base({
      format: 'image/png',
      quality: 1,
      stripExif: false,
      preventSizeInflation: true,
    }),
  },
];

/** 预设对当前配置的可读说明，用在胶囊的 title 上 */
export function describePreset(preset: ConfigPreset): string {
  const { format, quality, resizeMode, resizeValue } = preset.config;
  const fmt = format === 'image/jpeg' ? 'JPG' : format === 'image/png' ? 'PNG' : 'WebP';
  const parts = [fmt, `${Math.round(quality * 100)}%`];
  if (resizeMode === 'scale') parts.push(`缩放 ${resizeValue}%`);
  else if (resizeMode === 'fixed_width') parts.push(`宽 ${resizeValue}px`);
  else if (resizeMode === 'fixed_height') parts.push(`高 ${resizeValue}px`);
  if (preset.config.watermark.enabled) parts.push('含水印');
  return parts.join(' · ');
}

function sameWatermark(a: WatermarkConfig, b: WatermarkConfig): boolean {
  return a.enabled === b.enabled
    && a.type === b.type
    && (a.text ?? '') === (b.text ?? '')
    && (a.imageSrc ?? '') === (b.imageSrc ?? '')
    && a.opacity === b.opacity
    && a.rotation === b.rotation
    && a.scale === b.scale
    && a.position === b.position
    && (a.color ?? '') === (b.color ?? '')
    && (a.fontSize ?? 0) === (b.fontSize ?? 0);
}

/** 只看预设关心的字段：并发/打包/路径不同不算「配置变了」 */
export function isSamePresetConfig(a: ProcessingConfig, b: ProcessingConfig): boolean {
  return a.format === b.format
    && Math.abs(a.quality - b.quality) < 1e-6
    && a.stripExif === b.stripExif
    && (a.preventSizeInflation ?? true) === (b.preventSizeInflation ?? true)
    && (a.sizeInflationPolicy ?? 'always') === (b.sizeInflationPolicy ?? 'always')
    && (a.jpegEngine ?? 'builtin') === (b.jpegEngine ?? 'builtin')
    && (a.pngOptimize ?? 'off') === (b.pngOptimize ?? 'off')
    && (a.filenameSuffix ?? '') === (b.filenameSuffix ?? '')
    && a.resizeMode === b.resizeMode
    && (a.resizeMode === 'original' || (
      a.resizeValue === b.resizeValue
      && a.maintainAspectRatio === b.maintainAspectRatio
      && a.rotate === b.rotate
      && a.flipX === b.flipX
      && a.flipY === b.flipY
    ))
    && sameWatermark(a.watermark, b.watermark);
}

/** 把预设套到当前配置上：只改输出外观，其余保持用户原样 */
export function applyPreset(current: ProcessingConfig, preset: ConfigPreset): ProcessingConfig {
  const p = preset.config;
  return {
    ...current,
    format: p.format,
    quality: p.quality,
    stripExif: p.stripExif,
    resizeMode: p.resizeMode,
    resizeValue: p.resizeValue,
    maintainAspectRatio: p.maintainAspectRatio,
    rotate: p.rotate,
    flipX: p.flipX,
    flipY: p.flipY,
    watermark: { ...p.watermark },
    preventSizeInflation: p.preventSizeInflation,
    sizeInflationPolicy: p.sizeInflationPolicy,
    jpegEngine: p.jpegEngine,
    jpegLevel: p.jpegLevel,
    pngOptimize: p.pngOptimize,
    filenameSuffix: p.filenameSuffix,
  };
}

export function loadCustomPresets(): ConfigPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ConfigPreset => {
      if (!item || typeof item !== 'object') return false;
      const p = item as Partial<ConfigPreset>;
      return typeof p.id === 'string' && typeof p.name === 'string' && !!p.config;
    });
  } catch (err) {
    console.warn('[Presets] 读取自定义预设失败，按空列表处理', err);
    return [];
  }
}

function persist(list: ConfigPreset[]): ConfigPreset[] {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[Presets] 保存自定义预设失败（localStorage 不可写）', err);
  }
  return list;
}

/** 重名自动加序号：均衡 → 均衡 (2) */
export function uniquePresetName(name: string, existing: ConfigPreset[]): string {
  const trimmed = name.trim() || '未命名预设';
  const taken = new Set(existing.map(p => p.name));
  if (!taken.has(trimmed)) return trimmed;
  let i = 2;
  while (taken.has(`${trimmed} (${i})`)) i += 1;
  return `${trimmed} (${i})`;
}

export function saveCustomPreset(
  name: string,
  config: ProcessingConfig,
  existing: ConfigPreset[] = loadCustomPresets(),
): ConfigPreset[] {
  const finalName = uniquePresetName(name, existing);
  const preset: ConfigPreset = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: finalName,
    config: { ...config, watermark: { ...config.watermark } },
    createdAt: Date.now(),
  };
  return persist([...existing, preset]);
}

export function removeCustomPreset(id: string, existing: ConfigPreset[] = loadCustomPresets()): ConfigPreset[] {
  return persist(existing.filter(p => p.id !== id));
}
