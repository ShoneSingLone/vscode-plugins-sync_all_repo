import { RepoView, Repo } from "../../types";
/** 收集单个仓库的完整视图状态 */
export declare function collectRepoView(repo: Repo): Promise<RepoView>;
