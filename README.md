# x-space Toolkit

x-space 一站式开发助手 VS Code 插件：多仓库同步、代码智能跳转、规范提交（PRD 见 [prd.md](./prd.md)）。

## 模块

| 模块 | 功能 |
| --- | --- |
| A 多仓库工作台 | 底部面板 Webview，拍平列出工作区所有 git 仓库（1/2 级），展示分支/多远程 ↑↓/脏数，行内 同步/拉取/状态/终端/资源管理器，顶栏搜索 + 全部同步 + 全部拉取 |
| B 代码智能跳转 | alias 路径跳转、`_.$xxx` 跳 common.ts（自动扫描 + 热更新）、组件标签跳转、`this.xxx` 内部引用、.vue 路径补全、xUI 代码片段（xsfc/xsfcdialog/ximv 等） |
| C 同步引擎 | `git add .` → 规则模板生成规范 commit（可编辑）→ QuickPick 多选远程（记忆上次选择）→ 逐个 push 独立报告 |
| D 快捷操作 | 命令面板 `x-space: *` 全命令化 |

## 激活策略

- 检测 workspace folder 根是否存在 `configs.boundless.vue.project.js`
- 命中 → 全部模块；未命中 → 仅模块 A（通用多仓库管理）

## 开发

```bash
npm install        # 安装依赖（仅 devDeps，无运行时依赖）
npm run compile    # tsc 编译到 out/
npm run watch      # 监听编译
npm run package    # vsce 打包 vsix
```

F5 启动 Extension Development Host，打开 `x-space.workspace.code-workspace` 验收。

## 结构

```
src/
├── extension.ts            入口组装
├── activationGuard.ts      x-space 项目检测 + 配置加载
├── commands/               repoCommands / syncCommands
├── utils/                  git.ts（execFile 封装）/ workspace.ts（仓库发现）
└── modules/
    ├── workspacePanel/     Webview 面板宿主 + 消息协议（前端资源在 webview/）
    ├── repoManager/        仓库扫描 / 状态收集 / watcher 防抖刷新
    ├── syncEngine/         同步编排 / commit 生成 / 远程选择器
    ├── codeAssistant/      别名解析 / common.ts 扫描 / VueLoader / Definition / Completion
    └── output/             统一日志面板
```

命令 ID 前缀统一为 `shone.sing.lone.toolkit.*`，避免与其他插件冲突。
