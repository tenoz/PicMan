import { useState, useCallback, useMemo } from 'react';
import { AppFile } from '../types';
import { generateId } from '../utils';

export type SortOption = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'size_asc' | 'size_desc' | 'type_asc' | 'type_desc';

interface UseFileManagementOptions {
  maxFileSizeMB?: number;
  onFileAdd?: (files: AppFile[]) => void;
  onFileRemove?: (file: AppFile) => void;
}

interface UseFileManagementReturn {
  // State
  files: AppFile[];
  selectedIds: Set<string>;
  sortOption: SortOption;
  
  // Computed
  selectedFiles: AppFile[];
  allSelected: boolean;
  stats: {
    total: number;
    success: number;
    failed: number;
    idle: number;
    processing: number;
  };
  
  // Actions
  addFiles: (newFiles: File[]) => Promise<{ added: number; skipped: { name: string; reason: string }[] }>;
  removeFile: (id: string) => void;
  removeFiles: (ids: string[]) => void;
  clearAll: () => void;
  toggleSelection: (id: string) => void;
  setSelection: (ids: string[]) => void;
  selectAll: () => void;
  deselectAll: () => void;
  setSortOption: (option: SortOption) => void;
  updateFile: (id: string, updates: Partial<AppFile>) => void;
  updateFiles: (updates: { id: string; updates: Partial<AppFile> }[]) => void;
}

const MAX_FILE_SIZE_MB = 100;
const SUPPORTED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

