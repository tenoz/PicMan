# PicMan v1.2.0 本地打包发布计划

## TL;DR

> **目标**: 将 PicMan 从 v1.1.0 更新到 v1.2.0，并完成 macOS ARM64 本地打包
>
> **交付物**:
> - 更新后的版本号（5+ 个文件）
> - v1.2.0 更新日志
> - 清理后的构建环境
> - 生成的 DMG 安装包（`PicMan_1.2.0_aarch64.dmg`）
>
> **预计工时**: Medium（15-30 分钟，主要是 Tauri 构建时间）
> **并行执行**: NO（必须顺序执行，有依赖关系）
> **关键路径**: 更新版本号 → 清理构建目录 → 执行打包 → 验证输出

---

## Context

### 原始请求
1. 更新版本为 1.2.0，在 app 里添加版本更新说明
2. 目标平台：macOS ARM64 (Apple Silicon)
3. 需要清理旧构建

### 当前项目结构
- **技术栈**: React 19 + Vite + TypeScript + Tauri 1.x + Rust
- **版本配置分散在**: 
  - `constants.ts` - 前端常量（APP_INFO.version, CHANGELOG）
  - `src-tauri/tauri.conf.json` - Tauri 包版本
  - `src-tauri/Cargo.toml` - Rust 项目版本
  - `package.json` - npm 版本（当前 0.0.0，需要同步）
- **版本显示位置**:
  - 顶栏 Logo 旁（App.tsx line 1531）- 读取 `APP_INFO.version`
  - About Modal（App.tsx line 1246）- 读取 `APP_INFO.version`
  - Changelog Tab（App.tsx line 1388）- 读取 `CHANGELOG` 数组

### 版本更新格式（参考 v1.1.0）
```typescript
{
  version: 'v1.2.0',
  date: '2026-02-25',
  changes: [
    { type: 'feat', content: '新增功能描述' },
    { type: 'opt', content: '优化描述' },
    { type: 'fix', content: '修复描述' }
  ]
}
```

---

## Work Objectives

### Core Objective
将所有版本号从 v1.1.0 更新到 v1.2.0，添加对应的更新日志，清理构建环境，生成本地 macOS ARM64 DMG 安装包。

### Concrete Deliverables
- `constants.ts` line 6: `APP_INFO.version = 'v1.2.0'`
- `constants.ts`: CHANGELOG 数组头部添加 v1.2.0 条目
- `src-tauri/tauri.conf.json` line 11: `"version": "1.2.0"`
- `src-tauri/Cargo.toml` line 4: `version = "1.2.0"`
- `package.json` line 4: `"version": "1.2.0"`
- `package.json` lines 11-12: bundle 脚本更新为 `1.2.0`
- 空的 `dist/` 和 `src-tauri/target/` 目录（已清理）
- 生成的 DMG 文件: `src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg`

### Definition of Done
- [ ] 所有版本号文件已更新并通过 grep 验证
- [ ] CHANGELOG 已添加 v1.2.0 条目
- [ ] 旧构建目录已清理
- [ ] `npm run bundle` 成功执行
- [ ] DMG 文件存在且大小 > 10MB
- [ ] （可选）应用可正常启动测试

### Must Have
- macOS ARM64 平台打包成功
- 版本号在所有位置一致（v1.2.0 / 1.2.0）
- 更新日志遵循现有格式

### Must NOT Have (Guardrails)
- 不要手动修改 `Cargo.lock`（自动生成）
- 不要手动修改 `Info.plist`（Tauri 自动生成）
- 不要提交未测试的 DMG
- 不要保留旧的 `target/release` 缓存（可能导致版本混淆）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Tauri 已配置)
- **Automated tests**: None (此任务不需要)
- **Framework**: Tauri CLI + npm scripts
- **Verification**: Agent-Executed QA 场景

### QA Policy
每个任务包含 Agent-Executed QA 场景，通过命令行工具直接验证。

---

## Execution Strategy

### Sequential Execution（必须顺序执行）

