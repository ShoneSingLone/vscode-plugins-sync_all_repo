# x-space Toolkit —— VS Code 插件 PRD

> 定位：x-space 生态的一站式开发工具箱，将 boundless-vue-helper、sync-all-repos、commitmsg 三者深度融合，形成「看状态 → 同步一套全做」的完整闭环。

## 1. 背景：你的三件套现状

```
x-space 生态下你有三个工具，各管一摊：

┌─ boundless-vue-helper ─────────────────────┐
│  别名跳转（alias）                           │
│  _.$xxx 函数定义自动扫描与跳转               │
│  代码片段（xsfc, xsfcdialog, ximv 等）      │
│  Boundless 项目自动识别                     │
└─────────────────────────────────────────────┘

┌─ sync-all-repos (git-subtree-manager) ─────┐
│  傻傻的 subtree 管理器                      │
│  质量不行，需要重写                         │
└─────────────────────────────────────────────┘

┌─ commitmsg skill (Claude Code 内) ─────────┐
│  git add . → 分析变更 → 生成规范 commit    │
│  但只能在 Claude Code 里用，VS Code 里没有  │
└─────────────────────────────────────────────┘
```

### x-space 的实际仓库结构

```
x-space (底座框架，独立 git 仓库)
  ├── statics/business_cib         ← 业务代码目录
  └── statics/business_xxx         ← ...

x-space.business_statics (业务容器目录，自身可能是独立 git 仓库)
  ├── business_cib                 ← 独立 git 仓库（有自己 .git）
  ├── business_zhong_liang         ← 独立 git 仓库（有自己 .git）
  ├── business_mo_ack              ← 普通子目录（无独立 .git，归上级管理）
  ├── business_note                ← 普通子目录
  ├── ...（共 28 个，且会动态增加）
  └── config/                      ← 配置文件
```

**关键特征**：
- 底座（x-space）和业务容器（x-space.business_statics）是工作区的两个独立 git 仓库
- 业务容器内部分 `business_xxx` 目录自身就是独立 git 仓库，部分则是普通目录
- 新的业务子仓库会不断加入，面板应**自动发现**新仓库，不需用户额外配置

**问题**：
- 三个工具各自为政，用户要在不同地方切换
- boundless-vue-helper 是 JS 写的旧项目，质量粗糙
- sync-all-repos 定位错了（子树概念而非多仓库同步）
- commitmsg 只能通过 Claude Code 用，不够顺手

**目标**：合并成一个统一的 **x-space Toolkit** 插件，TypeScript 重写，一个底部面板解决所有问题。

**关键洞察**：commitmsg 不只是独立的提交流程，它和 sync-all-repos 是**同一个动作的两个环节**——
sync-all-repos 负责「看状态、拉取、推送」，commitmsg 负责「提交」。而「提交 + 推送」本质上是同一个概念：**同步**（一个仓库可能挂多个远程，同步 = 把本地提交推到目标远程）。

在每个仓库行上,把「同步」做成一步到位的动作——`git add .` → 生成规范 commit → 推到目标远程。这就是这个插件的杀手锏。

## 2. 插件定位

### 一句话
> x-space 项目的一站式开发助手：管理多仓库同步、代码智能跳转、一个按钮全同步。

### 面板位置
- 面板出现在 **VS Code 编辑器底部**（替换原底部 Sync Repos 的入口位置）
- 使用底部面板（类似 Output/Problems/终端）的方式展示自绘的 x-space 工作台
- 该面板是 x-space 插件的**总入口**：仓库同步 + 代码跳转 + 快捷操作聚合在这里
- 底部面板便于与编辑器内容同时查看，边写代码边看仓库状态，无需切换左侧栏

### 目标用户
- x-space 生态的开发者（你自己 + 团队）
- 使用 x-space 底座 + 多业务仓库 + 多远程仓库架构的团队

### 动态自适应的核心原则

> **x-space 的仓库结构是动态变化的，插件必须把「结构分析」当作运行时行为，而非写死的静态配置。**

