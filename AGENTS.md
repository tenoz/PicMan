# AGENTS.md

> AI 进入 PicMan 的第一份文件。读完这页再动手，不要先读代码。
> `CLAUDE.md` 只是指向本文件的指针，内容以本文件为准。

## 一句话

PicMan（图片侠）是一款**离线**批量图片处理桌面工具：Tauri 1.8 + React 19 + TypeScript，图片处理走浏览器 Canvas API，不联网、不上传。

## 硬规则（违反即返工）

1. **新功能必须带 Vitest 单元测试**，测试放在 `src/utils/__tests__/`、`src/hooks/__tests__/` 或 `src/components/__tests__/`（组件测试，`vitest.config.ts` 的 `include` 三处都覆盖）。
2. **改完必须跑验证**：`npm test` 全绿 + `npm run typecheck` 0 错误 + `npm run build` 通过。不为跑通去注释报错或加 `@ts-ignore` 绕过。
3. **禁止** `@ts-ignore`（现有 13 处历史遗留，几乎都在 `window.__TAURI__` 相关处，改到时替换成 `src/tauri.d.ts` 类型声明）、`as any`、空 `catch {}`。
4. **密钥不进代码、不进 commit、不进日志**。`vite.config.ts` 的 `define` 会把环境变量**内联进构建产物**，改之前想清楚。
5. **删除任何文件/目录前必须先问**：说明原因、影响、不可逆部分，等明确确认。不使用 `rm -rf`。
6. **文档与代码同步改**：改了命令 → 改 `AGENTS.md`；改了组件 props → 改 `docs/component-api.md`；改了视觉规则 → 改 `DESIGN.md`。
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
| 打包脚本本体 | `scripts/build-dmg.sh`（见坑 37，别改回原生 dmg） |
| 单元测试 | `npm test`（已排除压测）|
| Rust 单测 | `cd src-tauri && cargo test` |
| 性能基准 | `npm run test:bench` |
| 版本号同步 | `npm run version:patch` |

桌面启动器：`/Applications/PicMan 启动.command`（双击弹出模式菜单，内部调 `./start.sh`）。

## 发版流程

**顺序不能反**：产物必须由 **tag 指向的那份代码**构建出来，否则「这个包里到底是哪版代码」说不清。

1. **代码定稿并提交**，`git status --short` 为空
2. **升版本号**：`npm version minor --no-git-tag-version` + `npm run version:sync`，提交
   > 别用 `npm run version:minor`：它会先 commit + tag，而 `version:sync` 改的三个文件在那之后，tag 会指向版本号还没同步完的代码。
3. **打 tag**：`git tag -a v<ver> -m "..."` —— **必须在打包之前**
4. **确认工作区就是 tag 的内容**：
   ```bash
   git describe --tags --exact-match HEAD   # 应输出 v<ver>
   git status --short                        # 应为空
   ```
5. **打包**：`npm run bundle:all`，脚本会打印每个包的 md5 / sha256 / 大小
6. **填发布说明**：把校验和与大小写进 `releases/RELEASE_NOTES.md`。**每次重打包都要重算**——包一重打，哈希就变了，发出去的对不上
7. **提交说明文档**（纯文档改动，不影响产物）
8. **建 GitHub Release**（公开发布必做）：
   ```bash
   gh release create v<ver> --title "PicMan v<ver>" --latest \
     --notes-file releases/RELEASE_NOTES.md \
     releases/PicMan_<ver>_aarch64.dmg releases/PicMan_<ver>_x64.dmg
   ```
   > **tag 和 Release 是两件事**。`git push --tags` 只推了 git 的 tag，**Releases 页面不会有任何东西**——Release 是 GitHub 的独立对象，带附件、说明和下载统计，必须单独创建。2026-11-02 推完 v1.3.0 发现"Releases 里没有"，就是这个原因。

**推送**：默认只提交不推，要推得单独说。推的时候**必须带 `--tags`**——`git push` 不会自动把 tag 送上去，漏了就是「代码推了、版本标记还在本地」。

