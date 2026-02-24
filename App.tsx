
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ImportZone } from './components/ImportZone';
import { ConfigPanel } from './components/ConfigPanel';
import { FileList } from './components/FileList';
import { LogViewer } from './components/LogViewer';
import { AppFile, ProcessingConfig, ProcessingReport, OutputFormat, LogEntry, LogLevel } from './types';
import { DEFAULT_CONFIG, MAX_FILE_SIZE_MB, SUGGESTED_BATCH_LIMIT, PRESETS, APP_INFO, CHANGELOG } from './constants';
import { processImage } from './services/imageProcessor';
import { generateId, loadFromStorage, saveToStorage, formatBytes, getStorageSize, saveFile, generateDummyImage, getWebGLMaxTextureSize, checkIsAnimated, createStaticThumbnail } from './utils';
import JSZip from 'jszip';
import { Moon, Sun, Play, Pause, Download, Trash2, RefreshCcw, AlertOctagon, X, Info, Eye, Database, Plus, ChevronDown, Check, FolderInput, FilePlus, Archive, Layers, Folder, Command, Package, Loader2, Zap, Cpu, Aperture, ScrollText, History, Sparkles, Wrench, Bug, FlaskConical, MonitorSmartphone, MemoryStick } from 'lucide-react';

export type SortOption = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'size_asc' | 'size_desc' | 'type_asc' | 'type_desc';

