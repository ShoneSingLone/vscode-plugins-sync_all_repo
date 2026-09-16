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
exports.OutputManager = void 0;
const vscode = __importStar(require("vscode"));
/** 统一输出日志面板 */
class OutputManager {
    constructor() {
        this.channel = vscode.window.createOutputChannel("x-space Toolkit");
    }
    static getInstance() {
        if (!OutputManager._instance) {
            OutputManager._instance = new OutputManager();
        }
        return OutputManager._instance;
    }
    appendLine(message) {
        const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        this.channel.appendLine(`[${time}] ${message}`);
    }
    info(message) {
        this.appendLine(`[INFO] ${message}`);
    }
    warn(message) {
        this.appendLine(`[WARN] ${message}`);
    }
    error(message) {
        this.appendLine(`[ERROR] ${message}`);
    }
    show(preserveFocus = true) {
        this.channel.show(preserveFocus);
    }
    dispose() {
        this.channel.dispose();
        OutputManager._instance = undefined;
    }
}
exports.OutputManager = OutputManager;
