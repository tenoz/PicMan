# 组件与 Hook API

> 改组件 props 时同步改这一页。签名以代码为准，本页只做索引与约束说明。

## 组件

### `VirtualFileList`（`src/components/VirtualFileList.tsx`）

文件列表主体，基于 `react-virtuoso` 做虚拟滚动（单列列表视图），内含文件夹 Tab 与批量操作工具栏。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | `AppFile[]` | 是 | 全量文件（内部自行按 `activeFolder` 过滤） |
| `selectedIds` | `Set<string>` | 是 | 选中集合 |
| `onToggleSelection` | `(id) => void` | 是 | 单项选中切换 |
| `onSetSelection` | `(ids: string[]) => void` | 是 | 整体替换选中集（全选/反选） |
| `onRemove` | `(id) => void` | 是 | 移除单项 |
| `onRemoveFiles` | `(ids) => void` | 是 | 批量移除 |
| `onProcessSingle` | `(file) => void` | 是 | 处理单张 |
| `onProcessFiles` | `(files) => void` | 是 | 处理选中 |
| `onDownloadSingle` | `(file) => void` | 是 | 下载单张 |
| `onPreview` | `(file) => void` | 是 | 打开预览弹窗 |
| `sortOption` | `SortOption` | 是 | 当前排序 |
| `onSortChange` | `(method) => void` | 是 | 排序变更 |

注意事项：
- 内部两个子项组件 `ListItem` / `GridItem` 已 `React.memo`，**父级传的必须是稳定引用的回调**（它们接收 `(id)` / `(file)`，不是闭包）。App 侧这些 handler 全部用 `useCallback` 包裹，破坏这一点会让 1000 行列表每次状态变化都全量重渲染。
- `isProcessing` 以内部计算 `isAnyProcessing` 传入每个行；它只在一批任务的开始/结束各变一次，影响可控。
- **列表不显示缩略图**：导入时只读文件头取宽高，列表左侧是类型图标，点击图标打开原图预览。不要在这里加回缩略图——那是导入慢的主因（1118 张要多花 100 秒以上）。
- 体积膨胀回退的行用 `file.inflation` 展示 `处理会 1.51 MB (+26%)`，并按 `isSkipped` 显示"保留原图"徽章（hover 有原因说明）。
- 左侧选中竖条是**常驻**的（未选中为透明），改动时别让它只在选中时出现，否则内容会横向跳 4px。

### `ImageTypeBadge`（`src/components/ImageTypeBadge.tsx`）

列表左侧的文件类型图标，替代原来的缩略图占位。图标取本地 FA Pro 6.7.2 solid 的 SVG path 内联，不引图标字体、不联网。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 文件名，按扩展名决定图标与颜色 |
| `onClick` | `() => void` | 否 | 点击回调（列表里传的是预览原图） |
| `size` | `number` | 否 | 图标边长 px，默认 20 |

映射：JPG/JPEG → `file-jpg` 天蓝、PNG → `file-png` 绿、GIF → `file-gif` 琥珀、WebP/BMP → `file-image` 紫、其它 → `file` 灰。扩展名大小写不敏感。单测在 `src/components/__tests__/ImageTypeBadge.test.tsx`。

### `ProcessingBar`（`src/components/ProcessingBar.tsx`）

**导入 / 处理 / 导出共用的任务进度栏**，固定在文件列表下方，可同时出现多条（如导出中又导入）。顶栏不再显示任何进度，避免重复。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `visible` | `boolean` | 是 | 是否显示（组件内直接返回 null） |
| `tone` | `'brand' \| 'sky' \| 'emerald'` | 是 | 处理=brand，导入=sky，导出=emerald |
| `label` | `string` | 是 | 状态文案，如「处理中」「导入已暂停」「处理完成」 |
| `percent` | `number` | 是 | 0–100，内部做 clamp；`done` 态一律按 100 填满 |
| `done` / `total` | `number` | 否 | 有值才显示 `137 / 500`，`done` 态不显示 |
| `detail` | `string` | 否 | **第二行**：当前文件名或阶段说明，`done` 态不显示 |
| `meta` | `string` | 否 | 第一行右侧：吞吐 / 剩余时间（窄屏可省） |
| `state` | `'running' \| 'paused' \| 'done'` | 否 | 三态，缺省 `running`。**取代了原来的 `paused` 布尔**——一个源头，不再两个标志各说各话 |
| `indeterminate` | `boolean` | 否 | 进度不确定：不显示百分比，改成来回跑的色块（打包 ZIP 用） |
| `result` | `TaskBarDone` | 否 | 完成态快照，给了才渲染「成功 N · 跳过 M · 失败 K · 耗时 X s」并决定颜色 |
| `onDismiss` | `() => void` | 否 | 完成态右上角的 × |