变化的具体表现：
- `x-space.business_statics` 下会有**新的业务仓库**不断加入（当前约 28 个，持续增长）
- **新的 `x-space.*` 顶层组件**也可能不断加入（如新的 `x-space.something`），每个有自己的 git 仓库、远程、业务结构

### 扫描策略：双层扫描

**第一层（固定入口）** — 读取 `x-space.workspace.code-workspace` 的 `folders` 配置：
- 这个文件在 x-space 主项目中是固定的，定义了几大顶层文件夹
- 每次刷新时读取该文件，获得当前工作区包含的顶层目录列表
- 这样即使未来新增了 `x-space.new_component` 目录，只要在 workspace 文件里配置了就会自动发现

**第二层（动态递归）** — 在每个顶层目录内部，递归搜索所有含 `.git` 的目录：
- 任意深度（但可配置最大深度）
- 排除 `node_modules`、`.claude/worktrees` 等
- 新业务仓库加入后，刷新即可发现

```
解析 workspace.code-workspace
  ├─ x-space/                    → 扫描子目录，找 .git
  ├─ x-space.business_statics/   → 扫描所有 business_* 子目录，找 .git
  │    ├─ business_cib/.git      → 独立仓库
  │    ├─ business_note/ (无.git)→ 容器仓库管理
  │    └─ ...
  ├─ x-space-helper/             → 扫描子目录，找 .git
  └─ x-space-sync-all-repos/     → 扫描子目录，找 .git
```

**任何时刻都不应在代码里写死「只有 4 个仓库」「只有 statics 下有 business」，而是完全动态地扫描、渲染。**

### 核心概念：同步（Sync）

> **同步** = 提交本地改动 + 推送到目标远程（可选：同时拉取最新）。

一个仓库可能配置多个远程（如 `origin`、`gitee`、`upstream`），每个远程下又有不同分支。「同步」不是一个死板的下拉，而是：

```
本地工作区 → git add . → 《git commit》 → 《git push <远程> <分支>》
                                      ↘ （可选）git pull <远程> <分支> 放入同步动作
```

- **同步**：一步完成「提交 + 推送」（目标远程可在面板中选择，支持多选）
- **全部同步**：对所有仓库执行同步动作，或仅对指定的仓库组
- 远程是**一等公民**：面板上每个仓库列出全部远程及其状态，同步时可以选择推哪个/哪些

### 设计原则
1. **一切以 x-space 工作区为中心** — 识别 workspace 中的多根仓库结构
2. **非侵入** — 不改原有 .git 结构，不改项目配置
3. **远程是一等公民** — 一个仓库多个远程是常态，不是特例
4. **同步是一步动作** — 提交 + 推送在用户眼里是同一件事，不要拆成两个按钮

## 3. 功能总览

### 模块 A：多仓库管理器 × 同步引擎（sync-all-repos + commitmsg 深度整合）

这是插件的核心模块。**多仓库管理（A）和同步（C）不是两个独立功能，而是同一面板的一体两面。**

**自绘底部面板**：不使用原生 TreeView 组件，而是在 VS Code 底部面板用 Webview 自己绘制 UI，以便于：
- 完全自定义布局、配色、交互动效，贴合 x-space 品牌视觉
- 悬停、点击、搜索、分组折叠等复杂交互不受 TreeView 约束
- 后续可以方便地扩展卡片、图表、快捷键等个性化元素

面板是 x-space 工作台的总入口，展示当前工作区**所有层级的 git 仓库**，**每个仓库卡片本身就是完整的同步入口**：