```bash
git push origin main --tags
```

**产物不进 git**：`.gitignore` 里有 `*.dmg`，只有 `releases/RELEASE_NOTES.md` 入库，所以本地 `releases/` 才是完整的发布目录。

### 公开发布：远端只放快照

**远端 `main` 从 2026-11-02 起只保留发布快照**，不携带本地开发历史。做法是用 `git commit-tree` 从当前树造一个**没有父提交的孤儿提交**，再 force push：

```bash
NEW=$(git commit-tree "$(git rev-parse HEAD^{tree})" -m "PicMan v<ver>")
git push origin "${NEW}:refs/heads/main" --force
git push origin "${NEW}:refs/tags/v1.3.0"
```

> **`git push --tags` 会把 tag 身后整条历史一起推上去**。想只发快照，就必须走孤儿提交——这是唯一的路。

**下次发版**：把上一次的孤儿提交当父提交，远端就能有版本链（1.3.0 → 1.3.1），但仍然不含内部开发史：

```bash
NEW=$(git commit-tree "$(git rev-parse HEAD^{tree})" -p <上次孤儿提交> -m "...")
```

**本地与远端是故意分叉的**：本地 `main` 保留 100+ 个提交的完整历史，远端只有一个快照提交，两者**没有共同祖先**。所以 `git status` 会显示 diverged、直接 `git push` 会被拒——这是预期状态，别去"修复"它，发版一律走上面的流程。

## 目录地图

```
src/
├── App.tsx                 主组件（1753 行，仍在拆，见 TODO.md）
├── components/
│   ├── VirtualFileList.tsx 文件列表（虚拟滚动，列表/网格双视图）
│   ├── ProcessingBar.tsx   处理进度栏（列表下方：计数/当前文件/吞吐/剩余）
│   ├── ConfigPanel.tsx     左侧配置面板
│   ├── LogViewer.tsx       运行日志弹窗
│   ├── ImportZone.tsx      拖拽导入区
│   └── ImageTypeBadge.tsx  列表左侧文件类型图标（本地 FA Pro path 内联，可点击预览）
├── hooks/
│   ├── useProcessing.ts    批量处理调度（已接入）
│   ├── useExport.ts        ZIP / 目录导出（已接入）
│   ├── useFileManagement.ts 未接入
│   └── useNotifications.ts  未接入
├── services/
│   ├── imageProcessor.ts   Canvas 处理管线（旋转/缩放/水印/编码/EXIF）
│   ├── nativeBridge.ts     Tauri 桥接公共层（能力探测 + 工作/日志目录）
│   ├── rustPng.ts          桌面端 PNG → oxipng 重压（失败自动退回 canvas 产物）
│   ├── rustJpeg.ts         桌面端 JPEG → mozjpeg 编码（失败自动退回 canvas 产物）
│   ├── autoLog.ts          操作结束后把日志自动落盘（appLogDir）
│   ├── systemZip.ts        桌面端交 ditto 打包（硬链接摆放 → invoke → 清理，失败回退内置）
│   └── workspace.ts        产物工作目录：落盘 / 清理 / 启动时回收 24h 前的批次
├── utils/                  工具：调度器、音效、ZIP 分组、导出重命名规则（rename.ts）、产物 MIME（mime.ts）、图片头解析、EXIF 字节解析、日志文本化、界面中文格式化
src-tauri/src/main.rs       窗口菜单 + 关闭即最小化 + 注册 5 个命令
src-tauri/src/image_ops.rs  Rust 命令：optimize_png（oxipng 无损重压）
src-tauri/src/jpeg_ops.rs   Rust 命令：encode_jpeg（mozjpeg 编码，PNG 中间件进、JPEG 出）
src-tauri/src/archive.rs    Rust 命令：zip_directory（ditto 优先，zip -0 兜底，原子写入）+ link_or_copy（同卷硬链接）
```

