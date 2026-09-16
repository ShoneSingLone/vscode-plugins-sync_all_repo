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
exports.syncRepo = syncRepo;
exports.pullRepo = pullRepo;
exports.syncAllDirty = syncAllDirty;
exports.pullAllRepos = pullAllRepos;
const vscode = __importStar(require("vscode"));
const OutputManager_1 = require("../output/OutputManager");
const git = __importStar(require("../../utils/git"));
const MessageGenerator_1 = require("./MessageGenerator");
const RemotePicker_1 = require("./RemotePicker");
/** 单仓库同步：add → 生成 commit → 选远程 → push */
async function syncRepo(repo, ctx, progress, skipAdd = false) {
    const { path: cwd, name, id, branch, remotes } = repo;
    try {
        progress?.report({ message: `${name}: add .` });
        if (!skipAdd) {
            const addResult = await git.addAll(cwd);
            if (!git.gitOk(addResult)) {
                return { success: false, message: `git add 失败：${addResult.stderr.trim()}` };
            }
        }
        const numstat = await git.getStagedNumstat(cwd);
        const staged = numstat.map(n => ({
            added: n.added,
            deleted: n.deleted,
            file: n.file
        }));
        if (staged.length === 0) {
            return { success: false, message: "暂存区无变更，已跳过" };
        }
        const { message: generated } = (0, MessageGenerator_1.generateCommitMessage)(staged, name, repo.level);
        const edited = await vscode.window.showInputBox({
            title: `${name} — commit message（可编辑）`,
            value: generated,
            validateInput: v => (v.trim().length > 0 ? null : "提交信息不能为空")
        });
        if (edited === undefined) {
            return { success: false, message: "用户取消" };
        }
        const commitMsg = edited.trim();
        progress?.report({ message: `${name}: commit` });
        const commitResult = await git.commit(cwd, commitMsg);
        if (!git.gitOk(commitResult)) {
            void vscode.window.showWarningMessage(`${name} commit 失败：${commitResult.stderr.trim()}`);
            return { success: false, message: `commit 失败：${commitResult.stderr.trim()}` };
        }
        const selectedRemotes = await (0, RemotePicker_1.pickRemotes)(id, remotes, ctx.workspaceState);
        if (!selectedRemotes) {
            return { success: false, message: "用户取消远程选择" };
        }
        let allPushOk = true;
        const pushMessages = [];
        for (const remoteName of selectedRemotes) {
            progress?.report({ message: `${name}: push ${remoteName}` });
            const pushResult = await git.pushRemote(cwd, remoteName, branch);
            if (git.gitOk(pushResult)) {
                pushMessages.push(`✓ ${remoteName}`);
            }
            else {
                allPushOk = false;
                pushMessages.push(`✗ ${remoteName}: ${pushResult.stderr.trim()}`);
            }
        }
        const msg = `commit: ${commitMsg}\n${pushMessages.join("\n")}`;
        OutputManager_1.OutputManager.getInstance().info(`[sync] ${name}\n${msg}`);
        return { success: allPushOk, message: msg };
    }
    catch (e) {
        const msg = e?.message || String(e);
        OutputManager_1.OutputManager.getInstance().error(`[sync] ${name} 异常：${msg}`);
        return { success: false, message: msg };
    }
}
/** 单仓库拉取：fetch 所有远程 */
async function pullRepo(repo, progress) {
    const { path: cwd, name, remotes } = repo;
    try {
        const messages = [];
        let ok = true;
        for (const r of remotes) {
            progress?.report({ message: `${name}: fetch ${r.name}` });
            const result = await git.fetchRemote(cwd, r.name);
            if (git.gitOk(result)) {
                messages.push(`✓ fetch ${r.name}`);
            }
            else {
                ok = false;
                messages.push(`✗ fetch ${r.name}: ${result.stderr.trim()}`);
            }
        }
        const msg = messages.join("\n") || "无远程配置";
        return { success: ok, message: msg };
    }
    catch (e) {
        return { success: false, message: e?.message || String(e) };
    }
}
/** 全部同步：遍历脏仓库，逐个走 syncRepo */
async function syncAllDirty(repos, ctx) {
    const dirtyRepos = repos.filter(r => r.dirty > 0);
    if (dirtyRepos.length === 0) {
        void vscode.window.showInformationMessage("没有需要同步的脏仓库");
        return;
    }
    const results = [];
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "x-space 全部同步", cancellable: true }, async (progress, token) => {
        for (let i = 0; i < dirtyRepos.length; i++) {
            if (token.isCancellationRequested) {
                results.push("（用户取消）");
                break;
            }
            const repo = dirtyRepos[i];
            progress.report({
                message: `[${i + 1}/${dirtyRepos.length}] ${repo.name}`,
                increment: 100 / dirtyRepos.length
            });
            const r = await syncRepo(repo, ctx, progress, false);
            results.push(`${repo.name}: ${r.message}`);
        }
    });
    OutputManager_1.OutputManager.getInstance().info(`[syncAll] 完成\n${results.join("\n")}`);
}
/** 全部拉取 */
async function pullAllRepos(repos) {
    if (repos.length === 0) {
        void vscode.window.showInformationMessage("工作区内无可管理仓库");
        return;
    }
    const results = [];
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "x-space 全部拉取", cancellable: true }, async (progress, token) => {
        for (let i = 0; i < repos.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }
            const repo = repos[i];
            progress.report({
                message: `[${i + 1}/${repos.length}] ${repo.name}`,
                increment: 100 / repos.length
            });
            const r = await pullRepo(repo, progress);
            results.push(`${repo.name}: ${r.message}`);
        }
    });
    OutputManager_1.OutputManager.getInstance().info(`[pullAll] 完成\n${results.join("\n")}`);
}
