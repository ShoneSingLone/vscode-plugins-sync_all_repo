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
exports.normalizedAbsolutePathForFS = normalizedAbsolutePathForFS;
/**
 * 别名路径解析器（从 boundless-vue-helper/src/utils.js 移植，JS→TS）
 * - alias 正则匹配
 * - @/  business_ 分割逻辑
 * - mapping_statics 前缀映射
 * - .js → .ts 回退
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
/** 配置内根目录兜底（多根工作区下 rootPath 不可靠，统一走 configs.rootPath） */
function configRoot(configs) {
    return configs.rootPath || vscode.workspace.rootPath || "";
}
const ALIAS_PATH_CACHE = {};
function normalizePrefix(prefix) {
    const raw = String(prefix ?? "").trim();
    if (raw.charAt(0) !== "/") {
        return "";
    }
    const trimmed = raw.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
}
function getMountedDirForDoc(documentUriPath, mounts, rootPath) {
    if (!Array.isArray(mounts)) {
        return null;
    }
    const target = path.normalize(documentUriPath);
    for (const m of mounts) {
        const dir = path.resolve(rootPath, m.dir);
        if (target === dir || target.startsWith(dir + path.sep)) {
            return dir;
        }
    }
    return null;
}
/**
 * 源码中的 URL 路径 → 文件系统绝对路径（未找到返回 null）
 */
function normalizedAbsolutePathForFS(opts) {
    const { documentUriPath, urlInSourceCode, configs, isGetDir } = opts;
    const _urlInSourceCode = String(urlInSourceCode);
    let mayTryTypescript = false;
    let url = urlInSourceCode;
    const ext = path.extname(urlInSourceCode);
    if (!ext && !isGetDir) {
        url = _urlInSourceCode + ".js";
        mayTryTypescript = true;
    }
    if (ALIAS_PATH_CACHE[url]) {
        return ALIAS_PATH_CACHE[url];
    }
    const isInBusiness = /\/business_(.*)\//.test(documentUriPath);
    const rootPath = configRoot(configs);
    const mountedDirForDoc = getMountedDirForDoc(documentUriPath, configs.mapping_statics, rootPath);
    function resolve(u) {
        // @/ 路径
        if (/^@\/(.*)/.test(u)) {
            if (mountedDirForDoc) {
                return u.replace(/^@/, mountedDirForDoc);
            }
            if (isInBusiness) {
                const [SRC_ROOT_PATH, FILE_PATH] = documentUriPath.split("business_");
                const [APP_NAME] = FILE_PATH.split("/");
                return u.replace(/^@/, `${SRC_ROOT_PATH}business_${APP_NAME}`);
            }
        }
        // alias 正则匹配
        for (const [aliasRegExp, aliasPath] of Object.entries(configs.alias)) {
            if (new RegExp(aliasRegExp).test(u)) {
                const resolved = u.replace(new RegExp(aliasRegExp), aliasPath);
                return `${rootPath}${resolved}`;
            }
        }
        // mapping_statics 前缀匹配
        if (Array.isArray(configs.mapping_statics)) {
            const mounts = configs.mapping_statics
                .map(m => ({ ...m, prefix: normalizePrefix(m.prefix) }))
                .filter(m => m.prefix)
                .sort((a, b) => b.prefix.length - a.prefix.length);
            const match = mounts.find(m => m.prefix === "/"
                ? true
                : u === m.prefix || u.startsWith(m.prefix + "/"));
            if (match) {
                const dir = path.resolve(rootPath, match.dir);
                const relative = match.prefix === "/"
                    ? u.replace(/^\//, "")
                    : u.slice(match.prefix.length + 1);
                return path.resolve(dir, relative);
            }
        }
        return false;
    }
    let result = resolve(url);
    if (result) {
        ALIAS_PATH_CACHE[url] = path.normalize(result.replace(/\/+/g, "/"));
        return ALIAS_PATH_CACHE[url];
    }
    if (mayTryTypescript) {
        result = resolve(_urlInSourceCode + ".ts");
        if (result) {
            ALIAS_PATH_CACHE[url] = path.normalize(result.replace(/\/+/g, "/"));
            return ALIAS_PATH_CACHE[url];
        }
    }
    return null;
}
