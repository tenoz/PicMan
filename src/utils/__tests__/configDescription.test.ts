import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../constants';
import { ProcessingConfig } from '../../types';
import { describeProcessingConfig } from '../configDescription';

const cfg = (over: Partial<ProcessingConfig> = {}): ProcessingConfig => ({ ...DEFAULT_CONFIG, ...over });

describe('describeProcessingConfig', () => {
  it('JPEG + 内置编码：写出格式、质量、编码方式', () => {
    const text = describeProcessingConfig(cfg({ format: 'image/jpeg', quality: 0.8, jpegEngine: 'builtin' }));
    expect(text).toContain('输出 JPG 80%');
    expect(text).toContain('编码 内置');
  });

  it('原生编码带上档位', () => {
    const text = describeProcessingConfig(
      cfg({ format: 'image/jpeg', jpegEngine: 'native', jpegLevel: 'smallest' })
    );
    expect(text).toContain('编码 原生(最小)');
  });

  it('PNG 不带质量百分比，改为体现重压档位', () => {
    const text = describeProcessingConfig(cfg({ format: 'image/png', pngOptimize: 'fast' }));
    expect(text).toContain('输出 PNG');
    expect(text).not.toMatch(/输出 PNG \d+%/);
    expect(text).toContain('PNG重压 快速');
  });

  it('尺寸：原尺寸直接标原尺寸，其它模式带数值和单位', () => {
    expect(describeProcessingConfig(cfg({ resizeMode: 'original' }))).toContain('尺寸 原尺寸');
    expect(describeProcessingConfig(cfg({ resizeMode: 'fixed_width', resizeValue: 1600 }))).toContain(
      '尺寸 固定宽度 1600px'
    );
    expect(describeProcessingConfig(cfg({ resizeMode: 'scale', resizeValue: 50 }))).toContain(
      '尺寸 按比例 50%'
    );
  });

  it('几何变换没动就不占字数', () => {
    const text = describeProcessingConfig(cfg({ rotate: 0, flipX: false, flipY: false }));
    expect(text).not.toContain('旋转');
    expect(text).not.toContain('翻转');
  });

  it('几何变换动了就都写出来', () => {
    const text = describeProcessingConfig(cfg({ rotate: 90, flipX: true, flipY: true }));
    expect(text).toContain('旋转90°+水平翻转+垂直翻转');
  });

  it('水印记录类型和文本片段', () => {
    const text = describeProcessingConfig(
      cfg({ watermark: { ...DEFAULT_CONFIG.watermark, enabled: true, text: '内部资料请勿外传' } })
    );
    expect(text).toContain('水印 文字"内部资料请勿外传"');
  });

  it('水印文本过长时截断到 12 字', () => {
    const long = '这是一段特别特别长的水印文字用来测试截断行为';
    const text = describeProcessingConfig(
      cfg({ watermark: { ...DEFAULT_CONFIG.watermark, enabled: true, text: long } })
    );
    expect(text).toContain('水印 文字"这是一段特别特别长的水印"');
    expect(text).not.toContain(long);
  });

  it('水印关闭时不出现在摘要里', () => {
    const text = describeProcessingConfig(
      cfg({ watermark: { ...DEFAULT_CONFIG.watermark, enabled: false, text: 'x' } })
    );
    expect(text).not.toContain('水印');
  });

  it('EXIF、防膨胀、并发都带上', () => {
    const text = describeProcessingConfig(cfg({ stripExif: true, preventSizeInflation: true, concurrency: 4 }));
    expect(text).toContain('EXIF 剥离');
    expect(text).toContain('防膨胀 开');
    expect(text).toContain('并发 4');
  });

  it('缺省的可选字段有兜底，不出现 undefined', () => {
    const text = describeProcessingConfig({
      ...DEFAULT_CONFIG,
      jpegEngine: undefined,
      jpegLevel: undefined,
      pngOptimize: undefined,
    });
    expect(text).not.toContain('undefined');
    expect(text).toContain('编码 内置');
  });
});
