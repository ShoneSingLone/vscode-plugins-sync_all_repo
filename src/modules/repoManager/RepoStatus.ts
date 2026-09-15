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
	const all = await git.getCurrentBranch(repo.path);

	const remoteStatuses: RemoteStatus[] = [];
	if (all) {
		for (const remote of remotes) {
			const { ahead, behind } = await git.getAheadBehind(repo.path, remote.name, all);
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
		conflicts
	};
}
