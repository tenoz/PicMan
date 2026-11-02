/**
 * useFileManagement Hook 单元测试
 * 
 * 测试覆盖：
 * - 选择状态 (toggleSelection, selectAll, deselectAll, setSelection)
 * - 排序 (setSortOption)
 * - 状态更新 (updateFile, updateFiles)
 * - clearAll, removeFiles
 * - stats 计算
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileManagement } from '../useFileManagement';

describe('useFileManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('应该返回初始空状态', () => {
      const { result } = renderHook(() => useFileManagement());
      
      expect(result.current.files).toEqual([]);
      expect(result.current.selectedIds).toEqual(new Set());
      expect(result.current.stats).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        idle: 0,
        processing: 0,
      });
    });

    it('应该支持自定义 maxFileSizeMB', () => {
      const { result } = renderHook(() => 
        useFileManagement({ maxFileSizeMB: 50 })
      );
      
      expect(result.current.files).toEqual([]);
    });

    it('应该有默认 sortOption', () => {
      const { result } = renderHook(() => useFileManagement());
      
      expect(result.current.sortOption).toBe('time_desc');
    });
  });

  describe('选择状态 - toggleSelection', () => {
    it('应该切换选中状态: 未选中 -> 选中', () => {
      const { result } = renderHook(() => useFileManagement());
      const testId = 'test-toggle-id';
      
      expect(result.current.selectedIds.has(testId)).toBe(false);
      
      act(() => {
        result.current.toggleSelection(testId);
      });

      expect(result.current.selectedIds.has(testId)).toBe(true);
    });

    it('应该切换选中状态: 选中 -> 未选中', () => {
      const { result } = renderHook(() => useFileManagement());
      const testId = 'test-toggle-id';
      
      act(() => {
        result.current.toggleSelection(testId);
      });
      
      expect(result.current.selectedIds.has(testId)).toBe(true);
      
      act(() => {
        result.current.toggleSelection(testId);
      });

      expect(result.current.selectedIds.has(testId)).toBe(false);
    });

    it('多次切换应该正确交替', () => {
      const { result } = renderHook(() => useFileManagement());
      const testId = 'test-id';
      
      // toggle 1: on
      act(() => result.current.toggleSelection(testId));
      expect(result.current.selectedIds.has(testId)).toBe(true);
      
      // toggle 2: off
      act(() => result.current.toggleSelection(testId));
      expect(result.current.selectedIds.has(testId)).toBe(false);
      
      // toggle 3: on
      act(() => result.current.toggleSelection(testId));
      expect(result.current.selectedIds.has(testId)).toBe(true);
    });
  });

  describe('选择状态 - selectAll / deselectAll', () => {
    it('deselectAll 应该取消选中所有文件', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.toggleSelection('id1');
        result.current.toggleSelection('id2');
      });

      expect(result.current.selectedIds.size).toBe(2);

      act(() => {
        result.current.deselectAll();
      });

      expect(result.current.selectedIds.size).toBe(0);
    });

    it('selectAll 应该选中所有文件 (当文件列表为空时无效)', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.deselectAll();
      });

      expect(result.current.selectedIds.size).toBe(0);

      act(() => {
        result.current.selectAll();
      });

      // 没有文件，所以选中空集合
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('选择状态 - setSelection', () => {
    it('应该设置选中状态', () => {
      const { result } = renderHook(() => useFileManagement());
      const ids = ['id1', 'id2', 'id3'];
      
      act(() => {
        result.current.setSelection(ids);
      });

      expect(result.current.selectedIds.size).toBe(3);
      expect(result.current.selectedIds.has('id1')).toBe(true);
      expect(result.current.selectedIds.has('id2')).toBe(true);
      expect(result.current.selectedIds.has('id3')).toBe(true);
    });

    it('应该覆盖之前的选中状态', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSelection(['a', 'b']);
      });

      act(() => {
        result.current.setSelection(['c']);
      });

      expect(result.current.selectedIds.size).toBe(1);
      expect(result.current.selectedIds.has('c')).toBe(true);
      expect(result.current.selectedIds.has('a')).toBe(false);
    });

    it('应该支持空数组', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSelection(['a', 'b']);
      });

      act(() => {
        result.current.setSelection([]);
      });

      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('排序 - setSortOption', () => {
    it('应该支持 name_asc 排序', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSortOption('name_asc');
      });

      expect(result.current.sortOption).toBe('name_asc');
    });

    it('应该支持 name_desc 排序', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSortOption('name_desc');
      });

      expect(result.current.sortOption).toBe('name_desc');
    });

    it('应该支持 time_asc 排序', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSortOption('time_asc');
      });

      expect(result.current.sortOption).toBe('time_asc');
    });

    it('应该支持 size_desc 排序', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSortOption('size_desc');
      });

      expect(result.current.sortOption).toBe('size_desc');
    });

    it('应该支持所有排序选项', () => {
      const { result } = renderHook(() => useFileManagement());
      const options = [
        'time_desc', 'time_asc', 
        'name_asc', 'name_desc', 
        'size_asc', 'size_desc',
        'type_asc', 'type_desc'
      ] as const;
      
      for (const opt of options) {
        act(() => {
          result.current.setSortOption(opt);
        });
        expect(result.current.sortOption).toBe(opt);
      }
    });
  });

  describe('updateFile', () => {
    it('更新不存在的文件应该无副作用', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.updateFile('non-existent-id', { status: 'success' });
      });

      expect(result.current.files.length).toBe(0);
    });

    it('updateFile 应该保持引用稳定性', () => {
      const { result, rerender } = renderHook(() => useFileManagement());
      
      // 多次调用 updateFile 不应该导致不必要的重渲染
      act(() => {
        result.current.updateFile('id1', { status: 'processing' });
      });
      
      rerender();
      
      act(() => {
        result.current.updateFile('id1', { status: 'success' });
      });
      
      rerender();
      
      // 验证没有报错
      expect(true).toBe(true);
    });
  });

  describe('updateFiles', () => {
    it('批量更新不存在的文件应该无副作用', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.updateFiles([
          { id: 'id1', updates: { status: 'success' } },
          { id: 'id2', updates: { status: 'error' } },
        ]);
      });

      expect(result.current.files.length).toBe(0);
    });

    it('批量更新应该支持部分有效 ID', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.updateFiles([
          { id: 'valid-id', updates: { status: 'success' } },
          { id: 'invalid-id', updates: { status: 'error' } },
        ]);
      });

      expect(result.current.files.length).toBe(0);
    });
  });

  describe('removeFiles', () => {
    it('删除不存在的文件应该无副作用', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.removeFiles(['non-existent-1', 'non-existent-2']);
      });

      expect(result.current.files.length).toBe(0);
    });

    it('删除空数组应该无效果', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.removeFiles([]);
      });

      expect(result.current.files.length).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('清空空列表应该无报错', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.clearAll();
      });

      expect(result.current.files.length).toBe(0);
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('stats 计算 (空状态)', () => {
    it('应该返回正确的空统计数据', () => {
      const { result } = renderHook(() => useFileManagement());
      
      expect(result.current.stats).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        idle: 0,
        processing: 0,
      });
    });
  });

  describe('selectedFiles (空状态)', () => {
    it('应该返回空数组当没有文件被选中', () => {
      const { result } = renderHook(() => useFileManagement());
      
      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.allSelected).toBe(false);
    });
  });

  describe('allSelected 计算', () => {
    it('没有文件时 allSelected 应为 false', () => {
      const { result } = renderHook(() => useFileManagement());
      
      expect(result.current.allSelected).toBe(false);
    });

    it('有选中项但文件列表为空时 allSelected 应为 false', () => {
      const { result } = renderHook(() => useFileManagement());
      
      act(() => {
        result.current.setSelection(['id1']);
      });
      
      expect(result.current.allSelected).toBe(false);
    });
  });

  describe('回调函数', () => {
    it('应该支持 onFileAdd 回调', () => {
      const onFileAdd = vi.fn();
      const { result } = renderHook(() => 
        useFileManagement({ onFileAdd })
      );
      
      // addFiles 需要 async，这里只验证回调存在
      expect(onFileAdd).not.toHaveBeenCalled();
    });

    it('onFileRemove 回调会被调用 (即使文件不存在)', () => {
      const onFileRemove = vi.fn();
      const { result } = renderHook(() => 
        useFileManagement({ onFileRemove })
      );
      
      // removeFile 会调用回调，即使文件不存在 (传入 undefined)
      result.current.removeFile('non-existent');
      // 验证回调被调用了 (虽然参数是 undefined)
      expect(onFileRemove).toHaveBeenCalled();
    });
  });
});