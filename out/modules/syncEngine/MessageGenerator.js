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
exports.generateCommitMessage = generateCommitMessage;
const path = __importStar(require("path"));
const EXT_TYPE_MAP = {
    ".ts": "feat",
    ".js": "feat",
    ".tsx": "feat",
    ".jsx": "feat",
    ".vue": "feat",
    ".json": "chore",
    ".md": "docs",
    ".css": "style",
    ".less": "style",
    ".scss": "style",
    ".svg": "chore",
    ".png": "chore",
    ".jpg": "chore",
    ".sh": "chore",
    ".yaml": "chore",
    ".yml": "chore",
    ".test.ts": "test",
    ".test.js": "test",
    ".spec.ts": "test",
    ".spec.js": "test",
    ".d.ts": "chore"
};
function inferType(files) {
    // 纯删除 → refactor（与「删除 xxx」描述语义一致）
    if (files.length > 0 && files.every(f => f.added === 0 && f.deleted > 0)) {
        return "refactor";
    }
    const typeScores = { feat: 0, fix: 0, refactor: 0, docs: 0, style: 0, test: 0, chore: 0 };
    for (const f of files) {
        const ext = path.extname(f.file);
        const base = path.basename(f.file);
        let type = "chore";
        if (/test|spec/.test(base)) {
            type = "test";
        }
        else if (EXT_TYPE_MAP[ext]) {
            type = EXT_TYPE_MAP[ext];
        }
        typeScores[type] = (typeScores[type] || 0) + f.added + f.deleted;
    }
    let bestType = "chore";
    let bestScore = 0;
    for (const [t, s] of Object.entries(typeScores)) {
        if (s > bestScore) {
            bestScore = s;
            bestType = t;
        }
    }
    return bestType;
}
/** 从文件列表推断 scope（取最浅的公共前缀目录名） */
function inferScope(files, repoName, level) {
    if (level === 2) {
        return repoName.replace(/^business_/, "");
    }
    const dirSet = new Set();
    for (const f of files) {
        const parts = f.file.split(/[\\/]/);
        if (parts.length > 1) {
            dirSet.add(parts[0]);
        }
    }
    const dirs = Array.from(dirSet);
    if (dirs.length === 1) {
        return dirs[0];
    }
    // 取变更最多的目录
    const counts = {};
    for (const f of files) {
        const dir = f.file.split(/[\\/]/)[0] || "";
        counts[dir] = (counts[dir] || 0) + f.added + f.deleted;
    }
    let best = "";
    let bestCount = 0;
    for (const [dir, c] of Object.entries(counts)) {
        if (c > bestCount) {
            bestCount = c;
            best = dir;
        }
    }
    return best || repoName;
}
function generateDescription(files) {
    if (files.length === 0) {
        return "暂存变更";
    }
    if (files.length === 1) {
        const f = files[0];
        const base = path.basename(f.file);
        if (f.added > 0 && f.deleted === 0) {
            return `新增 ${base}`;
        }
        if (f.deleted > 0 && f.added === 0) {
            return `删除 ${base}`;
        }
        return `更新 ${base}`;
    }
    const dirSet = new Set();
    for (const f of files) {
        const parts = f.file.split(/[\\/]/);
        dirSet.add(parts.length > 1 ? parts[0] : "根目录");
    }
    const dirs = Array.from(dirSet).slice(0, 2);
    return `更新 ${dirs.join("、")} 等 ${files.length} 个文件`;
}
/**
 * 生成规范 commit message（Conventional Commits + 中文描述）
 * @param files  git diff --cached --numstat 解析结果
 * @param repoName 仓库名
 * @param level 仓库层级
 * @returns `{ type, scope, message }` message 为完整提交信息字符串
 */
function generateCommitMessage(files, repoName, level) {
    const type = inferType(files);
    const scope = inferScope(files, repoName, level);
    const description = generateDescription(files);
    const message = `${type}(${scope}): ${description}`;
    return { type, scope, message };
}
