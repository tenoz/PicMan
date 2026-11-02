
import { ProcessingConfig, WatermarkConfig } from './types';
import { DEFAULT_RENAME_RULE } from './utils/rename';

export const APP_INFO = {
  name: '图片侠 PicMan',
  version: 'v1.3.0',
  description: '一款强大的、离线优先的批量图片处理工具，支持在浏览器内进行格式转换、压缩、调整大小和添加水印。',
  features: [
    '批量格式转换 (JPG, PNG, WebP)',
    '智能尺寸调整 (固定宽高/按比例缩放)',
    '自定义水印添加 (支持文字与图片水印)',
    '批量旋转、翻转与EXIF信息管理',
    '多线程并发处理，性能可调',
    '处理过程可暂停/继续',
    '支持多文件夹导入与结构化打包下载'
  ]
};

export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  type: 'text',
  text: '版权所有',
  opacity: 0.5,
  rotation: -45,
  scale: 1,
  position: 'center',
  color: '#ffffff',
  fontSize: 48
};

export const DEFAULT_CONFIG: ProcessingConfig = {
  id: 'default',
  name: '默认配置',
  format: 'image/jpeg',
  quality: 0.8,
  resizeMode: 'original',
  resizeValue: 1920,
  maintainAspectRatio: true,
  stripExif: false, // Default to keeping EXIF (False means do NOT strip)
  rotate: 0,
  flipX: false,
  flipY: false,
  watermark: DEFAULT_WATERMARK,
  concurrency: 2, // Safe default
  filenameSuffix: '',
  outputBaseDir: '',
  keepDirectoryStructure: true,
  preventSizeInflation: true, // Default: True to prevent larger output files
  sizeInflationPolicy: 'always', // Default: 变大就回退，即使改了格式/尺寸
  zipEngine: 'builtin', // Default: 内置打包（快）；超大包可切系统工具省内存
  zipLayout: 'single', // Default: 整包；多文件夹素材可选按文件夹分别打包
  flattenExport: false, // Default: 保留原文件夹层级
  importConcurrency: 6, // Default: 6 路并发读文件；外接 SSD 可调高
  jpegEngine: 'builtin', // Default: 内置编码（快）。原生 mozjpeg 体积小 30-45% 但要慢 10 倍以上
  jpegLevel: 'balanced', // 原生编码档位；只有切到 native 才有意义
  pngOptimize: 'off', // Default: 不做 PNG 重压。fast/small 分别慢 6 倍 / 30 倍，换 20% / 24% 体积
  autoExportToSource: false, // Default: Manual export
  exportMode: 'rename', // Default: Rename instead of overwrite
  renameRule: { ...DEFAULT_RENAME_RULE }, // Default: 原文件名（不改名）
};

export const PRESETS: ProcessingConfig[] = [
  {
    ...DEFAULT_CONFIG,
    id: 'web-optimized',
    name: '网页优化 (WebP+有损)',
    format: 'image/webp',
    quality: 0.75,
    stripExif: true,
    preventSizeInflation: true
  },
  {
    ...DEFAULT_CONFIG,
    id: 'hd-archive',
    name: '高清存档 (PNG+无损)',
    format: 'image/png',
    quality: 1, // Lossless for PNG
    stripExif: false, // Intent (though canvas strips it)
    preventSizeInflation: true
  }
];

export const SUPPORTED_INPUTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
export const MAX_FILE_SIZE_MB = 100;
export const SUGGESTED_BATCH_LIMIT = 200;
