/**
 * 从图片文件头读宽高 —— 不解码整张图。
 *
 * 为什么需要它：导入上千张时，原实现为了拿宽高要把每张图**全尺寸解码**进内存
 * （20MP 的图 = 80MB 位图），1118 张实测导入耗时 147 秒。头解析只读几十个字节。
 *
 * 支持：JPEG（SOF0-15）、PNG（IHDR）、GIF（87a/89a）、WebP（VP8X / VP8 / VP8L）。
 * 认不出来返回 null，由调用方回退到解码路径。
 */

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32le = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

const ascii = (b: Uint8Array, i: number, len: number) =>
  String.fromCharCode(...b.slice(i, i + len));

/** 读文件头并解析；读不到返回 null */
export async function readImageSize(file: Blob): Promise<ImageSize | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    return parseImageSize(head);
  } catch {
    return null;
  }
}

export function parseImageSize(b: Uint8Array): ImageSize | null {
  return parsePng(b) ?? parseGif(b) ?? parseJpeg(b) ?? parseWebp(b);
}

function parsePng(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  const width = (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0;
  const height = (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseGif(b: Uint8Array): ImageSize | null {
  if (b.length < 10) return null;
  const sig = ascii(b, 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseJpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // 填充字节
    if (marker === 0xff) {
      i++;
      continue;
    }
    // SOF0-15，排除 DHT(C4) / JPG(C8) / DAC(CC)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // 无长度字段的标记
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const segLen = u16be(b, i + 2);
    if (segLen < 2) return null;
    i += 2 + segLen;
  }
  return null;
}

function parseWebp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;

  const chunk = ascii(b, 12, 4);

  if (chunk === 'VP8X') {
    // flags 在 20，保留 21..23，画布宽-1 在 24..26、高-1 在 27..29（各 3 字节小端）
    const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8 ') {
    // 帧头起始码 9D 01 2A 在 23..25，宽高在 26..29（各 14 位）
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8L') {
    // 签名 0x2F 在 20，随后 14 位宽-1、14 位高-1（小端位流）
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}
