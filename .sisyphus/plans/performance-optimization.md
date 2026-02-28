# PicMan 性能优化工作计划

## TL;DR

> **Quick Summary**: 全面优化 PicMan 的批量图片处理性能，引入 Web Worker 后台处理、虚拟列表渲染、智能内存管理，支持 500+ 张图片的流畅处理。
> 
> **Deliverables**:
> - Web Worker 图片处理架构（支持降级）
> - 虚拟滚动文件列表组件
> - 缩略图生成与管理模块
> - 智能并发调度器
> - 性能测试框架与基准报告
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: 预研验证 → Worker 架构 → 内存管理 → 虚拟列表 → 集成测试

---

## Context

### Original Request
用户希望全面优化 PicMan 图片侠的性能，主要场景是一次性处理 500 张以上的图片。当前存在以下问题：
- Canvas API 在主线程处理，大图片会阻塞 UI
- 文件列表没有虚拟滚动，大量文件时 DOM 节点过多
- Blob URL 创建/销毁分散，内存管理混乱
- 并发控制粗糙，无法精细控制资源使用

### Interview Summary
**Key Discussions**:
- **优化范围**: 全面优化（处理速度 + UI流畅度 + 内存占用）
- **使用场景**: 500 张以上超大批量处理
- **技术方案**: Web Worker + 虚拟列表 + 缩略图 + 内存管理
- **打包体积**: 优先性能，可接受体积增加
- **进度显示**: 保持简洁风格

### Metis Review
**Identified Gaps** (addressed):
- 缺少技术预研验证高风险假设 → 添加 Wave 0 预研任务
- processedBlob 保留策略不明确 → 添加 LRU 缓存任务
- 虚拟列表与文件夹 Tab 兼容性 → 使用 react-virtuoso 支持动态高度
- 验收标准不量化 → 每个任务添加具体指标
- 缺少降级方案 → 每个优化点添加回退策略

---

## Work Objectives

### Core Objective
构建高性能的批量图片处理架构，支持 500+ 张图片的流畅处理，同时保持 UI 响应性和合理内存占用。

### Concrete Deliverables
- `src/workers/imageProcessor.worker.ts` - Web Worker 图片处理脚本
- `src/workers/types.ts` - Worker 通信类型定义
- `src/hooks/useWorkerProcessor.ts` - Worker 处理 Hook
- `src/components/VirtualFileList.tsx` - 虚拟滚动文件列表
- `src/utils/thumbnailGenerator.ts` - 缩略图生成工具
- `src/utils/blobManager.ts` - Blob URL 生命周期管理
- `src/utils/taskScheduler.ts` - 智能并发调度器
- `src/utils/memoryMonitor.ts` - 内存监控工具
- `src/tests/performance/` - 性能测试套件

### Definition of Done
- [ ] 处理 50 张 4K 图片时 UI 保持 30fps 以上
- [ ] 1000 个文件列表首屏渲染 < 100ms
- [ ] 处理 200 张图片后内存占用 < 500MB
- [ ] `npm run test:perf` 生成对比报告

### Must Have
- Web Worker 后台图片处理（含降级方案）
- 虚拟滚动列表支持 1000+ 文件
- LRU 缓存管理 processedBlob
- 智能并发调度
- 性能基准测试

### Must NOT Have (Guardrails)
- MUST NOT: 修改 UI 设计（颜色、布局、动画）
- MUST NOT: 改变现有功能行为（如智能防膨胀逻辑）
- MUST NOT: 移除任何现有功能
- MUST NOT: 在 Worker 中引入新的重型依赖库
- MUST NOT: 修改文件导入/导出的业务逻辑

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO（需要新建）
- **Automated tests**: YES (TDD) - 每个模块先写测试
- **Framework**: vitest（与 Vite 集成良好）

### QA Policy
每个任务必须包含 agent-executed QA 场景。证据保存到 `.sisyphus/evidence/`。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (预研验证 — 必须先完成):
├── Task 1: OffscreenCanvas 可用性验证 [quick]
├── Task 2: react-virtuoso 与文件夹 Tab 兼容性验证 [quick]
└── Task 3: piexifjs Worker 兼容性验证 [quick]

Wave 1 (基础架构 — 可并行):
├── Task 4: 安装依赖包 [quick]
├── Task 5: Worker 类型定义与通信协议 [quick]
├── Task 6: Blob URL 生命周期管理器 [quick]
├── Task 7: 内存监控工具 [quick]
└── Task 8: 性能测试框架搭建 [quick]

Wave 2 (核心模块 — 依赖 Wave 1):
├── Task 9: Web Worker 图片处理核心 [deep]
├── Task 10: Worker 处理 Hook [deep]
├── Task 11: 缩略图生成器 [quick]
├── Task 12: 智能并发调度器 [deep]
└── Task 13: LRU 缓存管理器 [quick]

