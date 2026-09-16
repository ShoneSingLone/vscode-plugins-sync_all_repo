import * as vscode from "vscode";
import { RepoView } from "../../types";
type Progress = vscode.Progress<{
    message?: string;
    increment?: number;
}>;
/** 单仓库同步：add → 生成 commit → 选远程 → push */
export declare function syncRepo(repo: RepoView, ctx: vscode.ExtensionContext, progress?: Progress, skipAdd?: boolean): Promise<{
    success: boolean;
    message: string;
}>;
/** 单仓库拉取：fetch 所有远程 */
export declare function pullRepo(repo: RepoView, progress?: Progress): Promise<{
    success: boolean;
    message: string;
}>;
/** 全部同步：遍历脏仓库，逐个走 syncRepo */
export declare function syncAllDirty(repos: RepoView[], ctx: vscode.ExtensionContext): Promise<void>;
/** 全部拉取 */
export declare function pullAllRepos(repos: RepoView[]): Promise<void>;
export {};
