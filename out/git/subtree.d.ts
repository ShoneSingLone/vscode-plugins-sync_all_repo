import { SubtreeInfo, CommandResult } from '../types';
export declare class GitSubtreeManager {
    private outputChannel;
    constructor();
    showOutput(): void;
    log(message: string): void;
    logSuccess(message: string): void;
    logError(message: string): void;
    executeGitCommand(command: string, cwd: string): Promise<CommandResult>;
    getWorkspaceRoot(): Promise<string | undefined>;
    detectSubtrees(): Promise<SubtreeInfo[]>;
    pullSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult>;
    pushSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult>;
    addSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult>;
    removeSubtree(prefix: string): Promise<CommandResult>;
    getSubtreeInfo(prefix: string): Promise<string>;
    syncAll(subtrees: SubtreeInfo[]): Promise<void>;
    pullAll(subtrees: SubtreeInfo[]): Promise<void>;
    pushAll(subtrees: SubtreeInfo[]): Promise<void>;
}
