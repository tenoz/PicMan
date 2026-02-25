# Contributing to PicMan | 为 PicMan 贡献

Thank you for your interest in contributing to PicMan! This document provides guidelines for contributing.

感谢您对 PicMan 的贡献兴趣！本文档提供了贡献指南。

---

## Development Setup | 开发环境

### Prerequisites | 前置要求

- **Node.js**: 18+ 
- **Rust**: Latest stable (for Tauri desktop app)
- **Git**

### Installation | 安装

```bash
# Clone the repository | 克隆仓库
git clone https://github.com/yourusername/picman.git
cd picman

# Install dependencies | 安装依赖
npm install

# Run development server | 运行开发服务器
npm run dev

# Build desktop app | 构建桌面应用
npm run tauri:build
```

---

## How to Contribute | 如何贡献

### Reporting Bugs | 报告 Bug

1. Check if the bug has already been reported | 检查 Bug 是否已被报告
2. Open a new issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
3. Include detailed reproduction steps | 包含详细的复现步骤
4. Provide environment information | 提供环境信息

### Suggesting Features | 建议功能

1. Check if the feature has already been suggested | 检查功能是否已被建议
2. Open a new issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
3. Describe the use case clearly | 清晰描述使用场景

### Pull Requests | 提交代码

1. Fork the repository | Fork 仓库
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes | 进行修改
4. Commit with a clear message | 提交并写明提交信息
5. Push to your fork | 推送到你的 fork
6. Open a Pull Request | 创建 Pull Request

---

## Commit Message Guidelines | 提交信息规范

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types | 类型

- **feat**: New feature | 新功能
- **fix**: Bug fix | Bug 修复
- **docs**: Documentation changes | 文档更改
- **style**: Code style changes (formatting) | 代码格式更改
- **refactor**: Code refactoring | 代码重构
- **perf**: Performance improvements | 性能优化
- **test**: Test changes | 测试更改
- **chore**: Build process or auxiliary tool changes | 构建过程或辅助工具更改

### Examples | 示例

```
feat(watermark): add image watermark support
fix(processing): resolve memory leak in batch processing
docs(readme): update installation instructions
chore(version): bump version to v1.2.0
```

---

## Code Style | 代码风格

- **TypeScript**: Use strict mode | 使用严格模式
- **React**: Functional components with hooks | 使用函数组件和 Hooks
- **CSS**: Tailwind CSS classes | 使用 Tailwind CSS
- **Formatting**: Prettier (configuration in repo) | 使用 Prettier

---

## Questions? | 有问题？

Feel free to open a [Discussion](https://github.com/yourusername/picman/discussions) for questions.

如有问题，欢迎开启 [Discussion](https://github.com/yourusername/picman/discussions) 讨论。

---

Thank you for contributing! | 感谢您的贡献！