**这里只显示、不操作**：暂停/继续/终止统一收在顶部工具栏（`App.tsx` 的 `activeTaskKind` 决定按到哪个任务上），进度栏不再渲染按钮。曾经上下各有一套，用户反馈重复。唯一的例外是完成态的 ×——它只关掉这条提示，不碰任何任务。

**完成态**（`state='done'`）：不自动消失，停在原地给结论；进度条填满、条纹动画停住。**有失败转琥珀，全成功才转绿**——一律转绿正落进复盘里那类「界面说成功、实际啥也没干」。跳过不算失败（动图、处理后变大都是设计内行为）。收起时机只有两个：任一新任务开始（`useTaskBarDone.clearAll`），或手动点 ×。

**三条槽位共用一套状态机**（`hooks/useTaskBarDone.ts`）：`done / finish / clearAll / dismiss`，`finish(kind, snapshot)` 按 `'import' | 'process' | 'export'` 分槽。别在 `App.tsx` 里再给某一条单独加 `isDone` state——v1.2.2 就养出过三个永远为 `false` 的死状态。活跃标志到三态的推导走 `utils/taskBar.ts` 的 `resolveBarState(active, paused)`，**暂停优先**（`useProcessing.pause()` 不会把 `isProcessing` 置 false）。

**布局为什么分两行**：文件名长短不一，塞进第一行会把进度条挤得一会长一会短（用户实测反馈）。所以第一行只放固定宽度元素，文件名独占第二行并 `truncate`。

### `ConfigPanel`（`src/components/ConfigPanel.tsx`）

左侧配置面板，分两层：**顶部预设条** + **五组折叠面板**。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | `ProcessingConfig` | 是 | 当前配置 |
| `setConfig` | `(c: ProcessingConfig) => void` | 是 | 直接替换（预设与单字段共用） |
| `locked` | `boolean` | 否 | 处理/导入/导出进行中锁死整块面板 |

预设条：`画质优先 / 均衡 / 小体积 / 网页优化 / 高清存档` + 用户自定义（存 `localStorage.customPresets`）+「保存当前设置」。点胶囊即应用；与当前配置一致时高亮。hover 胶囊出现「以此预设为底另存为」和「删除」（仅自定义）。预设逻辑在 `src/utils/configPresets.ts`。

五组（`configPanelSections` 记折叠状态），**每组标题行右端有独立的「重置本组」按钮**，只把本组字段恢复默认，别组不受影响；任务进行中（`locked`）时按钮禁用：

| 组 | 内容 | 默认 |
|---|---|---|
| **输出** | 格式、质量、JPEG 编码、PNG 重压、防体积变大、**扁平化目录**（摊平最外层目录以内，外层保留）、ZIP 分组与打包方式 | 常驻展开，不可收起 |
| **重命名** | 前缀 / 后缀、查找替换、序号（起始/位数/连接符）、**只用序号**（名字换成 `001、002…`，与原名脱钩、查找替换失效、前缀后缀仍生效）、实时预览。**无启用开关**：字段全空即不改名 | 收起 |
| **变换** | 尺寸模式 + 数值、旋转、水平/垂直翻转 | 收起 |
| **标记** | 水印（开关/文本/位置/透明度）、EXIF 保留 | 收起（水印打开时自动展开并打点） |
| **性能** | 处理并发 `concurrency`、导入并发 `importConcurrency` | 收起 |

收起组的标题右侧显示当前值摘要（如「原尺寸 · 无旋转」「无水印 · EXIF 保留」），收起不丢信息。

**套用预设只覆盖输出外观**（格式/质量/尺寸/旋转翻转/水印/防膨胀/编码档位/后缀），**不动** `concurrency`、`importConcurrency`、`zipEngine`、`zipLayout`、`outputBaseDir`、`exportMode`——换个画质档不应该改掉你的并发和路径。

