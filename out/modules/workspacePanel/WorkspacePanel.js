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
exports.WorkspacePanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const SyncEngine_1 = require("../syncEngine/SyncEngine");
const OutputManager_1 = require("../output/OutputManager");
class WorkspacePanel {
    constructor(ctx, repoManager) {
        this._disposables = [];
        this._ctx = ctx;
        this._repoManager = repoManager;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this._ctx.extensionUri.fsPath, "webview"))]
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        webviewView.onDidDispose(() => {
            this._view = undefined;
        }, null, this._disposables);
        // 消息收发
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (!msg || typeof msg.type !== "string") {
                return;
            }
            const { type, payload } = msg;
            const repoId = payload?.repoId;
            const repo = repoId ? this._repoManager.views.find(r => r.id === repoId) : undefined;
            switch (type) {
                case "ready": {
                    // webview 前端就绪，立即推送一次状态（解决 resolveWebviewView 早期推送丢失的竞态）
                    this._sendUpdate();
                    break;
                }
                case "sync": {
                    if (!repo) {
                        return;
                    }
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `同步 ${repo.name}` }, p => (0, SyncEngine_1.syncRepo)(repo, this._ctx, p));
                    this._sendUpdate();
                    break;
                }
                case "pull": {
                    if (!repo) {
                        return;
                    }
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `拉取 ${repo.name}` }, p => (0, SyncEngine_1.pullRepo)(repo, p));
                    this._sendUpdate();
                    break;
                }
                case "syncAll": {
                    await (0, SyncEngine_1.syncAllDirty)(this._repoManager.views, this._ctx);
                    this._sendUpdate();
                    break;
                }
                case "pullAll": {
                    await (0, SyncEngine_1.pullAllRepos)(this._repoManager.views);
                    this._sendUpdate();
                    break;
                }
                case "refresh": {
                    await this._repoManager.refreshDiscovery();
                    break;
                }
                case "openTerminal": {
                    if (repo) {
                        const term = vscode.window.createTerminal({ name: repo.name, cwd: repo.path });
                        term.show();
                    }
                    break;
                }
                case "revealInExplorer": {
                    if (repo) {
                        await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(repo.path));
                    }
                    break;
                }
                case "status": {
                    if (!repo) {
                        return;
                    }
                    const lines = [
                        `仓库：${repo.name}`,
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
                    break;
                }
                default:
                    break;
            }
        });
        // 首次打开推送数据
        if (this._repoManager.ready) {
            this._sendUpdate();
        }
        // 注册 onChange
        this._repoManager.onChange(() => this._sendUpdate());
    }
    sendUpdate() {
        this._sendUpdate();
    }
    dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
    _sendUpdate() {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({ type: "update", payload: this._repoManager.views });
    }
    _getHtml(webview) {
        const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._ctx.extensionUri.fsPath, "webview", "panel.css")));
        const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._ctx.extensionUri.fsPath, "webview", "panel.js")));
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${cssUri}"/>
<title>x-space 工作台</title>
</head>
<body>
<div class="toolbar">
  <input type="text" id="searchInput" class="search-input" placeholder="搜索仓库…"/>
  <button id="btnRefresh" class="tb-btn" title="刷新">🔄</button>
  <button id="btnPullAll" class="tb-btn" title="全部拉取">⬇ 全部拉取</button>
  <button id="btnSyncAll" class="tb-btn primary" title="全部同步">🔃 全部同步</button>
</div>
<div id="repoList" class="repo-list"></div>
<div id="emptyState" class="empty-state" style="display:none;">无可管理的 Git 仓库</div>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
}
exports.WorkspacePanel = WorkspacePanel;
WorkspacePanel.viewType = "shone.sing.lone.toolkit.workbench";
function getNonce() {
    let text = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
