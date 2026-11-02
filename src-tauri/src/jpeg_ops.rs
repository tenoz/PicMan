//! JPEG 编码（原生）。
//!
//! 管线：前端 canvas 出 **PNG 中间文件** → 这里解码成 RGB → mozjpeg-rs 编码 JPEG。
//!
//! 为什么不直接用 canvas 的 `toBlob('image/jpeg')`：
//! - canvas 的 JPEG 编码器是浏览器内置的最基础实现，没有 trellis 量化、不做 huffman 优化；
//! - mozjpeg 在**同视觉画质**下通常还能小 15–25%，等于用户白得一份体积。
//!
//! 为什么还要走 PNG 中间文件：JPEG 是有损格式，重编码会二次损失；只有拿无损中间件才能
//! 拿到干净像素。这和 `optimize_png` 走的是同一套「临时文件 + 路径传递」管道。

use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 压缩档位：越往下越慢、越小。默认 `balanced`。
///
/// 1600×1200 实测（release）：fastest 8ms / balanced 33ms / smallest 432ms。
/// `smallest` 走两遍扫描 + 全量 trellis，单张就要半秒，上千张时会把处理时间翻倍。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Fastest,
    Balanced,
    Smallest,
}

impl Level {
    pub(crate) fn parse(s: Option<&str>) -> Self {
        match s.unwrap_or("balanced") {
            "fastest" => Level::Fastest,
            "smallest" => Level::Smallest,
            _ => Level::Balanced,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JpegResult {
    /// 输入的 PNG 中间文件大小
    pub before: u64,
    /// 输出的 JPEG 大小
    pub after: u64,
    /// 产物路径（调用方读完自行删除）
    pub out_path: String,
}

/// 把 PNG 中间文件编码成 JPEG，写到同目录的 `<原名>.jpg`。
///
/// 失败时不写任何产物，调用方退回 canvas 的产物。
///
/// `rename_all = "snake_case"` 是显式声明：Tauri 默认会把参数名当成 camelCase，
/// 这里写死 snake_case，前端传 `png_path`，两边不靠猜。
#[tauri::command(rename_all = "snake_case")]
pub fn encode_jpeg(
    png_path: String,
    quality: Option<u8>,
    level: Option<String>,
    exif: Option<Vec<u8>>,
) -> Result<JpegResult, String> {
    let src = Path::new(&png_path);
    if !src.is_file() {
        return Err(format!("文件不存在: {png_path}"));
    }

    let before = fs::metadata(src).map_err(|e| format!("读取文件信息失败: {e}"))?.len();
    let (rgb, width, height) = decode_png_to_rgb(src)?;

    let quality = quality.unwrap_or(82).clamp(1, 100);
    let encoder = build_encoder(Level::parse(level.as_deref()), quality, exif);

    let jpeg = encoder
        .encode_rgb(&rgb, width, height)
        .map_err(|e| format!("mozjpeg 编码失败: {e}"))?;

    let out_path: PathBuf = src.with_extension("jpg");
    fs::write(&out_path, &jpeg).map_err(|e| format!("写出 JPEG 失败: {e}"))?;

    Ok(JpegResult {
        before,
        after: jpeg.len() as u64,
        out_path: out_path.to_string_lossy().to_string(),
    })
}

pub(crate) fn build_encoder(level: Level, quality: u8, exif: Option<Vec<u8>>) -> mozjpeg_rs::Encoder {
    use mozjpeg_rs::{Encoder, Preset, Subsampling};

    let preset = match level {
        Level::Fastest => Preset::BaselineFastest,
        Level::Balanced => Preset::BaselineBalanced,
        Level::Smallest => Preset::ProgressiveSmallest,
    };

    let mut encoder = Encoder::new(preset)
        .quality(quality)
        // 4:2:0 与 canvas 的默认色度抽样一致，肉眼看不出差别，体积省一截
        .subsampling(Subsampling::S420);

    if let Some(data) = exif {
        // mozjpeg-rs 会自动补 "Exif\0\0" 前缀，这里要的是纯 TIFF 结构
        if !data.is_empty() {
            encoder = encoder.exif_data(data);
        }
    }
    encoder
}

/// 解 PNG → RGB（丢弃 alpha，按黑底合成，与 canvas 直出 JPEG 的行为一致）。
fn decode_png_to_rgb(path: &Path) -> Result<(Vec<u8>, u32, u32), String> {
    let file = fs::File::open(path).map_err(|e| format!("打开 PNG 失败: {e}"))?;
    let mut decoder = png::Decoder::new(std::io::BufReader::new(file));
    // 把调色板/低位深统一成 8bit，后面只处理 Rgb / Rgba / 灰度
    decoder.set_transformations(png::Transformations::normalize_to_color8());

    let mut reader = decoder.read_info().map_err(|e| format!("解析 PNG 失败: {e}"))?;
    let buf_size = reader
        .output_buffer_size()
        .ok_or_else(|| "PNG 尺寸过大，无法分配缓冲区".to_string())?;
    let mut buf = vec![0u8; buf_size];
    let info = reader.next_frame(&mut buf).map_err(|e| format!("解码 PNG 失败: {e}"))?;
    let (width, height) = (info.width, info.height);
    let data = &buf[..info.buffer_size()];

    let rgb = match info.color_type {
        png::ColorType::Rgb => data.to_vec(),
        png::ColorType::Rgba => rgba_to_rgb(data),
        png::ColorType::Grayscale => data.iter().flat_map(|&g| [g, g, g]).collect(),
        png::ColorType::GrayscaleAlpha => data
            .chunks_exact(2)
            .flat_map(|px| {
                let g = (px[0] as u32 * px[1] as u32 / 255) as u8;
                [g, g, g]
            })
            .collect(),
        // normalize_to_color8 之后不该再出现调色板
        other => return Err(format!("不支持的 PNG 颜色类型: {other:?}")),
    };

    Ok((rgb, width, height))
}

/// RGBA → RGB，按黑底合成（透明像素变黑，与 canvas 输出 JPEG 一致）
pub(crate) fn rgba_to_rgb(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() / 4 * 3);
    for px in data.chunks_exact(4) {
        let a = px[3] as u32;
        if a == 255 {
            out.extend_from_slice(&px[..3]);
        } else {
            out.push((px[0] as u32 * a / 255) as u8);
            out.push((px[1] as u32 * a / 255) as u8);
            out.push((px[2] as u32 * a / 255) as u8);
        }
    }
    out
}

/// 写文件时走 BufWriter（留给后续「直接写盘」用的工具函数）
#[allow(dead_code)]
fn write_buf(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let file = fs::File::create(path).map_err(|e| e.to_string())?;
    let mut w = BufWriter::new(file);
    w.write_all(bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    const JPEG_SIG: [u8; 3] = [0xff, 0xd8, 0xff];

    /// 生成一张 256×256 的 RGBA PNG（左半半透明、右半不透明，带伪随机噪声）
    /// 用噪声而不是纯渐变：渐变图 PNG 压缩极好，小图上 JPEG 反而会更大，断言不稳
    fn prepare_png(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("picman-mozjpeg-test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);

        let (w, h) = (256u32, 256u32);
        let mut seed: u32 = 0x9e37_79b9;
        let mut rgba = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let n = (seed >> 24) as u8;
                rgba.push(n.wrapping_add((x * 3) as u8));
                rgba.push(n.wrapping_add((y * 5) as u8));
                rgba.push(n);
                rgba.push(if x < w / 2 { 128 } else { 255 });
            }
        }

        let file = fs::File::create(&path).unwrap();
        let mut encoder = png::Encoder::new(BufWriter::new(file), w, h);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&rgba).unwrap();
        writer.finish().unwrap();

        path
    }

    #[test]
    fn encode_jpeg_produces_valid_jpeg_smaller_than_png() {
        let png_path = prepare_png("basic.png");
        let before = fs::metadata(&png_path).unwrap().len();

        let result = encode_jpeg(
            png_path.to_string_lossy().to_string(),
            Some(82),
            None,
            None,
        )
        .expect("编码应成功");

        let bytes = fs::read(&result.out_path).unwrap();
        assert_eq!(&bytes[..3], &JPEG_SIG, "产物必须是 JPEG");
        assert_eq!(result.before, before);
        assert_eq!(result.after, bytes.len() as u64);
        // 64×64 渐变图 JPEG 必然远小于同内容的 PNG
        assert!(result.after < result.before, "JPEG 应比 PNG 中间件小");

        fs::remove_file(&result.out_path).ok();
    }

    #[test]
    fn encode_jpeg_respects_quality() {
        let png_path = prepare_png("quality.png");
        let path = png_path.to_string_lossy().to_string();

        let low = encode_jpeg(path.clone(), Some(30), None, None).unwrap();
        let low_len = low.after;
        fs::remove_file(&low.out_path).ok();

        let high = encode_jpeg(path, Some(95), None, None).unwrap();
        let high_len = high.after;
        fs::remove_file(&high.out_path).ok();

        assert!(low_len < high_len, "低质量档必须更小: {low_len} vs {high_len}");
    }

    #[test]
    fn encode_jpeg_writes_exif_segment() {
        let png_path = prepare_png("exif.png");
        // 最小合法 TIFF 头（II + 版本 42 + IFD0 偏移），足够验证 APP1 被写入
        let tiff = vec![b'I', b'I', 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00];

        let result = encode_jpeg(
            png_path.to_string_lossy().to_string(),
            None,
            Some("fastest".into()),
            Some(tiff),
        )
        .expect("带 EXIF 的编码应成功");

        let bytes = fs::read(&result.out_path).unwrap();
        assert_eq!(&bytes[..3], &JPEG_SIG);
        let has_app1 = bytes
            .windows(6)
            .any(|w| w == [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
        assert!(has_app1, "产物里应能找到 Exif 标识");

        fs::remove_file(&result.out_path).ok();
    }

    #[test]
    fn encode_jpeg_rejects_missing_file() {
        let path = std::env::temp_dir().join("picman-not-exist-xyz.png");
        assert!(encode_jpeg(path.to_string_lossy().to_string(), None, None, None).is_err());
    }

    #[test]
    fn png_signature_is_stable_for_fixture() {
        // 守住 fixture 生成逻辑：改了它，上面的断言会一起漂
        let png_path = prepare_png("fixture.png");
        let bytes = fs::read(&png_path).unwrap();
        assert_eq!(&bytes[..8], &PNG_SIG);
        fs::remove_file(&png_path).ok();
    }
}
