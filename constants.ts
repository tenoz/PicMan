
import { ProcessingConfig, WatermarkConfig, ChangelogItem } from './types';

export const APP_INFO = {
  name: '图片侠 PicMan',
  version: 'v1.2.0',
  description: '一款强大的、离线优先的批量图片处理工具，支持在浏览器内进行格式转换、压缩、调整大小和添加水印。',
  features: [
    '批量格式转换 (JPG, PNG, WebP)',
    '智能尺寸调整 (固定宽高/按比例缩放)',
    '自定义水印添加 (支持文字与图片水印)',
    '批量旋转、翻转与EXIF信息管理',
    '多线程并发处理，性能可调',
    '处理过程可暂停/继续',
    '支持多文件夹导入与结构化打包下载'
  ],
  techStack: [
    'React 19',
    'TypeScript',
    'Tailwind CSS',
    'Canvas API',
    'JSZip',
    'FileSaver',
    'Lucide Icons'
  ]
};

export const CHANGELOG: ChangelogItem[] = [
  {
    version: 'v1.2.0',
    date: '2026-02-25',
    changes: [
      { type: 'feat', content: '增加批量文件导出功能，支持重命名或直接覆盖' },
      { type: 'opt', content: '窗口关闭等行为优化' }
    ]
  },
  {
    version: 'v1.1.0',
    date: '2024-05-23',
    changes: [
      { type: 'feat', content: '新增“智能体积兜底”策略：若处理后体积增大且无编辑，自动保留原图' },
      { type: 'feat', content: '新增文件夹结构化打包下载功能，完美保留原有目录层级' },
      { type: 'feat', content: '运行日志升级：支持一键导出本地文件、单条复制及最新日志置顶' },
      { type: 'feat', content: '新增版本更新记录功能，清晰展示功能迭代与优化' },
      { type: 'opt', content: '优化批量处理性能，增加多线程并发控制调节' },
      { type: 'opt', content: '移除页面最小尺寸限制，优化移动端与小屏体验' },
      { type: 'fix', content: '修复部分 WebP 图片预览加载失败的问题' }
    ]
  },
  {
    version: 'v1.0.0',
    date: '2024-05-20',
    changes: [
      { type: 'feat', content: 'PicMan 图片侠初始版本发布' },
      { type: 'feat', content: '支持 JPG, PNG, WebP, AVIF 等主流格式转换' },
      { type: 'feat', content: '提供智能尺寸调整、旋转翻转及水印添加功能' },
      { type: 'feat', content: '纯前端本地离线处理架构，确保隐私安全' }
    ]
  }
];

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
  autoExportToSource: false, // Default: Manual export
  exportMode: 'rename' // Default: Rename instead of overwrite
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
