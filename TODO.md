# TODO.md

> 当前任务、优先级、进度。只写"正在做/要做"的，做完的进 `CHANGELOG.md`。
> 详细方案见 `docs/整改计划-v1.3.0.md`。
> 更新日期：2026-11-02

## 下一步（已定计划，待实施）

> **1.3.0 已打包**（2026-11-02）。两个架构的 dmg 都在 `releases/`，说明见 `releases/RELEASE_NOTES.md`。
> 接下来等老大实际用过之后决定改什么。

## 进行中

- [x] **打包 v1.3.0**（2026-11-02 完成）
  - 版本号 1.2.2 → 1.3.0，四处一次同步（package.json / tauri.conf.json / Cargo.toml / constants.ts）
  - `PicMan_1.3.0_aarch64.dmg` 3.6 MB / `PicMan_1.3.0_x64.dmg` 3.8 MB，两个都挂载验过：版本 1.3.0、架构分别 arm64 / x86_64
  - `npm run bundle` 的 dmg 那步原本是坏的（create-dmg 要 Finder 自动化权限），已封装成 `scripts/build-dmg.sh`：`npm run bundle` / `bundle:x64` / `bundle:all` 现在都是一键，自动清残留挂载点、封包、算校验和（详见 AGENTS 坑 37）
  - 发布说明 `releases/RELEASE_NOTES.md`，旧的 1.2.1 版备份为 `RELEASE_NOTES-1.2.1.md`

- [x] **P3 第 3 步：产物不再占内存**（2026-11-02 完成）
  - `useProcessing` 落盘成功后不再往 `AppFile` 里塞 Blob：`processedBlob: processedPath ? undefined : finalBlob`
  - 预览 / 单张下载改走 `readBlobFromPath` —— 用的时候读一张、用完就扔
  - 拆掉 `processedBlobCache`、`MEMORY_SOFT_LIMIT`、`evicted` 字段与「已释放」徽章
  - 判断产物在不在统一用 `processedBlob || processedPath`（`VirtualFileList` 的下载按钮原来只认 Blob，落盘后就永远灰着）
  - 新增 `utils/mime.ts` 的 `mimeOf`（原来藏在 `useExport` 里，现在预览/下载/导出三处共用）
  - **`utils/lruCache.ts` 与它的 30 条测试暂留**：已无人引用，但删文件要老大点头
  - 新增 7 条单测（workspace 读回 3 / mime 4），全套 387 → 394

- [x] **信息提示条重新规划**（2026-11-02 完成，方案 A）
  - 抽出 `components/NotificationStack.tsx`：成功/提示 3.5s 自动消失，警告/错误常驻手动关
  - 多条堆叠最多 3 条，超出折「还有 N 条」，取消翻页；**常驻类优先占位**，警告不会被成串「导出完成」挤进折叠
  - 背景改不透明、长文本换行、图标按语义重配（✓ ⓘ ⚠ ✕）
  - 位置水平仍在顶部居中，垂直 `top-4` → `top-20`——原来正好压在 64px 高的顶栏上（TODO 里"待确认"的那条，实测确认会压）
  - `onDismiss` 必须 `useCallback`，否则卡片计时器被反复重置，3.5s 永远走不完
  - id 改自增（原 `Date.now()` 同毫秒两条会撞）；通知列表留 50 条上限
  - 新增 10 条单测

- [x] **亮 / 暗 / 跟随系统**（2026-11-02 完成）
  - 前提纠正：`index.css` 早就是 `@custom-variant dark (&:where(.dark, .dark *))`，`dark:` 走的是 class 而非 `prefers-color-scheme`——要做的是「补三态」，不是「从零做跟随」
  - `utils/theme.ts`：`ThemeMode` 三态 + `normalizeThemeMode`（老值 `light`/`dark` 原样认，脏值回落 `system`）+ `resolveIsDark`（手动压过系统）
  - `components/ThemeSwitch.tsx`：三个并排图标，带 `aria-pressed`；放在面板标题行，**不在 `locked` 层里**（切主题跟任务无关）
  - 跟随模式监听 `matchMedia('(prefers-color-scheme: dark)')`，系统切档实时响应
  - `.dark` 只挂 `<html>`，App 顶层 div 那处重复挂载已删
  - 首屏由 `index.html` 内联脚本提前上色，深色系统用户不再看到白闪
  - 新增 9 条单测（theme 6 / ThemeSwitch 3）

