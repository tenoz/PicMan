
export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';
export type ResizeMode = 'original' | 'fixed_width' | 'fixed_height' | 'scale';

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
  autoExportToSource?: boolean; // New: Auto export to source directory after processing
  exportMode?: 'overwrite' | 'rename'; // New: overwrite source or rename
}

export interface AppFile {
  id: string;
  file: File;
  previewUrl: string; // Object URL for thumbnail
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  originalSize: number;
  processedSize?: number;
  processedBlob?: Blob;
  processingTime?: number; // ms
  dimensions: { width: number; height: number };
  importedAt: number; // Timestamp for sorting
  // Per-file config override (if null, use global)
  customConfig?: ProcessingConfig | null;
  isSkipped?: boolean; // New: True if original file was kept due to size check
  isAnimated?: boolean; // True if file is GIF/Animated WebP
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

export interface ChangelogItem {
  version: string;
  date: string;
  changes: {
    type: 'feat' | 'fix' | 'opt';
    content: string;
  }[];
}
