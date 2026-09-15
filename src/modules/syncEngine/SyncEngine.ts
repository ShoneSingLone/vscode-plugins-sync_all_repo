import * as vscode from "vscode";
import { RepoView } from "../../types";
import { OutputManager } from "../output/OutputManager";
import * as git from "../../utils/git";
import { generateCommitMessage, StagedFile } from "./MessageGenerator";
import { pickRemotes } from "./RemotePicker";

type Progress = vscode.Progress<{ message?: string; increment?: number }>;

/** 单仓库同步：add → 生成 commit → 选远程 → push */
export async function syncRepo(
	repo: RepoView,
	ctx: vscode.ExtensionContext,
	progress?: Progress,
	skipAdd = false
): Promise<{ success: boolean; message: string }> {
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
		const staged: StagedFile[] = numstat.map(n => ({
			added: n.added,
			deleted: n.deleted,
			file: n.file
		}));
		if (staged.length === 0) {
			return { success: false, message: "暂存区无变更，已跳过" };
		}

		const { message: generated } = generateCommitMessage(staged, name, 1);
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

		const selectedRemotes = await pickRemotes(id, remotes, ctx.workspaceState);
		if (!selectedRemotes) {
			return { success: false, message: "用户取消远程选择" };
		}

		let allPushOk = true;
		const pushMessages: string[] = [];
		for (const remoteName of selectedRemotes) {
			progress?.report({ message: `${name}: push ${remoteName}` });
			const pushResult = await git.pushRemote(cwd, remoteName, branch);
			if (git.gitOk(pushResult)) {
				pushMessages.push(`✓ ${remoteName}`);
			} else {
				allPushOk = false;
				pushMessages.push(`✗ ${remoteName}: ${pushResult.stderr.trim()}`);
			}
		}
		const msg = `commit: ${commitMsg}\n${pushMessages.join("\n")}`;
		OutputManager.getInstance().info(`[sync] ${name}\n${msg}`);
		return { success: allPushOk, message: msg };
	} catch (e: any) {
		const msg = e?.message || String(e);
		OutputManager.getInstance().error(`[sync] ${name} 异常：${msg}`);
		return { success: false, message: msg };
	}
}

/** 单仓库拉取：fetch 所有远程 */
export async function pullRepo(
	repo: RepoView,
	progress?: Progress
): Promise<{ success: boolean; message: string }> {
	const { path: cwd, name, remotes } = repo;
	try {
		const messages: string[] = [];
		let ok = true;
		for (const r of remotes) {
			progress?.report({ message: `${name}: fetch ${r.name}` });
			const result = await git.fetchRemote(cwd, r.name);
			if (git.gitOk(result)) {
				messages.push(`✓ fetch ${r.name}`);
			} else {
				ok = false;
				messages.push(`✗ fetch ${r.name}: ${result.stderr.trim()}`);
			}
		}
		const msg = messages.join("\n") || "无远程配置";
		return { success: ok, message: msg };
	} catch (e: any) {
		return { success: false, message: e?.message || String(e) };
	}
}

/** 全部同步：遍历脏仓库，逐个走 syncRepo */
export async function syncAllDirty(
	repos: RepoView[],
	ctx: vscode.ExtensionContext
): Promise<void> {
	const dirtyRepos = repos.filter(r => r.dirty > 0);
	if (dirtyRepos.length === 0) {
		void vscode.window.showInformationMessage("没有需要同步的脏仓库");
		return;
	}
	const results: string[] = [];
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: "x-space 全部同步", cancellable: true },
		async (progress, token) => {
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
		}
	);
	OutputManager.getInstance().info(`[syncAll] 完成\n${results.join("\n")}`);
}

/** 全部拉取 */
export async function pullAllRepos(
	repos: RepoView[]
): Promise<void> {
	if (repos.length === 0) {
		void vscode.window.showInformationMessage("工作区内无可管理仓库");
		return;
	}
	const results: string[] = [];
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: "x-space 全部拉取", cancellable: true },
		async (progress, token) => {
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
		}
	);
	OutputManager.getInstance().info(`[pullAll] 完成\n${results.join("\n")}`);
}
