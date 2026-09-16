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
exports.ToolkitCompletionProvider = void 0;
exports.registerCompletionProvider = registerCompletionProvider;
/**
 * CompletionProvider：移植自 boundless-vue-helper/src/provider.Completion.js，JS→TS
 * 字符串内 .vue 路径补全
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const AliasResolver_1 = require("./AliasResolver");
const REG_UNDONE_PATH_REG = /"([^"]*)"|'([^']*)'|`([^`]*)`/;
class ToolkitCompletionProvider {
    constructor(configs) {
        this.configs = configs;
    }
    async provideCompletionItems(document, position) {
        const range = document.getWordRangeAtPosition(position, REG_UNDONE_PATH_REG);
        if (!range) {
            return null;
        }
        const text = document.getText(range);
        const match = text.match(REG_UNDONE_PATH_REG);
        if (!match) {
            return null;
        }
        const urlInSourceCode = match[1];
        const { path: documentUriPath } = document.uri;
        const normalizedDir = (0, AliasResolver_1.normalizedAbsolutePathForFS)({
            documentUriPath,
            urlInSourceCode,
            configs: this.configs,
            isGetDir: true
        });
        if (!normalizedDir || !fs.existsSync(normalizedDir)) {
            return null;
        }
        return this._listVueFiles(normalizedDir);
    }
    _listVueFiles(dirPath) {
        const items = [];
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith(".vue")) {
                    const label = entry.name;
                    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.File);
                    items.push(item);
                }
            }
        }
        catch {
            // 目录不存在或无权限
        }
        return items;
    }
}
exports.ToolkitCompletionProvider = ToolkitCompletionProvider;
function registerCompletionProvider(ctx, configs) {
    const provider = new ToolkitCompletionProvider(configs);
    const subscription = vscode.languages.registerCompletionItemProvider([
        { scheme: "file", language: "vue" },
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "typescript" }
    ], provider, "/", ".");
    ctx.subscriptions.push(subscription);
}
