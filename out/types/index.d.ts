export interface SubtreeInfo {
    prefix: string;
    remote: string;
    branch: string;
    lastCommit?: string;
    lastCommitMessage?: string;
}
export interface SubtreeItem {
    label: string;
    prefix: string;
    remote: string;
    branch: string;
    type: 'subtree';
}
export interface CommandResult {
    success: boolean;
    output: string;
    error?: string;
}
