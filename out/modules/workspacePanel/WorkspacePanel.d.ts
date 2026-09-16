import * as vscode from "vscode";
import { RepoManager } from "../repoManager/RepoManager";
export declare class WorkspacePanel implements vscode.WebviewViewProvider {
    static readonly viewType = "shone.sing.lone.toolkit.workbench";
    private _view?;
    private _disposables;
    private _repoManager;
    private _ctx;
    constructor(ctx: vscode.ExtensionContext, repoManager: RepoManager);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): Thenable<void> | void;
    sendUpdate(): void;
    dispose(): void;
    private _sendUpdate;
    private _getHtml;
}
