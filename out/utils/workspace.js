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
exports.isExcludedDirName = isExcludedDirName;
exports.discoverRepos = discoverRepos;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const git_1 = require("./git");
/** 排除目录：node_modules、.claude、归档目录等，始终忽略 */
const EXCLUDE_PATTERN = /(^|[\\/])(node_modules|\.git|\.claude|\.vscode|\.idea|dist|out|build|coverage)([\\/]|$)|archive|归档|_ignore|backup/i;
function isExcludedDirName(name) {
    return EXCLUDE_PATTERN.test(name);
}
/**
 * 仓库发现（扁平化扫描，PRD 约定层级只有 1/2 级）：
 * - workspace folder 根有 .git → 记为 1 级
 * - folder 下一层子目录有 .git → 记为 2 级（根有 .git 时子目录仍会扫，两层数据都收）
 * - 绝不深入第 3 层
 */
async function discoverRepos() {
    const repos = [];
    const seen = new Set();
    const pushRepo = (dir, level) => {
        const normalized = path.normalize(dir);
        if (seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        repos.push({ path: normalized, name: path.basename(normalized), level });
    };
    for (const folder of vscode.workspace.workspaceFolders || []) {
        const root = folder.uri.fsPath;
        if ((0, git_1.isGitRepo)(root)) {
            pushRepo(root, 1);
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
            if (isExcludedDirName(path.basename(child))) {
                continue;
            }
            if ((0, git_1.isGitRepo)(child)) {
                pushRepo(child, 2);
            }
        }
    }
    return repos;
}
