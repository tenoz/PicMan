# 工作计划：PicMan Git重新初始化

**目标**：初始化干净的Git仓库，配置正确的.gitignore，建立健康的开发基础  
**风险级别**：🟢 **低风险**  
**预计时间**：5-10分钟  
**执行路径**：`.sisyphus/plans/git-reinitialize.md`

---

## TL;DR

> 从零开始建立干净的Git仓库，排除所有不应该跟踪的文件（745MB构建产物、
> .DS_Store等），创建一个健康的初始提交。

**关键交付物**：
- 初始化的Git仓库
- 完善的.gitignore配置
- 干净的初始提交（不含大文件）

---

## 上下文

### 当前状态

```
/Users/pxdog/Project/PicMan/
├── .git/              ❌ 不存在（需要初始化）
├── src-tauri/target/  ⚠️  745MB（需要排除）
├── .DS_Store          ⚠️  存在（需要排除）
├── node_modules/      ⚠️  存在（需要排除）
├── dist/              ⚠️  存在（需要排除）
└── [源代码文件]       ✅ 保留
```

### 目标状态

```
/Users/pxdog/Project/PicMan/
├── .git/              ✅ 初始化完成
├── .gitignore         ✅ 配置完善
├── src-tauri/target/  ⚠️  本地保留，但不跟踪
└── [源代码文件]       ✅ 已提交到git
```

---

## 执行策略

### Wave 1：初始化与配置（立即执行）

#### Task 1.1：初始化Git仓库
**推荐Agent**：`quick` + `git-master`  
**并行度**：独立执行

**What to do**:
1. 在项目根目录初始化git仓库
2. 配置初始git设置（可选）

**命令**:
```bash
git init
git config user.name "PXdog"
git config user.email "pxdog@example.com"  # 使用你的邮箱
```

**QA Scenarios**:
```
Scenario: Git初始化成功
  Tool: Bash
  Steps:
    1. ls -la .git
    2. git status
  Expected: 
    - .git目录存在
    - 显示 "No commits yet" 和大量未跟踪文件
  Evidence: .sisyphus/evidence/task-1-init.txt

Scenario: 未跟踪文件列表
  Tool: Bash
  Steps:
    1. git status --short | wc -l
  Expected: 
    - 显示大量??标记的文件（因为还没有.gitignore）
  Evidence: .sisyphus/evidence/task-1-untracked.txt
```

---

#### Task 1.2：创建完善的.gitignore
**推荐Agent**：`quick`  
**并行度**：与1.1可并行

**What to do**:
创建 `.gitignore` 文件，排除以下内容：

```gitignore
# Dependencies
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build outputs
dist/
dist-ssr/
*.local

# Rust build artifacts
src-tauri/target/
src-tauri/Cargo.lock

# macOS metadata
**/.DS_Store
.AppleDouble
.LSOverride

# Release archives (use GitHub Releases instead)
*.dmg
*.zip
*.tar.gz

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Environment files
.env
.env.local
.env.*.local

# Testing
coverage/
.nyc_output

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# TypeScript
*.tsbuildinfo

# Cache
.cache/
.parcel-cache/
.eslintcache
.stylelintcache
.ruff_cache/

# Temporary files
*.tmp
*.temp
```

**QA Scenarios**:
```
Scenario: .gitignore文件创建成功
  Tool: Bash
  Steps:
    1. cat .gitignore | head -10
    2. wc -l .gitignore
  Expected: 
    - 文件内容正确
    - 约60行
  Evidence: .sisyphus/evidence/task-2-gitignore-created.txt

Scenario: 关键条目存在
  Tool: Bash
  Steps:
    1. grep "src-tauri/target" .gitignore
    2. grep "\.DS_Store" .gitignore
    3. grep "node_modules" .gitignore
  Expected: 每行都有匹配输出
  Evidence: .sisyphus/evidence/task-2-key-entries.txt

Scenario: 大文件被正确排除
  Tool: Bash
  Steps:
    1. git check-ignore -v src-tauri/target/release/PicMan
    2. git check-ignore -v .DS_Store
    3. git check-ignore -v node_modules/react/package.json
  Expected: 
    - 每个命令都显示匹配的规则
    - 显示.gitignore:行号:匹配模式
  Evidence: .sisyphus/evidence/task-2-ignore-check.txt
```

**Commit**: YES（作为初始提交的一部分）

---

### Wave 2：清理与提交（依赖Wave 1）

#### Task 2.1：删除已存在的.DS_Store文件
**推荐Agent**：`quick`  
**并行度**：依赖1.2（需要.gitignore先配置）

**What to do**:
1. 查找所有.DS_Store文件
2. 删除它们
3. 验证已删除

**命令**:
```bash
find . -name ".DS_Store" -type f -delete
```

**QA Scenarios**:
```
Scenario: .DS_Store已清理
  Tool: Bash
  Steps:
    1. find . -name ".DS_Store" -type f | wc -l
  Expected: 输出 0
  Evidence: .sisyphus/evidence/task-3-dsstore-clean.txt
```

---

#### Task 2.2：检查未跟踪文件
**推荐Agent**：`quick`  
**并行度**：依赖2.1

**What to do**:
1. 查看git status
2. 确认大文件（target/）已被排除
3. 确认源代码文件在跟踪列表中

