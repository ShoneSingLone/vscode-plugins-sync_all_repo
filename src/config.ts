import * as path from "path";
import * as fs from "fs";
import { logger } from "./logger";

// ──────────────────────────────────────────────
// Config helper with default values
// ──────────────────────────────────────────────

export interface PluginConfig {
  repoPaths: string[];
  autoScanDepth: number;
  pullStrategy: string;
  pushStrategy: string;
  autoSyncOnSave: boolean;
  commitBeforePush: boolean;
  autoCommitMessage: string;
  excludePatterns: string[];
  showStatusBar: boolean;
  concurrency: number;
}

// Default configuration values
export function getDefaultConfig(): PluginConfig {
  return {
    repoPaths: [],
    autoScanDepth: 3,
    pullStrategy: "merge",
    pushStrategy: "normal",
    autoSyncOnSave: false,
    commitBeforePush: false,
    autoCommitMessage: "chore: auto sync ${date}",
    excludePatterns: ["node_modules", ".git", "vendor", "dist"],
    showStatusBar: true,
    concurrency: 3,
  };
}

// ──────────────────────────────────────────────
// Auto-scan git repos from specified paths
// ──────────────────────────────────────────────

export function scanGitRepos(
  rootPath: string,
  depth: number,
  exclude: string[],
): string[] {
  const repos: string[] = [];
  logger.debug("scanGitRepos started", { rootPath, depth, exclude });

  function scan(dir: string, currentDepth: number) {
    if (currentDepth >= depth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (exclude.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const gitPath = path.join(fullPath, ".git");

        if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) {
          repos.push(fullPath);
          scan(fullPath, currentDepth + 1);
        } else {
          scan(fullPath, currentDepth + 1);
        }
      }
    } catch {
      // ignore permission errors
    }
  }

  scan(rootPath, 0);
  logger.debug("scanGitRepos finished", { rootPath, foundCount: repos.length });
  return repos;
}

// Scan git repos from multiple root paths
export function scanReposFromPaths(
  rootPaths: string[],
  depth: number = 3,
  exclude: string[] = ["node_modules", ".git", "vendor", "dist"],
): string[] {
  const allRepos: string[] = [];

  for (const rootPath of rootPaths) {
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
      continue;
    }

    const gitPath = path.join(rootPath, ".git");
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) {
      allRepos.push(rootPath);
    } else {
      const scanned = scanGitRepos(rootPath, depth, exclude);
      allRepos.push(...scanned);
    }
  }

  return [...new Set(allRepos)];
}

// ──────────────────────────────────────────────
// Configuration Webview (deprecated - use SyncMainPanel instead)
// ──────────────────────────────────────────────

export class ConfigPanel {
  static show(context: any) {
    const { SyncMainPanel } = require("./ui");
    SyncMainPanel.show(context, undefined, "config");
  }
}
