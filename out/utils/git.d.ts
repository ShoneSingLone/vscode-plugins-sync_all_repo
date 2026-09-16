export interface GitResult {
    code: number;
    stdout: string;
    stderr: string;
}
/** 执行 git 命令（execFile 参数数组，避免 Windows 路径引号问题），失败不抛异常，返回 code */
export declare function git(cwd: string, args: string[], timeoutMs?: number): Promise<GitResult>;
export declare const gitOk: (r: GitResult) => boolean;
/** PRD 约定：只认 .git，有才管 */
export declare function isGitRepo(dir: string): boolean;
export declare function getCurrentBranch(cwd: string): Promise<string>;
export interface RemoteInfo {
    name: string;
    url: string;
}
/** git remote -v → 去重后的远程列表（fetch url） */
export declare function listRemotes(cwd: string): Promise<RemoteInfo[]>;
/**
 * 每个远程独立计算 ahead/behind（基于本地 remote-tracking ref，不联网）。
 * 远程 ref 不存在时返回 -1/-1（面板显示 ?）
 */
export declare function getAheadBehind(cwd: string, remote: string, branch: string): Promise<{
    ahead: number;
    behind: number;
}>;
export interface PorcelainFile {
    /** 暂存区状态码 */
    x: string;
    /** 工作区状态码 */
    y: string;
    /** 文件相对路径（rename 取新路径） */
    file: string;
}
/** git status --porcelain → 解析为文件列表 */
export declare function getPorcelain(cwd: string): Promise<PorcelainFile[]>;
/** porcelain 行解析（供单测/复用）：XY path，rename 为 "old -> new" 取 new */
export declare function parsePorcelain(stdout: string): PorcelainFile[];
/** 冲突判定：未合并状态（U 出现 / AA / DD） */
export declare function isConflicted(f: PorcelainFile): boolean;
/** 是否有 upstream；有返回 upstream 全名（remote/branch），无返回 null */
export declare function getUpstream(cwd: string): Promise<string | null>;
export declare function fetchRemote(cwd: string, remote: string): Promise<GitResult>;
export declare function pullRemote(cwd: string, remote: string, branch: string): Promise<GitResult>;
export declare function addAll(cwd: string): Promise<GitResult>;
export declare function commit(cwd: string, message: string): Promise<GitResult>;
/** push；无 upstream 时自动带 -u */
export declare function pushRemote(cwd: string, remote: string, branch: string): Promise<GitResult>;
export declare function setRemoteUrl(cwd: string, name: string, url: string): Promise<GitResult>;
export declare function addRemote(cwd: string, name: string, url: string): Promise<GitResult>;
export declare function removeRemote(cwd: string, name: string): Promise<GitResult>;
/** git diff --cached --numstat（须先 add）→ [{added, deleted, file}] */
export declare function getStagedNumstat(cwd: string): Promise<{
    added: number;
    deleted: number;
    file: string;
}[]>;
