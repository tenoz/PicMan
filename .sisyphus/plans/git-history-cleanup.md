# 工作计划：PicMan Git历史清理

**目标**：移除745MB的Rust构建产物，清理Git历史，防止未来污染  
**风险级别**：⚠️ **高风险**（涉及git历史重写）  
**预计时间**：15-30分钟  
**执行路径**：`.sisyphus/plans/git-history-cleanup.md`

---

## TL;DR

> 清理被意外提交的745MB Rust构建产物(`src-tauri/target/`)，修复.gitignore，
> 建立预防措施防止未来再次污染。

**关键交付物**：
- 清理后的git历史（大小减少~90%）
- 完善的.gitignore配置
- 备份分支（可回滚）
- 预提交钩子（可选）

---

## 上下文与风险

### 当前问题

```
src-tauri/target/     745 MB   ⚠️ 已提交到git历史
v1.1.0.zip           556 MB   ⚠️ 在仓库外
.gitignore           缺失关键条目
```

### 操作风险

| 风险 | 缓解措施 |
|------|----------|
| 丢失历史 | 创建备份分支 |
| 远程冲突 | Force push前确认 |
| 无法回滚 | 保留备份30天 |

---

## 执行策略

### Wave 1：准备工作（立即执行）

#### Task 1.1：备份当前状态
**推荐Agent**：`quick` + `git-master`  
**并行度**：独立执行

**What to do**:
1. 创建备份分支
2. 导出当前reflog
3. 记录当前提交哈希

**QA Scenarios**:
```
Scenario: 备份成功
  Tool: Bash
  Steps:
    1. git branch backup-dev-pre-cleanup-20260224
    2. git log -1 --oneline backup-dev-pre-cleanup-20260224
  Expected: 输出与HEAD相同的提交哈希
  Evidence: .sisyphus/evidence/task-1-backup-branch.txt
```

**Commit**: YES
```
type: backup
message: "chore: 创建清理前备份分支"
files: N/A（仅分支操作）
```

---

#### Task 1.2：安装清理工具
**推荐Agent**：`quick`  
**并行度**：可与1.1并行

**What to do**:
1. 检查是否已安装 `git-filter-repo`
2. 如未安装，使用pip安装

**QA Scenarios**:
```
Scenario: 工具安装成功
  Tool: Bash
  Steps:
    1. git-filter-repo --version
  Expected: 输出版本号（如 v2.38.0）
  Evidence: .sisyphus/evidence/task-2-tool-version.txt

Scenario: 工具不可用时的备用方案
  Tool: Bash
  Steps:
    1. git clone --depth 1 https://github.com/newren/git-filter-repo.git
    2. export PATH=$PATH:$(pwd)/git-filter-repo
  Expected: git-filter-repo --version 成功
```

---

### Wave 2：执行清理（依赖Wave 1）

#### Task 2.1：执行Git历史清理
**推荐Agent**：`unspecified-high` + `git-master`  
**并行度**：顺序执行

**What to do**:
1. 使用git-filter-repo移除src-tauri/target/目录
2. 移除所有.DS_Store文件

**命令**:
```bash
git filter-repo \
  --path-glob 'src-tauri/target/**' \
  --path-glob '**/.DS_Store' \
  --invert-paths \
  --force
```

**Must NOT do**:
- 不要删除其他文件
- 不要修改提交消息（除非必要）

**QA Scenarios**:
```
Scenario: 大文件已移除
  Tool: Bash
  Steps:
    1. git log --all --name-only | grep "src-tauri/target" | wc -l
  Expected: 输出 0（无匹配文件）
  Evidence: .sisyphus/evidence/task-3-no-target-files.txt

Scenario: 仓库大小减少
  Tool: Bash
  Steps:
    1. du -sh .git
  Expected: 小于 100MB（原来是~800MB）
  Evidence: .sisyphus/evidence/task-3-repo-size.txt

Scenario: 保留其他文件
  Tool: Bash
  Steps:
    1. ls src-tauri/
    2. ls components/
    3. cat package.json
  Expected: src-tauri/src/存在，components/存在，package.json可读
  Evidence: .sisyphus/evidence/task-3-files-preserved.txt
```

**Commit**: NO（此任务不创建提交，而是重写历史）

---

#### Task 2.2：验证历史完整性
**推荐Agent**：`quick`  
**并行度**：依赖2.1

**What to do**:
1. 检查git fsck
2. 验证关键文件仍然可访问
3. 确认提交数量合理

**QA Scenarios**:
```
Scenario: Git仓库完整
  Tool: Bash
  Steps:
    1. git fsck --full
  Expected: 无输出（表示无错误）
  Evidence: .sisyphus/evidence/task-4-fsck.txt

Scenario: 提交历史存在
  Tool: Bash
  Steps:
    1. git log --oneline | wc -l
    2. git log --oneline -5
  Expected: 约4个提交，包含"Initial commit"等
  Evidence: .sisyphus/evidence/task-4-log-history.txt

Scenario: 代码功能完整
  Tool: Bash
  Steps:
    1. head -20 App.tsx
    2. head -20 services/imageProcessor.ts
  Expected: 代码内容正常，无损坏
  Evidence: .sisyphus/evidence/task-4-code-integrity.txt
```

---

### Wave 3：配置修复（可与Wave 2部分并行）

#### Task 3.1：修复.gitignore
**推荐Agent**：`quick`  
**并行度**：独立

**What to do**:
编辑 `.gitignore`，添加缺失条目：

