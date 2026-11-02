# TODO.md

> 当前任务、优先级、进度。**只写还在做的**，做完的进 `CHANGELOG.md`——这里不是历史归档。
> 更新日期：2026-11-02

## 下一步

> **1.3.0 已发布并打包**（2026-11-02）：两个架构的 dmg 在 `releases/`，GitHub Release 带附件。
> 等实际用一阵子再定下一版做什么。

## 待办

- [ ] **原生编码补齐「有缩放 / 旋转」的场景** —— 暂缓。直读只覆盖无几何编辑的情况；要让 Rust 做 resize，得先对比 `image` crate 的 Lanczos3 与 canvas 的观感差异
- [ ] **WebP 有损编码** —— 需 libwebp 绑定（`image-webp` 只有无损）
- [ ] **`App.tsx` 拆分** —— Info Modal 仍是内联（通知栏已抽出成 `components/NotificationStack.tsx`）
- [ ] **`package-lock.json` 纳入版本管理** —— 现被 gitignore
- [ ] **`docs/component-api.md` 随组件改动同步** —— 持续性事项
- [ ] **修 `TaskScheduler` 暂停用例的 flaky** —— 2026-11-02 实测：单跑 5 次挂 2 次，全量跑也会挂。用例名「暂停时不应该启动新任务」。已用 `git stash` 做基线对照，**不带任何改动时同样挂**，与当日改动无关。坑 17 记着这条以前用可控 promise 改过一次，但仍不稳，得再看窗口是怎么抢的

## 已决定不做

> 记在这里，免得以后有人重新提一遍。

- **水印要中文** —— 得内嵌 CJK 字体（10MB+），不划算
- **pngquant** —— libimagequant 是 GPL-3.0，与项目 MIT 冲突
- **列表缩略图** —— 类型图标是有意为之，那是最早的慢因（见 `docs/pitfalls.md` 坑 7）
- **LRU 淘汰** —— 产物已落盘，内存不再需要预算兜底
