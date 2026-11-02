# AGENTS.md

> AI 进入 PicMan 的第一份文件。读完这页再动手，不要先读代码。
> `CLAUDE.md` 只是指向本文件的指针，内容以本文件为准。

## 一句话

PicMan（图片侠）是一款**离线**批量图片处理桌面工具：Tauri 1.8 + React 19 + TypeScript，图片处理走浏览器 Canvas API，不联网、不上传。

## 硬规则（违反即返工）

1. **新功能必须带 Vitest 单元测试**，测试放在 `src/utils/__tests__/`、`src/hooks/__tests__/` 或 `src/components/__tests__/`（组件测试，`vitest.config.ts` 的 `include` 三处都覆盖）。
2. **改完必须跑验证**：`npm test` 全绿 + `npm run typecheck` 0 错误 + `npm run build` 通过。不为跑通去注释报错或加 `@ts-ignore` 绕过。
3. **禁止** `@ts-ignore`、`as any`、空 `catch {}`。现有 **14 处**历史遗留，几乎都在 `window.__TAURI__` 相关处（`App.tsx` / `utils/index.ts` / `ImportZone.tsx` / `useExport.ts` / `imageProcessor.ts`）。改到时用类型声明替换——**但 `src/tauri.d.ts` 目前并不存在**，得自己建，别照抄旧文档去引一个空路径。
4. **密钥不进代码、不进 commit、不进日志**。`vite.config.ts` 的 `define` 会把环境变量**内联进构建产物**，改之前想清楚。
5. **删除任何文件/目录前必须先问**：说明原因、影响、不可逆部分，等明确确认。不使用 `rm -rf`。
6. **文档与代码同步改**：改了命令 → 改本文件；改了组件 props → 改 `docs/component-api.md`；改了视觉规则 → 改 `DESIGN.md`。
7. **Tauri 文件系统权限**：导出到外置硬盘需要在 `src-tauri/tauri.conf.json` 的 `fs.scope` 里加 `/Volumes/**`（已加）。

## 常用命令

| 场景 | 命令 |
|------|------|
| 开发（浏览器） | `./start.sh` → **localhost:3000**（等价 `npm run dev`） |
| 开发（桌面窗口） | `./start.sh tauri` |
| 预览生产构建 | `./start.sh preview` → localhost:4173 |
| 前端构建 | `npm run build` |
| 桌面打包（Apple Silicon） | `npm run bundle` → `releases/PicMan_<ver>_aarch64.dmg` |
| 桌面打包（Intel） | `npm run bundle:x64` → `releases/PicMan_<ver>_x64.dmg` |
| 桌面打包（两个架构） | `npm run bundle:all` |
| 打包脚本本体 | `scripts/build-dmg.sh`（见坑 39，别改回原生 dmg） |
| 单元测试 | `npm test`（已排除压测）|
| Rust 单测 | `cd src-tauri && cargo test` |
| 性能基准 | `npm run test:bench` |
| 版本号同步 | `node scripts/sync-version.mjs` |

桌面启动器：`/Applications/PicMan 启动.command`（双击弹出模式菜单，内部调 `./start.sh`）。

## 发版流程

**顺序不能反**：产物必须由 **tag 指向的那份代码**构建出来，否则「这个包里到底是哪版代码」说不清。

1. **代码定稿并提交**，`git status --short` 为空
2. **升版本号**：`npm version <patch|minor|major> --no-git-tag-version` + `npm run version:sync`，提交
   > 别用 `npm run version:minor`：它会先 commit + tag，而同步那三个文件发生在其后，tag 会指向版本号还没对齐的代码。
3. **打 tag**：`git tag -a v<ver> -m "..."` —— **必须在打包之前**
4. **确认工作区就是 tag 的内容**：`git describe --tags --exact-match HEAD` 应输出 `v<ver>`，`git status --short` 应为空
5. **打包**：`npm run bundle:all`，脚本会打印每个包的 md5 / sha256 / 大小
6. **填发布说明**：校验和写进 `releases/RELEASE_NOTES.md`。**每次重打包都要重算**——包一重打，哈希就变
7. **提交说明文档**（纯文档改动，不影响产物）
8. **建 GitHub Release**：
   `gh release create v<ver> --title "PicMan v<ver>" --latest --notes-file releases/RELEASE_NOTES.md releases/PicMan_<ver>_aarch64.dmg releases/PicMan_<ver>_x64.dmg`
   > **tag 和 Release 是两件事**。`git push --tags` 只推 git 的 tag，**Releases 页面不会有任何东西**。Release 是 GitHub 的独立对象，带附件和下载统计，必须单独建。

**推送**：默认只提交不推，要推得单独说；推时**必须带 `--tags`**，否则代码上去了、版本标记还在本地。

**产物不进 git**：`.gitignore` 有 `*.dmg`，只有 `releases/RELEASE_NOTES.md` 入库。

