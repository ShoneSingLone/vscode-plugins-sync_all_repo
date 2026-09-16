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
exports.detectXspaceProject = detectXspaceProject;
/**
 * 激活守卫：检测当前工作区是否为 x-space 项目。
 * 检查各 workspace folder 根目录是否存在 configs.boundless.vue.project.js
 * → 命中：激活全部模块（仓库管理 + 代码跳转 + 同步）
 * → 未命中：仅激活模块 A（通用多仓库管理），不干扰非 x-space 项目
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function detectXspaceProject() {
    const result = {
        isXspaceProject: false,
        xspaceRoots: [],
        configs: { alias: {}, mapping_statics: [] }
    };
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
        const configPath = path.join(folder.uri.fsPath, "configs.boundless.vue.project.js");
        if (fs.existsSync(configPath)) {
            result.isXspaceProject = true;
            result.xspaceRoots.push(folder.uri.fsPath);
            // 尝试加载配置
            try {
                delete require.cache[configPath];
                const rawConfigs = require(configPath);
                result.configs = {
                    ...(rawConfigs || {}),
                    alias: rawConfigs.alias || {},
                    mapping_statics: rawConfigs.mapping_statics || [],
                    rootPath: folder.uri.fsPath
                };
            }
            catch (e) {
                console.error(`[x-space Toolkit] 加载配置失败 ${configPath}:`, e);
            }
            break;
        }
    }
    return result;
}
