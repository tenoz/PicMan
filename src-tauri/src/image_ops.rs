//! 图片编码相关的原生能力。
//!
//! 现阶段只做一件事：把 canvas 导出的 PNG 用 oxipng 做无损重压。
//! 浏览器 canvas 的 PNG 编码器只做最朴素的 zlib 压缩、不做 filter 策略搜索，
//! 所以产物体积明显偏大；oxipng 会尝试多组 filter + 更强 deflate，通常还能再小 10–30%。
//!
//! 为什么暂不在 Rust 里做解码/缩放/水印：
//! - 水印要渲染中文，得内嵌 CJK 字体（10MB+），不值当；
//! - 像素操作交给 canvas 已经够快，瓶颈在编码质量而不是编码速度。
//! JPEG（mozjpeg）/ WebP 的接管放在下一阶段，需要「PNG 中间文件 + 路径传递」的管道。

use std::path::Path;

use serde::Serialize;

#[derive(Serialize)]
pub struct OptimizeResult {
    /// 优化前后的字节数
    pub before: u64,
    pub after: u64,
}

/// 原地优化 PNG（无损）。
///
/// `level` 对应 oxipng 的 `-o` 等级：0 最快、6 最狠。默认 2（速度与体积的平衡点），
/// 不建议默认开 zopfli —— 体积再小约 2%，速度慢一个量级。
#[tauri::command]
pub fn optimize_png(path: String, level: Option<u8>) -> Result<OptimizeResult, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("文件不存在: {path}"));
    }

    let level = level.unwrap_or(2).min(6);
    let opts = oxipng::Options::from_preset(level);

    // 原地写回（path: None），不保留 mtime —— 我们只关心内容
    let input = oxipng::InFile::from(p);
    let output = oxipng::OutFile::Path { path: None, preserve_attrs: false };

    // 出错时不破坏原文件：调用方会退回 canvas 的原始产物
    let (before, after) = oxipng::optimize(&input, &output, &opts)
        .map_err(|e| format!("oxipng 优化失败: {e}"))?;

    Ok(OptimizeResult {
        before: before as u64,
        after: after as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 96×96 RGBA，IDAT 用 zlib level 0（完全不压缩）生成 —— 留给 oxipng 去压
    const FIXTURE: &[u8] = include_bytes!("../tests/fixtures/unoptimized.png");
    const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    fn prepare(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("picman-oxipng-test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        fs::write(&path, FIXTURE).unwrap();
        path
    }

    #[test]
    fn optimize_png_shrinks_and_stays_valid() {
        let path = prepare("shrink.png");
        let before = fs::metadata(&path).unwrap().len();

        let result = optimize_png(path.to_string_lossy().to_string(), Some(2)).unwrap();

        let after = fs::metadata(&path).unwrap().len();
        let bytes = fs::read(&path).unwrap();

        assert_eq!(result.before, before, "返回的 before 应是优化前大小");
        assert_eq!(result.after, after, "返回的 after 应是优化后大小");
        assert!(after < before, "未压缩来源必须被压小: {before} -> {after}");
        assert_eq!(&bytes[..8], &PNG_SIG, "PNG 签名必须保留");
    }

    #[test]
    fn optimize_png_is_idempotent() {
        let path = prepare("twice.png");
        optimize_png(path.to_string_lossy().to_string(), Some(2)).unwrap();
        let once = fs::metadata(&path).unwrap().len();

        optimize_png(path.to_string_lossy().to_string(), Some(2)).unwrap();
        let twice = fs::metadata(&path).unwrap().len();

        assert!(twice <= once, "重复优化不应该变大: {once} -> {twice}");
    }

    #[test]
    fn optimize_png_rejects_missing_file() {
        let path = std::env::temp_dir().join("picman-not-exist-xyz.png");
        assert!(optimize_png(path.to_string_lossy().to_string(), None).is_err());
    }
}
