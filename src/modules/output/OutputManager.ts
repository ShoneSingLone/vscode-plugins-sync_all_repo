import * as vscode from "vscode";

/** 统一输出日志面板 */
export class OutputManager {
	private static _instance: OutputManager | undefined;
	private readonly channel: vscode.OutputChannel;

	private constructor() {
		this.channel = vscode.window.createOutputChannel("x-space Toolkit");
	}

	static getInstance(): OutputManager {
		if (!OutputManager._instance) {
			OutputManager._instance = new OutputManager();
		}
		return OutputManager._instance;
	}

	appendLine(message: string): void {
		const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
		this.channel.appendLine(`[${time}] ${message}`);
	}

	info(message: string): void {
		this.appendLine(`[INFO] ${message}`);
	}

	warn(message: string): void {
		this.appendLine(`[WARN] ${message}`);
	}

	error(message: string): void {
		this.appendLine(`[ERROR] ${message}`);
	}

	show(preserveFocus = true): void {
		this.channel.show(preserveFocus);
	}

	dispose(): void {
		this.channel.dispose();
		OutputManager._instance = undefined;
	}
}