## 数据流（三步）

```
导入 handleFilesAdded → 处理 useProcessing/processImage → 导出 useExport
  └ 生成 previewUrl          └ processedPath（桌面端）/ Blob（浏览器）  └ copyFile / 本机 ZIP
                              （落盘成功就不留 Blob，内存与批次无关）
```

细节见 `docs/architecture.md`。

## 已知坑（踩过的，别再踩）

1. **端口已统一为 3000**（2026-11-01）：`vite.config.ts` 的 `server.port` 和 `tauri.conf.json` 的 `devPath` 现在都是 3000，`npm run tauri:dev` 和 `./start.sh tauri` 都能直接用，不用再临时覆盖 devPath。**以后动端口必须两处同时改**，漏一处就是白屏。
2. **处理状态只有一个源头**：`App.tsx` 里 `isProcessing / isPaused / processingProgress` 是指向 `useProcessing` 返回值的别名，**不要再新增同名 state**。v1.2.2 里就养过三个永远为 `false` 的死状态，导致进度条从不显示、处理中还能点"清空"。
   2026-10-31 又踩一次：`App.tsx` 的 `isDownloadPaused` 全项目没有任何 `set` 调用，界面上永远显示「暂停」，真状态在 `useExport` 里。另一个语义陷阱：`useProcessing.pause()` **不会**把 `isProcessing` 置 `false`，所以「暂停中」两个标志同时为 `true`——任何「先判 `isProcessing` 再判 `isPaused`」的分支永远走不到恢复。判断顺序一律 `isPaused` 优先。
   同理，`stopImportRef` 这类跨异步流程的停止标志**不能在 `finally` 里复位**：另一路读盘还在跑，清早了它会继续读完再把文件回灌进列表。要停就发批次令牌（`importRunIdRef`）让旧批次整体作废。
   **但复位必须挪到批次入口**（`tauri://file-drop` 回调第一行）：漏了就是 2026-10-31 那个回归——终止过一次之后，下一次拖入时 `while (!stopImportRef.current)` 一次都不执行，界面报「未找到支持的图片文件」、进度卡在 95%。凡是"某某起点做清理"的标志位，先问一句：**谁会把它置回 false？**
3. **日常验证用 `npm test`**（= `vitest run --exclude '**/performance/**'`）。2026-11-01 已删掉会挂死的 `thumbnailGenerator.test.ts`（被测模块早就移除了），现在整套单测能正常跑完。
   `src/tests/performance/stress.test.ts`（500 张）**故意不放进 `npm test`**：它是压测，跑几分钟属正常，要跑用 `npm run test:perf`。
