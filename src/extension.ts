import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  scanRepos,
  syncAllRepos,
  getRepoInfo,
  RepoInfo,
  SyncMode,
} from "./gitManager";
import { SyncStatusBar, SyncMainPanel, showProgressNotification, SyncResultPanel } from "./ui";
import { getDefaultConfig, scanReposFromPaths } from "./config";
import { logger } from "./logger";

let statusBar: SyncStatusBar;
let isSyncing = false;
let extensionContext: vscode.ExtensionContext | undefined;

// ──────────────────────────────────────────────
// Config helper
// ──────────────────────────────────────────────

function getConfigPath(): string {
  if (!extensionContext) {
    throw new Error("Extension context not initialized");
  }
  return path.join(extensionContext.globalStorageUri.fsPath, "config.json");
}

function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(content);
      logger.debug("Config loaded", { configPath });
      return parsed;
    }
  } catch (error) {
    logger.error("Failed to load config", error);
  }
  logger.debug("Config defaulted");
  return getDefaultConfig();
}

// ──────────────────────────────────────────────
// Main sync runner
// ──────────────────────────────────────────────

async function runSync(mode: SyncMode, targetPaths?: string[]) {
  if (isSyncing) {
    vscode.window.showWarningMessage("⚠️ 同步正在进行中，请稍候...");
    logger.warn("Sync rejected: already syncing", { mode });
    return;
  }
  isSyncing = true;

  const cfg = loadConfig();
  const allRepoPaths = cfg.repoPaths || [];
  const repoPaths = targetPaths || allRepoPaths;

  logger.info("Sync started", {
    mode,
    repoCount: repoPaths.length,
    isPartial: !!targetPaths,
    pullStrategy: cfg.pullStrategy || "merge",
    pushStrategy: cfg.pushStrategy || "normal",
    commitBeforePush: cfg.commitBeforePush || false,
    concurrency: cfg.concurrency || 3,
  });

  if (repoPaths.length === 0) {
    vscode.window.showWarningMessage(
      "⚠️ 没有可同步的仓库。请先在配置面板中添加仓库目录。",
    );
    logger.warn("Sync aborted: no repoPaths", { mode });
    isSyncing = false;
    return;
  }

  const modeLabel: Record<SyncMode, string> = {
    full: "同步",
    "pull-only": "拉取",
    "push-only": "推送",
  };

  statusBar.setRunning(`${modeLabel[mode]}中...`);

  let result: Awaited<ReturnType<typeof syncAllRepos>> | undefined;

  await showProgressNotification(
    `🔄 Sync All Repos — ${modeLabel[mode]}${targetPaths ? "选定" : "所有"}仓库`,
    async (progress) => {
      progress.report({ message: "准备同步..." });

      if (repoPaths.length === 0) {
        vscode.window.showWarningMessage(`⚠️ 未找到任何 Git 仓库`);
        isSyncing = false;
        statusBar.setIdle();
        showResultPanel({
          total: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          repos: [],
          duration: 0,
        });
        return;
      }

      progress.report({
        message: `开始${modeLabel[mode]} ${repoPaths.length} 个仓库...`,
      });

      let completed = 0;
      const increment = 100 / repoPaths.length;

      result = await syncAllRepos(
        repoPaths,
        mode,
        {
          pullStrategy: cfg.pullStrategy || "merge",
          pushStrategy: cfg.pushStrategy || "normal",
          commitBeforePush: cfg.commitBeforePush || false,
          autoCommitMessage: cfg.autoCommitMessage || "chore: auto sync ${date}",
          concurrency: cfg.concurrency || 3,
        },
        (info: RepoInfo) => {
          if (info.status !== "idle") {
            completed++;
            progress.report({
              increment,
              message: `[${completed}/${repoPaths.length}] ${info.name} — ${info.message || info.status}`,
            });
          }
        },
      );
    },
  );

  isSyncing = false;

  if (!result) {
    statusBar.setIdle();
    logger.warn("Sync finished without result", { mode });
    return;
  }

  // If this was a partial sync, we might want to merge it with the last full status
  // For now, just show the result of what we just did.

  if (result.failed > 0) {
    statusBar.setError(result.failed);
    vscode.window
      .showWarningMessage(
        `⚠️ ${result.failed} 个仓库同步失败，${result.succeeded} 个成功。点击查看详情。`,
        "查看详情",
      )
      .then((btn) => {
        if (btn === "查看详情") showResultPanel(result!);
      });
  } else {
    statusBar.setSuccess(result.succeeded);
    const msg = `✅ 已同步 ${result.succeeded} 个仓库（耗时 ${(result.duration / 1000).toFixed(1)}s）`;
    vscode.window.showInformationMessage(msg, "查看报告").then((btn) => {
      if (btn === "查看报告") showResultPanel(result!);
    });
  }

  // Always show the result panel
  showResultPanel(result);
}

