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
exports.collectRepoView = collectRepoView;
const git = __importStar(require("../../utils/git"));
/** 收集单个仓库的完整视图状态 */
async function collectRepoView(repo) {
    const [branch, remotes, porcelain] = await Promise.all([
        git.getCurrentBranch(repo.path),
        git.listRemotes(repo.path),
        git.getPorcelain(repo.path)
    ]);
    const conflicts = porcelain.filter(git.isConflicted).length;
    const dirty = porcelain.length;
    // 每个远程独立计算 ahead/behind（基于当前分支）
    const remoteStatuses = [];
    if (branch) {
        for (const remote of remotes) {
            const { ahead, behind } = await git.getAheadBehind(repo.path, remote.name, branch);
            remoteStatuses.push({ name: remote.name, url: remote.url, ahead, behind });
        }
    }
    return {
        id: repo.path,
        name: repo.name,
        path: repo.path,
        branch,
        remotes: remoteStatuses,
        dirty,
        conflicts,
        level: repo.level
    };
}