由于版本更新和构建有强依赖关系，本计划采用**顺序执行**：

```
Phase 1: 版本号更新（6 个文件，必须全部成功）
├── Task 1: 更新 constants.ts 版本号 [quick]
├── Task 2: 更新 constants.ts CHANGELOG [quick]
├── Task 3: 更新 tauri.conf.json [quick]
├── Task 4: 更新 Cargo.toml [quick]
├── Task 5: 更新 package.json 版本 [quick]
└── Task 6: 更新 package.json bundle 脚本 [quick]

Phase 2: 构建环境准备
├── Task 7: 清理旧构建目录 [quick]
└── Task 8: 验证 Rust 目标平台 [quick]

Phase 3: 执行打包
└── Task 9: 执行 Tauri 构建 [unspecified-high]

Phase 4: 输出验证
├── Task 10: 验证 DMG 文件存在 [quick]
└── Task 11: （可选）验证应用可启动 [quick]

Phase 5: 最终审查
├── Task F1: 版本一致性检查 [oracle]
└── Task F2: 文件完整性检查 [quick]
```

### Dependency Matrix

- **1**: — — 2, 3, 4, 5, 6, 7, 8
- **2**: 1 — 7, 8
- **3**: — — 7, 8
- **4**: — — 7, 8
- **5**: — — 7, 8
- **6**: 5 — 7, 8
- **7**: 1-6 — 9
- **8**: — — 9
- **9**: 7, 8 — 10, 11
- **10**: 9 — F1, F2
- **11**: 9 — F1, F2

---

## TODOs

- [ ] 1. 更新 constants.ts 版本号

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/constants.ts`
  - 将 line 6 的 `version: 'v1.1.0'` 改为 `version: 'v1.2.0'`

  **Must NOT do**:
  - 不要修改其他常量
  - 不要修改 CHANGELOG（这是下一个任务）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的单行文本替换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 2-6 并行)
  - **Parallel Group**: Phase 1 (版本更新阶段)
  - **Blocks**: Task 7 (清理)
  - **Blocked By**: None

  **References**:
  - `constants.ts:6` - APP_INFO.version 定义位置

  **Acceptance Criteria**:
  - [ ] `constants.ts` line 6 显示 `version: 'v1.2.0'`

  **QA Scenarios**:
  ```
  Scenario: 验证版本号已更新
    Tool: Bash (grep)
    Preconditions: 文件已保存
    Steps:
      1. 执行: grep -n "v1.2.0" constants.ts
    Expected Result: 输出包含 "6:  version: 'v1.2.0'"
    Evidence: .sisyphus/evidence/task-1-version-update.txt
  ```

  **Evidence to Capture**:
  - [ ] grep 命令输出截图/文本

  **Commit**: YES
  - Message: `chore(version): bump version to v1.2.0 in constants`
  - Files: `constants.ts`

---

- [ ] 2. 更新 constants.ts CHANGELOG

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/constants.ts`
  - 在 line 28 的 CHANGELOG 数组头部添加 v1.2.0 条目
  - 格式参考 line 29-41 的 v1.1.0 条目
  - **已确认更新内容**（见下方）

  **更新日志内容（已确认）**:
  ```typescript
  {
    version: 'v1.2.0',
    date: '2026-02-25',
    changes: [
      { type: 'feat', content: '增加批量文件导出功能，支持重命名或直接覆盖' },
      { type: 'opt', content: '窗口关闭等行为优化' }
    ]
  },
  ```

  **Must NOT do**:
  - 不要删除旧的 v1.1.0 和 v1.0.0 条目
  - 不要修改日期格式（YYYY-MM-DD）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 数组插入操作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 1, 3-6 并行)
  - **Parallel Group**: Phase 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `constants.ts:29-41` - v1.1.0 条目格式参考
  - `types.ts` - ChangelogItem 类型定义

  **Acceptance Criteria**:
  - [ ] CHANGELOG 数组第一个元素是 v1.2.0
  - [ ] 包含至少一条 changes
  - [ ] 日期格式正确（YYYY-MM-DD）

  **QA Scenarios**:
  ```
  Scenario: 验证更新日志已添加
    Tool: Bash (grep)
    Preconditions: 文件已保存
    Steps:
      1. 执行: grep -A 5 "v1.2.0" constants.ts | head -10
    Expected Result: 显示 v1.2.0 条目和 changes 数组
    Evidence: .sisyphus/evidence/task-2-changelog.txt
  ```

  **Evidence to Capture**:
  - [ ] constants.ts 中 CHANGELOG 相关行截图

  **Commit**: YES (可与 Task 1 合并)
  - Message: `chore(changelog): add v1.2.0 release notes`
  - Files: `constants.ts`

