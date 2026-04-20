# Sync All Repos

> **一键同步所有 Git 仓库** — Pull + Push，让多个仓库代码保持一致。

[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![VSCode](https://img.shields.io/badge/vscode-≥1.80-brightgreen)]()

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔄 **一键全同步** | 同时对所有仓库执行 `git pull` + `git push` |
| ⬇️ **仅拉取** | 只拉取远端最新代码，不推送 |
| ⬆️ **仅推送** | 只推送本地提交，不拉取 |
| 📁 **自动扫描** | 自动递归扫描工作区子目录中的 Git 仓库 |
| 📝 **自动提交** | 推送前可自动提交所有未暂存变更 |
| ⚡ **并发执行** | 支持多仓库并发同步，速度更快 |
| 📊 **结果面板** | 同步完成后展示美观的 Webview 结果报告 |
| ⚙️ **可视化配置** | 内置配置 UI，无需手动编辑 JSON |
| 🔑 **快捷键** | `Ctrl+Shift+S` / `Cmd+Shift+S` 快速触发 |

---

## 🚀 快速开始

### 安装插件

1. 在 VSCode 中打开扩展面板（`Ctrl+Shift+X`）
2. 搜索 **"Sync All Repos"** 并安装
3. 重新加载窗口

### 编译安装（从源码）

```bash
cd sync_all_repo
npm install
npm run compile

# 打包为 .vsix
npm run package
# 然后在 VSCode 中：Extensions → Install from VSIX...
```

---

## 📖 使用方法

### 方式一：快捷键

```
Ctrl + Shift + S  （Windows/Linux）
Cmd  + Shift + S  （macOS）
```

### 方式二：命令面板

打开命令面板（`Ctrl+Shift+P`），输入：

| 命令 | 说明 |
|------|------|
| `Sync All Repos: 同步所有仓库` | Pull + Push |
| `Sync All Repos: 拉取所有仓库` | 仅 Pull |
| `Sync All Repos: 推送所有仓库` | 仅 Push |
| `Sync All Repos: 查看仓库状态` | 查看各仓库状态（不同步）|
| `Sync All Repos: 打开配置` | 打开可视化配置面板 |

### 方式三：状态栏

点击 VSCode 左下角状态栏的 **`$(sync) Sync Repos`** 按钮。

---

## ⚙️ 配置说明

通过命令面板执行 `Sync All Repos: 打开配置` 打开可视化配置界面，或在 `settings.json` 中手动配置：

```jsonc
{
  // 要同步的仓库路径列表（为空则自动扫描工作区）
  "shone.sing.lone.syncrepos.repoPaths": [
    "/Users/you/projects/repo-a",
    "/Users/you/projects/repo-b"
  ],

  // 自动扫描深度（repoPaths 为空时生效，默认 3）
  "shone.sing.lone.syncrepos.autoScanDepth": 3,

  // Pull 策略: merge | rebase | ff-only
  "shone.sing.lone.syncrepos.pullStrategy": "merge",

  // Push 策略: normal | force-with-lease | skip
  "shone.sing.lone.syncrepos.pushStrategy": "normal",

  // 推送前自动提交未暂存变更
  "shone.sing.lone.syncrepos.commitBeforePush": false,

  // 自动提交消息模板，支持 ${date} ${time}
  "shone.sing.lone.syncrepos.autoCommitMessage": "chore: auto sync ${date}",

  // 扫描时排除的目录
  "shone.sing.lone.syncrepos.excludePatterns": ["node_modules", ".git", "vendor", "dist"],

  // 并发同步数量（1~10，默认 3）
  "shone.sing.lone.syncrepos.concurrency": 3,

  // 是否显示状态栏按钮
  "shone.sing.lone.syncrepos.showStatusBar": true,

  // 保存文件时自动触发同步
  "shone.sing.lone.syncrepos.autoSyncOnSave": false,

  // 日志级别：error / warn / info / debug（输出到 Output 面板的 Sync All Repos 通道）
  "shone.sing.lone.syncrepos.logLevel": "info",

  // 同时输出到开发者控制台（Debug Console）
  "shone.sing.lone.syncrepos.logToConsole": false
}
```

---

## 📊 同步结果面板

同步完成后会自动打开结果面板，展示：

- **总计 / 成功 / 失败 / 跳过** 统计数据
- **成功率进度条**
- 每个仓库的 **分支、ahead/behind 状态、同步消息**
- **搜索 + 筛选**：按仓库名搜索，或按状态过滤
- **一键打开仓库**：直接在 VSCode 中打开对应文件夹
- **再次同步**：一键重试

---

## 🔀 同步策略说明

### Pull 策略

| 策略 | 等同命令 | 适用场景 |
|------|---------|---------|
| `merge`   | `git pull --no-rebase` | 默认，保留合并历史 |
| `rebase`  | `git pull --rebase`    | 保持线性历史 |
| `ff-only` | `git pull --ff-only`   | 只允许快进，有冲突时报错 |

### Push 策略

| 策略 | 说明 |
|------|------|
| `normal`           | 正常推送 |
| `force-with-lease` | 安全强推（防止覆盖他人提交）|
| `skip`             | 不推送（只拉取模式）|

---

## ❓ 常见问题

**Q: 为什么某个仓库显示"跳过"？**  
A: 该仓库没有配置远程地址（`git remote`），插件会自动跳过。

**Q: 同步报错 "non-fast-forward"？**  
A: 本地与远端有冲突，建议手动处理后再同步，或将 Pull 策略改为 `rebase`。

**Q: 如何排除某个子目录不扫描？**  
A: 在 `excludePatterns` 中添加对应目录名，或直接在 `repoPaths` 中手动指定要同步的仓库。

**Q: 支持 SSH Key 吗？**  
A: 支持。插件使用系统的 `git` 命令，会自动使用系统配置的 SSH Key 和凭据。

---

## 📁 项目结构

```
sync_all_repo/
├── src/
│   ├── extension.ts   # 插件入口，命令注册
│   ├── gitManager.ts  # 核心：仓库扫描 + git 操作
│   ├── ui.ts          # 状态栏 + 结果 Webview 面板
│   └── config.ts      # 配置读取 + 配置 Webview 面板
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📜 License

MIT
