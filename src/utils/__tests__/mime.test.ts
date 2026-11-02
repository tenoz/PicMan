/**
 * 产物 MIME 判定。
 *
 * 产物不再常驻内存之后，很多地方只剩磁盘路径——预览、单张下载、导出都要靠这个。
 * 规则：内存里的 Blob 最可信，其次看路径后缀，都没有按 JPEG 兜底。
 */
import { describe, it, expect } from 'vitest';
import { mimeOf } from '../mime';
import type { AppFile } from '../../types';

const file = (over: Partial<AppFile>): AppFile =>
  ({ id: '1', file: new File(['x'], 'a.jpg'), status: 'success', originalSize: 1, importedAt: 0, ...over }) as AppFile;

describe('mimeOf', () => {
  it('有 Blob 就用它的 type，最可信', () => {
    expect(mimeOf(file({ processedBlob: new Blob(['x'], { type: 'image/webp' }) }))).toBe('image/webp');
  });

  it('只剩磁盘路径时看后缀', () => {
    expect(mimeOf(file({ processedPath: '/tmp/work-a/0001_x.png' }))).toBe('image/png');
    expect(mimeOf(file({ processedPath: '/tmp/work-a/0001_x.webp' }))).toBe('image/webp');
    expect(mimeOf(file({ processedPath: '/tmp/work-a/0001_x.gif' }))).toBe('image/gif');
    expect(mimeOf(file({ processedPath: '/tmp/work-a/0001_x.bmp' }))).toBe('image/bmp');
  });

  it('后缀看着像大写也一样认', () => {
    expect(mimeOf(file({ processedPath: '/tmp/work-a/0001_X.PNG' }))).toBe('image/png');
  });

  it('都没有就按 JPEG 兜底', () => {
    expect(mimeOf(file({}))).toBe('image/jpeg');
  });
});
