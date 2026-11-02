//! 直读原图转码：Rust 直接从磁盘读原图 → 解码 → mozjpeg 编码。
//!
//! 为什么要有这条路：走 canvas 的话，前端必须先 `canvas.toBlob('image/png')` 出中间件，
//! 再把这几 MB 的 PNG 通过 IPC 写进临时文件（Tauri v1 把 `Uint8Array` 当 JSON 数组序列化，
//! 2.88MB 光写盘就要 349ms），Rust 才拿得到像素。而原图本来就在磁盘上——
//! 直接读、直接解码，这两步全省掉。
//!
//! 前提：原图没有经过任何编辑（旋转/缩放/水印）。有编辑的仍然走 canvas，因为那些操作
//! 只有前端能做（水印要中文字体，缩放/旋转的视觉结果也要跟预览一致）。

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::jpeg_ops::{build_encoder, rgba_to_rgb, Level};

/// 单张上限：1 亿像素。超过基本是解压炸弹或不是图片，直接拒掉省得 OOM
const MAX_PIXELS: u64 = 100_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscodeResult {
    /// 原图字节数
    pub before: u64,
    /// 产物字节数
    pub after: u64,
    /// 产物路径（调用方读完自行删除）
    pub out_path: String,
}

/// 从原图直接转码成 JPEG。
///
/// 失败时不留下任何产物，调用方退回 canvas 路径。
#[tauri::command(rename_all = "snake_case")]
pub fn transcode_to_jpeg(
    src_path: String,
    out_dir: String,
    quality: Option<u8>,
    level: Option<String>,
    exif: Option<Vec<u8>>,
) -> Result<TranscodeResult, String> {
    let src = Path::new(&src_path);
    if !src.is_file() {
        return Err(format!("文件不存在: {src_path}"));
    }
    let before = fs::metadata(src)
        .map_err(|e| format!("读取文件信息失败: {e}"))?
        .len();

    let reader = image::ImageReader::open(src)
        .map_err(|e| format!("打开图片失败: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("识别图片格式失败: {e}"))?;

    // 先看尺寸再解码，避免超大图直接把内存吃穿
    let (width, height) = match reader.into_dimensions() {
        Ok((w, h)) => (w, h),
        Err(e) => return Err(format!("读取图片尺寸失败: {e}")),
    };
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(format!("图片过大（{width}×{height}），改用内置编码"));
    }

    // 重新打开一次解码（into_dimensions 消耗了 reader）
    let img = image::ImageReader::open(src)
        .map_err(|e| format!("打开图片失败: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("识别图片格式失败: {e}"))?
        .decode()
        .map_err(|e| format!("解码失败: {e}"))?;

    // JPEG 没有 alpha 通道：带透明的图按黑底合成，跟 canvas 直接出 JPEG 的行为一致
    let rgb: Vec<u8> = if img.color().has_alpha() {
        rgba_to_rgb(img.to_rgba8().as_raw())
    } else {
        img.to_rgb8().into_raw()
    };

    let quality = quality.unwrap_or(82).clamp(1, 100);
    let encoder = build_encoder(Level::parse(level.as_deref()), quality, exif);
    let jpeg = encoder
        .encode_rgb(&rgb, width, height)
        .map_err(|e| format!("mozjpeg 编码失败: {e}"))?;

    let dir = PathBuf::from(&out_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败: {e}"))?;
    let out_path = dir.join(format!(
        "transcode-{}-{}.jpg",
        std::process::id(),
        unique_suffix()
    ));

    fs::write(&out_path, &jpeg).map_err(|e| format!("写出 JPEG 失败: {e}"))?;

    Ok(TranscodeResult {
        before,
        after: jpeg.len() as u64,
        out_path: out_path.to_string_lossy().to_string(),
    })
}

fn unique_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const JPEG_SIG: [u8; 3] = [0xff, 0xd8, 0xff];

    /// 造一张 200×150 的 PNG 原图（左半带透明）
    fn prepare_src(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("picman-transcode-test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);

        let (w, h) = (200u32, 150u32);
        let mut rgba = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                rgba.push((x * 255 / w) as u8);
                rgba.push((y * 255 / h) as u8);
                rgba.push(96);
                rgba.push(if x < w / 2 { 128 } else { 255 });
            }
        }
        image::save_buffer(&path, &rgba, w, h, image::ColorType::Rgba8).unwrap();
        path
    }

    fn out_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("picman-transcode-out");
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn transcodes_png_to_jpeg() {
        let src = prepare_src("a.png");
        let result = transcode_to_jpeg(
            src.to_string_lossy().to_string(),
            out_dir().to_string_lossy().to_string(),
            Some(82),
            None,
            None,
        )
        .expect("转码应成功");

        let bytes = fs::read(&result.out_path).unwrap();
        assert_eq!(&bytes[..3], &JPEG_SIG, "产物必须是 JPEG");
        assert_eq!(result.after, bytes.len() as u64);
        assert_eq!(result.before, fs::metadata(&src).unwrap().len());
        assert!(result.after > 0);

        fs::remove_file(&result.out_path).ok();
    }

    #[test]
    fn reencoding_keeps_quality_ordering() {
        let src = prepare_src("q.png");
        let path = src.to_string_lossy().to_string();

        let low = transcode_to_jpeg(path.clone(), out_dir().to_string_lossy().to_string(), Some(30), None, None).unwrap();
        let low_size = low.after;
        fs::remove_file(&low.out_path).ok();

        let high = transcode_to_jpeg(path, out_dir().to_string_lossy().to_string(), Some(95), None, None).unwrap();
        let high_size = high.after;
        fs::remove_file(&high.out_path).ok();

        assert!(low_size < high_size, "低质量档必须更小: {low_size} vs {high_size}");
    }

    #[test]
    fn rejects_missing_file() {
        let missing = std::env::temp_dir().join("picman-nope-xyz.png");
        assert!(transcode_to_jpeg(
            missing.to_string_lossy().to_string(),
            out_dir().to_string_lossy().to_string(),
            None,
            None,
            None
        )
        .is_err());
    }

    #[test]
    fn rejects_non_image() {
        let dir = std::env::temp_dir().join("picman-transcode-test");
        fs::create_dir_all(&dir).unwrap();
        let bogus = dir.join("not-image.png");
        fs::write(&bogus, b"this is definitely not a png").unwrap();

        assert!(transcode_to_jpeg(
            bogus.to_string_lossy().to_string(),
            out_dir().to_string_lossy().to_string(),
            None,
            None,
            None
        )
        .is_err());
    }
}