```
┌──────────────────────────────────────────────────────┐
│  x-space  工作台 ▍搜索: [____] ▍分组: [全部/分组/仓库] │
│  × [🔃 全部同步] [⬇️ 全部拉取] [🔗 管理远程]          │
├──────────────────────────────────────────────────────┤
│  ◆ x-space（底座 / 独立仓库）                         │
│    ├── 分支 master                                   │
│    │   origin   → github.com/xxx/xspace.git          │
│    │       ↑2 ↓1                                     │
│    │   gitee    → gitee.com/xxx/xspace.git           │
│    │       ↑2 ↓0                                     │
│    └── 未提交改动: 0   [🔃同步] [⬇拉取] [📋状态]     │
│                                                      │
│  ◆ x-space.business_statics（业务容器 / 独立仓库）    │
│    ├── 分支 develop                                  │
│    │   origin   → github.com/xxx/statics.git         │
│    │       ↑0 ↓0                                     │
│    └── 未提交改动: 3 (src/ +2, config/ +1)           │
│        [🔃同步] [⬇拉取] [📋状态]                     │
│                                                      │
│  ◆ business_cib（业务子仓库，独立 .git）              │
│    ├── 分支 feature/xxx                              │
│    │   origin   → github.com/xxx/cib.git             │
│    │       ↑0 ↓2                                     │
│    └── 未提交改动: 5                                 │
│        [🔃同步] [⬇拉取] [📋状态]                     │
│                                                      │
│  ◆ business_zhong_liang（业务子仓库，独立 .git）     │
│  │   ...                                             │
│  ◆ business_note（普通子目录，归容器仓库管理）       │
│  │   ...                                             │
│                                                      │
│  [+ 共 30 个仓库，实际数量随业务动态增减]             │
└──────────────────────────────────────────────────────┘
```

> **动态性说明**：上图中的仓库数量是**示意**，不代表固定为这几个。所有含 `.git` 的目录都会被自动发现，业务子仓库新增/删除后刷新即可。

**核心交互 —— 同步按钮**：

点击某个仓库的「🔃 同步」：
1. 自动执行 `git add .`
2. 分析变更内容（type/scope 自动推断），弹出输入框预填好 commit message（可编辑）
3. 确认 → `git commit`
4. 弹出目标远程选择（默认 origin，可多选，列出所有远程）
5. 执行 `git push <远程> <分支>`（多选则逐个推送）
6. 面板刷新为「已同步」

整条链路一步到位，不需要切到终端、不需要记命令。也可以只同步、只拉取。

**交互**：
- 每个仓库一行，显示：状态图标（颜色标识）+ 仓库名 + 当前分支
- 展开后：全部远程列表（含各远程的 ahead/behind）、未提交改动数（带文件分布）、最后提交时间
- 行内按钮直接操作，无需右键
- 右键菜单补充：打开终端、在资源管理器中显示、重命名远程、添加远程

**顶栏按钮**：
| 按钮 | 功能 |
|---|---|
| 🔄 刷新 | 重新扫描所有仓库状态 |
| ⬇️ 全部拉取 | 对所有仓库、所有远程执行 `git fetch` / `git pull` |
| 🔃 全部同步 | 遍历所有脏仓库，逐个走同步流程（提交 + 推送） |
| ＋ 添加远程 | 给指定仓库配置新的远程 |
| 🔗 管理远程 | 查看/修改/删除各仓库的远程配置 |

**状态检测**：
- 是否是 git 仓库（检查 `.git`）
- 当前分支（`git branch --show-current`）
- **全部远程**（`git remote -v`，不只 origin）
- 每个远程的差异（`git rev-list --count HEAD..origin/main` 等，每个远程独立计算）
- 工作区脏状态（`git status --porcelain`）
- 是否有冲突

### 同步动作的调度

「同步」不是一把梭地 push 到所有远程——它区分几种模式，用户可选：

| 模式 | 行为 |
|---|---|
| **单远程同步** | commit + push 到选定的 1 个远程 |
| **多远程同步** | commit + 逐个 push 到多个选定远程（按面板勾选） |
| **拉取后同步** | 先 fetch 指定远程，再 commit + push（避免覆盖别人最新代码） |
| **全部同步** | 所有脏仓库走一遍多远程同步 |

### 模块 B：代码智能跳转（来自 boundless-vue-helper，TypeScript 重写）

**功能**：

