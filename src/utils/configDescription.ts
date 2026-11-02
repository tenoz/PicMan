/**
 * 把一次处理的配置压成一行中文摘要，写进日志。
 *
 * 目的：出问题时能对着日志复现当时到底用了什么设置——之前日志只记了「成功 607 · -66%」，
 * 但"为什么这批体积比上批大 20%"这种问题，没配置根本判断不了。
 */
import { ProcessingConfig } from '../types';

const RESIZE_LABEL: Record<string, string> = {
  original: '原尺寸',
  fixed_width: '固定宽度',
  fixed_height: '固定高度',
  scale: '按比例',
};

const ENCODING_LABEL: Record<string, string> = {
  builtin: '内置',
  native: '原生',
};

const JPEG_LEVEL_LABEL: Record<string, string> = {
  fastest: '最快',
  balanced: '均衡',
  smallest: '最小',
};

/**
 * 生成一行配置摘要。只写「会影响输出结果或速度」的项，
 * 文件名后缀、ZIP 分组之类不影响画质的不进日志，免得噪音太大。
 */
export function describeProcessingConfig(config: ProcessingConfig): string {
  const parts: string[] = [];

  const formatLabel = config.format === 'image/jpeg' ? 'JPG' : config.format === 'image/png' ? 'PNG' : 'WEBP';
  const qualityLabel = config.format === 'image/png' ? '' : ` ${Math.round(config.quality * 100)}%`;
  parts.push(`输出 ${formatLabel}${qualityLabel}`);

  const engine = config.jpegEngine ?? 'builtin';
  const engineLabel = ENCODING_LABEL[engine] ?? engine;
  if (config.format === 'image/jpeg' && engine === 'native') {
    parts.push(`编码 原生(${JPEG_LEVEL_LABEL[config.jpegLevel ?? 'balanced'] ?? config.jpegLevel})`);
  } else if (config.format === 'image/jpeg') {
    parts.push(`编码 ${engineLabel}`);
  }

  if (config.format === 'image/png') {
    const png = config.pngOptimize ?? 'off';
    parts.push(`PNG重压 ${png === 'off' ? '关' : png === 'fast' ? '快速' : '更小'}`);
  }

  // 尺寸
  if (config.resizeMode === 'original') {
    parts.push('尺寸 原尺寸');
  } else {
    const unit = config.resizeMode === 'scale' ? '%' : 'px';
    parts.push(`尺寸 ${RESIZE_LABEL[config.resizeMode] ?? config.resizeMode} ${config.resizeValue}${unit}`);
  }

  // 几何变换：没动就不占字数
  const geometry: string[] = [];
  if (config.rotate) geometry.push(`旋转${config.rotate}°`);
  if (config.flipX) geometry.push('水平翻转');
  if (config.flipY) geometry.push('垂直翻转');
  if (geometry.length > 0) parts.push(geometry.join('+'));

  // 水印
  if (config.watermark?.enabled) {
    const kind = config.watermark.text ? `文字"${config.watermark.text.slice(0, 12)}"` : '图片';
    parts.push(`水印 ${kind}`);
  }

  parts.push(`EXIF ${config.stripExif ? '剥离' : '保留'}`);
  parts.push(`防膨胀 ${config.preventSizeInflation ? '开' : '关'}`);
  parts.push(`并发 ${config.concurrency}`);

  return parts.join(' · ');
}