```gitignore
# Rust build artifacts
src-tauri/target/

# macOS metadata
**/.DS_Store

# Release archives (use GitHub Releases instead)
*.dmg
*.zip

# IDE
.vscode/
.idea/

# Logs
logs/
*.log
npm-debug.log*

# Dependencies
node_modules/
dist/
dist-ssr/

# Environment
.env.local
.env.*.local

# Editor directories and files
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

**QA Scenarios**:
```
Scenario: .gitignore包含关键条目
  Tool: Bash
  Steps:
    1. grep -E "src-tauri/target" .gitignore
    2. grep -E "\.DS_Store" .gitignore
    3. grep -E "\.dmg" .gitignore
  Expected: 每行都有匹配输出
  Evidence: .sisyphus/evidence/task-5-gitignore.txt
```

**Commit**: YES
```
type: fix
message: "chore: 完善.gitignore，排除构建产物和元数据文件"
files: .gitignore
```

---

#### Task 3.2：删除已存在的.DS_Store文件
**推荐Agent**：`quick`  
**并行度**：依赖3.1

**What to do**:
1. 查找并删除所有.DS_Store文件
2. 创建提交

**QA Scenarios**:
```
Scenario: .DS_Store已清理
  Tool: Bash
  Steps:
    1. find . -name ".DS_Store" -type f | wc -l
  Expected: 输出 0
  Evidence: .sisyphus/evidence/task-6-dsstore-clean.txt
```

**Commit**: YES
```
type: fix
message: "chore: 删除所有.DS_Store文件"
files: 所有.DS_Store文件
```

---

### Wave 4：同步远程（依赖Wave 2+3完成）

#### Task 4.1：强制推送到远程
**推荐Agent**：`unspecified-high` + `git-master`  
**并行度**：顺序

**⚠️ 警告**：此操作会重写远程历史，仅在确认本地清理成功且备份完成后执行

**What to do**:
1. 再次确认本地状态
2. 使用 `--force-with-lease` 推送

**QA Scenarios**:
```
Scenario: 远程推送成功
  Tool: Bash
  Steps:
    1. git push --force-with-lease origin dev
    2. git log --oneline origin/dev -3
  Expected: 远程提交与本地一致
  Evidence: .sisyphus/evidence/task-7-push-success.txt
```

**Must NOT do**:
- 不要使用 `--force`（危险）
- 不要在有其他协作者时执行

---

### Wave 5：验证与清理

#### Task F1：最终验证
**推荐Agent**：`unspecified-high`  
**并行度**：独立

**What to do**:
1. 克隆仓库到新目录验证
2. 确认大小大幅减少
3. 确认项目可正常运行

**QA Scenarios**:
```
Scenario: 新克隆大小正确
  Tool: Bash
  Steps:
    1. cd /tmp && git clone --depth 1 file:///Users/pxdog/Project/PicMan/v1.1.0 test-clone
    2. du -sh test-clone/.git
  Expected: 小于 50MB
  Evidence: .sisyphus/evidence/final-clone-size.txt

Scenario: 项目可运行
  Tool: Bash
  Steps:
    1. cd test-clone && npm install
    2. npm run build
  Expected: 构建成功（无TypeScript错误）
  Evidence: .sisyphus/evidence/final-build-success.txt
```

---

#### Task F2：清理临时文件
**推荐Agent**：`quick`  
**并行度**：独立

**What to do**:
1. 删除/tmp下的测试克隆
2. 清理证据收集（保留报告）

**QA Scenarios**:
```
Scenario: 临时文件已清理
  Tool: Bash
  Steps:
    1. ls -la /tmp/test-clone 2>&1
  Expected: 文件不存在错误
  Evidence: .sisyphus/evidence/final-cleanup.txt
```

---

## 回滚策略

如果清理出现问题：

```bash
# 恢复到备份状态
git checkout backup-dev-pre-cleanup-20260224
git branch -D dev
git checkout -b dev
git push --force-with-lease origin dev
```

**备份保留期限**：30天  
**删除备份命令**：`git branch -D backup-dev-pre-cleanup-20260224`

---

## 成功标准

### 验证命令
```bash
# 1. 仓库大小小于100MB
du -sh .git | awk '{print $1}'  # 应输出 < 100M

# 2. 无target目录在git中
git log --all --name-only | grep -c "src-tauri/target"  # 应输出 0

# 3. .gitignore正确配置
grep -c "src-tauri/target" .gitignore  # 应输出 >= 1

# 4. 远程同步成功
git log --oneline origin/dev..dev | wc -l  # 应输出 0（无差异）

# 5. 项目功能完整
npm run build  # 应成功
```

### 最终检查清单
- [ ] 备份分支已创建
- [ ] git-filter-repo执行成功
- [ ] .gitignore已更新
- [ ] .DS_Store已清理
- [ ] 远程推送成功
- [ ] 新克隆大小正常
- [ ] 项目可正常构建

---

## 后续建议（可选）

### 添加预提交钩子
安装 husky 防止未来提交大文件：

```bash
npm install -D husky lint-staged
npx husky init
```

创建 `.husky/pre-commit`：
```bash
# 检查文件大小
find . -type f -size +1M ! -path "./node_modules/*" ! -path "./.git/*" | head -1
if [ $? -eq 0 ]; then
  echo "Error: Files larger than 1MB detected"
  exit 1
fi
```

### 定期维护
建议每季度运行：
```bash
git gc --aggressive --prune=now
```
