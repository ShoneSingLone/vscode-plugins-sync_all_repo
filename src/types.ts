/** 仓库层级：1 级 = workspace folder 根；2 级 = folder 下一层子目录 */
export type RepoLevel = 1 | 2;

/** 扫描发现的仓库（最小信息） */
export interface Repo {
	path: string;
	name: string;
	level: RepoLevel;
}

/** 单个远程的状态 */
export interface RemoteStatus {
	name: string;
	url: string;
	/** 本地领先远程的提交数；-1 表示未知（远程 ref 不存在或未 fetch） */
	ahead: number;
	/** 本地落后远程的提交数；-1 表示未知 */
	behind: number;
}

/** 面板展示用仓库视图（拍平列表条目） */
export interface RepoView {
	id: string;
	name: string;
	path: string;
	branch: string;
	remotes: RemoteStatus[];
	/** 未提交改动数 */
	dirty: number;
	/** 冲突文件数 */
	conflicts: number;
}