| 功能 | 说明 |
|---|---|
| Alias 跳转 | 配置化路径别名，按 `Ctrl+Click` 跳转到对应文件 |
| `_.$xxx` 跳转 | 自动扫描 common.ts，识别所有 `_.$xxx` 函数定义位置，支持点击跳转 |
| `_api` / `_opts` 跳转 | 业务文件内 `_api.xxx`、`_opts.xxx` 跳转到对应 .vue 文件 |
| 批量别名配置 | 支持 `mapping_statics` 外部静态目录映射 |
| 代码片段 | xsfc、xsfcdialog、ximv 等 x-space 专用模板 |

**自动扫描**：
- 启动时自动扫描工作区根目录及各 `mapping_statics` 目录下的 `common.ts`
- 监听文件变化，热更新函数索引
- 无需用户手动配置

### 模块 C：同步引擎（commitmsg skill 的 GUI 化，与模块 A 深度融合）

commitmsg skill 的核心能力（git add → 分析 → 生成规范 message → commit）被内嵌为插件的**同步引擎**，与模块 A 的推送能力合并成完整的「同步」动作，由仓库面板驱动：

**触发方式**：
1. 底部面板仓库卡片 → 点击「🔃 同步」按钮
2. 右键菜单 → 「同步到远程」
3. 命令面板 → `x-space: 同步当前仓库`
4. 顶栏「🔃 全部同步」→ 遍历所有脏仓库逐个走同步流程

**同步流程**：

```
点击「同步」
  ↓
自动执行 git add .（暂存所有改动）
  ↓
弹出输入框，AI 分析变更后自动生成 commit message（可编辑）
  ├─ type: feat/fix/refactor/docs/style/test/chore
  ├─ scope: 根据变更文件路径自动推断
  └─ description: 中文描述
  ↓
确认提交
  ↓
选择目标远程（默认 origin，可多选，列出仓库所有远程）
  ↓
逐个执行 git push <远程> <分支>
```

**commit message 格式**（Conventional Commits + 中文描述）：
```
<type>(<scope>): <中文简要描述>

<中文详细说明（可选）>
```

**type 与 scope 自动推断逻辑**：
- 底座仓库（x-space）：scope 从变更文件路径推断，如 `route-state`、`sidebar`
- 业务仓库：scope 使用业务名
- type 从变更内容语义推断

### 模块 D：快捷操作（右键菜单）

在 VS Code 文件资源管理器中：

**文件夹右键 → 二级菜单「x-space 工具」**：
| 菜单项 | 条件 | 操作 |
|---|---|---|
| 同步到远程 | 文件夹包含 `.git` | 走模块 C 的同步流程 |
| 从远程拉取 | 文件夹包含 `.git` | `git pull`（选择远程） |
| 查看仓库状态 | 文件夹包含 `.git` | 弹出 status 信息 |
| 管理远程仓库 | 文件夹包含 `.git` | 查看/添加/编辑该仓库的远程 |
| 在此打开终端 | 总是可用 | 打开终端并 cd 到该目录 |

**文件右键 → 二级菜单「x-space 跳转」**：
| 菜单项 | 操作 |
|---|---|
| 跳转到同名业务组件 | 在业务目录中找到同名 .vue 文件 |
| 跳转到 common.ts 定义 | 选中文本为 `_.$xxx` 时跳转到定义 |

## 4. 技术方案

### 4.1 架构

