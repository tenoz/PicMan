import { describe, it, expect } from 'vitest';
import { fileKey } from '../fileKey';

const make = (over: { name?: string; size?: number; lastModified?: number; path?: string } = {}): File => {
  const file = new File(['x'], over.name ?? 'a.jpg', {
    type: 'image/jpeg',
    lastModified: over.lastModified ?? 1_700_000_000_000,
  });
  Object.defineProperty(file, 'size', { value: over.size ?? 1234 });
  if (over.path !== undefined) {
    Object.defineProperty(file, 'webkitRelativePath', { value: over.path });
  }
  return file;
};

describe('fileKey', () => {
  it('同一路径 + 名字 + 大小 → 相等', () => {
    expect(fileKey(make())).toBe(fileKey(make()));
  });

  it('**时间戳不同也必须相等** —— Tauri 双路触发时 lastModified 会差几毫秒', () => {
    const a = make({ lastModified: 1_700_000_000_000 });
    const b = make({ lastModified: 1_700_000_000_007 });
    expect(fileKey(a)).toBe(fileKey(b));
  });

  it('不同目录的同名同大小文件不相等', () => {
    expect(fileKey(make({ path: 'dirA/a.jpg' }))).not.toBe(fileKey(make({ path: 'dirB/a.jpg' })));
  });

  it('大小不同不相等', () => {
    expect(fileKey(make({ size: 1 }))).not.toBe(fileKey(make({ size: 2 })));
  });

  it('没有 webkitRelativePath 时用空串占位，不抛错', () => {
    expect(() => fileKey(make())).not.toThrow();
    expect(fileKey(make())).toContain('|a.jpg|1234');
  });
});
