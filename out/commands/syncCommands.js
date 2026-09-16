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
exports.registerSyncCommands = registerSyncCommands;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const SyncEngine_1 = require("../modules/syncEngine/SyncEngine");
const CommonScanner_1 = require("../modules/codeAssistant/CommonScanner");
const OutputManager_1 = require("../modules/output/OutputManager");
const CMD = (name) => `shone.sing.lone.toolkit.${name}`;
function registerSyncCommands(ctx, repoManager, configs) {
    // 同步当前仓库
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("syncCurrent"), async (uri) => {
        const repo = await _pickRepo(repoManager, uri);
        if (!repo) {
            return;
        }
        if (repo.dirty === 0) {
            void vscode.window.showInformationMessage(`${repo.name} 没有未提交改动`);
            return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `同步 ${repo.name}` }, p => (0, SyncEngine_1.syncRepo)(repo, ctx, p));
    }));
    // 拉取当前仓库
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("pullCurrent"), async (uri) => {
        const repo = await _pickRepo(repoManager, uri);
        if (!repo) {
            return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `拉取 ${repo.name}` }, p => (0, SyncEngine_1.pullRepo)(repo, p));
    }));
    // 查看当前仓库状态
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("statusCurrent"), async (uri) => {
        const repo = await _pickRepo(repoManager, uri);
        if (!repo) {
            return;
        }
        const lines = [
            `仓库：${repo.name}`,
            `路径：${repo.path}`,
            `分支：${repo.branch}`,
            `未提交改动：${repo.dirty}，冲突：${repo.conflicts}`
        ];
        for (const r of repo.remotes) {
            const aheadStr = r.ahead < 0 ? "?" : String(r.ahead);
            const behindStr = r.behind < 0 ? "?" : String(r.behind);
            lines.push(`远程 ${r.name}: ↑${aheadStr} ↓${behindStr}  ${r.url}`);
        }
        OutputManager_1.OutputManager.getInstance().info(lines.join("\n"));
        OutputManager_1.OutputManager.getInstance().show(true);
    }));
    // 全部同步
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("syncAll"), async () => {
        await (0, SyncEngine_1.syncAllDirty)(repoManager.views, ctx);
    }));
    // 全部拉取
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("pullAll"), async () => {
        await (0, SyncEngine_1.pullAllRepos)(repoManager.views);
    }));
    // 重新加载配置与函数索引
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("rescanConfigs"), async () => {
        const workspaceRoot = vscode.workspace.rootPath || "";
        const commonTsPath = (0, CommonScanner_1.findCommonTsFile)(workspaceRoot, configs);
        if (commonTsPath) {
            (0, CommonScanner_1.scanCommonTsFile)(commonTsPath, workspaceRoot);
            OutputManager_1.OutputManager.getInstance().info(`已重新扫描 common.ts: ${commonTsPath}`);
        }
        OutputManager_1.OutputManager.getInstance().info("配置与函数索引已重新加载");
    }));
}
async function _pickRepo(repoManager, uri) {
    if (uri) {
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const normalizedRoot = path.normalize(folder.uri.fsPath);
            if (uri.fsPath.startsWith(normalizedRoot)) {
                const repo = repoManager.views.find(r => r.path === normalizedRoot || r.path.startsWith(normalizedRoot));
                if (repo) {
                    return repo;
                }
            }
        }
    }
    const views = repoManager.views;
    if (views.length === 0) {
        void vscode.window.showWarningMessage("无可管理仓库");
        return undefined;
    }
    if (views.length === 1) {
        return views[0];
    }
    const picked = await vscode.window.showQuickPick(views.map(r => ({ label: r.name, description: r.branch, id: r.id })), { title: "选择仓库" });
    return picked ? views.find(r => r.id === picked.id) : undefined;
}