```
extension.ts（入口）
│
├── ActivationGuard          ← 检测当前工作区是否为 x-space 项目
│                              （检查 configs.boundless.vue.project.js 是否存在）
│
├── modules/
│   ├── workspacePanel/      ← 模块 A 的 UI：自绘 x-space 工作台面板（Webview）
│   │   ├── WorkspacePanel.ts   ← Webview 面板生命周期管理
│   │   ├── panel.html          ← 面板 HTML 骨架
│   │   ├── panel.css           ← 面板样式（x-space 品牌视觉）
│   │   ├── panel.ts            ← 面板前端逻辑（渲染仓库卡片、交互、消息收发）
│   │   └── messages.ts         ← Webview ↔ 扩展 消息协议定义
│   │
│   ├── repoManager/         ← 模块 A 的逻辑：多仓库管理
│   │   ├── RepoManager.ts       ← 仓库扫描 + git 命令封装
│   │   ├── RepoStatus.ts        ← 状态检测逻辑（含多远程差异）
│   │   └── types.ts
│   │
│   ├── syncEngine/          ← 模块 C：同步引擎（被模块 A 调用）
│   │   ├── SyncEngine.ts        ← 同步流程编排（add → gen msg → commit → push）
│   │   ├── MessageGenerator.ts  ← commit message 生成（type/scope 推断）
│   │   ├── RemotePicker.ts      ← 目标远程选择 UI（多选）
│   │   └── types.ts
│   │
│   ├── codeAssistant/       ← 模块 B：代码智能跳转
│   │   ├── AliasProvider.ts     ← 别名解析与跳转
│   │   ├── CommonScanner.ts     ← common.ts 自动扫描
│   │   ├── DefinitionProvider.ts ← 定义跳转提供者
│   │   ├── CompletionProvider.ts ← 自动补全提供者
│   │   └── types.ts
│   │
│   └── output/
│       └── OutputManager.ts     ← 统一的输出日志面板
│
├── commands/                ← 命令注册
│   ├── repoCommands.ts         ← 仓库相关命令（pull/sync/remote管理）
│   └── syncCommands.ts         ← 同步相关命令（sync/syncAll）
│
└── utils/
    ├── git.ts                  ← git 命令执行工具
    ├── config.ts               ← 配置加载与管理
    └── workspace.ts            ← 工作区工具函数
```

### 4.2 项目识别

插件通过检查工作区根目录是否存在 `configs.boundless.vue.project.js` 来判断是否是 x-space 项目。

- 是 → 激活全部模块（仓库管理 + 代码跳转 + 同步）
- 否 → 仅激活模块 A（通用的多仓库管理功能），不干扰非 x-space 项目

### 4.3 仓库发现策略（动态双层扫描）

1. **第一层（固定入口）**：读取 `x-space.workspace.code-workspace` 的 `folders`，获得顶层目录列表（该文件固定在 x-space 主项目，新顶层组件只需在文件里加一行即可被发现）
2. **第二层（动态递归）**：对每个顶层目录递归扫描子目录，找出所有含 `.git` 的目录
   - 任意深度（可配置最大深度）
   - 排除 `node_modules`、`.claude/worktrees` 等
3. **自动角色识别**：根据路径特征标记仓库角色（底座/业务容器/业务子仓库/普通目录），但**不做硬编码假设**——角色仅用于显示分组，扫描本身不依赖角色

### 4.4 远程仓库（一等公民）处理

每个仓库的远程是其核心状态，面板必须完整展示：

```
git remote -v
git remote get-url <name>            ← 逐个远程获取 URL
git rev-list --count HEAD..<remote>/<branch>   ← 每个远程独立计算 ahead/behind
```

同步时，用户可以在远程选择器（`RemotePicker.ts`）中：
- 勾选多个目标远程
- 各自独立推送
- 可记忆上次选择（workspaceState 缓存）

### 4.5 与原有项目的关系

| 原有项目 | 合并方式 |
|---|---|
| `boundless-vue-helper`（JS） | 功能全部迁移到本插件，**废弃旧插件** |
| `sync-all-repos`（TS，质量差） | 代码废弃，架构重写，**废弃旧插件** |
| `commitmsg` skill（Claude Code） | 同步引擎移植到 GUI，深度嵌入模块 A 的每个仓库行。Claude Code 侧保留 CLI skill 作为互补入口。|

### 4.6 融合后的操作闭环

以一次完整的开发动作为例，看三个旧项目如何在新插件里融合：