- [x] **进度条完成态**（2026-11-02 完成）
  - `ProcessingBar` 收成三态 `state: 'running' | 'paused' | 'done'`，**删掉原来的 `paused` 布尔**——两个标志各说各话就是坑 2 的源头
  - 完成态显示「成功 N · 跳过 M · 失败 K · 耗时 X s」，条填满；**有失败转琥珀，全成功才转绿**
  - 三条槽位共用 `hooks/useTaskBarDone.ts`（`done / finish / clearAll / dismiss`），活跃标志→三态走 `utils/taskBar.ts` 的 `resolveBarState`，暂停优先
  - 快照在计数清零**之前**抓（导入的 `finally` 第一件事就是 `setImportDone(0)`，晚一步就显示「成功 0」）
  - 收起时机：任一新任务开始（导入/处理/导出三处起点都调 `clearAll`），或手动点 ×
  - 新增 17 条单测（组件 +4 / hook +6 / 纯函数 +7），全套 341 → 358 全过

- [x] **导出扁平化目录**（2026-11-01 完成，按老大反馈修正过一次）
  - 语义：摊平的是**最外层目录以内**的层级——拖进 `a` 导出还是 `a/x.jpg`，不是散在目标目录根下
  - 输出组新增「扁平化目录」开关，ZIP 与目录导出共用
  - ZIP：`utils/zipGrouping.dedupeNames` 整批去重（撞名加 `_1`、`_2`）
  - 目录：走原有 `resolveFreePath`，覆盖模式下也强制加序号，避免静默覆盖
  - 去重表按**最终相对路径**算，`a/x.jpg` 和 `b/x.jpg` 不同名，不会互相牵连
  - 顺带：整批来自同一目录时 ZIP 包名改用目录名

- [x] **重命名 · 只用序号**（2026-11-01 完成）
  - `RenameRule` 新增 `sequenceOnly`：名字主体换成 `001、002…`，原名与查找替换不参与，前缀/后缀仍生效
  - 面板「重命名」组加勾选；勾上后自动开启序号、隐藏无意义的连接符、置灰查找/替换
  - 老配置加载时用默认值补齐新字段；新增 8 条单测（rename.test.ts 共 26 条）

- [x] **完整的批量重命名 · 第一版**（2026-11-01 完成）
  - `src/utils/rename.ts`：前缀 / 后缀 / 查找替换 / 序号（起始值 + 补零位数 + 连接符），纯函数 + 18 条单测
  - ZIP 与目录导出共用同一套命名，序号按整批连续；单张下载沿用同一规则
  - 设置面板「输出」组新增可展开的重命名块 + 实时预览；旧 `filenameSuffix` 自动迁移
  - 未做：扁平化目录（已于同日补齐，见本栏第一条）

- [x] **交互 Bug 六个 + 设置面板重构**（2026-10-31 完成，commit 1b8fcf0 / a40f15d）
  - 计划与根因见 `docs/计划-面板重构与交互修复.md`，改动明细见 `CHANGELOG.md` Unreleased

- [x] **P0 止血**（2026-10-29 完成）
  - [x] 进度条不显示 —— 三个死状态改为指向 `useProcessing` 的别名；新增列表下方 `ProcessingBar`（计数/当前文件/吞吐/ETA）
  - [x] 顶栏阴影过深 —— `shadow-sm/50`（50% 纯黑）改为 `0 1px 2px rgba(16,24,40,0.04)`，暗色取消阴影
  - [x] ⌘H 无效 —— `main.rs` 补 `MenuItem::Hide / HideOthers / ShowAll`，原生绑定 ⌘H / ⌥⌘H
  - [x] 体积膨胀严格跳过 —— 新增 `sizeInflationPolicy`（严格/仅无损编辑），配置面板可切；列表与徽章展示"处理会 +xx%"

- [x] **清理收尾**（2026-10-29 完成）
  - [x] `utils/blobManager.ts` + 18 个测试（功能已被 LRUCache 覆盖）
  - [x] `hooks/useFileManagement.ts` / `useNotifications.ts` / `hooks/index.ts` —— 保留，P1 重构时决定去留

- [x] **文档体系落地**（本次进行）
  - [x] `AGENTS.md` 立为唯一真相源，`CLAUDE.md` 改指针
  - [x] 补齐 8 份文档
  - [x] 清理清单已执行（项目体积 3.8 GB → 314 MB），备份在 `~/Downloads/PicMan-清理备份-20261029/`

- [x] **P1 体验**（2026-10-29 完成）
  - [x] 通知条移到底部居中，进度栏可见时上移到 `bottom-20` 避让
  - [x] 列表抖动/闪动：竖条常驻占位、回调改稳定引用、去掉 `loading="lazy"`、导入时生成 200px 缩略图
  - [x] 日志三 Tab（正常/异常/错误）+ 操作汇总日志 + 2000 条上限 + 红点改 `useMemo`