function showResultPanel(result: Parameters<typeof SyncMainPanel.show>[1]) {
  SyncMainPanel.show(extensionContext!, result);
}

// ──────────────────────────────────────────────
// Status command: show repo status without syncing
// ──────────────────────────────────────────────

async function showStatus() {
  const cfg = loadConfig();
  const repoPaths: string[] = (cfg.repoPaths || []) as string[];

  if (repoPaths.length === 0) {
    vscode.window.showWarningMessage("⚠️ 没有配置仓库目录。");
    logger.warn("ShowStatus aborted: no repoPaths");
    return;
  }

  await showProgressNotification("🔍 扫描仓库状态...", async (progress) => {
    progress.report({ message: `检查 ${repoPaths.length} 个仓库...` });

    const startTime = Date.now();
    const repos: RepoInfo[] = [];
    const concurrency: number = Number(cfg.concurrency) || 3;
    
    // Batch processing to be faster
    for (let i = 0; i < repoPaths.length; i += concurrency) {
      const batch: string[] = repoPaths.slice(i, i + concurrency);
      const results = await Promise.all(batch.map((p: string) => getRepoInfo(p)));
      repos.push(...results);
      progress.report({ 
        increment: (batch.length / repoPaths.length) * 100,
        message: `检查中... [${Math.min(i + concurrency, repoPaths.length)}/${repoPaths.length}]`
      });
    }

    const duration = Date.now() - startTime;
    const result = {
      total: repos.length,
      succeeded: repos.filter((r) => r.status === "success").length,
      failed: repos.filter((r) => r.status === "error").length,
      skipped: repos.filter((r) => r.status === "skipped").length,
      repos,
      duration,
    };

    SyncMainPanel.show(extensionContext!, result);
  });
}

// ──────────────────────────────────────────────
// Auto sync on save
// ──────────────────────────────────────────────

let saveListener: vscode.Disposable | undefined;

function setupAutoSyncOnSave() {
  if (saveListener) {
    saveListener.dispose();
    saveListener = undefined;
  }
  const cfg = loadConfig();
  if (cfg.autoSyncOnSave) {
    logger.info("AutoSyncOnSave enabled");
    saveListener = vscode.workspace.onDidSaveTextDocument(() => {
      runSync("full");
    });
    extensionContext?.subscriptions.push(saveListener);
  } else {
    logger.info("AutoSyncOnSave disabled");
  }
}

// ──────────────────────────────────────────────
// Extension entry points
// ──────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  logger.info("Extension activated", {
    globalStorage: context.globalStorageUri.fsPath,
  });

  // Status bar
  statusBar = new SyncStatusBar();
  context.subscriptions.push(statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("shone.sing.lone.syncrepos.syncAll", () =>
      runSync("full"),
    ),
    vscode.commands.registerCommand("shone.sing.lone.syncrepos.pullAll", () =>
      runSync("pull-only"),
    ),
    vscode.commands.registerCommand(
      "shone.sing.lone.syncrepos.pushAll",
      () => runSync("push-only"),
    ),
    vscode.commands.registerCommand(
      "shone.sing.lone.syncrepos.syncSelected",
      (paths: string[], mode: SyncMode = "full") => runSync(mode, paths),
    ),
    vscode.commands.registerCommand(
      "shone.sing.lone.syncrepos.showStatus",
      () => showStatus(),
    ),
    vscode.commands.registerCommand(
      "shone.sing.lone.syncrepos.openSettings",
      () => {
        const { ConfigPanel } = require("./config");
        ConfigPanel.show(context);
        logger.info("Command executed: openSettings");
      },
    ),
  );

  // Initial auto-save setup
  setupAutoSyncOnSave();

  // Greeting
  vscode.window.setStatusBarMessage("$(sync) Sync All Repos 已就绪", 3000);
}

export function deactivate() {
  logger.info("Extension deactivated");
  statusBar?.dispose();
  saveListener?.dispose();
}
