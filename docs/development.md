# 开发方式

> 从零到跑起来、改完怎么验、发版怎么发。命令都实跑验证过。

## 1. 环境

- Node.js 18+
- Rust stable（只有打桌面包时需要）
- macOS 打包另需 Xcode Command Line Tools

```bash
npm install
```

## 2. 命令

| 场景 | 命令 | 备注 |
|------|------|------|
| 浏览器开发 | `./start.sh` | **端口 3000**，不是 5173；等价 `npm run dev` 但会检查环境/依赖/端口 |
| 桌面窗口开发 | `./start.sh tauri` | 自动把 Tauri `devPath` 对齐到 3000，首次需编译 Rust |
| 预览生产构建 | `./start.sh preview` | 构建后起 4173 预览 |
| 生产构建 | `npm run build` | 输出 `dist/`，约 600KB JS |
| 单元测试 | `npx vitest run` | 143 个用例（`thumbnailGenerator` 会挂死，见 FAQ） |
| 性能基准 | `npm run test:bench` | 结果写 `benchmark-results.json` |
| 打包 Apple Silicon | `npm run bundle` | 构建 + 打包 + 自动打开 dmg |
| 打包 Intel | `npm run bundle:x64` | |
| 版本号升级 | `npm run version:patch` | 自动同步 tauri.conf / Cargo.toml |

不想开终端时，双击 `/Applications/PicMan 启动.command`：弹出「浏览器开发 / 桌面窗口 / 预览构建版」三选一，实际执行的就是 `./start.sh` 对应模式。

## 3. 目录约定

- 所有源码在 `src/`，**不要**在根目录新增 `.ts`。
- 新组件进 `src/components/`，新业务逻辑进 `src/hooks/`，纯函数进 `src/utils/`。
- 测试就近放 `__tests__/`，文件名 `*.test.ts(x)`。
- 文档：AI 入口在根目录 `AGENTS.md`，其余参考文档在 `docs/`。

## 4. 写代码的约束

1. **类型**：禁止 `@ts-ignore` / `as any`。历史遗留的 `// @ts-ignore`（8 处，主要在 `window.__TAURI__` 相关）改到时顺手用声明文件替换。
2. **异常**：禁止空 `catch {}`。要么处理，要么记日志，要么明确注释为什么可以吞。
3. **新增配置项**：必须同时改 `src/types.ts`（类型）+ `src/constants.ts`（`DEFAULT_CONFIG` 默认值），否则老用户的 localStorage 配置读出来会缺字段。
4. **改 `ProcessingConfig` 结构**：要在 `App.tsx` 初始化 config 的地方加迁移逻辑（已有先例：`image/avif` 回退、`preventSizeInflation` 补默认值）。
5. **主线程**：任何单次超过 16ms 的同步计算都要让出（`await new Promise(r => setTimeout(r, 0))`），否则进度条会冻住。

## 5. 回归清单

改动涉及以下模块时，按对应项手工验证一遍：

**改处理管线（`imageProcessor.ts` / `useProcessing.ts`）**
- [ ] 单张 JPG → WebP，体积变小，尺寸不变
- [ ] 固定宽 800 + 保持比例，输出宽度正确
- [ ] 旋转 90° 后画布不留黑边、不裁切
- [ ] 文字水印平铺模式下铺满整图，透明度生效
- [ ] 图片水印位置正确
- [ ] 处理后体积变大时保留原图（看徽章与日志）
- [ ] 处理中暂停 / 继续 / 终止，状态都正确回落
- [ ] GIF 动图被跳过且原文件可导出

**改导出（`useExport.ts`）**
- [ ] ZIP 导出 60 张 → 分成两批，各自可下载
- [ ] 目录导出保留原有文件夹层级
- [ ] 重命名模式加后缀、覆盖模式替换原文件
- [ ] 导出中暂停 / 终止不产生半截文件

**改列表（`VirtualFileList.tsx`）**
- [ ] 1000 项滚动不卡、不白屏
- [ ] 列表用类型图标占位，点击图标能打开原图预览
- [ ] 文件夹 Tab 过滤正确、计数正确
- [ ] 全选 / 反选 / 删除选中

**改 UI 全局**
- [ ] 亮色/暗色切换后无硬编码白底或黑字
- [ ] 顶栏、侧栏、工具条在 800×850 最小窗口下不溢出

## 6. 测试策略

- 纯函数（`utils/`）→ 直接单测，覆盖边界（0 字节、负数、超长文件名）。
- Hook（`hooks/`）→ 用 `@testing-library/react` 的 `renderHook` + 假定时器。
- Canvas 相关 → jsdom 不支持 Canvas，`src/tests/performance/stress.test.ts`（500 张）会超时，**这是预期行为，不要试图"修"它**。需要真 Canvas 的断言写成浏览器里手测。
- 不写"为了覆盖率"的测试，只测会出错的逻辑。

## 7. 原生能力怎么验（IPC / 性能）

WKWebView 接不上 Chrome DevTools，所以原生命令靠「探针页 + 结果落盘」验证：

1. 写一个静态页放进任意目录（如 `/tmp/probe/index.html`），页面里调 `window.__TAURI__.tauri.invoke(...)`，把结果用 `fs.writeTextFile` 写到 `~/Downloads/probe.json`。
2. `cd /tmp/probe && python3 -m http.server 3099` 起服务。
3. `npx tauri dev --config '{"build":{"devPath":"http://localhost:3099/index.html","beforeDevCommand":"true"}}'` 把窗口指到探针页（这样不会和 3000 端口的 dev server 抢）。
4. 读 `~/Downloads/probe.json`。

**测性能一定加 `--release`**。debug 构建下 mozjpeg 慢 15 倍，用它做取舍会得出相反的结论（2026-10-31 的真实教训）。

## 8. 提交与发版

- 提交信息：`类型(范围): 说明`，类型用 `feat` / `fix` / `refactor` / `chore` / `docs` / `perf`。
- 提交前有 hook 校验 `package.json` 与 `Cargo.toml` / `tauri.conf.json` 版本一致。
- 发版流程：`npm run version:patch` → 更新 `CHANGELOG.md` → `npm run bundle` → 提 tag。
- DMG 不进 git（`.gitignore` 已排除 `*.dmg`）。

## 9. 常见问题

**`npm run tauri:dev` 白屏** —— `vite.config.ts` 端口是 3000，`tauri.conf.json` 的 `devPath` 是 5173，两者不一致。用 `./start.sh tauri` 绕过（脚本用 `tauri dev --config` 临时覆盖）；要根治就两处一起改。

**打包出来的 dmg 找不到** —— 带 `--target` 时路径是 `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`，不是 `target/release/bundle/`。

**导出到外置硬盘失败** —— `tauri.conf.json` 的 `fs.scope` 需要包含 `/Volumes/**`（已配置）。

**测试报 Canvas 相关错误** —— jsdom 没有 Canvas 实现，属于环境限制。

**改了配置但界面没变** —— 配置存在 localStorage 的 `lastConfig`，去"关于 → 本地存储管理 → 重置配置"。
