import * as vscode from "vscode";
import * as path from "path";
import { RepoManager } from "../modules/repoManager/RepoManager";
import { syncRepo, pullRepo, syncAllDirty, pullAllRepos } from "../modules/syncEngine/SyncEngine";
import { findCommonTsFile, scanCommonTsFile } from "../modules/codeAssistant/CommonScanner";
import { AliasConfig } from "../modules/codeAssistant/AliasResolver";
import { OutputManager } from "../modules/output/OutputManager";
import * as git from "../utils/git";
import { RepoView } from "../types";

const CMD = (name: string) => `shone.sing.lone.toolkit.${name}`;

export function registerSyncCommands(
	ctx: vscode.ExtensionContext,
	repoManager: RepoManager,
	configs: AliasConfig
): void {
	// 同步当前仓库
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("syncCurrent"), async (uri?: vscode.Uri) => {
			const repo = await _pickRepo(repoManager, uri);
			if (!repo) {
				return;
			}
			if (repo.dirty === 0) {
				void vscode.window.showInformationMessage(`${repo.name} 没有未提交改动`);
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `同步 ${repo.name}` },
				p => syncRepo(repo, ctx, p)
			);
		})
	);

	// 拉取当前仓库
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("pullCurrent"), async (uri?: vscode.Uri) => {
			const repo = await _pickRepo(repoManager, uri);
			if (!repo) {
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `拉取 ${repo.name}` },
				p => pullRepo(repo, p)
			);
		})
	);

	// 查看当前仓库状态
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("statusCurrent"), async (uri?: vscode.Uri) => {
			const repo = await _pickRepo(repoManager, uri);
			if (!repo) {
				return;
			}
			const lines: string[] = [
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
			OutputManager.getInstance().info(lines.join("\n"));
			OutputManager.getInstance().show(true);
		})
	);

	// 全部同步
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("syncAll"), async () => {
			await syncAllDirty(repoManager.views, ctx);
		})
	);

	// 全部拉取
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("pullAll"), async () => {
			await pullAllRepos(repoManager.views);
		})
	);

	// 重新加载配置与函数索引
	ctx.subscriptions.push(
		vscode.commands.registerCommand(CMD("rescanConfigs"), async () => {
			const workspaceRoot = vscode.workspace.rootPath || "";
			const commonTsPath = findCommonTsFile(workspaceRoot, configs);
			if (commonTsPath) {
				scanCommonTsFile(commonTsPath, workspaceRoot);
				OutputManager.getInstance().info(`已重新扫描 common.ts: ${commonTsPath}`);
			}
			OutputManager.getInstance().info("配置与函数索引已重新加载");
		})
	);
}

async function _pickRepo(
	repoManager: RepoManager,
	uri?: vscode.Uri
): Promise<RepoView | undefined> {
	if (uri) {
		for (const folder of vscode.workspace.workspaceFolders || []) {
			const normalizedRoot = path.normalize(folder.uri.fsPath);
			if (uri.fsPath.startsWith(normalizedRoot)) {
				const repo = repoManager.views.find(
					r => r.path === normalizedRoot || r.path.startsWith(normalizedRoot)
				);
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
	const picked = await vscode.window.showQuickPick(
		views.map(r => ({ label: r.name, description: r.branch, id: r.id })),
		{ title: "选择仓库" }
	);
	return picked ? views.find(r => r.id === picked.id) : undefined;
}
