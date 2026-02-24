
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppFile } from '../types';
import { Trash2, LayoutGrid, List as ListIcon, CheckCircle, AlertCircle, Loader2, Play, TrendingDown, TrendingUp, Download, RotateCcw, Eye, Folder, Layers, File, FolderOpen, Slash, ChevronLeft, ChevronRight, ChevronDown, Zap } from 'lucide-react';
import { formatBytes } from '../utils';
import type { SortOption } from '../App';

interface FileListProps {
  files: AppFile[];
  viewMode: 'list' | 'grid';
  setViewMode: (mode: 'list' | 'grid') => void;
  onRemove: (id: string) => void;
  onRemoveFiles: (ids: string[]) => void;
  onSelect: (file: AppFile) => void;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  onSetSelection?: (ids: string[]) => void;
  onProcessSingle: (file: AppFile) => void;
  onProcessFiles: (files: AppFile[]) => void;
  onDownloadSingle: (file: AppFile) => void;
  onPreview: (file: AppFile) => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}

const StatusIcon = ({ status, isSkipped }: { status: AppFile['status'], isSkipped?: boolean }) => {
  if (status === 'success' && isSkipped) {
      return <Slash size={18} className="text-gray-400" strokeWidth={2.5} />;
  }
  switch (status) {
    case 'processing':
      return <Loader2 size={18} className="text-brand-600 animate-spin" />;
    case 'success':
      return <CheckCircle size={18} className="text-green-500" />;
    case 'error':
      return <AlertCircle size={18} className="text-red-500" />;
    default:
      return null;
  }
};

