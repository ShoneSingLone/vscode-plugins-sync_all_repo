import * as fs from "fs";
import * as path from "path";
import { Repo } from "../types";
import { isGitRepo } from "./git";

/** 排除目录：node_modules、.claude、归档目录等，始终忽略 */
const EXCLUDE_PATTERN =
	/(^|[\\/])(node_modules|\.git|\.claude|\.vscode|\.idea|dist|out|build|coverage)([\\/]|$)|archive|归档|_ignore|backup/i;

export function isExcludedDirName(name: string): boolean {
	return EXCLUDE_PATTERN.test(name);
}

/**
 * 仓库发现（扁平化扫描，PRD 约定层级只有 1/2 级）：
 * - workspace folder 根有 .git → 记为 1 级
 * - folder 下一层子目录有 .git → 记为 2 级（根有 .git 时子目录仍会扫，两层数据都收）
 * - 绝不深入第 3 层
 */
export async function discoverRepos(): Promise<Repo[]> {
	const repos: Repo[] = [];
	const seen = new Set<string>();
	const pushRepo = (dir: string, level: 1 | 2) => {
		const normalized = path.normalize(dir);
		if (seen.has(normalized)) {
			return;
		}
		seen.add(normalized);
		repos.push({ path: normalized, name: path.basename(normalized), level });
	};

	for (const folder of vscode.workspace.workspaceFolders || []) {
		const root = folder.uri.fsPath;
		if (isGitRepo(root)) {
			pushRepo(root, 1);
		}
		let children: string[] = [];
		try {
			const entries = await fs.promises.readdir(root, { withFileTypes: true });
			children = entries.filter(e => e.isDirectory()).map(e => path.join(root, e.name));
		} catch {
			continue;
		}
		for (const child of children) {
			if (isExcludedDirName(path.basename(child))) {
				continue;
			}
			if (isGitRepo(child)) {
				pushRepo(child, 2);
			}
		}
	}
	return repos;
}