**QA Scenarios**:
```
Scenario: 大文件被排除
  Tool: Bash
  Steps:
    1. git status --short | grep "src-tauri/target" | wc -l
    2. du -sh src-tauri/target/
  Expected: 
    - git status不显示target/目录下的任何文件
    - target/目录仍然存在且大小约745MB（只是不跟踪）
  Evidence: .sisyphus/evidence/task-4-large-files-excluded.txt

Scenario: 源代码文件被包含
  Tool: Bash
  Steps:
    1. git status --short | grep "App.tsx"
    2. git status --short | grep "package.json"
    3. git status --short | grep "components/"
  Expected: 
    - 显示这些文件为未跟踪（??标记）
  Evidence: .sisyphus/evidence/task-4-source-included.txt

Scenario: 统计待提交文件数
  Tool: Bash
  Steps:
    1. git status --short | wc -l
    2. git status --short | grep "^??" | wc -l
  Expected: 
    - 显示约15-25个文件（源代码+配置）
    - 不应包含node_modules或target下的文件
  Evidence: .sisyphus/evidence/task-4-file-count.txt
```

---

#### Task 2.3：创建初始提交
**推荐Agent**：`quick` + `git-master`  
**并行度**：依赖2.2

**What to do**:
1. 添加所有文件到暂存区
2. 创建初始提交

**命令**:
```bash
git add .
git commit -m "Initial commit: PicMan v1.1.0

图片侠 - 批量图片处理工具
- 支持格式转换、压缩、调整大小、添加水印
- 基于React + Tauri构建
- 离线优先，保护隐私"
```

**Must NOT do**:
- 不要添加任何 `--no-verify` 之类的跳过标志
- 不要修改提交时间

**QA Scenarios**:
```
Scenario: 提交成功
  Tool: Bash
  Steps:
    1. git log -1 --oneline
    2. git log -1 --stat
  Expected: 
    - 显示提交哈希和消息 "Initial commit: PicMan v1.1.0"
    - stat显示添加了约15-25个文件
    - 不应包含src-tauri/target/或node_modules/
  Evidence: .sisyphus/evidence/task-5-commit-success.txt

Scenario: 仓库大小合理
  Tool: Bash
  Steps:
    1. du -sh .git
  Expected: 
    - 小于 10MB（因为没有大文件）
  Evidence: .sisyphus/evidence/task-5-repo-size.txt

Scenario: 提交文件列表正确
  Tool: Bash
  Steps:
    1. git ls-tree -r HEAD --name-only | sort
  Expected: 
    - 包含：App.tsx, package.json, components/, services/, utils.ts等
    - 不包含：src-tauri/target/, node_modules/, .DS_Store
  Evidence: .sisyphus/evidence/task-5-file-list.txt
```

**Commit**: YES（这是初始提交）

---

### Wave 3：验证与文档（依赖Wave 2）

#### Task 3.1：验证配置完整性
**推荐Agent**：`quick`  
**并行度**：独立

**What to do**:
1. 验证所有配置都正确
2. 测试构建是否仍然工作

**QA Scenarios**:
```
Scenario: Git配置完整
  Tool: Bash
  Steps:
    1. git config --local user.name
    2. git config --local user.email
    3. git remote -v
  Expected: 
    - user.name和user.email有值
    - remote可能为空（还未添加）
  Evidence: .sisyphus/evidence/task-6-config.txt

Scenario: 项目可构建
  Tool: Bash
  Steps:
    1. npm install 2>&1 | tail -5
    2. npm run build 2>&1 | tail -10
  Expected: 
    - npm install成功
    - build成功（显示"dist/"已创建）
  Evidence: .sisyphus/evidence/task-6-build-success.txt
  Timeout: 120000ms
```

---

#### Task 3.2：创建README文档（可选）
**推荐Agent**：`quick`  
**并行度**：独立

**What to do**:
更新README.md，添加开发说明和Git使用指南

**QA Scenarios**:
```
Scenario: README存在
  Tool: Bash
  Steps:
    1. ls -la README.md
    2. head -20 README.md
  Expected: README.md存在且有内容
  Evidence: .sisyphus/evidence/task-7-readme.txt
```

---

## 验证清单

### 命令验证
```bash
# 1. Git已初始化
git rev-parse --git-dir  # 应输出 .git

# 2. .gitignore正确配置
git check-ignore -v src-tauri/target/release/PicMan  # 应显示匹配规则

# 3. 提交存在
git log -1 --oneline  # 应显示 "Initial commit: PicMan v1.1.0"

# 4. 仓库大小合理
du -sh .git  # 应小于 10MB

# 5. 关键文件存在
git ls-tree -r HEAD --name-only | grep -E "App.tsx|package.json|.gitignore"  # 应有匹配

# 6. 不应存在的文件
git ls-tree -r HEAD --name-only | grep -E "\.DS_Store|target/"  # 应无匹配
```

### 最终检查清单
- [ ] Git仓库已初始化
- [ ] .gitignore已创建且配置正确
- [ ] .DS_Store已从仓库中删除
- [ ] 初始提交已创建
- [ ] 仓库大小小于10MB
- [ ] 项目可正常构建
- [ ] README.md存在

---

## 后续建议

### 添加远程仓库（可选）
```bash
# 如果你使用GitHub/GitLab等
git remote add origin https://github.com/yourusername/picman.git
git push -u origin main  # 或 master，取决于你的默认分支名
```

### 设置分支名
如果你的Git默认使用master而你想要main：
```bash
git branch -m main
```

### 添加提交模板（可选）
```bash
git config commit.template .gitmessage
```

创建 `.gitmessage`:
```
# 提交类型: 简短描述（50字符内）
# 
# 详细说明（可选，每行72字符内）
# 
# 相关Issue: #123
```

### 安装husky（可选，用于代码检查）
```bash
npm install -D husky lint-staged
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

---

## 回滚策略

如果初始化后需要重新开始：

```bash
# 完全删除git历史（保留源代码）
rm -rf .git

# 然后重新执行此计划
```

**注意**：这将丢失所有提交历史，但保留源代码文件。
