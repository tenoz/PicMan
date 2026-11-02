import { describe, it, expect } from 'vitest';
import { attachSrcPath, getSrcPath } from '../fileSrcPath';

describe('fileSrcPath', () => {
  it('挂上的路径能读回来', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    attachSrcPath(file, '/Volumes/SSD/a.jpg');
    expect(getSrcPath(file)).toBe('/Volumes/SSD/a.jpg');
  });

  it('没挂过返回 undefined（浏览器导入的情况）', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(getSrcPath(file)).toBeUndefined();
  });

  it('空串当作没有路径', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    attachSrcPath(file, '');
    expect(getSrcPath(file)).toBeUndefined();
  });

  it('路径属性不可枚举，不会混进 File 的常规读取', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    attachSrcPath(file, '/tmp/a.jpg');
    expect(Object.keys(file)).not.toContain('__picmanSrcPath');
  });

  it('File 不可扩展时不抛错，只是拿不到路径', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    Object.preventExtensions(file);
    expect(() => attachSrcPath(file, '/tmp/a.jpg')).not.toThrow();
    expect(getSrcPath(file)).toBeUndefined();
  });
});
