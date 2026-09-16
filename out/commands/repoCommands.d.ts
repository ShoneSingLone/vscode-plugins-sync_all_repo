import * as vscode from "vscode";
import { RepoManager } from "../modules/repoManager/RepoManager";
/**
 * 仓库相关命令：刷新 / 添加远程 / 管理远程 / 打开终端 / 资源管理器显示
 */
export declare function registerRepoCommands(ctx: vscode.ExtensionContext, repoManager: RepoManager): void;
