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
exports.registerRepoCommands = registerRepoCommands;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const OutputManager_1 = require("../modules/output/OutputManager");
const git = __importStar(require("../utils/git"));
const CMD = (name) => `shone.sing.lone.toolkit.${name}`;
/**
 * 仓库相关命令：刷新 / 添加远程 / 管理远程 / 打开终端 / 资源管理器显示
 */
function registerRepoCommands(ctx, repoManager) {
    // 刷新仓库状态
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("refresh"), async () => {
        await repoManager.refreshDiscovery();
        OutputManager_1.OutputManager.getInstance().info("仓库列表已刷新");
    }));
    // 添加远程（对当前编辑器所属仓库操作）
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("addRemote"), async () => {
        const repo = await _pickRepo(repoManager);
        if (!repo) {
            return;
        }
        const name = await vscode.window.showInputBox({
            title: "远程名称",
            placeHolder: "例如：origin, gitee, upstream",
            validateInput: v => (v.trim() ? null : "请输入远程名称")
        });
        if (!name) {
            return;
        }
        const url = await vscode.window.showInputBox({
            title: "远程 URL",
            placeHolder: "例如：https://github.com/user/repo.git"
        });
        if (!url) {
            return;
        }
        const r = await git.addRemote(repo.path, name.trim(), url.trim());
        if (git.gitOk(r)) {
            void vscode.window.showInformationMessage(`已添加远程 ${name.trim()} 到 ${repo.name}`);
            await repoManager.refreshDiscovery();
        }
        else {
            void vscode.window.showErrorMessage(`添加远程失败：${r.stderr.trim()}`);
        }
    }));
    // 管理远程（QuickPick：列出/修改 URL/删除）
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("manageRemotes"), async () => {
        const repo = await _pickRepo(repoManager);
        if (!repo) {
            return;
        }
        const remoteStatuses = repo.remotes;
        if (remoteStatuses.length === 0) {
            void vscode.window.showInformationMessage("该仓库未配置远程仓库");
            return;
        }
        const items = [];
        for (const r of remoteStatuses) {
            items.push({ label: `查看 ${r.name}`, description: r.url, action: "view", remoteName: r.name });
            items.push({ label: `修改 ${r.name} URL`, description: r.url, action: "setUrl", remoteName: r.name });
            items.push({ label: `删除 ${r.name}`, description: r.url, action: "remove", remoteName: r.name });
        }
        const picked = await vscode.window.showQuickPick(items, { title: `管理远程 — ${repo.name}` });
        if (!picked) {
            return;
        }
        if (picked.action === "view") {
            void vscode.window.showInformationMessage(`${picked.remoteName}: ${picked.description}`);
        }
        else if (picked.action === "setUrl") {
            const newUrl = await vscode.window.showInputBox({
                title: `修改 ${picked.remoteName} URL`,
                value: picked.description
            });
            if (newUrl) {
                const r = await git.setRemoteUrl(repo.path, picked.remoteName, newUrl.trim());
                if (git.gitOk(r)) {
                    await repoManager.refreshDiscovery();
                }
                else {
                    void vscode.window.showErrorMessage(`修改失败：${r.stderr.trim()}`);
                }
            }
        }
        else if (picked.action === "remove") {
            const confirm = await vscode.window.showWarningMessage(`确认删除远程 ${picked.remoteName}？`, { modal: true }, "删除");
            if (confirm === "删除") {
                const r = await git.removeRemote(repo.path, picked.remoteName);
                if (git.gitOk(r)) {
                    await repoManager.refreshDiscovery();
                }
                else {
                    void vscode.window.showErrorMessage(`删除失败：${r.stderr.trim()}`);
                }
            }
        }
    }));
    // 打开仓库终端
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("openTerminal"), async (uri) => {
        const repo = await _pickRepo(repoManager, uri);
        if (repo) {
            const term = vscode.window.createTerminal({ name: repo.name, cwd: repo.path });
            term.show();
        }
    }));
    // 在资源管理器中显示仓库
    ctx.subscriptions.push(vscode.commands.registerCommand(CMD("revealInExplorer"), async (uri) => {
        const repo = await _pickRepo(repoManager, uri);
        if (repo) {
            await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(repo.path));
        }
    }));
}
async function _pickRepo(repoManager, uri) {
    // 如果调用方传了 uri（如右键菜单），直接定位
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
    // 有多个仓库时弹出选择
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
