## Why

PicMan 当前仅支持 macOS ARM64 (Apple Silicon) 架构，而仍有大量用户使用 Intel 芯片的 Mac。为了覆盖更广泛的用户群体，需要添加对 macOS x64 (Intel) 平台的支持，让 Intel Mac 用户也能使用桌面应用版本。

## What Changes

- 添加 macOS x64 架构的构建配置
- 更新 npm 脚本支持双架构构建
- 修改 Tauri 配置以支持多目标构建
- 添加 GitHub Actions 工作流实现自动双架构打包
- 更新文档说明多架构支持

## Capabilities

### New Capabilities
- `macos-x64-build`: 为 macOS Intel 平台添加完整的构建支持，包括本地开发和 CI/CD 流程

### Modified Capabilities
- 无（此为纯构建配置变更，不涉及功能需求变更）

## Impact

- **package.json**: 添加新的 npm 脚本用于 x64 架构构建
- **src-tauri/tauri.conf.json**: 可能需要调整构建目标配置
- **.github/workflows/**: 新增或修改工作流以支持双架构构建
- **README.md**: 更新安装说明，添加 Intel Mac 支持信息
- **发布流程**: 需要同时发布两个架构的 DMG 包
