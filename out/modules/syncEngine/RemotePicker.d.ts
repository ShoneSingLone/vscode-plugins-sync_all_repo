import * as vscode from "vscode";
import { RemoteStatus } from "../../types";
/**
 * QuickPick 多选：列出仓库所有远程，多选，可记忆上次选择。
 * 返回用户最终勾选的远程名列表，取消返回 null。
 */
export declare function pickRemotes(repoId: string, remotes: RemoteStatus[], workspaceState: vscode.Memento): Promise<string[] | null>;
