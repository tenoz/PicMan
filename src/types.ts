
import type { RenameRule } from './utils/rename';

export type { RenameRule };

export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';
export type ResizeMode = 'original' | 'fixed_width' | 'fixed_height' | 'scale';

/** 体积膨胀时的处理策略
 * - always: 只要处理结果更大就保留原图（默认，含改格式/改尺寸）
 * - only-when-no-edit: 仅在没有编辑动作时保留原图（旧行为，允许主动转格式）
 */
export type SizeInflationPolicy = 'always' | 'only-when-no-edit';

/** ZIP 打包方式：内置 JSZip（快、纯内存）/ 本机压缩工具（省内存、支持超大包） */
export type ZipEngine = 'builtin' | 'system';
/** ZIP 分组：整包 / 按顶层文件夹分别打包 */
export type ZipLayout = 'single' | 'per-folder';

/** JPEG 编码引擎：浏览器内置 canvas（快）/ 原生 mozjpeg（同画质更小，仅桌面版） */
export type JpegEngine = 'builtin' | 'native';
/** 原生 JPEG 编码档位：fastest 最快 / balanced 默认 / smallest 最小但慢一个量级 */
export type JpegLevel = 'fastest' | 'balanced' | 'smallest';
/**
 * PNG 无损重压档位（走 oxipng，仅桌面版）：
 * - off：默认，不动
 * - fast：oxipng -o0，约 +0.2s/张（6MP），通常再小 15–20%
 * - small：oxipng -o2，约 +3.3s/张（6MP），只比 fast 再多小 4 个百分点
 */
export type PngOptimize = 'off' | 'fast' | 'small';

export interface WatermarkConfig {
  enabled: boolean;
  type: 'text' | 'image';
  text?: string;
  imageSrc?: string; // Data URL
  opacity: number; // 0-1
  rotation: number; // degrees
  scale: number; // 0.1 - 2.0 relative to image size
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';
  color?: string;
  fontSize?: number;
}

export interface ProcessingConfig {
  id: string; // Unique ID for custom configs
  name: string;
  format: OutputFormat;
  quality: number; // 0-1
  resizeMode: ResizeMode;
  resizeValue: number; // Width, Height, or Scale percentage
  maintainAspectRatio: boolean;
  stripExif: boolean; // Note: Canvas API strips EXIF by default usually
  rotate: number; // Allows any degree, UI steps by 45
  flipX: boolean;
  flipY: boolean;
  watermark: WatermarkConfig;
  concurrency: number; // 1 for sequential, >1 for parallel
  filenameSuffix?: string;
  outputBaseDir?: string;
  keepDirectoryStructure?: boolean;
  preventSizeInflation: boolean; // New: If true, keep original if processed size > original size
  sizeInflationPolicy: SizeInflationPolicy; // 严格程度：always = 变大就回退，含改格式
  zipEngine: ZipEngine; // 打包方式：builtin 内置 / system 本机压缩工具
  zipLayout: ZipLayout; // 分组：single 整包 / per-folder 按顶层文件夹分别打包
  /** 导出时忽略原文件夹层级，全部铺平到目标目录；撞名自动加 _1、_2 */
  flattenExport?: boolean;
  importConcurrency: number; // 导入时并发读取文件的数量（默认 6）
  jpegEngine?: JpegEngine; // JPEG 编码：builtin 浏览器内置（快）/ native 原生 mozjpeg（更小）
  jpegLevel?: JpegLevel; // 原生编码档位：fastest / balanced / smallest
  pngOptimize?: PngOptimize; // PNG 无损重压：off 默认 / fast 快速 / small 更小
  autoExportToSource?: boolean; // New: Auto export to source directory after processing
  exportMode?: 'overwrite' | 'rename'; // New: overwrite source or rename
  /** 导出重命名规则（前缀/后缀/替换/序号）。老配置没有此字段时按「原文件名」处理 */
  renameRule?: RenameRule;
}

export interface AppFile {
  id: string;
  file: File;
  previewUrl: string; // Object URL of the ORIGINAL file (used by preview modal & image processing)
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  originalSize: number;
  processedSize?: number;
  processedBlob?: Blob;
  /**
   * 桌面端：产物落盘后的绝对路径。
   *
   * 2026-11-02 起，**落盘成功后这里就没有 Blob 了**——内存占用与批次大小脱钩。
   * 导出、预览、单张下载都改走这个路径；只有浏览器环境和落盘失败时才退回 Blob。
   */
  processedPath?: string;
  processingTime?: number; // ms
  dimensions: { width: number; height: number };
  importedAt: number; // Timestamp for sorting
  // Per-file config override (if null, use global)
  customConfig?: ProcessingConfig | null;
  isSkipped?: boolean; // New: True if original file was kept due to size check
  isAnimated?: boolean; // True if file is GIF/Animated WebP
  /** 因体积膨胀回退时，记录"如果处理会有多大"，用于列表展示差异 */
  inflation?: { attemptedSize: number; deltaPercent: number };
}

export interface ProcessingReport {
  total: number;
  success: number;
  failed: number;
  totalOriginalSize: number;
  totalProcessedSize: number;
  totalTime: number;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  details?: string;
}

export type SortOption = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'size_asc' | 'size_desc' | 'type_asc' | 'type_desc';


// 下载阶段枚举
export type DownloadPhase = 'idle' | 'preparing' | 'downloading' | 'completed' | 'cancelled';

// 下载进度接口
export interface DownloadProgress {
  phase: DownloadPhase; // 当前下载阶段
  current: number; // 当前已下载文件数
  total: number; // 总文件数
  failedFiles: string[]; // 下载失败的文件名列表
}