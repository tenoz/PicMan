# 归档：CLAUDE.md（v1.2.2 快照，2026-09-26）

> 归档时间：2026-10-29。原因：项目统一为 `AGENTS.md` 作为唯一真相源，`CLAUDE.md` 改为指针。
> 本文件仅作历史留存，不再维护。内容如与现状冲突，以代码和 `AGENTS.md` 为准。

原内容如下。

---

# PicMan 图片侠

> 离线批量图片处理工具 | Tauri + React + TypeScript

## 项目信息

| 项目 | 值 |
|------|-----|
| 版本 | v1.2.2 |
| 平台 | Web / macOS / Windows / Linux |
| 许可证 | MIT |

## 开发命令

```bash
npm run dev          # 开发模式 (localhost:5173)
npm run build        # 前端构建
npm run bundle       # 桌面应用打包 + 打开 dmg (Apple Silicon)
npm run tauri:build  # 仅桌面应用打包
npm run test:perf    # 运行性能和单元测试
npx vitest run src/utils/__tests__/*.test.ts    # 单元测试 (utils)
npx vitest run src/hooks/__tests__/*.test.tsx   # 单元测试 (hooks)
```

## 技术栈

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Desktop**: Tauri 1.x (Rust)
- **Image Processing**: Canvas API 主线程处理
- **Testing**: Vitest

## 项目结构

```
src/
├── App.tsx                    # 主组件 (~1845行)
├── types.ts                   # 类型定义
├── constants.ts               # 常量与默认配置
├── index.tsx                  # 入口
├── index.css                  # Tailwind v4 入口（@theme 定义 brand 色阶）
├── components/
│   ├── ConfigPanel.tsx        # 配置面板
│   ├── ImportZone.tsx         # 导入区域
│   ├── LogViewer.tsx          # 日志查看器
│   ├── VirtualFileList.tsx    # 虚拟滚动文件列表
│   └── FileList/              # FileList 子组件
│       ├── index.tsx
│       ├── FileItem.tsx
│       ├── FileGrid.tsx
│       └── FolderTabs.tsx
├── hooks/
│   ├── useExport.ts           # ZIP/目录导出
│   ├── useFileManagement.ts   # 文件管理（待接入）
│   ├── useProcessing.ts       # 图片处理（已接入）
│   ├── useNotifications.ts    # 通知系统（待接入）
│   └── __tests__/             # Hooks 测试
├── services/
│   └── imageProcessor.ts      # Canvas API 图片处理
└── utils/
    ├── index.ts               # 通用工具函数
    ├── sound.ts               # 合成音效
    ├── taskScheduler.ts       # 任务调度器
    ├── lruCache.ts            # LRU 缓存
    ├── blobManager.ts         # Blob 管理
    ├── memoryMonitor.ts       # 内存监控
    └── __tests__/             # 工具函数测试
```

## 当前技术债务

### 1. 组件过大 (App.tsx ~1845行)
- **状态**: 渐进式迁移中（已从 ~2300 行降至 1845 行）
- **方案**: 使用 hooks 拆分业务逻辑
- **已完成**: P0-P3 重构（useProcessing hook 接入、VirtualFileList、目录统一、Worker 移除，-1,867 行死代码）
- **待做**:
  - useFileManagement hook 接入
  - Info Modal / 通知栏 拆分成独立组件
  - 工具函数去重

### 2. 单元测试
- **状态**: ✅ 156 tests passing
- **已知超时**: `stress.test.ts` (500张，jsdom 不支持 Canvas API)

## 关键规则

1. **测试**: 所有新功能需添加 Vitest 单元测试
2. **构建**: 打包前运行 `npm run build` 验证，开发完成后执行 `npm run bundle` 打包并打开安装包
3. **迁移**: 大组件重构使用渐进式 (hooks 提取)
4. **禁止**:
   - `@ts-ignore` / `as any` 类型跳过
   - 空 catch 块
   - 密钥/Token 进代码
5. **Tauri 文件系统**: 外置硬盘导出需在 `tauri.conf.json` 的 `scope` 中添加 `/Volumes/**`

## 打包输出

```
src-tauri/target/release/bundle/
├── dmg/PicMan_1.2.2_aarch64.dmg   # Apple Silicon
├── dmg/PicMan_1.2.2_x64.dmg       # Intel
└── macos/PicMan.app               # 未签名 app
```

> 文件名里的版本号由 `package.json` 决定（v1.2.2 起以它为唯一来源）。
> ⚠️ 截至 2026-09-26，`bundle/` 里实际仍是 **1.2.1** 的产物——自 2026-06-21 起未再打包。
