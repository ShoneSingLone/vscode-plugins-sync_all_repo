/**
 * 激活守卫：检测当前工作区是否为 x-space 项目。
 * 检查各 workspace folder 根目录是否存在 configs.boundless.vue.project.js
 * → 命中：激活全部模块（仓库管理 + 代码跳转 + 同步）
 * → 未命中：仅激活模块 A（通用多仓库管理），不干扰非 x-space 项目
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AliasConfig } from "./modules/codeAssistant/AliasResolver";

export interface ActivationResult {
	/** 是否为 x-space 项目（决定了模块 B 是否启用） */
	isXspaceProject: boolean;
	/** 所有命中的 workspace root 路径 */
	xspaceRoots: string[];
	/** 别名配置（从 configs.boundless.vue.project.js 加载） */
	configs: AliasConfig;
}

export function detectXspaceProject(): ActivationResult {
	const result: ActivationResult = {
		isXspaceProject: false,
		xspaceRoots: [],
		configs: { alias: {}, mapping_statics: [] }
	};

	const folders = vscode.workspace.workspaceFolders || [];
	for (const folder of folders) {
		const configPath = path.join(folder.uri.fsPath, "configs.boundless.vue.project.js");
		if (fs.existsSync(configPath)) {
			result.isXspaceProject = true;
			result.xspaceRoots.push(folder.uri.fsPath);
			// 尝试加载配置
			try {
				delete require.cache[configPath];
				const rawConfigs = require(configPath);
				result.configs = {
					...(rawConfigs || {}),
					alias: rawConfigs.alias || {},
					mapping_statics: rawConfigs.mapping_statics || [],
					rootPath: folder.uri.fsPath
				};
			} catch (e: any) {
				console.error(`[x-space Toolkit] 加载配置失败 ${configPath}:`, e);
			}
			break;
		}
	}
	return result;
}