---

- [ ] 3. 更新 tauri.conf.json 版本号

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/src-tauri/tauri.conf.json`
  - 将 line 11 的 `"version": "1.1.0"` 改为 `"version": "1.2.0"`

  **Must NOT do**:
  - 不要修改其他配置项
  - 不要添加/删除逗号导致 JSON 格式错误

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 1-2, 4-6 并行)
  - **Parallel Group**: Phase 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src-tauri/tauri.conf.json:11` - package.version 字段

  **Acceptance Criteria**:
  - [ ] line 11 显示 `"version": "1.2.0"`

  **QA Scenarios**:
  ```
  Scenario: 验证 Tauri 版本号
    Tool: Bash (grep)
    Steps:
      1. grep -n '"version"' src-tauri/tauri.conf.json
    Expected Result: 输出 "11:    \"version\": \"1.2.0\""
    Evidence: .sisyphus/evidence/task-3-tauri-version.txt
  ```

  **Commit**: YES
  - Message: `chore(version): update tauri package version to 1.2.0`
  - Files: `src-tauri/tauri.conf.json`

---

- [ ] 4. 更新 Cargo.toml 版本号

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/src-tauri/Cargo.toml`
  - 将 line 4 的 `version = "1.1.0"` 改为 `version = "1.2.0"`

  **Must NOT do**:
  - 不要修改依赖版本
  - 不要修改其他元数据

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 1-3, 5-6 并行)
  - **Parallel Group**: Phase 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src-tauri/Cargo.toml:4` - package.version 字段

  **Acceptance Criteria**:
  - [ ] line 4 显示 `version = "1.2.0"`

  **QA Scenarios**:
  ```
  Scenario: 验证 Cargo 版本号
    Tool: Bash (grep)
    Steps:
      1. grep -n '^version' src-tauri/Cargo.toml
    Expected Result: 输出 "version = \"1.2.0\""
    Evidence: .sisyphus/evidence/task-4-cargo-version.txt
  ```

  **Commit**: YES
  - Message: `chore(version): update cargo version to 1.2.0`
  - Files: `src-tauri/Cargo.toml`

---


