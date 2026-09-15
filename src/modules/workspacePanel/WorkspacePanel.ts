import * as vscode from "vscode";
import { RepoManager } from "../repoManager/RepoManager";
import { syncRepo, pullRepo, syncAllDirty, pullAllRepos } from "../syncEngine/SyncEngine";
import * as git from "../../utils/git";
import { OutputManager } from "../output/OutputManager";

export class WorkspacePanel implements vscode.WebviewViewProvider {
	public static readonly viewType = "xspaceToolkit.workbench";
	private _view?: vscode.WebviewView;
	private _disposables: vscode.Disposable[] = [];
	private _repoManager: RepoManager;
	private _ctx: vscode.ExtensionContext;

	constructor(ctx: vscode.ExtensionContext, repoManager: RepoManager) {
		this._ctx = ctx;
		this._repoManager = repoManager;
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): Thenable<void> | void {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._ctx.extensionUri, "webview")]
		};
		webviewView.webview.html = this._getHtml(webviewView.webview);
		webviewView.onDidDispose(() => {
			this._view = undefined;
		}, null, this._disposables);

		// 消息收发
		webviewView.webview.onDidReceiveMessage(async (msg: any) => {
			if (!msg || typeof msg.type !== "string") {
				return;
			}
			const { type, payload } = msg;
			const repoId = payload?.repoId as string | undefined;
			const repo = repoId ? this._repoManager.views.find(r => r.id === repoId) : undefined;
			switch (type) {
				case "sync": {
					if (!repo) {
						return;
					}
					await vscode.window.withProgress(
						{ location: vscode.ProgressLocation.Notification, title: `同步 ${repo.name}` },
						p => syncRepo(repo, this._ctx, p)
					);
					this._sendUpdate();
					break;
				}
				case "pull": {
					if (!repo) {
						return;
					}
					await vscode.window.withProgress(
						{ location: vscode.ProgressLocation.Notification, title: `拉取 ${repo.name}` },
						p => pullRepo(repo, p)
					);
					this._sendUpdate();
					break;
				}
				case "syncAll": {
					await syncAllDirty(this._repoManager.views, this._ctx);
					this._sendUpdate();
					break;
				}
				case "pullAll": {
					await pullAllRepos(this._repoManager.views);
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
					const lines: string[] = [
						`仓库：${repo.name}`,
						`分支：${repo.branch}`,
						`未提交改动：${repo.dirty}，冲突：${repo.conflicts}`
					];
					for (const r of repo.remotes) {
						const aheadStr = r.ahead < 0 ? "?" : String(r.ahead);
						const behindStr = r.behind < 0 ? "?" : String(r.behind);
						lines.push(`远程 ${r.name}: ↑${aheadStr} ↓${behindStr}  ${r.url}`);
					}
					OutputManager.getInstance().info(lines.join("\n"));
					OutputManager.getInstance().show(true);
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

	sendUpdate(): void {
		this._sendUpdate();
	}

	dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}

	private _sendUpdate(): void {
		if (!this._view) {
			return;
		}
		this._view.webview.postMessage({ type: "update", payload: this._repoManager.views });
	}

	private _getHtml(webview: vscode.Webview): string {
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._ctx.extensionUri, "webview", "panel.css")
		);
		const jsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._ctx.extensionUri, "webview", "panel.js")
		);
		return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${_nonce}';">
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
<script nonce="${_nonce}" src="${jsUri}"></script>
</body>
</html>`;
	}
}

let _nonce = "";
function getNonce(): string {
	let text = "";
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}
// 每次调用生成新 nonce
NonceGenerator();
function NonceGenerator() {
	_nonce = getNonce();
}
