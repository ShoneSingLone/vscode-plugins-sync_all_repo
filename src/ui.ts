import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { RepoInfo, SyncResult } from "./gitManager";
import { logger } from "./logger";

// ──────────────────────────────────────────────
// Status Bar Item
// ──────────────────────────────────────────────

export class SyncStatusBar {
  private item: vscode.StatusBarItem;
  private animTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = "shone.sing.lone.syncrepos.openSettings";
    this.setIdle();
    this.item.show();
  }

  setIdle(label?: string) {
    this.stopAnim();
    this.item.text = `$(sync) ${label ?? "Sync Repos"}`;
    this.item.tooltip = "点击打开 Sync Repos 配置面板";
    this.item.backgroundColor = undefined;
  }

  setRunning(text: string) {
    const frames = ["$(sync~spin)", "$(loading~spin)"];
    let i = 0;
    this.stopAnim();
    this.animTimer = setInterval(() => {
      this.item.text = `${frames[i % frames.length]} ${text}`;
      i++;
    }, 400);
  }

  setSuccess(count: number) {
    this.stopAnim();
    this.item.text = `$(check) Synced ${count} repos`;
    this.item.tooltip = "同步完成，点击打开配置面板";
    this.item.backgroundColor = undefined;
    setTimeout(() => this.setIdle(), 5000);
  }

  setError(count: number) {
    this.stopAnim();
    this.item.text = `$(error) ${count} failed`;
    this.item.tooltip = "同步出现错误，点击打开配置面板";
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    setTimeout(() => this.setIdle(), 8000);
  }

  private stopAnim() {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = undefined;
    }
  }

  dispose() {
    this.stopAnim();
    this.item.dispose();
  }
}

// ──────────────────────────────────────────────
// Unified Main Panel
// ──────────────────────────────────────────────

export class SyncMainPanel {
  private static current: SyncMainPanel | undefined;
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private lastResult: SyncResult | null = null;

  static show(context: vscode.ExtensionContext, result?: SyncResult) {
    if (SyncMainPanel.current) {
      SyncMainPanel.current.panel.reveal();
      if (result) {
        SyncMainPanel.current.updateResult(result);
      }
    } else {
      SyncMainPanel.current = new SyncMainPanel(context, result);
    }
  }

  private constructor(context: vscode.ExtensionContext, result?: SyncResult) {
    this.context = context;
    if (result) {
      this.lastResult = result;
    }

    this.panel = vscode.window.createWebviewPanel(
      "syncAllRepos",
      "Sync All Repos",
      vscode.ViewColumn.One,
      { enableScripts: true },
    );
    this.panel.onDidDispose(() => {
      SyncMainPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg) => {
      this.handleMessage(msg);
    });
    this.update();
  }

