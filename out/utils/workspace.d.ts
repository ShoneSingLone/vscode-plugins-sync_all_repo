import { Repo } from "../types";
export declare function isExcludedDirName(name: string): boolean;
/**
 * 仓库发现（扁平化扫描，PRD 约定层级只有 1/2 级）：
 * - workspace folder 根有 .git → 记为 1 级
 * - folder 下一层子目录有 .git → 记为 2 级（根有 .git 时子目录仍会扫，两层数据都收）
 * - 绝不深入第 3 层
 */
export declare function discoverRepos(): Promise<Repo[]>;
