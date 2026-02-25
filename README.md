<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🖼️ PicMan 图片侠

**一款强大的离线批量图片处理工具**<br/>
**A powerful offline batch image processing tool**

[![version](https://img.shields.io/badge/version-v1.2.0-blue)](https://github.com/yourusername/picman)
[![platform](https://img.shields.io/badge/platform-Web%20%7C%20macOS%20%7C%20Windows%20%7C%20Linux-green)](https://github.com/yourusername/picman)
[![license](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

</div>

---

## 📖 简介 | Introduction

**PicMan 图片侠** 是一款基于浏览器的离线批量图片处理工具，无需上传至服务器，所有操作均在本地完成，确保您的图片隐私安全。

**PicMan** is a browser-based offline batch image processing tool. All operations are performed locally without uploading to any server, ensuring complete privacy for your images.

- 🚀 纯前端架构，无需后端服务 | Pure frontend architecture, no backend required
- 🔒 本地离线处理，保护隐私安全 | Local offline processing, privacy protection
- ⚡ 多线程并发，处理速度快 | Multi-threaded concurrency for fast processing
- 📱 响应式设计，支持移动端 | Responsive design, mobile-friendly

---

## ✨ 功能特性 | Features

| 功能 | 描述 | Feature | Description |
|-----|------|---------|-------------|
| 🔄 批量格式转换 | 支持 JPG, PNG, WebP, AVIF 等主流格式 | Batch Format Conversion | Support JPG, PNG, WebP, AVIF and other mainstream formats |
| 📐 智能尺寸调整 | 固定宽高或按比例缩放，灵活适配 | Smart Resize | Fixed dimensions or proportional scaling |
| 🎨 自定义水印 | 支持文字与图片水印，位置、透明度可调 | Custom Watermark | Text and image watermarks with adjustable opacity |
| 🔄 批量旋转翻转 | 支持任意角度旋转与水平/垂直翻转 | Batch Rotate & Flip | Arbitrary rotation and horizontal/vertical flip |
| 📋 EXIF 管理 | 智能处理图片元数据，可选择保留或移除 | EXIF Management | Smart metadata handling, keep or strip |
| ⚡ 多线程处理 | 并发性能可调，充分利用设备性能 | Multi-threaded | Adjustable concurrency for optimal performance |
| ⏸️ 暂停/继续 | 处理过程完全可控，随时暂停恢复 | Pause/Resume | Full control during processing |
| 📁 文件夹导入 | 支持多文件夹导入，保留目录结构 | Folder Import | Multi-folder import with directory structure preserved |
| 📦 打包下载 | 结构化打包，完美保留原有层级 | Packaged Download | Structured packaging with original hierarchy |

---

## 📥 安装 | Installation

### 方式一：直接使用浏览器 | Method 1: Use in Browser

无需安装，直接在浏览器中打开即可使用。

No installation required. Simply open in your browser.

### 方式二：桌面应用 | Method 2: Desktop App

基于 Tauri 构建的桌面应用，支持 macOS、Windows、Linux。

Desktop app built with Tauri, supporting macOS, Windows, and Linux.

```bash
# 克隆仓库 | Clone repository
git clone https://github.com/yourusername/picman.git
cd picman

# 安装依赖 | Install dependencies
npm install

# 开发模式运行 | Run in development mode
npm run dev

# 构建桌面应用 | Build desktop app
npm run tauri:build

# 构建并打包 macOS DMG (Apple Silicon)
npm run bundle
```

---

## 🚀 使用指南 | Usage Guide

### 1. 导入图片 | Import Images

- 点击"导入图片"按钮或拖拽文件到页面
- 支持多文件夹导入，自动保留目录结构
- 支持格式：JPG, JPEG, PNG, WebP, GIF, BMP

Click "Import Images" or drag and drop files to the page. Multi-folder import is supported with directory structure preserved. Supported formats: JPG, JPEG, PNG, WebP, GIF, BMP.

### 2. 配置处理选项 | Configure Processing Options

- **格式转换**：选择输出格式（JPEG / PNG / WebP / AVIF）
- **质量设置**：调整压缩质量（0.1 - 1.0）
- **尺寸调整**：选择原始尺寸、固定宽高或按比例缩放
- **水印添加**：添加文字或图片水印，调整位置、透明度、旋转角度
- **旋转翻转**：设置旋转角度、水平/垂直翻转

- **Format**: Select output format (JPEG / PNG / WebP / AVIF)
- **Quality**: Adjust compression quality (0.1 - 1.0)
- **Resize**: Original size, fixed dimensions, or proportional scaling
- **Watermark**: Add text or image watermarks with adjustable position, opacity, and rotation
- **Rotate/Flip**: Set rotation angle and horizontal/vertical flip

### 3. 批量处理 | Batch Processing

- 点击"开始处理"按钮
- 处理过程中可随时暂停/继续
- 实时查看处理进度和日志

Click "Start Processing". You can pause/resume at any time. View real-time progress and logs.

### 4. 导出结果 | Export Results

- **打包下载**：将处理后的图片打包为 ZIP 下载
- **导出到源目录**：直接导出到原文件夹，支持重命名或覆盖

- **Packaged Download**: Download processed images as a ZIP file
- **Export to Source**: Direct export to original folder with rename or overwrite options

---

## 🛠️ 技术栈 | Tech Stack

| 技术 | 说明 | Technology | Description |
|-----|------|------------|-------------|
| React 19 | 用户界面框架 | React 19 | UI Framework |
| TypeScript | 类型安全的 JavaScript | TypeScript | Type-safe JavaScript |
| Tailwind CSS | 原子化 CSS 框架 | Tailwind CSS | Atomic CSS framework |
| Vite | 构建工具 | Vite | Build tool |
| Canvas API | 图片处理核心 | Canvas API | Core image processing |
| JSZip | ZIP 压缩打包 | JSZip | ZIP compression |
| FileSaver | 文件下载 | FileSaver | File download |
| Lucide Icons | 图标库 | Lucide Icons | Icon library |
| Tauri | 桌面应用框架 | Tauri | Desktop app framework |

---

## 📝 更新日志 | Changelog

### v1.2.0 (2026-02-25)

- ✨ 新增：批量文件导出功能，支持重命名或直接覆盖
- ✨ Added: Batch file export with rename or overwrite options
- ⚡ 优化：窗口关闭等行为优化
- ⚡ Improved: Window close behavior optimization

### v1.1.0 (2024-05-23)

- ✨ 新增："智能体积兜底"策略，处理后若体积增大自动保留原图
- ✨ Added: "Smart size protection" - auto-keep original if processed file is larger
- ✨ 新增：文件夹结构化打包下载，完美保留原有目录层级
- ✨ Added: Structured folder packaging, preserving original directory hierarchy
- ✨ 新增：运行日志升级，支持导出、复制、置顶
- ✨ Added: Enhanced runtime logs with export, copy, and pin features
- ✨ 新增：版本更新记录功能
- ✨ Added: Version changelog feature
- ⚡ 优化：批量处理性能，增加多线程并发控制
- ⚡ Improved: Batch processing performance with multi-threading controls
- ⚡ 优化：移除页面最小尺寸限制，优化移动端体验
- ⚡ Improved: Removed minimum page size limit for better mobile experience
- 🐛 修复：部分 WebP 图片预览加载失败问题
- 🐛 Fixed: Some WebP image preview loading issues

### v1.0.0 (2024-05-20)

- 🎉 PicMan 图片侠初始版本发布
- 🎉 PicMan initial release
- ✨ 支持 JPG, PNG, WebP, AVIF 等主流格式转换
- ✨ Support for JPG, PNG, WebP, AVIF format conversion
- ✨ 提供智能尺寸调整、旋转翻转及水印添加功能
- ✨ Smart resize, rotation/flip, and watermark features
- ✨ 纯前端本地离线处理架构
- ✨ Pure frontend offline processing architecture

---

## 📄 许可证 | License

本项目采用 [MIT](LICENSE) 许可证。

This project is licensed under the [MIT](LICENSE) License.

---

<div align="center">

**Made with ❤️ for efficient image processing**

</div>
