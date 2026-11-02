/**
 * ConfigPanel.tsx
 * 左侧全局设置：顶部预设条 + 四组可折叠面板（输出 / 变换 / 标记 / 性能）。
 *
 * 分组规则见 docs/计划-面板重构与交互修复.md：
 *   · 「输出」常驻展开，不允许收起——它是每次都要动的核心
 *   · 其余三组收起时靠标题右侧的摘要传达当前值，收起不等于隐藏
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings, RotateCcw, Type, Image as ImageIcon, Upload, AlertTriangle,
  ShieldCheck, Archive, FolderTree, ChevronRight, Plus, Copy, X, Lock, Layers,
} from 'lucide-react';
import { ProcessingConfig, ResizeMode } from '../types';
import { DEFAULT_CONFIG } from '../constants';
import { getNativeBridge, isNativeReady } from '../services/nativeBridge';
import {
  BUILTIN_PRESETS, ConfigPreset, applyPreset, describePreset, isSamePresetConfig,
  loadCustomPresets, removeCustomPreset, saveCustomPreset,
} from '../utils/configPresets';
import {
  DEFAULT_RENAME_RULE, RenameRule, buildExportName, describeRenameRule, isRenameRuleActive,
} from '../utils/rename';

interface ConfigPanelProps {
  config: ProcessingConfig;
  setConfig: (c: ProcessingConfig) => void;
  /**
   * 处理进行中（含暂停）时整块面板锁死。
   * 老大 2026-10-31 定的：与其让人改了配置却发现没生效，不如直接不让改。
   */
  locked?: boolean;
}

const SECTIONS_KEY = 'configPanelSections';
type SectionId = 'rename' | 'transform' | 'mark' | 'perf';
type SectionState = Record<SectionId, boolean>;

const COLLAPSED: SectionState = { rename: false, transform: false, mark: false, perf: false };

function loadSections(): SectionState {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return COLLAPSED;
    const parsed = JSON.parse(raw) as Partial<SectionState>;
    return {
      rename: !!parsed.rename,
      transform: !!parsed.transform,
      mark: !!parsed.mark,
      perf: !!parsed.perf,
    };
  } catch (err) {
    console.warn('[ConfigPanel] 读取折叠状态失败，按全部收起处理', err);
    return COLLAPSED;
  }
}