**`filenameSuffix`（文件名后缀）已被「重命名」组取代**：重命名是独立折叠组（2026-11-01 从输出组里提出来），规则类型与纯函数在 `src/utils/rename.ts`。规则没有 `enabled` 字段——是否生效完全看有没有填内容（`isRenameRuleActive`），老配置里残留的 `enabled` 会被忽略。作用于导出产物，扩展名始终跟输出格式走；ZIP 与目录导出共用同一套命名，序号按整批顺序连续。旧配置里的 `filenameSuffix` 在 `App.tsx` 的 `loadConfig` 里迁移成 `renameRule.suffix`，字段本身保留只为兼容。它和「导出模式」是两件事：`exportMode: 'rename'` 会在目标已存在同名文件时再自动加 `_1`、`_2`（保证不覆盖），重命名规则是先算出你要的文件名。

三个引擎/并发概念别混：`concurrency` 是**处理**图片时的并发（1–10），`importConcurrency` 是拖放导入时**读盘**的并发（1–16，默认 6）。

### `NotificationStack`（`src/components/NotificationStack.tsx`）

信息提示条。**方案 A**（2026-11-02 老大拍板），替代原来的「单条 + 翻页」。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `AppNotification[]` | 是 | 全量通知，组件自己决定显示哪几条 |
| `onDismiss` | `(id: number) => void` | 是 | **必须是稳定引用**（`useCallback`），否则自动消失计时器被反复重置，3.5s 永远走不完 |
| `onDismissAll` | `() => void` | 是 | 一键清空 |

`AppNotification` = `{ id, msg, type: 'success' \| 'error' \| 'warn' \| 'info', timestamp, task? }`。

**消失规则**：成功 / 提示 **5s 自动消失，鼠标悬停时暂停计时**（正在看就别抢走，移开后重新计满）；警告 / 错误**常驻**，必须人手动关——这类信息不该自己溜走。计时器放在单张卡片里，卡片一卸载 effect cleanup 就清掉。

**出入都有淡入淡出**：入场靠 CSS `animate-fade-in`（200ms，淡入 + 轻微下落）；出场靠 `leaving` state 先把 `opacity` 过到 0，**200ms 后才真正调 `onDismiss`**。直接调的话组件当场卸载，出场动画根本没机会播——点 × 也走同一条路。

**最多同时 3 条**，多出来的折成一行「还有 N 条」，**不翻页**。槽位分配有个讲究：**常驻类先占位**，剩下的名额给最新的临时类。否则一条警告会被后面涌进来的一串「导出完成」挤进折叠里，等用户发现时早没了。

**位置**：浮在顶栏上，水平居中、垂直居中于 64px 的顶栏内（`top-0 h-16 pt-3`）。之前放过顶栏下方（`top-20`），空出一条谁也不想要的缝。容器挂 `pointer-events-none`、卡片挂 `pointer-events-auto`，否则透明的容器会挡住顶栏按钮。

**背景 80% 半透明 + `backdrop-blur-sm`**，透出底下的顶栏，视觉上「嵌在顶栏里」但不占它的布局空间。长文本 `break-words` 换行。图标按语义：成功 `CheckCircle2`、提示 `Info`、警告 `AlertTriangle`、错误 `XCircle`。

> **类名必须写全**：`STYLES` 里存的是 `bg-emerald-600/80` 这种完整字符串。拆成 `bg-emerald-600` 再拼 `/80` 的话，Tailwind 静态扫描看不到后半截，透明度和底色会一起丢。

**id 必须自增**：原来用 `Date.now()`，同一毫秒发两条会撞成同一个 id，React 的 key 和 dismiss 都会错乱。现在由 `App` 的 `notificationSeqRef` 出号。列表另留 50 条上限——警告和错误不自动消失，挂一天会越积越多。

### `ThemeSwitch`（`src/components/ThemeSwitch.tsx`）

外观三态切换器：跟随系统 / 始终亮色 / 始终暗色，三个并排小图标（`Monitor` / `Sun` / `Moon`），当前档位高亮并带 `aria-pressed`。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `'light' \| 'dark' \| 'system'` | 是 | 当前模式 |
| `onChange` | `(m: ThemeMode) => void` | 是 | 点哪个回哪个，不做「循环切」 |

**为什么是三档而不是一个循环切的大按钮**：两态按钮看不出「现在是不是跟着系统」，用户点两下还在原地打转。

**明暗的实际判定只有一个地方**：`src/utils/theme.ts` 的 `resolveIsDark(mode, systemPrefersDark)`——手动选的压过系统。App 里挂 `<html>.dark`、顶栏图标的方向，都读它，不各算一遍。**`.dark` 只挂在 `<html>` 上**，`App` 顶层那个 div 不再重复挂（两处判断迟早不一致）。首屏那一帧由 `index.html` 的内联脚本提前设好，规则与 `resolveIsDark` 保持一致，避免深色系统用户看到白闪。

