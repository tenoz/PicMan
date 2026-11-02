# PicMan 功能增强设计文档

## 日期：2026-06-17

## 功能需求

### 1. 全部下载对话框支持新建文件夹
- **目标**：在点击"全部下载"后弹出的系统文件夹选择对话框中显示 New Folder 按钮
- **当前实现**：使用 `dialog.open({ directory: true })`
- **预期**：系统对话框应原生支持 New Folder 按钮

### 2. 多条消息提示条翻页显示
- **目标**：多条通知不堆叠，只显示一条，可通过翻页按钮切换
- **UI 要求**：
  - 翻页按钮只用箭头图标 ← →
  - 显示当前第几条，例如："3/5"
  - 只有一条消息时，隐藏翻页按钮和信息

### 3. 文件夹拖入按原结构分组
- **目标**：拖入多个文件夹时，显示为多个文件夹标签，而非合并为一组
- **预期**：FolderTabs 显示多个标签，每个标签显示文件夹名

---

## 技术方案

### 功能1：确保系统对话框显示 New Folder

**关键文件**：`App.tsx` (handleDownloadAll, 第 1304-1308 行)

**方案**：保持现有 `dialog.open({ directory: true })` 实现，这是系统级功能。在 macOS 上应该原生支持 New Folder 按钮。如果不显示，需要检查 Tauri 版本或系统版本。

---

### 功能2：消息提示条翻页

**关键文件**：
- `App.tsx` - 通知状态和渲染逻辑

**状态变更**：
```typescript
// 新增状态
const [currentNotificationIndex, setCurrentNotificationIndex] = useState(0);

// 修改 showNotification 函数
const showNotification = (msg: string, type: ..., task?: string) => {
    setNotifications(prev => [...prev, {...}]);
    setCurrentNotificationIndex(notifications.length); // 显示最新一条
};
```

**渲染逻辑**：
- 只渲染 `notifications[currentNotificationIndex]`
- 添加翻页按钮处理函数
- 条件渲染：只有 `notifications.length > 1` 时显示翻页控件

---

### 功能3：文件夹拖入分组

**关键文件**：
- `App.tsx` - handleFilesAdded, FolderTabs
- `types.ts` - 类型定义

**数据结构变更**：
```typescript
// types.ts 新增
interface FolderGroup {
  id: string;
  name: string;
  files: AppFile[];
}

// App.tsx 状态变更
const [folderGroups, setFolderGroups] = useState<FolderGroup[]>([]);
```

**处理逻辑**：
- 浏览器模式：按 `webkitRelativePath` 的目录前缀分组
- Tauri 模式：已有文件夹区分逻辑，利用 `path` 信息分组
- 每个 FolderGroup 创建一个文件夹标签

---

## 关键文件清单

| 功能 | 文件 | 变更内容 |
|------|------|----------|
| 1 | App.tsx:1304-1308 | 检查 dialog.open 配置 |
| 2 | App.tsx:67 | 新增 currentNotificationIndex 状态 |
| 2 | App.tsx:296-302 | 修改 showNotification 函数 |
| 2 | App.tsx:1554-1579 | 修改通知渲染逻辑（翻页按钮） |
| 3 | types.ts | 新增 FolderGroup 类型 |
| 3 | App.tsx:612-762 | 修改 handleFilesAdded 逻辑 |
| 3 | App.tsx:FolderTabs | 修改文件夹标签渲染 |

---

## 验证方案

1. **功能1验证**：点击"全部下载"，确认弹出的系统对话框中有 New Folder 按钮
2. **功能2验证**：
   - 触发多条通知，观察是否只显示一条
   - 点击翻页按钮，确认可以切换
   - 确认只有一条时隐藏翻页控件
3. **功能3验证**：
   - 拖入多个文件夹到应用
   - 确认 FolderTabs 显示多个文件夹标签
   - 点击不同标签，切换显示对应文件夹的文件

---

## 依赖项

- 无新增依赖
- 使用现有 Tauri dialog API