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
| 单元测试 | `npm test` | 366 个用例；压测不在其中（见 §6） |
| 性能基准 | `npm run test:bench` | 结果写 `benchmark-results.json` |
| 打包 Apple Silicon | `npm run bundle` | 产物落 `releases/`，脚本会打印 md5 / sha256 |
| 打包 Intel | `npm run bundle:x64` | 同上 |
| 打包两个架构 | `npm run bundle:all` | 同上 |
| 版本号升级 | 见 §8 发版流程 | **别直接用 `version:minor`**，会打错 tag |

不想开终端时，双击 `/Applications/PicMan 启动.command`：弹出「浏览器开发 / 桌面窗口 / 预览构建版」三选一，实际执行的就是 `./start.sh` 对应模式。

## 3. 目录约定

- 所有源码在 `src/`，**不要**在根目录新增 `.ts`。
- 新组件进 `src/components/`，新业务逻辑进 `src/hooks/`，纯函数进 `src/utils/`。
- 测试就近放 `__tests__/`，文件名 `*.test.ts(x)`。
- 文档：AI 入口在根目录 `AGENTS.md`，其余参考文档在 `docs/`。

## 4. 写代码的约束

1. **类型**：禁止 `@ts-ignore` / `as any`。历史遗留的 `// @ts-ignore` **14 处**（`App.tsx` / `utils/index.ts` / `ImportZone.tsx` / `useExport.ts` / `imageProcessor.ts`，主要在 `window.__TAURI__` 相关），改到时顺手用声明文件替换。
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
- 提交前有 hook 校验 `package.json` 与 `Cargo.toml` / `tauri.conf.json` / `constants.ts` 版本一致（`.githooks/pre-commit`，靠 `core.hooksPath` 生效）。
- **发版流程见 `AGENTS.md` 的「发版流程」一节**，这里只强调最容易弄反的一步：**tag 必须打在打包之前**。产物要由 tag 指向的那份代码构建，否则「这个包里是哪版代码」说不清。
- DMG 不进 git（`.gitignore` 已排除 `*.dmg`），只有 `releases/RELEASE_NOTES.md` 入库。

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

**本地与远端是故意分叉的**：本地 `main` 保留 100+ 个提交的完整历史，远端只有一个快照提交，两者**没有共同祖先**。所以 `git status` 会显示 diverged、直接 `git push` 会被拒——这是预期状态，别去"修复"它。

## 9. 常见问题

**`npm run tauri:dev` 白屏** —— 端口不一致的老问题 **2026-11-01 已修**（`vite.config.ts` 与 `tauri.conf.json` 现在都是 3000）。若再现，先核对这两处；别只改一边，改了必白屏。

**打包出来的 dmg 找不到** —— 脚本会把完整路径打印出来，产物在 `releases/PicMan_<版本>_<架构>.dmg`，**不在** `src-tauri/target/` 下面。

**导出到外置硬盘失败** —— `tauri.conf.json` 的 `fs.scope` 需要包含 `/Volumes/**`（已配置）。

**测试报 Canvas 相关错误** —— jsdom 没有 Canvas 实现，属于环境限制。

**改了配置但界面没变** —— 配置存在 localStorage 的 `lastConfig`，去"关于 → 本地存储管理 → 重置配置"。
