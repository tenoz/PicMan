## ADDED Requirements

### Requirement: macOS x64 构建支持
系统 SHALL 支持为 macOS Intel (x86_64) 平台构建 PicMan 桌面应用。

#### Scenario: 开发者构建 x64 版本
- **WHEN** 开发者在 macOS 上运行 `npm run bundle:x64`
- **THEN** 系统成功生成 `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/PicMan_*_x64.dmg`

#### Scenario: CI 构建双架构
- **WHEN** CI 流程触发构建
- **THEN** 系统同时生成 aarch64 和 x86_64 两个架构的 DMG 文件
- **AND** 两个 DMG 都成功上传到 GitHub Release

### Requirement: 架构目标配置
系统 SHALL 允许通过 npm 脚本指定目标架构进行构建。

#### Scenario: 构建指定架构
- **WHEN** 开发者运行 `npm run bundle:x64`
- **THEN** 使用 `x86_64-apple-darwin` 目标进行构建

- **WHEN** 开发者运行 `npm run bundle`（默认）
- **THEN** 保持现有行为，构建 `aarch64-apple-darwin` 目标

#### Scenario: 批量构建所有架构
- **WHEN** 开发者运行 `npm run bundle:all`
- **THEN** 系统依次构建 aarch64 和 x86_64 两个架构
