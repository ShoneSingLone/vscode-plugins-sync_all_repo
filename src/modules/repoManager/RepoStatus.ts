import { RepoView, Repo, RemoteStatus } from "../../types";
import * as git from "../../utils/git";

/** 收集单个仓库的完整视图状态 */
export async function collectRepoView(repo: Repo): Promise<RepoView> {
	const [branch, remotes, porcelain] = await Promise.all([
		git.getCurrentBranch(repo.path),
		git.listRemotes(repo.path),
		git.getPorcelain(repo.path)
	]);

	const conflicts = porcelain.filter(git.isConflicted).length;
	const dirty = porcelain.length;

	// 每个远程独立计算 ahead/behind（基于当前分支）
	const remoteStatuses: RemoteStatus[] = [];
	if (branch) {
		for (const remote of remotes) {
			const { ahead, behind } = await git.getAheadBehind(repo.path, remote.name, branch);
			remoteStatuses.push({ name: remote.name, url: remote.url, ahead, behind });
		}
	}

	return {
		id: repo.path,
		name: repo.name,
		path: repo.path,
		branch,
		remotes: remoteStatuses,
		dirty,
		conflicts,
		level: repo.level
	};
}
