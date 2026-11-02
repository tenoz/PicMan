/**
 * ZIP 分组与组内路径计算 —— 纯函数，便于单测。
 *
 * layout:
 *   · single     → 整批一个包（组名留空，由调用方起名）
 *   · per-folder → 按 webkitRelativePath 的**顶层文件夹**分组，每组建一个包，
 *                  包名默认用目录名；没有相对路径的文件归到一个无名组（走默认包名）
 */

import type { AppFile, ZipLayout } from '../types';

export interface ZipGroup {
  /** 分组名（目录名）；整包或根目录文件为 '' */
  name: string;
  files: AppFile[];
}

/** 取顶层文件夹名：'A/B/c.jpg' → 'A'；'c.jpg' → '' */
export const topFolderOf = (file: File): string => {
  const rel = file.webkitRelativePath;
  if (!rel) return '';
  const idx = rel.indexOf('/');
  return idx === -1 ? '' : rel.slice(0, idx);
};

/**
 * 计算文件在**当前组内**的 zip 路径。
 * per-folder 时要剥掉顶层目录名，否则解压出来会多一层同名文件夹。
 */
export const zipPathInGroup = (file: AppFile, layout: ZipLayout, newName: string): string => {
  const rel = file.file.webkitRelativePath;
  if (!rel) return newName;

  const parts = rel.split('/');
  const dirParts = parts.slice(0, -1);
  if (layout === 'per-folder' && dirParts.length > 0) {
    dirParts.shift();
  }
  return dirParts.length > 0 ? `${dirParts.join('/')}/${newName}` : newName;
};

export const groupFilesForZip = (files: AppFile[], layout: ZipLayout): ZipGroup[] => {
  if (files.length === 0) return [];

  if (layout !== 'per-folder') {
    return [{ name: '', files }];
  }

  const byName = new Map<string, AppFile[]>();
  for (const f of files) {
    const name = topFolderOf(f.file);
    const bucket = byName.get(name);
    if (bucket) bucket.push(f);
    else byName.set(name, [f]);
  }

  // 稳定顺序：有名目录按名称排，根目录文件（''）放最后
  return [...byName.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    })
    .map(([name, groupFiles]) => ({ name, files: groupFiles }));
};

/** 包名里不能出现的字符替换掉 */
export const sanitizeZipBaseName = (name: string): string =>
  name.replace(/[/\\:*?"<>|]/g, '_').trim() || '图片处理结果';

/**
 * 扁平化导出的去重：同名的按出现顺序依次加 `_1`、`_2`…
 * `a.jpg, a.jpg, a.jpg` → `a.jpg, a_1.jpg, a_2.jpg`
 *
 * 为什么必须批次内提前算清楚：ZIP 里同名条目会**互相覆盖**（后写的赢），
 * 不是"存两份"。目录导出那边有 `resolveFreePath` 对着磁盘判，ZIP 没有磁盘可查。
 * 大小写按原样区分——macOS 默认不区分，但导出目标可能是任意盘，宁可多改一个名。
 */
export const dedupeNames = (names: string[]): string[] => {
  const used = new Set<string>();
  return names.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }

    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : '';

    for (let n = 1; n <= 9999; n++) {
      const candidate = `${base}_${n}${ext}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    used.add(name);
    return name;
  });
};
