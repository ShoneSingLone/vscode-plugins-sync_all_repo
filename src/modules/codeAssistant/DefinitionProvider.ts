/**
 * DefinitionProvider：移植自 boundless-vue-helper/src/provider.Definition.js，JS→TS
 * 支持六类跳转：.vue 路径串 / 组件标签 / _.$xxx / this.xxx / Vue.xxx / js 路径
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AliasConfig, normalizedAbsolutePathForFS } from "./AliasResolver";
import { getScanResult } from "./CommonScanner";
import { VueLoader } from "./VueLoader";

// 六类匹配正则
const REG_VUE_PATH = /"([^"]*)\.vue"|'([^']*)\.vue'|`([^`]*)\.vue`/;
const REG_COMPONENT_TAG = /<\/?([\w-]+).*?/;
const REG_GLOBAL_VAR = /_\.\$(\w+)/;
const REG_VUE_VAR = /(Vue(\.\w+)+)/;
const REG_VUE_INTERNAL_REF = /this\.(\w+)|self\.(\w+)/;
const REG_JS_PATH = /"([^"]*)"|'([^']*)'|`([^`]*)`/;

function newFileLocation(absPath: string, line = 0, column = 0): vscode.Location {
	return new vscode.Location(
		vscode.Uri.file(absPath),
		new vscode.Position(line, column)
	);
}

function handleJumpToCommonUtils(
	label: string,
	documentUriPath: string,
	configs: AliasConfig
): vscode.Location[] | null {
	const scanResult = getScanResult();
	if (scanResult.vars[label]) {
		const [fileProps, line, column] = scanResult.vars[label];
		const filePath = scanResult.files[fileProps];
		if (filePath) {
			const absolutePath = path.resolve(vscode.workspace.rootPath || "", filePath);
			if (fs.existsSync(absolutePath)) {
				return [new vscode.Location(vscode.Uri.file(absolutePath), new vscode.Position(line - 1, column))];
			}
			const jsPath = absolutePath.replace(/\.ts$/, ".js");
			if (fs.existsSync(jsPath)) {
				return [new vscode.Location(vscode.Uri.file(jsPath), new vscode.Position(line - 1, column))];
			}
		}
	}

	// 回退：直接解析 common.ts
	const possiblePaths = [
		path.resolve(vscode.workspace.rootPath || "", "statics", "common", "libs", "common.ts"),
		path.resolve(vscode.workspace.rootPath || "", "statics", "common", "common.ts")
	];
	if (Array.isArray(configs.mapping_statics)) {
		for (const mount of configs.mapping_statics) {
			possiblePaths.push(path.resolve(vscode.workspace.rootPath || "", mount.dir, "common.ts"));
		}
	}
	for (const p of possiblePaths) {
		if (fs.existsSync(p)) {
			const content = fs.readFileSync(p, "utf-8");
			const regex = new RegExp(`_\\.${label}`, "g");
			const match = regex.exec(content);
			if (match) {
				const lines = content.slice(0, match.index).split(/\r?\n/);
				const line = lines.length;
				const column = lines[lines.length - 1].length;
				return [new vscode.Location(vscode.Uri.file(p), new vscode.Position(line - 1, column))];
			}
		}
	}
	return null;
}

function handleJumpToComponentTag(tagName: string, configs: AliasConfig): vscode.Location[] | null {
	const components = (configs as any).components;
	if (!components || !components[tagName]) {
		return null;
	}
	const workspaceRoot = vscode.workspace.rootPath || "";
	return components[tagName]
		.map((relativePath: string) => {
			const absolutePath = path.resolve(workspaceRoot, relativePath);
			if (fs.existsSync(absolutePath)) {
				return newFileLocation(absolutePath);
			}
			return null;
		})
		.filter(Boolean) as vscode.Location[];
}

function handleJumpToVueInternalRef(
	document: vscode.TextDocument,
	documentUriPath: string,
	selectedString: string
): vscode.Location | null {
	try {
		const parsedVue = VueLoader(document.getText());
		const pos = parsedVue.findElementPosition("methods", selectedString)
			|| parsedVue.findElementPosition("computed", selectedString)
			|| parsedVue.findElementPosition("props", selectedString);
		if (pos && pos.line !== undefined) {
			return newFileLocation(documentUriPath, pos.line, pos.column || 0);
		}
	} catch {
		// ignore
	}
	return null;
}

export class ToolkitDefinitionProvider implements vscode.DefinitionProvider {
	readonly configs: AliasConfig;
	constructor(configs: AliasConfig) {
		this.configs = configs;
	}

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Location | vscode.Location[] | null> {
		const { path: documentUriPath } = document.uri;
		let range: vscode.Range | undefined;
		let selectedString: string | undefined;
		let currentRegexp: RegExp | undefined;

		// 优先级：.vue 路径 → 组件标签 → _.$xxx → this.xxx → Vue.xxx → js 路径
		const tryRegex = (regex: RegExp) => {
			range = document.getWordRangeAtPosition(position, regex);
			currentRegexp = regex;
			return !!range;
		};

		if (tryRegex(REG_VUE_PATH)) { /* .vue 路径 */ }
		else if (tryRegex(REG_COMPONENT_TAG)) { /* 组件标签 */ }
		else if (tryRegex(REG_GLOBAL_VAR)) { /* _.$xxx */ }
		else if (tryRegex(REG_VUE_INTERNAL_REF)) { /* this.xxx */ }
		else if (tryRegex(REG_VUE_VAR)) { /* Vue.xxx */ }
		else if (tryRegex(REG_JS_PATH)) { /* js 路径 */ }
		else { return null; }

		if (!range || !currentRegexp) {
			return null;
		}
		selectedString = document.getText(range).match(currentRegexp)?.[1];
		if (!selectedString) {
			return null;
		}

		if (currentRegexp === REG_VUE_PATH) {
			selectedString = `${selectedString}.vue`;
		} else if (currentRegexp === REG_GLOBAL_VAR) {
			selectedString = `$${selectedString}`;
		}

		if (currentRegexp === REG_COMPONENT_TAG) {
			return handleJumpToComponentTag(selectedString, this.configs);
		}
		if (currentRegexp === REG_GLOBAL_VAR) {
			return handleJumpToCommonUtils(selectedString, documentUriPath, this.configs);
		}
		if (currentRegexp === REG_VUE_INTERNAL_REF) {
			return handleJumpToVueInternalRef(document, documentUriPath, selectedString);
		}

		const normalized = normalizedAbsolutePathForFS({
			documentUriPath,
			urlInSourceCode: selectedString,
			configs: this.configs
		});
		if (normalized) {
			return newFileLocation(normalized);
		}
		return null;
	}
}

export function registerDefinitionProvider(
	ctx: vscode.ExtensionContext,
	configs: AliasConfig
): void {
	const provider = new ToolkitDefinitionProvider(configs);
	const subscription = vscode.languages.registerDefinitionProvider(
		[
			{ scheme: "file", language: "vue" },
			{ scheme: "file", language: "javascript" },
			{ scheme: "file", language: "typescript" }
		],
		provider
	);
	ctx.subscriptions.push(subscription);
}
