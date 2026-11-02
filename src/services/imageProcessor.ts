
import { AppFile, ProcessingConfig, WatermarkConfig } from '../types';
import { optimizePngInPlace } from './rustPng';
import { canEncodeJpegNatively, encodeJpegNatively } from './rustJpeg';
import { canTranscodeNatively, transcodeToJpeg } from './rustTranscode';
import { extractExifTiff, readImageOrientation } from '../utils/exifBytes';
import { getSrcPath } from '../utils/fileSrcPath';
// @ts-ignore
import piexif from 'piexifjs';

// Helper to convert Blob to DataURL
const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(new Error(`FileReader error: ${e.target?.error?.message || 'Unknown error'}`));
    reader.readAsDataURL(blob);
  });
};

// Helper to convert DataURL to Blob
const dataURLToBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Invalid DataURL format during Blob conversion");
  
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * 判断这张图能不能「直读原图转码」——返回磁盘路径，不能则返回 null。
 *
 * 只有同时满足下面所有条件才允许，任何一条不满足就老老实实走 canvas：
 * 目标是 JPEG、用的是原生编码、没有任何几何编辑（旋转/翻转/缩放）、没加水印、不是动图、
 * 文件有磁盘路径（只在桌面端拖放时才有）、EXIF 方向正常（浏览器会按 EXIF 转正，Rust 不会）。
 */
export const resolveDirectTranscode = async (file: AppFile, config: ProcessingConfig): Promise<string | null> => {
  if (config.format !== 'image/jpeg') return null;
  if ((config.jpegEngine ?? 'builtin') !== 'native') return null;
  if (!canTranscodeNatively()) return null;
  if (config.rotate !== 0 || config.flipX || config.flipY) return null;
  if (config.resizeMode !== 'original') return null;
  if (config.watermark.enabled) return null;
  if (file.isAnimated) return null;

  const srcPath = getSrcPath(file.file);
  if (!srcPath) return null;

  const orientation = await readImageOrientation(file.file);
  if (orientation !== 1) return null;

  return srcPath;
};

