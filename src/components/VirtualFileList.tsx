/**
 * VirtualFileList.tsx
 * 虚拟滚动文件列表组件 - 支持 1000+ 文件流畅滚动
 * 使用 react-virtuoso 实现高性能列表和网格视图
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { ImageTypeBadge } from './ImageTypeBadge';
import {
  Trash2,
  Play,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Folder,
  ArrowUpDown,
  Clock,
  Zap,
  FileX,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Slash
} from 'lucide-react';
import { AppFile, SortOption } from '../types';
import { formatBytes } from '../utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ==================== Utility ====================

/** 合并 Tailwind 类名 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化时间（毫秒转为秒） */
function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

// ==================== Types ====================

/** 视图模式 */

/** 文件夹信息 */
interface FolderInfo {
  id: string;
  name: string;
  path: string;
  count: number;
  size: number;
}

/** VirtualFileList 组件 Props */
interface VirtualFileListProps {
  /** 文件列表 */
  files: AppFile[];
  /** 已选择的文件 ID 集合 */
  selectedIds: Set<string>;
  /** 切换单个文件选择状态 */
  onToggleSelection: (id: string) => void;
  /** 设置选择的文件 IDs */
  onSetSelection: (ids: string[]) => void;
  /** 移除单个文件 */
  onRemove: (id: string) => void;
  /** 批量移除文件 */
  onRemoveFiles: (ids: string[]) => void;
  /** 处理单个文件 */
  onProcessSingle: (file: AppFile) => void;
  /** 处理多个文件 */
  onProcessFiles: (files: AppFile[]) => void;
  /** 下载单个文件 */
  onDownloadSingle: (file: AppFile) => void;
  /** 预览文件 */
  onPreview: (file: AppFile) => void;
  /** 排序选项 */
  sortOption: SortOption;
  /** 排序变更回调 */
  onSortChange: (method: SortOption) => void;
  /** 遗留的 onSelect 回调 */
  onSelect?: () => void;
}

// ==================== Components ====================

/**
 * 文件状态徽章组件
 */
const StatusBadge: React.FC<{
  status: AppFile['status'];
  isSkipped?: boolean;
  inflation?: AppFile['inflation'];
}> = ({ status, isSkipped, inflation }) => {
  if (isSkipped) {
    const title = inflation
      ? `处理后体积反而增大 ${inflation.deltaPercent}%，已保留原图`
      : '动图或无需处理，已保留原图';
    return (
      <span
        title={title}
        className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
      >
        <Zap size={10} />
        保留原图
      </span>
    );
  }

  switch (status) {
    case 'idle':
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          待处理
        </span>
      );
    case 'processing':
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
          <Loader2 size={10} className="animate-spin" />
          处理中
        </span>
      );
    case 'success':
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">
          <Check size={10} />
          完成
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800">
          <AlertCircle size={10} />
          失败
        </span>
      );
    default:
      return null;
  }
};

/**
 * 大小变化显示组件
 */
const SizeChange: React.FC<{
  originalSize: number;
  processedSize: number;
  isSkipped?: boolean;
  inflation?: AppFile['inflation'];
}> = ({ originalSize, processedSize, isSkipped, inflation }) => {
  // 因体积膨胀回退：只做差异对比，告诉用户"处理了会有多大"
  if (isSkipped && inflation) {
    return (
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-gray-600 dark:text-gray-300">{formatBytes(originalSize)}</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="text-amber-600 dark:text-amber-400">
          处理会 {formatBytes(inflation.attemptedSize)} (+{inflation.deltaPercent}%)
        </span>
      </div>
    );
  }

  if (isSkipped) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-gray-400">
        <span className="line-through">{formatBytes(originalSize)}</span>
        <Slash size={10} />
        <span>{formatBytes(processedSize)}</span>
      </div>
    );
  }

  const isSmaller = processedSize < originalSize;
  const diff = Math.abs(processedSize - originalSize);
  const percent = originalSize > 0 ? Math.round((diff / originalSize) * 100) : 0;

  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-gray-400 line-through">{formatBytes(originalSize)}</span>
      <span className="flex items-center gap-0.5">
        {isSmaller ? (
          <TrendingDown size={11} className="text-green-500" />
        ) : (
          <TrendingUp size={11} className="text-red-500" />
        )}
      </span>
      <span className={isSmaller ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
        {formatBytes(processedSize)}
      </span>
      <span className={cn(
        'tabular-nums',
        isSmaller ? 'text-green-500' : 'text-red-400'
      )}>
        {isSmaller ? '-' : '+'}{percent}%
      </span>
    </div>
  );
};

