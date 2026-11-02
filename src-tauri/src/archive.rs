//! 用本机压缩工具打包目录。
//!
//! 为什么不自己写：JSZip 要在 JS 堆里生成整包，1GB 以上的包内存峰值很高；
//! 交给系统工具（macOS 自带 `/usr/bin/ditto`）只占磁盘 IO，且支持超 4GB。
//!
//! 约定：**src 目录里的内容就是 zip 的根**（不额外套一层目录），
//! 所以 `ditto` 不加 `--keepParent`，`zip` 用 `current_dir(src) + "."`。

use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

/// 用绝对路径，别指望打包后的 app 里有完整的 PATH
const DITTO: &str = "/usr/bin/ditto";
const ZIP: &str = "/usr/bin/zip";

#[derive(Serialize)]
pub struct ZipResult {
    pub path: String,
    pub size: u64,
    /// 实际用到的工具：ditto / zip
    pub tool: String,
}

/// 把 `src` 摆到 `dest`：同卷优先硬链接（零拷贝），跨卷自动退回复制。
///
/// 为什么需要：打包 ZIP 时要先按目标结构把产物摆进临时目录。
/// 直接复制 408MB 就是白白多一次磁盘写——而产物工作目录和 ZIP 临时目录
/// 都在同一个缓存卷上，硬链接瞬间完成，`ditto` 读到的还是同一份数据。
///
/// 返回实际用的方式（"hardlink" / "copy"），方便前端记进日志。
#[tauri::command]
pub fn link_or_copy(src: String, dest: String) -> Result<String, String> {
    if !Path::new(&src).exists() {
        return Err(format!("源文件不存在: {src}"));
    }
    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    // 目标已存在时 hard_link 会 EEXIST，先清掉
    if Path::new(&dest).exists() {
        let _ = fs::remove_file(&dest);
    }

    if fs::hard_link(&src, &dest).is_ok() {
        return Ok("hardlink".into());
    }
    fs::copy(&src, &dest).map_err(|e| format!("复制失败: {e}"))?;
    Ok("copy".into())
}

#[tauri::command]
pub fn zip_directory(src: String, dest: String) -> Result<ZipResult, String> {
    let src_path = Path::new(&src);
    if !src_path.is_dir() {
        return Err(format!("源目录不存在: {src}"));
    }

    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {e}"))?;
    }

    // 先打到临时文件、成功后再原子替换。
    // 直接打 dest 的话，一旦中途失败，用户上一次的压缩包就被毁掉了——
    // 而且旧的实现是先 remove_file 再打，失败就是两头空。
    // 临时文件必须是 .zip 结尾，否则 /usr/bin/zip 会自己再补一个 .zip 上去。
    let tmp = format!("{dest}.partial.zip");
    let _ = fs::remove_file(&tmp);

    let mut tool = "ditto";
    let mut ok = run(DITTO, &["-c", "-k", "--norsrc", "--noqtn", &src, &tmp], None)
        && Path::new(&tmp).exists();

    if !ok {
        tool = "zip";
        // -0 不压缩：图片本身已是压缩数据，deflate 只烧 CPU
        let _ = fs::remove_file(&tmp);
        ok = run(ZIP, &["-0", "-r", "-q", &tmp, "."], Some(src_path))
            && Path::new(&tmp).exists();
    }

    if !ok {
        let _ = fs::remove_file(&tmp);
        return Err("系统压缩工具执行失败（ditto / zip 均不可用）".into());
    }

    // 同一文件系统内 rename 是原子的：要么换成新包，要么保持旧包
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("替换目标压缩包失败: {e}")
    })?;

    let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok(ZipResult { path: dest, size, tool: tool.to_string() })
}

fn run(bin: &str, args: &[&str], cwd: Option<&Path>) -> bool {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    match cmd.status() {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("picman-zip-test-{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn zip_directory_creates_archive_without_extra_root_folder() {
        let work = temp_dir("basic");
        let src = work.join("src");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("a.txt"), b"hello").unwrap();
        fs::write(src.join("sub/b.txt"), b"world").unwrap();

        let dest = work.join("out.zip");
        let result = zip_directory(
            src.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(Path::new(&result.path).exists(), "压缩包应该被创建");
        assert!(result.size > 0, "压缩包不应为空");
        assert!(result.tool == "ditto" || result.tool == "zip");

        // 解压校验：包内应是 a.txt / sub/b.txt，而不是 src/a.txt
        let extract = work.join("extract");
        fs::create_dir_all(&extract).unwrap();
        let ok = run("/usr/bin/ditto", &["-x", "-k", &result.path, &extract.to_string_lossy()], None);
        assert!(ok, "解压失败");
        assert!(extract.join("a.txt").exists(), "根下应有 a.txt（不应多一层 src）");
        assert!(extract.join("sub/b.txt").exists(), "子目录结构应保留");

        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn zip_directory_rejects_missing_src() {
        let err = zip_directory(
            "/tmp/picman-not-exist-dir-xyz".to_string(),
            "/tmp/picman-not-exist.zip".to_string(),
        );
        assert!(err.is_err());
    }

    #[test]
    fn zip_directory_overwrites_existing_archive() {        let work = temp_dir("overwrite");
        let src = work.join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a.txt"), b"hello").unwrap();

        let dest = work.join("out.zip");
        fs::write(&dest, b"stale").unwrap();

        let result = zip_directory(
            src.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(result.size > 5, "应该覆盖掉旧的 5 字节文件");

        let _ = fs::remove_dir_all(&work);
    }

    /// 打包失败绝不能毁掉用户上一次的包。    /// 旧实现是「先 remove_file(dest) 再打包」，失败就是两头空。
    #[test]
    fn zip_directory_keeps_existing_archive_when_it_fails() {
        let work = temp_dir("keep-old");
        let dest = work.join("out.zip");
        fs::write(&dest, b"old-archive").unwrap();

        let err = zip_directory(
            "/tmp/picman-not-exist-dir-xyz".to_string(),
            dest.to_string_lossy().to_string(),
        );
        assert!(err.is_err());
        assert_eq!(fs::read(&dest).unwrap(), b"old-archive", "失败时旧包必须原样保留");

        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn link_or_copy_puts_file_at_dest() {
        let work = temp_dir("link");
        let src = work.join("a.txt");
        fs::write(&src, b"hello").unwrap();
        let dest = work.join("out/a.txt");

        let how = link_or_copy(
            src.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(dest.exists());
        assert_eq!(fs::read(&dest).unwrap(), b"hello");
        // 同一卷上应当是硬链接；不同环境退回复制也算成功
        assert!(how == "hardlink" || how == "copy", "未知方式: {how}");

        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn link_or_copy_overwrites_existing_dest() {
        let work = temp_dir("link-over");
        let src = work.join("a.txt");
        fs::write(&src, b"new").unwrap();
        let dest = work.join("out.txt");
        fs::write(&dest, b"old").unwrap();

        link_or_copy(
            src.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(fs::read(&dest).unwrap(), b"new");
        let _ = fs::remove_dir_all(&work);
    }

    #[test]
    fn link_or_copy_rejects_missing_src() {
        let err = link_or_copy(
            "/tmp/picman-no-such-src-xyz".to_string(),
            "/tmp/picman-link-out/x.txt".to_string(),
        );
        assert!(err.is_err());
    }
}