export const processImage = async (
  appFile: AppFile,
  config: ProcessingConfig
): Promise<{ blob: Blob; width: number; height: number }> => {
  
  console.debug(`[ImageProcessor] Starting: ${appFile.file.name} (ID: ${appFile.id})`);
  const t0 = performance.now();

  // 0. 直通路径：跳过 canvas 解码与 PNG 中间件，让 Rust 直接读盘转码
  const directPath = await resolveDirectTranscode(appFile, config);
  if (directPath) {
    const tDirect = performance.now();
    const exifTiff = config.stripExif ? null : await extractExifTiff(appFile.file);
    const blob = await transcodeToJpeg(directPath, {
      quality: config.quality * 100,
      level: config.jpegLevel,
      exif: exifTiff,
    });
    if (blob) {
      console.debug(`[ImageProcessor] 直读转码完成 (${(performance.now() - tDirect).toFixed(0)}ms)`);
      return {
        blob,
        width: appFile.dimensions.width,
        height: appFile.dimensions.height,
      };
    }
    // 失败就往下走 canvas，不作中断
  }

  // 1. Load Image
  let img: HTMLImageElement | null = new Image();
  img.src = appFile.previewUrl;
  
  await new Promise<void>((resolve, reject) => {
    if (img) {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load source image: ${appFile.file.name}`));
    }
  });

  if (!img) throw new Error("Image object lost reference during loading");

  // 2. Calculate Dimensions (Unrotated)
  let targetWidth = img.naturalWidth;
  let targetHeight = img.naturalHeight;
  
  console.debug(`[ImageProcessor] Original Dims: ${targetWidth}x${targetHeight}`);

  // Safety Check: Crash Prevention for Super Large Images
  // Approx 25MP limit check (e.g., 6000x4000) - just warn for now, logic could limit size later
  if (targetWidth * targetHeight > 25000000) {
      console.warn(`[ImageProcessor] High memory usage warning: Processing large image ${targetWidth}x${targetHeight}`);
  }

  if (config.resizeMode === 'fixed_width') {
    targetWidth = config.resizeValue;
    if (config.maintainAspectRatio) {
      targetHeight = (img.naturalHeight / img.naturalWidth) * targetWidth;
    }
  } else if (config.resizeMode === 'fixed_height') {
    targetHeight = config.resizeValue;
    if (config.maintainAspectRatio) {
      targetWidth = (img.naturalWidth / img.naturalHeight) * targetHeight;
    }
  } else if (config.resizeMode === 'scale') {
    const ratio = config.resizeValue / 100;
    targetWidth = img.naturalWidth * ratio;
    targetHeight = img.naturalHeight * ratio;
  }

  targetWidth = Math.max(1, Math.round(targetWidth));
  targetHeight = Math.max(1, Math.round(targetHeight));
  
  console.debug(`[ImageProcessor] Target Dims: ${targetWidth}x${targetHeight}`);

  // 3. Determine Canvas Size
  const angleInRadians = (config.rotate * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(angleInRadians));
  const absSin = Math.abs(Math.sin(angleInRadians));

  const canvasWidth = Math.ceil(targetWidth * absCos + targetHeight * absSin);
  const canvasHeight = Math.ceil(targetWidth * absSin + targetHeight * absCos);

  // 4. Create Canvas
  let canvas: HTMLCanvasElement | null = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d', { alpha: true });

  if (!ctx) {
    throw new Error("Browser does not support Canvas Context 2D. GPU acceleration might be disabled.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (config.format === 'image/jpeg' || config.format === 'image/bmp' as any) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // 6. Apply Transformations
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate(angleInRadians);
  ctx.scale(config.flipX ? -1 : 1, config.flipY ? -1 : 1);
  try {
    ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
  } catch (err) {
    throw new Error("Canvas drawImage failed. Source image might be corrupted or too large.");
  }
  ctx.restore();

  // Clear Image Reference Early
  img.src = "";
  img = null;

  // 7. Apply Watermark
  if (config.watermark.enabled) {
    console.debug(`[ImageProcessor] Applying watermark (${config.watermark.type})`);
    try {
        await drawWatermark(ctx, canvasWidth, canvasHeight, config.watermark);
    } catch (wmErr) {
        console.error("Watermark failed", wmErr);
        // We continue even if watermark fails, but log it
    }
  }

  // 8. Output Blob (Standard)
  console.debug(`[ImageProcessor] Encoding to ${config.format} (Q:${config.quality})`);
  const encodeWithCanvas = (type: string) =>
    new Promise<Blob>((resolve, reject) => {
      if (!canvas) return reject(new Error('Canvas context lost before encoding'));
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`Canvas toBlob failed for format ${type}. Browser might not support this format.`));
        },
        type,
        config.quality
      );
    });

  let resultBlob: Blob;
  /** 原生编码已经把 EXIF 写进 JPEG 了，后面就不要再走 piexifjs */
  let exifEmbeddedNatively = false;

  const useNativeJpeg =
    config.format === 'image/jpeg' && (config.jpegEngine ?? 'native') === 'native' && canEncodeJpegNatively();

  if (useNativeJpeg) {
    // 先出无损 PNG 中间件，交给 Rust 的 mozjpeg 编码（失败则下面回退 canvas）
    const pngBlob = await encodeWithCanvas('image/png');
    const exifTiff = config.stripExif ? null : await extractExifTiff(appFile.file);
    const native = await encodeJpegNatively(pngBlob, {
      quality: config.quality * 100,
      level: config.jpegLevel ?? 'balanced',
      exif: exifTiff,
    });
    if (native) {
      resultBlob = native;
      exifEmbeddedNatively = true;
    } else {
      resultBlob = await encodeWithCanvas(config.format);
    }
  } else {
    resultBlob = await encodeWithCanvas(config.format);
  }

  // 8.5 桌面端：PNG 无损重压（默认关闭 —— 实测 -o2 要 3.3s/张，只在用户主动开启时跑）
  const pngOptimize = config.pngOptimize ?? 'off';
  if (config.format === 'image/png' && pngOptimize !== 'off') {
    const tPng = performance.now();
    // fast = -o0（约 0.2s/张，省 20%）；small = -o2（约 3.3s/张，省 24%）
    resultBlob = await optimizePngInPlace(resultBlob, pngOptimize === 'small' ? 2 : 0);
    console.debug(`[ImageProcessor] PNG 无损重压(${pngOptimize}) 完成 (${(performance.now() - tPng).toFixed(0)}ms)`);
  }

  // 9. EXIF Preservation (Try-Catch wrapped for stability)
  if (!config.stripExif && config.format === 'image/jpeg' && !exifEmbeddedNatively) {
     try {
         // Only JPEG supports simple EXIF insertion via piexifjs
         // Read original file to get EXIF
         const originalDataURL = await blobToDataURL(appFile.file);
         
         // Extract EXIF
         let exifObj;
         try {
             exifObj = piexif.load(originalDataURL);
         } catch (e) {
             // console.warn("Could not read EXIF from original image");
         }

         if (exifObj) {
            // Delete Orientation to avoid double-rotation (since we baked rotation into canvas)
            // '0th' IFD, tag 274 is Orientation
            if (exifObj["0th"] && exifObj["0th"][piexif.ImageIFD.Orientation]) {
                delete exifObj["0th"][piexif.ImageIFD.Orientation];
            }
            
            const exifStr = piexif.dump(exifObj);
            
            // Read processed image as DataURL
            const resultDataURL = await blobToDataURL(resultBlob);
            
            // Insert EXIF
            const finalDataURL = piexif.insert(exifStr, resultDataURL);
            
            // Convert back to Blob
            resultBlob = dataURLToBlob(finalDataURL);
         }
     } catch (exifError: any) {
         console.error("EXIF processing failed, falling back to standard output:", exifError);
         // Log but do not fail
     }
  }

  // --- AGGRESSIVE MEMORY CLEANUP ---
  // Forcefully clear canvas dimensions and references to help GC
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
    ctx = null;
    canvas = null;
  }
  
  const t1 = performance.now();
  console.debug(`[ImageProcessor] Finished in ${(t1-t0).toFixed(0)}ms`);

  return { blob: resultBlob, width: canvasWidth, height: canvasHeight };
};

const drawWatermark = async (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wm: WatermarkConfig
) => {
  ctx.save();
  ctx.globalAlpha = wm.opacity;

  const positions: { x: number; y: number }[] = [];
  
  if (wm.position === 'tile') {
    const spacingX = width / 3; 
    const spacingY = height / 3;
    for (let x = 0; x < width; x += Math.max(150, spacingX)) {
      for (let y = 0; y < height; y += Math.max(150, spacingY)) {
         positions.push({ x: x + (y % 2 === 0 ? 0 : 50), y });
      }
    }
  } else {
    const padding = Math.min(width, height) * 0.05;
    switch (wm.position) {
      case 'top-left': positions.push({ x: padding, y: padding }); break;
      case 'top-right': positions.push({ x: width - padding, y: padding }); break;
      case 'bottom-left': positions.push({ x: padding, y: height - padding }); break;
      case 'bottom-right': positions.push({ x: width - padding, y: height - padding }); break;
      case 'center': default: positions.push({ x: width / 2, y: height / 2 }); break;
    }
  }

  let wmImg: HTMLImageElement | null = null;
  if (wm.type === 'image' && wm.imageSrc) {
    wmImg = new Image();
    wmImg.src = wm.imageSrc;
    await new Promise<void>((resolve) => {
        if (!wmImg) return resolve();
        wmImg.onload = () => resolve();
        wmImg.onerror = () => resolve();
    });
  }

  positions.forEach(pos => {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    ctx.scale(wm.scale, wm.scale);

    if (wm.type === 'text' && wm.text) {
      const baseSize = wm.fontSize || Math.min(width, height) * 0.05;
      ctx.font = `bold ${baseSize}px system-ui, sans-serif`;
      ctx.fillStyle = wm.color || '#ffffff';
      
      if (wm.position === 'center' || wm.position === 'tile') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      } else if (wm.position.includes('left')) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top'; 
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
      }
      
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(wm.text, 0, 0);

    } else if (wm.type === 'image' && wmImg) {
      const w = wmImg.width;
      const h = wmImg.height;
      ctx.drawImage(wmImg, -w/2, -h/2, w, h);
    }
    
    ctx.restore();
  });

  if (wmImg) {
      wmImg.src = "";
      wmImg = null;
  }

  ctx.restore();
};