export function useFileManagement(options: UseFileManagementOptions = {}): UseFileManagementReturn {
  const { maxFileSizeMB = MAX_FILE_SIZE_MB, onFileAdd, onFileRemove } = options;
  
  const [files, setFiles] = useState<AppFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('time_desc');

  // Computed: selected files
  const selectedFiles = useMemo(() => {
    return files.filter(f => selectedIds.has(f.id));
  }, [files, selectedIds]);

  // Computed: all selected check
  const allSelected = useMemo(() => {
    return files.length > 0 && selectedIds.size === files.length;
  }, [files, selectedIds]);

  // Computed: stats
  const stats = useMemo(() => {
    return {
      total: files.length,
      success: files.filter(f => f.status === 'success').length,
      failed: files.filter(f => f.status === 'error').length,
      idle: files.filter(f => f.status === 'idle').length,
      processing: files.filter(f => f.status === 'processing').length,
    };
  }, [files]);

  // Helper: sort files
  const sortFileList = useCallback((list: AppFile[], method: SortOption): AppFile[] => {
    const sorted = [...list];
    switch (method) {
      case 'time_desc':
        return sorted.sort((a, b) => b.importedAt - a.importedAt);
      case 'time_asc':
        return sorted.sort((a, b) => a.importedAt - b.importedAt);
      case 'name_asc':
        return sorted.sort((a, b) => a.file.name.localeCompare(b.file.name));
      case 'name_desc':
        return sorted.sort((a, b) => b.file.name.localeCompare(a.file.name));
      case 'size_asc':
        return sorted.sort((a, b) => a.originalSize - b.originalSize);
      case 'size_desc':
        return sorted.sort((a, b) => b.originalSize - a.originalSize);
      case 'type_asc':
        return sorted.sort((a, b) => {
          const extA = a.file.name.split('.').pop()?.toLowerCase() || '';
          const extB = b.file.name.split('.').pop()?.toLowerCase() || '';
          return extA.localeCompare(extB);
        });
      case 'type_desc':
        return sorted.sort((a, b) => {
          const extA = a.file.name.split('.').pop()?.toLowerCase() || '';
          const extB = b.file.name.split('.').pop()?.toLowerCase() || '';
          return extB.localeCompare(extA);
        });
      default:
        return sorted;
    }
  }, []);

  // Helper: check if file is animated
  const checkIsAnimated = async (file: File): Promise<boolean> => {
    // Simplified check - would need to be passed in or imported
    return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.webp');
  };

  // Action: add files
  const addFiles = useCallback(async (newFiles: File[]) => {
    const processedFiles: AppFile[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const timestamp = Date.now();
    const totalCount = newFiles.length;

    for (const [index, f] of newFiles.entries()) {
      // 1. Silent ignore system files
      if (f.name === '.DS_Store' || f.name === 'Thumbs.db') {
        continue;
      }

      // 2. Dedupe check
      const isDuplicate = files.some(existing => 
        existing.file.name === f.name && 
        existing.file.size === f.size &&
        existing.file.lastModified === f.lastModified
      );
      if (isDuplicate) {
        skipped.push({ name: f.name, reason: '文件已存在' });
        continue;
      }

      // 3. Size check
      if (f.size > maxFileSizeMB * 1024 * 1024) {
        skipped.push({ name: f.name, reason: '超过大小限制' });
        continue;
      }

      // 4. Create preview
      let previewUrl = '';
      try {
        const isAnimated = await checkIsAnimated(f);
        
        if (isAnimated) {
          // For animated, we'd need createStaticThumbnail - simplified for now
          previewUrl = URL.createObjectURL(f);
        } else {
          previewUrl = URL.createObjectURL(f);
        }

        // Get dimensions
        const img = new Image();
        img.src = previewUrl;
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
        });

        processedFiles.push({
          id: generateId(),
          file: f,
          previewUrl,
          status: 'idle',
          originalSize: f.size,
          dimensions: { width: img.naturalWidth, height: img.naturalHeight },
          importedAt: timestamp + index,
          isAnimated,
        });
      } catch (e) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        skipped.push({ name: f.name, reason: '文件损坏或无法读取' });
      }
    }

    if (processedFiles.length > 0) {
      setFiles(prev => {
        const updated = [...processedFiles, ...prev];
        return sortFileList(updated, sortOption);
      });
      
      // Auto-select new files
      setSelectedIds(prev => {
        const next = new Set(prev);
        processedFiles.forEach(f => next.add(f.id));
        return next;
      });

      onFileAdd?.(processedFiles);
    }

    return { added: processedFiles.length, skipped };
  }, [files, maxFileSizeMB, sortOption, sortFileList, onFileAdd]);

  // Action: remove single file
  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    
    onFileRemove?.(files.find(f => f.id === id)!);
  }, [files, onFileRemove]);

  // Action: remove multiple files
  const removeFiles = useCallback((ids: string[]) => {
    setFiles(prev => {
      const toRemove = prev.filter(f => ids.includes(f.id));
      toRemove.forEach(f => URL.revokeObjectURL(f.previewUrl));
      return prev.filter(f => !ids.includes(f.id));
    });
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  // Action: clear all
  const clearAll = useCallback(() => {
    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setSelectedIds(new Set());
  }, [files]);

  // Action: toggle selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Action: set selection
  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  // Action: select all
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(files.map(f => f.id)));
  }, [files]);

  // Action: deselect all
  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Action: set sort option
  const handleSortChange = useCallback((option: SortOption) => {
    setSortOption(option);
    setFiles(prev => sortFileList(prev, option));
  }, [sortFileList]);

  // Action: update single file
  const updateFile = useCallback((id: string, updates: Partial<AppFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  // Action: update multiple files
  const updateFiles = useCallback((updates: { id: string; updates: Partial<AppFile> }[]) => {
    setFiles(prev => prev.map(f => {
      const update = updates.find(u => u.id === f.id);
      return update ? { ...f, ...update.updates } : f;
    }));
  }, []);

  return {
    // State
    files,
    selectedIds,
    sortOption,
    
    // Computed
    selectedFiles,
    allSelected,
    stats,
    
    // Actions
    addFiles,
    removeFile,
    removeFiles,
    clearAll,
    toggleSelection,
    setSelection,
    selectAll,
    deselectAll,
    setSortOption: handleSortChange,
    updateFile,
    updateFiles,
  };
}