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
exports.ToolkitDefinitionProvider = void 0;
exports.registerDefinitionProvider = registerDefinitionProvider;
/**
 * DefinitionProvider：移植自 boundless-vue-helper/src/provider.Definition.js，JS→TS
 * 支持六类跳转：.vue 路径串 / 组件标签 / _.$xxx / this.xxx / Vue.xxx / js 路径
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const AliasResolver_1 = require("./AliasResolver");
const CommonScanner_1 = require("./CommonScanner");
const VueLoader_1 = require("./VueLoader");
// 六类匹配正则
const REG_VUE_PATH = /"([^"]*)\.vue"|'([^']*)\.vue'|`([^`]*)\.vue`/;
const REG_COMPONENT_TAG = /<\/?([\w-]+).*?/;
const REG_GLOBAL_VAR = /_\.\$(\w+)/;
const REG_VUE_VAR = /(Vue(\.\w+)+)/;
const REG_VUE_INTERNAL_REF = /this\.(\w+)|self\.(\w+)/;
const REG_JS_PATH = /"([^"]*)"|'([^']*)'|`([^`]*)`/;
function newFileLocation(absPath, line = 0, column = 0) {
    return new vscode.Location(vscode.Uri.file(absPath), new vscode.Position(line, column));
}
function handleJumpToCommonUtils(label, documentUriPath, configs) {
    const scanResult = (0, CommonScanner_1.getScanResult)();
    if (scanResult.vars[label]) {
        const [fileProps, line, column] = scanResult.vars[label];
        const filePath = scanResult.files[fileProps];
        if (filePath) {
            const absolutePath = path.resolve(vscode.workspace.rootPath || "", filePath);
            if (fs.existsSync(absolutePath)) {
                return [new vscode.Location(vscode.Uri.file(absolutePath), new vscode.Position(line - 1, column))];
            }
            const jsPath = absolutePath.replace(/\.ts$/, ".js");
            if (fs.existsSync(jsPath)) {
                return [new vscode.Location(vscode.Uri.file(jsPath), new vscode.Position(line - 1, column))];
            }
        }
    }
    // 回退：直接解析 common.ts
    const possiblePaths = [
        path.resolve(vscode.workspace.rootPath || "", "statics", "common", "libs", "common.ts"),
        path.resolve(vscode.workspace.rootPath || "", "statics", "common", "common.ts")
    ];
    if (Array.isArray(configs.mapping_statics)) {
        for (const mount of configs.mapping_statics) {
            possiblePaths.push(path.resolve(vscode.workspace.rootPath || "", mount.dir, "common.ts"));
        }
    }
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, "utf-8");
            const regex = new RegExp(`_\\.${label}`, "g");
            const match = regex.exec(content);
            if (match) {
                const lines = content.slice(0, match.index).split(/\r?\n/);
                const line = lines.length;
                const column = lines[lines.length - 1].length;
                return [new vscode.Location(vscode.Uri.file(p), new vscode.Position(line - 1, column))];
            }
        }
    }
    return null;
}
function handleJumpToComponentTag(tagName, configs) {
    const components = configs.components;
    if (!components || !components[tagName]) {
        return null;
    }
    const workspaceRoot = vscode.workspace.rootPath || "";
    return components[tagName]
        .map((relativePath) => {
        const absolutePath = path.resolve(workspaceRoot, relativePath);
        if (fs.existsSync(absolutePath)) {
            return newFileLocation(absolutePath);
        }
        return null;
    })
        .filter(Boolean);
}
function handleJumpToVueInternalRef(document, documentUriPath, selectedString) {
    try {
        const parsedVue = (0, VueLoader_1.VueLoader)(document.getText());
        const pos = parsedVue.findElementPosition("methods", selectedString)
            || parsedVue.findElementPosition("computed", selectedString)
            || parsedVue.findElementPosition("props", selectedString);
        if (pos && pos.line !== undefined) {
            return newFileLocation(documentUriPath, pos.line, pos.column || 0);
        }
    }
    catch {
        // ignore
    }
    return null;
}
class ToolkitDefinitionProvider {
    constructor(configs) {
        this.configs = configs;
    }
    async provideDefinition(document, position) {
        const { path: documentUriPath } = document.uri;
        let range;
        let selectedString;
        let currentRegexp;
        // 优先级：.vue 路径 → 组件标签 → _.$xxx → this.xxx → Vue.xxx → js 路径
        const tryRegex = (regex) => {
            range = document.getWordRangeAtPosition(position, regex);
            currentRegexp = regex;
            return !!range;
        };
        if (tryRegex(REG_VUE_PATH)) { /* .vue 路径 */ }
        else if (tryRegex(REG_COMPONENT_TAG)) { /* 组件标签 */ }
        else if (tryRegex(REG_GLOBAL_VAR)) { /* _.$xxx */ }
        else if (tryRegex(REG_VUE_INTERNAL_REF)) { /* this.xxx */ }
        else if (tryRegex(REG_VUE_VAR)) { /* Vue.xxx */ }
        else if (tryRegex(REG_JS_PATH)) { /* js 路径 */ }
        else {
            return null;
        }
        if (!range || !currentRegexp) {
            return null;
        }
        selectedString = document.getText(range).match(currentRegexp)?.[1];
        if (!selectedString) {
            return null;
        }
        if (currentRegexp === REG_VUE_PATH) {
            selectedString = `${selectedString}.vue`;
        }
        else if (currentRegexp === REG_GLOBAL_VAR) {
            selectedString = `$${selectedString}`;
        }
        if (currentRegexp === REG_COMPONENT_TAG) {
            return handleJumpToComponentTag(selectedString, this.configs);
        }
        if (currentRegexp === REG_GLOBAL_VAR) {
            return handleJumpToCommonUtils(selectedString, documentUriPath, this.configs);
        }
        if (currentRegexp === REG_VUE_INTERNAL_REF) {
            return handleJumpToVueInternalRef(document, documentUriPath, selectedString);
        }
        const normalized = (0, AliasResolver_1.normalizedAbsolutePathForFS)({
            documentUriPath,
            urlInSourceCode: selectedString,
            configs: this.configs
        });
        if (normalized) {
            return newFileLocation(normalized);
        }
        return null;
    }
}
exports.ToolkitDefinitionProvider = ToolkitDefinitionProvider;
function registerDefinitionProvider(ctx, configs) {
    const provider = new ToolkitDefinitionProvider(configs);
    const subscription = vscode.languages.registerDefinitionProvider([
        { scheme: "file", language: "vue" },
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "typescript" }
    ], provider);
    ctx.subscriptions.push(subscription);
}
