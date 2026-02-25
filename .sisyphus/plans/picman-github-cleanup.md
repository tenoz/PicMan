# GitHub 项目完善计划

## TL;DR

> **目标**: 完成 GitHub 项目展示的所有优化任务
> **交付物**: Git 提交、LICENSE、截图占位、Issue 模板、GitHub Release 准备
> **预计工时**: 10-15 分钟

---

## Context

### 已完成工作
1. ✅ PicMan v1.2.0 打包 (DMG 已生成)
2. ✅ README.md 双语重写

### 待完成任务
1. Git 提交所有更改
2. 添加 MIT LICENSE 文件
3. 创建 .github/ISSUE_TEMPLATE
4. 添加截图到 README
5. 准备 GitHub Release

---

## Work Objectives

### Core Objective
完成所有 GitHub 项目展示的优化，使其达到可发布状态。

### Concrete Deliverables
- [ ] Git 提交: chore(release): bump version to v1.2.0
- [ ] LICENSE 文件: MIT 许可证
- [ ] .github/ISSUE_TEMPLATE/bug_report.md
- [ ] .github/ISSUE_TEMPLATE/feature_request.md
- [ ] screenshots/ 目录 + README 截图引用
- [ ] CONTRIBUTING.md (可选)

---

## TODOs

- [ ] 1. Git 提交所有更改

  **What to do**:
  - git add .
  - git commit -m "chore(release): bump version to v1.2.0
  
  - 更新所有版本号文件到 1.2.0
  - 添加 v1.2.0 更新日志
  - 更新 bundle 脚本硬编码版本
  - 重写 README.md 为双语格式"

  **Acceptance Criteria**:
  - [ ] git status 显示 clean
  - [ ] git log 显示新提交

- [ ] 2. 添加 LICENSE 文件

  **What to do**:
  - 创建 LICENSE 文件（MIT 许可证）
  - 包含版权声明和许可证全文

  **Acceptance Criteria**:
  - [ ] LICENSE 文件存在
  - [ ] 内容为标准 MIT 许可证

- [ ] 3. 创建 GitHub Issue 模板

  **What to do**:
  - 创建 .github/ISSUE_TEMPLATE/bug_report.md
  - 创建 .github/ISSUE_TEMPLATE/feature_request.md
  - 创建 .github/ISSUE_TEMPLATE/config.yml

  **Acceptance Criteria**:
  - [ ] 所有模板文件存在
  - [ ] 模板格式正确

- [ ] 4. 添加截图目录和占位

  **What to do**:
  - 创建 screenshots/ 目录
  - 添加 README_SCREENSHOTS.md 说明
  - 更新 README.md 添加截图引用占位

  **Acceptance Criteria**:
  - [ ] screenshots/ 目录存在
  - [ ] README 中有截图占位

- [ ] 5. 添加 CONTRIBUTING.md

  **What to do**:
  - 创建 CONTRIBUTING.md（双语）
  - 包含提交规范、开发流程

  **Acceptance Criteria**:
  - [ ] CONTRIBUTING.md 存在
  - [ ] 内容完整

- [ ] 6. 创建 GitHub Release 草稿

  **What to do**:
  - 创建 release-notes.md（v1.2.0）
  - 包含更新内容和安装说明

  **Acceptance Criteria**:
  - [ ] release-notes.md 存在
  - [ ] 可直接用于 GitHub Release

- [ ] 7. 最终 Git 提交

  **What to do**:
  - 提交所有新增文件
  - git push (可选，需用户确认)

  **Acceptance Criteria**:
  - [ ] 所有文件已提交
  - [ ] git status clean

---

## Success Criteria

- [ ] 所有 GitHub 项目文件完整
- [ ] README 可直接展示
- [ ] 可立即创建 GitHub Release

---

## Plan Generated
- **Plan**: picman-github-cleanup
- **Status**: Ready
