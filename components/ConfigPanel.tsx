
import React, { useRef, useState, useEffect } from 'react';
import { Settings, Info, RotateCcw, Type, Image as ImageIcon, Upload, Zap, Activity, AlertTriangle, Gauge, Layers, FlaskConical, Trash, ShieldCheck } from 'lucide-react';
import { ProcessingConfig, ResizeMode } from '../types';
import { PRESETS } from '../constants';

interface ConfigPanelProps {
  config: ProcessingConfig;
  setConfig: (c: ProcessingConfig) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, setConfig }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formatSupport, setFormatSupport] = useState<Record<string, boolean>>({
    'image/webp': true
  });

  // Check browser support
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const check = (fmt: string) => {
        canvas.toBlob((blob) => {
            // FIX: Strictly check if the returned blob type matches the requested format.
            const isSupported = blob && blob.type === fmt;
            setFormatSupport(prev => ({ ...prev, [fmt]: !!isSupported }));
        }, fmt);
    };
    check('image/webp');
  }, []);

  const handleChange = (key: keyof ProcessingConfig, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  const handleWatermarkChange = (key: keyof ProcessingConfig['watermark'], value: any) => {
    setConfig({
      ...config,
      watermark: { ...config.watermark, [key]: value }
    });
  };

  const handleResizeModeChange = (mode: ResizeMode) => {
    let newValue = config.resizeValue;
    // Auto reset to 100% when switching to Scale if value is likely pixels
    if (mode === 'scale') {
        newValue = 100;
    } else if (config.resizeMode === 'scale') {
        // Reset to default pixel width when switching away from scale
        newValue = 1920; 
    }
    setConfig({ ...config, resizeMode: mode, resizeValue: newValue });
  };

  const handleWatermarkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          handleWatermarkChange('imageSrc', e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-base font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
          <Settings size={18} className="text-brand-500" />
          全局设置
        </h3>
      </div>
      
      {/* Format & Quality */}
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">输出格式</label>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['image/jpeg', 'image/png', 'image/webp'] as const).map((fmt) => {
               const label = fmt.split('/')[1].toUpperCase();
               return (
                  <button
                    key={fmt}
                    onClick={() => handleChange('format', fmt)}
                    className={`px-2 py-1.5 text-xs font-bold rounded border transition-all ${
                      config.format === fmt
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label === 'JPEG' ? 'JPG' : label}
                  </button>
               );
            })}
          </div>
          
          {/* Metadata / EXIF Toggle - Only visible for JPEG */}
          {config.format === 'image/jpeg' && (
             <div className="flex items-center justify-between pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">保留 EXIF 信息</span>
                <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                  <input 
                    type="checkbox" 
                    checked={!config.stripExif}
                    onChange={(e) => handleChange('stripExif', !e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
             </div>
          )}
        </div>

        {/* Divider added here */}
        <div className="border-t border-gray-100 dark:border-gray-700"></div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            {/* Renamed label to 压缩质量 */}
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">压缩质量</label>
            <span className="text-xs font-mono text-brand-600 dark:text-brand-400">{Math.round(config.quality * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0.1" 
            max="1" 
            step="0.05"
            value={config.quality}
            onChange={(e) => handleChange('quality', parseFloat(e.target.value))}
            className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
          />
        </div>

        {/* Resize */}
        <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">尺寸调整</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(['original', 'fixed_width', 'fixed_height', 'scale'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleResizeModeChange(mode)}
                className={`px-2 py-1.5 text-xs rounded border transition-all ${
                  config.resizeMode === mode
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-transparent border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {{
                  original: '原尺寸',
                  fixed_width: '固定宽度',
                  fixed_height: '固定高度',
                  scale: '缩放比例'
                }[mode]}
              </button>
            ))}
          </div>
          
          {config.resizeMode !== 'original' && (
             <div className="mt-2">
                {config.resizeMode === 'scale' ? (
                  <div className="bg-gray-50 dark:bg-gray-900/40 p-2 rounded border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">比例</span>
                      <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400">{config.resizeValue}%</span>
                    </div>
                    <input 
                        type="range" min="1" max="100" step="1"
                        value={config.resizeValue}
                        onChange={(e) => handleChange('resizeValue', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500 dark:bg-gray-700 mb-2"
                    />
                    <div className="flex gap-1">
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          onClick={() => handleChange('resizeValue', pct)}
                          className={`flex-1 py-0.5 text-[10px] border rounded ${
                            config.resizeValue === pct 
                            ? 'bg-brand-600 text-white border-brand-600' 
                            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="number" 
                      value={config.resizeValue}
                      onChange={(e) => handleChange('resizeValue', parseInt(e.target.value))}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-1.5 text-xs focus:border-brand-500 outline-none text-gray-900 dark:text-gray-100"
                    />
                    <span className="absolute right-2 top-1.5 text-xs text-gray-400">px</span>
                  </div>
                )}
             </div>
          )}
        </div>

        {/* Rotate/Flip */}
        <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <div className="flex justify-between items-center">
             <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">旋转 / 翻转</label>
             <span className="text-[10px] font-mono text-gray-400">当前: {config.rotate || 0}°</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[90, 180, 0].map((angle) => (
                <button 
                  key={angle}
                  onClick={() => handleChange('rotate', angle === 0 ? 0 : ((config.rotate || 0) + angle) % 360)}
                  className="px-1 py-1.5 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-300 transition-colors"
                >
                  {angle === 0 ? '复位' : `+${angle}°`}
                </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button 
              onClick={() => handleChange('flipX', !config.flipX)}
              className={`px-1 py-1.5 border rounded text-[10px] font-medium transition-all ${
                config.flipX ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              水平翻转
            </button>
            <button 
              onClick={() => handleChange('flipY', !config.flipY)}
              className={`px-1 py-1.5 border rounded text-[10px] font-medium transition-all ${
                config.flipY ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
               垂直翻转
            </button>
          </div>
        </div>

        {/* Concurrency Setting - Relocated & Changed to Slider */}
        <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                   {/* Icon Removed Here */}
                   多线程处理
                </label>
                <span className={`text-[10px] font-mono font-bold px-1.5 rounded ${
                    config.concurrency > 1 
                    ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30' 
                    : 'text-gray-500 bg-gray-100 dark:bg-gray-700'
                }`}>
                    {config.concurrency === 1 ? '1 (串行)' : `${config.concurrency} (并发)`}
                </span>
            </div>
            
            <div className="px-1">
                <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1"
                    value={config.concurrency}
                    onChange={(e) => handleChange('concurrency', parseInt(e.target.value))}
                    className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>1 (稳定)</span>
                    <span>10 (极速)</span>
                </div>
            </div>
            
            {config.concurrency > 4 && (
                <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>过高的并发数可能导致低配置设备卡顿或浏览器崩溃，建议保持在 4 左右。</span>
                </div>
            )}
        </div>

        {/* Watermark */}
        <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">水印设置</label>
            <label className="relative inline-flex items-center cursor-pointer scale-90 origin-right">
              <input 
                type="checkbox" 
                checked={config.watermark.enabled}
                onChange={(e) => handleWatermarkChange('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {config.watermark.enabled && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-700">
               {/* Content */}
               <div className="space-y-2">
                  <div className="flex gap-2 mb-1">
                     <button 
                        onClick={() => handleWatermarkChange('type', 'text')}
                        className={`flex-1 text-[10px] py-1 flex items-center justify-center gap-1 rounded border ${config.watermark.type === 'text' ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                     >
                       <Type size={12} /> 文字
                     </button>
                     <button 
                        onClick={() => handleWatermarkChange('type', 'image')}
                        className={`flex-1 text-[10px] py-1 flex items-center justify-center gap-1 rounded border ${config.watermark.type === 'image' ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                     >
                       <ImageIcon size={12} /> 图片
                     </button>
                  </div>
                  
                  {config.watermark.type === 'text' ? (
                      <input 
                        type="text" 
                        value={config.watermark.text}
                        onChange={(e) => handleWatermarkChange('text', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400"
                        placeholder="输入水印内容..."
                      />
                  ) : (
                      <div className="flex items-center gap-2">
                         <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleWatermarkImageUpload}
                         />
                         <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-1.5 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded text-xs text-gray-500 hover:text-brand-600 hover:border-brand-400 transition-colors flex items-center justify-center gap-2"
                         >
                            <Upload size={12} />
                            {config.watermark.imageSrc ? '更换图片' : '上传图片'}
                         </button>
                         {config.watermark.imageSrc && (
                             <div className="w-8 h-8 rounded border border-gray-200 bg-white overflow-hidden shrink-0">
                                <img src={config.watermark.imageSrc} alt="wm" className="w-full h-full object-contain" />
                             </div>
                         )}
                      </div>
                  )}
               </div>

               {/* Size & Opacity Grid */}
               <div className="grid grid-cols-2 gap-3">
                  <div>
                     <div className="flex justify-between items-center mb-1">
                       <label className="text-[10px] text-gray-500 dark:text-gray-400">{config.watermark.type === 'image' ? '缩放' : '大小'}</label>
                       <span className="text-[10px] font-mono text-gray-400">
                          {config.watermark.type === 'image' ? config.watermark.scale?.toFixed(1) : config.watermark.fontSize}
                       </span>
                     </div>
                     {config.watermark.type === 'image' ? (
                         <input 
                            type="range" min="0.1" max="2" step="0.1"
                            value={config.watermark.scale || 1}
                            onChange={(e) => handleWatermarkChange('scale', parseFloat(e.target.value))}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                        />
                     ) : (
                        <input 
                            type="range" min="12" max="200" step="2"
                            value={config.watermark.fontSize || 48}
                            onChange={(e) => handleWatermarkChange('fontSize', parseInt(e.target.value))}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                        />
                     )}
                  </div>
                  <div>
                     <div className="flex justify-between items-center mb-1">
                       <label className="text-[10px] text-gray-500 dark:text-gray-400">透明度</label>
                       <span className="text-[10px] font-mono text-gray-400">{Math.round(config.watermark.opacity * 100)}%</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.1"
                        value={config.watermark.opacity}
                        onChange={(e) => handleWatermarkChange('opacity', parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500 dark:bg-gray-700"
                      />
                  </div>
               </div>

               {/* Rotation Preset Buttons - Updated to 8 angles */}
               <div>
                  <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">旋转角度</label>
                  <div className="grid grid-cols-4 gap-1">
                     {[0, 45, 90, 135, 180, -135, -90, -45].map(angle => (
                        <button
                          key={angle}
                          onClick={() => handleWatermarkChange('rotation', angle)}
                          className={`py-1 text-[10px] rounded border ${
                            config.watermark.rotation === angle 
                            ? 'bg-brand-600 text-white border-brand-600' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          {angle}°
                        </button>
                     ))}
                  </div>
               </div>

               {/* Position */}
               <div>
                  <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">位置</label>
                  <select 
                    value={config.watermark.position}
                    onChange={(e) => handleWatermarkChange('position', e.target.value)}
                    className="w-full text-xs p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="center">居中</option>
                    <option value="tile">平铺全图</option>
                    <option value="bottom-right">右下角</option>
                     <option value="bottom-right">右下角</option>
                     <option value="bottom-left">左下角</option>
                     <option value="top-left">左上角</option>
                     <option value="top-right">右上角</option>
                   </select>
                </div>
             </div>
           )}
         </div>
         
         {/* Reset */}
         <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <button 
                 onClick={() => setConfig(PRESETS[0])}
                 className="w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs flex items-center justify-center gap-2 transition-colors"
              >
                 <RotateCcw size={12} /> 重置默认配置
              </button>
         </div>

       </div>
     </div>
   );
};