```
你在写 x-space-business_statics 的代码
  →
底部面板看到 🟡 x-space-business_statics 状态：
    ⚡ 有 3 个未提交改动
    origin ↑0 ↓0，gitee ↑0 ↓2（落后 2 个提交，该拉取了）
  → 一眼知道该同步了（原 sync-all-repos 的检测能力）
  →
点击该行「🔃 同步」按钮（同步模式选「拉取后同步」）
  → 从 gitee 拉取最新（原 sync-all-repos 的拉取能力）
  → 自动执行 git add .（原 commitmsg 的暂存）
  → 分析变更内容，弹出输入框预填：
      feat(statics): 新增数据处理模块
    （原 commitmsg 的 AI 推断 type/scope）
  → 你确认/微调，点击提交
  → 选择目标远程：origin（+可选 gitee）（原 sync-all-repos 的多远程推送能力）
  → 自动 git push
  →
面板状态刷新为：🟢 已同步
```

**这就是这个插件的核心价值：三个工具不再是三个独立的入口，而是一条「同步」流水线。**

### 4.7 技术栈

- TypeScript（全量重写，废弃旧 JS）
- VS Code Extension API（TreeView、Languages、StatusBar）
- `child_process.exec` 执行 git 命令（保持与现有一致）
- 不需要额外 npm 依赖（lodash 等从旧插件移除或替换为原生实现）

## 5. UI/UX 规范

- 底部面板 Tab 图标：x-space 品牌图标（🅧 或自定义 SVG）
- 使用 Webview 自绘 UI，完全控制布局和视觉风格
- 状态颜色遵循 VS Code 主题色 token（远程落后用 warning 色，冲突用 error 色）
- 进度条：批量操作时底部状态栏显示实时进度
- 同步按钮使用 `$(sync)` 图标，与「同步」概念强关联
- 底部面板与编辑器同屏可见，实现边写代码边看仓库状态的流畅体验

## 6. 发布规划

### v1.0（MVP）
- **模块 A + C 融合**：多仓库管理器 × 同步引擎（侧边栏一体面板，每个仓库行含「同步」「拉取」「状态」行内按钮）
- **多远程支持**：每个仓库展示全部远程，同步可选择目标远程（多选）
- **模块 B**：代码智能跳转（alias + `_.$xxx` + 代码片段）
- 合并 boundless-vue-helper，废弃旧插件
- 合并 commitmsg skill 到 GUI（Type/Scope 规则模板推断）
- 合并 sync-all-repos，废弃旧插件

### v1.5
- 模块 A：递归子目录扫描、仓库过滤搜索、状态自动刷新
- 模块 C：AI commit message 生成（调用 Claude API）
- 右键菜单完善
- 同步时「拉取后同步」策略增强（冲突提醒）
- 远程管理增强（重命名、删除、fetch 全部远程）

### v2.0
- 批量同步全部仓库（顶栏一键遍历所有脏仓库 + 各远程）
- 自定义同步流程（pre-commit hooks、自定义 scope）
- 仓库历史可视化（简单图表展示各仓库提交频率）

## 7. FAQ

**Q: 旧插件 boundless-vue-helper 会怎样？**
A: 功能全部迁移后，旧插件将不再维护。用户安装 x-space Toolkit 后应卸载旧插件。

**Q: 我的 alias 配置会丢失吗？**
A: 不会。配置格式兼容，仍然使用 `configs.boundless.vue.project.js`。

**Q: 一个仓库有多个远程，同步时会推到哪里？**
A: 同步时弹出远程选择器，默认 origin，但可以勾选多个远程逐一推送。选择会被记住，下次默认复用。

**Q: 同步到多个远程时，某个远程失败怎么办？**
A: 逐个远程独立执行，每个远程单独报告成功/失败。一个失败了不影响其他远程的推送。

**Q: commitmsg 的 AI 生成需要联网吗？**
A: v1.0 用规则模板生成（如「feat: 新增xxx功能」），v1.5 再加 AI 调用，可离线使用基础功能。

**Q: 非 x-space 项目能用吗？**
A: 多仓库管理功能（模块 A）通用可用。代码跳转和智能同步需要 x-space 项目结构。