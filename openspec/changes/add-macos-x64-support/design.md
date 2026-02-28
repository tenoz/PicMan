## Context

PicMan 是一个基于 Tauri 的桌面应用，使用 React + Vite 构建。当前仅配置了 Apple Silicon (aarch64) 架构的构建，这在 `package.json` 中的 `bundle` 脚本以及 Tauri 的默认配置中都有体现。

Tauri 本身支持多架构构建，但需要通过正确的配置和构建参数来实现。macOS x64 (Intel) 支持需要：
1. 在 Rust 层面使用正确的 target triple (`x86_64-apple-darwin`)
2. 在 npm 脚本中添加对应的构建命令
3. 在 CI/CD 中配置双架构构建流程

## Goals / Non-Goals

**Goals:**
- 支持在 Intel Mac 上本地构建和运行 PicMan
- 提供统一的 npm 脚本支持双架构构建
- 配置 GitHub Actions 自动构建并发布双架构 DMG
- 更新文档说明双架构支持

**Non-Goals:**
- 修改应用功能代码（纯构建配置变更）
- 支持 Universal Binary（单文件双架构，需要额外复杂度）
- Windows 或 Linux 架构支持（不在本次范围）

## Decisions

### 1. 分离的架构构建 vs Universal Binary
**Decision**: 使用分离的 DMG 文件（`PicMan_1.2.0_x64.dmg` 和 `PicMan_1.2.0_aarch64.dmg`），而非 Universal Binary。

**Rationale**:
- Universal Binary 需要将两个架构的二进制合并，构建流程更复杂
- 分离的 DMG 文件更小，用户只下载自己需要的版本
- GitHub Releases 原生支持多资源上传，用户体验良好
- Tauri 官方推荐此方式用于简单场景

**Alternative Considered**: Universal Binary - 适合需要单文件分发的场景，但增加了构建复杂度

### 2. 本地构建 vs CI 构建
**Decision**: 同时支持本地构建和 CI 构建

**Rationale**:
- 开发者需要能在本地测试特定架构
- CI 构建确保发布的一致性
- Tauri CLI 支持 `--target` 参数，易于实现

### 3. npm 脚本设计
**Decision**: 保留现有 `bundle` 脚本（默认 aarch64），新增 `bundle:x64` 和 `bundle:all` 脚本

**Rationale**:
- 向后兼容：现有流程不受影响
- 清晰命名：`bundle:x64` 明确表示 x64 架构
- 批量构建：`bundle:all` 一次性构建两个架构

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Rust target 未安装导致构建失败 | 在文档中说明需要运行 `rustup target add x86_64-apple-darwin` |
| 构建时间翻倍 | CI 中使用矩阵构建并行化；本地开发仍使用单架构 |
| 发布流程复杂度增加 | 使用 GitHub Actions 自动化，减少人工操作 |
| 用户下载错误架构版本 | 在 Release 页面明确标注文件名中的架构信息 |

## Migration Plan

1. **Phase 1**: 本地验证
   - 安装 x86_64-apple-darwin target
   - 运行 `npm run bundle:x64` 验证构建成功
   - 在 Intel Mac 上测试 DMG

2. **Phase 2**: CI 配置
   - 更新 GitHub Actions 工作流
   - 配置矩阵构建策略
   - 测试 Release 发布流程

3. **Phase 3**: 文档更新
   - 更新 README 架构支持说明
   - 更新 CONTRIBUTING 开发指南

## Open Questions

- 是否需要在应用内显示当前架构信息？（对调试有用，但非必需）
