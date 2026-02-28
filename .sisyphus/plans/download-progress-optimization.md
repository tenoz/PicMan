# 下载进度优化工作计划

## TL;DR

> **快速总结**：修复下载功能的状态显示错误，添加进度反馈，支持中断/继续操作
>
> **交付物**：
> - 修复"全部下载"按钮的状态显示问题
> - 添加导入、打包、下载的进度反馈
> - 支持中断下载并继续下载
> - 失败文件跳过并显示简报
>
> **预估工作量**：Medium
> **并行执行**：YES - 3 waves
> **关键路径**：状态拆分 → 进度显示 → 中断支持

---

## Context

### 原始需求

**问题 1**：大量图片下载时缺少进度反馈，用户误以为卡死
**问题 2**：点击"全部下载"按钮时，UI 显示"打包下载"状态
**新需求**：导入、打包、下载进度中支持中断/继续操作

### 访谈摘要

**关键决策**：
- 取消行为：立即停止，保留已下载，支持继续（"取消"改名为"中断下载"）
- 进度格式：文件数量格式（3/50）
- 错误处理：跳过失败继续，最后显示失败简报

### Metis 审查要点

**已确认的边界**：
- 不重构整个下载模块，只修复状态管理和添加进度
- 不添加暂停功能（暂停=中断，可以继续）
- 不修改图片处理核心逻辑

---

## Work Objectives

### 核心目标

修复下载功能的用户体验问题，让用户清楚知道操作进度，并提供中断/继续能力。

### 具体交付物

1. **状态隔离**：`isDownloadingAll` 和 `isZipping` 完全独立
2. **进度反馈**：所有长时间操作显示进度（导入、打包、下载）
3. **中断支持**：中断下载后可继续下载未完成的文件
4. **错误处理**：失败文件跳过，显示简报

### 完成定义

- [ ] 点击"全部下载"时，进度条显示"正在下载..."而非"正在打包..."
- [ ] 下载过程中显示"正在下载 3/50"格式进度
- [ ] 点击"中断下载"立即停止，状态恢复
- [ ] 中断后可继续下载剩余文件
- [ ] 部分失败时显示失败简报

---

## Verification Strategy

### 测试决策

- **基础设施存在**：NO（无自动化测试框架）
- **自动化测试**：NO
- **验证方式**：手动测试 + Agent QA 场景

### QA 策略

每个任务包含 Agent 执行的 QA 场景：
- **UI 验证**：检查按钮状态、进度文本
- **功能验证**：触发操作，验证预期行为

---

## Execution Strategy

### 并行执行 Wave

```
Wave 1（基础 - 无依赖）：
├── Task 1: 定义状态类型和接口 [quick]
├── Task 2: 添加下载相关状态变量 [quick]
└── Task 3: 添加中断标志 ref [quick]

Wave 2（核心功能 - 依赖 Wave 1）：
├── Task 4: 修复 handleDownloadAll 状态显示 [quick]
├── Task 5: 添加全部下载进度反馈 [quick]
├── Task 6: 修复 handleExportZip 状态显示 [quick]
└── Task 7: 添加打包下载中断支持 [quick]

Wave 3（集成与 UI - 依赖 Wave 2）：
├── Task 8: 更新进度条 UI 组件 [visual-engineering]
├── Task 9: 添加中断/继续按钮 [visual-engineering]
├── Task 10: 添加失败文件简报 [quick]
└── Task 11: 集成测试 [quick]

Wave FINAL（验证）：
├── F1: 功能完整性验证
├── F2: 边界场景测试
├── F3: 用户体验验收
└── F4: 代码质量检查
```

## TODOs

