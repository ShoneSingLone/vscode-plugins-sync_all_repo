import * as vscode from 'vscode';
import { SubtreeInfo, SubtreeItem } from '../types';
import { GitSubtreeManager } from '../git/subtree';

export class SubtreeTreeDataProvider implements vscode.TreeDataProvider<SubtreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SubtreeItem | undefined> = new vscode.EventEmitter<SubtreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SubtreeItem | undefined> = this._onDidChangeTreeData.event;

  private gitSubtreeManager: GitSubtreeManager;

  constructor(gitSubtreeManager: GitSubtreeManager) {
    this.gitSubtreeManager = gitSubtreeManager;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SubtreeItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(`$(git-branch) ${element.label}`, vscode.TreeItemCollapsibleState.None);
    treeItem.contextValue = 'subtree';
    treeItem.description = `${element.remote}#${element.branch}`;
    treeItem.tooltip = `${element.prefix}\n远程: ${element.remote}\n分支: ${element.branch}`;
    return treeItem;
  }

  async getChildren(element?: SubtreeItem): Promise<SubtreeItem[]> {
    if (element) {
      return [];
    }

    const subtrees = await this.gitSubtreeManager.detectSubtrees();
    return subtrees.map(subtree => ({
      label: subtree.prefix,
      prefix: subtree.prefix,
      remote: subtree.remote,
      branch: subtree.branch,
      type: 'subtree' as const
    }));
  }

  async getSubtreeInfo(): Promise<SubtreeInfo[]> {
    return this.gitSubtreeManager.detectSubtrees();
  }
}
