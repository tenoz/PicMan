# 架构与数据流

> 读完能回答三个问题：数据从哪来、在哪算、存哪去了。
> 已知瓶颈与改造方向在最后一节，改性能前必看。

## 1. 分层

```
┌──────────────── UI 层 ────────────────┐
│ App.tsx            状态中枢 + 弹窗     │
│ VirtualFileList    虚拟滚动列表         │
│ ConfigPanel        左侧配置             │
│ LogViewer          日志弹窗             │
│ ImportZone         拖拽导入             │
└───────────────┬───────────────────────┘
                │
┌──────────── Hook 层 ──────────────────┐
│ useProcessing   批量调度 + 暂停/终止    │
│ useExport       ZIP / 目录导出          │
└───────────────┬───────────────────────┘
                │
┌──────────── 能力层 ───────────────────┐
│ services/imageProcessor.ts  Canvas 管线 │
│ utils/taskScheduler.ts      任务调度    │
│ utils/lruCache.ts           产物缓存    │
│ utils/memoryMonitor.ts      内存压力    │
│ utils/thumbnailGenerator.ts 缩略图(未接入)│
└───────────────┬───────────────────────┘
                │
┌──────── 系统边界（Tauri）─────────────┐
│ window.__TAURI__: fs / dialog / path   │
│ / event / process                      │
└───────────────────────────────────────┘
```

关键事实：**没有后端、没有 Worker、没有 WebAssembly**。所有计算都在 WKWebView 主线程。

## 2. 三条主流程

### 2.1 导入

```
File[]（拖拽 / input / Tauri 文件拖放）
  → handleFilesAdded()
      ├ 去重（name + size + lastModified + webkitRelativePath）
      ├ 体积校验（≤100MB）
      ├ checkIsAnimated()   读前 1KB 判 GIF/动图 WebP
      ├ previewUrl = URL.createObjectURL(file)   ← 原图，给预览与处理用
      └ new Image() 解码 → 取 naturalWidth/Height（顺便喂给缩略图，避免二次解码）
  → setFiles([...新增, ...原有]) → 按 sortOption 排序
```

Tauri 环境下走 `tauri://file-drop` 事件，由 Rust 侧给路径，前端用 `tauri.fs.readBinaryFile` 读成 `File`，并手工挂 `webkitRelativePath` 还原目录结构（阶段一占进度 0–30%）。

### 2.2 处理

```
processFiles(queue)
  → new TaskScheduler({ concurrency: config.concurrency | 2 })
  → 每个任务执行 processSingleFileInternal(file)
      ├ 动图 → 直接复制原文件，标 isSkipped
      ├ processImage(file, config)
      │    ├ Image 加载（src = previewUrl，即原图 blob）
      │    ├ 算目标尺寸（fixed_width / fixed_height / scale）
      │    ├ 算旋转后的画布外接框（absCos/absSin）
      │    ├ drawImage + rotate + flip（+ JPEG 填白底）
      │    ├ 水印（drawWatermark：文字或图片，单点或平铺）
      │    ├ JPEG 输出且桌面端 + jpegEngine=native（**默认 builtin**）：
      │    │    canvas.toBlob('image/png') 出中间件 → 临时文件 → Rust `encode_jpeg`
      │    │    （mozjpeg 编码，EXIF 一并写入）→ 读回；失败则回退下面的通用路径
      │    ├ canvas.toBlob(format, quality)   ← 通用路径 / 回退路径
      │    ├ PNG 输出且 pngOptimize≠off（**默认 off**）→ 临时文件 → Rust `optimize_png` → 读回
      │    └ EXIF：piexif.load → 删 Orientation → insert（仅 JPEG 且未剥离且没走原生编码）
      └ 防膨胀：处理结果 > 原图 且 无编辑 → 回退原文件
  → 结果写回 files[].processedBlob，进度回调 setProgress
```

调度器每完成一个任务就调一次 `processQueue()`，重新对全部任务排序取队首。

### 2.3 导出

两条互斥路径：

- **ZIP**（浏览器/桌面通用）：JSZip 每 50 张打一个包，`generateAsync` 后立即触发下载，批次间 `setTimeout(100)` 让出主线程。
- **目录**（仅桌面）：`tauri.fs.writeBinaryFile` 逐文件写盘，每批 5 个并发，按 `webkitRelativePath` 重建目录，支持覆盖或重命名。