- [ ] 1. 定义下载状态类型和接口

  **What to do**:
  - 在 types.ts 中添加 DownloadProgress 接口
  - 定义下载阶段枚举（idle/preparing/downloading/completed/cancelled）

  **Must NOT do**:
  - 不修改现有的 AppFile 类型
  - 不添加与下载无关的状态

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的类型定义任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `types.ts` - 现有类型定义，了解项目类型风格
  - `App.tsx:48-49` - 现有状态变量定义方式

  **Acceptance Criteria**:
  - [ ] types.ts 中新增 DownloadProgress 接口
  - [ ] 包含 phase, current, total, failedFiles 字段

  **QA Scenarios**:
  ```
  Scenario: 类型定义正确
    Tool: Bash (grep)
    Steps:
      1. grep -n "DownloadProgress" types.ts
    Expected Result: 找到 DownloadProgress 接口定义
    Evidence: .sisyphus/evidence/task-01-type-defined.txt
  ```

  **Commit**: NO (与 Task 2, 3 一起提交)

---

- [ ] 2. 添加下载相关状态变量

  **What to do**:
  - 在 App.tsx 中添加 isDownloadingAll 状态
  - 添加 downloadProgress 状态
  - 添加 downloadedFiles 和 failedFiles 状态

  **Must NOT do**:
  - 不删除或修改现有的 isZipping 状态
  - 不修改 handleDownloadAll 函数逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的状态变量添加
  - **Skills**: [`vercel-react-best-practices`]
    - `vercel-react-best-practices`: React 状态管理最佳实践

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:
  - `App.tsx:48-49` - 现有状态定义位置
  - `App.tsx:40` - isPaused 状态定义

  **Acceptance Criteria**:
  - [ ] App.tsx 中新增 isDownloadingAll 状态
  - [ ] App.tsx 中新增 downloadProgress 状态

  **QA Scenarios**:
  ```
  Scenario: 状态变量存在
    Tool: Bash (grep)
    Steps:
      1. grep -n "isDownloadingAll" App.tsx
      2. grep -n "downloadProgress" App.tsx
    Expected Result: 找到两个状态定义
    Evidence: .sisyphus/evidence/task-02-states-added.txt
  ```

  **Commit**: NO (与 Task 1, 3 一起提交)

---

