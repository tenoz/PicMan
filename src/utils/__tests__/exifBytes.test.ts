import { describe, it, expect } from 'vitest';
import { extractExifTiff, neutralizeOrientation, readExifTiff, readImageOrientation, readOrientationValue } from '../exifBytes';

/** 组装一个最小可用的 TIFF（II 小端，IFD0 只有 Orientation 一条） */
const tiffLittleEndian = (orientation: number): Uint8Array => {
  const t = new Uint8Array(26);
  t[0] = 0x49; t[1] = 0x49; // "II"
  t[2] = 0x2a; t[3] = 0x00; // 42
  t[4] = 0x08; t[5] = 0; t[6] = 0; t[7] = 0; // IFD0 offset = 8
  t[8] = 0x01; t[9] = 0x00; // count = 1
  // entry: tag 0x0112, type 3(SHORT), count 1, value = orientation
  t[10] = 0x12; t[11] = 0x01;
  t[12] = 0x03; t[13] = 0x00;
  t[14] = 0x01; t[15] = 0; t[16] = 0; t[17] = 0;
  t[18] = orientation; t[19] = 0; t[20] = 0; t[21] = 0;
  // next IFD = 0（t[22..26] 已是 0）
  return t;
};

/** MM 大端版本 */
const tiffBigEndian = (orientation: number): Uint8Array => {
  const t = new Uint8Array(26);
  t[0] = 0x4d; t[1] = 0x4d; // "MM"
  t[2] = 0x00; t[3] = 0x2a;
  t[4] = 0; t[5] = 0; t[6] = 0; t[7] = 0x08;
  t[8] = 0x00; t[9] = 0x01;
  t[10] = 0x01; t[11] = 0x12;
  t[12] = 0x00; t[13] = 0x03;
  t[14] = 0; t[15] = 0; t[16] = 0; t[17] = 0x01;
  t[18] = 0; t[19] = orientation; t[20] = 0; t[21] = 0;
  return t;
};

/** 把 TIFF 包成 JPEG 的 APP1 段，前面补 FFD8 */
const jpegWithExif = (tiff: Uint8Array, extraSegment?: Uint8Array): Uint8Array => {
  const prefix = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const payloadLen = prefix.length + tiff.length;
  const segLen = payloadLen + 2;

  const head: number[] = [0xff, 0xd8];
  if (extraSegment) head.push(...extraSegment);
  head.push(0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff, ...prefix);
  const out = new Uint8Array(head.length + tiff.length + 2);
  out.set(head, 0);
  out.set(tiff, head.length);
  // 补 SOS 标记，模拟真实结构
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xda;
  return out;
};

describe('extractExifTiff', () => {
  it('取出 TIFF 段，并把 Orientation 改成 1', async () => {
    const src = jpegWithExif(tiffLittleEndian(6));
    const tiff = await extractExifTiff(new Blob([src]));

    expect(tiff).not.toBeNull();
    expect(tiff!.length).toBe(26);
    // Orientation 值在本测试的 TIFF 里固定落在 offset 18
    expect(tiff![18]).toBe(1);
  });

  it('大端 TIFF 也能正确置 1', async () => {
    const src = jpegWithExif(tiffBigEndian(8));
    const tiff = await extractExifTiff(new Blob([src]));

    expect(tiff).not.toBeNull();
    expect(tiff![19]).toBe(1);
  });

  it('跳过前面的其它段（如 APP0 JFIF）后仍能定位 APP1', async () => {
    const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)]);
    const src = jpegWithExif(tiffLittleEndian(3), app0);
    const tiff = await extractExifTiff(new Blob([src]));
    expect(tiff).not.toBeNull();
    expect(tiff![18]).toBe(1);
  });

  it('非 JPEG 返回 null', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(await extractExifTiff(new Blob([png]))).toBeNull();
  });

  it('没有 EXIF 段的 JPEG 返回 null', async () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(await extractExifTiff(new Blob([plain]))).toBeNull();
  });

  it('空 Blob 返回 null', async () => {
    expect(await extractExifTiff(new Blob([]))).toBeNull();
  });
});

describe('readImageOrientation（能否走直读的判断依据）', () => {
  it('读小端 TIFF 的 Orientation', () => {
    expect(readOrientationValue(tiffLittleEndian(6))).toBe(6);
    expect(readOrientationValue(tiffLittleEndian(1))).toBe(1);
  });

  it('读大端 TIFF 的 Orientation', () => {
    expect(readOrientationValue(tiffBigEndian(8))).toBe(8);
  });

  it('包成 JPEG 后能从 Blob 读到 Orientation', async () => {
    const blob = new Blob([jpegWithExif(tiffLittleEndian(6))]);
    expect(await readImageOrientation(blob)).toBe(6);
  });

  it('没有 EXIF 时按 1（正常方向）处理', async () => {
    const plain = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])]);
    expect(await readImageOrientation(plain)).toBe(1);
  });

  it('非 JPEG 按 1 处理', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);
    expect(await readImageOrientation(png)).toBe(1);
  });

  it('readExifTiff 不改动原数据（extractExifTiff 才改）', async () => {
    const src = jpegWithExif(tiffLittleEndian(6));
    const raw = await readExifTiff(new Blob([src]));
    expect(readOrientationValue(raw as Uint8Array)).toBe(6);

    const normalized = await extractExifTiff(new Blob([src]));
    expect(readOrientationValue(normalized as Uint8Array)).toBe(1);
  });
});

describe('neutralizeOrientation', () => {
  it('找不到 Orientation 时原样不动、不抛错', () => {
    const t = new Uint8Array(26);
    t[0] = 0x49; t[1] = 0x49; t[2] = 0x2a; t[3] = 0;
    t[4] = 8; t[8] = 0; t[9] = 0; // count = 0
    const before = Array.from(t);
    expect(() => neutralizeOrientation(t)).not.toThrow();
    expect(Array.from(t)).toEqual(before);
  });

  it('字节序标记非法时不动', () => {
    const t = new Uint8Array([0x00, 0x00, 0x2a, 0x00, 8, 0, 0, 0]);
    const before = Array.from(t);
    neutralizeOrientation(t);
    expect(Array.from(t)).toEqual(before);
  });

  it('数据太短不崩', () => {
    expect(() => neutralizeOrientation(new Uint8Array([0x49, 0x49]))).not.toThrow();
  });
});
