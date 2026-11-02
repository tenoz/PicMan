import { describe, it, expect } from 'vitest';
import {
  groupFilesForZip,
  zipPathInGroup,
  topFolderOf,
  sanitizeZipBaseName,
  dedupeNames,
} from '../zipGrouping';
import type { AppFile } from '../../types';

const makeFile = (name: string, relPath = ''): AppFile => {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  if (relPath) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relPath });
  }
  return {
    id: relPath || name,
    file,
    previewUrl: 'blob:mock',
    status: 'success',
    originalSize: 10,
    processedSize: 10,
    processedBlob: new Blob(['x'], { type: 'image/jpeg' }),
    dimensions: { width: 10, height: 10 },
    importedAt: Date.now(),
  };
};

describe('zipGrouping', () => {
  describe('topFolderOf', () => {
    it('取出顶层文件夹名', () => {
      expect(topFolderOf(new File(['x'], 'a.jpg'))).toBe('');
      const nested = new File(['x'], 'a.jpg');
      Object.defineProperty(nested, 'webkitRelativePath', { value: 'S1/sub/a.jpg' });
      expect(topFolderOf(nested)).toBe('S1');
    });
  });

  describe('groupFilesForZip', () => {
    it('single 模式只返回一组，且组名为空', () => {
      const groups = groupFilesForZip([makeFile('a.jpg', 'S1/a.jpg'), makeFile('b.jpg', 'S2/b.jpg')], 'single');
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('');
      expect(groups[0].files).toHaveLength(2);
    });

    it('per-folder 按顶层文件夹分组，根目录文件排最后', () => {
      const groups = groupFilesForZip(
        [
          makeFile('a.jpg', 'S1/a.jpg'),
          makeFile('b.jpg', 'S2/b.jpg'),
          makeFile('c.jpg', 'S1/c.jpg'),
          makeFile('loose.jpg'),
        ],
        'per-folder'
      );

      expect(groups.map(g => g.name)).toEqual(['S1', 'S2', '']);
      expect(groups[0].files.map(f => f.file.name)).toEqual(['a.jpg', 'c.jpg']);
      expect(groups[2].files.map(f => f.file.name)).toEqual(['loose.jpg']);
    });

    it('空列表返回空分组', () => {
      expect(groupFilesForZip([], 'per-folder')).toEqual([]);
    });
  });

  describe('zipPathInGroup', () => {
    it('整包模式保留完整相对路径', () => {
      const f = makeFile('a.jpg', 'S1/sub/a.jpg');
      expect(zipPathInGroup(f, 'single', 'a_processed.jpg')).toBe('S1/sub/a_processed.jpg');
    });

    it('按文件夹打包时剥掉顶层目录', () => {
      const f = makeFile('a.jpg', 'S1/sub/a.jpg');
      expect(zipPathInGroup(f, 'per-folder', 'a_processed.jpg')).toBe('sub/a_processed.jpg');
    });

    it('只有一层目录时直接放根下', () => {
      const f = makeFile('a.jpg', 'S1/a.jpg');
      expect(zipPathInGroup(f, 'per-folder', 'a_processed.jpg')).toBe('a_processed.jpg');
    });

    it('没有相对路径就用文件名', () => {
      expect(zipPathInGroup(makeFile('a.jpg'), 'per-folder', 'a_processed.jpg')).toBe('a_processed.jpg');
    });
  });

  describe('sanitizeZipBaseName', () => {
    it('替换非法字符', () => {
      expect(sanitizeZipBaseName('a/b:c*d')).toBe('a_b_c_d');
    });

    it('空名字给默认值', () => {
      expect(sanitizeZipBaseName('   ')).toBe('图片处理结果');
    });
  });

  describe('dedupeNames（扁平化去重）', () => {
    it('没撞名就原样返回', () => {
      expect(dedupeNames(['a.jpg', 'b.jpg', 'c.png'])).toEqual(['a.jpg', 'b.jpg', 'c.png']);
    });

    it('撞名按出现顺序加 _1、_2，扩展名保留在最后', () => {
      expect(dedupeNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a_1.jpg', 'a_2.jpg']);
    });

    it('文件名本身带下划线也不冲突', () => {
      // a.jpg 与 a_1.jpg 同时存在时，第二个 a.jpg 不能抢走已占用的 a_1
      expect(dedupeNames(['a.jpg', 'a_1.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a_1.jpg', 'a_2.jpg']);
    });

    it('多扩展名只处理最后一段', () => {
      expect(dedupeNames(['x.tar.jpg', 'x.tar.jpg'])).toEqual(['x.tar.jpg', 'x.tar_1.jpg']);
    });

    it('没有扩展名时不凭空加个点', () => {
      expect(dedupeNames(['README', 'README'])).toEqual(['README', 'README_1']);
    });

    it('区分大小写（不同名的互不干扰）', () => {
      expect(dedupeNames(['A.jpg', 'a.jpg'])).toEqual(['A.jpg', 'a.jpg']);
    });

    it('空数组返回空数组', () => {
      expect(dedupeNames([])).toEqual([]);
    });
  });
});
