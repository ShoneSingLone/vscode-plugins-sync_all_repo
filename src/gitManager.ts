import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from "./logger";

const execAsync = promisify(exec);

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'committing' | 'success' | 'error' | 'skipped';

export interface RepoInfo {
  path: string;
  name: string;
  branch: string;
  hasRemote: boolean;
  status: SyncStatus;
  message: string;
  ahead: number;
  behind: number;
  hasUncommitted: boolean;
  remotes: string[];
}

export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  repos: RepoInfo[];
  duration: number;
}

export type SyncMode = 'full' | 'pull-only' | 'push-only';

// ──────────────────────────────────────────────
// Helper: run git command in a directory
// ──────────────────────────────────────────────

async function git(cwd: string, ...args: string[]): Promise<string> {
  const cmd = `git ${args.join(' ')}`;
  const start = Date.now();
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 30_000 });
    logger.debug("git ok", { cwd, cmd, durationMs: Date.now() - start });
    return stdout.trim();
  } catch (e: any) {
    const msg = e?.stderr?.trim() || e?.message || String(e);
    logger.error("git failed", e, { cwd, cmd, durationMs: Date.now() - start, message: msg });
    throw new Error(msg);
  }
}

async function gitSafe(cwd: string, ...args: string[]): Promise<string | null> {
  try {
    return await git(cwd, ...args);
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Check whether a directory is a git repo
// ──────────────────────────────────────────────

async function isGitRepo(dir: string): Promise<boolean> {
  return new Promise(resolve => {
    const gitDir = path.join(dir, '.git');
    fs.access(gitDir, fs.constants.F_OK, err => resolve(!err));
  });
}

// ──────────────────────────────────────────────
// Scan directories for git repos
// ──────────────────────────────────────────────

export async function scanRepos(
  roots: string[],
  maxDepth: number,
  excludePatterns: string[]
): Promise<string[]> {
  const found: Set<string> = new Set();
  logger.info("scanRepos started", { rootsCount: roots.length, maxDepth, excludePatterns });

  async function scan(dir: string, depth: number) {
    if (depth < 0) return;
    if (await isGitRepo(dir)) {
      found.add(dir);
      return; // don't recurse into a git repo
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (excludePatterns.includes(entry.name)) continue;
      await scan(path.join(dir, entry.name), depth - 1);
    }
  }

  for (const root of roots) {
    // root itself might be a git repo
    await scan(root, maxDepth);
  }

  const result = Array.from(found).sort();
  logger.info("scanRepos finished", { foundCount: result.length });
  return result;
}

// ──────────────────────────────────────────────
// Gather repo metadata
// ──────────────────────────────────────────────

export async function getRepoInfo(repoPath: string): Promise<RepoInfo> {
  const name = path.basename(repoPath);
  logger.debug("getRepoInfo started", { repoPath, name });

  const info: RepoInfo = {
    path: repoPath,
    name,
    branch: 'unknown',
    hasRemote: false,
    status: 'idle',
    message: '',
    ahead: 0,
    behind: 0,
    hasUncommitted: false,
    remotes: [],
  };

  // Current branch
  const branch = await gitSafe(repoPath, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (branch) info.branch = branch;

  // Remotes
  const remotesRaw = await gitSafe(repoPath, 'remote');
  if (remotesRaw) {
    info.remotes = remotesRaw.split('\n').filter(Boolean);
    info.hasRemote = info.remotes.length > 0;
  }

  if (!info.hasRemote) {
    logger.debug("getRepoInfo finished (no remote)", { repoPath, branch: info.branch });
    return info;
  }

  // Fetch quietly (update remote tracking refs, no output)
  await gitSafe(repoPath, 'fetch', '--all', '--quiet');

  // Ahead / behind
  const remote = info.remotes[0]; // use first remote (usually origin)
  const revListRaw = await gitSafe(
    repoPath,
    'rev-list',
    '--count',
    '--left-right',
    `${remote}/${info.branch}...HEAD`
  );
  if (revListRaw) {
    const parts = revListRaw.split('\t');
    info.behind = parseInt(parts[0] || '0', 10);
    info.ahead = parseInt(parts[1] || '0', 10);
  }

  // Uncommitted changes
  const statusRaw = await gitSafe(repoPath, 'status', '--porcelain');
  info.hasUncommitted = (statusRaw?.length ?? 0) > 0;

  logger.debug("getRepoInfo finished", {
    repoPath,
    branch: info.branch,
    remote: info.remotes[0],
    ahead: info.ahead,
    behind: info.behind,
    hasUncommitted: info.hasUncommitted,
  });
  return info;
}

// ──────────────────────────────────────────────
// Sync a single repo
// ──────────────────────────────────────────────

export async function syncRepo(
  info: RepoInfo,
  mode: SyncMode,
  pullStrategy: string,
  pushStrategy: string,
  commitBeforePush: boolean,
  autoCommitMessage: string,
  onProgress: (info: RepoInfo) => void
): Promise<RepoInfo> {
  const start = Date.now();
  if (!info.hasRemote) {
    info.status = 'skipped';
    info.message = '无远程仓库，已跳过';
    onProgress(info);
    logger.info("syncRepo skipped (no remote)", { repo: info.name, repoPath: info.path, mode });
    return info;
  }

  const remote = info.remotes[0];
  logger.info("syncRepo started", { repo: info.name, repoPath: info.path, mode, remote, branch: info.branch });

  try {
    // ── 1. Auto-commit if requested ──
    if (commitBeforePush && info.hasUncommitted && mode !== 'pull-only') {
      info.status = 'committing';
      onProgress(info);

      const msg = autoCommitMessage
        .replace('${date}', new Date().toLocaleDateString('zh-CN'))
        .replace('${time}', new Date().toLocaleTimeString('zh-CN'));

      await git(info.path, 'add', '-A');
      await git(info.path, 'commit', '-m', `"${msg}"`);
      info.hasUncommitted = false;
      info.ahead += 1;
      logger.info("auto-commit done", { repo: info.name, branch: info.branch });
    }

    // ── 2. Pull ──
    if (mode === 'full' || mode === 'pull-only') {
      if (info.behind > 0 || mode === 'pull-only') {
        info.status = 'pulling';
        onProgress(info);

        const pullFlag =
          pullStrategy === 'rebase'
            ? '--rebase'
            : pullStrategy === 'ff-only'
            ? '--ff-only'
            : '--no-rebase';

        await git(info.path, 'pull', pullFlag, remote, info.branch);
        logger.info("pull done", { repo: info.name, branch: info.branch, strategy: pullStrategy });

        // refresh ahead/behind after pull
        const revListRaw = await gitSafe(
          info.path,
          'rev-list', '--count', '--left-right',
          `${remote}/${info.branch}...HEAD`
        );
        if (revListRaw) {
          const parts = revListRaw.split('\t');
          info.behind = parseInt(parts[0] || '0', 10);
          info.ahead = parseInt(parts[1] || '0', 10);
        }
      }
    }

    // ── 3. Push ──
    if (mode === 'full' || mode === 'push-only') {
      if (pushStrategy !== 'skip' && info.ahead > 0) {
        info.status = 'pushing';
        onProgress(info);

        const pushArgs: string[] = ['push', remote, info.branch];
        if (pushStrategy === 'force-with-lease') {
          pushArgs.push('--force-with-lease');
        }
        await git(info.path, ...pushArgs);
        info.ahead = 0;
        logger.info("push done", { repo: info.name, branch: info.branch, strategy: pushStrategy });
      }
    }

    info.status = 'success';
    info.message = `✓ 同步完成 (↑${info.ahead} ↓${info.behind})`;
  } catch (e: any) {
    info.status = 'error';
    info.message = e.message || String(e);
    logger.error("syncRepo failed", e, { repo: info.name, repoPath: info.path, mode, remote, branch: info.branch });
  }

  onProgress(info);
  logger.info("syncRepo finished", {
    repo: info.name,
    status: info.status,
    durationMs: Date.now() - start,
    ahead: info.ahead,
    behind: info.behind,
    hasUncommitted: info.hasUncommitted,
  });
  return info;
}

// ──────────────────────────────────────────────
// Sync multiple repos with concurrency control
// ──────────────────────────────────────────────

export async function syncAllRepos(
  repoPaths: string[],
  mode: SyncMode,
  config: {
    pullStrategy: string;
    pushStrategy: string;
    commitBeforePush: boolean;
    autoCommitMessage: string;
    concurrency: number;
  },
  onProgress: (info: RepoInfo) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  const results: RepoInfo[] = [];
  logger.info("syncAllRepos started", {
    mode,
    repoCount: repoPaths.length,
    pullStrategy: config.pullStrategy,
    pushStrategy: config.pushStrategy,
    commitBeforePush: config.commitBeforePush,
    concurrency: config.concurrency,
  });

  // Gather info for all repos first
  const infoList: RepoInfo[] = [];
  for (const p of repoPaths) {
    const info = await getRepoInfo(p);
    infoList.push(info);
    onProgress(info);
  }

  // Process with limited concurrency
  const queue = [...infoList];
  const workers: Promise<void>[] = [];

  async function worker() {
    while (queue.length > 0) {
      const info = queue.shift()!;
      const result = await syncRepo(
        info,
        mode,
        config.pullStrategy,
        config.pushStrategy,
        config.commitBeforePush,
        config.autoCommitMessage,
        onProgress
      );
      results.push(result);
    }
  }

  for (let i = 0; i < Math.min(config.concurrency, infoList.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  return {
    total: results.length,
    succeeded,
    failed,
    skipped,
    repos: results,
    duration: Date.now() - startTime,
  };
}