## 3. 状态模型

`App.tsx` 是唯一状态中枢，`files: AppFile[]` 是核心数据结构：

| 字段 | 作用 |
|------|------|
| `file` | 原始 File 对象（不可变） |
| `previewUrl` | 缩略图用 blob URL（当前是原图） |
| `status` | idle / processing / success / error |
| `processedBlob` | 处理产物，**常驻内存** |
| `isSkipped` / `isAnimated` | 跳过原因标记 |
| `dimensions` / `processingTime` | 展示用 |

派生态（`stats`、`folders`、`filteredFiles`、`hasPendingTasks`）用 `useMemo` 从 `files` 推导，不单独存。

**已知设计缺陷**：每个任务状态变化原本都用 `setFiles(prev => prev.map(...))` 造新数组，1000 张时是 O(n²)。现已改为 `patchFile` 攒批（100ms flush 一次），代价是列表状态最多延迟 100ms 可见。

## 4. 内存模型

- 每张图占两份：原始 `File`（磁盘缓存）、`previewUrl`（原图 blob URL，仅引用不占图像内存）。**不生成缩略图**，列表用类型图标。
- **产物只在磁盘上**（2026-11-02 第 3 步）：每批在 `~/Library/Caches/<bundle>/picman-tmp/work-<时间戳>/` 落一份，`AppFile.processedPath` 记绝对路径。**落盘成功后 `processedBlob` 就是 `undefined`**——内存占用与批次大小彻底无关。
  - `processImage` 内部仍会生成一张 Blob，但写完盘就随作用域释放，峰值只有并发数那么多张
  - 需要 Blob 的地方**按需读一张、用完就扔**（`readBlobFromPath`）：预览、单张下载
  - 导出完全不碰内存：目录 `copyFile`、ZIP 硬链接
  - 浏览器环境 / 落盘失败时保留 Blob，功能不受影响
- **LRU 与 `evicted` 已全部拆除**：`processedBlobCache`、1.5GB 预算、`MEMORY_SOFT_LIMIT`、列表「已释放」徽章都没了。`utils/lruCache.ts` 本体还在但已无人引用。
- 历史教训（别再走回去）：按预算淘汰会**直接丢结果**——2026-10-30 实测丢了 132/1118 张，所以当时把预算从 512MB 提到 1.5GB 并改成"只提示不回收"。真正的解法是落盘，不是更大的预算。
- `memoryMonitor` 在非 Chrome 环境用"手动分配追踪 + 固定 200MB 基线"估算压力，会驱动调度器降并发，但估算粗糙。
- Canvas 用完显式置 `width=1/height=1` 再置 null。

## 5. Tauri 边界

- 只暴露 `withGlobalTauri` 全局对象。目前有 3 个自定义 `#[tauri::command]`：`optimize_png`（oxipng 重压）、`encode_jpeg`（mozjpeg 编码）、`zip_directory`（ditto 打包）。
- 大块数据不通过 IPC 传：一律「写临时文件 → 传路径 → Rust 读写 → 前端读回 → 删临时文件」。Tauri v1 的 invoke 走 JSON 序列化，几 MB 的字节数组会把主线程卡住。
- 临时目录统一走 `services/nativeBridge.ts` 的 `resolveWorkDir()`：`appCacheDir()` → `~/Library/Caches/<bundle>/picman-tmp/`。**不能用 `path.tempDir`**（Tauri v1 没有这个 API，早期 PNG 重压就是栽在这里）。
- `encode_jpeg` 的参数用 `rename_all = "snake_case"`，前端传 `png_path` 而不是默认的 `pngPath`——两边写死，不靠框架默认行为猜。
- 文件系统 scope 限定：`$HOME`、`$DOWNLOAD`、`$DESKTOP`、`$DOCUMENT`、`/Volumes`。
- 这意味着：**想加原生能力（多线程编码、直接写盘）必须新写 command**，现有链路完全绕不过前端。

## 6. 已知瓶颈（按影响排序）