/** 折叠组：标题行整行可点，右侧摘要 + 箭头；locked 时不能收起；每组可单独重置 */
const Section: React.FC<{
  title: string;
  summary: string;
  open: boolean;
  onToggle?: () => void;
  locked?: boolean;
  /** 重置本组默认值；不传就不渲染按钮 */
  onReset?: () => void;
  /** 锁定（任务进行中）时重置按钮也要禁用 */
  resetDisabled?: boolean;
  /** 有内容需要注意时标题上打个点（水印开启） */
  dot?: boolean;
  children: React.ReactNode;
}> = ({ title, summary, open, onToggle, locked = false, onReset, resetDisabled = false, dot = false, children }) => (
  <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        className={`flex-1 min-w-0 flex items-center gap-1.5 py-[3px] text-left ${locked ? 'cursor-default' : 'cursor-pointer'}`}
        aria-expanded={locked ? true : open}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${open ? 'rotate-90' : ''} ${locked ? 'opacity-0' : ''}`}
        />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">{title}</span>
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 truncate">{summary}</span>
      </button>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          title={`重置「${title}」为默认值`}
          className="shrink-0 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
        >
          <RotateCcw size={10} />
        </button>
      )}
    </div>
    {open && <div className="space-y-3 pt-1.5">{children}</div>}
  </div>
);

const ConfigPanelInner: React.FC<ConfigPanelProps> = ({ config, setConfig, locked = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formatSupport, setFormatSupport] = useState<Record<string, boolean>>({
    'image/webp': true
  });

  // 折叠状态持久化：下次打开保持
  const [sections, setSections] = useState<SectionState>(loadSections);
  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
    } catch (err) {
      console.warn('[ConfigPanel] 保存折叠状态失败', err);
    }
  }, [sections]);

  const toggleSection = (id: SectionId) => {
    setSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 水印一开就把「标记」组展开并打点，避免用户找不到
  const prevWatermarkOn = useRef(config.watermark.enabled);
  useEffect(() => {
    if (config.watermark.enabled && !prevWatermarkOn.current) {
      setSections(prev => (prev.mark ? prev : { ...prev, mark: true }));
    }
    prevWatermarkOn.current = config.watermark.enabled;
  }, [config.watermark.enabled]);

  // Check browser support
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const check = (fmt: string) => {
        canvas.toBlob((blob) => {
            // FIX: Strictly check if the returned blob type matches the requested format.
            const isSupported = blob && blob.type === fmt;
            setFormatSupport(prev => ({ ...prev, [fmt]: !!isSupported }));
        }, fmt);
    };
    check('image/webp');
  }, []);

  const handleChange = (key: keyof ProcessingConfig, value: any) => {
    if (locked) return;
    setConfig({ ...config, [key]: value });
  };

  // 老配置里没有这个字段时按 6 兜底；上限与 App.tsx 的 clamp 对齐
  const importConcurrency = Math.max(1, Math.min(16, config.importConcurrency ?? 6));

  // 原生能力（JPEG 编码 / PNG 重压）只在桌面版可用，纯检测无副作用
  const nativeReady = isNativeReady(getNativeBridge());

  // 重命名规则：老配置没有这个字段时退回默认（原文件名）
  const renameRule: RenameRule = config.renameRule ?? DEFAULT_RENAME_RULE;
  const updateRename = (patch: Partial<RenameRule>) => {
    if (locked) return;
    setConfig({ ...config, renameRule: { ...renameRule, ...patch } });
  };

  /** 只重置本组字段，别组的设置原样保留 */
  const resetGroup = (key: 'output' | 'rename' | 'transform' | 'mark' | 'perf') => {
    if (locked) return;
    const d = DEFAULT_CONFIG;
    switch (key) {
      case 'output':
        setConfig({
          ...config,
          format: d.format,
          quality: d.quality,
          filenameSuffix: d.filenameSuffix,
          jpegEngine: d.jpegEngine,
          jpegLevel: d.jpegLevel,
          pngOptimize: d.pngOptimize,
          preventSizeInflation: d.preventSizeInflation,
          sizeInflationPolicy: d.sizeInflationPolicy,
          zipEngine: d.zipEngine,
          zipLayout: d.zipLayout,
          flattenExport: d.flattenExport,
        });
        break;
      case 'rename':
        setConfig({ ...config, renameRule: { ...DEFAULT_RENAME_RULE } });
        break;
      case 'transform':
        setConfig({
          ...config,
          resizeMode: d.resizeMode,
          resizeValue: d.resizeValue,
          maintainAspectRatio: d.maintainAspectRatio,
          rotate: d.rotate,
          flipX: d.flipX,
          flipY: d.flipY,
        });
        break;
      case 'mark':
        setConfig({ ...config, watermark: { ...d.watermark }, stripExif: d.stripExif });
        break;
      case 'perf':
        setConfig({ ...config, concurrency: d.concurrency, importConcurrency: d.importConcurrency });
        break;
    }
  };

  const handleWatermarkChange = (key: keyof ProcessingConfig['watermark'], value: any) => {
    if (locked) return;
    setConfig({
      ...config,
      watermark: { ...config.watermark, [key]: value }
    });
  };

  const handleResizeModeChange = (mode: ResizeMode) => {
    if (locked) return;
    let newValue = config.resizeValue;
    // Auto reset to 100% when switching to Scale if value is likely pixels
    if (mode === 'scale') {
        newValue = 100;
    } else if (config.resizeMode === 'scale') {
        // Reset to default pixel width when switching away from scale
        newValue = 1920; 
    }
    setConfig({ ...config, resizeMode: mode, resizeValue: newValue });
  };

  const handleWatermarkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          handleWatermarkChange('imageSrc', e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- 预设 ---
  const [customPresets, setCustomPresets] = useState<ConfigPreset[]>(loadCustomPresets);
  const [saveDraft, setSaveDraft] = useState<{ name: string; base: ProcessingConfig } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const allPresets = useMemo(() => [...BUILTIN_PRESETS, ...customPresets], [customPresets]);
  const activePresetId = useMemo(
    () => allPresets.find(p => isSamePresetConfig(config, p.config))?.id ?? null,
    [allPresets, config],
  );

  const commitSave = () => {
    if (locked || !saveDraft) return;
    const next = saveCustomPreset(saveDraft.name, saveDraft.base, customPresets);
    setCustomPresets(next);
    setSaveDraft(null);
  };

  const commitDelete = (id: string) => {
    if (locked) return;
    setCustomPresets(removeCustomPreset(id, customPresets));
    setPendingDeleteId(null);
  };

  // --- 标题摘要：收起时也要能一眼看到当前值 ---
  const resizeSummary = (() => {
    switch (config.resizeMode) {
      case 'scale': return `缩放 ${config.resizeValue}%`;
      case 'fixed_width': return `宽 ${config.resizeValue}px`;
      case 'fixed_height': return `高 ${config.resizeValue}px`;
      default: return '原尺寸';
    }
  })();
  const transformSummary = [
    resizeSummary,
    config.flipX ? '水平翻转' : '',
    config.flipY ? '垂直翻转' : '',
    config.rotate ? `旋转 ${config.rotate}°` : '无旋转',
  ].filter(Boolean).join(' · ');

  const markSummary = `${config.watermark.enabled ? '水印开' : '无水印'} · ${config.stripExif ? 'EXIF 剥离' : 'EXIF 保留'}`;
  const perfSummary = `并发 ${config.concurrency} · 导入 ${importConcurrency} 路`;

  const formatLabel = config.format === 'image/jpeg' ? 'JPG' : config.format === 'image/png' ? 'PNG' : 'WebP';
  const outputSummary = `${formatLabel} ${Math.round(config.quality * 100)}%`;

  return (
    <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
      {/*
        这个外层**不能带 padding**：sticky 元素吸附在滚动容器的内边距内边缘，
        容器一旦有 padding-top，条就会离顶栏空出一条缝（靠负 margin 抵不掉，
        那只能骗过初始位置，滚动后照样露出来）。padding 统一给下面的内容层。
      */}
      {locked && (
        <div className="sticky top-0 z-20 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Lock size={11} className="shrink-0" />
          处理进行中，终止后才能修改设置
        </div>
      )}
      {/* inert：连 Tab 键和程序化点击一起挡住，比单靠 pointer-events 更彻底 */}
      <div
        className={`p-2.5 ${locked ? 'pointer-events-none opacity-50 select-none' : ''}`}
        inert={locked}
      >
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold flex items-center gap-1.5 text-gray-800 dark:text-gray-100">
          <Settings size={15} className="text-brand-500" />
          全局设置
        </h3>
      </div>

      {/* 预设条：点一下整套参数跟着变；最后一个按钮把当前设置存成预设 */}
      <div className="mb-2">
        <div className="flex flex-wrap gap-1">
          {allPresets.map((preset) => {
            if (pendingDeleteId === preset.id) {
              return (
                <span
                  key={preset.id}
                  className="flex items-center gap-1 px-1.5 py-[3px] rounded-full border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-[10px]"
                >
                  <button onClick={() => commitDelete(preset.id)} className="font-medium text-red-600 dark:text-red-400">删除</button>
                  <button onClick={() => setPendingDeleteId(null)} className="text-gray-500 dark:text-gray-400">取消</button>
                </span>
              );
            }
            const active = activePresetId === preset.id;
            return (
              <div key={preset.id} className="relative group">
                <button
                  onClick={() => { if (!locked) setConfig(applyPreset(config, preset)); }}
                  title={describePreset(preset)}
                  className={`px-1.5 py-[3px] rounded-full border text-[10px] font-medium transition-all ${
                    active
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400'
                  }`}
                >
                  {preset.name}
                </button>
                <span className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={() => setSaveDraft({ name: `${preset.name} 副本`, base: applyPreset(config, preset) })}
                    title="以此预设为底另存为"
                    className="p-0.5 rounded-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-brand-600 shadow-sm"
                  >
                    <Copy size={9} />
                  </button>
                  {!preset.builtin && (
                    <button
                      onClick={() => setPendingDeleteId(preset.id)}
                      title="删除该预设"
                      className="p-0.5 rounded-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-red-600 shadow-sm"
                    >
                      <X size={9} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <button
            onClick={() => setSaveDraft({ name: '', base: config })}
            className="flex items-center gap-1 px-1.5 py-[3px] rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:border-brand-400 transition-colors"
          >
            <Plus size={10} /> 保存当前设置
          </button>
        </div>

        {saveDraft && (
          <div className="mt-2 flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={saveDraft.name}
              onChange={(e) => setSaveDraft({ ...saveDraft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave();
                if (e.key === 'Escape') setSaveDraft(null);
              }}
              placeholder="给这套预设起个名字"
              className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <button
              onClick={commitSave}
              className="px-2 py-1 text-[10px] font-medium rounded bg-brand-600 text-white hover:bg-brand-700"
            >
              保存
            </button>
            <button
              onClick={() => setSaveDraft(null)}
              className="px-2 py-1 text-[10px] rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              取消
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {/* ============ 输出（常驻展开） ============ */}
        <Section
          title="输出"
          summary={outputSummary}
          open
          locked
          onReset={() => resetGroup('output')}
          resetDisabled={locked}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {(['image/jpeg', 'image/png', 'image/webp'] as const).map((fmt) => {
                 const label = fmt.split('/')[1].toUpperCase();
                 return (
                    <button
                      key={fmt}
                      onClick={() => handleChange('format', fmt)}
                      className={`px-2 py-1 text-xs font-bold rounded border transition-all ${
                        config.format === fmt
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label === 'JPEG' ? 'JPG' : label}
                    </button>
                 );
              })}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">压缩质量</span>
              <span className="text-xs font-mono text-brand-600 dark:text-brand-400">{Math.round(config.quality * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={config.quality}
              onChange={(e) => handleChange('quality', parseFloat(e.target.value))}
              className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>

          {/* JPEG 编码引擎：只影响 JPEG 输出 */}
          {config.format === 'image/jpeg' && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">JPEG 编码</span>
              <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-900 rounded-md">
                <button
                  onClick={() => handleChange('jpegEngine', 'builtin')}
                  title="浏览器内置编码：最快"
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                    (config.jpegEngine ?? 'builtin') === 'builtin'
                      ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  内置 · 快
                </button>
                <button
                  onClick={() => handleChange('jpegEngine', 'native')}
                  disabled={!nativeReady}
                  title={nativeReady ? 'mozjpeg 原生编码：体积小 30–45%，但慢 10 倍以上' : '仅桌面版可用'}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    config.jpegEngine === 'native'
                      ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  原生 · 小
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                {config.jpegEngine === 'native'
                  ? '体积小 30–45%，代价是单张慢 10 倍以上（3000×2000 实测 45ms → 780ms）。只适合张数少、更在意体积时用。'
                  : '浏览器内置编码，速度最快。切「原生」可用 mozjpeg 换更小体积。'}
              </p>
            </div>
          )}

          {/* PNG 无损重压：桌面端 oxipng */}
          {config.format === 'image/png' && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">PNG 重压</span>
              <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-900 rounded-md">
                {([
                  ['off', '不压', '保持 canvas 原产物，最快'],
                  ['fast', '快速', 'oxipng -o0，约 +0.2 秒/张，通常再小 15–20%'],
                  ['small', '更小', 'oxipng -o2，约 +3.3 秒/张，只比快速再多 4 个百分点'],
                ] as const).map(([value, label, tip]) => (
                  <button
                    key={value}
                    onClick={() => handleChange('pngOptimize', value)}
                    disabled={!nativeReady && value !== 'off'}
                    title={nativeReady ? tip : '仅桌面版可用'}
                    className={`px-1 py-1 text-[10px] font-medium rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      (config.pngOptimize ?? 'off') === value
                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                {config.pngOptimize === 'small'
                  ? '无损，但慢得多：3000×2000 单张约 +3.3 秒，上千张会多花一小时。'
                  : config.pngOptimize === 'fast'
                    ? '无损，单张约 +0.2 秒，通常再小 15–20%，性价比最高。'
                    : '无损重压默认关闭。开启后体积更小，但每张要多花 0.2–3 秒。'}
              </p>
            </div>
          )}

          {/* 体积保护：决定"要不要用处理结果替换原图" */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <ShieldCheck size={11} /> 防止体积变大
              </span>
              <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                <input
                  type="checkbox"
                  checked={config.preventSizeInflation !== false}
                  onChange={(e) => handleChange('preventSizeInflation', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            {config.preventSizeInflation !== false && (
              <>
                <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-900 rounded-md">
                  <button
                    onClick={() => handleChange('sizeInflationPolicy', 'always')}
                    className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                      (config.sizeInflationPolicy ?? 'always') === 'always'
                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    title="只要处理结果更大就保留原图，转格式也会被跳过"
                  >
                    严格
                  </button>
                  <button
                    onClick={() => handleChange('sizeInflationPolicy', 'only-when-no-edit')}
                    className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                      config.sizeInflationPolicy === 'only-when-no-edit'
                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    title="仅在没有改格式/尺寸时回退，允许主动转格式"
                  >
                    仅无损编辑时
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  {(config.sizeInflationPolicy ?? 'always') === 'always'
                    ? '处理结果更大即保留原图，改格式/尺寸时同样生效。'
                    : '仅在未改格式与尺寸时回退，转格式照常输出。'}
                </p>
              </>
            )}
          </div>

          {/* 导出结构：保留原目录 vs 全部铺平（ZIP 与目录导出都吃这个开关） */}
          <div className="space-y-1.5">
            <label
              className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer"
              title="忽略原文件夹层级，全部铺到目标目录同一层；同名文件自动加 _1、_2"
            >
              <input
                type="checkbox"
                checked={config.flattenExport ?? false}
                onChange={(e) => handleChange('flattenExport', e.target.checked)}
                className="accent-brand-600"
              />
              <Layers size={11} />
              扁平化目录
            </label>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              {config.flattenExport
                ? '只摊平最外层目录以内的层级：拖进 a 导出还是 a/x.jpg。同名自动加 _1、_2。ZIP 与目录导出都生效。'
                : '保留原文件夹层级（默认）。勾上则摊平子目录，最外层目录仍保留。'}
            </p>
          </div>

          {/* 打包：打什么（分组）+ 谁来打（引擎） */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <FolderTree size={11} /> ZIP 分组
            </span>
            <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-900 rounded-md">
              <button
                onClick={() => handleChange('zipLayout', 'single')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  (config.zipLayout ?? 'single') === 'single'
                    ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="所有文件打成一个包，内部保留目录结构"
              >
                整包
              </button>
              <button
                onClick={() => handleChange('zipLayout', 'per-folder')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  config.zipLayout === 'per-folder'
                    ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="每个顶层文件夹单独成包，包名用目录名"
              >
                按文件夹
              </button>
            </div>

            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1 pt-1">
              <Archive size={11} /> 打包方式
            </span>
            <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-900 rounded-md">
              <button
                onClick={() => handleChange('zipEngine', 'builtin')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  (config.zipEngine ?? 'builtin') === 'builtin'
                    ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="内置 JSZip：速度快，整包在内存里生成"
              >
                内置
              </button>
              <button
                onClick={() => handleChange('zipEngine', 'system')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  config.zipEngine === 'system'
                    ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="交给系统压缩（macOS ditto）：省内存、能打超大包"
              >
                本机压缩
              </button>
            </div>

            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              {config.zipLayout === 'per-folder'
                ? '每个顶层文件夹单独成包，包名用目录名（根目录的文件另打一个包）。'
                : '所有文件打成一个包，内部保留目录结构。'}
              {config.zipEngine === 'system'
                ? ' 本机压缩仅桌面版生效，失败会自动回退内置。'
                : ''}
            </p>
          </div>
        </Section>

        {/* ============ 重命名（只作用于导出产物） ============ */}
        <Section
          title="重命名"
          summary={describeRenameRule(renameRule)}
          open={sections.rename}
          onToggle={() => toggleSection('rename')}
          onReset={() => resetGroup('rename')}
          resetDisabled={locked}
          dot={isRenameRuleActive(renameRule)}
        >
          <>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={renameRule.prefix}
                  onChange={(e) => updateRename({ prefix: e.target.value })}
                  placeholder="前缀"
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                />
                <input
                  type="text"
                  value={renameRule.suffix}
                  onChange={(e) => updateRename({ suffix: e.target.value })}
                  placeholder="后缀"
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={renameRule.find}
                  onChange={(e) => updateRename({ find: e.target.value })}
                  placeholder="查找"
                  disabled={renameRule.sequenceOnly}
                  title={renameRule.sequenceOnly ? '只用序号时原名不参与，查找替换不起作用' : undefined}
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-40"
                />
                <input
                  type="text"
                  value={renameRule.replace}
                  onChange={(e) => updateRename({ replace: e.target.value })}
                  placeholder="替换为"
                  disabled={renameRule.sequenceOnly || !renameRule.find}
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-40"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={renameRule.sequence || renameRule.sequenceOnly}
                    onChange={(e) => updateRename({
                      sequence: e.target.checked,
                      // 没序号就谈不上「纯序号」，一起关掉
                      sequenceOnly: e.target.checked ? renameRule.sequenceOnly : false,
                    })}
                    className="accent-brand-600"
                  />
                  加序号
                </label>
                {(renameRule.sequence || renameRule.sequenceOnly) && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={renameRule.sequenceStart}
                      onChange={(e) => updateRename({ sequenceStart: Math.max(0, parseInt(e.target.value) || 0) })}
                      title="起始序号"
                      className="w-12 px-1 py-0.5 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-[10px] text-gray-400">起</span>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={renameRule.sequenceDigits}
                      onChange={(e) => updateRename({ sequenceDigits: Math.max(0, Math.min(6, parseInt(e.target.value) || 0)) })}
                      title="补零位数，0 = 不补"
                      className="w-10 px-1 py-0.5 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-[10px] text-gray-400">位</span>
                    {!renameRule.sequenceOnly && (
                      <input
                        type="text"
                        value={renameRule.sequenceSeparator}
                        onChange={(e) => updateRename({ sequenceSeparator: e.target.value })}
                        title="序号连接符"
                        className="w-8 px-1 py-0.5 text-[11px] text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                    )}
                  </div>
                )}
              </div>

              <label
                className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer"
                title="名字直接换成 001、002…，原来叫什么不再参与；前缀/后缀仍会生效"
              >
                <input
                  type="checkbox"
                  checked={renameRule.sequenceOnly}
                  onChange={(e) => updateRename({
                    sequenceOnly: e.target.checked,
                    sequence: e.target.checked ? true : renameRule.sequence,
                  })}
                  className="accent-brand-600"
                />
                只用序号（丢掉原名）
              </label>

              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug break-all">
                <div>预览：IMG_001.jpg</div>
                <div className="text-gray-600 dark:text-gray-300">
                  → {buildExportName('IMG_001.jpg', renameRule, 0, 'jpg')}
                </div>
              </div>

              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                {renameRule.sequenceOnly
                  ? '整批按序号重排，原名不再参与；原文件不受影响。'
                  : '留空即不改名，只按输出格式换扩展名；原文件不受影响。'}
              </p>
          </>
        </Section>

        {/* ============ 变换 ============ */}
        <Section
          title="变换"
          summary={transformSummary}
          open={sections.transform}
          onToggle={() => toggleSection('transform')}
          onReset={() => resetGroup('transform')}
          resetDisabled={locked}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {(['original', 'fixed_width', 'fixed_height', 'scale'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleResizeModeChange(mode)}
                  className={`px-2 py-1 text-xs rounded border transition-all ${
                    config.resizeMode === mode
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-transparent border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {{
                    original: '原尺寸',
                    fixed_width: '固定宽度',
                    fixed_height: '固定高度',
                    scale: '缩放比例'
                  }[mode]}
                </button>
              ))}
            </div>

            {config.resizeMode !== 'original' && (
               <div className="mt-2">
                  {config.resizeMode === 'scale' ? (
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-2 rounded border border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">比例</span>
                        <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400">{config.resizeValue}%</span>
                      </div>
                      <input
                          type="range" min="1" max="100" step="1"
                          value={config.resizeValue}
                          onChange={(e) => handleChange('resizeValue', parseInt(e.target.value))}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500 dark:bg-gray-700 mb-2"
                      />
                      <div className="flex gap-1">
                        {[25, 50, 75, 100].map(pct => (
                          <button
                            key={pct}
                            onClick={() => handleChange('resizeValue', pct)}
                            className={`flex-1 py-0.5 text-[10px] border rounded ${
                              config.resizeValue === pct
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="number"
                        value={config.resizeValue}
                        onChange={(e) => handleChange('resizeValue', parseInt(e.target.value))}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-1.5 text-xs focus:border-brand-500 outline-none text-gray-900 dark:text-gray-100"
                      />
                      <span className="absolute right-2 top-1.5 text-xs text-gray-400">px</span>
                    </div>
                  )}
               </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
               <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">旋转</span>
               <span className="text-[10px] font-mono text-gray-400">当前: {config.rotate || 0}°</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[90, 180, 0].map((angle) => (
                  <button
                    key={angle}
                    onClick={() => handleChange('rotate', angle === 0 ? 0 : ((config.rotate || 0) + angle) % 360)}
                    className="px-1 py-1 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    {angle === 0 ? '复位' : `+${angle}°`}
                  </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleChange('flipX', !config.flipX)}
                className={`px-1 py-1 border rounded text-[10px] font-medium transition-all ${
                  config.flipX ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                水平翻转
              </button>
              <button
                onClick={() => handleChange('flipY', !config.flipY)}
                className={`px-1 py-1 border rounded text-[10px] font-medium transition-all ${
                  config.flipY ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                 垂直翻转
              </button>
            </div>
          </div>
        </Section>

        {/* ============ 标记 ============ */}
        <Section
          title="标记"
          summary={markSummary}
          open={sections.mark}
          onToggle={() => toggleSection('mark')}
          onReset={() => resetGroup('mark')}
          resetDisabled={locked}
          dot={config.watermark.enabled}
        >
          {/* 水印 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">水印</span>
              <label className="relative inline-flex items-center cursor-pointer scale-90 origin-right">
                <input
                  type="checkbox"
                  checked={config.watermark.enabled}
                  onChange={(e) => handleWatermarkChange('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            {config.watermark.enabled && (
              <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-700">
                 {/* Content */}
                 <div className="space-y-2">
                    <div className="flex gap-2 mb-1">
                       <button
                          onClick={() => handleWatermarkChange('type', 'text')}
                          className={`flex-1 text-[10px] py-1 flex items-center justify-center gap-1 rounded border ${config.watermark.type === 'text' ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                       >
                         <Type size={12} /> 文字
                       </button>
                       <button
                          onClick={() => handleWatermarkChange('type', 'image')}
                          className={`flex-1 text-[10px] py-1 flex items-center justify-center gap-1 rounded border ${config.watermark.type === 'image' ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                       >
                         <ImageIcon size={12} /> 图片
                       </button>
                    </div>

                    {config.watermark.type === 'text' ? (
                        <input
                          type="text"
                          value={config.watermark.text}
                          onChange={(e) => handleWatermarkChange('text', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded px-2 py-1 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400"
                          placeholder="输入水印内容..."
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                           <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept="image/*"
                              onChange={handleWatermarkImageUpload}
                           />
                           <button
                              onClick={() => fileInputRef.current?.click()}
                              className="flex-1 py-1 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded text-xs text-gray-500 hover:text-brand-600 hover:border-brand-400 transition-colors flex items-center justify-center gap-2"
                           >
                              <Upload size={12} />
                              {config.watermark.imageSrc ? '更换图片' : '上传图片'}
                           </button>
                           {config.watermark.imageSrc && (
                               <div className="w-8 h-8 rounded border border-gray-200 bg-white overflow-hidden shrink-0">
                                  <img src={config.watermark.imageSrc} alt="wm" className="w-full h-full object-contain" />
                               </div>
                           )}
                        </div>
                    )}
                 </div>

                 {/* Size & Opacity Grid */}
                 <div className="grid grid-cols-2 gap-3">
                    <div>
                       <div className="flex justify-between items-center mb-1">
                         <label className="text-[10px] text-gray-500 dark:text-gray-400">{config.watermark.type === 'image' ? '缩放' : '大小'}</label>
                         <span className="text-[10px] font-mono text-gray-400">
                            {config.watermark.type === 'image' ? config.watermark.scale?.toFixed(1) : config.watermark.fontSize}
                         </span>
                       </div>
                       {config.watermark.type === 'image' ? (
                           <input
                              type="range" min="0.1" max="2" step="0.1"
                              value={config.watermark.scale || 1}
                              onChange={(e) => handleWatermarkChange('scale', parseFloat(e.target.value))}
                              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                          />
                       ) : (
                          <input
                              type="range" min="12" max="200" step="2"
                              value={config.watermark.fontSize || 48}
                              onChange={(e) => handleWatermarkChange('fontSize', parseInt(e.target.value))}
                              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                          />
                       )}
                    </div>
                    <div>
                       <div className="flex justify-between items-center mb-1">
                         <label className="text-[10px] text-gray-500 dark:text-gray-400">透明度</label>
                         <span className="text-[10px] font-mono text-gray-400">{Math.round(config.watermark.opacity * 100)}%</span>
                       </div>
                       <input
                          type="range" min="0" max="1" step="0.1"
                          value={config.watermark.opacity}
                          onChange={(e) => handleWatermarkChange('opacity', parseFloat(e.target.value))}
                          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                        />
                    </div>
                 </div>

                 {/* Rotation Preset Buttons */}
                 <div>
                    <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">旋转角度</label>
                    <div className="grid grid-cols-4 gap-1">
                       {[0, 45, 90, 135, 180, -135, -90, -45].map(angle => (
                          <button
                            key={angle}
                            onClick={() => handleWatermarkChange('rotation', angle)}
                            className={`py-1 text-[10px] rounded border ${
                              config.watermark.rotation === angle
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {angle}°
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* Position */}
                 <div>
                    <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">位置</label>
                    <select
                      value={config.watermark.position}
                      onChange={(e) => handleWatermarkChange('position', e.target.value)}
                      className="w-full text-xs p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    >
                      <option value="center">居中</option>
                      <option value="tile">平铺全图</option>
                      <option value="bottom-right">右下角</option>
                      <option value="bottom-left">左下角</option>
                      <option value="top-left">左上角</option>
                      <option value="top-right">右上角</option>
                    </select>
                 </div>
              </div>
            )}
          </div>

          {/* EXIF：只对 JPEG 有意义（PNG/WebP 由 Canvas 直接丢弃） */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              保留 EXIF 信息
              <span className="block text-[9px] text-gray-400 dark:text-gray-500">
                {config.format === 'image/jpeg' ? '仅 JPEG 输出有效' : '当前格式不支持，输出会被丢弃'}
              </span>
            </span>
            <label className={`relative inline-flex items-center cursor-pointer scale-75 origin-right ${config.format === 'image/jpeg' ? '' : 'opacity-40'}`}>
              <input
                type="checkbox"
                checked={!config.stripExif}
                disabled={config.format !== 'image/jpeg'}
                onChange={(e) => handleChange('stripExif', !e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>
        </Section>

        {/* ============ 性能 ============ */}
        <Section
          title="性能"
          summary={perfSummary}
          open={sections.perf}
          onToggle={() => toggleSection('perf')}
          onReset={() => resetGroup('perf')}
          resetDisabled={locked}
        >
          <div className="space-y-2">
              <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">处理并发</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 rounded ${
                      config.concurrency > 1
                      ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30'
                      : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
                  }`}>
                      {config.concurrency === 1 ? '1 (串行)' : `${config.concurrency} (并发)`}
                  </span>
              </div>

              <div className="px-1">
                  <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={config.concurrency}
                      onChange={(e) => handleChange('concurrency', parseInt(e.target.value))}
                      className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>1 (稳定)</span>
                      <span>10 (极速)</span>
                  </div>
              </div>

              {config.concurrency > 4 && (
                  <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>过高的并发数可能导致低配置设备卡顿或浏览器崩溃，建议保持在 4 左右。</span>
                  </div>
              )}
          </div>

          <div className="space-y-2">
              <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">导入并发</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 rounded ${
                      importConcurrency > 6
                      ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30'
                      : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
                  }`}>
                      {importConcurrency} 路
                  </span>
              </div>

              <div className="px-1">
                  <input
                      type="range"
                      min="1"
                      max="16"
                      step="1"
                      value={importConcurrency}
                      onChange={(e) => handleChange('importConcurrency', parseInt(e.target.value))}
                      className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>1 (逐张)</span>
                      <span>16 (固态盘)</span>
                  </div>
              </div>

              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  导入时同时读取的文件数，只影响"读盘"这一步，与处理并发无关。机械硬盘保持 4-6，固态盘可调到 8-16。
              </p>
          </div>
        </Section>

        {/* Reset */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
             <button
                onClick={() => { if (!locked) setConfig(DEFAULT_CONFIG); }}
                className="w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs flex items-center justify-center gap-2 transition-colors"
             >
                <RotateCcw size={12} /> 重置默认配置
             </button>
        </div>

      </div>
      {/* 关闭 locked 包裹层 */}
      </div>
    </div>
  );
};

/**
 * 处理/导入/导出期间 App 每 100ms 左右就会重渲染一次，而面板只跟 config 有关。
 * 不 memo 的话这几百个节点会被反复重绘，是「任务跑起来界面发卡」的一部分。
 */
export const ConfigPanel = React.memo(ConfigPanelInner);

export default ConfigPanel;