- [ ] 3. 添加中断标志 ref

  **What to do**:
  - 添加 stopDownloadRef 和 stopZipRef
  - 复用现有 stopProcessingRef 的模式

  **Must NOT do**:
  - 不修改现有的 stopProcessingRef

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 ref 添加
  - **Skills**: [`vercel-react-best-practices`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: None

  **References**:
  - `App.tsx` - 搜索 stopProcessingRef 找到现有模式

  **Acceptance Criteria**:
  - [ ] stopDownloadRef 已定义
  - [ ] stopZipRef 已定义

  **QA Scenarios**:
  ```
  Scenario: ref 已定义
    Tool: Bash (grep)
    Steps:
      1. grep -n "stopDownloadRef" App.tsx
      2. grep -n "stopZipRef" App.tsx
    Expected Result: 找到两个 ref 定义
    Evidence: .sisyphus/evidence/task-03-refs-added.txt
  ```
  **Commit**: YES (Wave 1 完成)
  - Message: `feat(download): add download state and cancel refs`
  - Files: `App.tsx, types.ts`

---

- [ ] 4. 修复 handleDownloadAll 状态显示

  **What to do**:
  - 将 handleDownloadAll 中的 setIsZipping 改为 setIsDownloadingAll
  - 确保 UI 显示"正在下载..."而非"正在打包..."

  **Must NOT do**:
  - 不修改下载逻辑本身
  - 不修改文件保存逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的状态变量替换
  - **Skills**: [`vercel-react-best-practices`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `App.tsx:977` - setIsZipping(true) 需要修改的位置
  - `App.tsx:1118` - setIsZipping(false) 需要修改的位置

  **Acceptance Criteria**:
  - [ ] handleDownloadAll 使用 isDownloadingAll 状态
  - [ ] 不再使用 isZipping 状态

  **QA Scenarios**:
  ```
  Scenario: 全部下载显示正确状态
    Tool: Playwright
    Preconditions: 导入 5 张图片并处理完成
    Steps:
      1. 点击"全部下载"按钮
      2. 观察进度条区域
    Expected Result: 显示"正在下载..."，不显示"正在打包..."
    Evidence: .sisyphus/evidence/task-04-download-state.png
  ```

  **Commit**: NO (与 Wave 2 其他任务一起提交)

---

- [ ] 5. 添加全部下载进度反馈

  **What to do**:
  - 在 handleDownloadAll 循环中更新 downloadProgress
  - 显示"正在下载 X/Y"格式进度
  - 检查 stopDownloadRef 支持中断
  - 收集失败文件信息

  **Must NOT do**:
  - 不优化下载速度
  - 不修改文件保存逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的进度更新逻辑
  - **Skills**: [`vercel-react-best-practices`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `App.tsx:984-1009` - 下载循环逻辑
  - `App.tsx:1091-1092` - 参考 zip 的进度回调模式

  **Acceptance Criteria**:
  - [ ] 下载过程中 downloadProgress 实时更新
  - [ ] 循环中检查 stopDownloadRef 支持中断
  - [ ] 收集失败文件到 failedFiles 数组

  **QA Scenarios**:
  ```
  Scenario: 下载进度正确显示
    Tool: Playwright
    Preconditions: 导入 10 张图片并处理完成
    Steps:
      1. 点击"全部下载"按钮
      2. 观察进度条变化
    Expected Result: 进度从 1/10 递增到 10/10
    Evidence: .sisyphus/evidence/task-05-download-progress.png
  ```

  **Commit**: NO (与 Wave 2 其他任务一起提交)

---

- [ ] 6. 修复 handleExportZip 状态显示

  **What to do**:
  - 确认 handleExportZip 使用 isZipping 状态正确
  - 确认 UI 显示"正在打包..."

  **Must NOT do**:
  - 不修改 ZIP 生成逻辑
  - 不修改压缩配置

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 状态确认任务
  - **Skills**: [`vercel-react-best-practices`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `App.tsx:1061-1121` - handleExportZip 函数

  **Acceptance Criteria**:
  - [ ] 打包下载时使用 isZipping 状态
  - [ ] UI 显示"正在打包..."

  **QA Scenarios**:
  ```
  Scenario: 打包下载显示正确状态
    Tool: Playwright
    Preconditions: 导入 5 张图片并处理完成
    Steps:
      1. 点击"打包下载"按钮
      2. 观察进度条区域
    Expected Result: 显示"正在打包..."
    Evidence: .sisyphus/evidence/task-06-zip-state.png
  ```

  **Commit**: NO (与 Wave 2 其他任务一起提交)

---

- [ ] 7. 添加打包下载中断支持

  **What to do**:
  - 在 zip.generateAsync 前检查 stopZipRef
  - 支持中断 ZIP 生成过程

  **Must NOT do**:
  - 不修改 ZIP 压缩配置
  - 不添加暂停功能

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的中断检查
  - **Skills**: [`vercel-react-best-practices`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 1, 3

  **References**:
  - `App.tsx:1087-1093` - ZIP 生成逻辑
  - JSZip 文档 - 如何中断 generateAsync

  **Acceptance Criteria**:
  - [ ] stopZipRef 可中断 ZIP 生成
  - [ ] 中断后状态正确恢复

  **QA Scenarios**:
  ```
  Scenario: 打包下载可中断
    Tool: Playwright
    Preconditions: 导入 50 张图片并处理完成
    Steps:
      1. 点击"打包下载"按钮
      2. 等待进度开始后点击"中断下载"
    Expected Result: 下载停止，状态恢复
    Evidence: .sisyphus/evidence/task-07-zip-cancel.png
  ```

  **Commit**: YES (Wave 2 完成)
  - Message: `feat(download): add progress feedback and cancel support`
  - Files: `App.tsx`

---

- [ ] 8. 更新进度条 UI 组件

  **What to do**:
  - 修改进度条显示逻辑，支持"正在下载..."状态
  - 添加下载状态的图标和颜色
  - 显示"正在下载 X/Y"格式进度

  **Must NOT do**:
  - 不修改进度条的整体布局
  - 不添加复杂的动画效果

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件开发
  - **Skills**: [`vercel-react-best-practices`, `frontend-ui-ux`]
    - `vercel-react-best-practices`: React 组件最佳实践
    - `frontend-ui-ux`: UI/UX 设计指导

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:
  - `App.tsx:1539-1570` - 现有进度条 UI
  - `App.tsx:1543-1546` - 状态图标和文本显示逻辑

  **Acceptance Criteria**:
  - [ ] 进度条支持 isDownloadingAll 状态
  - [ ] 显示下载图标（使用 Download 图标）
  - [ ] 显示"正在下载 X/Y"格式进度

  **QA Scenarios**:
  ```
  Scenario: 进度条显示下载状态
    Tool: Playwright
    Preconditions: 导入 10 张图片并处理完成
    Steps:
      1. 点击"全部下载"按钮
      2. 截图验证进度条
    Expected Result: 显示下载图标和"正在下载 X/10"
    Evidence: .sisyphus/evidence/task-08-progress-ui.png
  ```

  **Commit**: NO (与 Wave 3 其他任务一起提交)

---

- [ ] 9. 添加中断/继续按钮

  **What to do**:
  - 在进度条区域添加"中断下载"按钮
  - 支持中断当前下载操作
  - 中断后支持继续下载剩余文件

  **Must NOT do**:
  - 不添加暂停/恢复功能（只有中断）
  - 不修改现有的处理按钮

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 按钮开发
  - **Skills**: [`vercel-react-best-practices`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:
  - `App.tsx:1539-1570` - 进度条区域
  - `App.tsx:886-894` - toggleProcessing 参考模式

  **Acceptance Criteria**:
  - [ ] 进度条区域显示"中断下载"按钮
  - [ ] 点击后设置中断标志
  - [ ] 中断后可继续下载剩余文件

  **QA Scenarios**:
  ```
  Scenario: 中断下载功能
    Tool: Playwright
    Preconditions: 导入 20 张图片并处理完成
    Steps:
      1. 点击"全部下载"按钮
      2. 等待进度到 5/20
      3. 点击"中断下载"按钮
      4. 再次点击"全部下载"
    Expected Result: 从第 6 张开始继续下载
    Evidence: .sisyphus/evidence/task-09-cancel-resume.png
  ```

  **Commit**: NO (与 Wave 3 其他任务一起提交)

---

- [ ] 10. 添加失败文件简报

  **What to do**:
  - 下载完成后检查 failedFiles
  - 显示失败文件的简短报告
  - 在日志中记录失败详情

  **Must NOT do**:
  - 不添加重试功能
  - 不显示复杂的错误详情

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的报告显示
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 5

  **References**:
  - `App.tsx:880-883` - 处理完成的通知模式
  - `App.tsx` - showNotification 函数

  **Acceptance Criteria**:
  - [ ] 下载完成后检查 failedFiles
  - [ ] 有失败文件时显示简报通知
  - [ ] 日志中记录失败文件名

  **QA Scenarios**:
  ```
  Scenario: 失败文件简报
    Tool: Playwright
    Preconditions: 模拟部分文件下载失败
    Steps:
      1. 触发下载
      2. 观察完成后的通知
    Expected Result: 显示"下载完成，3 个文件失败"
    Evidence: .sisyphus/evidence/task-10-failure-report.png
  ```

  **Commit**: YES (Wave 3 完成)
  - Message: `feat(download): add cancel/resume UI and failure report`
  - Files: `App.tsx`

---

- [ ] 11. 集成测试

  **What to do**:
  - 测试全部下载、打包下载、中断、继续的完整流程
  - 验证状态隔离正确
  - 验证进度显示准确

  **Must NOT do**:
  - 不修改代码逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 测试验证任务
  - **Skills**: [`playwright`]
    - `playwright`: 浏览器自动化测试

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Final Wave
  - **Blocked By**: Tasks 8, 9, 10

  **References**:
  - 本计划的所有 QA 场景

  **Acceptance Criteria**:
  - [ ] 全部下载流程正常
  - [ ] 打包下载流程正常
  - [ ] 中断/继续功能正常
  - [ ] 失败简报显示正常

  **QA Scenarios**:
  ```
  Scenario: 完整流程测试
    Tool: Playwright
    Preconditions: 导入 30 张图片并处理完成
    Steps:
      1. 点击"全部下载"，验证进度显示
      2. 中断下载
      3. 继续下载
      4. 点击"打包下载"，验证进度显示
      5. 中断打包
    Expected Result: 所有功能正常工作
    Evidence: .sisyphus/evidence/task-11-integration-test.png
  ```

  **Commit**: NO

---

## Final Verification Wave

- [ ] F1. 功能完整性验证

  **What to do**:
  - 验证所有"完成定义"中的条件
  - 确认所有 Must Have 功能存在
  - 确认所有 Must NOT Have 功能不存在

  **QA Scenarios**:
  ```
  Scenario: 功能完整性
    Tool: Playwright
    Steps:
      1. 验证全部下载状态显示正确
      2. 验证打包下载状态显示正确
      3. 验证进度反馈存在
      4. 验证中断功能存在
      5. 验证失败简报存在
    Expected Result: 所有功能正常
    Evidence: .sisyphus/evidence/final-f1-completeness.png
  ```

- [ ] F2. 边界场景测试

  **What to do**:
  - 测试大量文件（100+）
  - 测试空文件列表
  - 测试快速连续点击

  **QA Scenarios**:
  ```
  Scenario: 大量文件测试
    Tool: Playwright
    Preconditions: 导入 100 张图片并处理完成
    Steps:
      1. 点击全部下载
      2. 中断
      3. 继续
    Expected Result: 不卡顿，进度准确
    Evidence: .sisyphus/evidence/final-f2-large-files.png
  ```

- [ ] F3. 用户体验验收

  **What to do**:
  - 验证进度反馈清晰
  - 验证按钮状态合理
  - 验证错误提示友好

  **QA Scenarios**:
  ```
  Scenario: 用户体验
    Tool: Manual
    Steps:
      1. 作为用户执行完整下载流程
    Expected Result: 体验流畅，不困惑
    Evidence: .sisyphus/evidence/final-f3-ux.txt
  ```

- [ ] F4. 代码质量检查

  **What to do**:
  - 运行 tsc --noEmit
  - 检查是否有 console.log 遗留
  - 检查是否有 any 类型

  **QA Scenarios**:
  ```
  Scenario: 代码质量
    Tool: Bash
    Steps:
      1. tsc --noEmit
      2. grep -r "console.log" App.tsx
      3. grep -r ": any" App.tsx
    Expected Result: 无错误，无遗留 console.log
    Evidence: .sisyphus/evidence/final-f4-code-quality.txt
  ```

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1 | `feat(download): add download state and cancel refs` | App.tsx, types.ts |
| 2 | `feat(download): add progress feedback and cancel support` | App.tsx |
| 3 | `feat(download): add cancel/resume UI and failure report` | App.tsx |

---

## Success Criteria

### 验证命令

```bash
# 类型检查
tsc --noEmit

# 检查状态变量
grep -n "isDownloadingAll" App.tsx
grep -n "downloadProgress" App.tsx
```

### 最终检查清单

- [ ] 点击"全部下载"显示"正在下载..."
- [ ] 下载进度显示"正在下载 X/Y"
- [ ] 点击"中断下载"立即停止
- [ ] 中断后可继续下载
- [ ] 失败文件显示简报
- [ ] 无 TypeScript 错误
- [ ] 无遗留 console.log
  - Message: `feat(download): add download state and cancel refs`
  - Files: `App.tsx, types.ts`