- [x] **P2 性能**（2026-10-29 完成）
  - [x] ZIP 改 `compression: 'STORE'`
  - [x] 处理产物 512MB 字节预算 + LRU 真正落地（淘汰项标 `evicted`、列表显示「已释放」）
  - [x] 调度器去全量排序（排序缓存 + `getStats` 单次遍历）
  - [x] 导入去重改 Set
  - [x] 删无用依赖 `sharp` / `uuid`
  - [ ] EXIF 改字节拼接 —— **挪到 P3**（手写 TIFF 去 Orientation 风险高，随编码一起搬 Rust 更稳）

- [x] **P3 编码质量 · 第一刀**（2026-10-29 完成）
  - [x] Rust 侧 `optimize_png` 命令（oxipng 10，MIT），桌面端 PNG 输出无损重压
  - [x] 前端 `services/rustPng.ts`：临时文件 + 路径传递，失败自动退回 canvas 产物
  - [x] Rust 3 个单元测试（压小 / 幂等 / 文件不存在）

## 待办

- [ ] **P3 第二刀**（JPEG 已接管，直读路径已打通）
  - [x] canvas 改出 PNG 中间文件 → Rust 解码 → `mozjpeg-rs`（BSD-3）编码 JPEG（2026-10-30）
  - [x] EXIF 用字节解析去掉 piexifjs 的三次 base64（`utils/exifBytes.ts`，原生编码路径已生效）
  - [x] **绕开二进制 IPC**：拖放时保留源路径（`__picmanSrcPath`），Rust 直接读原图 → 解码 → 编码。3000×2000 单张 712ms → 265ms（2026-10-31）
  - [ ] 直读还没覆盖「有缩放/旋转」的场景 —— **暂缓**：老大平时不缩放，收益为零；等真有需求再让 Rust 做 resize（`image` crate 的 Lanczos3 与 canvas 观感不同，需先对比）
  - [x] 产物直接写盘、导出走文件复制（2026-11-02 第 1、2 步完成，第 3 步见「下一步」第 4 条）
  - [ ] WebP 有损需 libwebp 绑定（`image-webp` 只有无损）
  - [ ] 水印渲染要中文就得内嵌 CJK 字体（10MB+），**暂不做**
  - [ ] pngquant 暂缓（libimagequant 是 GPL-3.0，与项目 MIT 冲突）

## 待决策

- [ ] **JPEG 原生编码要不要当默认** —— 等老大跑「原生 + 并发 6」的对照批次（要总耗时和总体积两个数）。单张 265ms vs 内置 45ms 慢 6 倍，但批量靠并行能摊薄，且体积小 44%
- [x] 体积膨胀是否连格式转换也跳过 —— 已按"严格跳过"实现，并留了"仅无损编辑"开关
- [x] 清理清单确认 —— 已执行（见 `docs/体检报告-2026-10-29.md` 第五节）
- [ ] `GEMINI_API_KEY` 处置：删 `vite.config.ts` 的 `define` + 吊销 key
- [ ] `index.html` 里 esm.sh 的 importmap 是否移除（与"离线可用"冲突）

## 已排期但不阻塞

- [x] `npm run tauri:dev` 端口不一致（3000 vs 5173）—— 2026-11-01 已统一为 3000
- [x] 加 `"typecheck": "tsc --noEmit"` 脚本并清零历史类型错误（原 13 处）—— 2026-11-01 完成
- [x] `README.md` 两处修正（版本徽章、不能直接打开 index.html）—— 2026-11-01 完成
- [x] 删掉 `thumbnailGenerator.test.ts` 与 `imageProcessing.bench.ts`（2026-11-01，已移到 `~/Downloads/PicMan-删除备份-20261101/`）
- [ ] `package-lock.json` 纳入版本管理（现被 gitignore）
- [ ] `App.tsx` 拆分：Info Modal / 通知栏 抽成组件
- [ ] `docs/component-api.md` 随组件改动同步（持续）

## 已完成（2026-10-29）

- [x] 8 份规范文档落地（AGENTS / CLAUDE 指针 / TODO / DESIGN / project-overview / architecture / development / component-api / user-guide）
- [x] `AGENTS.md` 立为唯一真相源
- [x] `CHANGELOG.md` + 2 个测试文件的乱码修正
- [x] `tsconfig.json` 加 `exclude`，类型检查从"一片噪音"变成可读的 8 处真错误
