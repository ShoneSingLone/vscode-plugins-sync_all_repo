/**
 * 别名路径解析器（从 boundless-vue-helper/src/utils.js 移植，JS→TS）
 * - alias 正则匹配
 * - @/  business_ 分割逻辑
 * - mapping_statics 前缀映射
 * - .js → .ts 回退
 */
import * as vscode from "vscode";
import * as path from "path";

export interface AliasConfig {
	/** x-space 项目根目录（configs.boundless.vue.project.js 所在 folder），alias 相对此目录解析 */
	rootPath?: string;
	/** alias map：key 是正则字符串，value 是替换路径（如 "^/common/": "/statics/common/"） */
	alias: Record<string, string>;
	/** 外部静态目录映射：[{ prefix: "/business_cib", dir: "..." }] */
	mapping_statics: Array<{ prefix: string; dir: string }>;
	/** 组件名 → 候选路径列表（用于组件标签跳转） */
	components?: Record<string, string[]>;
	/** 预生成的函数索引（scanLodashDefine：vars/files） */
	scanLodashDefine?: {
		vars: Record<string, [string, number, number]>;
		files: Record<string, string>;
	};
	[key: string]: any;
}

/** 配置内根目录兜底（多根工作区下 rootPath 不可靠，统一走 configs.rootPath） */
function configRoot(configs: AliasConfig): string {
	return configs.rootPath || vscode.workspace.rootPath || "";
}

const ALIAS_PATH_CACHE: Record<string, string> = {};

function normalizePrefix(prefix: string): string {
	const raw = String(prefix ?? "").trim();
	if (raw.charAt(0) !== "/") {
		return "";
	}
	const trimmed = raw.replace(/\/+$/, "");
	return trimmed === "" ? "/" : trimmed;
}

function getMountedDirForDoc(
	documentUriPath: string,
	mounts: AliasConfig["mapping_statics"],
	rootPath: string
): string | null {
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
export function normalizedAbsolutePathForFS(opts: {
	documentUriPath: string;
	urlInSourceCode: string;
	configs: AliasConfig;
	isGetDir?: boolean;
}): string | null {
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

	function resolve(u: string): string | false {
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
			const match = mounts.find(m =>
				m.prefix === "/"
					? true
					: u === m.prefix || u.startsWith(m.prefix + "/")
			);
			if (match) {
				const dir = path.resolve(rootPath, match.dir);
				const relative =
					match.prefix === "/"
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