  private handleMessage(msg: any) {
    logger.debug("Webview message", { command: msg?.command });
    switch (msg.command) {
      case "openRepo":
        vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(msg.path),
          { forceNewWindow: false },
        );
        break;
      case "sync":
        vscode.commands.executeCommand(
          "shone.sing.lone.syncrepos.syncSelected",
          msg.paths,
          msg.mode,
        );
        break;
      case "syncAll":
        vscode.commands.executeCommand(
          msg.mode === "pull-only"
            ? "shone.sing.lone.syncrepos.pullAll"
            : msg.mode === "push-only"
              ? "shone.sing.lone.syncrepos.pushAll"
              : "shone.sing.lone.syncrepos.syncAll",
        );
        break;
      case "save":
        this.saveConfig(msg.data);
        break;
      case "addFolder":
        this.addFolder();
        break;
      case "openSettings":
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "shone.sing.lone",
        );
        break;
      case "rescan":
        this.rescan(msg.depth);
        break;
      case "refresh":
        vscode.commands.executeCommand("shone.sing.lone.syncrepos.showStatus");
        break;
    }
  }

  private getConfigPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "config.json");
  }

  private loadConfig(): any {
    try {
      const configPath = this.getConfigPath();
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      logger.error("Failed to load config (webview)", error);
    }
    return require("./config").getDefaultConfig();
  }

  private async saveConfig(data: any) {
    try {
      const configPath = this.getConfigPath();
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
      logger.info("Config saved (webview)", { configPath });
    } catch (error) {
      logger.error("Failed to save config (webview)", error);
      vscode.window.showErrorMessage("❌ 保存配置失败！");
    }
  }

  private async addFolder() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      openLabel: "选择仓库目录",
    });
    if (uris) {
      this.panel.webview.postMessage({
        command: "addPaths",
        paths: uris.map((u) => u.fsPath),
      });
    }
  }

  private rescan(depth: number) {
    const cfg = this.loadConfig();
    const newRepos: string[] = [];
    const safeDepth =
      Number.isFinite(depth) && depth >= 0 ? depth : (cfg.autoScanDepth ?? 3);

    // Get current active project folder
    let currentProjectPaths: string[] = [];

    // If no active editor, use first workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length > 0) {
      currentProjectPaths = [workspaceFolders[0].uri.fsPath];
      logger.info(
        "Rescan started for first workspace folder (no active editor)",
        {
          depth: safeDepth,
          projectPath: workspaceFolders[0].uri.fsPath,
        },
      );
    } else {
      logger.warn("No workspace folders found for rescan");
      vscode.window.showWarningMessage(
        "⚠️ 没有打开的工作区文件夹，请先打开一个包含 Git 仓库的项目",
      );
      return;
    }

    for (const root of currentProjectPaths) {
      const gitMarker = path.join(root, ".git");
      if (fs.existsSync(gitMarker)) {
        newRepos.push(root);
      }
      if (safeDepth > 0) {
        const found = require("./config").scanGitRepos(
          root,
          safeDepth,
          cfg.excludePatterns || ["node_modules", ".git", "vendor", "dist"],
        );
        newRepos.push(...found);
      }
    }
    const uniqueRepos = [...new Set(newRepos)];
    logger.info("Rescan finished", {
      foundCount: newRepos.length,
      uniqueCount: uniqueRepos.length,
      projectPaths: currentProjectPaths,
    });

    this.panel.webview.postMessage({
      command: "setPaths",
      paths: uniqueRepos,
    });

    // After rescan, refresh the status to populate the table
    vscode.commands.executeCommand("shone.sing.lone.syncrepos.showStatus");
  }

  private updateResult(result: SyncResult) {
    this.lastResult = result;
    this.update();
  }

  private update() {
    this.panel.webview.html = buildUnifiedHtml(this.context, this.lastResult);
  }

  dispose() {
    this.panel.dispose();
  }
}

// Keep SyncResultPanel for backward compatibility
export class SyncResultPanel {
  static show(context: vscode.ExtensionContext, result: SyncResult) {
    SyncMainPanel.show(context, result);
  }
}

// ──────────────────────────────────────────────
// Progress notification helper
// ──────────────────────────────────────────────

export function showProgressNotification(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken,
  ) => Promise<void>,
): Thenable<void> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task,
  );
}

// ──────────────────────────────────────────────
// HTML generator helpers
// ──────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case "success":
      return "✅";
    case "error":
      return "❌";
    case "skipped":
      return "⏭️";
    case "pulling":
      return "⬇️";
    case "pushing":
      return "⬆️";
    case "committing":
      return "📝";
    default:
      return "⏳";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "success":
      return "#a6e3a1";
    case "error":
      return "#f38ba8";
    case "skipped":
      return "#6c7086";
    default:
      return "#89b4fa";
  }
}

// ──────────────────────────────────────────────
// Unified HTML generator
// ──────────────────────────────────────────────

