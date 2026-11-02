/**
 * 从原图里抠 EXIF（只取 TIFF 结构），交给 Rust 侧直接写进 JPEG。
 *
 * 为什么不用 piexifjs：它走的是 DataURL 路线，每张图要做三次
 *「File → base64 字符串 → 改字符串 → base64 → Blob」，5MB 的图会多产生约 20MB
 * 字符串垃圾，是千张批处理时的内存与耗时大头之一。
 *
 * 这里只做两件字节级的事：
 * 1. 在 JPEG 段表里找到 APP1 的 "Exif\0\0" 段，取出后面的 TIFF 结构；
 * 2. 把 Orientation(0x0112) 改成 1 —— 旋转已经被 canvas 烘焙进像素了，
 *    不置 1 会导致看图软件再转一次（双旋转）。
 */

/** "Exif\0\0" */
const EXIF_PREFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

const ORIENTATION_TAG = 0x0112;

/**
 * 读前 N 字节。
 * 老 WebView / jsdom 的 Blob 没有 `arrayBuffer()`，退回 FileReader。
 */
const readHead = (blob: Blob, n: number): Promise<Uint8Array> => {
  const part = blob.slice(0, n);
  if (typeof part.arrayBuffer === 'function') {
    return part.arrayBuffer().then((buf) => new Uint8Array(buf));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('读取文件头失败'));
    reader.readAsArrayBuffer(part);
  });
};

/**
 * 取出原图的 EXIF TIFF 段（不含 "Exif\0\0" 前缀），**不修改内容**。
 * 非 JPEG、没有 EXIF、结构异常都返回 null。
 */
export async function readExifTiff(blob: Blob, maxScanBytes = 256 * 1024): Promise<Uint8Array | null> {
  if (blob.size < 4) return null;

  let head: Uint8Array;
  try {
    head = await readHead(blob, maxScanBytes);
  } catch {
    return null;
  }

  // 只认 JPEG（FF D8）
  if (head[0] !== 0xff || head[1] !== 0xd8) return null;

  let i = 2;
  while (i + 4 <= head.length) {
    if (head[i] !== 0xff) return null;
    const marker = head[i + 1];

    // 无长度字段的标记
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOS：后面是压缩数据，EXIF 不可能出现在这里
    if (marker === 0xda) break;

    const segLen = (head[i + 2] << 8) | head[i + 3];
    if (segLen < 2) return null;

    if (marker === 0xe1) {
      const start = i + 4;
      const end = i + 2 + segLen;
      if (end > head.length) return null;

      let isExif = true;
      for (let k = 0; k < EXIF_PREFIX.length; k++) {
        if (head[start + k] !== EXIF_PREFIX[k]) {
          isExif = false;
          break;
        }
      }
      if (isExif) return head.slice(start + EXIF_PREFIX.length, end);
    }

    i += 2 + segLen;
  }

  return null;
}

/**
 * 取出原图的 EXIF TIFF 段，并把 Orientation 置 1（旋转已由调用方烘焙进像素）。
 */
export async function extractExifTiff(blob: Blob, maxScanBytes = 256 * 1024): Promise<Uint8Array | null> {
  const tiff = await readExifTiff(blob, maxScanBytes);
  if (!tiff) return null;
  neutralizeOrientation(tiff);
  return tiff;
}

/**
 * 读原图的 EXIF Orientation（1–8），没有就是 1（正常方向）。
 *
 * 用途：判断能不能走「Rust 直读」——浏览器解码图片时会自动按 EXIF 转正，
 * Rust 直读不转。所以只有 orientation=1 的图才允许直读，否则两边结果不一致（图会歪）。
 */
export async function readImageOrientation(blob: Blob, maxScanBytes = 256 * 1024): Promise<number> {
  const tiff = await readExifTiff(blob, maxScanBytes);
  if (!tiff) return 1;
  return readOrientationValue(tiff) ?? 1;
}

/** 从 TIFF 里读 Orientation 的值，找不到返回 null */
export function readOrientationValue(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;

  const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d; // "MM"
  if (!little && !big) return null;

  const u16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;

  if (u16(2) !== 42) return null;

  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return null;

  const count = u16(ifd0);
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === ORIENTATION_TAG) return u16(entry + 8);
  }
  return null;
}

/**
 * 把 TIFF 里的 Orientation 改成 1（正常方向）。就地修改。
 * 找不到就原样不动 —— 有些相机不带这个 tag。
 */
export function neutralizeOrientation(tiff: Uint8Array): void {
  if (tiff.length < 8) return;

  const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d; // "MM"
  if (!little && !big) return;

  const u16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;

  if (u16(2) !== 42) return;

  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return;

  const count = u16(ifd0);
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > tiff.length) return;
    if (u16(entry) === ORIENTATION_TAG) {
      // count=1 的 SHORT，值直接存在 offset 字段的前两个字节
      if (little) {
        tiff[entry + 8] = 1;
        tiff[entry + 9] = 0;
      } else {
        tiff[entry + 8] = 0;
        tiff[entry + 9] = 1;
      }
      return;
    }
  }
}