1. **主线程处理**：`processImage` 全程占 UI 线程，`concurrency` 是假并发。真并行需要 OffscreenCanvas + Worker，或把编码搬到 Rust。
2. ~~状态全量刷新~~ —— 已改攒批（`patchFile` + 100ms）。
3. ~~调度器重复排序~~ —— `getPendingQueue` 加了排序缓存，`getStats` 改成单次遍历。
4. ~~原图当缩略图~~ —— 已彻底不生成缩略图，列表改用类型图标；导入只读文件头。
5. **EXIF 只在内置编码路径上还走三次 base64**：桌面端 JPEG 原生编码已经把 EXIF 字节直接交给 mozjpeg（`utils/exifBytes.ts` 只做字节解析，不生成 DataURL）；剩下的 piexifjs 路径只在「内置编码」或非桌面环境生效。
6. ~~ZIP 对已压缩图片做 DEFLATE~~ —— 已改 `STORE`。

## 7. 改造方向

**原 P0–P3 已完成**：状态收敛到一个源头、列表攒批更新、ZIP 改 STORE、产物落盘取代 LRU、JPEG / PNG 原生编码可选。

**剩下的**：

- Rust 侧整合 `process_image`（decode → resize → encode → 写盘一条龙）。目前直读只覆盖「无几何编辑」的场景，有旋转/缩放仍要前端出 PNG 中间件。
- WebP 有损需 libwebp 绑定（`image-webp` 只有无损）。
- `App.tsx` 拆分：Info Modal 仍是内联。
- **明确不做的**：预生成缩略图（列表用类型图标是有意为之，那是最早的慢因）、LRU 淘汰（产物已落盘，不需要）。

## 8. 逐文件职责

### 前端

| 文件 | 职责 |
|---|---|
| `src/App.tsx` | 主组件（2000+ 行，仍在拆）。状态编排、导入流程、导出入口、各类弹窗 |
| `components/VirtualFileList.tsx` | 文件列表，虚拟滚动，列表 / 网格双视图 |
| `components/ProcessingBar.tsx` | 三条进度栏（计数 / 当前文件 / 吞吐 / 剩余 / 完成态） |
| `components/ConfigPanel.tsx` | 左侧配置面板（预设条 + 五组折叠面板） |
| `components/NotificationStack.tsx` | 信息提示条：自动消失、常驻告警、最多 3 条 |
| `components/ThemeSwitch.tsx` | 外观三态切换（跟随系统 / 亮 / 暗） |
| `components/LogViewer.tsx` | 运行日志弹窗（三分类页签） |
| `components/ImportZone.tsx` | 拖拽导入区 |
| `components/ImageTypeBadge.tsx` | 列表左侧文件类型图标（FA path 内联） |
| `hooks/useProcessing.ts` | 批量处理调度、进度、暂停 / 终止 |
| `hooks/useExport.ts` | ZIP / 目录导出、进度 |
| `hooks/useTaskBarDone.ts` | 三条进度栏共用的完成态状态机 |
| `services/imageProcessor.ts` | Canvas 处理管线：旋转 / 缩放 / 水印 / 编码 / EXIF |
| `services/nativeBridge.ts` | Tauri 能力探测 + 工作目录 / 日志目录解析 |
| `services/workspace.ts` | 产物落盘、按需读回、清理历史批次 |
| `services/rustPng.ts` | PNG → oxipng 重压（失败退回 canvas 产物） |
| `services/rustJpeg.ts` | JPEG → mozjpeg 编码（PNG 中间件路径） |
| `services/rustTranscode.ts` | JPEG 直读转码（跳过 canvas，265ms 那条路） |
| `services/systemZip.ts` | 交给 ditto 打包（硬链接摆放 + 原子写入） |
| `services/autoLog.ts` | 日志自动落盘（一天一文件，只追加增量） |
| `utils/` | 调度器、重命名规则、MIME、图片头解析、EXIF 字节、日志文本化、主题、任务栏状态、导入去重 … |

### Rust（`src-tauri/src/`）

| 文件 | 职责 |
|---|---|
| `main.rs` | 窗口菜单、关闭即最小化、注册 5 个命令 |
| `image_ops.rs` | `optimize_png`（oxipng 无损重压） |
| `jpeg_ops.rs` | `encode_jpeg`（mozjpeg 编码，PNG 进 / JPEG 出） |
| `archive.rs` | `zip_directory`（ditto 优先，zip -0 兜底）+ `link_or_copy` |
