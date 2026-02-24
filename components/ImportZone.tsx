
import React, { useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FolderInput } from 'lucide-react';
import { MAX_FILE_SIZE_MB } from '../constants';

interface ImportZoneProps {
  onFilesAdded: (files: File[]) => void;
}

export const ImportZone: React.FC<ImportZoneProps> = ({ onFilesAdded }) => {
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFilesAdded(acceptedFiles);
    }
  }, [onFilesAdded]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'image/bmp': ['.bmp']
    },
    noClick: true,
    noKeyboard: true
  });

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleFolderClick = () => {
    folderInputRef.current?.click();
  };

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[360px] shadow-sm
        ${isDragActive 
          ? 'border-brand-500 bg-brand-50 dark:bg-blue-900/20' 
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-500'
        }`}
    >
      <input {...getInputProps()} />
      
      {/* Hidden Folder Input */}
      <input 
        type="file" 
        ref={folderInputRef}
        // @ts-ignore
        webkitdirectory="" 
        directory=""
        multiple
        onChange={handleFolderSelect}
        className="hidden" 
      />
      
      {/* Icon Circle */}
      <div className="w-24 h-24 bg-brand-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-6 ring-8 ring-brand-50/50 dark:ring-blue-500/5 transition-colors">
        <Upload className="w-10 h-10 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
      </div>

      <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-white tracking-tight">拖拽图片到这里</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm text-sm leading-relaxed">
        支持 JPG, PNG, WebP, GIF, BMP 等主流格式<br/>
        单张图片最大支持 {MAX_FILE_SIZE_MB}MB
      </p>

      <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
        {/* Primary Action */}
        <button
          onClick={open}
          className="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium shadow-lg shadow-brand-500/30 dark:shadow-brand-500/10 transition-all flex items-center justify-center gap-2 transform active:scale-95 hover:-translate-y-0.5"
        >
          <Upload size={18} />
          选择文件
        </button>

        {/* Secondary Action - Styled to match ConfigPanel buttons */}
        <button 
          onClick={handleFolderClick}
          className="px-8 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500 rounded-xl font-medium transition-all flex items-center justify-center gap-2 transform active:scale-95 hover:-translate-y-0.5 shadow-sm dark:shadow-none"
        >
          <FolderInput size={18} />
          选择文件夹
        </button>
      </div>
    </div>
  );
};
