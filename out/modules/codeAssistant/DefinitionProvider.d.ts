/**
 * DefinitionProvider：移植自 boundless-vue-helper/src/provider.Definition.js，JS→TS
 * 支持六类跳转：.vue 路径串 / 组件标签 / _.$xxx / this.xxx / Vue.xxx / js 路径
 */
import * as vscode from "vscode";
import { AliasConfig } from "./AliasResolver";
export declare class ToolkitDefinitionProvider implements vscode.DefinitionProvider {
    readonly configs: AliasConfig;
    constructor(configs: AliasConfig);
    provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location | vscode.Location[] | null>;
}
export declare function registerDefinitionProvider(ctx: vscode.ExtensionContext, configs: AliasConfig): void;