- [ ] 5. 更新 package.json 版本号

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/package.json`
  - 将 line 4 的 `"version": "0.0.0"` 改为 `"version": "1.2.0"`

  **Must NOT do**:
  - 不要修改依赖版本
  - 不要修改 scripts（下一个任务处理）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 1-4, 6 并行)
  - **Parallel Group**: Phase 1
  - **Blocks**: Task 6 (bundle 脚本), Task 7
  - **Blocked By**: None

  **References**:
  - `package.json:4` - version 字段

  **Acceptance Criteria**:
  - [ ] line 4 显示 `"version": "1.2.0"`

  **QA Scenarios**:
  ```
  Scenario: 验证 package.json 版本号
    Tool: Bash (grep/node)
    Steps:
      1. grep '"version"' package.json | head -1
      2. 或: node -p "require('./package.json').version"
    Expected Result: 输出 "1.2.0"
    Evidence: .sisyphus/evidence/task-5-npm-version.txt
  ```

  **Commit**: YES
  - Message: `chore(version): update npm version to 1.2.0`
  - Files: `package.json`

---

- [ ] 6. 更新 package.json bundle 脚本

  **What to do**:
  - 打开 `/Users/pxdog/Project/PicMan/package.json`
  - 更新 line 11 的 bundle 脚本，将硬编码的 `1.1.0` 改为 `1.2.0`:
    ```json
    "bundle": "npm run build && npx tauri build && open src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg",
    "bundle:open": "open src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg"
    ```

  **Must NOT do**:
  - 不要修改其他 scripts（dev, build, preview, tauri:build）
  - 不要修改 DMG 路径中的其他部分

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (与 Tasks 1-5 并行，但需在 Task 5 后)
  - **Parallel Group**: Phase 1
  - **Blocks**: Task 9 (执行打包)
  - **Blocked By**: Task 5 (package.json 版本)

  **References**:
  - `package.json:11-12` - bundle 和 bundle:open scripts

  **Acceptance Criteria**:
  - [ ] line 11 显示 `PicMan_1.2.0_aarch64.dmg`
  - [ ] line 12 显示 `PicMan_1.2.0_aarch64.dmg`

  **QA Scenarios**:
  ```
  Scenario: 验证 bundle 脚本路径
    Tool: Bash (grep)
    Steps:
      1. grep -n "1.2.0_aarch64" package.json
    Expected Result: 输出 line 11 和 12 都包含 "1.2.0_aarch64"
    Evidence: .sisyphus/evidence/task-6-bundle-script.txt
  ```

  **Commit**: YES (与 Task 5 合并)
  - Message: `chore(version): update bundle scripts to 1.2.0`
  - Files: `package.json`

---

- [ ] 7. 清理旧构建目录

  **What to do**:
  - 删除 `/Users/pxdog/Project/PicMan/dist/` 目录
  - 删除 `/Users/pxdog/Project/PicMan/src-tauri/target/` 目录
  - 使用 `rm -rf` 命令彻底清理

  **Must NOT do**:
  - 不要删除 `src-tauri/icons/` 目录
  - 不要删除 `src-tauri/src/` 目录
  - 不要删除任何源代码文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (必须在所有版本更新完成后)
  - **Parallel Group**: Phase 2
  - **Blocks**: Task 9 (执行打包)
  - **Blocked By**: Tasks 1-6 (所有版本更新)

  **References**:
  - `dist/` - Vite 构建输出目录
  - `src-tauri/target/` - Rust/Cargo 构建输出目录

  **Acceptance Criteria**:
  - [ ] `dist/` 目录不存在或为空
  - [ ] `src-tauri/target/` 目录不存在或为空

  **QA Scenarios**:
  ```
  Scenario: 验证构建目录已清理
    Tool: Bash (ls)
    Preconditions: 已执行删除命令
    Steps:
      1. ls -la dist/ 2>&1
      2. ls -la src-tauri/target/ 2>&1
    Expected Result: 
      - "No such file or directory" 或空目录
      - 总大小 < 1MB（仅 .gitkeep 等）
    Evidence: .sisyphus/evidence/task-7-cleanup.txt
  ```

  **Evidence to Capture**:
  - [ ] 删除前后的目录大小对比
  - [ ] 清理后的目录列表

  **Commit**: NO（构建产物不应提交）

---

- [ ] 8. 验证 Rust 目标平台

  **What to do**:
  - 验证已安装 `aarch64-apple-darwin` 目标
  - 如未安装，执行 `rustup target add aarch64-apple-darwin`

  **Must NOT do**:
  - 不要安装其他不必要的目标（如 x86_64，除非需要）
  - 不要修改 Rust 工具链默认目标

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（可与 Task 7 并行执行）
  - **Parallel Group**: Phase 2
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - Tauri 文档: macOS ARM64 构建要求

  **Acceptance Criteria**:
  - [ ] `rustup target list --installed` 包含 `aarch64-apple-darwin`

  **QA Scenarios**:
  ```
  Scenario: 验证 Rust 目标已安装
    Tool: Bash
    Steps:
      1. rustup target list --installed | grep aarch64
    Expected Result: 输出 "aarch64-apple-darwin (installed)"
    Evidence: .sisyphus/evidence/task-8-rust-target.txt
  ```

  **Evidence to Capture**:
  - [ ] rustup target list 输出

  **Commit**: NO（本地环境配置）

---

- [ ] 9. 执行 Tauri 构建

  **What to do**:
  - 在项目根目录执行 `npm run bundle`
  - 等待构建完成（可能需要 5-15 分钟）
  - 构建过程包括:
    1. Vite 前端构建 (`npm run build`)
    2. Tauri/Rust 构建 (`tauri build`)
    3. DMG 打包
    4. 自动打开 DMG

  **Must NOT do**:
  - 不要在构建过程中中断
  - 不要修改正在构建的文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Tauri 构建涉及 Rust 编译，耗时较长
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Tasks 7-8）
  - **Parallel Group**: Phase 3
  - **Blocks**: Tasks 10-11
  - **Blocked By**: Tasks 7-8

  **References**:
  - `package.json:11` - bundle 脚本
  - `src-tauri/tauri.conf.json` - Tauri 配置

  **Acceptance Criteria**:
  - [ ] `npm run bundle` 命令成功退出（exit code 0）
  - [ ] DMG 文件已生成在正确位置

  **QA Scenarios**:
  ```
  Scenario: 验证 Tauri 构建成功
    Tool: Bash
    Preconditions: Tasks 7-8 已完成
    Steps:
      1. npm run bundle
      2. echo $?  # 检查退出码
    Expected Result:
      - 命令成功完成
      - 退出码为 0
      - 最后显示 "Finished release [optimized] target(s)"
    Evidence: .sisyphus/evidence/task-9-build.log
  ```

  **Evidence to Capture**:
  - [ ] 完整的构建日志（保存到 .sisyphus/evidence/）
  - [ ] 构建时间记录

  **Commit**: NO（构建产物不应提交）

---

- [ ] 10. 验证 DMG 文件存在

  **What to do**:
  - 验证 DMG 文件存在于 `src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg`
  - 检查文件大小是否合理（> 10MB）
  - 验证文件名正确（包含 1.2.0 和 aarch64）

  **Must NOT do**:
  - 不要验证旧版本 DMG（1.1.0）
  - 不要假设文件一定存在（构建可能失败）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Task 9）
  - **Parallel Group**: Phase 4
  - **Blocks**: Task 11, F1-F2
  - **Blocked By**: Task 9

  **References**:
  - Tauri 默认输出路径: `src-tauri/target/release/bundle/`

  **Acceptance Criteria**:
  - [ ] 文件存在: `src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg`
  - [ ] 文件大小 > 10MB
  - [ ] 文件名包含 "1.2.0" 和 "aarch64"

  **QA Scenarios**:
  ```
  Scenario: 验证 DMG 文件存在且有效
    Tool: Bash (ls/file)
    Preconditions: Task 9 已完成
    Steps:
      1. ls -lh src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg
      2. file src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg
    Expected Result:
      - 文件存在
      - 大小 > 10MB
      - file 命令显示 "Apple Driver Map" 或 "zlib compressed"
    Evidence: .sisyphus/evidence/task-10-dmg-verify.txt
  ```

  **Evidence to Capture**:
  - [ ] DMG 文件详情（ls -lh 输出）
  - [ ] file 命令输出

  **Commit**: NO

---

- [ ] 11. （可选）验证应用可启动

  **What to do**:
  - 挂载 DMG: `hdiutil attach src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg`
  - 验证 .app 包存在
  - 尝试启动应用（可选）
  - 卸载 DMG: `hdiutil detach /Volumes/PicMan*`

  **Must NOT do**:
  - 不要在没有用户许可的情况下实际启动 GUI 应用
  - 不要修改 DMG 内容

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Task 10）
  - **Parallel Group**: Phase 4
  - **Blocks**: F1-F2
  - **Blocked By**: Task 10

  **References**:
  - macOS DMG 挂载命令

  **Acceptance Criteria**:
  - [ ] DMG 可成功挂载
  - [ ] PicMan.app 存在于挂载卷中
  - [ ] （可选）应用可启动

  **QA Scenarios**:
  ```
  Scenario: 验证应用包完整性
    Tool: Bash (hdiutil/ls)
    Preconditions: Task 10 已完成
    Steps:
      1. hdiutil attach src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg
      2. ls -la /Volumes/PicMan*/PicMan.app
      3. hdiutil detach /Volumes/PicMan*
    Expected Result:
      - 挂载成功
      - .app 包存在且包含 Contents 目录
      - 卸载成功
    Evidence: .sisyphus/evidence/task-11-app-verify.txt
  ```

  **Evidence to Capture**:
  - [ ] 挂载后的卷内容列表
  - [ ] .app 包结构

  **Commit**: NO

---

## Final Verification Wave

> 2 个审查代理在并行运行，确保版本一致性和构建完整性

- [ ] F1. **版本一致性检查** — `oracle`
  
  **What to do**:
  - 在所有版本号位置搜索 1.2.0
  - 验证所有位置版本一致
  - 检查是否有遗漏的 1.1.0 残留

  **QA Scenarios**:
  ```
  Scenario: 全局版本一致性验证
    Tool: Bash (grep)
    Steps:
      1. grep -r "1.2.0" constants.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
      2. grep -r "1.1.0" constants.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json 2>/dev/null || echo "No 1.1.0 found"
    Expected Result:
      - 所有目标文件都包含 1.2.0
      - 没有文件包含 1.1.0
    Evidence: .sisyphus/evidence/f1-version-consistency.txt
  ```

  **输出**: `Version Check [PASS/FAIL] | Files [N/N updated] | VERDICT`

---

- [ ] F2. **构建产物完整性检查** — `quick`
  
  **What to do**:
  - 验证 DMG 文件存在且大小合理
  - 检查是否有其他构建产物（.app, .tar.gz 等）
  - 验证没有残留的 1.1.0 构建产物

  **QA Scenarios**:
  ```
  Scenario: 构建产物完整性
    Tool: Bash (find/ls)
    Steps:
      1. find src-tauri/target/release/bundle -name "*1.2.0*" -type f
      2. find src-tauri/target/release/bundle -name "*1.1.0*" -type f 2>/dev/null || echo "No 1.1.0 artifacts"
      3. ls -lh src-tauri/target/release/bundle/dmg/
    Expected Result:
      - 找到 v1.2.0 的构建产物
      - 没有 v1.1.0 的旧产物
      - DMG 文件大小正常（10-100MB）
    Evidence: .sisyphus/evidence/f2-build-artifacts.txt
  ```

  **输出**: `Artifacts [PASS/FAIL] | DMG Size [XX MB] | VERDICT`

---

## Commit Strategy

### Commit 分组策略

**Phase 1 版本更新（可以合并为 1-2 个 commit）**:

1. **版本号更新 commit**:
   ```
   chore(version): bump to v1.2.0
   
   - constants.ts: APP_INFO.version
   - tauri.conf.json: package.version
   - Cargo.toml: package.version
   - package.json: version field
   ```
   Files: `constants.ts`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`

