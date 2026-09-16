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
exports.gitOk = void 0;
exports.git = git;
exports.isGitRepo = isGitRepo;
exports.getCurrentBranch = getCurrentBranch;
exports.listRemotes = listRemotes;
exports.getAheadBehind = getAheadBehind;
exports.getPorcelain = getPorcelain;
exports.parsePorcelain = parsePorcelain;
exports.isConflicted = isConflicted;
exports.getUpstream = getUpstream;
exports.fetchRemote = fetchRemote;
exports.pullRemote = pullRemote;
exports.addAll = addAll;
exports.commit = commit;
exports.pushRemote = pushRemote;
exports.setRemoteUrl = setRemoteUrl;
exports.addRemote = addRemote;
exports.removeRemote = removeRemote;
exports.getStagedNumstat = getStagedNumstat;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const OutputManager_1 = require("../modules/output/OutputManager");
const TIMEOUT_DEFAULT = 30000;
const TIMEOUT_NETWORK = 120000;
const TIMEOUT_PUSH = 300000;
/** 执行 git 命令（execFile 参数数组，避免 Windows 路径引号问题），失败不抛异常，返回 code */
function git(cwd, args, timeoutMs = TIMEOUT_DEFAULT) {
    return new Promise(resolve => {
        (0, child_process_1.execFile)("git", args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
            const code = error ? Number(error.code) || 1 : 0;
            const out = stdout == null ? "" : String(stdout);
            const err = stderr == null ? "" : String(stderr);
            if (code !== 0) {
                const firstErrLine = err.trim().split(/\r?\n/)[0] || "no stderr";
                OutputManager_1.OutputManager.getInstance().appendLine(`[git] ${args.join(" ")} (in ${cwd}) → exit ${code}: ${firstErrLine}`);
            }
            resolve({ code, stdout: out, stderr: err });
        });
    });
}
const gitOk = (r) => r.code === 0;
exports.gitOk = gitOk;
/** PRD 约定：只认 .git，有才管 */
function isGitRepo(dir) {
    return fs.existsSync(path.join(dir, ".git"));
}
async function getCurrentBranch(cwd) {
    const r = await git(cwd, ["branch", "--show-current"]);
    if ((0, exports.gitOk)(r) && r.stdout.trim()) {
        return r.stdout.trim();
    }
    const head = await git(cwd, ["rev-parse", "--short", "HEAD"]);
    return (0, exports.gitOk)(head) ? `(detached:${head.stdout.trim()})` : "";
}
/** git remote -v → 去重后的远程列表（fetch url） */
async function listRemotes(cwd) {
    const r = await git(cwd, ["remote", "-v"]);
    if (!(0, exports.gitOk)(r)) {
        return [];
    }
    const remotes = new Map();
    for (const line of r.stdout.split(/\r?\n/)) {
        const m = line.match(/^(\S+)\t(\S+)\s+\(fetch\)$/);
        if (m) {
            remotes.set(m[1], m[2]);
        }
    }
    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
}
/**
 * 每个远程独立计算 ahead/behind（基于本地 remote-tracking ref，不联网）。
 * 远程 ref 不存在时返回 -1/-1（面板显示 ?）
 */
async function getAheadBehind(cwd, remote, branch) {
    const r = await git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${remote}/${branch}`]);
    if (!(0, exports.gitOk)(r)) {
        return { ahead: -1, behind: -1 };
    }
    const parts = r.stdout.trim().split(/\s+/);
    const ahead = Number(parts[0]) || 0;
    const behind = Number(parts[1]) || 0;
    return { ahead, behind };
}
/** git status --porcelain → 解析为文件列表 */
async function getPorcelain(cwd) {
    const r = await git(cwd, ["status", "--porcelain"]);
    if (!(0, exports.gitOk)(r)) {
        return [];
    }
    return parsePorcelain(r.stdout);
}
/** porcelain 行解析（供单测/复用）：XY path，rename 为 "old -> new" 取 new */
function parsePorcelain(stdout) {
    const files = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
        if (rawLine.length < 4) {
            continue;
        }
        const x = rawLine.charAt(0);
        const y = rawLine.charAt(1);
        let file = rawLine.slice(3);
        if (file.includes(" -> ")) {
            file = file.split(" -> ").pop();
        }
        files.push({ x, y, file });
    }
    return files;
}
/** 冲突判定：未合并状态（U 出现 / AA / DD） */
function isConflicted(f) {
    return (f.x === "U" || f.y === "U" || (f.x === "A" && f.y === "A") || (f.x === "D" && f.y === "D"));
}
/** 是否有 upstream；有返回 upstream 全名（remote/branch），无返回 null */
async function getUpstream(cwd) {
    const r = await git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    return (0, exports.gitOk)(r) && r.stdout.trim() ? r.stdout.trim() : null;
}
async function fetchRemote(cwd, remote) {
    return git(cwd, ["fetch", remote], TIMEOUT_NETWORK);
}
async function pullRemote(cwd, remote, branch) {
    return git(cwd, ["pull", remote, branch], TIMEOUT_NETWORK);
}
async function addAll(cwd) {
    return git(cwd, ["add", "."]);
}
async function commit(cwd, message) {
    return git(cwd, ["commit", "-m", message]);
}
/** push；无 upstream 时自动带 -u */
async function pushRemote(cwd, remote, branch) {
    const upstream = await getUpstream(cwd);
    const args = upstream ? ["push", remote, branch] : ["push", "-u", remote, branch];
    return git(cwd, args, TIMEOUT_PUSH);
}
async function setRemoteUrl(cwd, name, url) {
    return git(cwd, ["remote", "set-url", name, url]);
}
async function addRemote(cwd, name, url) {
    return git(cwd, ["remote", "add", name, url]);
}
async function removeRemote(cwd, name) {
    return git(cwd, ["remote", "remove", name]);
}
/** git diff --cached --numstat（须先 add）→ [{added, deleted, file}] */
async function getStagedNumstat(cwd) {
    const r = await git(cwd, ["diff", "--cached", "--numstat"]);
    if (!(0, exports.gitOk)(r)) {
        return [];
    }
    const list = [];
    for (const line of r.stdout.split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (m) {
            list.push({
                added: m[1] === "-" ? 0 : Number(m[1]),
                deleted: m[2] === "-" ? 0 : Number(m[2]),
                file: m[3].includes(" -> ") ? m[3].split(" -> ").pop() : m[3]
            });
        }
    }
    return list;
}
