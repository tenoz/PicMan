// Re-export all custom hooks for external use
export { useFileManagement } from './useFileManagement';
export type { SortOption } from './useFileManagement';

export { useProcessing } from './useProcessing';

export { useExport } from './useExport';

export { useNotifications } from './useNotifications';
export type { LogEntry, LogLevel } from '../types';

// Migration guide for App.tsx:
//
// 1. Replace file state management:
//    BEFORE:
//      const [files, setFiles] = useState<AppFile[]>([]);
//      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
//    AFTER:
//      const { files, selectedIds, addFiles, removeFile, toggleSelection, ... } = useFileManagement();
//
// 2. Replace processing logic:
//    BEFORE:
//      const handleProcessFiles = async (filesToProcess) => { ... }
//    AFTER:
//      const { processFiles, isProcessing, progress } = useProcessing({ config });
//      // Then call: processFiles(filesToProcess)
//
// 3. Replace export logic:
//    BEFORE:
//      const handleExportZip = async () => { ... }
//    AFTER:
//      const { exportToZip, isZipping, zipProgress } = useExport();
//      // Then call: await exportToZip(files)
//
// 4. Replace notifications:
//    BEFORE:
//      const [notification, setNotification] = useState(null);
//      const [logs, setLogs] = useState<LogEntry[]>([]);
//    AFTER:
//      const { notification, logs, notify, addLog } = useNotifications();
//
// Note: Full migration should be done incrementally to avoid breaking existing functionality.