// Custom Action Button with Tooltip/Preview
const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  className,
  file,
  isPreview = false,
  iconSize = 15
}: {
  icon: any,
  label: string,
  onClick: (e: React.MouseEvent) => void,
  className?: string,
  file?: AppFile,
  isPreview?: boolean,
  iconSize?: number
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    });

    if (isPreview && file) {
      // If animated, we use the real file URL for preview, otherwise the blob or previewUrl
      if (file.isAnimated) {
          setPreviewUrl(URL.createObjectURL(file.file));
      } else if (file.processedBlob) {
          setPreviewUrl(URL.createObjectURL(file.processedBlob));
      } else {
          setPreviewUrl(file.previewUrl);
      }
    }
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, file]);

  return (
    <>
      <button
        className={className}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Icon size={iconSize} />
      </button>
      {showTooltip && (
        <div 
          className="fixed z-50 pointer-events-none flex flex-col items-center"
          style={{ left: coords.x, top: coords.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="bg-gray-900 dark:bg-black border border-gray-700 text-white text-xs rounded shadow-xl overflow-hidden">
            {isPreview && previewUrl ? (
               <div className="p-1 bg-white border border-gray-200 rounded-sm">
                 <img src={previewUrl} className="max-w-[200px] max-h-[200px] object-contain block bg-gray-100" alt="preview" />
                 <div className="bg-gray-900 text-white text-[10px] text-center py-1 mt-0.5 rounded-sm font-medium">
                   {label}
                 </div>
               </div>
            ) : (
               <div className="px-2 py-1.5 whitespace-nowrap font-medium">{label}</div>
            )}
          </div>
          {/* Arrow */}
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900 dark:border-t-black -mt-px"></div>
        </div>
      )}
    </>
  );
};

export const FileList: React.FC<FileListProps> = ({ 
  files, viewMode, setViewMode, onRemove, onRemoveFiles, onSelect,
  selectedIds, onToggleSelection, onSetSelection,
  onProcessSingle, onProcessFiles, onDownloadSingle, onPreview,
  sortOption, onSortChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [showTabMenu, setShowTabMenu] = useState(false);

  // Compute folder groups
  const { folderCounts, rootCount, uniqueFolders } = useMemo(() => {
    const folderCounts: Record<string, number> = {};
    const folderTimestamps: Record<string, number> = {};
    let rootCount = 0;
    
    files.forEach(f => {
      if (!f.file.webkitRelativePath) {
        rootCount++;
      } else {
        const root = f.file.webkitRelativePath.split('/')[0];
        folderCounts[root] = (folderCounts[root] || 0) + 1;
        
        // Track the latest timestamp for this folder to sort by recency
        if (!folderTimestamps[root] || f.importedAt > folderTimestamps[root]) {
            folderTimestamps[root] = f.importedAt;
        }
      }
    });

    // Sort folders by timestamp descending (newest first)
    const sortedFolders = Object.keys(folderCounts).sort((a, b) => {
        return folderTimestamps[b] - folderTimestamps[a];
    });

    return { folderCounts, rootCount, uniqueFolders: sortedFolders };
  }, [files]);

  // Reset tab if it disappears
  useEffect(() => {
    if (activeTab !== 'all' && activeTab !== 'root' && !folderCounts[activeTab]) {
      setActiveTab('all');
    }
  }, [files, activeTab, folderCounts]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
        const scrollAmount = 200;
        tabsRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    }
  };

  // Filter files based on active tab
  const filteredFiles = useMemo(() => {
    if (activeTab === 'all') return files;
    if (activeTab === 'root') return files.filter(f => !f.file.webkitRelativePath);
    return files.filter(f => f.file.webkitRelativePath?.startsWith(activeTab + '/'));
  }, [files, activeTab]);

  // Computed selection state for current view
  const selectedInView = useMemo(() => {
    if (!selectedIds) return [];
    return filteredFiles.filter(f => selectedIds.has(f.id));
  }, [filteredFiles, selectedIds]);

  const isAllSelected = filteredFiles.length > 0 && selectedInView.length === filteredFiles.length;
  const isIndeterminate = selectedInView.length > 0 && selectedInView.length < filteredFiles.length;

  const handleSelectAll = () => {
    if (!onSetSelection || !selectedIds) return;
    
    if (isAllSelected) {
       // Deselect all visible
       const newSelection = new Set(selectedIds);
       filteredFiles.forEach(f => newSelection.delete(f.id));
       onSetSelection(Array.from(newSelection));
    } else {
       // Select all visible
       const newSelection = new Set(selectedIds);
       filteredFiles.forEach(f => newSelection.add(f.id));
       onSetSelection(Array.from(newSelection));
    }
  };


  const isFolderTab = activeTab !== 'all' && activeTab !== 'root';

  if (files.length === 0) return null;

  const renderSizeChange = (original: number, processed: number, isSkipped?: boolean) => {
    if (isSkipped) {
         return (
             <div className="text-right min-w-[70px] flex flex-col items-end">
                <div className="text-xs font-bold text-gray-400">
                  {formatBytes(original)}
                </div>
                <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Slash size={8} /> 未变动
                </div>
             </div>
         );
    }
    const isSmaller = processed < original;
    const diff = Math.abs(processed - original);
    const percent = Math.round((diff / original) * 100);

    return (
      <div className={`text-right min-w-[70px] flex flex-col items-end`}>
        <div className={`text-xs font-bold ${isSmaller ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {formatBytes(processed)}
        </div>
        <div className={`text-[10px] flex items-center gap-0.5 ${isSmaller ? 'text-green-600 dark:text-green-400' : 'text-red-400 dark:text-red-400'}`}>
          {isSmaller ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
          {percent}%
        </div>
      </div>
    );
  };

  // Action Handlers based on Selection
  const handleBatchRemove = () => {
    if (selectedInView.length > 0) {
      onRemoveFiles(selectedInView.map(f => f.id));
    } else {
      onRemoveFiles(filteredFiles.map(f => f.id));
    }
  };

  const handleBatchProcess = () => {
    if (selectedInView.length > 0) {
      onProcessFiles(selectedInView);
    } else {
      onProcessFiles(filteredFiles);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      
      {/* Folder Tabs - Refined Style */}
      {(uniqueFolders.length > 0 || rootCount > 0) && (
        <div className="flex h-[34px] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 relative">
            
            {/* Scrollable Container */}
            <div 
                ref={tabsRef}
                className="flex-1 overflow-x-auto overflow-y-hidden flex items-end gap-1 px-2 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
            >
                <button 
                onClick={() => setActiveTab('all')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all border-t border-x relative -mb-px whitespace-nowrap ${
                    activeTab === 'all' 
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 z-10 shadow-sm' 
                    : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                >
                全部
                <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${
                    activeTab === 'all' 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                    {files.length}
                </span>
                </button>

                {rootCount > 0 && (
                <button 
                    onClick={() => setActiveTab('root')}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all border-t border-x relative -mb-px whitespace-nowrap ${
                    activeTab === 'root' 
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 z-10 shadow-sm' 
                    : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    单文件
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${
                    activeTab === 'root' 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                    {rootCount}
                    </span>
                </button>
                )}

                {uniqueFolders.map(folder => {
                const isActive = activeTab === folder;
                
                return (
                    <button 
                    key={folder}
                    onClick={() => setActiveTab(folder)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all border-t border-x relative -mb-px max-w-[150px] whitespace-nowrap ${
                        isActive
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 z-10 shadow-sm' 
                        : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    title={folder}
                    >
                    <span className="truncate">{folder}</span>
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${
                        isActive 
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                        {folderCounts[folder]}
                    </span>
                    </button>
                );
                })}
            </div>

            {/* Tab Controls */}
            <div className="flex items-center px-1 bg-gray-50 dark:bg-gray-900/50 border-l border-gray-200 dark:border-gray-700 shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.05)] dark:shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.5)] z-20">
                <button 
                  onClick={() => scrollTabs('left')} 
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
                  title="向左滚动"
                >
                    <ChevronLeft size={14} />
                </button>
                <button 
                  onClick={() => scrollTabs('right')} 
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
                  title="向右滚动"
                >
                    <ChevronRight size={14} />
                </button>
                
                <div className="relative ml-0.5">
                    <button 
                        onClick={() => setShowTabMenu(!showTabMenu)}
                        className={`p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 ${showTabMenu ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : ''}`}
                        title="所有标签页列表"
                    >
                        <ChevronDown size={14} />
                    </button>

                    {showTabMenu && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowTabMenu(false)}></div>
                        <div className="absolute top-full right-0 mt-1 w-56 max-h-[300px] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-40 py-1 animate-in fade-in zoom-in-95 duration-100">
                             <button
                                onClick={() => { setActiveTab('all'); setShowTabMenu(false); }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${activeTab === 'all' ? 'text-brand-600 font-bold bg-brand-50 dark:bg-brand-900/20' : 'text-gray-700 dark:text-gray-300'}`}
                             >
                                <span>全部文件</span>
                                <span className="text-[10px] bg-gray-200 dark:bg-gray-600 px-1.5 rounded-full text-gray-600 dark:text-gray-300">{files.length}</span>
                             </button>
                             {rootCount > 0 && (
                                <button
                                    onClick={() => { setActiveTab('root'); setShowTabMenu(false); }}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${activeTab === 'root' ? 'text-brand-600 font-bold bg-brand-50 dark:bg-brand-900/20' : 'text-gray-700 dark:text-gray-300'}`}
                                >
                                    <span>单文件 (根目录)</span>
                                    <span className="text-[10px] bg-gray-200 dark:bg-gray-600 px-1.5 rounded-full text-gray-600 dark:text-gray-300">{rootCount}</span>
                                </button>
                             )}
                             <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                             {uniqueFolders.map(folder => (
                                 <button
                                    key={folder}
                                    onClick={() => { setActiveTab(folder); setShowTabMenu(false); }}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${activeTab === folder ? 'text-brand-600 font-bold bg-brand-50 dark:bg-brand-900/20' : 'text-gray-700 dark:text-gray-300'}`}
                                 >
                                    <Folder size={12} className={activeTab === folder ? 'fill-brand-200' : 'text-gray-400'} />
                                    <span className="truncate flex-1">{folder}</span>
                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 rounded-full text-gray-500 dark:text-gray-400">{folderCounts[folder]}</span>
                                 </button>
                             ))}
                        </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Control Bar - Refined Style matching ConfigPanel */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
               {/* Global Checkbox */}
               <div className="flex items-center mr-2">
                 <input 
                   type="checkbox" 
                   checked={isAllSelected}
                   ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                   onChange={handleSelectAll}
                   className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
                   title="全选/取消全选"
                 />
               </div>

               {/* Process Button - Blue Tone */}
               <button
                  onClick={handleBatchProcess}
                  className="flex items-center gap-1.5 text-[11px] font-medium rounded px-3 py-1.5 transition-all shadow-sm bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-blue-900/20 hover:border-brand-300 dark:hover:border-blue-700"
               >
                 <Play size={12} fill="currentColor" /> 
                 {selectedInView.length > 0 ? `处理选中 (${selectedInView.length})` : (activeTab === 'all' ? '处理全部' : '处理此目录')}
               </button>


               {/* Clear/Remove Button - Red Tone */}
               <button
                  onClick={handleBatchRemove}
                  className="flex items-center gap-1.5 text-[11px] font-medium rounded px-3 py-1.5 transition-all shadow-sm bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700"
                  title="清空当前显示的列表"
               >
                 <Trash2 size={12} /> 
                 {selectedInView.length > 0 ? `移除选中 (${selectedInView.length})` : '清空'}
               </button>
            </div>

            <div className="flex items-center gap-3">
                <select 
                  value={sortOption}
                  onChange={(e) => onSortChange(e.target.value as any)}
                  className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-[11px] rounded px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="time_desc">导入时间 (最新)</option>
                  <option value="time_asc">导入时间 (最早)</option>
                  <option value="name_asc">文件名 (A-Z)</option>
                  <option value="name_desc">文件名 (Z-A)</option>
                  <option value="size_asc">大小 (小→大)</option>
                  <option value="size_desc">大小 (大→小)</option>
                </select>

                <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded p-1 border border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-1 rounded ${
                        viewMode === 'list' 
                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <ListIcon size={14} />
                  </button>
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-1 rounded ${
                        viewMode === 'grid' 
                        ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <LayoutGrid size={14} />
                  </button>
                </div>
            </div>
        </div>
      </div>
      
      {/* Folder Header */}
      {isFolderTab && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/10 text-xs text-blue-800 dark:text-blue-300 border-b border-blue-100 dark:border-blue-800/30 flex items-center gap-2">
           <FolderOpen size={14} />
           <span className="font-medium">当前目录:</span>
           <span className="font-mono bg-white/50 dark:bg-gray-800/50 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800/50">/{activeTab}</span>
        </div>
      )}

      <div className="overflow-y-auto p-3 flex-1 bg-gray-50/50 dark:bg-black/20">
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
             <Folder size={48} className="mb-2 opacity-20" />
             <p className="text-sm">此文件夹为空</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-2">
            {filteredFiles.map(file => {
              const isSelected = selectedIds?.has(file.id);
              
              return (
              <div 
                  key={file.id} 
                  className={`group flex items-center gap-3 p-2 rounded-lg border transition-all ${
                    isSelected 
                      ? 'border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-blue-900/40' 
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-brand-300 dark:hover:border-brand-500 hover:shadow-sm'
                  }`}
              >
                {/* Item Checkbox */}
                <div className="flex items-center">
                   <input 
                     type="checkbox" 
                     checked={isSelected}
                     onChange={() => onToggleSelection && onToggleSelection(file.id)}
                     className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                   />
                </div>

                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-900 rounded overflow-hidden flex-shrink-0 relative border border-gray-100 dark:border-gray-700">
                  <img src={file.previewUrl} alt="thumb" className="w-full h-full object-cover" />
                  {file.isAnimated && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="bg-black/50 text-white text-[8px] px-1 rounded backdrop-blur-sm font-bold">
                             GIF
                          </div>
                      </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                     <p className="text-xs font-medium truncate text-gray-800 dark:text-gray-200 max-w-[300px]">
                       {file.file.name}
                     </p>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                      <span>{formatBytes(file.originalSize)}</span>
                      <span className="opacity-30">|</span>
                      <span>{file.dimensions.width}x{file.dimensions.height}</span>
                      {file.customConfig && (
                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-1 py-0 rounded text-[10px] border border-purple-200 dark:border-purple-800">自定义</span>
                      )}
                      {file.isAnimated && (
                        <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1 py-0 rounded text-[10px] border border-yellow-200 dark:border-yellow-800 font-medium">动图</span>
                      )}
                    </div>
                    {/* Error Display for List View */}
                    {file.status === 'error' && file.errorMessage && (
                       <div className="text-[10px] text-red-500 dark:text-red-400 font-medium flex items-center gap-1">
                         <AlertCircle size={10} /> {file.errorMessage}
                       </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <StatusIcon status={file.status} isSkipped={file.isSkipped} />
                  
                  {file.status === 'success' && file.processedSize ? (
                     renderSizeChange(file.originalSize, file.processedSize, file.isSkipped)
                  ) : (
                    <div className="min-w-[70px]"></div>
                  )}
                  
                  <div className="flex gap-1">
                     {/* Preview Button - ONLY for Success */}
                     {file.status === 'success' && (
                       <ActionButton 
                          icon={Eye}
                          label="点击全屏预览"
                          onClick={() => onPreview(file)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 dark:text-gray-500 dark:hover:text-brand-400 rounded hover:bg-brand-50 dark:hover:bg-blue-900/30 transition-colors"
                          file={file}
                          isPreview={true}
                       />
                     )}

                     {/* Reprocess / Process Button */}
                     {file.status !== 'processing' && (
                        <ActionButton
                          icon={file.status === 'success' ? RotateCcw : Play}
                          label={file.status === 'success' ? "重新处理" : "立即处理"}
                          onClick={() => onProcessSingle(file)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 dark:text-gray-500 dark:hover:text-brand-400 rounded hover:bg-brand-50 dark:hover:bg-blue-900/30 transition-colors"
                        />
                     )}

                     {/* Download Single Button */}
                     {file.status === 'success' && (
                        <ActionButton
                          icon={Download}
                          label="下载文件"
                          onClick={() => onDownloadSingle(file)}
                          className="p-1.5 text-gray-400 hover:text-green-600 dark:text-gray-500 dark:hover:text-green-400 rounded hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                        />
                     )}

                     <ActionButton 
                        icon={Trash2}
                        label="移除"
                        onClick={() => onRemove(file.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      />
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
             {filteredFiles.map(file => {
               const isSmaller = file.processedSize && file.processedSize < file.originalSize;
               const isSelected = selectedIds?.has(file.id);
               
               return (
                <div 
                    key={file.id} 
                    className={`group relative bg-white dark:bg-gray-800 border rounded-lg overflow-hidden hover:shadow-md transition-all flex flex-col ${
                        isSelected 
                        ? 'border-brand-500 dark:border-brand-500 ring-2 ring-brand-500/20' 
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                >
                  <div className="aspect-square bg-gray-100 dark:bg-gray-900 relative group-hover:opacity-90 transition-opacity">
                    <img src={file.previewUrl} alt="thumb" className="w-full h-full object-cover" />

                    {/* Animated Badge Overlay */}
                    {file.isAnimated && (
                      <span className="absolute top-2 left-8 z-10 bg-yellow-400 text-black px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                        GIF
                      </span>
                    )}

                    {/* Grid Checkbox Overlay */}
                    <div className="absolute top-2 left-2 z-20">
                         <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => onToggleSelection && onToggleSelection(file.id)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-600 focus:ring-brand-500 cursor-pointer shadow-sm"
                         />
                    </div>

                    <div className="absolute top-2 right-2 z-10">
                      <StatusIcon status={file.status} isSkipped={file.isSkipped} />
                    </div>
                    {file.customConfig && (
                        <span className="absolute bottom-2 left-2 bg-purple-500/90 text-white px-1.5 py-0.5 rounded text-[10px] shadow z-10 backdrop-blur-sm">自定义</span>
                    )}
                    
                    {/* Actions Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 z-20 backdrop-blur-[1px]">
                      {/* Preview - Only Success */}
                      {file.status === 'success' && (
                        <ActionButton
                            icon={Eye}
                            label="全屏预览"
                            onClick={() => onPreview(file)}
                            className="p-1.5 bg-white/90 dark:bg-gray-800/90 text-brand-600 dark:text-brand-400 rounded-full hover:bg-white dark:hover:bg-gray-700 hover:scale-110 transition-transform shadow-lg"
                            file={file}
                            isPreview={true}
                            iconSize={16}
                        />
                      )}

                      {/* Reprocess / Process */}
                      {file.status !== 'processing' && (
                        <ActionButton
                            icon={file.status === 'success' ? RotateCcw : Play}
                            label={file.status === 'success' ? "重新处理" : "立即处理"}
                            onClick={() => onProcessSingle(file)}
                            className="p-1.5 bg-white/90 dark:bg-gray-800/90 text-brand-600 dark:text-brand-400 rounded-full hover:bg-white dark:hover:bg-gray-700 hover:scale-110 transition-transform shadow-lg"
                            iconSize={16}
                        />
                      )}
                      
                      {/* Download */}
                      {file.status === 'success' && (
                        <ActionButton
                            icon={Download}
                            label="下载文件"
                            onClick={() => onDownloadSingle(file)}
                            className="p-1.5 bg-white/90 dark:bg-gray-800/90 text-green-600 dark:text-green-400 rounded-full hover:bg-white dark:hover:bg-gray-700 hover:scale-110 transition-transform shadow-lg"
                            iconSize={16}
                        />
                      )}

                      <ActionButton 
                          icon={Trash2}
                          label="移除"
                          onClick={() => onRemove(file.id)}
                          className="p-1.5 bg-white/90 dark:bg-gray-800/90 text-red-500 dark:text-red-400 rounded-full hover:bg-white dark:hover:bg-gray-700 hover:scale-110 transition-transform shadow-lg"
                          iconSize={16}
                      />
                    </div>
                  </div>

                  {/* Info Footer */}
                  <div className={`p-2 border-t ${file.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                    <p className="text-[10px] font-medium truncate mb-1 text-gray-700 dark:text-gray-300">
                        {file.file.name}
                    </p>
                    
                    {file.status === 'error' ? (
                      <p className="text-[10px] text-red-500 dark:text-red-400 truncate" title={file.errorMessage}>
                          {file.errorMessage || '未知错误'}
                      </p>
                    ) : file.status === 'success' && file.processedSize ? (
                      <div className="flex justify-between items-end">
                          <span className="text-[10px] text-gray-400 line-through">{formatBytes(file.originalSize)}</span>
                          <div className="text-right">
                             {file.isSkipped ? (
                                <span className="text-[10px] font-bold text-gray-400">
                                   未变动
                                </span>
                             ) : (
                                <span className={`text-[10px] font-bold ${isSmaller ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                  {formatBytes(file.processedSize)}
                                </span>
                             )}
                          </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatBytes(file.originalSize)}</p>
                    )}
                  </div>
                </div>
               );
             })}
          </div>
        )}
      </div>
    </div>
  );
};
