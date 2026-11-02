## 1. 本地构建配置

- [x] 1.1 在 package.json 中添加 `bundle:x64` 脚本用于 x64 架构构建
- [x] 1.2 在 package.json 中添加 `bundle:all` 脚本用于批量构建双架构
- [x] 1.3 更新现有 `bundle` 脚本为显式指定 aarch64 架构
- [ ] 1.4 本地验证 `npm run bundle:x64` 能成功生成 x64 DMG

## 2. Tauri 配置优化

- [x] 2.1 检查 src-tauri/tauri.conf.json 是否需要调整构建目标
- [x] 2.2 确认 Tauri 的 bundle 配置支持多架构输出

## 3. CI/CD 配置

- [x] 3.1 检查现有 .github/workflows 文件（如果有）
- [x] 3.2 创建或更新 GitHub Actions 工作流，添加矩阵构建策略
- [x] 3.3 配置工作流同时构建 aarch64 和 x86_64 架构
- [x] 3.4 配置自动上传双架构 DMG 到 GitHub Release

## 4. 文档更新

- [x] 4.1 更新 README.md 中的安装说明，添加 Intel Mac 支持信息
- [x] 4.2 更新 CONTRIBUTING.md 中的开发指南，说明如何构建特定架构
- [x] 4.3 在 README 中添加架构标识说明（文件名中的 aarch64/x64）

## 5. 验证测试

- [ ] 5.1 在 Apple Silicon Mac 上测试 aarch64 DMG 正常运行
- [ ] 5.2 在 Intel Mac 上测试 x64 DMG 正常运行（如有条件）
- [ ] 5.3 验证 CI 构建流程能成功生成双架构包
