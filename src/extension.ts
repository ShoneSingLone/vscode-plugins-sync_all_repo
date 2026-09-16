import * as vscode from "vscode";
import { detectXspaceProject } from "./activationGuard";
import { RepoManager } from "./modules/repoManager/RepoManager";
import { WorkspacePanel } from "./modules/workspacePanel/WorkspacePanel";
import { OutputManager } from "./modules/output/OutputManager";
import { registerRepoCommands } from "./commands/repoCommands";
import { registerSyncCommands } from "./commands/syncCommands";
import {
	registerDefinitionProvider,
	registerCompletionProvider,
	findCommonTsFile,
	scanCommonTsFile,
	setupCommonTsWatcher
} from "./modules/codeAssistant";
import { AliasConfig } from "./modules/codeAssistant/AliasResolver";

let repoManager: RepoManager;
let workspacePanel: WorkspacePanel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	OutputManager.getInstance().info("x-space Toolkit 正在激活...");

	// 激活守卫
	const detection = detectXspaceProject();
	if (detection.isXspaceProject) {
		OutputManager.getInstance().info(
			`检测到 x-space 项目，激活全部模块（跳转+片段+同步）；根目录：${detection.xspaceRoots.join(", ")}`
		);
	} else {
		OutputManager.getInstance().info("非 x-space 项目，仅激活多仓库管理模块");
	}

	// 初始化仓库管理器
	repoManager = new RepoManager();
	await repoManager.init();

	// 注册底部面板
	workspacePanel = new WorkspacePanel(context, repoManager);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"shone-sing-lone-toolkit-workbench",
			workspacePanel,
			{
				webviewOptions: { retainContextWhenHidden: true }
			}
		)
	);
	repoManager.onChange(() => workspacePanel.sendUpdate());

	// 注册命令（模块 A：通用）
	registerRepoCommands(context, repoManager);
	registerSyncCommands(context, repoManager, detection.configs);

	// 模块 B：代码智能跳转（仅 x-space 项目激活）
	if (detection.isXspaceProject) {
		const configs = detection.configs;
		registerDefinitionProvider(context, configs);
		registerCompletionProvider(context, configs);

		// 自动扫描 common.ts
		const workspaceRoot = vscode.workspace.rootPath || "";
		const commonTsPath = findCommonTsFile(workspaceRoot, configs);
		if (commonTsPath) {
			scanCommonTsFile(commonTsPath, workspaceRoot);
			setupCommonTsWatcher(commonTsPath, workspaceRoot, configs, context);
			OutputManager.getInstance().info(`common.ts 索引已建立：${commonTsPath}`);
		} else {
			OutputManager.getInstance().warn("未找到 common.ts，_.$xxx 跳转不可用");
		}

		// 监听配置文件变化（热重载 configs.boundless.vue.project.js）
		const configWatcher = vscode.workspace.createFileSystemWatcher("**/configs.boundless.vue.project.js");
		context.subscriptions.push(configWatcher);
		context.subscriptions.push(configWatcher.onDidChange(() => {
			OutputManager.getInstance().info("configs.boundless.vue.project.js 变更，重新加载配置…");
			// 重新检测激活
			const newDetection = detectXspaceProject();
			// 重新扫描 common.ts
			const newRoot = vscode.workspace.rootPath || "";
			const newPath = findCommonTsFile(newRoot, newDetection.configs);
			if (newPath) {
				scanCommonTsFile(newPath, newRoot);
			}
			OutputManager.getInstance().info("配置已重新加载");
		}));
	}

	OutputManager.getInstance().info("x-space Toolkit 已激活完毕 ✓");
}

export function deactivate(): void {
	repoManager?.dispose();
	workspacePanel?.dispose();
	OutputManager.getInstance().info("x-space Toolkit 已停用");
}
