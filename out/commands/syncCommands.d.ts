import * as vscode from "vscode";
import { RepoManager } from "../modules/repoManager/RepoManager";
import { AliasConfig } from "../modules/codeAssistant/AliasResolver";
export declare function registerSyncCommands(ctx: vscode.ExtensionContext, repoManager: RepoManager, configs: AliasConfig): void;
