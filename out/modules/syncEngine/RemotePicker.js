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
exports.pickRemotes = pickRemotes;
const vscode = __importStar(require("vscode"));
const PICK_STATE_KEY_PREFIX = "xspace.remotePicker.";
/** 记忆上次选择（workspaceState 缓存），下次默认复用 */
function getRememberedSelectedNames(workspaceState, repoId) {
    return workspaceState.get(`${PICK_STATE_KEY_PREFIX}${repoId}`, []);
}
function setRememberedSelectedNames(workspaceState, repoId, names) {
    workspaceState.update(`${PICK_STATE_KEY_PREFIX}${repoId}`, names);
}
/**
 * QuickPick 多选：列出仓库所有远程，多选，可记忆上次选择。
 * 返回用户最终勾选的远程名列表，取消返回 null。
 */
async function pickRemotes(repoId, remotes, workspaceState) {
    if (remotes.length === 0) {
        void vscode.window.showWarningMessage("该仓库未配置远程仓库。");
        return null;
    }
    const remembered = getRememberedSelectedNames(workspaceState, repoId);
    const items = remotes.map(r => ({
        label: r.name,
        description: r.url,
        picked: remembered.includes(r.name) || (remembered.length === 0 && r.name === "origin")
    }));
    const picked = await vscode.window.showQuickPick(items, {
        title: "选择目标远程（可多选）",
        canPickMany: true,
        placeHolder: "勾选要 push 的远程，确认后逐个推送"
    });
    if (!picked) {
        return null;
    }
    const names = picked.map(i => i.label);
    setRememberedSelectedNames(workspaceState, repoId, names);
    return names;
}
