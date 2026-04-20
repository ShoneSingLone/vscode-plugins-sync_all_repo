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
        this.rescan(msg.depth, msg.paths);
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

  private rescan(depth: number, paths: string[]) {
    const cfg = this.loadConfig();
    const newRepos: string[] = [];
    const safeDepth =
      Number.isFinite(depth) && depth >= 0 ? depth : cfg.autoScanDepth ?? 3;
    logger.info("Rescan started", { depth: safeDepth, rootCount: paths.length });

    for (const root of paths) {
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
    case "success": return "✅";
    case "error": return "❌";
    case "skipped": return "⏭️";
    case "pulling": return "⬇️";
    case "pushing": return "⬆️";
    case "committing": return "📝";
    default: return "⏳";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "success": return "#a6e3a1";
    case "error": return "#f38ba8";
    case "skipped": return "#6c7086";
    default: return "#89b4fa";
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

  const allRepos = result ? result.repos : (cfg.repoPaths || []).map((p: string) => ({
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
      (r: any) => `
    <tr class="repo-row" data-status="${r.status}" data-path="${r.path.replace(/\\/g, "\\\\")}">
      <td class="checkbox-col"><input type="checkbox" class="repo-checkbox" onchange="updateBulkUI()"></td>
      <td class="icon-col">${statusIcon(r.status)}</td>
      <td class="name-col" title="${r.path}">${r.name}</td>
      <td class="branch-col">${r.branch}</td>
      <td class="remotes-col" title="${r.remotes.join(", ")}">${r.remotes.length > 0 ? r.remotes.join(", ") : "-"}</td>
      <td class="ahead-behind-col">
        ${r.ahead > 0 ? `<span class="badge up">↑${r.ahead}</span>` : ""}
        ${r.behind > 0 ? `<span class="badge down">↓${r.behind}</span>` : ""}
        ${!r.ahead && !r.behind ? "-" : ""}
      </td>
      <td class="message-col" style="color:${statusColor(r.status)}">${r.message || "-"}</td>
      <td class="action-col">
        <div class="row-actions">
          <button title="同步" onclick="syncRepo('${r.path.replace(/\\/g, "\\\\")}', 'full')">🔄</button>
          <button title="拉取" onclick="syncRepo('${r.path.replace(/\\/g, "\\\\")}', 'pull-only')">⬇️</button>
          <button title="推送" onclick="syncRepo('${r.path.replace(/\\/g, "\\\\")}', 'push-only')">⬆️</button>
          <button title="打开" onclick="openRepo('${r.path.replace(/\\/g, "\\\\")}')">📂</button>
        </div>
      </td>
    </tr>`,
    )
    .join("");

  const successRate = result && result.total > 0 ? Math.round((result.succeeded / result.total) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Sync All Repos</title>
<style>
  :root {
    --bg: #1e1e2e; --surface: #2a2a3e; --border: #3e3e5e;
    --text: #cdd6f4; --muted: #6c7086;
    --green: #a6e3a1; --blue: #89b4fa; --mauve: #cba6f7; --red: #f38ba8; --yellow: #f9e2af;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; padding: 12px; min-height: 100vh; overflow-y: scroll; }
  
  /* Compact Header & Config */
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 16px; flex-wrap: wrap; }
  .title-area h1 { font-size: 16px; font-weight: 700; color: var(--mauve); display: flex; align-items: center; gap: 6px; margin: 0; }
  .title-area .subtitle { font-size: 10px; color: var(--muted); }

  .config-bar { 
    display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; flex: 1; min-width: 300px;
  }
  .config-item { display: flex; align-items: center; gap: 4px; border-right: 1px solid var(--border); padding-right: 8px; height: 24px; }
  .config-item:last-child { border-right: none; padding-right: 0; }
  .config-item label { font-size: 10px; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .config-item select, .config-item input { 
    background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 2px 4px; font-size: 11px; outline: none;
  }
  .config-item input[type=number] { width: 36px; }
  .config-item input[type=checkbox] { width: 14px; height: 14px; cursor: pointer; }

  /* Stats Bar */
  .stats-bar { 
    display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;
  }
  .stat-pill { 
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 11px; display: flex; gap: 6px; align-items: center;
  }
  .stat-pill .val { font-weight: 700; }
  .stat-pill.success .val { color: var(--green); }
  .stat-pill.error .val { color: var(--red); }
  .stat-pill.total .val { color: var(--blue); }

  .progress-mini { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; min-width: 100px; }
  .progress-fill { height: 100%; background: var(--mauve); transition: width .3s; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
  .bulk-actions { display: flex; gap: 6px; align-items: center; }
  .btn { 
    background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; transition: all .1s; display: flex; align-items: center; gap: 4px;
  }
  .btn:hover:not(:disabled) { background: var(--border); border-color: var(--muted); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: var(--mauve); color: #1e1e2e; border: none; font-weight: 600; }
  .btn.primary:hover { opacity: 0.9; }
  .btn.success { border-color: var(--green); color: var(--green); }
  .btn.success:hover { background: rgba(166,227,161,0.1); }

  .search-box { position: relative; flex: 1; max-width: 240px; }
  .search-box input { 
    width: 100%; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 8px 4px 24px; font-size: 11px; outline: none;
  }
  .search-box::before { content: '🔍'; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; opacity: 0.5; }

  /* Table */
  .table-container { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { 
    background: #12121e; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; border-bottom: 1px solid var(--border);
  }
  td { padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  tr.repo-row:hover { background: rgba(255,255,255,0.02); }

  .checkbox-col { width: 32px; text-align: center; }
  .icon-col { width: 28px; text-align: center; }
  .name-col { width: 15%; font-weight: 600; }
  .branch-col { width: 10%; color: var(--yellow); font-family: monospace; }
  .remotes-col { width: 20%; color: var(--muted); font-size: 10px; }
  .ahead-behind-col { width: 80px; }
  .message-col { width: auto; font-size: 11px; }
  .action-col { width: 140px; text-align: right; }

  .badge { display: inline-block; padding: 0 4px; border-radius: 3px; font-size: 9px; font-weight: 700; }
  .badge.up { background: rgba(166,227,161,0.1); color: var(--green); }
  .badge.down { background: rgba(243,139,168,0.1); color: var(--red); }

  .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
  .row-actions button { 
    background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 4px; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;
  }
  .row-actions button:hover { background: var(--border); }

  .no-data { text-align: center; padding: 40px; color: var(--muted); }

  /* Custom scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
</style>
</head>
<body>
  <header>
    <div class="title-area">
      <h1>🔄 Sync All Repos</h1>
      <div class="subtitle">${result ? `上次完成: ${new Date().toLocaleTimeString()} (耗时 ${(result.duration / 1000).toFixed(1)}s)` : '就绪'}</div>
    </div>
    
    <div class="config-bar">
      <div class="config-item">
        <label>PULL</label>
        <select id="pullStrategy" onchange="saveConfig()">
          <option value="merge" ${cfg.pullStrategy === 'merge' ? 'selected' : ''}>Merge</option>
          <option value="rebase" ${cfg.pullStrategy === 'rebase' ? 'selected' : ''}>Rebase</option>
          <option value="ff-only" ${cfg.pullStrategy === 'ff-only' ? 'selected' : ''}>FF-Only</option>
        </select>
      </div>
      <div class="config-item">
        <label>PUSH</label>
        <select id="pushStrategy" onchange="saveConfig()">
          <option value="normal" ${cfg.pushStrategy === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="force-with-lease" ${cfg.pushStrategy === 'force-with-lease' ? 'selected' : ''}>Force</option>
          <option value="skip" ${cfg.pushStrategy === 'skip' ? 'selected' : ''}>Skip</option>
        </select>
      </div>
      <div class="config-item">
        <label>并发</label>
        <input type="number" id="concurrency" min="1" max="10" value="${cfg.concurrency || 3}" onchange="saveConfig()" />
      </div>
      <div class="config-item" title="推送前自动提交">
        <label>自动提交</label>
        <input type="checkbox" id="commitBeforePush" ${cfg.commitBeforePush ? 'checked' : ''} onchange="saveConfig()" />
      </div>
      <div class="config-item" title="保存文件时同步">
        <label>保存同步</label>
        <input type="checkbox" id="autoSyncOnSave" ${cfg.autoSyncOnSave ? 'checked' : ''} onchange="saveConfig()" />
      </div>
      <div class="config-item">
        <button class="btn" onclick="openSettings()" title="详细设置">⚙️</button>
      </div>
    </div>
  </header>

  <div class="stats-bar">
    <div class="stat-pill total"><span class="label">总计</span><span class="val">${result ? result.total : allRepos.length}</span></div>
    <div class="stat-pill success"><span class="label">成功</span><span class="val">${result ? result.succeeded : 0}</span></div>
    <div class="stat-pill error"><span class="label">失败</span><span class="val">${result ? result.failed : 0}</span></div>
    <div class="progress-mini"><div class="progress-fill" style="width: ${successRate}%"></div></div>
    <button class="btn success" onclick="refreshStatus()" title="刷新状态">🔄 刷新状态</button>
    <button class="btn primary" onclick="syncAll()" title="同步所有">🚀 同步所有</button>
  </div>

  <div class="toolbar">
    <div class="bulk-actions">
      <button class="btn" id="btn-sync-sel" disabled onclick="bulkAction('full')">🔄 同步选中</button>
      <button class="btn" id="btn-pull-sel" disabled onclick="bulkAction('pull-only')">⬇️ 仅拉取</button>
      <button class="btn" id="btn-push-sel" disabled onclick="bulkAction('push-only')">⬆️ 仅推送</button>
      <span style="color:var(--muted); font-size:10px; margin-left:8px" id="selected-count">未选中</span>
    </div>
    <div class="search-box">
      <input type="text" id="search" placeholder="搜索仓库..." oninput="filterTable()" />
    </div>
    <div class="global-actions">
      <button class="btn" onclick="addFolder()">+ 添加目录</button>
      <button class="btn" onclick="rescan()">🔍 重新扫描</button>
    </div>
  </div>

  <div class="table-container">
    <table id="repoTable">
      <thead>
        <tr>
          <th class="checkbox-col"><input type="checkbox" id="check-all" onchange="toggleAll()"></th>
          <th class="icon-col"></th>
          <th class="name-col">仓库</th>
          <th class="branch-col">分支</th>
          <th class="remotes-col">远程仓库</th>
          <th class="ahead-behind-col">进度</th>
          <th class="message-col">状态/消息</th>
          <th class="action-col">操作</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${rows || '<tr><td colspan="8" class="no-data">未找到仓库，请点击“添加目录”或“重新扫描”</td></tr>'}
      </tbody>
    </table>
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
      autoCommitMessage: "${cfg.autoCommitMessage || 'chore: auto sync ${date}'}",
      excludePatterns: ${JSON.stringify(cfg.excludePatterns || ["node_modules", ".git", "vendor", "dist"])},
      showStatusBar: ${cfg.showStatusBar || true},
    };
    vscode.postMessage({ command: 'save', data });
  }

  function openRepo(p) { vscode.postMessage({ command: 'openRepo', path: p }); }
  function syncRepo(p, mode) { vscode.postMessage({ command: 'sync', paths: [p], mode }); }
  function syncAll() { vscode.postMessage({ command: 'syncAll' }); }
  function addFolder() { vscode.postMessage({ command: 'addFolder' }); }
  function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
  function rescan() { vscode.postMessage({ command: 'rescan', depth: ${cfg.autoScanDepth || 3}, paths }); }
  function refreshStatus() { vscode.postMessage({ command: 'refresh' }); }

  function toggleAll() {
    const checkAll = document.getElementById('check-all');
    document.querySelectorAll('.repo-checkbox').forEach(cb => {
      const row = cb.closest('tr');
      if (row.style.display !== 'none') {
        cb.checked = checkAll.checked;
      }
    });
    updateBulkUI();
  }

  function updateBulkUI() {
    const selected = document.querySelectorAll('.repo-checkbox:checked');
    const count = selected.length;
    const btnSync = document.getElementById('btn-sync-sel');
    const btnPull = document.getElementById('btn-pull-sel');
    const btnPush = document.getElementById('btn-push-sel');
    const countText = document.getElementById('selected-count');
    
    const hasSelected = count > 0;
    btnSync.disabled = !hasSelected;
    btnPull.disabled = !hasSelected;
    btnPush.disabled = !hasSelected;
    countText.textContent = hasSelected ? '已选中 ' + count + ' 个' : '未选中';
  }

  function bulkAction(mode) {
    const selectedPaths = [];
    document.querySelectorAll('.repo-checkbox:checked').forEach(cb => {
      const row = cb.closest('tr');
      selectedPaths.push(row.dataset.path);
    });
    if (selectedPaths.length > 0) {
      vscode.postMessage({ command: 'sync', paths: selectedPaths, mode });
    }
  }

  function filterTable() {
    const q = document.getElementById('search').value.toLowerCase();
    document.querySelectorAll('#tableBody tr.repo-row').forEach(row => {
      const name = row.querySelector('.name-col').textContent.toLowerCase();
      row.style.display = name.includes(q) ? '' : 'none';
    });
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.command) {
      case 'addPaths':
        paths = [...new Set([...paths, ...msg.paths])];
        saveConfig();
        rescan();
        break;
      case 'setPaths':
        paths = msg.paths;
        saveConfig();
        break;
    }
  });
</script>
</body>
</html>`;
}
