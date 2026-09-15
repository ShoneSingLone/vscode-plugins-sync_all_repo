import * as vscode from 'vscode';
import { SubtreeInfo, SubtreeItem } from '../types';
import { GitSubtreeManager } from '../git/subtree';
export declare class SubtreeTreeDataProvider implements vscode.TreeDataProvider<SubtreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<SubtreeItem | undefined>;
    private gitSubtreeManager;
    constructor(gitSubtreeManager: GitSubtreeManager);
    refresh(): void;
    getTreeItem(element: SubtreeItem): vscode.TreeItem;
    getChildren(element?: SubtreeItem): Promise<SubtreeItem[]>;
    getSubtreeInfo(): Promise<SubtreeInfo[]>;
}