4. **`npm run typecheck` 现在是 0 错误**（2026-11-01 清零，原 13 处：`useExport.test.tsx` 9 / `stress.test` 2 / `bench` 1 / `ImportZone` 1）。新代码必须保持通过。`ImportZone` 那处是 **react-dropzone 14.4 的类型与 React 19 不兼容**（`DropzoneOptions` 把 `multiple`/`onDragEnter`/`onDragOver`/`onDragLeave` 判成必填），靠显式补这几项绕过，升级依赖时可以再评估。
5. **Worker 已移除**（commit a1d72bf）：Canvas 处理在主线程，别以为有并发。`concurrency` 只是交错执行的假并发。
6. **EXIF 只对 JPEG 生效**，PNG/WebP 的画面元数据由 Canvas 直接丢弃，`stripExif` 开关对非 JPEG 无意义。
7. **`previewUrl` 是原图 blob URL**（预览弹窗、`processImage` 都用它）。**列表没有缩略图**（2026-10-30 起）：导入只读文件头拿宽高，列表是「类型图标 + 文件名」，**点文件名开预览**。别再往导入流程塞缩略图逻辑——那是最早的慢因。`utils/thumbnailGenerator.ts` 是死代码。
16. **Tauri 拖放慢在 `readBinaryFile`，不在建列表**：`tauri://file-drop` 拿到的是一串路径，必须 `fs.readBinaryFile` 逐个读成 `Uint8Array` 再包成 `File`。1118 张/1.4GB 串行 `await` 要 2 分钟以上——现在改成 6 路并发 + 80ms 节流报进度（0→95%），阶段2 建列表占 95→100%。
17. **拖放进度不能按 `paths.length` 算**：拖一个文件夹时 `paths.length === 1`，进度会瞬间跳到上限然后一直卡住。要按「已读文件数 / 扫描到的总文件数」。
15. **导入不再全尺寸解码**：宽高走 `utils/imageSize.ts` 的头解析（JPEG SOF / PNG IHDR / GIF / WebP 三种 chunk），缩略图走 `createImageBitmap(file, { resizeWidth: 200 })` 降采样。**注意**：降采样后拿到的是 200px 的宽高，**不能**当原图尺寸用——尺寸只认头解析结果，头解析失败才回退全尺寸解码。老环境没有 `createImageBitmap` 时整段自动回退到老路径。
8. **处理期间列表更新是攒批的**（`patchFile` + 100ms flush），不要在状态回调里直接 `setFiles(prev => prev.map(...))`，否则 1000 张时退化成 O(n²)。
9. **产物只在磁盘上**（2026-11-02 第 3 步完成）：
   - **磁盘**：每批一个 `~/Library/Caches/<bundle>/picman-tmp/work-<时间戳>-<随机>/`，产物逐张落盘，`AppFile.processedPath` 记绝对路径（`services/workspace.ts`）
   - **落盘成功后 `processedBlob` 就是 `undefined`**——内存占用从此与批次大小无关。`processImage` 内部仍会生成 Blob，但用完即弃
   - 需要 Blob 的地方**按需读一张、用完就扔**：`readBlobFromPath(path, mime)`。预览、单张下载都走它
   - **浏览器环境 / 落盘失败**才保留 Blob，这些路径完全不受影响
   - **LRU 与 `evicted` 已全部拆除**：`processedBlobCache`、1.5GB 预算、列表「已释放」徽章都没了。`utils/lruCache.ts` 与它的 30 条测试**已删除**（备份在 `~/Downloads/PicMan-删除备份-20261102/`）
   - 判断"产物在不在"一律用 `processedBlob || processedPath`，**别再只判 Blob**——那是"点了没反应"的老来源
10. **打包产物路径**是 `src-tauri/target/aarch64-apple-darwin/release/bundle/`，不是 `target/release/bundle/`。
11. **`static.crates.io` 在本机不通**（SSL 连接被断，`http=000`），新增 Rust 依赖时 `cargo build` 会卡在下载。可用镜像把 `.crate` 直接补进本地缓存，不改任何配置：
    `curl -fL -o ~/.cargo/registry/cache/index.crates.io-*/<name>-<ver>.crate https://rsproxy.cn/api/v1/crates/<name>/<ver>/download`
    再 `cargo build --offline` 验证。2026-10-29 引入 oxipng 时就是这么补的（hashbrown / bytemuck / either / libdeflate-sys / rayon）。