**位置在顶栏最右侧**（2026-11-02 从左侧设置面板挪过来，那边那个是重复入口，已删）。原来顶栏那个两态月亮/太阳按钮一并去掉——两态看不出「现在是不是跟着系统」，点两下还在原地打转。**全项目只有这一个外观入口**，别再加第二个。

`localStorage.theme` 存的就是这三态字符串；老版本只写过 `light` / `dark`，`normalizeThemeMode` 原样认，脏值一律回落 `system`。

编码相关的两个开关都默认"快"：

- `jpegEngine`：`builtin`（默认，canvas 编码）/ `native`（mozjpeg，体积 -30~45% 但慢 10 倍以上），`jpegLevel` 控制原生档位
- `pngOptimize`：`off`（默认）/ `fast`（oxipng -o0，约 +0.2s/张，省 20%）/ `small`（-o2，约 +3.3s/张，省 24%）

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | `ProcessingConfig` | 是 | 当前配置（受控） |
| `setConfig` | `(c: ProcessingConfig) => void` | 是 | 整体替换配置对象 |

注意事项：组件内部只做 `setConfig({ ...config, [key]: value })` 的浅合并，**新增配置项时必须在 `constants.ts` 的 `DEFAULT_CONFIG` 里给默认值**，否则旧配置从 localStorage 读出后会缺字段。

### `LogViewer`（`src/components/LogViewer.tsx`）

运行日志弹窗，支持复制单条 / 全部、导出 txt、清空。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `logs` | `LogEntry[]` | 是 | 全量日志（时间正序，内部反转） |
| `isOpen` | `boolean` | 是 | 是否展开 |
| `onClose` | `() => void` | 是 | 关闭 |
| `onClear` | `() => void` | 是 | 清空 |

三个分类 Tab（带实时条数，默认停在「正常」）：

- **正常** = `info` + `success`
- **异常** = `warn`
- **错误** = `error`

「复制全部」「导出」始终导出**全量**日志，不受当前 Tab 影响。日志总量在 `App.addLog` 里限制 2000 条，超出丢最早的。

**明细折叠**：`details` 超过 3 行时默认折叠，显示「展开明细（N 行）」，点开展开成可滚动的等宽块，再点「收起」。逐张处理记录不再单独成条——`App` 在处理期间把每张的「文件名 · 体积 · 耗时」攒进 `batchDetailRef`，批次结束时作为汇总日志的 `details` 一次性写出（1118 张的批次从 1118 条日志变成 1 条可展开的）。

### `ImportZone`（`src/components/ImportZone.tsx`）

空列表时的拖拽/点击导入区，基于 `react-dropzone`。

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `onFilesAdded` | `(files: File[]) => void` | 是 | 选中或拖入文件后回调 |

### `FileList/`（`src/components/FileList/`）

**已废弃，全项目零引用**（`index.tsx` / `FileItem.tsx` / `FileGrid.tsx` / `FolderTabs.tsx`）。
功能已被 `VirtualFileList` 取代。保留仅因未做清理，见 `docs/体检报告-2026-10-29.md`。

## Hooks

### `useProcessing`（`src/hooks/useProcessing.ts`）

| 入参 | 类型 | 说明 |
|------|------|------|
| `config` | `ProcessingConfig` | 默认配置；文件可用 `customConfig` 覆盖 |
| `concurrency` | `number` | 并发数，默认 2 |
| `onTaskStart` | `(file) => void` | 单张开始 |
| `onTaskComplete` | `(file) => void` | 单张完成（含跳过） |
| `onTaskError` | `(file, err) => void` | 单张失败 |
| `onProgress` | `(done, total) => void` | 进度 |
| `onAllComplete` | `(stats) => void` | 全部结束，`stats = { success, failed, skipped }` |

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `isProcessing` / `isPaused` / `progress` | 状态 | **UI 必须读这三个，不要再在 App 里另存状态** |
| `processFiles` | `(files) => Promise<void>` | 批量处理（会过滤掉已成功的） |
| `processSingle` | `(file) => Promise<AppFile \| null>` | 单张处理 |
| `pause` / `resume` / `cancel` | `() => void` | 流程控制 |

