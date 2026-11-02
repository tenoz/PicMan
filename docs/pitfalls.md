# 已知坑

> 每条都真踩过，不是推测。**动手前扫一遍编号**，命中就去读对应条目。
>
> 这份文件 2026-11-02 从 `AGENTS.md` 拆出来：原文这 39 条占 16.5 KB，
> 是整个规则文件的 64%，把后面的硬规则、命令和目录地图全挤出了注入窗口
> （实测窗口约 9 KB，只有前 35% 能进上下文）。现在 `AGENTS.md` 只留一行一条的索引。

---


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

8. **Tauri 拖放慢在 `readBinaryFile`，不在建列表**：`tauri://file-drop` 拿到的是一串路径，必须 `fs.readBinaryFile` 逐个读成 `Uint8Array` 再包成 `File`。1118 张/1.4GB 串行 `await` 要 2 分钟以上——现在改成 6 路并发 + 80ms 节流报进度（0→95%），阶段2 建列表占 95→100%。

9. **拖放进度不能按 `paths.length` 算**：拖一个文件夹时 `paths.length === 1`，进度会瞬间跳到上限然后一直卡住。要按「已读文件数 / 扫描到的总文件数」。

10. **导入不做全尺寸解码**：宽高走 `utils/imageSize.ts` 的头解析（JPEG SOF / PNG IHDR / GIF / WebP 三种 chunk），头解析失败才回退全尺寸解码。**2026-10-30 起连缩略图也不生成了**——列表改用「类型图标 + 文件名」，点文件名看原图（见坑 7）。生产代码里已经没有 `createImageBitmap`，只在压测文件里还留着旧引用，别照着它往导入流程加东西。

11. **处理期间列表更新是攒批的**（`patchFile` + 100ms flush），不要在状态回调里直接 `setFiles(prev => prev.map(...))`，否则 1000 张时退化成 O(n²)。

12. **产物只在磁盘上**（2026-11-02 第 3 步完成）：
   - **磁盘**：每批一个 `~/Library/Caches/<bundle>/picman-tmp/work-<时间戳>-<随机>/`，产物逐张落盘，`AppFile.processedPath` 记绝对路径（`services/workspace.ts`）
   - **落盘成功后 `processedBlob` 就是 `undefined`**——内存占用从此与批次大小无关。`processImage` 内部仍会生成 Blob，但用完即弃
   - 需要 Blob 的地方**按需读一张、用完就扔**：`readBlobFromPath(path, mime)`。预览、单张下载都走它
   - **浏览器环境 / 落盘失败**才保留 Blob，这些路径完全不受影响
   - **LRU 与 `evicted` 已全部拆除**：`processedBlobCache`、1.5GB 预算、列表「已释放」徽章都没了。`utils/lruCache.ts` 与它的 30 条测试**已删除**（备份在 `~/Downloads/PicMan-删除备份-20261102/`）
   - 判断"产物在不在"一律用 `processedBlob || processedPath`，**别再只判 Blob**——那是"点了没反应"的老来源

13. **最终产物在 `releases/`**：`scripts/build-dmg.sh` 把 `.app` 封成 dmg 直接放这里（见坑 37）。中间产物仍在 `src-tauri/target/<target>/release/bundle/macos/`，但那不是交付物——找包先看 `releases/`。

14. **`static.crates.io` 在本机不通**（SSL 连接被断，`http=000`），新增 Rust 依赖时 `cargo build` 会卡在下载。可用镜像把 `.crate` 直接补进本地缓存，不改任何配置：
    `curl -fL -o ~/.cargo/registry/cache/index.crates.io-*/<name>-<ver>.crate https://rsproxy.cn/api/v1/crates/<name>/<ver>/download`
    再 `cargo build --offline` 验证。2026-10-29 引入 oxipng 时就是这么补的（hashbrown / bytemuck / either / libdeflate-sys / rayon）。

15. **PNG 重压只在桌面端生效**：`services/rustPng.ts` 有 `__TAURI__` 检测，浏览器里直接返回原 blob。别把它的返回值当成"一定更小"，`after > before` 时会退回原产物。

16. **写导出相关测试时**：jsdom 的 `Blob` **没有 `arrayBuffer()`**，走"写盘"分支会 `TypeError`。mock JSZip 的 `generateAsync` 要返回带 `arrayBuffer` 的伪 Blob。

17. **时序类测试别用 sleep 卡点**：`taskScheduler` 的暂停用例原来靠 `delay(10)/delay(30)` 抢窗口，机器一忙就偶发失败。改成用可控 promise 挂住任务、轮询等待任务真正开始。

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

30. **`addLog` 必须同步维护 `logsRef`**：日志落盘紧跟在 `addLog` 后面，靠 `useEffect` 同步 ref 会慢一拍，导出的日志永远缺最后一条（2026-10-31 实测：导出日志里始终没有「导出完成」）。现在 `addLog` 里同时写 ref 和 state，`persistLogs` 直接读 ref，不需要 `setTimeout`。