12. **PNG 重压只在桌面端生效**：`services/rustPng.ts` 有 `__TAURI__` 检测，浏览器里直接返回原 blob。别把它的返回值当成"一定更小"，`after > before` 时会退回原产物。
13. **写导出相关测试时**：jsdom 的 `Blob` **没有 `arrayBuffer()`**，走"写盘"分支会 `TypeError`。mock JSZip 的 `generateAsync` 要返回带 `arrayBuffer` 的伪 Blob。
14. **时序类测试别用 sleep 卡点**：`taskScheduler` 的暂停用例原来靠 `delay(10)/delay(30)` 抢窗口，机器一忙就偶发失败。改成用可控 promise 挂住任务、轮询等待任务真正开始。
18. **JSX 里裸写 `//` 注释会被当成文字渲染**：现象是列表顶部多出一行「// 列表视图 - 使用 Virtuoso」。JSX children 位置的注释只能用 `{/* */}`，写在标签属性之间或函数体里才是真注释。
19. **按钮默认游标是箭头**：浏览器给 `<button>` 的 `cursor` 是 `default`，逐个组件手写 `cursor-pointer` 迟早漏。已在 `src/index.css` 的 base 层统一兜底（button / `[role=button]` / `select` / `summary` / `label[for]` → pointer，disabled → not-allowed），新增可点元素不用再加 `cursor-pointer`。
20. **JPEG 原生编码必须走 PNG 中间件**：JPEG 是有损格式，拿 canvas 出的 JPEG 再喂给 mozjpeg 就是二次损失。正确链路是 `canvas.toBlob('image/png')` → 临时文件 → `encode_jpeg`。
21. **原生编码有两条路，优先走直读**：① **直读**（`services/rustTranscode.ts` + `transcode_to_jpeg`）——原图在磁盘上有路径、且没有任何几何编辑时，Rust 直接读盘解码编码，3000×2000 实测 **265ms**；② **中间件**（`rustJpeg.ts` + `encode_jpeg`）——有旋转/缩放/水印时的退路，要前端出 PNG 再写盘，同尺寸 **712ms**。差的 447ms 全在「canvas 出 PNG 117 + 写盘 331」，跟编码器无关（两者产物字节完全一致）。
    直读的四个前提（少一条就回退 canvas）：`AppFile.file` 上挂了 `__picmanSrcPath`（只有 Tauri 拖放有）、`format=jpeg`、`jpegEngine=native`、无旋转/翻转/缩放/水印/动图，**且 EXIF Orientation 必须为 1**（浏览器解码会自动转正，Rust 不会，否则图会歪）。
22. **PNG 重压档位差两个数量级**：同一个 6MP 图，`-o0` 212ms（省 19.6%）/ `-o2` 3308ms（省 24%）/ `-o4` 27s（省 25.7%）。多花 3 秒只换 4 个百分点，所以默认 `off`，要省体积时选 `fast`。
23. **Tauri v1 的 `path` API 没有 `tempDir`**（那是 v2 才有的）。早期 `rustPng.ts` 按 `path.tempDir` 探测，探测恒为 undefined，**PNG 无损重压上线后一次都没真正执行过**，全部静默退回 canvas 产物。现在统一走 `services/nativeBridge.ts` 的 `resolveWorkDir()`：`appCacheDir()` → `~/Library/Caches/<bundle>/picman-tmp/`（在 `fs.scope` 的 `$HOME/**` 范围内）。加原生能力时别再自己探测 `path.*`，直接用这个封装。
    **2026-11-01 又踩一次**：`services/systemZip.ts` 的 `canZipNatively()` 也是按 `path.tempDir` 探测 ⇒ 恒为 `false` ⇒「本机压缩」选项上线后一次都没真跑过，全部静默回退内置 JSZip。已改走 `resolveWorkDir()`。**动原生能力前先全局搜一遍 `tempDir`。**
