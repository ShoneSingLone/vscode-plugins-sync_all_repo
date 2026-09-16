/**
 * commit message 生成器（规则模板，离线可用）：
 * - type: 从变更文件路径推断 feat / fix / refactor / docs / style / test / chore
 * - scope: 1 级仓库从路径推断 / 2 级仓库用业务名
 * - description: 变更摘要中文
 */
export interface StagedFile {
    added: number;
    deleted: number;
    file: string;
}
/**
 * 生成规范 commit message（Conventional Commits + 中文描述）
 * @param files  git diff --cached --numstat 解析结果
 * @param repoName 仓库名
 * @param level 仓库层级
 * @returns `{ type, scope, message }` message 为完整提交信息字符串
 */
export declare function generateCommitMessage(files: StagedFile[], repoName: string, level: 1 | 2): {
    type: string;
    scope: string;
    message: string;
};
