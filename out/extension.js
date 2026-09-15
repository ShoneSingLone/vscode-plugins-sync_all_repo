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
const subtree_1 = require("./git/subtree");
const subtreeTreeDataProvider_1 = require("./tree/subtreeTreeDataProvider");
function activate(context) {
    const gitSubtreeManager = new subtree_1.GitSubtreeManager();
    const treeDataProvider = new subtreeTreeDataProvider_1.SubtreeTreeDataProvider(gitSubtreeManager);
    vscode.window.registerTreeDataProvider("shone.sing.lone.gitSubtreeManager", treeDataProvider);
    const refreshCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.refresh", () => {
        treeDataProvider.refresh();
    });
    const pullAllCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.pullAll", async () => {
        gitSubtreeManager.showOutput();
        const subtrees = await treeDataProvider.getSubtreeInfo();
        if (subtrees.length === 0) {
            vscode.window.showInformationMessage("未找到任何 Subtree");
            return;
        }
        await gitSubtreeManager.pullAll(subtrees);
        treeDataProvider.refresh();
    });
    const pushAllCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.pushAll", async () => {
        gitSubtreeManager.showOutput();
        const subtrees = await treeDataProvider.getSubtreeInfo();
        if (subtrees.length === 0) {
            vscode.window.showInformationMessage("未找到任何 Subtree");
            return;
        }
        await gitSubtreeManager.pushAll(subtrees);
        treeDataProvider.refresh();
    });
    const syncAllCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.syncAll", async () => {
        gitSubtreeManager.showOutput();
        const subtrees = await treeDataProvider.getSubtreeInfo();
        if (subtrees.length === 0) {
            vscode.window.showInformationMessage("未找到任何 Subtree");
            return;
        }
        await gitSubtreeManager.syncAll(subtrees);
        treeDataProvider.refresh();
    });
    const addSubtreeCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.addSubtree", async (uri) => {
        const prefix = uri ? uri.fsPath.split("/").pop() : undefined;
        const result = await vscode.window.showInputBox({
            prompt: "请输入子目录路径 (如: packages/utils)",
            value: prefix || "",
        });
        if (!result) {
            return;
        }
        const remote = await vscode.window.showInputBox({
            prompt: "请输入远程仓库 URL",
            placeHolder: "https://github.com/user/repo.git",
        });
        if (!remote) {
            return;
        }
        const branch = await vscode.window.showInputBox({
            prompt: "请输入分支名称",
            value: "main",
            placeHolder: "main",
        });
        if (!branch) {
            return;
        }
        gitSubtreeManager.showOutput();
        const addResult = await gitSubtreeManager.addSubtree(result, remote, branch);
        if (addResult.success) {
            vscode.window.showInformationMessage(`成功添加 Subtree: ${result}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`添加 Subtree 失败: ${addResult.error}`);
        }
    });
    const removeSubtreeCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.removeSubtree", async (item) => {
        const confirm = await vscode.window.showWarningMessage(`确定要移除 Subtree "${item.prefix}" 吗？`, { modal: true }, "确定", "取消");
        if (confirm !== "确定") {
            return;
        }
        gitSubtreeManager.showOutput();
        const result = await gitSubtreeManager.removeSubtree(item.prefix);
        if (result.success) {
            vscode.window.showInformationMessage(`成功移除 Subtree: ${item.prefix}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`移除 Subtree 失败: ${result.error}`);
        }
    });
    const pullCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.pull", async (item) => {
        gitSubtreeManager.showOutput();
        const result = await gitSubtreeManager.pullSubtree(item.prefix, item.remote, item.branch);
        if (result.success) {
            vscode.window.showInformationMessage(`成功拉取 ${item.prefix}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`拉取失败: ${result.error}`);
        }
    });
    const pushCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.push", async (item) => {
        gitSubtreeManager.showOutput();
        const result = await gitSubtreeManager.pushSubtree(item.prefix, item.remote, item.branch);
        if (result.success) {
            vscode.window.showInformationMessage(`成功推送 ${item.prefix}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`推送失败: ${result.error}`);
        }
    });
    const initCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.init", async (uri) => {
        if (!uri) {
            vscode.window.showErrorMessage("请在资源管理器中选择一个文件夹");
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage("无法获取工作区根目录");
            return;
        }
        const relativePath = uri.fsPath
            .replace(workspaceRoot, "")
            .replace(/^[\\/]/, "");
        const remote = await vscode.window.showInputBox({
            prompt: "请输入远程仓库 URL",
            placeHolder: "https://github.com/user/repo.git",
        });
        if (!remote) {
            return;
        }
        const branch = await vscode.window.showInputBox({
            prompt: "请输入分支名称",
            value: "main",
            placeHolder: "main",
        });
        if (!branch) {
            return;
        }
        gitSubtreeManager.showOutput();
        const result = await gitSubtreeManager.addSubtree(relativePath, remote, branch);
        if (result.success) {
            vscode.window.showInformationMessage(`成功初始化 Subtree: ${relativePath}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`初始化失败: ${result.error}`);
        }
    });
    const unbindCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.unbind", async (item) => {
        const confirm = await vscode.window.showWarningMessage(`确定要解绑 Subtree "${item.prefix}" 吗？本地文件将被保留。`, { modal: true }, "确定", "取消");
        if (confirm !== "确定") {
            return;
        }
        gitSubtreeManager.showOutput();
        const result = await gitSubtreeManager.removeSubtree(item.prefix);
        if (result.success) {
            vscode.window.showInformationMessage(`成功解绑 Subtree: ${item.prefix}`);
            treeDataProvider.refresh();
        }
        else {
            vscode.window.showErrorMessage(`解绑失败: ${result.error}`);
        }
    });
    const infoCommand = vscode.commands.registerCommand("shone.sing.lone.gitSubtreeManager.info", async (item) => {
        const info = await gitSubtreeManager.getSubtreeInfo(item.prefix);
        vscode.window.showInformationMessage(info);
    });
    context.subscriptions.push(refreshCommand, pullAllCommand, pushAllCommand, syncAllCommand, addSubtreeCommand, removeSubtreeCommand, pullCommand, pushCommand, initCommand, unbindCommand, infoCommand);
}
function deactivate() { }
