/**
 * common.ts 自动扫描器（从 boundless-vue-helper/src/utils.autoScan.js 移植，JS→TS）
 * - 扫描 common.ts 提取 _.$xxx 函数定义
 * - 文件变化时热更新索引
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AliasConfig } from "./AliasResolver";

export interface ScanResult {
	vars: Record<string, [string, number, number]>;
	files: Record<string, string>;
}

let _scanResult: ScanResult = { vars: {}, files: {} };

export function getScanResult(): ScanResult {
	return _scanResult;
}

/**
 * 在各可能位置查找 common.ts
 */
export function findCommonTsFile(
	workspaceRoot: string,
	configs: AliasConfig
): string | null {
	const possiblePaths = [
		path.resolve(workspaceRoot, "statics", "common", "common.ts"),
		path.resolve(workspaceRoot, "common.ts"),
		path.resolve(workspaceRoot, "src", "common.ts")
	];
	for (const p of possiblePaths) {
		if (fs.existsSync(p)) {
			return p;
		}
	}
	if (Array.isArray(configs.mapping_statics)) {
		for (const mount of configs.mapping_statics) {
			const dir = path.resolve(workspaceRoot, mount.dir);
			const candidate = path.join(dir, "common.ts");
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return null;
}

/**
 * 扫描 common.ts 并提取 _.$xxx 函数定义（更新全局索引）
 */
export function scanCommonTsFile(commonTsPath: string, workspaceRoot: string): ScanResult {
	if (!fs.existsSync(commonTsPath)) {
		return _scanResult;
	}
	const content = fs.readFileSync(commonTsPath, "utf-8");

	// 匹配 _.$xxx = function / _.$xxx = ( / _.$xxx = () => / _.$xxx : function 等
	const funcRegex = /\.\$([a-zA-Z_]\w*)\s*=\s*(?:function|\(|async\s*\(|[a-zA-Z])/g;
	let match: RegExpExecArray | null;
	const functions: Record<string, [string, number, number]> = {};

	while ((match = funcRegex.exec(content)) !== null) {
		const funcName = match[1];
		if (funcName) {
			const lines = content.slice(0, match.index).split(/\r?\n/);
			const line = lines.length;
			const column = lines[lines.length - 1].length;
			functions[`$${funcName}`] = ["common", line, column];
		}
	}

	_scanResult = {
		vars: { ..._scanResult.vars, ...functions },
		files: { ..._scanResult.files, common: path.relative(workspaceRoot, commonTsPath) }
	};

	return _scanResult;
}

/**
 * 设置文件监听器（热更新 common.ts 索引）
 */
export function setupCommonTsWatcher(
	commonTsPath: string,
	workspaceRoot: string,
	configs: AliasConfig,
	ctx: vscode.ExtensionContext
): void {
	if (!commonTsPath) {
		return;
	}
	const watcher = vscode.workspace.createFileSystemWatcher(
		vscode.Uri.file(commonTsPath).fsPath,
		false, false, false
	);
	const rescan = () => {
		scanCommonTsFile(commonTsPath, workspaceRoot);
	};
	ctx.subscriptions.push(watcher);
	ctx.subscriptions.push(watcher.onDidChange(rescan));
	ctx.subscriptions.push(watcher.onDidCreate(rescan));
	ctx.subscriptions.push(watcher.onDidDelete(() => {}));
}
