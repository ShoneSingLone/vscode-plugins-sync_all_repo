/**
 * CompletionProvider：移植自 boundless-vue-helper/src/provider.Completion.js，JS→TS
 * 字符串内 .vue 路径补全
 */
import * as vscode from "vscode";
import { AliasConfig } from "./AliasResolver";
export declare class ToolkitCompletionProvider implements vscode.CompletionItemProvider {
    readonly configs: AliasConfig;
    constructor(configs: AliasConfig);
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | null>;
    private _listVueFiles;
}
export declare function registerCompletionProvider(ctx: vscode.ExtensionContext, configs: AliasConfig): void;