**远端只放快照**：GitHub `main` 是单提交孤儿，不携带本地开发历史。做法（`git commit-tree` + force push）见 `docs/development.md` §8。

## 目录地图

```
src/App.tsx            主组件（2000+ 行，仍在拆）
src/components/        界面组件：NotificationStack / ConfigPanel / VirtualFileList / ProcessingBar / LogViewer / ImportZone …
src/hooks/             useProcessing、useExport（已接入）；useFileManagement、useNotifications（未接入）
src/services/          imageProcessor（Canvas 管线）、nativeBridge、workspace（产物落盘）、
                       rustPng / rustJpeg / rustTranscode（原生编码）、systemZip、autoLog
src/utils/             纯函数：调度器、重命名、MIME、图片头解析、EXIF 字节、日志文本化、中文格式化
src-tauri/src/         main.rs（菜单 + 5 个命令）、image_ops / jpeg_ops / archive
```

逐个文件的作用见 `docs/architecture.md` §8。

## 数据流（三步）

```
导入 handleFilesAdded → 处理 useProcessing/processImage → 导出 useExport
  └ 生成 previewUrl          └ processedPath（桌面端）/ Blob（浏览器）  └ copyFile / 本机 ZIP
                              （落盘成功就不留 Blob，内存与批次无关）
```

## 已知坑（39 条）

**详细内容在 `docs/pitfalls.md`**，这里只留索引——命中编号就去看对应条目。

| # | 一句话 | # | 一句话 |
|---|---|---|---|
| 1 | 端口两处同改，漏一处白屏 | 21 | 原生直读四前提，缺一退回 |
| 2 | 状态一个源头，`isPaused` 优先 | 22 | PNG 档位差两个数量级 |
| 3 | 验证用 `npm test`，压测单跑 | 23 | 无 `path.tempDir`，用 `resolveWorkDir` |
| 4 | `typecheck` 必须 0 错误 | 24 | `fs.scope` 不含 `/tmp` |
| 5 | Worker 已移除，`concurrency` 假并发 | 25 | 测原生必须 `--release` |
| 6 | EXIF 只对 JPEG 生效 | 26 | `encode_jpeg` 用 snake_case |
| 7 | 列表无缩略图，点名字看预览 | 27 | mozjpeg 首编约 7 分钟 |
| 8 | 拖放慢在 `readBinaryFile` | 28 | 日志一天一文件，只追加 |
| 9 | 进度按「已读 / 总数」算 | 29 | 日志清理只删自己生成的 |
| 10 | 导入只读文件头，不解码 | 30 | `addLog` 同步写 `logsRef` |
| 11 | 列表更新要攒批 | 31 | Virtuoso 引用必须稳定 |
| 12 | 产物只在磁盘，Blob 为空 | 32 | 去重键别带 `lastModified` |
| 13 | 产物在 `releases/`，不在 target | 33 | `inflightKeys` 别在 finally 清早 |
| 14 | crates.io 不通走 rsproxy | 34 | CSS 禁用挡不住 `el.click()` |
| 15 | PNG 重压只桌面端生效 | 35 | 节流末尾的中间值要补发 |
| 16 | jsdom Blob 无 `arrayBuffer()` | 36 | 配置用 ref，别闭包捕获 |
| 17 | 时序测试别用 sleep 卡点 | 37 | 删大段 JSX 立刻跑 tsc |
| 18 | JSX 裸写 `//` 会渲染成文字 | 38 | `processFiles()` 不等于完成 |
| 19 | 游标已在 base 层兜底 | 39 | 打包必须走 `build-dmg.sh` |
| 20 | 原生编码走 PNG 中间件 | | |

## 文档索引

| 文档 | 内容 |
|------|------|
| `TODO.md` | 当前任务、优先级、进度 |
| `docs/pitfalls.md` | **39 条已知坑的完整版**（现象 → 根因 → 怎么绕） |
| `DESIGN.md` | 视觉规则（色板、字号、间距、状态色） |
| `docs/project-overview.md` | 项目整体说明 |
| `docs/architecture.md` | 架构、数据流、逐文件职责 |
| `docs/development.md` | 开发方式、命令、回归清单、发版细节 |
| `docs/component-api.md` | 组件与 hook 的 props / 返回值 |
| `docs/user-guide.md` | 面向用户的功能说明 |
| `CHANGELOG.md` | 版本变更记录 |

## 改本文档的规则

- 结论先行，能删就删，不写"本文件介绍了……"这类废话。
- 命令必须实跑验证过再写进去。
- **控制体积**：本文件必须落在注入窗口内（实测约 9 KB）。超了就把细节沉到 `docs/`，这里只留一行索引。判据是「不看这条会不会犯原则性错误」，不是「这条有没有用」——有用但只影响某个模块的，都该进 `docs/`。
- 坑记录格式：现象 → 根因 → 怎么绕。不写"注意一下"。