约束：
- 内部用 `TaskScheduler`，暂停是靠 `stopRef` + 调度器 `pause()` 双保险，**恢复必须先清 `stopRef`**，否则任务一进 `execute` 就抛"paused by user"。
- 防膨胀回退在 `processSingleFileInternal` 里，受两个字段共同控制：
  `preventSizeInflation`（总开关）与 `sizeInflationPolicy`（`'always'` 严格 / `'only-when-no-edit'` 仅未改格式尺寸时回退）。
  回退时会把"如果处理会有多大"写进 `AppFile.inflation = { attemptedSize, deltaPercent }`，列表用它做差异展示。

### `useExport`（`src/hooks/useExport.ts`）

| 入参 | 类型 | 说明 |
|------|------|------|
| `filenameSuffix` | `string` | 重命名模式的后缀，默认 `_processed` |
| `exportMode` | `'overwrite' \| 'rename'` | 覆盖原文件或改名 |
| `onExportStart` / `onExportProgress` / `onExportComplete` / `onExportError` | 回调 | 生命周期通知 |

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `isZipping` / `isZipPaused` / `zipProgress` | 状态 | ZIP 流程 |
| `isExporting` / `isDownloadPaused` / `exportProgress` | 状态 | 目录导出流程 |
| `exportToZip` | `(files, options?) => Promise<boolean>` | 按分组出包：`layout:'single'` 一个包，`'per-folder'` 每个顶层文件夹一个包（包名=目录名）。**桌面端超过 10MB 一律走本机压缩**（`ditto`，硬链接摆放，不按体积切包）——内置 JSZip 打 211MB 实测要 98 秒。`engine:'system'` 强制本机；`'builtin'` 只在体积 ≤10MB 或本机不可用（浏览器）时生效，后者按 300MB 切包防 OOM。传 `outputDir` 则只选一次目录 |
| `exportToDirectory` | `(files, dir) => Promise<{exported, failed, failedFiles}>` | 仅桌面端 |

配套模块：
- `utils/zipGrouping.ts` —— 纯函数：`groupFilesForZip` / `zipPathInGroup`（按文件夹打包时剥掉顶层目录）/ `sanitizeZipBaseName`
- `services/systemZip.ts` —— `canZipNatively()` / `zipEntriesNatively(entries, dest)`：写临时目录 → `invoke('zip_directory')` → 删临时目录；失败返回 `null` 由调用方回退内置
| `cancelZip` / `toggleZipPause` / `terminateZip` | `() => void` | ZIP 控制 |
| `cancelExport` / `toggleDownloadPause` / `terminateDownload` | `() => void` | 目录导出控制 |

约束：
- 暂停实现是 `setInterval` 100ms 轮询 ref，**终止必须同时把暂停标志置 false**，否则会卡在等待里。
- ZIP 用 `STORE`（图片已是压缩数据，DEFLATE 只烧 CPU）。
- `ZipExportOptions.outputDir` 由调用方（App）先弹一次目录选择再传进来；不传则退回 `saveFile` 逐个弹保存框——**切包时也只应该问一次**，别在循环里弹对话框。

## 工具函数（`src/utils/`）

| 模块 | 关键导出 | 状态 |
|------|----------|------|
| `index.ts` | `formatBytes` `loadFromStorage` `saveToStorage` `saveFile` `checkIsAnimated` `createStaticThumbnail` | 在用 |
| `taskScheduler.ts` | `TaskScheduler` 类 | 在用 |
| `lruCache.ts` | ~~`LRUCache` 类~~ | **已于 2026-11-02 删除**（产物改落盘后彻底没人用）。备份在 `~/Downloads/PicMan-删除备份-20261102/` |
| `memoryMonitor.ts` | `MemoryMonitor` `memoryTracker` `getMemoryUsage` | 调度器间接使用 |
| `thumbnailGenerator.ts` | `generateThumbnail(s)` | **仅测试引用**，主流程未接入 |
| `blobManager.ts` | `BlobManager` | **零引用** |
| `sound.ts` | `playSuccessSound` `playPauseSound` | 在用 |

## 类型约定

全量类型定义在 `src/types.ts`：

- `ProcessingConfig` —— 所有处理参数的唯一来源，新增字段必须同步 `DEFAULT_CONFIG`。
- `AppFile` —— 列表项的完整状态，`processedBlob` 是内存占用主因。
  - `previewUrl`：原图 blob URL，预览弹窗与 `processImage` 用。
  - `inflation`：体积膨胀回退时记录「处理会有多大」，供列表做差异展示。
- `LogEntry` —— `level` 只有 `info | success | warn | error` 四值，日志 Tab 分类依赖它。
