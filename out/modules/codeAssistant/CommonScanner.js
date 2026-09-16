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
exports.getScanResult = getScanResult;
exports.findCommonTsFile = findCommonTsFile;
exports.scanCommonTsFile = scanCommonTsFile;
exports.setupCommonTsWatcher = setupCommonTsWatcher;
/**
 * common.ts 自动扫描器（从 boundless-vue-helper/src/utils.autoScan.js 移植，JS→TS）
 * - 扫描 common.ts 提取 _.$xxx 函数定义
 * - 文件变化时热更新索引
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let _scanResult = { vars: {}, files: {} };
function getScanResult() {
    return _scanResult;
}
/**
 * 在各可能位置查找 common.ts
 */
function findCommonTsFile(workspaceRoot, configs) {
    const possiblePaths = [
        path.resolve(workspaceRoot, "statics", "common", "common.ts"),
        path.resolve(workspaceRoot, "common.ts"),
        path.resolve(workspaceRoot, "src", "common.ts")
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    if (Array.isArray(configs.mapping_statics)) {
        for (const mount of configs.mapping_statics) {
            const dir = path.resolve(workspaceRoot, mount.dir);
            const candidate = path.join(dir, "common.ts");
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}
/**
 * 扫描 common.ts 并提取 _.$xxx 函数定义（更新全局索引）
 */
function scanCommonTsFile(commonTsPath, workspaceRoot) {
    if (!fs.existsSync(commonTsPath)) {
        return _scanResult;
    }
    const content = fs.readFileSync(commonTsPath, "utf-8");
    // 匹配 _.$xxx = function / _.$xxx = ( / _.$xxx = () => / _.$xxx : function 等
    const funcRegex = /\.\$([a-zA-Z_]\w*)\s*=\s*(?:function|\(|async\s*\(|[a-zA-Z])/g;
    let match;
    const functions = {};
    while ((match = funcRegex.exec(content)) !== null) {
        const funcName = match[1];
        if (funcName) {
            const lines = content.slice(0, match.index).split(/\r?\n/);
            const line = lines.length;
            const column = lines[lines.length - 1].length;
            functions[`$${funcName}`] = ["common", line, column];
        }
    }
    _scanResult = {
        vars: { ..._scanResult.vars, ...functions },
        files: { ..._scanResult.files, common: path.relative(workspaceRoot, commonTsPath) }
    };
    return _scanResult;
}
/**
 * 设置文件监听器（热更新 common.ts 索引）
 */
function setupCommonTsWatcher(commonTsPath, workspaceRoot, configs, ctx) {
    if (!commonTsPath) {
        return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(vscode.Uri.file(commonTsPath).fsPath, false, false, false);
    const rescan = () => {
        scanCommonTsFile(commonTsPath, workspaceRoot);
    };
    ctx.subscriptions.push(watcher);
    ctx.subscriptions.push(watcher.onDidChange(rescan));
    ctx.subscriptions.push(watcher.onDidCreate(rescan));
    ctx.subscriptions.push(watcher.onDidDelete(() => { }));
}