function buildUnifiedHtml(
  context: vscode.ExtensionContext,
  result: SyncResult | null,
): string {
  const configPath = path.join(context.globalStorageUri.fsPath, "config.json");
  let cfg: any;

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      cfg = JSON.parse(content);
    } else {
      cfg = require("./config").getDefaultConfig();
    }
  } catch (error) {
    cfg = require("./config").getDefaultConfig();
  }

  const allRepos = result
    ? result.repos
    : (cfg.repoPaths || []).map((p: string) => ({
        path: p,
        name: path.basename(p),
        branch: "-",
        hasRemote: false,
        status: "idle",
        message: "",
        ahead: 0,
        behind: 0,
        hasUncommitted: false,
        remotes: [],
      }));

  const rows = allRepos
    .map(
      (r: any, index: number) => `
    <div class="repo-row" data-status="${r.status}" data-path="${r.path.replace(/\\/g, "\\\\")}" style="background: ${index % 2 === 0 ? 'transparent' : '#2a2a2a'}">
      <div class="row-checkbox"><input type="checkbox" class="repo-checkbox" onchange="updateBulkUI()"></div>
      <div class="row-icon">${statusIcon(r.status)}</div>
      <div class="row-name" title="${r.path}">${r.name}</div>
      <div class="row-branch">${r.branch}</div>
      <div class="row-remote">${r.remotes.length > 0 ? r.remotes[0] : "-"}</div>
      <div class="row-status">${r.message || "-"}</div>
    </div>`,
    )
    .join("");

  const stats = result
    ? {
        total: result.total,
        success: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
      }
    : { total: allRepos.length, success: 0, failed: 0, skipped: 0 };

  const logs = result
    ? result.repos
        .map((r: any) => {
          const statusColor = r.status === "success" ? "#4ec9b0" : r.status === "error" ? "#f44747" : r.status === "skipped" ? "#858585" : "#ffcc00";
          const statusPrefix = r.status === "success" ? "[SUCCESS]" : r.status === "error" ? "[ERROR]" : r.status === "skipped" ? "[SKIP]" : "[INFO]";
          return `<div class="log-item" style="color:${statusColor}">${statusPrefix} ${r.name} ${r.message || ""}</div>`;
        })
        .join("")
    : '<div class="log-item" style="color:#858585">[INFO] 就绪</div>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Sync All Repos</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    background: #1e1e1e; 
    color: #cccccc; 
    font-family: Inter, 'Segoe UI', system-ui, sans-serif; 
    font-size: 12px; 
    min-height: 600px; 
    display: flex;
    flex-direction: column;
  }

  /* Top Section */
  .top-section {
    background: #252526;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #3c3c3c;
  }

  /* Toolbar */
  .toolbar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #3c3c3c;
    gap: 8px;
  }
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .toolbar-title {
    color: #cccccc;
    font-size: 13px;
    font-weight: 600;
  }
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Buttons */
  .btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    transition: background-color 0.2s;
  }
  .btn-primary {
    background: #0e639c;
    color: #ffffff;
  }
  .btn-primary:hover {
    background: #1177bb;
  }
  .btn-secondary {
    background: transparent;
    color: #007acc;
    border: 1px solid #007acc;
  }
  .btn-secondary:hover {
    background: rgba(0,122,204,0.1);
  }
  .btn-tertiary {
    background: transparent;
    color: #cccccc;
    border: 1px solid #3c3c3c;
  }
  .btn-tertiary:hover {
    background: #3c3c3c;
  }

  /* Config Bar */
  .config-bar {
    height: 44px;
    background: #2d2d2d;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 16px;
    border-bottom: 1px solid #3c3c3c;
  }
  .config-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .config-label {
    color: #858585;
    font-size: 11px;
  }
  .config-select, .config-input {
    background: #3c3c3c;
    border: none;
    border-radius: 3px;
    color: #cccccc;
    font-size: 11px;
    padding: 4px 8px;
  }
  .config-select {
    width: 90px;
    height: 26px;
  }
  .config-input {
    width: 50px;
    height: 26px;
  }
  .config-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  /* Bottom Section */
  .bottom-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Stats Bar */
  .stats-bar {
    height: 40px;
    background: #2d2d2d;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 10px;
  }
  .status-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ec9b0;
  }
  .status-text {
    color: #4ec9b0;
    font-size: 12px;
    font-weight: 600;
  }
  .divider {
    width: 1px;
    height: 20px;
    background: #474747;
  }
  .stats-info {
    color: #858585;
    font-size: 12px;
  }
  .stats-spacer {
    flex: 1;
  }
  .last-sync {
    color: #636363;
    font-size: 11px;
  }

  /* Separator */
  .separator {
    height: 1px;
    background: #3c3c3c;
  }

  /* Repository Table */
  .repo-table {
    flex: 1;
    padding: 4px 0;
    overflow-y: auto;
    min-height: 0;
  }
  .repo-row {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 12px;
    transition: background-color 0.1s;
  }
  .repo-row:hover {
    background: #2d2d2d;
  }
  .row-checkbox {
    width: 16px;
  }
  .row-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
  }
  .row-name {
    flex: 2;
    font-size: 12px;
    color: #cccccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-branch {
    width: 100px;
    font-size: 12px;
    color: #cccccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-remote {
    width: 100px;
    font-size: 12px;
    color: #cccccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-status {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    text-align: right;
  }

  /* Log Area */
  .log-area {
    height: 200px;
    border-top: 1px solid #3c3c3c;
    padding: 8px 12px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .log-item {
    line-height: 1.4;
  }

  /* Custom scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #3c3c3c;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #474747;
  }
</style>
</head>
<body>
  <div class="top-section">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">$(sync) Sync All Repos</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary" onclick="syncAll('full')">$(sync) 同步所有</button>
        <button class="btn btn-secondary" onclick="syncAll('pull-only')">$(cloud-download) 仅拉取</button>
        <button class="btn btn-secondary" onclick="syncAll('push-only')">$(cloud-upload) 仅推送</button>
        <button class="btn btn-tertiary" onclick="addFolder()">$(add) 添加仓库</button>
        <button class="btn btn-tertiary" onclick="rescan()">$(refresh) 重新扫描</button>
      </div>
    </div>
    <div class="config-bar">
      <div class="config-group">
        <span class="config-label">Pull策略:</span>
        <select class="config-select" id="pullStrategy" onchange="saveConfig()">
          <option value="merge" ${cfg.pullStrategy === "merge" ? "selected" : ""}>merge</option>
          <option value="rebase" ${cfg.pullStrategy === "rebase" ? "selected" : ""}>rebase</option>
          <option value="ff-only" ${cfg.pullStrategy === "ff-only" ? "selected" : ""}>ff-only</option>
        </select>
      </div>
      <div class="config-group">
        <span class="config-label">Push策略:</span>
        <select class="config-select" id="pushStrategy" onchange="saveConfig()">
          <option value="normal" ${cfg.pushStrategy === "normal" ? "selected" : ""}>normal</option>
          <option value="force-with-lease" ${cfg.pushStrategy === "force-with-lease" ? "selected" : ""}>force</option>
          <option value="skip" ${cfg.pushStrategy === "skip" ? "selected" : ""}>skip</option>
        </select>
      </div>
      <div class="config-group">
        <span class="config-label">并发数:</span>
        <input type="number" class="config-input" id="concurrency" min="1" max="10" value="${cfg.concurrency || 3}" onchange="saveConfig()" />
      </div>
      <div class="config-group">
        <input type="checkbox" class="config-checkbox" id="commitBeforePush" ${cfg.commitBeforePush ? "checked" : ""} onchange="saveConfig()" />
        <span class="config-label">推送前自动提交</span>
      </div>
      <div class="config-group">
        <input type="checkbox" class="config-checkbox" id="autoSyncOnSave" ${cfg.autoSyncOnSave ? "checked" : ""} onchange="saveConfig()" />
        <span class="config-label">保存时自动同步</span>
      </div>
    </div>
  </div>

  <div class="bottom-section">
    <div class="stats-bar">
      <div class="status-group">
        <div class="status-dot"></div>
        <span class="status-text">就绪</span>
      </div>
      <div class="divider"></div>
      <span class="stats-info">总计: ${stats.total} | 成功: ${stats.success} | 失败: ${stats.failed} | 跳过: ${stats.skipped}</span>
      <div class="stats-spacer"></div>
      <span class="last-sync">上次同步: ${result ? new Date().toLocaleTimeString() : '未同步'}</span>
    </div>
    <div class="separator"></div>
    <div class="repo-table">
      ${rows || '<div style="padding: 40px; text-align: center; color: #858585;">未找到仓库，请点击"添加仓库"或"重新扫描"</div>'}
    </div>
    <div class="log-area">
      ${logs}
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  let paths = ${JSON.stringify(cfg.repoPaths || [])};

  function saveConfig() {
    const data = {
      repoPaths: paths,
      pullStrategy: document.getElementById('pullStrategy').value,
      pushStrategy: document.getElementById('pushStrategy').value,
      commitBeforePush: document.getElementById('commitBeforePush').checked,
      autoSyncOnSave: document.getElementById('autoSyncOnSave').checked,
      concurrency: parseInt(document.getElementById('concurrency').value, 10),
      autoScanDepth: ${cfg.autoScanDepth || 3},
      autoCommitMessage: "${cfg.autoCommitMessage || "chore: auto sync ${date}"}",
      excludePatterns: ${JSON.stringify(cfg.excludePatterns || ["node_modules", ".git", "vendor", "dist"])},
      showStatusBar: ${cfg.showStatusBar || true},
    };
    vscode.postMessage({ command: 'save', data });
  }

  function syncAll(mode) {
    vscode.postMessage({ command: 'syncAll', mode });
  }

  function addFolder() {
    vscode.postMessage({ command: 'addFolder' });
  }

  function rescan() {
    vscode.postMessage({ command: 'rescan', depth: ${cfg.autoScanDepth || 3} });
  }

  function updateBulkUI() {}
</script>
</body>
</html>`;
}