Wave 3 (UI 集成 — 依赖 Wave 2):
├── Task 14: 虚拟滚动文件列表组件 [visual-engineering]
├── Task 15: 导入流程优化（缩略图生成）[deep]
├── Task 16: 处理流程集成 Worker [deep]
└── Task 17: 内存管理集成 [deep]

Wave 4 (测试与优化 — 依赖 Wave 3):
├── Task 18: 性能基准测试用例 [deep]
├── Task 19: Worker 降级方案测试 [quick]
├── Task 20: 大批量压力测试 (500+ 张) [unspecified-high]
└── Task 21: 内存泄漏检测与修复 [unspecified-high]

Wave FINAL (验证与清理):
├── Task F1: 计划合规审计 (oracle)
├── Task F2: 代码质量审查 (unspecified-high)
├── Task F3: 性能对比报告生成 (deep)
└── Task F4: 范围保真度检查 (deep)
```

---

## TODOs

> **共 21 个任务 + 4 个最终验证任务**

---

### Wave 0: 预研验证（3 个任务）

- [x] 1. **OffscreenCanvas 可用性验证** `[quick]`

  **What to do**: 创建测试脚本验证 OffscreenCanvas 在 Tauri WebView 中的可用性，测试 Worker 中使用的基本流程，记录测试结果和降级建议。

  **Acceptance Criteria**: 测试脚本创建，明确的支持状态和建议。

  **Commit**: NO (研究性代码)

---

- [x] 2. **react-virtuoso 与文件夹 Tab 兼容性验证** `[quick]`

  **What to do**: 分析 FileList.tsx 的 Tab 切换逻辑，创建原型验证 react-virtuoso 能否支持，给出选型建议。

  **Acceptance Criteria**: 分析文档，选型建议文档。

  **Commit**: NO (研究性文档)

---

- [x] 3. **piexifjs Worker 兼容性验证** `[quick]`

  **What to do**: 测试 piexifjs 在 Worker 中的运行情况，研究替代方案。

  **Acceptance Criteria**: 兼容性测试报告。

  **Commit**: NO

---

### Wave 1: 基础架构（5 个任务）

- [ ] 4. **安装依赖包** `[quick]`

  **What to do**: 安装 react-virtuoso, vitest。

  **Acceptance Criteria**: `npm install` 成功，`npm run dev` 正常运行。

  **Commit**: YES - `chore: add react-virtuoso and vitest`

---

- [ ] 5. **Worker 类型定义与通信协议** `[quick]`

  **What to do**: 创建 `src/workers/types.ts` 定义通信类型。

  **Acceptance Criteria**: Request, Response, Progress, Error 类型完整，TypeScript 编译通过。

  **Commit**: YES - `feat(worker): add communication types`

---

- [ ] 6. **Blob URL 生命周期管理器** `[quick]`

  **What to do**: 创建 `src/utils/blobManager.ts` 统一管理 Blob URL。

  **Acceptance Criteria**: create, release, releaseAll 方法实现，引用计数正确。

  **Commit**: YES - `feat(utils): add BlobManager`

---

- [ ] 7. **内存监控工具** `[quick]`

  **What to do**: 创建 `src/utils/memoryMonitor.ts`。

  **Acceptance Criteria**: getMemoryUsage, checkMemoryPressure 实现，阈值可配置。

  **Commit**: YES - `feat(utils): add memory monitor`

---

- [ ] 8. **性能测试框架搭建** `[quick]`

  **What to do**: 配置 vitest，创建测试目录，添加脚本。

  **Acceptance Criteria**: `vitest.config.ts` 配置完成，`npm run test:perf` 可运行。

  **Commit**: YES - `test: setup performance framework`

---

### Wave 2: 核心模块（5 个任务）

- [ ] 9. **Web Worker 图片处理核心** `[deep]`

  **What to do**: 创建 `src/workers/imageProcessor.worker.ts`，迁移处理逻辑。

  **Acceptance Criteria**: OffscreenCanvas 处理实现，消息处理循环完整，进度回调支持。

  **Commit**: YES - `feat(worker): implement image processor worker`

---

- [ ] 10. **Worker 处理 Hook** `[deep]`

  **What to do**: 创建 `src/hooks/useWorkerProcessor.ts`，封装 Worker 管理。

  **Acceptance Criteria**: API 兼容现有处理流程，自动降级实现，取消操作支持。

  **Commit**: YES - `feat(hooks): add useWorkerProcessor`

---

- [ ] 11. **缩略图生成器** `[quick]`

  **What to do**: 创建 `src/utils/thumbnailGenerator.ts`。

  **Acceptance Criteria**: generateThumbnail 函数实现，100 张缩略图 < 2 秒。

  **Commit**: YES - `feat(utils): add thumbnail generator`

---

- [ ] 12. **智能并发调度器** `[deep]`

  **What to do**: 创建 `src/utils/taskScheduler.ts`。

  **Acceptance Criteria**: 任务队列管理，动态并发调整，暂停/恢复/取消。

  **Commit**: YES - `feat(utils): add task scheduler`

---

- [ ] 13. **LRU 缓存管理器** `[quick]`

  **What to do**: 创建 `src/utils/lruCache.ts`。

  **Acceptance Criteria**: LRU 淘汰正确，容量限制有效。

  **Commit**: YES - `feat(utils): add LRU cache`

---

### Wave 3: UI 集成（4 个任务）

- [ ] 14. **虚拟滚动文件列表组件** `[visual-engineering]`

  **What to do**: 创建 `src/components/VirtualFileList.tsx`。

  **Acceptance Criteria**: 1000+ 文件流畅滚动，列表/网格视图支持，文件夹 Tab 兼容。

  **Commit**: YES - `feat(ui): implement virtual file list`

---

- [ ] 15. **导入流程优化** `[deep]`

  **What to do**: 修改 handleFilesAdded，集成缩略图生成。

  **Acceptance Criteria**: 导入时生成缩略图，内存占用降低。

  **Commit**: YES - `feat: optimize import with thumbnails`

---

- [ ] 16. **处理流程集成 Worker** `[deep]`

  **What to do**: 修改 handleProcessFiles，使用 Worker 和调度器。

  **Acceptance Criteria**: 处理使用 Worker，UI 保持响应，暂停/恢复正常。

  **Commit**: YES - `feat: integrate worker processing`

---

- [ ] 17. **内存管理集成** `[deep]`

  **What to do**: 集成 LRUCache 管理 processedBlob。

  **Acceptance Criteria**: 自动清理工作，内存监控正常。

  **Commit**: YES - `feat: integrate LRU memory management`

---

### Wave 4: 测试与优化（4 个任务）

- [ ] 18. **性能基准测试用例** `[deep]`

  **What to do**: 创建完整测试套件。

  **Acceptance Criteria**: 覆盖所有性能指标，生成对比报告。

  **Commit**: YES - `test: add performance benchmarks`

---

- [ ] 19. **Worker 降级方案测试** `[quick]`

  **What to do**: 测试降级场景。

  **Acceptance Criteria**: 降级后功能正常。

  **Commit**: YES - `test: add worker fallback tests`

---

- [ ] 20. **大批量压力测试** `[unspecified-high]`

  **What to do**: 500+ 张图片处理测试。

  **Acceptance Criteria**: 处理成功，内存达标，UI 响应。

  **Commit**: NO (测试报告)

---

- [ ] 21. **内存泄漏检测与修复** `[unspecified-high]`

  **What to do**: 检测并修复内存泄漏。

  **Acceptance Criteria**: 无明显泄漏，GC 后内存回落。

  **Commit**: YES (如需修复)

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  验证所有 Must Have 已实现，所有 Must NOT Have 未违反。检查证据文件存在。

- [ ] F2. **Code Quality Review** — `unspecified-high`
  运行 `tsc --noEmit` + `vitest`。检查代码质量：无 `as any`、无空 catch、无 console.log。

- [ ] F3. **Performance Comparison Report** — `deep`
  运行 `npm run test:perf`，生成优化前/后对比报告。输出性能提升百分比。

- [ ] F4. **Scope Fidelity Check** — `deep`
  验证每个任务的实现与规格一致，无范围蔓延。

---

## Commit Strategy

- **Wave 0**: `feat(perf): add technical research and validation`
- **Wave 1**: `feat(worker): add worker infrastructure and types`
- **Wave 2**: `feat(worker): implement core worker processing`
- **Wave 3**: `feat(ui): integrate worker and virtual list`
- **Wave 4**: `test(perf): add performance benchmarks`

---

## Success Criteria

### Verification Commands
```bash
npm run test:perf

# 预期输出:
# [PASS] Worker Processing: 50 张 4K 图片, UI FPS > 30
# [PASS] Virtual List: 1000 文件首屏 < 100ms
# [PASS] Memory: 200 张图片峰值 < 500MB
# [PASS] Throughput: > 4 张/秒
```

### Final Checklist
- [ ] 所有 Must Have 功能已实现
- [ ] 所有 Must NOT Have 未违反
- [ ] 所有测试通过
- [ ] 性能对比报告显示显著提升