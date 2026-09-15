import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { OutputManager } from "../modules/output/OutputManager";

export interface GitResult {
	code: number;
	stdout: string;
	stderr: string;
}

const TIMEOUT_DEFAULT = 30_000;
const TIMEOUT_NETWORK = 120_000;
const TIMEOUT_PUSH = 300_000;

/** 执行 git 命令（execFile 参数数组，避免 Windows 路径引号问题），失败不抛异常，返回 code */
export function git(cwd: string, args: string[], timeoutMs = TIMEOUT_DEFAULT): Promise<GitResult> {
	return new Promise(resolve => {
		execFile(
			"git",
			args,
			{ cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
			(error, stdout, stderr) => {
				const code = error ? Number((error as any).code) || 1 : 0;
				const out = stdout == null ? "" : String(stdout);
				const err = stderr == null ? "" : String(stderr);
				if (code !== 0) {
					const firstErrLine = err.trim().split(/\r?\n/)[0] || "no stderr";
					OutputManager.getInstance().appendLine(
						`[git] ${args.join(" ")} (in ${cwd}) → exit ${code}: ${firstErrLine}`
					);
				}
				resolve({ code, stdout: out, stderr: err });
			}
		);
	});
}

export const gitOk = (r: GitResult): boolean => r.code === 0;

/** PRD 约定：只认 .git，有才管 */
export function isGitRepo(dir: string): boolean {
	return fs.existsSync(path.join(dir, ".git"));
}

export async function getCurrentBranch(cwd: string): Promise<string> {
	const r = await git(cwd, ["branch", "--show-current"]);
	if (gitOk(r) && r.stdout.trim()) {
		return r.stdout.trim();
	}
	const head = await git(cwd, ["rev-parse", "--short", "HEAD"]);
	return gitOk(head) ? `(detached:${head.stdout.trim()})` : "";
}

export interface RemoteInfo {
	name: string;
	url: string;
}

/** git remote -v → 去重后的远程列表（fetch url） */
export async function listRemotes(cwd: string): Promise<RemoteInfo[]> {
	const r = await git(cwd, ["remote", "-v"]);
	if (!gitOk(r)) {
		return [];
	}
	const remotes = new Map<string, string>();
	for (const line of r.stdout.split(/\r?\n/)) {
		const m = line.match(/^(\S+)\t(\S+)\s+\(fetch\)$/);
		if (m) {
			remotes.set(m[1], m[2]);
		}
	}
	return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
}

/**
 * 每个远程独立计算 ahead/behind（基于本地 remote-tracking ref，不联网）。
 * 远程 ref 不存在时返回 -1/-1（面板显示 ?）
 */
export async function getAheadBehind(
	cwd: string,
	remote: string,
	branch: string
): Promise<{ ahead: number; behind: number }> {
	const r = await git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${remote}/${branch}`]);
	if (!gitOk(r)) {
		return { ahead: -1, behind: -1 };
	}
	const parts = r.stdout.trim().split(/\s+/);
	const ahead = Number(parts[0]) || 0;
	const behind = Number(parts[1]) || 0;
	return { ahead, behind };
}

export interface PorcelainFile {
	/** 暂存区状态码 */
	x: string;
	/** 工作区状态码 */
	y: string;
	/** 文件相对路径（rename 取新路径） */
	file: string;
}

/** git status --porcelain → 解析为文件列表 */
export async function getPorcelain(cwd: string): Promise<PorcelainFile[]> {
	const r = await git(cwd, ["status", "--porcelain"]);
	if (!gitOk(r)) {
		return [];
	}
	return parsePorcelain(r.stdout);
}

/** porcelain 行解析（供单测/复用）：XY path，rename 为 "old -> new" 取 new */
export function parsePorcelain(stdout: string): PorcelainFile[] {
	const files: PorcelainFile[] = [];
	for (const rawLine of stdout.split(/\r?\n/)) {
		if (rawLine.length < 4) {
			continue;
		}
		const x = rawLine.charAt(0);
		const y = rawLine.charAt(1);
		let file = rawLine.slice(3);
		if (file.includes(" -> ")) {
			file = file.split(" -> ").pop() as string;
		}
		files.push({ x, y, file });
	}
	return files;
}

/** 冲突判定：未合并状态（U 出现 / AA / DD） */
export function isConflicted(f: PorcelainFile): boolean {
	return (
		f.x === "U" || f.y === "U" || (f.x === "A" && f.y === "A") || (f.x === "D" && f.y === "D")
	);
}

/** 是否有 upstream；有返回 upstream 全名（remote/branch），无返回 null */
export async function getUpstream(cwd: string): Promise<string | null> {
	const r = await git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
	return gitOk(r) && r.stdout.trim() ? r.stdout.trim() : null;
}

export async function fetchRemote(cwd: string, remote: string): Promise<GitResult> {
	return git(cwd, ["fetch", remote], TIMEOUT_NETWORK);
}

export async function pullRemote(cwd: string, remote: string, branch: string): Promise<GitResult> {
	return git(cwd, ["pull", remote, branch], TIMEOUT_NETWORK);
}

export async function addAll(cwd: string): Promise<GitResult> {
	return git(cwd, ["add", "."]);
}

export async function commit(cwd: string, message: string): Promise<GitResult> {
	return git(cwd, ["commit", "-m", message]);
}

/** push；无 upstream 时自动带 -u */
export async function pushRemote(cwd: string, remote: string, branch: string): Promise<GitResult> {
	const upstream = await getUpstream(cwd);
	const args = upstream ? ["push", remote, branch] : ["push", "-u", remote, branch];
	return git(cwd, args, TIMEOUT_PUSH);
}

export async function setRemoteUrl(cwd: string, name: string, url: string): Promise<GitResult> {
	return git(cwd, ["remote", "set-url", name, url]);
}

export async function addRemote(cwd: string, name: string, url: string): Promise<GitResult> {
	return git(cwd, ["remote", "add", name, url]);
}

export async function removeRemote(cwd: string, name: string): Promise<GitResult> {
	return git(cwd, ["remote", "remove", name]);
}

/** git diff --cached --numstat（须先 add）→ [{added, deleted, file}] */
export async function getStagedNumstat(
	cwd: string
): Promise<{ added: number; deleted: number; file: string }[]> {
	const r = await git(cwd, ["diff", "--cached", "--numstat"]);
	if (!gitOk(r)) {
		return [];
	}
	const list: { added: number; deleted: number; file: string }[] = [];
	for (const line of r.stdout.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
		if (m) {
			list.push({
				added: m[1] === "-" ? 0 : Number(m[1]),
				deleted: m[2] === "-" ? 0 : Number(m[2]),
				file: m[3].includes(" -> ") ? (m[3].split(" -> ").pop() as string) : m[3]
			});
		}
	}
	return list;
}
