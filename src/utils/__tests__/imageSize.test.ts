import { describe, it, expect } from 'vitest';
import { parseImageSize } from '../imageSize';

/** PNG：8 字节签名 + 长度 + IHDR + 宽高 */
const pngHeader = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

/** GIF：GIF89a + 宽高（小端 16 位） */
const gifHeader = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(13);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  new DataView(b.buffer).setUint16(6, w, true);
  new DataView(b.buffer).setUint16(8, h, true);
  return b;
};

/** JPEG：SOI + SOF0（精度 8 + 高 + 宽） */
const jpegHeader = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(20);
  b.set([0xff, 0xd8], 0); // SOI
  b.set([0xff, 0xc0], 2); // SOF0
  b.set([0x00, 0x11], 4); // 段长
  b[6] = 8; // 精度
  new DataView(b.buffer).setUint16(7, h);
  new DataView(b.buffer).setUint16(9, w);
  return b;
};

/** WebP(VP8X) */
const webpVp8xHeader = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const wr = w - 1;
  const hr = h - 1;
  b[24] = wr & 0xff;
  b[25] = (wr >> 8) & 0xff;
  b[26] = (wr >> 16) & 0xff;
  b[27] = hr & 0xff;
  b[28] = (hr >> 8) & 0xff;
  b[29] = (hr >> 16) & 0xff;
  return b;
};

/** WebP(VP8 有损) */
const webpVp8Header = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x20], 12); // 'VP8 '
  b.set([0x9d, 0x01, 0x2a], 23); // 帧起始码
  new DataView(b.buffer).setUint16(26, w, true);
  new DataView(b.buffer).setUint16(28, h, true);
  return b;
};

describe('parseImageSize', () => {
  it('解析 PNG IHDR', () => {
    expect(parseImageSize(pngHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('解析 GIF 头', () => {
    expect(parseImageSize(gifHeader(480, 320))).toEqual({ width: 480, height: 320 });
  });

  it('解析 JPEG SOF0', () => {
    expect(parseImageSize(jpegHeader(2400, 1600))).toEqual({ width: 2400, height: 1600 });
  });

  it('解析 WebP VP8X（可超 16383 的大图）', () => {
    expect(parseImageSize(webpVp8xHeader(4000, 3000))).toEqual({ width: 4000, height: 3000 });
  });

  it('解析 WebP VP8 有损', () => {
    expect(parseImageSize(webpVp8Header(1200, 900))).toEqual({ width: 1200, height: 900 });
  });

  it('JPEG 里夹着别的段也能找到 SOF', () => {
    const base = jpegHeader(800, 600);
    const withApp0 = new Uint8Array(base.length + 6);
    withApp0.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00], 0); // APP0，段长 4
    withApp0.set(base.slice(2), 8);
    expect(parseImageSize(withApp0)).toEqual({ width: 800, height: 600 });
  });

  it('未知格式返回 null', () => {
    expect(parseImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBeNull();
  });

  it('长度不足返回 null', () => {
    expect(parseImageSize(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});
