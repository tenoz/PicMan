import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../../constants';
import { ProcessingConfig } from '../../types';
import {
  BUILTIN_PRESETS,
  CUSTOM_PRESETS_KEY,
  PRESET_FIELD_KEYS,
  applyPreset,
  isSamePresetConfig,
  loadCustomPresets,
  removeCustomPreset,
  saveCustomPreset,
  uniquePresetName,
} from '../configPresets';

const clone = (c: ProcessingConfig): ProcessingConfig => ({
  ...c,
  watermark: { ...c.watermark },
});

describe('内置预设', () => {
  it('包含三档 JPEG 画质 + 网页优化 + 高清存档', () => {
    expect(BUILTIN_PRESETS.map(p => p.name)).toEqual([
      '画质优先', '均衡', '小体积', '网页优化', '高清存档',
    ]);
  });

  it('三档 JPEG 质量对应 90 / 82 / 72，且都是 JPG', () => {
    const [q, b, s] = BUILTIN_PRESETS;
    expect(q.config.format).toBe('image/jpeg');
    expect(q.config.quality).toBeCloseTo(0.9);
    expect(b.config.quality).toBeCloseTo(0.82);
    expect(s.config.quality).toBeCloseTo(0.72);
  });

  it('内置预设都标记为 builtin，不允许被删除', () => {
    expect(BUILTIN_PRESETS.every(p => p.builtin)).toBe(true);
  });
});

describe('applyPreset', () => {
  // 这些字段跟「画质方案」无关，切预设时必须原样保留
  const untouched: (keyof ProcessingConfig)[] = [
    'concurrency', 'importConcurrency', 'zipEngine', 'zipLayout',
    'outputBaseDir', 'exportMode', 'autoExportToSource', 'keepDirectoryStructure',
  ];

  it('只覆盖输出外观，不动并发/打包/路径', () => {
    const current: ProcessingConfig = {
      ...clone(DEFAULT_CONFIG),
      concurrency: 8,
      importConcurrency: 12,
      zipEngine: 'system',
      zipLayout: 'per-folder',
      outputBaseDir: '/Users/pxdog/Downloads/out',
      exportMode: 'overwrite',
    };

    for (const preset of BUILTIN_PRESETS) {
      const next = applyPreset(current, preset);
      for (const key of untouched) {
        expect(next[key]).toEqual(current[key]);
      }
    }
  });

  it('应用后格式与质量跟随预设', () => {
    const next = applyPreset(clone(DEFAULT_CONFIG), BUILTIN_PRESETS[2]);
    expect(next.format).toBe('image/jpeg');
    expect(next.quality).toBeCloseTo(0.72);
  });

  it('水印是副本，改新配置不会污染预设本身', () => {
    const preset = BUILTIN_PRESETS[0];
    const next = applyPreset(clone(DEFAULT_CONFIG), preset);
    next.watermark.text = '改过的水印';
    expect(preset.config.watermark.text).not.toBe('改过的水印');
  });

  it('确保 PRESET_FIELD_KEYS 与实现一致（新增字段别忘了加）', () => {
    const withEdits: ProcessingConfig = {
      ...clone(DEFAULT_CONFIG),
      format: 'image/png',
      quality: 0.5,
      stripExif: true,
      resizeMode: 'scale',
      resizeValue: 33,
      maintainAspectRatio: false,
      rotate: 90,
      flipX: true,
      flipY: true,
      preventSizeInflation: false,
      sizeInflationPolicy: 'only-when-no-edit',
      jpegEngine: 'native',
      jpegLevel: 'smallest',
      pngOptimize: 'fast',
      filenameSuffix: '_x',
      watermark: { ...DEFAULT_CONFIG.watermark, enabled: true, text: '预设水印' },
    };
    const next = applyPreset(clone(DEFAULT_CONFIG), { id: 't', name: 't', config: withEdits });
    for (const key of PRESET_FIELD_KEYS) {
      expect(next[key]).toEqual(withEdits[key]);
    }
  });
});

describe('isSamePresetConfig', () => {
  it('同一份预设套用后判定为一致', () => {
    const preset = BUILTIN_PRESETS[1];
    const next = applyPreset(clone(DEFAULT_CONFIG), preset);
    expect(isSamePresetConfig(next, preset.config)).toBe(true);
  });

  it('并发不同不算配置变化', () => {
    const a = clone(DEFAULT_CONFIG);
    const b = { ...clone(DEFAULT_CONFIG), concurrency: 9 };
    expect(isSamePresetConfig(a, b)).toBe(true);
  });

  it('质量不同即视为不一致', () => {
    const a = clone(DEFAULT_CONFIG);
    const b = { ...clone(DEFAULT_CONFIG), quality: 0.5 };
    expect(isSamePresetConfig(a, b)).toBe(false);
  });

  it('水印开关不同即视为不一致', () => {
    const a = clone(DEFAULT_CONFIG);
    const b = { ...clone(DEFAULT_CONFIG), watermark: { ...DEFAULT_CONFIG.watermark, enabled: true } };
    expect(isSamePresetConfig(a, b)).toBe(false);
  });
});

describe('自定义预设存储', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存后能读回，字段完整', () => {
    const saved = saveCustomPreset('我的方案', { ...clone(DEFAULT_CONFIG), quality: 0.66 }, []);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('我的方案');
    expect(saved[0].config.quality).toBeCloseTo(0.66);
    expect(saved[0].builtin).toBeUndefined();

    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(saved[0].id);
  });

  it('重名自动加序号', () => {
    const existing = saveCustomPreset('均衡', clone(DEFAULT_CONFIG), []);
    expect(existing[0].name).toBe('均衡');
    expect(uniquePresetName('均衡', existing)).toBe('均衡 (2)');
    const more = saveCustomPreset('均衡', clone(DEFAULT_CONFIG), existing);
    expect(more.map(p => p.name)).toEqual(['均衡', '均衡 (2)']);
  });

  it('删除只移除指定 id', () => {
    const list = saveCustomPreset('A', clone(DEFAULT_CONFIG), []);
    const list2 = saveCustomPreset('B', clone(DEFAULT_CONFIG), list);
    const after = removeCustomPreset(list[0].id, list2);
    expect(after.map(p => p.name)).toEqual(['B']);
    expect(loadCustomPresets().map(p => p.name)).toEqual(['B']);
  });

  it('localStorage 里是坏数据时按空列表处理，不抛异常', () => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, '{"not":"an array"}');
    expect(loadCustomPresets()).toEqual([]);
    localStorage.setItem(CUSTOM_PRESETS_KEY, '坏掉的 JSON');
    expect(loadCustomPresets()).toEqual([]);
  });
});
