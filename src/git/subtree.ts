import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { SubtreeInfo, CommandResult } from '../types';

export class GitSubtreeManager {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Git Subtree');
  }

  showOutput(): void {
    this.outputChannel.show(true);
  }

  log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  }

  logSuccess(message: string): void {
    this.log(`✓ ${message}`);
  }

  logError(message: string): void {
    this.log(`✗ ${message}`);
  }

  async executeGitCommand(command: string, cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      childProcess.exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            output: stdout,
            error: stderr || error.message
          });
        } else {
          resolve({
            success: true,
            output: stdout
          });
        }
      });
    });
  }

  async getWorkspaceRoot(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
  }

  async detectSubtrees(): Promise<SubtreeInfo[]> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return [];
    }

    const result = await this.executeGitCommand('git log --all --oneline --grep="git-subtree-dir:"', root);
    if (!result.success) {
      return [];
    }

    const subtrees = new Map<string, SubtreeInfo>();
    const lines = result.output.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/git-subtree-dir: ([^\s]+)/);
      if (match) {
        const prefix = match[1];
        if (!subtrees.has(prefix)) {
          const configResult = await this.executeGitCommand(
            `git config --get-regexp "subtree\.pull\.${prefix}\."`,
            root
          );
          if (configResult.success) {
            const configLines = configResult.output.trim().split('\n');
            let remote = '';
            let branch = '';
            for (const configLine of configLines) {
              if (configLine.startsWith(`subtree.pull.${prefix}.url`)) {
                remote = configLine.split(' ')[1];
              } else if (configLine.startsWith(`subtree.pull.${prefix}.ref`)) {
                branch = configLine.split(' ')[1];
              }
            }
            if (remote) {
              subtrees.set(prefix, {
                prefix,
                remote,
                branch: branch || 'main'
              });
            }
          }
        }
      }
    }

    return Array.from(subtrees.values());
  }

  async pullSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return { success: false, output: '', error: '无法获取工作区根目录' };
    }

    this.log(`正在从 ${remote} 拉取 ${prefix} 的 ${branch} 分支...`);
    const result = await this.executeGitCommand(
      `git subtree pull --prefix=${prefix} ${remote} ${branch} --squash`,
      root
    );

    if (result.success) {
      this.logSuccess(`成功拉取 ${prefix}`);
    } else {
      this.logError(`拉取 ${prefix} 失败: ${result.error}`);
    }

    return result;
  }

  async pushSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return { success: false, output: '', error: '无法获取工作区根目录' };
    }

    this.log(`正在推送 ${prefix} 到 ${remote} 的 ${branch} 分支...`);
    const result = await this.executeGitCommand(
      `git subtree push --prefix=${prefix} ${remote} ${branch}`,
      root
    );

    if (result.success) {
      this.logSuccess(`成功推送 ${prefix}`);
    } else {
      this.logError(`推送 ${prefix} 失败: ${result.error}`);
    }

    return result;
  }

  async addSubtree(prefix: string, remote: string, branch: string): Promise<CommandResult> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return { success: false, output: '', error: '无法获取工作区根目录' };
    }

    this.log(`正在添加 Subtree: ${prefix} -> ${remote}#${branch}...`);
    const result = await this.executeGitCommand(
      `git subtree add --prefix=${prefix} ${remote} ${branch} --squash`,
      root
    );

    if (result.success) {
      this.logSuccess(`成功添加 Subtree ${prefix}`);
    } else {
      this.logError(`添加 Subtree ${prefix} 失败: ${result.error}`);
    }

    return result;
  }

  async removeSubtree(prefix: string): Promise<CommandResult> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return { success: false, output: '', error: '无法获取工作区根目录' };
    }

    this.log(`正在移除 Subtree: ${prefix}...`);
    const result = await this.executeGitCommand(
      `git rm -rf ${prefix}`,
      root
    );

    if (result.success) {
      const configResult = await this.executeGitCommand(
        `git config --remove-section subtree.pull.${prefix}`,
        root
      );
      await this.executeGitCommand(
        `git config --remove-section subtree.push.${prefix}`,
        root
      );
      this.logSuccess(`成功移除 Subtree ${prefix}`);
      return { ...result, success: configResult.success || true };
    } else {
      this.logError(`移除 Subtree ${prefix} 失败: ${result.error}`);
    }

    return result;
  }

  async getSubtreeInfo(prefix: string): Promise<string> {
    const root = await this.getWorkspaceRoot();
    if (!root) {
      return '无法获取工作区根目录';
    }

    const configResult = await this.executeGitCommand(
      `git config --get-regexp "subtree\..*\.${prefix.replace(/\//g, '.')}"`,
      root
    );

    let info = `Subtree: ${prefix}\n\n`;
    
    if (configResult.success) {
      info += `配置信息:\n${configResult.output}`;
    } else {
      info += '未找到配置信息';
    }

    const logResult = await this.executeGitCommand(
      `git log --oneline -5 -- ${prefix}`,
      root
    );

    if (logResult.success && logResult.output.trim()) {
      info += `\n\n最近提交:\n${logResult.output}`;
    }

    return info;
  }

  async syncAll(subtrees: SubtreeInfo[]): Promise<void> {
    for (const subtree of subtrees) {
      await this.pullSubtree(subtree.prefix, subtree.remote, subtree.branch);
      await this.pushSubtree(subtree.prefix, subtree.remote, subtree.branch);
    }
    this.logSuccess('批量同步完成');
  }

  async pullAll(subtrees: SubtreeInfo[]): Promise<void> {
    for (const subtree of subtrees) {
      await this.pullSubtree(subtree.prefix, subtree.remote, subtree.branch);
    }
    this.logSuccess('全部拉取完成');
  }

  async pushAll(subtrees: SubtreeInfo[]): Promise<void> {
    for (const subtree of subtrees) {
      await this.pushSubtree(subtree.prefix, subtree.remote, subtree.branch);
    }
    this.logSuccess('全部推送完成');
  }
}