2. **CHANGELOG 更新 commit** (可与上面合并):
   ```
   chore(changelog): add v1.2.0 release notes
   
   新增 v1.2.0 更新日志条目
   ```
   Files: `constants.ts`

3. **Bundle 脚本更新 commit** (可与上面合并):
   ```
   chore(build): update bundle scripts to v1.2.0
   
   更新 npm run bundle 和 bundle:open 中的硬编码版本号
   ```
   Files: `package.json`

**推荐**: 合并为单个 commit
```bash
git add constants.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "chore(release): bump version to v1.2.0

- 更新所有版本号文件到 1.2.0
- 添加 v1.2.0 更新日志
- 更新 bundle 脚本硬编码版本"
```

### Pre-commit 检查
执行以下命令验证版本一致性：
```bash
echo "=== Version Check ==="
grep "APP_INFO.version" constants.ts
grep '"version"' src-tauri/tauri.conf.json | head -1
grep '^version' src-tauri/Cargo.toml
grep '"version"' package.json | head -1
grep "PicMan_1.2.0" package.json
```

---

## Success Criteria

### 验收检查清单

- [ ] **版本号一致**: 所有 5+ 个位置都显示 1.2.0
- [ ] **CHANGELOG 完整**: v1.2.0 条目已添加到 CHANGELOG 数组头部
- [ ] **构建目录已清理**: dist/ 和 src-tauri/target/ 已清空
- [ ] **DMG 文件存在**: `PicMan_1.2.0_aarch64.dmg` 在正确位置
- [ ] **DMG 大小合理**: 文件大小 > 10MB（典型值 30-80MB）
- [ ] **应用可启动** (可选): 挂载 DMG 后能正常启动应用