31. **Virtuoso 的 `components` / `itemContent` 必须稳定引用**：两者内联写等于每次渲染都换新组件，Virtuoso 会把整片列表当"变了"重刷 → 行内 `transition-colors` / `transition-opacity` 被重置，鼠标悬停时背景和操作按钮就会闪（导出/处理期间进度回调频繁重渲染，所以只在干活时看得见）。现在 `components` 提到模块级常量、`itemContent` 用 `useCallback`、`VirtualFileList` 外面套 `React.memo`。实测：拖 15 次配置滑块（15 次父级重渲染），列表行 DOM 变动 **0**。

32. **导入去重键不能带 `lastModified`**：Tauri 拖放会同时触发 DOM drop 和原生事件，原生那路用 `new File([data], name, { lastModified: Date.now() })` 现场造文件，时间戳跟 DOM 那路差几毫秒。键里带上它，两批就永远对不上，去重形同虚设——2026-10-31 的真实日志里，133 张被导入两次、处理了 266 张。现在键是 `路径|名字|大小`（`utils/fileKey.ts`）。

33. **`importInflightKeys` 不能在 finally 里清早**：清空后再启动排队批次，排队批会把自己重新导一遍（filesRef 这时还是旧值）。正确做法：有排队批次就保留，最后一批结束才清。

34. **`pointer-events-none` / `inert` 挡不住程序化点击**：设置面板「处理中锁定」起初只做了 CSS + `inert`，实测 `el.click()` 照样能改掉格式。凡是"禁用"，视觉之外必须再在 handler 里判一次（`handleChange` / `updateRename` / `resetGroup` 全部以 `if (locked) return` 开头）。

35. **节流丢掉的中间值要补发**：进度回调"窗口内直接 return"会让最后一次更新永久丢失——暂停时进度栏停在 `1/12`，列表里已完成 2 张。改成 trailing 定时补发（记 pending，窗口结束写一次），并在暂停/结束时 `force` 刷一次真实值（`useProcessing.pause()` 用 `progressRef`）。

36. **配置对象别闭包捕获**：`useProcessing` 曾把 `config` 闭进 `processSingleFileInternal`，任务一入队配置就被冻结——暂停中改格式、继续后仍按旧格式跑，日志里记的却是新配置（更容易误判）。改成 `configRef` + `useEffect` 同步，执行时读 ref。现在面板已锁（改不了），但底层这层保险要留着。

37. **删大段 JSX 后立刻跑 `tsc`**：按起止标记删块很容易多删一层闭合标签，报错位置会在几十行之后（`JSX element 'div' has no corresponding closing tag`）。删完先 tsc，再接着写。

38. **`await processFiles()` 不等于「处理完了」**：它只是把任务交给 `TaskScheduler` 然后 `start()` 就返回，真正的处理与写盘发生在之后。测试里拿它当同步点直接断言产物，机器一忙就拿到 `undefined`——这就是那个反复出现、每次重跑都过的「1 failed 但重跑全过」（2026-11-02 才抓住：`useProcessing.workspace.test.tsx` 里的 `writes[1]`）。时序类断言一律**轮询等条件成立**（见该文件的 `waitFor`），既别用固定 sleep 卡点，也别把「函数返回」当成「活干完了」。

39. **打包必须走 `scripts/build-dmg.sh`，别用 tauri 原生 dmg**（2026-11-02，1.3.0 打包时踩的）：`tauri build` 会调 create-dmg 的 `bundle_dmg.sh`，那个脚本用 AppleScript 控制 Finder 摆图标位置，当前环境没这个权限，会挂在 `hdiutil detach /dev/diskN` 上——**报错只有一句 `error running bundle_dmg.sh`，真因被吞掉**；更坑的是失败会留下 `/Volumes/PicMan` 挂载点，不清理下次直接撞名。
    现在的做法是编译与封包分开：`tauri build --target <arch> -b app` 只出 `.app`（`-b app` 跳过 dmg 脚本），再用 `hdiutil create -volname PicMan -srcfolder <stage> -ov -format UDZO -fs HFS+` 自己封，stage 里放 `.app` + 指向 `/Applications` 的软链。已封装成 `npm run bundle` / `bundle:x64` / `bundle:all`。
    代价：dmg 打开后图标是默认排列，没有背景图和摆位，功能完全一样。
    出问题先 `ls /Volumes/` 看有没有残留 `PicMan`，有就 `hdiutil detach /Volumes/PicMan`。
    **写脚本时踩的两脚，都是「变量边界」**：
    - `echo "=== $suffix（$target）==="`：全角括号紧贴变量名，bash 把「（」当成标识符的一部分，报 `suffix: unbound variable`
    - `git push origin "$NEW:refs/heads/main"`：**zsh 把 `:r` 当成「去掉扩展名」的历史修饰符**，`refs` 被吃成 `efs`，报 `src refspec ... does not match any`
    → **变量后面紧跟任何特殊字符（中文、冒号、斜杠）一律写 `${var}`**。这条在 zsh 下尤其容易中招，因为它是默认 shell。
    验证方式：挂载 → `PlistBuddy -c "Print :CFBundleShortVersionString"` 看版本 → `lipo -archs` 看架构 → 卸载 → 记校验和。