24. **`fs.scope` 不含 `/tmp` 和 `$CACHE` 变量**：目前是 `$HOME/**`、`$DOWNLOAD/**`、`$DESKTOP/**`、`$DOCUMENT/**`、`/Volumes/**`。临时文件只能落在 `$HOME` 之下，写 `/var/folders/...` 会权限被拒。
25. **测原生性能必须用 release 构建**：`tauri dev` 默认 debug，同一个探针 mozjpeg 4.0s / oxipng 14.7s；换 `--release` 后 268ms / 3.3s，差 15 倍。用 debug 数据做取舍会得出完全相反的结论（2026-10-31 差点因此把功能全砍掉）。
26. **`encode_jpeg` 的参数名是 snake_case**：命令上写了 `rename_all = "snake_case"`，前端必须传 `png_path`（不是框架默认的 `pngPath`）。写错了不报错，只会被 `rustJpeg.ts` 的 catch 吃掉并静默回退到 canvas 编码——表现是"功能开了但体积没变小"。
27. **mozjpeg-rs 首次编译约 7 分钟**（纯 Rust 移植，33 个依赖包，release 更久）。本机 `static.crates.io` 2026-10-30 实测已通；若再断，按坑 11 用 rsproxy 补 `.crate`。
28. **日志自动保存：一天一个文件，只追加增量**（macOS `~/Library/Logs/com.picman.app/picman_20261031.log`）。**不要**在项目根建软链或写副本——用户明确要求只放系统日志目录一处。只在**批量处理完成**时写一次，内容是从上次落盘之后新产生的日志（用日志 id 作游标），批次之间用 `==========`. 分隔。Tauri v1 的 fs **没有 append**，实现是「读旧内容 + 拼新内容 + 整体写回」，一天的日志几十 KB 忽略不计。浏览器里没有文件系统，`autoLog` 直接返回 null。
29. **旧日志自动清理只删自己生成的文件**：`pruneOldLogFiles` 每次写日志后跑一遍，保留最近 90 天（`LOG_KEEP_DAYS`）。文件名必须严格匹配 `picman_YYYYMMDD.log` 且日期可解析才删，其余一概跳过——这是自动删除动作，边界要收死，不能顺手清掉用户别的东西。
29. **`addLog` 必须同步维护 `logsRef`**：日志落盘紧跟在 `addLog` 后面，靠 `useEffect` 同步 ref 会慢一拍，导出的日志永远缺最后一条（2026-10-31 实测：导出日志里始终没有「导出完成」）。现在 `addLog` 里同时写 ref 和 state，`persistLogs` 直接读 ref，不需要 `setTimeout`。
31. **Virtuoso 的 `components` / `itemContent` 必须稳定引用**：两者内联写等于每次渲染都换新组件，Virtuoso 会把整片列表当"变了"重刷 → 行内 `transition-colors` / `transition-opacity` 被重置，鼠标悬停时背景和操作按钮就会闪（导出/处理期间进度回调频繁重渲染，所以只在干活时看得见）。现在 `components` 提到模块级常量、`itemContent` 用 `useCallback`、`VirtualFileList` 外面套 `React.memo`。实测：拖 15 次配置滑块（15 次父级重渲染），列表行 DOM 变动 **0**。
29. **导入去重键不能带 `lastModified`**：Tauri 拖放会同时触发 DOM drop 和原生事件，原生那路用 `new File([data], name, { lastModified: Date.now() })` 现场造文件，时间戳跟 DOM 那路差几毫秒。键里带上它，两批就永远对不上，去重形同虚设——2026-10-31 的真实日志里，133 张被导入两次、处理了 266 张。现在键是 `路径|名字|大小`（`utils/fileKey.ts`）。
30. **`importInflightKeys` 不能在 finally 里清早**：清空后再启动排队批次，排队批会把自己重新导一遍（filesRef 这时还是旧值）。正确做法：有排队批次就保留，最后一批结束才清。
32. **`pointer-events-none` / `inert` 挡不住程序化点击**：设置面板「处理中锁定」起初只做了 CSS + `inert`，实测 `el.click()` 照样能改掉格式。凡是"禁用"，视觉之外必须再在 handler 里判一次（`handleChange` / `updateRename` / `resetGroup` 全部以 `if (locked) return` 开头）。
33. **节流丢掉的中间值要补发**：进度回调"窗口内直接 return"会让最后一次更新永久丢失——暂停时进度栏停在 `1/12`，列表里已完成 2 张。改成 trailing 定时补发（记 pending，窗口结束写一次），并在暂停/结束时 `force` 刷一次真实值（`useProcessing.pause()` 用 `progressRef`）。
34. **配置对象别闭包捕获**：`useProcessing` 曾把 `config` 闭进 `processSingleFileInternal`，任务一入队配置就被冻结——暂停中改格式、继续后仍按旧格式跑，日志里记的却是新配置（更容易误判）。改成 `configRef` + `useEffect` 同步，执行时读 ref。现在面板已锁（改不了），但底层这层保险要留着。
35. **删大段 JSX 后立刻跑 `tsc`**：按起止标记删块很容易多删一层闭合标签，报错位置会在几十行之后（`JSX element 'div' has no corresponding closing tag`）。删完先 tsc，再接着写。
36. **`await processFiles()` 不等于「处理完了」**：它只是把任务交给 `TaskScheduler` 然后 `start()` 就返回，真正的处理与写盘发生在之后。测试里拿它当同步点直接断言产物，机器一忙就拿到 `undefined`——这就是那个反复出现、每次重跑都过的「1 failed 但重跑全过」（2026-11-02 才抓住：`useProcessing.workspace.test.tsx` 里的 `writes[1]`）。时序类断言一律**轮询等条件成立**（见该文件的 `waitFor`），既别用固定 sleep 卡点，也别把「函数返回」当成「活干完了」。
37. **打包必须走 `scripts/build-dmg.sh`，别用 tauri 原生 dmg**（2026-11-02，1.3.0 打包时踩的）：`tauri build` 会调 create-dmg 的 `bundle_dmg.sh`，那个脚本用 AppleScript 控制 Finder 摆图标位置，当前环境没这个权限，会挂在 `hdiutil detach /dev/diskN` 上——**报错只有一句 `error running bundle_dmg.sh`，真因被吞掉**；更坑的是失败会留下 `/Volumes/PicMan` 挂载点，不清理下次直接撞名。
    现在的做法是编译与封包分开：`tauri build --target <arch> -b app` 只出 `.app`（`-b app` 跳过 dmg 脚本），再用 `hdiutil create -volname PicMan -srcfolder <stage> -ov -format UDZO -fs HFS+` 自己封，stage 里放 `.app` + 指向 `/Applications` 的软链。已封装成 `npm run bundle` / `bundle:x64` / `bundle:all`。
    代价：dmg 打开后图标是默认排列，没有背景图和摆位，功能完全一样。
    出问题先 `ls /Volumes/` 看有没有残留 `PicMan`，有就 `hdiutil detach /Volumes/PicMan`。
    **写脚本时踩的两脚，都是「变量边界」**：
    - `echo "=== $suffix（$target）==="`：全角括号紧贴变量名，bash 把「（」当成标识符的一部分，报 `suffix: unbound variable`
    - `git push origin "$NEW:refs/heads/main"`：**zsh 把 `:r` 当成「去掉扩展名」的历史修饰符**，`refs` 被吃成 `efs`，报 `src refspec ... does not match any`
    → **变量后面紧跟任何特殊字符（中文、冒号、斜杠）一律写 `${var}`**。这条在 zsh 下尤其容易中招，因为它是默认 shell。
    验证方式：挂载 → `PlistBuddy -c "Print :CFBundleShortVersionString"` 看版本 → `lipo -archs` 看架构 → 卸载 → 记校验和。

## 文档索引

| 文档 | 内容 |
|------|------|
| `TODO.md` | 当前任务、优先级、进度 |
| `DESIGN.md` | 视觉规则（色板、字号、间距、状态色） |
| `docs/project-overview.md` | 项目整体说明 |
| `docs/architecture.md` | 架构与数据流 |
| `docs/development.md` | 开发方式、命令、回归清单 |
| `docs/component-api.md` | 组件与 hook 的 props / 返回值 |
| `docs/user-guide.md` | 面向用户的功能说明 |
| `docs/整改计划-v1.3.0.md` | v1.3.0 整改计划（进行中） |
| `CHANGELOG.md` | 版本变更记录 |

## 改本文档的规则

- 结论先行，能删就删，不写"本文件介绍了……"这类废话。
- 命令必须实跑验证过再写进去。
- 坑记录格式：现象 → 根因 → 怎么绕。不写"注意一下"。
