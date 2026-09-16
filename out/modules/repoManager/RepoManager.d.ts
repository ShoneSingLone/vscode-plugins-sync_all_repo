import { RepoView } from "../../types";
export type RepoManagerListener = (repos: RepoView[]) => void;
/**
 * 仓库管理器：扫描、收集、watcher（防抖刷新）。
 * 注册 .git/HEAD、.git/index、.git/ORIG_HEAD 变更监听。
 */
export declare class RepoManager {
    private _repos;
    private _views;
    private _listeners;
    private _watchers;
    private _debounceTimer;
    private _ready;
    /** 已启动的初始化（扫描 + 注册 watcher） */
    init(): Promise<void>;
    get views(): RepoView[];
    get ready(): boolean;
    onChange(listener: RepoManagerListener): {
        dispose(): void;
    };
    dispose(): void;
    /** 外部触发重新发现（含运行时新增文件夹） */
    refreshDiscovery(): Promise<void>;
    private _emit;
    private _refreshAll;
    private _notifyDebounced;
    private _setupWatchers;
    private _discover;
    private _isGitRepo;
    private _isExcluded;
}