### 验证命令

```bash
# 1. 版本一致性验证
echo "=== 版本号检查 ==="
grep -r "1.2.0" constants.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json | grep -v "node_modules"
echo ""
echo "=== 旧版本残留检查 ==="
grep -r "1.1.0" constants.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json 2>/dev/null && echo "❌ 发现旧版本残留" || echo "✅ 无旧版本残留"

# 2. CHANGELOG 验证
echo ""
echo "=== CHANGELOG 检查 ==="
grep -A 10 "v1.2.0" constants.ts | head -15

# 3. DMG 文件验证
echo ""
echo "=== DMG 文件检查 ==="
ls -lh src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg 2>/dev/null && echo "✅ DMG 文件存在" || echo "❌ DMG 文件不存在"
file src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg 2>/dev/null | grep -q "Apple" && echo "✅ DMG 格式正确" || echo "❌ DMG 格式异常"

# 4. 最终报告
echo ""
echo "=== 打包完成报告 ==="
echo "版本: v1.2.0"
echo "平台: macOS ARM64 (aarch64)"
echo "输出: src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg"
echo "构建时间: $(date)"
```

### 预期输出示例

```
=== 版本号检查 ===
constants.ts:  version: 'v1.2.0',
src-tauri/tauri.conf.json:    "version": "1.2.0"
src-tauri/Cargo.toml:version = "1.2.0"
package.json:  "version": "1.2.0",
package.json:    "bundle": "...PicMan_1.2.0_aarch64.dmg..."

=== 旧版本残留检查 ===
✅ 无旧版本残留

=== CHANGELOG 检查 ===
  {
    version: 'v1.2.0',
    date: '2026-02-25',
    changes: [...]

=== DMG 文件检查 ===
-rw-r--r--  1 user  staff    45M Feb 25 14:30 src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg
✅ DMG 文件存在
✅ DMG 格式正确

=== 打包完成报告 ===
版本: v1.2.0
平台: macOS ARM64 (aarch64)
输出: src-tauri/target/release/bundle/dmg/PicMan_1.2.0_aarch64.dmg
构建时间: Wed Feb 25 14:30:00 CST 2026
```

---

## Appendix: 常见问题排查

### 1. 构建失败：Rust 编译错误
**可能原因**:
- 未安装 `aarch64-apple-darwin` 目标
- Xcode 命令行工具未安装

**解决**:
```bash
rustup target add aarch64-apple-darwin
xcode-select --install
```

### 2. DMG 未生成或路径错误
**检查**:
- bundle 脚本中的路径是否正确
- 是否有权限问题

### 3. 应用无法启动（Gatekeeper）
**解决**:
- 右键点击应用 → "打开"
- 或执行: `xattr -cr /Applications/PicMan.app`
- 或使用 ad-hoc 签名: `codesign --force --deep --sign - /Applications/PicMan.app`

### 4. 版本号不一致
**排查**:
```bash
# 查找所有版本号引用
grep -rn "1\.\(1\|2\)\.0" --include="*.json" --include="*.toml" --include="*.ts" .
```

---

**Plan Generated**: 2026-02-25
**Status**: Ready for Review
**Next Action**: 提供 v1.2.0 更新日志内容，或按占位符执行

