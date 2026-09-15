import * as vscode from "vscode";
import { RemoteStatus } from "../../types";

const PICK_STATE_KEY_PREFIX = "xspace.remotePicker.";

/** 记忆上次选择（workspaceState 缓存），下次默认复用 */
function getRememberedSelectedNames(
	workspaceState: vscode.Memento,
	repoId: string
): string[] {
	return workspaceState.get<string[]>(`${PICK_STATE_KEY_PREFIX}${repoId}`, []);
}

function setRememberedSelectedNames(
	workspaceState: vscode.Memento,
	repoId: string,
	names: string[]
): void {
	workspaceState.update(`${PICK_STATE_KEY_PREFIX}${repoId}`, names);
}

/**
 * QuickPick 多选：列出仓库所有远程，多选，可记忆上次选择。
 * 返回用户最终勾选的远程名列表，取消返回 null。
 */
export async function pickRemotes(
	repoId: string,
	remotes: RemoteStatus[],
	workspaceState: vscode.Memento
): Promise<string[] | null> {
	if (remotes.length === 0) {
		void vscode.window.showWarningMessage("该仓库未配置远程仓库。");
		return null;
	}
	const remembered = getRememberedSelectedNames(workspaceState, repoId);
	const items: vscode.QuickPickItem[] = remotes.map(r => ({
		label: r.name,
		description: r.url,
		picked: remembered.includes(r.name) || (remembered.length === 0 && r.name === "origin")
	}));
	const picked = await vscode.window.showQuickPick(items, {
		title: "选择目标远程（可多选）",
		canPickMany: true,
		placeHolder: "勾选要 push 的远程，确认后逐个推送"
	});
	if (!picked) {
		return null;
	}
	const names = picked.map(i => i.label);
	setRememberedSelectedNames(workspaceState, repoId, names);
	return names;
}
