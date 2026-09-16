"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const RepoStatus_1 = require("./RepoStatus");
/**
 * 仓库管理器：扫描、收集、watcher（防抖刷新）。
 * 注册 .git/HEAD、.git/index、.git/ORIG_HEAD 变更监听。
 */
class RepoManager {
    constructor() {
        this._repos = [];
        this._views = [];
        this._listeners = [];
        this._watchers = [];
        this._ready = false;
    }
    /** 已启动的初始化（扫描 + 注册 watcher） */
    async init() {
        this._repos = await this._discover();
        await this._refreshAll();
        this._setupWatchers();
        this._ready = true;
    }
    get views() {
        return this._views;
    }
    get ready() {
        return this._ready;
    }
    onChange(listener) {
        this._listeners.push(listener);
        return {
            dispose: () => {
                const idx = this._listeners.indexOf(listener);
                if (idx >= 0) {
                    this._listeners.splice(idx, 1);
                }
            }
        };
    }
    dispose() {
        this._debounceTimer && clearTimeout(this._debounceTimer);
        this._watchers.forEach(w => w.close());
        this._watchers = [];
        this._listeners = [];
    }
    /** 外部触发重新发现（含运行时新增文件夹） */
    async refreshDiscovery() {
        this._repos = await this._discover();
        await this._refreshAll();
    }
    _emit() {
        const snapshot = [...this._views];
        this._listeners.forEach(fn => fn(snapshot));
    }
    async _refreshAll() {
        this._views = await Promise.all(this._repos.map(r => (0, RepoStatus_1.collectRepoView)(r)));
        this._views.sort((a, b) => a.name.localeCompare(b.name));
        this._emit();
    }
    _notifyDebounced() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._refreshAll();
            this._debounceTimer = undefined;
        }, 200);
    }
    _setupWatchers() {
        for (const repo of this._repos) {
            const gitDir = path.join(repo.path, ".git");
            const targets = ["HEAD", "index", "ORIG_HEAD", "refs/stash"];
            for (const file of targets) {
                const filePath = path.join(gitDir, file);
                try {
                    const w = fs.watch(filePath, () => {
                        this._notifyDebounced();
                    });
                    this._watchers.push(w);
                }
                catch {
                    /* 某些文件可能不存在，忽略 */
                }
            }
        }
    }
    async _discover() {
        const repos = [];
        const seen = new Set();
        const push = (dir, level) => {
            const normalized = path.normalize(dir);
            if (seen.has(normalized)) {
                return;
            }
            seen.add(normalized);
            repos.push({ path: normalized, name: path.basename(normalized), level });
        };
        const workspaces = vscode.workspace.workspaceFolders || [];
        for (const folder of workspaces) {
            const root = folder.uri.fsPath;
            if (this._isGitRepo(root)) {
                push(root, 1);
            }
            let children = [];
            try {
                const entries = await fs.promises.readdir(root, { withFileTypes: true });
                children = entries.filter(e => e.isDirectory()).map(e => path.join(root, e.name));
            }
            catch {
                continue;
            }
            for (const child of children) {
                if (this._isExcluded(path.basename(child))) {
                    continue;
                }
                if (this._isGitRepo(child)) {
                    push(child, 2);
                }
            }
        }
        return repos;
    }
    _isGitRepo(dir) {
        return fs.existsSync(path.join(dir, ".git"));
    }
    _isExcluded(name) {
        return /(^|[\\/])(node_modules|\.git|\.claude|\.vscode|\.idea|dist|out|build|coverage)([\\/]|$)|archive|归档|_ignore|backup/i.test(name);
    }
}
exports.RepoManager = RepoManager;