/**
 * 列表视图项组件
 */
const ListItem: React.FC<{
  file: AppFile;
  selected: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (file: AppFile) => void;
  onProcess: (file: AppFile) => void;
  onDownload: (file: AppFile) => void;
  isProcessing: boolean;
}> = React.memo(
  ({ file, selected, onToggle, onRemove, onPreview, onProcess, onDownload, isProcessing }) => {
    // 产物可能只在磁盘上（桌面端），别只认内存 Blob，否则下载按钮永远灰着
    const canDownload = file.status === 'success' && Boolean(file.processedBlob || file.processedPath);
    const canProcess = file.status !== 'processing' && !isProcessing;

    return (
      <div
        className={cn(
          // 左侧 4px 竖条常驻（未选中时透明），否则选中瞬间内容会横向位移
          'group flex items-center gap-2 px-3 py-1.5 border-b border-l-4 border-gray-100 border-l-transparent dark:border-gray-700/50 transition-colors duration-150',
          // hover 底色必须分两支写：选中行若共用 `hover:bg-gray-50`，
          // 鼠标一移上去蓝色选中底会被灰底盖掉、移开又恢复，处理中列表频繁重渲染时就是"闪动"
          selected
            ? 'bg-brand-50 dark:bg-brand-900/10 border-l-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/20'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        )}
      >
        {/* 选择框 */}
        <button
          onClick={() => onToggle(file.id)}
          className={cn(
            'flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
            selected
              ? 'bg-brand-500 border-brand-500 text-white'
              : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'
          )}
        >
          {selected && <Check size={10} strokeWidth={3} />}
        </button>

        {/* 文件类型图标（本地 FA），点它预览原图 */}
        <ImageTypeBadge name={file.file.name} onClick={() => onPreview(file)} />

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPreview(file)}
              title="点击预览原图"
              className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate text-left hover:text-brand-600 dark:hover:text-brand-400 hover:underline decoration-dotted underline-offset-2 transition-colors"
            >
              {file.file.name}
            </button>
            {file.isAnimated && (
              <span className="flex-shrink-0 px-1 py-0.5 text-[8px] font-bold bg-yellow-500 text-black rounded">
                GIF
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-300">
            {file.status === 'success' && file.processedSize !== undefined ? (
              <SizeChange
                originalSize={file.originalSize}
                processedSize={file.processedSize}
                isSkipped={file.isSkipped}
                inflation={file.inflation}
              />
            ) : (
              <span>{formatBytes(file.originalSize)}</span>
            )}
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{file.dimensions.width > 0 ? `${file.dimensions.width}×${file.dimensions.height}` : '—'}</span>
            {file.processingTime && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-0.5">
                  <Clock size={10} />
                  {formatTime(file.processingTime)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 状态 */}
        <div className="flex-shrink-0">
          <StatusBadge status={file.status} isSkipped={file.isSkipped} inflation={file.inflation} />
        </div>

        {/* 操作按钮 */}
        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canProcess && (
            file.status === 'success' ? (
              <button
                onClick={() => onProcess(file)}
                className="p-1.5 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20 rounded"
                title="重新处理"
              >
                <RotateCcw size={14} />
              </button>
            ) : (
              <button
                onClick={() => onProcess(file)}
                className="p-1.5 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20 rounded"
                title="处理"
              >
                <Play size={14} />
              </button>
            )
          )}
          {canDownload && (
            <button
              onClick={() => onDownload(file)}
              className="p-1.5 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 rounded"
              title="下载"
            >
              <Download size={14} />
            </button>
          )}
          <button
            onClick={() => onRemove(file.id)}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="移除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }
);

ListItem.displayName = 'ListItem';

/**
 * 排序选择器组件
 */
const SortSelector: React.FC<{
  value: SortOption;
  onChange: (value: SortOption) => void;
}> = ({ value, onChange }) => {
  const options: { value: SortOption; label: string }[] = [
    { value: 'time_desc', label: '最新导入' },
    { value: 'time_asc', label: '最早导入' },
    { value: 'name_asc', label: '名称 A-Z' },
    { value: 'name_desc', label: '名称 Z-A' },
    { value: 'size_asc', label: '体积 小→大' },
    { value: 'size_desc', label: '体积 大→小' },
    { value: 'type_asc', label: '类型 A-Z' },
    { value: 'type_desc', label: '类型 Z-A' },
  ];

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ArrowUpDown
        size={12}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
    </div>
  );
};

/**
 * Virtuoso 的容器组件必须是**模块级稳定引用**。
 * 原来写成内联对象，每次渲染都是新组件 → Virtuoso 认为"components 变了"，把整个列表容器重挂一遍，
 * 行内的 `transition-colors` / `transition-opacity` 被打断重置，鼠标悬停时就是"背景闪、按钮闪"。
 * 导出期间进度回调频繁触发重渲染，所以只有导出/处理时才看得出来。
 */
const VIRTUOSO_COMPONENTS = {
  List: React.forwardRef(({ style, children, ...props }: any, ref: any) => (
    <div ref={ref} {...props} style={{ ...style }} className="bg-white dark:bg-gray-800">
      {children}
    </div>
  )),
  EmptyPlaceholder: () => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
      <FileX size={32} className="mb-2 opacity-50" />
      <p className="text-xs">当前文件夹为空</p>
    </div>
  ),
};

// ==================== Main Component ====================

/**
 * VirtualFileList 虚拟滚动文件列表组件
 *
 * 特性：
 * - 支持 1000+ 文件虚拟滚动（使用 react-virtuoso）
 * - 文件夹 Tab 筛选
 * - 批量选择和操作
 *
 * 外层用 React.memo 包了一层：导出/处理期间 App 的进度回调会频繁重渲染，
 * 这里 props 引用没变时直接跳过，避免整片列表跟着重建（那是 hover 闪动的另一半原因）。
 */
const VirtualFileListInner: React.FC<VirtualFileListProps> = ({
  files,
  selectedIds,
  onToggleSelection,
  onSetSelection,
  onRemove,
  onRemoveFiles,
  onProcessSingle,
  onProcessFiles,
  onDownloadSingle,
  onPreview,
  sortOption,
  onSortChange,
}) => {
  // ==================== State ====================

  /** 当前选中的文件夹 */
  const [activeFolder, setActiveFolder] = useState<string>('all');

  // ==================== Computed ====================

  /**
   * 提取文件夹信息
   */
  const folders = useMemo<FolderInfo[]>(() => {
    const folderMap = new Map<string, FolderInfo>();

    // 添加 "全部" 选项
    folderMap.set('all', {
      id: 'all',
      name: '全部文件',
      path: '',
      count: files.length,
      size: files.reduce((acc, f) => acc + f.originalSize, 0),
    });

    // 按文件夹分组
    files.forEach((file) => {
      const path = file.file.webkitRelativePath || '';
      const lastSlash = path.lastIndexOf('/');
      const folderPath = lastSlash > 0 ? path.substring(0, lastSlash) : 'root';
      const folderName = folderPath === 'root' ? '根目录' : folderPath.split('/').pop() || '未知';

      if (!folderMap.has(folderPath)) {
        folderMap.set(folderPath, {
          id: folderPath,
          name: folderName,
          path: folderPath,
          count: 0,
          size: 0,
        });
      }

      const folder = folderMap.get(folderPath)!;
      folder.count++;
      folder.size += file.originalSize;
    });

    return Array.from(folderMap.values());
  }, [files]);

  /**
   * 筛选后的文件列表
   */
  const filteredFiles = useMemo(() => {
    if (activeFolder === 'all') return files;

    return files.filter((file) => {
      const path = file.file.webkitRelativePath || '';
      if (activeFolder === 'root') return !path.includes('/');
      return path.startsWith(activeFolder + '/');
    });
  }, [files, activeFolder]);

  /**
   * 是否有文件正在处理
   */
  const isAnyProcessing = useMemo(
    () => files.some((f) => f.status === 'processing'),
    [files]
  );

  /**
   * 全选状态
   */
  const selectAllState = useMemo(() => {
    const visibleIds = new Set(filteredFiles.map((f) => f.id));
    const selectedVisible = Array.from(selectedIds).filter((id) => visibleIds.has(id));

    if (selectedVisible.length === 0) return 'none';
    if (selectedVisible.length === filteredFiles.length) return 'all';
    return 'partial';
  }, [selectedIds, filteredFiles]);

  // ==================== Handlers ====================

  /**
   * 全选/取消全选
   */
  const handleSelectAll = useCallback(() => {
    if (selectAllState === 'all') {
      // 取消选择当前筛选的所有文件
      const visibleIds = filteredFiles.map((f) => f.id);
      const newSelection = Array.from(selectedIds).filter((id) => !visibleIds.includes(id));
      onSetSelection(newSelection);
    } else {
      // 选择当前筛选的所有文件
      const visibleIds = filteredFiles.map((f) => f.id);
      const newSelection = new Set([...Array.from(selectedIds), ...visibleIds]);
      onSetSelection(Array.from(newSelection));
    }
  }, [selectAllState, filteredFiles, selectedIds, onSetSelection]);

  /**
   * 处理选中的文件
   */
  const handleProcessSelected = useCallback(() => {
    const selectedFiles = filteredFiles.filter((f) => selectedIds.has(f.id));
    if (selectedFiles.length > 0) {
      onProcessFiles(selectedFiles);
    }
  }, [filteredFiles, selectedIds, onProcessFiles]);

  /**
   * 移除选中的文件
   */
  const handleRemoveSelected = useCallback(() => {
    const selectedFileIds = Array.from(selectedIds);
    if (selectedFileIds.length > 0) {
      onRemoveFiles(selectedFileIds);
    }
  }, [selectedIds, onRemoveFiles]);

  /**
   * Virtuoso 的 render prop：必须稳定，否则每次父级重渲染都当成"数据变了"重刷所有行。
   * 依赖里只放真正影响行内容的东西（选中集合、处理态、各回调）。
   */
  const itemContent = useCallback(
    (_index: number, file: AppFile) => (
      <ListItem
        file={file}
        selected={selectedIds.has(file.id)}
        onToggle={onToggleSelection}
        onRemove={onRemove}
        onPreview={onPreview}
        onProcess={onProcessSingle}
        onDownload={onDownloadSingle}
        isProcessing={isAnyProcessing}
      />
    ),
    [selectedIds, onToggleSelection, onRemove, onPreview, onProcessSingle, onDownloadSingle, isAnyProcessing]
  );

  // ==================== Render ====================

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
        <FileX size={48} className="mb-4 opacity-50" />
        <p className="text-sm">暂无文件</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 mb-3 space-y-3">
        {/* 第一行：视图切换、排序、选择 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 左侧：全选和批量操作 */}
          <div className="flex items-center gap-2">
            {/* 全选按钮 */}
            <button
              onClick={handleSelectAll}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                selectAllState === 'all'
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400'
                  : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center',
                  selectAllState === 'all'
                    ? 'bg-brand-500 border-brand-500'
                    : selectAllState === 'partial'
                      ? 'bg-brand-300 border-brand-300'
                      : 'border-gray-300 dark:border-gray-600'
                )}
              >
                {selectAllState !== 'none' && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>
              {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
            </button>

            {/* 批量操作 */}
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleProcessSelected}
                  disabled={isAnyProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 dark:text-brand-400 dark:bg-brand-900/20 dark:hover:bg-brand-900/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={12} />
                  处理选中
                </button>
                <button
                  onClick={handleRemoveSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg"
                >
                  <Trash2 size={12} />
                  删除选中
                </button>
              </>
            )}
          </div>

          {/* 右侧：排序 */}
          <div className="flex items-center gap-3">
            <SortSelector value={sortOption} onChange={onSortChange} />
          </div>
        </div>

        {/* 第二行：文件夹 Tab */}
        {folders.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <Folder size={14} className="text-gray-400 flex-shrink-0" />
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all',
                  activeFolder === folder.id
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                    : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                )}
              >
                <span className="truncate max-w-[120px]">{folder.name}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px]',
                    activeFolder === folder.id
                      ? 'bg-brand-200 dark:bg-brand-800 text-brand-800 dark:text-brand-200'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  )}
                >
                  {folder.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 统计信息 */}
        <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
          <span>
            显示: <b className="text-gray-700 dark:text-gray-300">{filteredFiles.length}</b> /{' '}
            {files.length} 个文件
          </span>
          <span>
            总大小:{' '}
            <b className="text-gray-700 dark:text-gray-300">
              {formatBytes(
                filteredFiles.reduce((acc, f) => acc + f.originalSize, 0)
              )}
            </b>
          </span>
          {selectedIds.size > 0 && (
            <span className="text-brand-600 dark:text-brand-400">
              已选择:{' '}
              <b>
                {selectedIds.size} 个文件 (
                {formatBytes(
                  files
                    .filter((f) => selectedIds.has(f.id))
                    .reduce((acc, f) => acc + f.originalSize, 0)
                )}
                )
              </b>
            </span>
          )}
        </div>
      </div>

      {/* 文件列表区域 */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Virtuoso
            data={filteredFiles}
            totalCount={filteredFiles.length}
            overscan={10}
            increaseViewportBy={{ top: 100, bottom: 100 }}
            itemContent={itemContent}
            components={VIRTUOSO_COMPONENTS}
          />
      </div>
    </div>
  );
};

// ==================== Export ====================

/** props 引用不变时整块跳过重渲染 */
export const VirtualFileList = React.memo(VirtualFileListInner);
VirtualFileList.displayName = 'VirtualFileList';

export default VirtualFileList;
