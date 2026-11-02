import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RENAME_RULE,
  RenameRule,
  buildBaseName,
  buildExportName,
  describeRenameRule,
  isRenameRuleActive,
  stripExtension,
} from '../rename';

const rule = (over: Partial<RenameRule> = {}): RenameRule => ({
  ...DEFAULT_RENAME_RULE,
  ...over,
});

describe('stripExtension', () => {
  it('只去掉最后一个扩展名', () => {
    expect(stripExtension('a.b.jpg')).toBe('a.b');
    expect(stripExtension('照片.jpg')).toBe('照片');
  });

  it('没有扩展名时原样返回', () => {
    expect(stripExtension('README')).toBe('README');
  });

  it('以点开头的隐藏文件不当作扩展名', () => {
    expect(stripExtension('.gitignore')).toBe('.gitignore');
  });
});

describe('buildBaseName', () => {
  it('所有字段为空时保持原名主干（没有启用开关，空＝不改名）', () => {
    expect(buildBaseName('IMG_001.jpg', DEFAULT_RENAME_RULE, 0)).toBe('IMG_001');
  });

  it('前缀与后缀', () => {
    const r = rule({ prefix: '旅行-', suffix: '_web' });
    expect(buildBaseName('IMG_001.jpg', r, 0)).toBe('旅行-IMG_001_web');
  });

  it('查找替换全部命中，不做正则解析', () => {
    const r = rule({ find: 'IMG', replace: 'DSC' });
    expect(buildBaseName('IMG_IMG_01.jpg', r, 0)).toBe('DSC_DSC_01');

    // `.` 作为普通字符，而不是正则的任意字符
    const dotRule = rule({ find: '.', replace: '-' });
    expect(buildBaseName('a.b.c.jpg', dotRule, 0)).toBe('a-b-c');
  });

  it('查找为空时跳过替换', () => {
    const r = rule({ find: '', replace: 'X' });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('photo');
  });

  it('序号补零并接在最后', () => {
    const r = rule({ sequence: true, sequenceStart: 1, sequenceDigits: 3, sequenceSeparator: '-' });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('photo-001');
    expect(buildBaseName('photo.jpg', r, 9)).toBe('photo-010');
    expect(buildBaseName('photo.jpg', r, 999)).toBe('photo-1000');
  });

  it('序号起始值可调', () => {
    const r = rule({ sequence: true, sequenceStart: 10, sequenceDigits: 2 });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('photo-10');
    expect(buildBaseName('photo.jpg', r, 5)).toBe('photo-15');
  });

  it('位数 0 表示不补零', () => {
    const r = rule({ sequence: true, sequenceDigits: 0, sequenceSeparator: '_' });
    expect(buildBaseName('photo.jpg', r, 7)).toBe('photo_8');
  });

  it('完整组合：前缀 + 替换 + 后缀 + 序号', () => {
    const r = rule({
      prefix: '旅行-',
      find: 'IMG',
      replace: 'DSC',
      suffix: '_大图',
      sequence: true,
      sequenceDigits: 3,
    });
    expect(buildBaseName('IMG_001.jpg', r, 0)).toBe('旅行-DSC_001_大图-001');
  });

  it('把路径分隔符等非法字符换成下划线', () => {
    const r = rule({ prefix: 'a/b:c*?' });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('a_b_c__photo');
  });

  it('规则把名字清空时退回原名', () => {
    const r = rule({ find: 'photo', replace: '' });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('photo');
  });

  it('中文与空格正常处理', () => {
    const r = rule({ prefix: '封面 ' });
    expect(buildBaseName('产品 图.jpg', r, 0)).toBe('封面 产品 图');
  });
});

describe('只用序号重排（sequenceOnly）', () => {
  it('名字主体换成序号，原名不参与', () => {
    const r = rule({ sequenceOnly: true, sequenceDigits: 3 });
    expect(buildBaseName('IMG_001.jpg', r, 0)).toBe('001');
    expect(buildBaseName('DSC_9999.jpg', r, 1)).toBe('002');
    expect(buildBaseName('随便叫什么都行.png', r, 41)).toBe('042');
  });

  it('前缀与后缀仍然生效，夹在序号两侧', () => {
    const r = rule({ sequenceOnly: true, prefix: '旅行-', suffix: '_web', sequenceDigits: 3 });
    expect(buildBaseName('IMG_001.jpg', r, 0)).toBe('旅行-001_web');
  });

  it('查找替换被忽略', () => {
    const r = rule({ sequenceOnly: true, find: 'IMG', replace: 'DSC' });
    expect(buildBaseName('IMG_001.jpg', r, 0)).toBe('001');
  });

  it('不额外追加连接符（序号本身就是主体）', () => {
    const r = rule({ sequenceOnly: true, sequenceSeparator: '_', sequenceDigits: 2 });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('01');
  });

  it('起始值与补零位数照旧生效', () => {
    const r = rule({ sequenceOnly: true, sequenceStart: 10, sequenceDigits: 0 });
    expect(buildBaseName('photo.jpg', r, 0)).toBe('10');
    expect(buildBaseName('photo.jpg', r, 5)).toBe('15');
  });

  it('整批输出连续编号，且保留各自扩展名', () => {
    const r = rule({ sequenceOnly: true, sequenceDigits: 3 });
    const names = ['a.jpg', 'b.png', 'c.jpg'];
    expect(names.map((n, i) => buildExportName(n, r, i, 'jpg')))
      .toEqual(['001.jpg', '002.jpg', '003.jpg']);
  });

  it('无需另外勾 sequence，单靠 sequenceOnly 就生效', () => {
    const r = rule({ sequenceOnly: true });
    expect(r.sequence).toBe(false);
    expect(buildBaseName('x.jpg', r, 0)).toBe('001');
  });

  it('算作已启用，摘要单独成一句', () => {
    expect(isRenameRuleActive(rule({ sequenceOnly: true }))).toBe(true);
    expect(describeRenameRule(rule({ sequenceOnly: true }))).toBe('序号重排');
    expect(describeRenameRule(rule({ sequenceOnly: true, prefix: 'p', suffix: 's' })))
      .toBe('序号重排 · 前缀+后缀');
  });
});

describe('buildExportName', () => {
  it('扩展名由调用方给，规则不参与', () => {
    expect(buildExportName('a.png', rule({ prefix: 'x-' }), 0, 'jpg')).toBe('x-a.jpg');
  });
});

describe('规则状态描述', () => {
  it('全空时摘要为「原文件名」', () => {
    expect(isRenameRuleActive(DEFAULT_RENAME_RULE)).toBe(false);
    expect(describeRenameRule(DEFAULT_RENAME_RULE)).toBe('原文件名');
  });

  it('空规则不算「改过」，只填序号也算', () => {
    expect(isRenameRuleActive(rule())).toBe(false);
    expect(isRenameRuleActive(rule({ sequence: true }))).toBe(true);
    expect(isRenameRuleActive(rule({ prefix: 'x' }))).toBe(true);
  });

  it('列出所有生效的规则项', () => {
    const r = rule({ prefix: 'p', suffix: 's', find: 'a', sequence: true });
    expect(isRenameRuleActive(r)).toBe(true);
    expect(describeRenameRule(r)).toBe('已改 · 前缀+后缀+替换+序号');
  });
});
