/**
 * mime.ts
 * 产物 MIME 判定。
 *
 * 产物不再常驻内存之后，很多地方只剩磁盘路径——预览、单张下载、导出都靠这个。
 * 原来只在 `useExport` 里有一份，现在三处共用。
 */
import type { AppFile } from '../types';

/** 优先内存里的 Blob（最可信），其次看磁盘路径后缀，都没有按 JPEG 兜底 */
export function mimeOf(file: AppFile): string {
  if (file.processedBlob?.type) return file.processedBlob.type;
  const p = (file.processedPath ?? '').toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}
