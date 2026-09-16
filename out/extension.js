"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const activationGuard_1 = require("./activationGuard");
const RepoManager_1 = require("./modules/repoManager/RepoManager");
const WorkspacePanel_1 = require("./modules/workspacePanel/WorkspacePanel");
const OutputManager_1 = require("./modules/output/OutputManager");
const repoCommands_1 = require("./commands/repoCommands");
const syncCommands_1 = require("./commands/syncCommands");
const codeAssistant_1 = require("./modules/codeAssistant");
let repoManager;
let workspacePanel;
async function activate(context) {
    OutputManager_1.OutputManager.getInstance().info("x-space Toolkit 正在激活...");
    // 激活守卫
    const detection = (0, activationGuard_1.detectXspaceProject)();
    if (detection.isXspaceProject) {
        OutputManager_1.OutputManager.getInstance().info(`检测到 x-space 项目，激活全部模块（跳转+片段+同步）；根目录：${detection.xspaceRoots.join(", ")}`);
    }
    else {
        OutputManager_1.OutputManager.getInstance().info("非 x-space 项目，仅激活多仓库管理模块");
    }
    // 初始化仓库管理器
    repoManager = new RepoManager_1.RepoManager();
    await repoManager.init();
    // 注册底部面板
    workspacePanel = new WorkspacePanel_1.WorkspacePanel(context, repoManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("shone.sing.lone.toolkit.workbench", workspacePanel, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    repoManager.onChange(() => workspacePanel.sendUpdate());
    // 注册命令（模块 A：通用）
    (0, repoCommands_1.registerRepoCommands)(context, repoManager);
    (0, syncCommands_1.registerSyncCommands)(context, repoManager, detection.configs);
    // 模块 B：代码智能跳转（仅 x-space 项目激活）
    if (detection.isXspaceProject) {
        const configs = detection.configs;
        (0, codeAssistant_1.registerDefinitionProvider)(context, configs);
        (0, codeAssistant_1.registerCompletionProvider)(context, configs);
        // 自动扫描 common.ts
        const workspaceRoot = vscode.workspace.rootPath || "";
        const commonTsPath = (0, codeAssistant_1.findCommonTsFile)(workspaceRoot, configs);
        if (commonTsPath) {
            (0, codeAssistant_1.scanCommonTsFile)(commonTsPath, workspaceRoot);
            (0, codeAssistant_1.setupCommonTsWatcher)(commonTsPath, workspaceRoot, configs, context);
            OutputManager_1.OutputManager.getInstance().info(`common.ts 索引已建立：${commonTsPath}`);
        }
        else {
            OutputManager_1.OutputManager.getInstance().warn("未找到 common.ts，_.$xxx 跳转不可用");
        }
        // 监听配置文件变化（热重载 configs.boundless.vue.project.js）
        const configWatcher = vscode.workspace.createFileSystemWatcher("**/configs.boundless.vue.project.js");
        context.subscriptions.push(configWatcher);
        context.subscriptions.push(configWatcher.onDidChange(() => {
            OutputManager_1.OutputManager.getInstance().info("configs.boundless.vue.project.js 变更，重新加载配置…");
            // 重新检测激活
            const newDetection = (0, activationGuard_1.detectXspaceProject)();
            // 重新扫描 common.ts
            const newRoot = vscode.workspace.rootPath || "";
            const newPath = (0, codeAssistant_1.findCommonTsFile)(newRoot, newDetection.configs);
            if (newPath) {
                (0, codeAssistant_1.scanCommonTsFile)(newPath, newRoot);
            }
            OutputManager_1.OutputManager.getInstance().info("配置已重新加载");
        }));
    }
    OutputManager_1.OutputManager.getInstance().info("x-space Toolkit 已激活完毕 ✓");
}
function deactivate() {
    repoManager?.dispose();
    workspacePanel?.dispose();
    OutputManager_1.OutputManager.getInstance().info("x-space Toolkit 已停用");
}