function App() {
  // --- State ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadFromStorage('theme', 'light'));
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => loadFromStorage('viewMode', 'list'));
  const [files, setFiles] = useState<AppFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('time_desc');
  
  // Load config with migration check for deprecated formats
  const [config, setConfig] = useState<ProcessingConfig>(() => {
    const loaded = loadFromStorage('lastConfig', DEFAULT_CONFIG);
    // Migration: If legacy 'image/avif' is found, fallback to jpeg since avif is removed.
    if ((loaded.format as string) === 'image/avif') {
        loaded.format = 'image/jpeg';
    }
    // Migration: Ensure preventSizeInflation exists
    if (loaded.preventSizeInflation === undefined) {
        loaded.preventSizeInflation = true;
    }
    return loaded;
  });
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  // Zipping State
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [skippedFiles, setSkippedFiles] = useState<{name: string, reason: string}[]>([]);
  
  // Info Modal State
  const [showInfo, setShowInfo] = useState(false);
  const [infoTab, setInfoTab] = useState<'about' | 'changelog' | 'testing'>('about');
  
  // Test Tab State
  const [testSettings, setTestSettings] = useState({ count: 50, resolution: 1024 });
  const [browserCaps, setBrowserCaps] = useState<{ cores: number, maxTexture: number }>({ cores: 0, maxTexture: 0 });

  // Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Processing Control Refs
  const stopProcessingRef = useRef(false);
  
  // Preview State
  const [previewFile, setPreviewFile] = useState<AppFile | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  
  const [storageSize, setStorageSize] = useState(0);
  
  // Hidden Input Refs
  const addFilesInputRef = useRef<HTMLInputElement>(null);
  const addFolderInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveToStorage('theme', theme);
  }, [theme]);

  useEffect(() => {
    saveToStorage('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const success = saveToStorage('lastConfig', config);
    if (!success) {
        showNotification("配置未保存: 本地存储空间已满 (可能水印图过大)", 'error');
        addLog("无法保存配置到本地存储，可能是水印图片过大或配额不足", "warn");
    }
  }, [config]);

  // Update storage size when info modal opens
  useEffect(() => {
    if (showInfo) {
      setStorageSize(getStorageSize());
    }
  }, [showInfo, config, theme, viewMode]);

  // Check browser caps
  useEffect(() => {
    setBrowserCaps({
        cores: navigator.hardwareConcurrency || 1,
        maxTexture: getWebGLMaxTextureSize()
    });
  }, []);

  // Handle Preview URL creation
  useEffect(() => {
    let url: string | null = null;
    if (previewFile) {
        if (previewFile.status === 'success' && previewFile.processedBlob) {
            url = URL.createObjectURL(previewFile.processedBlob);
            setActivePreviewUrl(url);
        } else {
            // If it's an animated file, the stored previewUrl is static.
            // For the full preview modal, we want to show the REAL file (animation).
            if (previewFile.isAnimated) {
                 url = URL.createObjectURL(previewFile.file);
                 setActivePreviewUrl(url);
            } else {
                 setActivePreviewUrl(previewFile.previewUrl);
            }
        }
    } else {
        setActivePreviewUrl(null);
    }
    
    return () => {
        if (url) URL.revokeObjectURL(url);
    };
  }, [previewFile]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        // Select all currently loaded files
        setSelectedIds(new Set(files.map(f => f.id)));
        showNotification("已全选", 'success');
      }
      if (e.key === 'Escape') {
        if (previewFile) {
             setPreviewFile(null);
        } else if (showInfo) {
             setShowInfo(false);
        } else if (showLogs) {
             setShowLogs(false);
        } else {
             // Menu closed
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewFile, files, showInfo, showLogs]);

  // --- Helpers ---
  const showNotification = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const addLog = (message: string, level: LogLevel = 'info', details?: string) => {
    setLogs(prev => [
      ...prev,
      {
        id: generateId(),
        timestamp: Date.now(),
        level,
        message,
        details
      }
    ]);
  };

  const handleClearCache = (type: 'config' | 'all') => {
    // 1. Calculate size BEFORE clearing
    const sizeBefore = getStorageSize();

    if (type === 'config') {
      localStorage.removeItem('lastConfig');
      setConfig(DEFAULT_CONFIG);
      addLog('用户重置了全局配置', 'info');
    } else if (type === 'all') {
      localStorage.clear();
      setConfig(DEFAULT_CONFIG);
      setTheme('light');
      setViewMode('list');
      addLog('用户清空了所有本地缓存', 'warn');
    }

    // 2. Wait for React effects to run and re-save the default values (persistence)
    // This ensures we measure the STABLE size after reset.
    setTimeout(() => {
        const sizeAfter = getStorageSize();
        setStorageSize(sizeAfter); // Update UI
        
        const freed = Math.max(0, sizeBefore - sizeAfter);
        
        if (freed > 1024) { // Only show if freed > 1KB
            showNotification(`已重置，释放了 ${formatBytes(freed)} 空间`, 'success');
        } else {
            showNotification('已重置为默认设置 (空间占用极低)', 'success');
        }
    }, 100);
  };

  const handleExportChangelog = async () => {
    const text = `PicMan 版本更新记录\n导出时间: ${new Date().toLocaleString()}\n\n` + CHANGELOG.map(log => {
      const changes = log.changes.map(c => `  - [${c.type === 'feat' ? '新增' : c.type === 'fix' ? '修复' : '优化'}] ${c.content}`).join('\n');
      return `版本: ${log.version}   日期: ${log.date}\n${changes}`;
    }).join('\n\n------------------------------------------------\n\n');
    
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const result = await saveFile(blob, `PicMan_更新日志_${APP_INFO.version}.txt`);
    
    if (result.success) {
        showNotification("更新日志已导出", "success");
        addLog("用户导出了更新日志", "info");
    }
  };

  const getFileExtension = (filename: string): string => {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
  };

  const getExtensionFromMime = (mime: string) => {
      switch(mime) {
          case 'image/png': return 'png';
          case 'image/webp': return 'webp';
          case 'image/gif': return 'gif';
          case 'image/bmp': return 'bmp';
          default: return 'jpg';
      }
  };

  const sortFileList = (list: AppFile[], method: SortOption): AppFile[] => {
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
           const extA = getFileExtension(a.file.name);
           const extB = getFileExtension(b.file.name);
           return extA.localeCompare(extB);
        });
      case 'type_desc':
        return sorted.sort((a, b) => {
           const extA = getFileExtension(a.file.name);
           const extB = getFileExtension(b.file.name);
           return extB.localeCompare(extA);
        });
      default:
        return sorted; 
    }
  };

  const handleSortChange = (method: SortOption) => {
    setSortOption(method);
    setFiles(prev => sortFileList(prev, method));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setSelection = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  // --- Core Processing Logic ---
  const processSingleFileInternal = async (fileSnapshot: AppFile): Promise<AppFile | null> => {
    const startTime = performance.now();
    const currentConfig = fileSnapshot.customConfig || config;
    let processedFile: AppFile | null = null;

    // 1. Mark as processing
    setFiles(prev => prev.map(f => {
        if (f.id === fileSnapshot.id) {
            return { ...f, status: 'processing', errorMessage: undefined, isSkipped: false };
        }
        return f;
    }));

    try {
        // --- Animation Guard ---
        // If file is animated (GIF/WebP), skip processing to preserve animation.
        // Canvas API does not support writing animated GIF/WebP.
        if (fileSnapshot.isAnimated) {
             const finalBlob = fileSnapshot.file; // Just copy original
             const timeTaken = (performance.now() - startTime).toFixed(0);
             
             processedFile = {
                ...fileSnapshot,
                processedBlob: finalBlob,
                processedSize: finalBlob.size,
                status: 'success',
                processingTime: performance.now() - startTime,
                isSkipped: true
             };
             
             setFiles(prev => prev.map(f => {
                if (f.id === fileSnapshot.id) {
                    return processedFile!;
                }
                return f;
            }));

            addLog(
                `跳过动图处理: ${fileSnapshot.file.name}`,
                'warn',
                `检测到动态图片 (GIF/Animated WebP)。为保留动效，已跳过压缩与水印处理，直接输出原文件。`
            );
            return processedFile; // Exit early
        }

        const result = await processImage(fileSnapshot, currentConfig);

        // --- Smart Size Guard Logic ---
        // If processed file is larger than original AND no edits were made, keep original.
        const isSizeLarger = result.blob.size > fileSnapshot.originalSize;
        
        // Detect substantive edits
        // 1. Format change (rough check)
        const isFormatChanged = fileSnapshot.file.type !== currentConfig.format; 
        // 2. Geometry changes
        const isResized = currentConfig.resizeMode !== 'original';
        const isRotated = (currentConfig.rotate || 0) % 360 !== 0;
        const isFlipped = currentConfig.flipX || currentConfig.flipY;
        // 3. Watermark
        const hasWatermark = currentConfig.watermark.enabled;

        const hasEdits = isFormatChanged || isResized || isRotated || isFlipped || hasWatermark;
        
        let finalBlob = result.blob;
        let finalWidth = result.width;
        let finalHeight = result.height;
        let isSkipped = false;

        // Apply guard if enabled and conditions met
        if ((currentConfig.preventSizeInflation !== false) && isSizeLarger && !hasEdits) {
             finalBlob = fileSnapshot.file;
             finalWidth = fileSnapshot.dimensions.width;
             finalHeight = fileSnapshot.dimensions.height;
             isSkipped = true;
        }

        const compressRatio = ((1 - (finalBlob.size / fileSnapshot.originalSize)) * 100).toFixed(1);
        const timeTaken = (performance.now() - startTime).toFixed(0);

        processedFile = {
            ...fileSnapshot,
            processedBlob: finalBlob,
            processedSize: finalBlob.size,
            status: 'success',
            processingTime: performance.now() - startTime,
            dimensions: { width: finalWidth, height: finalHeight },
            isSkipped: isSkipped
        };
        
        setFiles(prev => prev.map(f => {
            if (f.id === fileSnapshot.id) {
                return processedFile!;
            }
            return f;
        }));

        if (isSkipped) {
            addLog(
                `智能防膨胀: ${fileSnapshot.file.name}`,
                'warn',
                `原图: ${formatBytes(fileSnapshot.originalSize)} -> 处理后(弃用): ${formatBytes(result.blob.size)}\n因体积变大且无实质编辑，已自动保留原图。`
            );
        } else {
            addLog(
                `处理成功: ${fileSnapshot.file.name}`, 
                'info',
                `Input: ${formatBytes(fileSnapshot.originalSize)}\n` +
                `Output: ${formatBytes(finalBlob.size)}\n` +
                `Ratio: ${compressRatio}% reduction\n` +
                `Time: ${timeTaken}ms\n` +
                `Config: ${currentConfig.format} Q:${currentConfig.quality}`
            );
        }

    } catch (err: any) {
        console.error(err);
        const errorMsg = err.message || "未知错误";
        
        // Detailed Error Log
        addLog(
            `处理失败: ${fileSnapshot.file.name}`, 
            'error', 
            `Error: ${errorMsg}\n` +
            `Stack: ${err.stack || 'No stack trace'}\n` +
            `UserAgent: ${navigator.userAgent}\n` +
            `Config Snapshot: ${JSON.stringify(currentConfig, null, 2)}`
        );
        
        processedFile = {
            ...fileSnapshot,
            status: 'error',
            errorMessage: errorMsg
        };
        
        setFiles(prev => prev.map(f => {
            if (f.id === fileSnapshot.id) {
                return processedFile!;
            }
            return f;
        }));
        return null;
    }
    return processedFile;
  };

  // --- Handlers ---

  const handleFilesAdded = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    
    setIsImporting(true);
    setImportProgress(0);

    const processedFiles: AppFile[] = [];
    const newSkipped: {name: string, reason: string}[] = [];
    const timestamp = Date.now();
    const totalCount = newFiles.length;
    
    let totalAddedSize = 0;
    let hasAnimated = false;

    for (const [index, f] of newFiles.entries()) {
      // 1. Silent Ignore for system files
      if (f.name === '.DS_Store' || f.name === 'Thumbs.db') {
        setImportProgress(Math.round(((index + 1) / totalCount) * 100));
        continue;
      }

      // Dedupe Logic:
      const isDuplicate = files.some(existing => 
          existing.file.name === f.name && 
          existing.file.size === f.size &&
          existing.file.lastModified === f.lastModified &&
          existing.file.webkitRelativePath === f.webkitRelativePath
      );

      if (isDuplicate) {
        newSkipped.push({ name: f.name, reason: '文件已存在' });
        setImportProgress(Math.round(((index + 1) / totalCount) * 100));
        continue;
      }
      
      // Size check
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        newSkipped.push({ name: f.name, reason: '超过大小限制' });
        setImportProgress(Math.round(((index + 1) / totalCount) * 100));
        continue;
      }

      let previewUrl = "";
      try {
        // Check for animation
        const isAnimated = await checkIsAnimated(f);
        if (isAnimated) hasAnimated = true;

        if (isAnimated) {
             // Create a static thumbnail to prevent UI lag
             previewUrl = await createStaticThumbnail(f);
        } else {
             previewUrl = URL.createObjectURL(f);
        }

        const img = new Image();
        img.src = previewUrl;
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
        });

        processedFiles.push({
          id: generateId(),
          file: f,
          previewUrl, // Static thumb for animated, blob url for others
          status: 'idle',
          originalSize: f.size,
          dimensions: { width: img.naturalWidth, height: img.naturalHeight },
          // Slight offset to ensure stable sort for batch import
          importedAt: timestamp + index,
          isAnimated: isAnimated
        });
        totalAddedSize += f.size;
      } catch (e) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        newSkipped.push({ name: f.name, reason: '文件损坏或无法读取' });
        addLog(`文件读取失败: ${f.name}`, 'error', (e as any).message);
      }
      
      // Update progress and yield to UI loop to ensure progress bar renders
      setImportProgress(Math.round(((index + 1) / totalCount) * 100));
      if (index % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (newSkipped.length > 0) {
      setSkippedFiles(prev => [...newSkipped, ...prev]);
      newSkipped.forEach(s => addLog(`跳过文件: ${s.name}`, 'warn', s.reason));
    }
    
    let updatedFileList = [...files];

    if (processedFiles.length > 0) {
      // Append new files
      updatedFileList = [...processedFiles, ...updatedFileList];
      
      // Apply current sort
      updatedFileList = sortFileList(updatedFileList, sortOption);
      
      setFiles(updatedFileList);
      
      // Default Select All New Files
      setSelectedIds(prev => {
        const next = new Set(prev);
        processedFiles.forEach(f => next.add(f.id));
        return next;
      });
      
      const typeDist = processedFiles.map(f => f.file.type).slice(0, 5).join(', ');
      addLog(
          `导入完成: ${processedFiles.length} 个文件`, 
          'success',
          `总大小: ${formatBytes(totalAddedSize)}\n` +
          `文件类型分布: ${typeDist}${processedFiles.length > 5 ? '...' : ''}`
      );

      if (hasAnimated) {
          showNotification(`检测到动图，缩略图已生成静态帧以优化性能。`, 'success');
      }
    }
    
    setIsImporting(false);
    setImportProgress(0);
  };

  // --- Tauri File Drop Integration ---
  // We use a ref to hold the current handleFilesAdded function to avoid effect re-binding
  const handleFilesAddedRef = useRef(handleFilesAdded);
  useEffect(() => { handleFilesAddedRef.current = handleFilesAdded; }, [handleFilesAdded]);

  useEffect(() => {
    // @ts-ignore
    const tauri = window.__TAURI__;
    if (!tauri) return;

    let unlistenFn: (() => void) | undefined;

    const setupTauriDrop = async () => {
      try {
        // Listen for the global Tauri file drop event
        unlistenFn = await tauri.event.listen('tauri://file-drop', async (event: any) => {
           const paths = event.payload as string[];
           if (!paths || !Array.isArray(paths) || paths.length === 0) return;

           // Trigger global loading state
           setIsImporting(true);
           setImportProgress(10); // Initial visual feedback

           const collectedFiles: File[] = [];
           const SUPPORTED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

           // Recursive helper to read files/folders via Tauri FS
           const processPath = async (path: string) => {
              try {
                  // Try to read as directory
                  const entries = await tauri.fs.readDir(path, { recursive: true });
                  
                  const traverseEntries = async (nodes: any[]) => {
                     for (const node of nodes) {
                        if (node.children) {
                           await traverseEntries(node.children);
                        } else {
                           await tryReadFile(node.path);
                        }
                     }
                  };
                  await traverseEntries(entries);
              } catch (e) {
                  // Not a directory or access error, try as file
                  await tryReadFile(path);
              }
           };

           // Helper to read binary and create File object
           const tryReadFile = async (filePath: string) => {
              const name = filePath.split(/[\\/]/).pop();
              if (!name) return;
              
              // Skip hidden system files
              if (name.startsWith('.') || name === 'Thumbs.db') return;

              const ext = name.split('.').pop()?.toLowerCase();
              if (SUPPORTED_EXTS.includes(ext || '')) {
                  try {
                      const data = await tauri.fs.readBinaryFile(filePath);
                      
                      let mime = 'image/jpeg';
                      if(ext === 'png') mime = 'image/png';
                      else if(ext === 'webp') mime = 'image/webp';
                      else if(ext === 'gif') mime = 'image/gif';
                      else if(ext === 'bmp') mime = 'image/bmp';
                      
                      const file = new File([data], name, { type: mime, lastModified: Date.now() });
                      // Add webkitRelativePath simulation if possible (optional, hard in flat File constructor)
                      collectedFiles.push(file);
                  } catch (err) {
                      console.warn(`Failed to read Tauri file: ${filePath}`, err);
                      addLog(`Tauri 读取文件失败: ${name}`, 'warn', String(err));
                  }
              }
           };

           // Process all dropped paths
           for (let i = 0; i < paths.length; i++) {
              await processPath(paths[i]);
              setImportProgress(Math.round(((i + 1) / paths.length) * 100));
           }

           if (collectedFiles.length > 0) {
               await handleFilesAddedRef.current(collectedFiles);
           } else {
               showNotification("未找到支持的图片文件", 'error');
           }
           
           setIsImporting(false);
           setImportProgress(0);
        });
      } catch (e) {
        console.error("Failed to setup Tauri drop listener", e);
      }
    };

    setupTauriDrop();

    return () => {
       if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleGenerateTestImages = async () => {
    setShowInfo(false); // Close modal to show progress
    showNotification(`正在生成 ${testSettings.count} 张测试图片...`, "success");
    addLog(`开始生成压力测试数据: ${testSettings.count} 张, ${testSettings.resolution}px`, "info");
    
    const dummyFiles: File[] = [];
    const width = testSettings.resolution;
    const height = Math.round(width * 0.75); // 4:3
    
    try {
        for (let i = 0; i < testSettings.count; i++) {
            const blob = await generateDummyImage(width, height, `Test ${i + 1} (${width}px)`);
            const file = new File([blob], `benchmark_test_${i + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
            dummyFiles.push(file);
            // Allow UI update during generation too
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        await handleFilesAdded(dummyFiles);
        showNotification("测试数据生成完成", "success");
    } catch (e) {
        console.error(e);
        showNotification("生成测试数据失败", "error");
    }
  };

  const handleAddMoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(Array.from(e.target.files));
      e.target.value = ''; // Reset
    }
  };

  const handleFolderAddChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(f => f.id !== id);
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleRemoveFiles = (ids: string[]) => {
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
    addLog(`批量移除了 ${ids.length} 个文件`, 'info');
  };

  const handleClearAll = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (files.length === 0) return;

    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setSelectedIds(new Set());
    setSkippedFiles([]);
    showNotification("列表已清空", 'success');
    addLog('清空了所有文件列表', 'info');
  };

  // Add specific handler for processing a subset of files (e.g. from a folder tab)
  const handleProcessFiles = async (filesToProcess: AppFile[]) => {
    if (isProcessing) return;
    
    // Reset stop flag
    stopProcessingRef.current = false;
    
    // Determine what to process within this scope
    // Prioritize non-success items. If all are success, re-process all.
    let queue = filesToProcess.filter(f => f.status !== 'success');
    
    if (queue.length === 0 && filesToProcess.length > 0) {
       queue = [...filesToProcess];
    }

    if (queue.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    setProcessingProgress(0);
    addLog(
        `开始处理任务`, 
        'info', 
        `文件数: ${queue.length}\n` +
        `并发数: ${config.concurrency || 1}\n` +
        `全局配置: ${config.format}, Q=${config.quality}`
    );
    
    const total = queue.length;
    let completed = 0;

    // Check concurrency setting
    const concurrency = config.concurrency || 1;

    const processedFiles: AppFile[] = [];
    
    if (concurrency === 1) {
        // Sequential Processing
        for (const file of queue) {
            if (stopProcessingRef.current) break;
            const result = await processSingleFileInternal(file);
            if (result) processedFiles.push(result);
            completed++;
            setProcessingProgress((completed / total) * 100);
        }
    } else {
        // Batch Processing (Simple Chunking)
        // Ensure concurrency is at least 2 if parallel
        const batchSize = Math.max(2, concurrency);
        
        for (let i = 0; i < queue.length; i += batchSize) {
            if (stopProcessingRef.current) break;
            const chunk = queue.slice(i, i + batchSize);
            // Process chunk in parallel
            const results = await Promise.all(chunk.map(file => processSingleFileInternal(file)));
            results.forEach(r => { if (r) processedFiles.push(r); });
            
            completed += chunk.length;
            setProcessingProgress(Math.min((completed / total) * 100, 100));
        }
    }

    setIsProcessing(false);
    
    if (stopProcessingRef.current) {
        setIsPaused(true);
        showNotification("处理已暂停", 'success');
        addLog("用户手动暂停了处理任务", "warn");
    } else {
        setIsPaused(false);
        showNotification("处理完成！", 'success');
        // 处理完成，用户可以手动选择导出方式
        addLog("所有任务处理完成", "success");
    }
  };

  const toggleProcessing = () => {
      if (isProcessing) {
          // Trigger stop
          stopProcessingRef.current = true;
      } else {
          // Resume or Start
          handleBatchProcess();
      }
  };

  const handleProcessSingle = async (file: AppFile) => {
    if (isProcessing) return;
    await processSingleFileInternal(file);
  };

  const handleDownloadSingle = async (file: AppFile) => {
    if (!file.processedBlob) return;
    
    const mime = file.processedBlob.type;
    const ext = getExtensionFromMime(mime);
    
    const originalName = file.file.name;
    const namePart = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    
    const suffix = config.filenameSuffix || '';
    const finalName = `${namePart}${suffix}.${ext}`;
    
    await saveFile(file.processedBlob, finalName);
  };
  const handleDownloadAll = async (interactive: boolean = true, filesToExport?: AppFile[]) => {
    // @ts-ignore
    const tauri = window.__TAURI__;
    if (!tauri) {
      showNotification('自动导出功能仅在桌面版可用', 'warn');
      return;
    }

    // 使用传入的文件列表或从状态中获取
    const successFiles = (filesToExport || files).filter(f => f.status === 'success' && f.processedBlob);
    if (successFiles.length === 0) {
      showNotification('没有可导出的文件', 'warn');
      return;
    }

    const fs = tauri.fs;
    const path = tauri.path;
    const dialog = tauri.dialog;
    
    if (!fs || !path || !dialog) {
      showNotification('文件系统API不可用', 'error');
      addLog('文件系统API不可用', 'error', '请检查 Tauri 权限配置');
      return;
    }

    // 让用户选择导出目录
    let exportDir: string | null = null;
    
    // 交互模式：弹出选择对话框
    if (interactive) {
      try {
        showNotification('正在打开目录选择对话框...', 'info');
        const result = await dialog.open({
          directory: true,
          multiple: false,
          title: '选择导出目录'
        });
        
        if (result === null) {
          showNotification('用户取消了目录选择', 'warn');
          return;
        }
        
        if (Array.isArray(result)) {
          exportDir = result[0];
        } else {
          exportDir = result;
        }
      } catch (err: any) {
        console.error('打开目录对话框失败:', err);
        showNotification('打开目录对话框失败: ' + err.message, 'error');
        return;
      }

      if (!exportDir) {
        showNotification('未选择导出目录', 'warn');
        return;
      }
    }
    
    addLog(`开始导出到目录: ${exportDir}`, 'info', `模式: ${config.exportMode || 'rename'}`);

    setIsZipping(true);
    let exportedCount = 0;
    let overwrittenCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    try {
      for (const file of successFiles) {
        if (!file.processedBlob) continue;

        const mime = file.processedBlob.type;
        const ext = getExtensionFromMime(mime);
        const originalName = file.file.name;
        const namePart = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        
        let relativePath: string;
        
        if (config.exportMode === 'overwrite') {
          // 保持原始文件名
          relativePath = file.file.webkitRelativePath || originalName;
        } else {
          // 添加后缀
          const suffix = config.filenameSuffix || '_processed';
          const newName = `${namePart}${suffix}.${ext}`;
          
          if (file.file.webkitRelativePath) {
            const dir = file.file.webkitRelativePath.substring(0, file.file.webkitRelativePath.lastIndexOf('/'));
            relativePath = await path.join(dir, newName);
          } else {
            relativePath = newName;
          }
        }

        // 构建完整目标路径
        const targetPath = await path.join(exportDir, relativePath);

        try {
          // 检查是否为覆盖模式且文件已存在
          if (config.exportMode === 'overwrite') {
            try {
              await fs.readBinaryFile(targetPath);
              overwrittenCount++;
            } catch {
              // 文件不存在，正常情况
            }
          }

          const arrayBuffer = await file.processedBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await fs.writeBinaryFile(targetPath, uint8Array);
          
          exportedCount++;
        } catch (err: any) {
          console.error(`导出失败: ${targetPath}`, err);
          errorCount++;
        }
      }

      let msg = `自动导出完成: ${exportedCount}个成功`;
      if (errorCount > 0) msg += `, ${errorCount}个失败`;
      if (config.exportMode === 'overwrite' && overwrittenCount > 0) msg += ` (${overwrittenCount}个已覆盖)`;
      
      showNotification(msg, errorCount > 0 ? 'warn' : 'success');
      addLog(msg, errorCount > 0 ? 'warn' : 'success', `导出目录: ${exportDir}`);
    } catch (err: any) {
      console.error('自动导出失败', err);
      showNotification('自动导出失败', 'error');
      addLog('自动导出失败', 'error', err.message);
    } finally {
      setIsZipping(false);
    }
  };





  const handleExportZip = async () => {
    const successFiles = files.filter(f => f.status === 'success' && f.processedBlob);
    if (successFiles.length === 0) {
      showNotification('没有可导出的文件', 'error');
      return;
    }

    setIsZipping(true);
    setZipProgress(0);
    const zipStart = Date.now();
    addLog(`开始打包导出 ${successFiles.length} 个文件...`, 'info', 'ZIP导出');

    try {
      const zip = new JSZip();
      
      successFiles.forEach(f => {
        const mime = f.processedBlob!.type;
        const ext = getExtensionFromMime(mime);
        const originalName = f.file.name;
        const namePart = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        const suffix = config.filenameSuffix || '';
        const fileName = `${namePart}${suffix}.${ext}`;
        
        // 保持目录结构
        let zipPath = fileName;
        if (f.file.webkitRelativePath) {
          const dir = f.file.webkitRelativePath.substring(0, f.file.webkitRelativePath.lastIndexOf('/'));
          zipPath = `${dir}/${fileName}`;
        }
        
        zip.file(zipPath, f.processedBlob!);
      });

      const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 5 }
      }, (metadata) => {
        setZipProgress(metadata.percent);
      });

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const zipName = `图片处理结果_${dateStr}.zip`;
      
      // 获取上次保存目录
      const lastDir = loadFromStorage('lastExportDir', '');
      
      const success = await saveFile(content, zipName, lastDir);
      
      const zipDuration = Date.now() - zipStart;
      if (success) {
        // 保存这次选择的目录（这里简化处理，实际需要从Tauri返回路径）
        showNotification(`打包导出完成`, 'success');
        addLog("打包导出成功", "success", `文件名: ${zipName}
大小: ${formatBytes(content.size)}
耗时: ${zipDuration}ms`);
      } else {
        addLog("用户取消了保存", "warn", `耗时: ${zipDuration}ms`);
      }
    } catch (error: any) {
      console.error("ZIP导出失败", error);
      showNotification("打包导出失败", "error");
      addLog("打包导出失败", "error", error.message);
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };


  // --- Computed ---
  const stats = useMemo<ProcessingReport>(() => {
    const processed = files.filter(f => f.status === 'success');
    return {
      total: files.length,
      success: processed.length,
      failed: files.filter(f => f.status === 'error').length,
      totalOriginalSize: files.reduce((acc, curr) => acc + curr.originalSize, 0),
      totalProcessedSize: processed.reduce((acc, curr) => acc + (curr.processedSize || 0), 0),
      totalTime: processed.reduce((acc, curr) => acc + (curr.processingTime || 0), 0)
    };
  }, [files]);



  // Compute selected files for batch processing actions from toolbar
  const handleBatchProcess = () => {
      // Process selected files, or all if none selected
      const targetFiles = selectedIds.size > 0 
         ? files.filter(f => selectedIds.has(f.id))
         : files;
      
      handleProcessFiles(targetFiles);
  };
  
  // Render Helpers
  const renderChangelogBadge = (type: string) => {
    switch (type) {
      case 'feat':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400 shrink-0 mt-0.5 flex items-center gap-1"><Sparkles size={10} /> 新增</span>;
      case 'fix':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 shrink-0 mt-0.5 flex items-center gap-1"><Bug size={10} /> 修复</span>;
      case 'opt':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-600 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 shrink-0 mt-0.5 flex items-center gap-1"><Wrench size={10} /> 优化</span>;
      default:
        return null;
    }
  };

  return (
    <div className={`h-screen flex flex-col font-sans transition-colors duration-200 ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        multiple 
        ref={addFilesInputRef}
        onChange={handleAddMoreChange}
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"
      />
      <input 
        type="file" 
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple 
        ref={addFolderInputRef}
        onChange={handleFolderAddChange}
        className="hidden"
      />

      {/* Notifications */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-white animate-bounce-in
          ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {notification.type === 'success' ? <RefreshCcw size={18} /> : <AlertOctagon size={18} />}
          {notification.msg}
        </div>
      )}

      {/* Log Viewer Modal */}
      <LogViewer 
        logs={logs} 
        isOpen={showLogs} 
        onClose={() => setShowLogs(false)} 
        onClear={() => setLogs([])} 
      />

      {/* Preview Modal */}
      {previewFile && activePreviewUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewFile(null)}
        >
           <button 
             onClick={() => setPreviewFile(null)}
             className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
           >
             <X size={32} />
           </button>
           
           <div 
             className="relative max-w-full max-h-full flex flex-col items-center" 
             onClick={e => e.stopPropagation()}
           >
              <img 
                src={activePreviewUrl} 
                alt="Preview" 
                className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl bg-[#1e1e1e]" // dark bg for transparency
              />
              <div className="mt-4 text-white text-center">
                 <p className="font-medium text-lg">{previewFile.file.name}</p>
                 <p className="text-sm text-gray-400">
                    {previewFile.status === 'success' && previewFile.processedSize 
                      ? `${formatBytes(previewFile.processedSize)} (优化后)` 
                      : formatBytes(previewFile.originalSize)
                    }
                    {previewFile.isAnimated && <span className="ml-2 px-1.5 py-0.5 bg-yellow-500 text-black text-[10px] rounded font-bold">ANIMATED</span>}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Info Modal with Tabs */}
      {showInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
           <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
             {/* Header */}
             <div className="flex justify-between items-start px-6 pt-5 pb-0 shrink-0">
                 <div>
                   <h2 className="text-xl font-bold flex items-center gap-2 text-brand-600">
                     {APP_INFO.name} <span className="text-sm bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full border border-brand-100">{APP_INFO.version}</span>
                   </h2>
                 </div>
                 <button 
                   onClick={() => setShowInfo(false)} 
                   className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 absolute right-4 top-4"
                 >
                   <X size={20} />
                 </button>
             </div>
             
             {/* Tabs */}
             <div className="flex px-6 border-b border-gray-100 dark:border-gray-700 mt-4 space-x-6">
                <button 
                  onClick={() => setInfoTab('about')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    infoTab === 'about' 
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                   关于软件
                </button>
                <button 
                  onClick={() => setInfoTab('changelog')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    infoTab === 'changelog' 
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                   <History size={14} /> 更新日志
                </button>
                <button 
                  onClick={() => setInfoTab('testing')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    infoTab === 'testing' 
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                   <FlaskConical size={14} /> 实验室
                </button>
             </div>
             
             {/* Scrollable Body */}
             <div className="flex-1 overflow-y-auto p-6">
                {infoTab === 'about' && (
                  <div className="space-y-6">
                    {/* Description */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                       {APP_INFO.description}
                    </p>

                    {/* Features */}
                    <div>
                       <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2.5 flex items-center gap-2 text-sm">
                         <Zap size={16} className="text-amber-500 fill-amber-500/20"/> 主要功能
                       </h3>
                       <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                         {APP_INFO.features.map((feat, i) => (
                           <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2 bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 transition-colors hover:border-brand-200 dark:hover:border-brand-900 group">
                              <Check size={13} className="text-brand-500 mt-0.5 flex-shrink-0" strokeWidth={3} />
                              <span className="leading-snug">{feat}</span>
                           </li>
                         ))}
                       </ul>
                    </div>

                    {/* Tech Stack */}
                    <div>
                       <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2.5 flex items-center gap-2 text-sm">
                         <Cpu size={16} className="text-blue-500"/> 技术栈
                       </h3>
                       <div className="flex flex-wrap gap-2">
                         {APP_INFO.techStack.map((tech, i) => (
                           <span key={i} className="px-2.5 py-1 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700">
                             {tech}
                           </span>
                         ))}
                       </div>
                    </div>
                    
                    {/* Storage Management */}
                    <div className="pt-2">
                      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2.5 flex items-center gap-2 text-sm">
                         <Database size={16} className="text-gray-400" /> 本地存储管理
                      </h3>
                      
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">已用空间</span>
                          <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{formatBytes(storageSize)} / ~5MB</span>
                        </div>
                        
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-4 overflow-hidden">
                           <div 
                             className="bg-brand-500 h-1.5 rounded-full transition-all duration-500" 
                             style={{ width: `${Math.min((storageSize / (5 * 1024 * 1024)) * 100, 100)}%` }}
                           />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => handleClearCache('config')}
                            className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 shadow-sm"
                          >
                            重置配置
                          </button>
                          <button 
                            onClick={() => handleClearCache('all')}
                            className="px-3 py-2 text-xs border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors"
                          >
                            清空所有缓存
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {infoTab === 'changelog' && (
                  // Changelog Tab Content
                  <div className="pl-2">
                     <div className="flex justify-end mb-4">
                        <button 
                          onClick={handleExportChangelog}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                          title="导出为 TXT 文件"
                        >
                           <Download size={14} /> 导出记录
                        </button>
                     </div>

                     <div className="space-y-6">
                       {CHANGELOG.map((log) => (
                          <div key={log.version} className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 pb-1 last:pb-0">
                            <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-gray-800 shadow-sm"></div>
                            
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                {log.version} 
                                {log.version === APP_INFO.version && (
                                  <span className="text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded font-medium">当前</span>
                                )}
                              </h3>
                              <span className="text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded">{log.date}</span>
                            </div>
                            
                            <ul className="space-y-1">
                              {log.changes.map((item, i) => (
                                 <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                                    {renderChangelogBadge(item.type)}
                                    <span className="leading-snug pt-0.5">{item.content}</span>
                                 </li>
                              ))}
                            </ul>
                          </div>
                       ))}
                       
                       <div className="pt-4 text-center">
                          <p className="text-xs text-gray-400">更多历史版本记录...</p>
                       </div>
                     </div>
                  </div>
                )}
                
                {infoTab === 'testing' && (
                  <div className="space-y-6">
                     {/* System Info */}
                     <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                         <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <MonitorSmartphone size={16} className="text-blue-500" />
                           环境检测
                         </h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                               <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">CPU 逻辑核心数</div>
                               <div className="text-xl font-mono font-bold text-gray-800 dark:text-white">{browserCaps.cores}</div>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                               <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">WebGL Max Texture Size</div>
                               <div className="text-xl font-mono font-bold text-gray-800 dark:text-white">{browserCaps.maxTexture > 0 ? browserCaps.maxTexture : 'Unknown'}</div>
                            </div>
                         </div>
                         <p className="text-[10px] text-gray-400 mt-2">
                            * 最大纹理尺寸决定了浏览器能处理的单张图片最大分辨率。超过此限制可能导致黑屏或崩溃。
                         </p>
                     </div>

                     {/* Stress Generator */}
                     <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-100 dark:border-purple-800/50">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <FlaskConical size={16} className="text-purple-500" />
                           压力测试生成器
                         </h3>
                         <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                   <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">生成数量</label>
                                   <select 
                                     value={testSettings.count}
                                     onChange={(e) => setTestSettings(s => ({...s, count: parseInt(e.target.value)}))}
                                     className="w-full text-xs p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                   >
                                      <option value="10">10 张 (轻量)</option>
                                      <option value="50">50 张 (标准)</option>
                                      <option value="100">100 张 (高压)</option>
                                      <option value="200">200 张 (极限)</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">图片分辨率 (宽)</label>
                                   <select 
                                     value={testSettings.resolution}
                                     onChange={(e) => setTestSettings(s => ({...s, resolution: parseInt(e.target.value)}))}
                                     className="w-full text-xs p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                   >
                                      <option value="1024">SD (1024px)</option>
                                      <option value="1920">HD (1920px)</option>
                                      <option value="3840">4K (3840px)</option>
                                      <option value="7680">8K (7680px - 大图预警)</option>
                                      <option value="10000">10K (极限测试)</option>
                                   </select>
                                </div>
                             </div>
                             
                             <button 
                                onClick={handleGenerateTestImages}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow-lg shadow-purple-500/20 transition-all active:scale-95"
                             >
                                生成测试数据并开始
                             </button>
                             <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70">
                                提示：选择 8K 或 10K 分辨率可以触发大图内存保护逻辑的警告。
                             </p>
                         </div>
                     </div>

                     {/* Memory Tools */}
                     <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                           <MemoryStick size={16} className="text-gray-500" />
                           内存管理
                         </h3>
                         <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                               如果有大量 ObjectURL 未释放，可能会占用浏览器内存。
                            </span>
                            <button 
                               onClick={() => {
                                   alert("垃圾回收提示已发送。浏览器会自动在空闲时回收未引用的 Blob URL。");
                               }}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <Trash2 size={12} /> 手动触发 GC 提示
                            </button>
                         </div>
                     </div>
                  </div>
                )}
             </div>

             {/* Footer - Fixed */}
             <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-center text-[10px] text-gray-400 shrink-0 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-2xl">
                本地离线处理 • 无数据上传 • 安全隐私
             </div>
           </div>
        </div>
      )}

      {/* Header - Redesigned */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-500/20 shrink-0">
             <Aperture size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white leading-none mb-0.5 whitespace-nowrap">
              {APP_INFO.name}
            </h1>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 hidden sm:inline">
                 专业离线批量处理工具
               </span>
               <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700">
                  {APP_INFO.version}
               </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           {(isProcessing || isPaused || isZipping || isImporting) && (
             <div className="flex items-center gap-3 mr-4 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2 mr-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-600 pr-3">
                    {isImporting ? <FolderInput size={14} className="text-sky-500" /> : 
                     isZipping ? <Package size={14} className="text-purple-500" /> : 
                     <Play size={14} className={isPaused ? "text-amber-500" : "text-brand-500"} />}
                    
                    <span>{isImporting ? '导入中...' : (isZipping ? '正在打包...' : (isPaused ? '已暂停' : '处理中...'))}</span>
                </div>
                <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                   <div 
                      className={`h-full transition-all duration-300 relative overflow-hidden ${
                          isImporting ? 'bg-sky-500' :
                          isZipping 
                           ? 'bg-purple-500' 
                           : isPaused 
                             ? 'bg-amber-400' 
                             : 'bg-brand-500'
                      }`}
                      style={{ width: `${isImporting ? importProgress : (isZipping ? zipProgress : processingProgress)}%` }}
                   >
                     {!isPaused && <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_1s_infinite] -translate-x-full"></div>}
                   </div>
                </div>
                <span className={`text-xs font-mono font-medium w-8 text-right ${
                    isImporting ? 'text-sky-600 dark:text-sky-400' :
                    isZipping ? 'text-purple-600 dark:text-purple-400' : 
                    'text-brand-600 dark:text-brand-400'
                }`}>
                    {Math.round(isImporting ? importProgress : (isZipping ? zipProgress : processingProgress))}%
                </span>
             </div>
           )}
           
           <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-800 pl-3">
             <button
                onClick={() => setShowLogs(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 relative"
                title="查看日志"
             >
                <ScrollText size={18} />
                {logs.some(l => l.level === 'error') && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>
                )}
             </button>
             <button 
               onClick={() => { setShowInfo(true); setInfoTab('about'); }}
               className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
               title="关于与更新日志"
             >
               <Info size={18} />
             </button>
             <button 
               onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
               className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
               title="切换主题"
             >
               {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
             </button>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-row overflow-hidden max-w-[1920px] mx-auto w-full">
        
        {/* Left: Configuration - Static Sidebar */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0 h-[calc(100vh-64px)] overflow-hidden z-20">
           <ConfigPanel 
              config={config} 
              setConfig={setConfig} 
            />
        </aside>

        {/* Center: Work Area */}
        <section className="flex-1 flex flex-col p-4 overflow-hidden bg-gray-100 dark:bg-black h-[calc(100vh-64px)]">
           
           {/* Skipped Files Alert */}
           {skippedFiles.length > 0 && (
             <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start justify-between">
                <div className="flex-1 max-h-32 overflow-y-auto">
                   <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-2">
                     <AlertOctagon size={14} /> {skippedFiles.length} 个文件未导入
                   </h4>
                   <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-1">
                      {skippedFiles.map((err, idx) => (
                        <li key={idx}><span className="font-mono bg-white/50 dark:bg-black/20 px-1 rounded">{err.name}</span>: {err.reason}</li>
                      ))}
                   </ul>
                </div>
                <button 
                  onClick={() => setSkippedFiles([])}
                  className="p-1 hover:bg-amber-100 dark:hover:bg-amber-800/50 rounded text-amber-600"
                >
                  <X size={14} />
                </button>
             </div>
           )}

           {/* Toolbar - Compact Redesign */}
           {files.length > 0 && (
           <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Left Side: Actions */}
                  <div className="flex items-center gap-2">
                       {/* Primary Process Button */}
                       <button
                         onClick={toggleProcessing}
                         disabled={isZipping}
                         className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-md shadow-sm transition-all active:scale-95 ${isZipping ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-500/30'}`}
                       >
                         {isProcessing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                         <span>{isProcessing ? '暂停' : (isPaused ? '继续' : '全部处理')}</span>
                       </button>
                       
                       {/* Clear Button - Compact */}
                       {!isProcessing && !isZipping && (
                           <button
                             onClick={handleClearAll}
                             className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-md transition-all"
                             title="清空列表"
                           >
                             <Trash2 size={16} />
                             <span>清空</span>
                           </button>
                       )}

                       {/* Divider */}
                       <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block"></div>
                       
                       {/* Add Buttons - Compact Group */}
                       {!isProcessing && !isZipping && (
                           <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/50 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                               <button 
                                  onClick={() => addFilesInputRef.current?.click()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 rounded-md transition-all shadow-sm hover:shadow"
                               >
                                  <FilePlus size={14} /> 
                                  <span>添加文件</span>
                               </button>
                               <button 
                                  onClick={() => addFolderInputRef.current?.click()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 rounded-md transition-all shadow-sm hover:shadow"
                               >
                                  <FolderInput size={14} /> 
                                  <span>添加文件夹</span>
                               </button>
                           </div>
                       )}
                  </div>
                  
                  {/* Right Side: Downloads & Stats Summary */}
                  <div className="flex items-center gap-3 ml-auto">
                     {/* Download Actions */}
                     {stats.success > 0 && !isProcessing && (
                        <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/10 p-0.5 rounded-lg border border-blue-100 dark:border-blue-800">
                           {/* 1. Download Individual */}
                           <button
                              onClick={() => handleDownloadAll(true)}
                              disabled={isZipping}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-white dark:hover:bg-gray-800 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-50"
                              title="全部下载（按原目录结构导出）"
                           >
                              <Download size={14} />
                              <span>全部下载</span>
                            </button>

                            {/* 2. Export ZIP */}
                            <button
                               onClick={handleExportZip}
                               disabled={isZipping}
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-white dark:hover:bg-gray-800 rounded-md transition-all shadow-sm hover:shadow disabled:opacity-50"
                               title="批量打包下载所有处理成功的图片"
                            >
                               {isZipping ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                               <span>打包下载</span>
                           </button>

                        </div>
                     )}
                  </div>
              </div>

              {/* Stats Bar - Simplified & Compact */}
              <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
                     <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                        总计: <span className="text-gray-700 dark:text-gray-300">{stats.total}</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        成功: <span className="text-green-600 dark:text-green-400">{stats.success}</span>
                     </div>
                     {stats.failed > 0 && (
                        <div className="flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                           失败: <span className="text-red-600 dark:text-red-400">{stats.failed}</span>
                        </div>
                     )}
                     {stats.success > 0 && (
                        <>
                           <div className="ml-auto flex gap-4">
                              <span>优化: <b className="text-brand-600 dark:text-brand-400">{formatBytes(stats.totalOriginalSize - stats.totalProcessedSize)}</b></span>
                              <span>耗时: <b className="text-gray-700 dark:text-gray-300">{(stats.totalTime / 1000).toFixed(1)}s</b></span>
                           </div>
                        </>
                     )}
                  </div>
           </div>
           )}

           {/* Drop Zone or List */}
           <div className="flex-1 overflow-hidden flex flex-col gap-3">
              {files.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                   <div className="w-full max-w-2xl transform scale-90 lg:scale-100 transition-transform">
                     <ImportZone onFilesAdded={handleFilesAdded} />
                   </div>
                </div>
              ) : (
                <FileList 
                   files={files} 
                   viewMode={viewMode} 
                   setViewMode={setViewMode} 
                   onRemove={handleRemoveFile}
                   onRemoveFiles={handleRemoveFiles}
                   onSelect={() => {}} // Legacy
                   selectedIds={selectedIds}
                   onToggleSelection={toggleSelection}
                   onSetSelection={setSelection}
                   onProcessSingle={handleProcessSingle}
                   onProcessFiles={handleProcessFiles}
                   onDownloadSingle={handleDownloadSingle}
                   onPreview={(file) => setPreviewFile(file)}
                   sortOption={sortOption}
                   onSortChange={handleSortChange}
                />
              )}
           </div>

        </section>
      </main>
    </div>
  );
}

export default App;
