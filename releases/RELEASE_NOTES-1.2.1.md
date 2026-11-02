# PicMan v1.2.1 打包报告

## 打包时间
2026-06-13

## 版本信息
- **版本**: v1.2.1
- **更新内容**: 性能与稳定性修复
  - 分块 ZIP 导出（每批 50 张，防 OOM）
  - 内存压力检测（非 Chrome fallback）
  - 终止处理按钮
  - 修复外置硬盘导出权限
  - 修复导出时子目录不存在导致失败

---

## 打包版本

### 1. macOS Intel (x86_64) 版本
- **文件名**: `PicMan_1.2.1_x64.dmg`
- **文件大小**: 2.9 MB
- **支持系统**: macOS 11.0+ (Intel 处理器)
- **路径**: `releases/PicMan_1.2.1_x64.dmg`

### 2. macOS Apple Silicon (aarch64) 版本
- **文件名**: `PicMan_1.2.1_aarch64.dmg`
- **文件大小**: 2.8 MB
- **支持系统**: macOS 11.0+ (M1/M2/M3 处理器)
- **路径**: `releases/PicMan_1.2.1_aarch64.dmg`

---

## 安装说明

### Intel Mac (x86_64)
1. 下载 `PicMan_1.2.1_x64.dmg`
2. 双击打开 DMG 文件
3. 将 PicMan 拖到 Applications 文件夹
4. 从 Applications 启动 PicMan

### Apple Silicon Mac (M1/M2/M3)
1. 下载 `PicMan_1.2.1_aarch64.dmg`
2. 双击打开 DMG 文件
3. 将 PicMan 拖到 Applications 文件夹
4. 从 Applications 启动 PicMan

### 首次运行
如果系统提示"无法打开，因为 Apple 无法检查其是否包含恶意软件"：
1. 前往系统设置 → 隐私与安全
2. 点击"仍要打开"
3. 或者在终端运行：`xattr -d com.apple.quarantine /Applications/PicMan.app`

---

## 性能优化亮点

| 优化项 | 效果 |
|--------|------|
| 虚拟滚动 | 支持 1000+ 文件列表流畅滚动 |
| LRU 缓存 | 内存占用稳定，自动淘汰不常用资源 |
| 缩略图优化 | 内存占用降低 80%+ |
| 智能调度 | 根据设备性能动态调整并发数 |

---

## 文件校验

### Intel 版本 (x86_64)
- **MD5**: `5a92e60447c622b3729b852fe37eb4c3`
- **SHA256**: `81365914e8c3ea1f3d2f119309265d4674fb199aff1d8b72692eb4e039425677`

### Apple Silicon 版本 (aarch64)
- **MD5**: `866d1a37f5fbea60d096417ca91ef891`
- **SHA256**: `0f873739983b0a1fa551b8c21d6954e0c1cf026a54b392453c5c1c443d3a2e37`

### 验证方法
```bash
# 验证 Intel 版本
md5 releases/PicMan_1.2.1_x64.dmg
shasum -a 256 releases/PicMan_1.2.1_x64.dmg

# 验证 Apple Silicon 版本
md5 releases/PicMan_1.2.1_aarch64.dmg
shasum -a 256 releases/PicMan_1.2.1_aarch64.dmg
```

---

## 注意事项

1. **系统要求**: macOS 11.0 或更高版本
2. **内存建议**: 8GB 或更多（处理大批量图片时）
3. **签名状态**: 当前版本未进行代码签名，首次运行需要在系统设置中允许
4. **自动更新**: 暂不支持自动更新，请关注新版本发布

---

## 反馈与支持

如有问题或建议，请通过以下方式联系：
- GitHub Issues: https://github.com/tenoz/PicMan/issues
- 邮箱: (待补充)

---

**Enjoy PicMan! 🎉**
