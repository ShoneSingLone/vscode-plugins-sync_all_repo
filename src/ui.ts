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
  private animFrame = 0;
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
// Unified Main Panel with Tabs
// ──────────────────────────────────────────────

export class SyncMainPanel {
  private static current: SyncMainPanel | undefined;
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private lastResult: SyncResult | null = null;

  static show(
    context: vscode.ExtensionContext,
    result?: SyncResult,
    defaultTab?: "config" | "result",
  ) {
    if (SyncMainPanel.current) {
      SyncMainPanel.current.panel.reveal();
      if (result) {
        SyncMainPanel.current.updateResult(result);
      }
      if (defaultTab) {
        SyncMainPanel.current.switchTab(defaultTab);
      }
    } else {
      SyncMainPanel.current = new SyncMainPanel(context, result, defaultTab);
    }
  }

  private constructor(
    context: vscode.ExtensionContext,
    result?: SyncResult,
    defaultTab: "config" | "result" = "config",
  ) {
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
    this.update(defaultTab);
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
      case "runSync":
        this.runSync(msg.data);
        break;
      case "rescan":
        this.rescan(msg.depth, msg.paths);
        break;
      case "switchTab":
        this.switchTab(msg.tab);
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
      vscode.window.showInformationMessage("✅ 配置已保存！");
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

  private async runSync(data: any) {
    // 先保存配置
    await this.saveConfig(data);
    // 然后执行同步
    vscode.commands.executeCommand("shone.sing.lone.syncrepos.syncAll");
  }

  private rescan(depth: number, paths: string[]) {
    const cfg = this.loadConfig();
    const newRepos: string[] = [];
    logger.info("Rescan started", { depth, rootCount: paths.length });

    for (const root of paths) {
      if (fs.existsSync(path.join(root, ".git"))) {
        newRepos.push(root);
      } else {
        const found = require("./config").scanGitRepos(
          root,
          depth,
          cfg.excludePatterns || ["node_modules", ".git", "vendor", "dist"],
        );
        newRepos.push(...found);
      }
    }
    logger.info("Rescan finished", { foundCount: newRepos.length });

    this.panel.webview.postMessage({
      command: "setPaths",
      paths: [...new Set(newRepos)],
    });
  }

  private switchTab(tab: "config" | "result") {
    this.panel.webview.postMessage({ command: "switchTab", tab });
  }

  private updateResult(result: SyncResult) {
    this.lastResult = result;
    this.update("result");
  }

  private update(defaultTab: "config" | "result") {
    this.panel.webview.html = buildUnifiedHtml(
      this.context,
      this.lastResult,
      defaultTab,
    );
  }

  dispose() {
    this.panel.dispose();
  }
}

// Keep SyncResultPanel for backward compatibility
export class SyncResultPanel {
  static show(context: vscode.ExtensionContext, result: SyncResult) {
    SyncMainPanel.show(context, result, "result");
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
// HTML generator for the webview
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
      return "#4caf50";
    case "error":
      return "#f44336";
    case "skipped":
      return "#9e9e9e";
    default:
      return "#2196f3";
  }
}

function buildHtml(result: SyncResult): string {
  const rows = result.repos
    .map(
      (r) => `
    <tr class="repo-row" data-status="${r.status}">
      <td class="icon">${statusIcon(r.status)}</td>
      <td class="name" title="${r.path}">${r.name}</td>
      <td class="branch">${r.branch}</td>
      <td class="ahead-behind">
        ${r.ahead > 0 ? `<span class="badge up">↑${r.ahead}</span>` : ""}
        ${r.behind > 0 ? `<span class="badge down">↓${r.behind}</span>` : ""}
      </td>
      <td class="message" style="color:${statusColor(r.status)}">${r.message || ""}</td>
      <td class="action">
        <button onclick="openRepo('${r.path.replace(/\\/g, "\\\\")}')">打开</button>
      </td>
    </tr>`,
    )
    .join("");

  const successRate =
    result.total > 0 ? Math.round((result.succeeded / result.total) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Sync All Repos</title>
<style>
  :root {
    --bg: #1e1e2e;
    --surface: #2a2a3e;
    --border: #3e3e5e;
    --text: #cdd6f4;
    --muted: #6c7086;
    --green: #a6e3a1;
    --red: #f38ba8;
    --yellow: #f9e2af;
    --blue: #89b4fa;
    --mauve: #cba6f7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    padding: 24px;
    min-height: 100vh;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--mauve);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .subtitle { color: var(--muted); margin-bottom: 20px; font-size: 12px; }
  .stats {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 20px;
    text-align: center;
    min-width: 90px;
  }
  .stat .num { font-size: 26px; font-weight: 700; line-height: 1; }
  .stat .label { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .stat.success .num { color: var(--green); }
  .stat.error   .num { color: var(--red); }
  .stat.skipped .num { color: var(--muted); }
  .stat.total   .num { color: var(--blue); }
  .stat.time    .num { font-size: 18px; color: var(--yellow); }
  .progress-bar {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--mauve), var(--blue));
    border-radius: 3px;
    transition: width .5s ease;
    width: ${successRate}%;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    align-items: center;
  }
  .toolbar input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    outline: none;
    flex: 1;
    min-width: 180px;
  }
  .toolbar input:focus { border-color: var(--mauve); }
  .filter-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 11px;
    cursor: pointer;
    transition: all .15s;
  }
  .filter-btn:hover, .filter-btn.active { background: var(--mauve); color: #1e1e2e; border-color: var(--mauve); }
  .sync-again {
    background: var(--blue);
    color: #1e1e2e;
    border: none;
    border-radius: 8px;
    padding: 7px 18px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity .15s;
  }
  .sync-again:hover { opacity: .85; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  thead { background: #12121e; }
  th {
    padding: 10px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  td { padding: 9px 14px; border-top: 1px solid var(--border); vertical-align: middle; }
  .repo-row:hover { background: rgba(255,255,255,.03); }
  .icon { width: 28px; text-align: center; font-size: 14px; }
  .name { font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
  .branch { color: var(--yellow); font-family: monospace; font-size: 11px; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    margin-right: 2px;
  }
  .badge.up { background: rgba(166,227,161,.15); color: var(--green); }
  .badge.down { background: rgba(243,139,168,.15); color: var(--red); }
  .message { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  td.action button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--blue);
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    transition: all .15s;
  }
  td.action button:hover { background: var(--blue); color: #1e1e2e; }
  .no-data { text-align: center; color: var(--muted); padding: 40px; }
</style>
</head>
<body>
<h1>🔄 Sync All Repos</h1>
<div class="subtitle">同步完成 · 耗时 ${(result.duration / 1000).toFixed(1)}s · ${new Date().toLocaleString("zh-CN")}</div>

<div class="stats">
  <div class="stat total"><div class="num">${result.total}</div><div class="label">总计</div></div>
  <div class="stat success"><div class="num">${result.succeeded}</div><div class="label">成功</div></div>
  <div class="stat error"><div class="num">${result.failed}</div><div class="label">失败</div></div>
  <div class="stat skipped"><div class="num">${result.skipped}</div><div class="label">跳过</div></div>
  <div class="stat time"><div class="num">${successRate}%</div><div class="label">成功率</div></div>
</div>

<div class="progress-bar"><div class="progress-fill"></div></div>

<div class="toolbar">
  <input type="text" id="search" placeholder="🔍 搜索仓库名..." oninput="filterTable()" />
  <button class="filter-btn active" onclick="setFilter('all',this)">全部</button>
  <button class="filter-btn" onclick="setFilter('success',this)">成功</button>
  <button class="filter-btn" onclick="setFilter('error',this)">失败</button>
  <button class="filter-btn" onclick="setFilter('skipped',this)">跳过</button>
  <button class="sync-again" onclick="syncAgain()">🔄 再次同步</button>
</div>

<table id="repoTable">
  <thead>
    <tr>
      <th></th>
      <th>仓库</th>
      <th>分支</th>
      <th>进度</th>
      <th>消息</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody id="tableBody">
    ${rows || '<tr><td colspan="6" class="no-data">没有仓库数据</td></tr>'}
  </tbody>
</table>

<script>
  const vscode = acquireVsCodeApi();
  let currentFilter = 'all';

  function openRepo(p) {
    vscode.postMessage({ command: 'openRepo', path: p });
  }
  function syncAgain() {
    vscode.postMessage({ command: 'syncAll' });
  }
  function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterTable();
  }
  function filterTable() {
    const q = document.getElementById('search').value.toLowerCase();
    document.querySelectorAll('#tableBody tr.repo-row').forEach(row => {
      const name = row.querySelector('.name')?.textContent?.toLowerCase() ?? '';
      const status = row.dataset.status ?? '';
      const matchFilter = currentFilter === 'all' || status === currentFilter;
      const matchSearch = name.includes(q);
      row.style.display = matchFilter && matchSearch ? '' : 'none';
    });
  }
</script>
</body>
</html>`;
}

// ──────────────────────────────────────────────
// Unified HTML generator for tabbed interface
// ──────────────────────────────────────────────

function buildUnifiedHtml(
  context: vscode.ExtensionContext,
  result: SyncResult | null,
  defaultTab: "config" | "result" = "config",
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

  const allRepos = cfg.repoPaths || [];
  const pathItems = allRepos
    .map(
      (p: string, i: number) =>
        '<div class="path-item" id="path-' +
        i +
        '">' +
        '<span class="path-text" title="' +
        p.replace(/"/g, "&quot;") +
        '">' +
        p.replace(/"/g, "&quot;") +
        "</span>" +
        '<button class="remove-btn" onclick="removePath(' +
        i +
        ')">✕</button>' +
        "</div>",
    )
    .join("");

  const excludeVal = (
    cfg.excludePatterns || ["node_modules", ".git", "vendor", "dist"]
  ).join(", ");

  let resultHtml = "";
  if (result) {
    const rows = result.repos
      .map(
        (r) => `
      <tr class="repo-row" data-status="${r.status}">
        <td class="icon">${statusIcon(r.status)}</td>
        <td class="name" title="${r.path}">${r.name}</td>
        <td class="branch">${r.branch}</td>
        <td class="ahead-behind">
          ${r.ahead > 0 ? `<span class="badge up">↑${r.ahead}</span>` : ""}
          ${r.behind > 0 ? `<span class="badge down">↓${r.behind}</span>` : ""}
        </td>
        <td class="message" style="color:${statusColor(r.status)}">${r.message || ""}</td>
        <td class="action">
          <button onclick="openRepo('${r.path.replace(/\\/g, "\\\\")}')">打开</button>
        </td>
      </tr>`,
      )
      .join("");

    const successRate =
      result.total > 0
        ? Math.round((result.succeeded / result.total) * 100)
        : 0;

    resultHtml = `
    <div class="result-content">
      <h1>🔄 Sync All Repos</h1>
      <div class="subtitle">同步完成 · 耗时 ${(result.duration / 1000).toFixed(1)}s · ${new Date().toLocaleString("zh-CN")}</div>

      <div class="stats">
        <div class="stat total"><div class="num">${result.total}</div><div class="label">总计</div></div>
        <div class="stat success"><div class="num">${result.succeeded}</div><div class="label">成功</div></div>
        <div class="stat error"><div class="num">${result.failed}</div><div class="label">失败</div></div>
        <div class="stat skipped"><div class="num">${result.skipped}</div><div class="label">跳过</div></div>
        <div class="stat time"><div class="num">${successRate}%</div><div class="label">成功率</div></div>
      </div>

      <div class="progress-bar"><div class="progress-fill" style="width: ${successRate}%"></div></div>

      <div class="toolbar">
        <input type="text" id="search" placeholder="🔍 搜索仓库名..." oninput="filterTable()" />
        <button class="filter-btn active" onclick="setFilter('all',this)">全部</button>
        <button class="filter-btn" onclick="setFilter('success',this)">成功</button>
        <button class="filter-btn" onclick="setFilter('error',this)">失败</button>
        <button class="filter-btn" onclick="setFilter('skipped',this)">跳过</button>
        <button class="sync-again" onclick="syncAgain()">🔄 再次同步</button>
      </div>

      <table id="repoTable">
        <thead>
          <tr>
            <th></th>
            <th>仓库</th>
            <th>分支</th>
            <th>进度</th>
            <th>消息</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          ${rows || '<tr><td colspan="6" class="no-data">没有仓库数据</td></tr>'}
        </tbody>
      </table>
    </div>`;
  }

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
    --green: #a6e3a1; --blue: #89b4fa; --mauve: #cba6f7; --red: #f38ba8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; padding: 16px; min-height: 100vh; }
  
  /* Tabs */
  .tabs {
    display: flex; gap: 2px; background: var(--border); border-radius: 8px; padding: 2px; margin-bottom: 16px; overflow: hidden;
  }
  .tab {
    flex: 1; padding: 10px 16px; text-align: center; border: none; background: transparent; color: var(--muted); cursor: pointer; border-radius: 6px; font-size: 12px; font-weight: 600; transition: all .2s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { background: var(--surface); color: var(--mauve); }
  
  /* Common styles */
  h1 { font-size: 18px; font-weight: 600; color: var(--mauve); margin-bottom: 4px; }
  .subtitle { color: var(--muted); margin-bottom: 16px; font-size: 12px; }
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
  .section-title { font-size: 12px; font-weight: 700; color: var(--blue); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  
  /* Config page */
  .field { margin-bottom: 8px; }
  .field:last-child { margin-bottom: 0; }
  .field label { display: block; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 6px 10px; font-size: 12px; outline: none; transition: border-color .15s;
  }
  input[type=text]:focus, input[type=number]:focus, select:focus, textarea:focus { border-color: var(--mauve); }
  textarea { resize: vertical; min-height: 60px; font-family: monospace; }
  .path-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; max-height: 120px; overflow-y: auto; }
  .path-item { display: flex; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; gap: 6px; }
  .path-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-family: monospace; }
  .remove-btn { background: none; border: none; color: var(--red); cursor: pointer; font-size: 12px; padding: 0 4px; }
  .add-btn { background: var(--surface); border: 1px dashed var(--border); color: var(--blue); border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer; width: 100%; transition: all .15s; }
  .add-btn:hover { border-color: var(--blue); background: rgba(137,180,250,.08); }
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
  .toggle-row label { font-size: 12px; color: var(--text); }
  .toggle { position: relative; display: inline-block; width: 36px; height: 18px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background: var(--border); border-radius: 20px; transition: .2s; }
  .slider::before { content: ''; position: absolute; height: 12px; width: 12px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
  input:checked + .slider { background: var(--mauve); }
  input:checked + .slider::before { transform: translateX(18px); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
  .btn-save { background: var(--mauve); color: #1e1e2e; border: none; border-radius: 6px; padding: 8px 20px; font-weight: 700; font-size: 12px; cursor: pointer; flex: 1; min-width: 120px; }
  .btn-save:hover { opacity: .88; }
  .btn-settings { background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 6px; padding: 7px 14px; font-size: 11px; cursor: pointer; }
  .btn-settings:hover { color: var(--text); border-color: var(--text); }
  .btn-run { background: var(--green); color: #1e1e2e; border: none; border-radius: 6px; padding: 10px 24px; font-weight: 700; font-size: 13px; cursor: pointer; flex: 1; min-width: 180px; }
  .btn-run:hover { opacity: .88; }
  .run-actions { display: flex; gap: 8px; justify-content: center; margin: 12px 0; flex-wrap: wrap; }
  .btn-run-secondary { background: var(--blue); color: #1e1e2e; border: none; border-radius: 6px; padding: 8px 16px; font-weight: 600; font-size: 12px; cursor: pointer; }
  .btn-run-secondary:hover { opacity: .88; }
  .hint { font-size: 10px; color: var(--muted); margin-top: 3px; }
  .path-list::-webkit-scrollbar { width: 6px; }
  .path-list::-webkit-scrollbar-track { background: var(--bg); border-radius: 3px; }
  .path-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .path-list::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  
  /* Result page */
  .stats {
    display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 80px;
  }
  .stat .num { font-size: 22px; font-weight: 700; line-height: 1; }
  .stat .label { font-size: 11px; color: var(--muted); margin-top: 3px; }
  .stat.success .num { color: var(--green); }
  .stat.error   .num { color: var(--red); }
  .stat.skipped .num { color: var(--muted); }
  .stat.total   .num { color: var(--blue); }
  .stat.time    .num { font-size: 16px; color: var(--yellow); }
  .progress-bar {
    height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 16px;
  }
  .progress-fill {
    height: 100%; background: linear-gradient(90deg, var(--mauve), var(--blue)); border-radius: 3px; transition: width .5s ease;
  }
  .toolbar {
    display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;
  }
  .toolbar input {
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 6px 12px; font-size: 12px; outline: none; flex: 1; min-width: 180px;
  }
  .toolbar input:focus { border-color: var(--mauve); }
  .filter-btn {
    background: var(--surface); border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 5px 12px; font-size: 11px; cursor: pointer; transition: all .15s;
  }
  .filter-btn:hover, .filter-btn.active { background: var(--mauve); color: #1e1e2e; border-color: var(--mauve); }
  .sync-again {
    background: var(--blue); color: #1e1e2e; border: none; border-radius: 6px; padding: 7px 18px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity .15s;
  }
  .sync-again:hover { opacity: .85; }
  table {
    width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border);
  }
  thead { background: #12121e; }
  th {
    padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em;
  }
  td { padding: 9px 14px; border-top: 1px solid var(--border); vertical-align: middle; }
  .repo-row:hover { background: rgba(255,255,255,.03); }
  .icon { width: 28px; text-align: center; font-size: 14px; }
  .name { font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
  .branch { color: var(--yellow); font-family: monospace; font-size: 11px; }
  .badge {
    display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 2px;
  }
  .badge.up { background: rgba(166,227,161,.15); color: var(--green); }
  .badge.down { background: rgba(243,139,168,.15); color: var(--red); }
  .message { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  td.action button {
    background: transparent; border: 1px solid var(--border); color: var(--blue);
    border-radius: 5px; padding: 3px 10px; font-size: 11px; cursor: pointer; transition: all .15s;
  }
  td.action button:hover { background: var(--blue); color: #1e1e2e; }
  .no-data { text-align: center; color: var(--muted); padding: 30px; }
  
  /* Tab content */
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  
  /* Responsive */
  @media (max-width: 600px) {
    .grid2 { grid-template-columns: 1fr; }
    .actions { flex-direction: column; }
    .run-actions { flex-direction: column; }
  }
</style>
</head>
<body>
  <!-- Tabs -->
  <div class="tabs">
    <button class="tab ${defaultTab === "config" ? "active" : ""}" onclick="switchTab('config')">⚙️ 配置</button>
    <button class="tab ${defaultTab === "result" ? "active" : ""}" onclick="switchTab('result')">📊 结果</button>
  </div>

  <!-- Config Tab -->
  <div class="tab-content ${defaultTab === "config" ? "active" : ""}" id="config-tab">
    <h1>⚙️ Sync All Repos</h1>

    <div class="run-actions">
      <button class="btn-run" onclick="runSync()">🚀 执行同步 (Pull + Push)</button>
      <button class="btn-run-secondary" onclick="runPull()">⬇️ 仅拉取</button>
      <button class="btn-run-secondary" onclick="runPush()">⬆️ 仅推送</button>
    </div>

    <div class="section">
      <div class="section-title">📁 全局仓库路径</div>
      <div class="field">
        <label>仓库目录列表（已添加 ${allRepos.length} 个）</label>
        <div class="path-list" id="pathList">${pathItems}</div>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <button class="add-btn" onclick="addFolder()" style="flex:1">+ 选择仓库目录</button>
          <button class="add-btn" onclick="rescan()" style="flex:1;border-color:var(--green);color:var(--green)">🔄 重新扫描</button>
        </div>
        <div class="hint">* 支持手动添加或删除，点击重新扫描按当前深度重新发现</div>
      </div>
      <div class="grid2">
        <div class="field">
          <label>自动扫描深度</label>
          <input type="number" id="autoScanDepth" min="1" max="5" value="${cfg.autoScanDepth || 3}" onchange="onDepthChange()" />
          <div class="hint">* 从选定目录向下扫描几层目录寻找 Git 仓库</div>
        </div>
        <div class="field">
          <label>排除目录（逗号分隔）</label>
          <input type="text" id="excludePatterns" value="${excludeVal}" />
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🔀 同步策略</div>
      <div class="grid2">
        <div class="field">
          <label>Pull 策略</label>
          <select id="pullStrategy">
            <option value="merge"   ${(cfg.pullStrategy || "merge") === "merge" ? "selected" : ""}>merge（默认）</option>
            <option value="rebase"  ${(cfg.pullStrategy || "merge") === "rebase" ? "selected" : ""}>rebase</option>
            <option value="ff-only" ${(cfg.pullStrategy || "merge") === "ff-only" ? "selected" : ""}>ff-only（仅快进）</option>
          </select>
        </div>
        <div class="field">
          <label>Push 策略</label>
          <select id="pushStrategy">
            <option value="normal"           ${(cfg.pushStrategy || "normal") === "normal" ? "selected" : ""}>normal（正常推送）</option>
            <option value="force-with-lease" ${(cfg.pushStrategy || "normal") === "force-with-lease" ? "selected" : ""}>force-with-lease</option>
            <option value="skip"             ${(cfg.pushStrategy || "normal") === "skip" ? "selected" : ""}>skip（仅拉取）</option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:8px">
        <label>并发数量</label>
        <input type="number" id="concurrency" min="1" max="10" value="${cfg.concurrency || 3}" />
      </div>
    </div>

    <div class="section">
      <div class="section-title">📝 自动提交</div>
      <div class="toggle-row">
        <label>推送前自动提交未暂存变更</label>
        <label class="toggle">
          <input type="checkbox" id="commitBeforePush" ${cfg.commitBeforePush || false ? "checked" : ""} />
          <span class="slider"></span>
        </label>
      </div>
      <div class="field" style="margin-top:8px">
        <label>自动 Commit 消息模板</label>
        <input type="text" id="autoCommitMessage" value="${cfg.autoCommitMessage || "chore: auto sync ${date}"}" />
        <div class="hint">* 支持 \${date} \${time} 变量</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🎨 界面</div>
      <div class="toggle-row">
        <label>在状态栏显示同步按钮</label>
        <label class="toggle">
          <input type="checkbox" id="showStatusBar" ${cfg.showStatusBar || true ? "checked" : ""} />
          <span class="slider"></span>
        </label>
      </div>
      <div class="toggle-row" style="margin-top:6px">
        <label>保存文件时自动同步</label>
        <label class="toggle">
          <input type="checkbox" id="autoSyncOnSave" ${cfg.autoSyncOnSave || false ? "checked" : ""} />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="actions">
      <button class="btn-settings" onclick="openSettings()">打开 JSON 设置</button>
      <button class="btn-save" onclick="save()">💾 保存配置</button>
      <button class="btn-run" onclick="runSync()" style="flex:1;min-width:140px">🚀 执行同步</button>
    </div>
  </div>

  <!-- Result Tab -->
  <div class="tab-content ${defaultTab === "result" ? "active" : ""}" id="result-tab">
    ${resultHtml || '<div class="no-data">还没有同步结果</div>'}
  </div>

<script>
  const vscode = acquireVsCodeApi();
  let paths = ${JSON.stringify(allRepos)};
  let currentFilter = 'all';

  function switchTab(tab) {
    // 隐藏所有内容
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
    });
    // 显示选中的标签和内容
    document.getElementById(tab + '-tab').classList.add('active');
    document.querySelector('.tab:nth-child(' + (tab === 'config' ? '1' : '2') + ')').classList.add('active');
    // 通知后端
    vscode.postMessage({ command: 'switchTab', tab });
  }

  function renderPaths() {
    const list = document.getElementById('pathList');
    list.innerHTML = paths.map((p, i) => 
      '<div class="path-item" id="path-' + i + '">' +
        '<span class="path-text" title="' + p + '">' + p + '</span>' +
        '<button class="remove-btn" onclick="removePath(' + i + ')">✕</button>' +
      '</div>').join('');
  }

  function removePath(i) {
    paths.splice(i, 1);
    renderPaths();
  }

  function addFolder() {
    vscode.postMessage({ command: 'addFolder' });
  }

  function openSettings() {
    vscode.postMessage({ command: 'openSettings' });
  }

  function rescan() {
    const depth = parseInt(document.getElementById('autoScanDepth').value, 10);
    vscode.postMessage({ command: 'rescan', depth, paths });
  }

  function onDepthChange() {
    // 深度改变时可以在这里添加逻辑
  }

  function save() {
    const data = {
      repoPaths: paths,
      pullStrategy: document.getElementById('pullStrategy').value,
      pushStrategy: document.getElementById('pushStrategy').value,
      commitBeforePush: document.getElementById('commitBeforePush').checked,
      autoCommitMessage: document.getElementById('autoCommitMessage').value,
      autoScanDepth: parseInt(document.getElementById('autoScanDepth').value, 10),
      concurrency: parseInt(document.getElementById('concurrency').value, 10),
      excludePatterns: document.getElementById('excludePatterns').value.split(',').map(s => s.trim()).filter(s => s),
      showStatusBar: document.getElementById('showStatusBar').checked,
      autoSyncOnSave: document.getElementById('autoSyncOnSave').checked,
    };
    vscode.postMessage({ command: 'save', data });
  }

  function runSync() {
    save();
    vscode.postMessage({ command: 'syncAll' });
  }

  function runPull() {
    save();
    vscode.postMessage({ command: 'syncAll', mode: 'pull-only' });
  }

  function runPush() {
    save();
    vscode.postMessage({ command: 'syncAll', mode: 'push-only' });
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.command) {
      case 'addPaths':
        paths = [...new Set([...paths, ...msg.paths])];
        renderPaths();
        break;
      case 'setPaths':
        paths = msg.paths;
        renderPaths();
        break;
      case 'switchTab':
        switchTab(msg.tab);
        break;
    }
  });

  // Result tab functions
  function openRepo(p) {
    vscode.postMessage({ command: 'openRepo', path: p });
  }
  function syncAgain() {
    vscode.postMessage({ command: 'syncAll' });
  }
  function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterTable();
  }
  function filterTable() {
    const q = document.getElementById('search')?.value?.toLowerCase() ?? '';
    document.querySelectorAll('#tableBody tr.repo-row').forEach(row => {
      const name = row.querySelector('.name')?.textContent?.toLowerCase() ?? '';
      const status = row.dataset.status ?? '';
      const matchFilter = currentFilter === 'all' || status === currentFilter;
      const matchSearch = name.includes(q);
      row.style.display = matchFilter && matchSearch ? '' : 'none';
    });
  }
</script>
</body>
</html>`;
}
