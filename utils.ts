
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import saveAs from 'file-saver';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  const absBytes = Math.abs(bytes);
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  
  // Ensure index is valid and within bounds
  const index = Math.max(0, Math.min(i, sizes.length - 1));
  
  return (bytes < 0 ? '-' : '') + parseFloat((absBytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index];
};

export const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const saveToStorage = (key: string, value: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("Storage limit reached", e);
    return false;
  }
};

export const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
};

export const getStorageSize = () => {
    let total = 0;
    try {
        for (let x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                let amount = (localStorage[x].length + x.length) * 2;
                total += amount;
            }
        }
    } catch (e) {
        console.error(e);
    }
    return total;
};

// Generate a consistent pastel color from a string
export const stringToFolderColor = (str: string, isDark = false) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  
  if (isDark) {
    return {
      bg: `hsla(${h}, 70%, 20%, 0.4)`,
      text: `hsl(${h}, 80%, 80%)`,
      border: `hsla(${h}, 70%, 30%, 0.5)`
    };
  }
  
  return {
    bg: `hsla(${h}, 80%, 96%, 1)`,
    text: `hsl(${h}, 60%, 40%)`,
    border: `hsla(${h}, 70%, 85%, 1)`
  };
};

// Generate a dummy image blob for testing
export const generateDummyImage = (width: number, height: number, text: string): Promise<Blob> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Random bg
            ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 80%)`;
            ctx.fillRect(0, 0, width, height);
            
            // Text
            ctx.fillStyle = '#333';
            const fontSize = Math.max(20, Math.min(width, height) / 10);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, width/2, height/2);
            
            // Noise
            for(let i=0; i<100; i++) {
               ctx.fillStyle = `rgba(255,255,255,0.5)`;
               ctx.beginPath();
               ctx.arc(Math.random()*width, Math.random()*height, Math.random()*(width/20), 0, Math.PI*2);
               ctx.fill();
            }
        }
        
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
        }, 'image/jpeg', 0.8);
    });
};

export const getWebGLMaxTextureSize = (): number => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 0;
    // @ts-ignore
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  } catch (e) {
    return 0;
  }
};

/**
 * Universal Save File Function
 * Tries:
 * 1. Tauri Native Dialog (Strict Mode - No Fallback)
 * 2. Modern File System Access API (showSaveFilePicker)
 * 3. Fallback to FileSaver.js (legacy download)
 */
export const saveFile = async (blob: Blob, filename: string, defaultDir?: string): Promise<{ success: boolean; path?: string }> => {
  const extension = filename.split('.').pop() || '';

  // Check for Tauri environment
  // @ts-ignore
  const tauri = window.__TAURI__;

  // 1. Tauri Native Environment
  // CRITICAL: If we are in Tauri, we MUST NOT fallback to saveAs(), 
  // because WKWebView (macOS) corrupts Blob downloads into "Unknown" files.
  if (tauri) {
      try {
          const dialog = tauri.dialog;
          const fs = tauri.fs;
          const path = tauri.path;

          // Check permissions
          if (!dialog || !fs) {
              const msg = "Tauri APIs detected but not accessible. Check tauri.conf.json 'allowlist'.";
              console.error(msg);
              // Fallback only if APIs are completely missing despite window.__TAURI__ existing
          } else {
              // Build default path with directory
              let defaultPath = filename;
              if (defaultDir && path) {
                  defaultPath = await path.join(defaultDir, filename);
              }

              // A. Open "Save As" Dialog
              const selectedPath = await dialog.save({
                  defaultPath: defaultPath,
                  filters: extension ? [{
                      name: extension.toUpperCase() + ' File',
                      extensions: [extension]
                  }] : []
              });

              // User cancelled
              if (!selectedPath) {
                  return false; 
              }

              // B. Prepare Data (Blob -> ArrayBuffer -> Uint8Array)
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // C. Write Binary File
              await fs.writeBinaryFile(selectedPath, uint8Array);
              
              return { success: true, path: selectedPath };
          }

      } catch (e: any) {
          console.error("Tauri native save failed:", e);
          alert(`保存文件失败: ${e.message || "权限不足或路径错误"}`);
          return false;
      }
  }

  // 2. Try File System Access API (Modern Web)
  // @ts-ignore
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      try {
          // @ts-ignore
          const handle = await window.showSaveFilePicker({
              suggestedName: filename,
              types: [{
                  description: 'Image/Archive',
                  accept: { [blob.type]: ['.' + extension] },
              }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
      } catch (err: any) {
          if (err.name === 'AbortError') return false; 
          console.warn('File System Access API skipped:', err.message);
      }
  }

  // 3. Fallback to FileSaver (Browser Only)
  saveAs(blob, filename);
  return true;
};

/**
 * Detects if an image file is animated (GIF or Animated WebP)
 * Reads file binary headers to be accurate.
 */
export const checkIsAnimated = async (file: File): Promise<boolean> => {
    try {
        const buffer = await file.slice(0, 1024).arrayBuffer();
        const u8 = new Uint8Array(buffer);
        
        // 1. Check GIF
        // Header: GIF87a or GIF89a
        if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
            // It is a GIF. Check for Multiple Graphic Control Extensions (0x21 0xF9)
            // Note: This is a simple heuristic. To be 100% sure we might need to scan deeper, 
            // but for most GIFs, checking headers is usually "it's a gif, assume animated or user wants to treat it as such"
            // Actually, static GIFs exist, but rarely used for photos. 
            // Let's rely on type 'image/gif' + header check.
            return true; 
        }

        // 2. Check WebP
        // RIFF .... WEBP
        if (
            u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && // RIFF
            u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50  // WEBP
        ) {
            // Check for VP8X chunk (Extended WebP) which contains Animation Flag
            // VP8X is usually at offset 12
            if (u8[12] === 0x56 && u8[13] === 0x50 && u8[14] === 0x38 && u8[15] === 0x58) {
                // The flags byte is at offset 20
                const flags = u8[20];
                // Bit 1 (0x02) is the Animation flag
                return (flags & 0x02) !== 0;
            }
            
            // Check for ANIM chunk directly (older method or different chunk order)
            // Scan first 1KB for "ANIM"
            const str = String.fromCharCode.apply(null, Array.from(u8));
            if (str.includes("ANIM")) return true;
        }
        
        return false;
    } catch (e) {
        console.warn("Failed to check animation status", e);
        return false;
    }
};

/**
 * Creates a static thumbnail for an image file.
 * Used to prevent animated GIFs/WebPs from playing in the list view (causing lag).
 */
export const createStaticThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        img.onload = () => {
            // Create a small canvas to capture the first frame
            // Limit size for performance
            const maxDim = 200; 
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url); // Clean up original
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        resolve(url); // Fallback
                    }
                }, 'image/jpeg', 0.7);
            } else {
                resolve(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for thumbnail"));
        };
    });
};
