/**
 * CompletionProvider：移植自 boundless-vue-helper/src/provider.Completion.js，JS→TS
 * 字符串内 .vue 路径补全
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AliasConfig, normalizedAbsolutePathForFS } from "./AliasResolver";

const REG_UNDONE_PATH_REG = /"([^"]*)"|'([^']*)'|`([^`]*)`/;

export class ToolkitCompletionProvider implements vscode.CompletionItemProvider {
	readonly configs: AliasConfig;
	constructor(configs: AliasConfig) {
		this.configs = configs;
	}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[] | null> {
		const range = document.getWordRangeAtPosition(position, REG_UNDONE_PATH_REG);
		if (!range) {
			return null;
		}
		const text = document.getText(range);
		const match = text.match(REG_UNDONE_PATH_REG);
		if (!match) {
			return null;
		}
		const urlInSourceCode = match[1];
		const { path: documentUriPath } = document.uri;
		const normalizedDir = normalizedAbsolutePathForFS({
			documentUriPath,
			urlInSourceCode,
			configs: this.configs,
			isGetDir: true
		});
		if (!normalizedDir || !fs.existsSync(normalizedDir)) {
			return null;
		}
		return this._listVueFiles(normalizedDir);
	}

	private _listVueFiles(dirPath: string): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith(".vue")) {
					const label = entry.name;
					const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.File);
					items.push(item);
				}
			}
		} catch {
			// 目录不存在或无权限
		}
		return items;
	}
}

export function registerCompletionProvider(
	ctx: vscode.ExtensionContext,
	configs: AliasConfig
): void {
	const provider = new ToolkitCompletionProvider(configs);
	const subscription = vscode.languages.registerCompletionItemProvider(
		[
			{ scheme: "file", language: "vue" },
			{ scheme: "file", language: "javascript" },
			{ scheme: "file", language: "typescript" }
		],
		provider,
		"/",
		"."
	);
	ctx.subscriptions.push(subscription);
}
