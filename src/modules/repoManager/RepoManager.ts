import { Repo, RepoView } from "./types";
import { collectRepoView } from "./RepoStatus";
import { OutputManager } from "../output/OutputManager";
import * as fs from "fs";
import * as path from "path";

export type RepoManagerListener = (repos: RepoView[]) => void;

/**
 * 仓库管理器：扫描、收集、watcher（防抖刷新）。
 * 注册 .git/HEAD、.git/index、.git/ORIG_HEAD 变更监听。
 */
export class RepoManager {
	private _repos: Repo[] = [];
	private _views: RepoView[] = [];
	private _listeners: RepoManagerListener[] = [];
	private _watchers: fs.FSWatcher[] = [];
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
	private _ready: boolean = false;

	/** 已启动的初始化（扫描 + 注册 watcher） */
	async init(): Promise<void> {
		this._repos = await this._discover();
		await this._refreshAll();
		this._setupWatchers();
		this._ready = true;
	}

	get views(): RepoView[] {
		return this._views;
	}
	get ready(): boolean {
		return this._ready;
	}

	onChange(listener: RepoManagerListener): { dispose(): void } {
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

	dispose(): void {
		this._debounceTimer && clearTimeout(this._debounceTimer);
		this._watchers.forEach(w => w.close());
		this._watchers = [];
		this._listeners = [];
	}

	/** 外部触发重新发现（含运行时新增文件夹） */
	async refreshDiscovery(): Promise<void> {
		this._repos = await this._discover();
		await this._refreshAll();
	}

	private _emit(): void {
		const snapshot = [...this._views];
		this._listeners.forEach(fn => fn(snapshot));
	}

	private async _refreshAll(): Promise<void> {
		this._views = await Promise.all(this._repos.map(r => collectRepoView(r)));
		this._views.sort((a, b) => a.name.localeCompare(b.name));
		this._emit();
	}

	private _notifyDebounced(): void {
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}
		this._debounceTimer = setTimeout(() => {
			this._refreshAll();
			this._debounceTimer = undefined;
		}, 200);
	}

	private _setupWatchers(): void {
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
				} catch {
					/* 某些文件可能不存在，忽略 */
				}
			}
		}
	}

	private async _discover(): Promise<Repo[]> {
		const repos: Repo[] = [];
		const seen = new Set<string>();
		const push = (dir: string, level: 1 | 2) => {
			const normalized = path.normalize(dir);
			if (seen.has(normalized)) {
				return;
			}
			seen.add(normalized);
			repos.push({ path: normalized, name: path.basename(normalized), level });
		};

		const workspaces = (await import("vscode")).default?.workspace?.workspaceFolders || [];
		for (const folder of workspaces) {
			const root = folder.uri.fsPath;
			if (this._isGitRepo(root)) {
				push(root, 1);
			}
			let children: string[] = [];
			try {
				const entries = await fs.promises.readdir(root, { withFileTypes: true });
				children = entries.filter(e => e.isDirectory()).map(e => path.join(root, e.name));
			} catch {
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

	private _isGitRepo(dir: string): boolean {
		return fs.existsSync(path.join(dir, ".git"));
	}

	private _isExcluded(name: string): boolean {
		return /(^|[\\/])(node_modules|\.git|\.claude|\.vscode|\.idea|dist|out|build|coverage)([\\/]|$)|archive|归档|_ignore|backup/i.test(name);
	}
}
