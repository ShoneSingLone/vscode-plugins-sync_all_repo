/**
 * Vue SFC 解析器（从 boundless-vue-helper/src/utils.js 的 VueLoader 移植，JS→TS）
 * 简单正则解析，不依赖 AST 库，零 npm 依赖。
 */

interface TagInfo {
	code: string;
	attrs: Record<string, string>;
	startPos: number;
	endPos: number;
}

interface ScriptExports {
	name: string | null;
	components: Record<string, { pos: number }>;
	methods: Record<string, { pos: number }>;
	data: null;
	computed: Record<string, { pos: number }>;
	watch: Record<string, { pos: number }>;
	props: Record<string, { pos: number }>;
	directives: Record<string, { pos: number }>;
	namePos?: number;
}

export interface ParsedVue {
	script: {
		code: string;
		attrs: Record<string, string>;
		exports: ScriptExports;
		startPos: number;
		endPos: number;
	};
	template: {
		code: string;
		attrs: Record<string, string>;
		components: Record<string, Array<{ pos: number }>>;
		startPos: number;
		endPos: number;
	};
	style: TagInfo;
	setupRender: TagInfo;
	findElementPosition: (type: string, name: string) => { line: number; column: number } | null;
}

function getSource(source: string, pickType: string): [string, Record<string, string>, number, number] {
	try {
		const regex = new RegExp(`<${pickType}[^>(|)>]*>`);
		const openingTag = source.match(regex);
		if (!openingTag) {
			return ["", {}, 0, 0];
		}
		const tag = openingTag[0];
		const startPos = source.indexOf(tag) + tag.length;
		const endPos = source.lastIndexOf(`</${pickType}>`);
		let targetSource = source.slice(startPos, endPos);
		const attrs: Record<string, string> = {};
		const attrRegex = /(\w+)=["']([^"']+)["']/g;
		let m: RegExpExecArray | null;
		while ((m = attrRegex.exec(tag)) !== null) {
			attrs[m[1]] = m[2];
		}
		if (["template", "setup-render"].includes(pickType)) {
			targetSource = targetSource.replace(/`/g, "\\`");
		}
		return [targetSource, attrs, startPos, endPos];
	} catch {
		return ["", {}, 0, 0];
	}
}

function parseScript(scriptCode: string, scriptStartPos: number): ScriptExports {
	const exports: ScriptExports = {
		name: null,
		components: {},
		methods: {},
		data: null,
		computed: {},
		watch: {},
		props: {},
		directives: {}
	};
	const nameMatch = scriptCode.match(/name\s*:\s*['"`]([^'"]+)['"`]/);
	if (nameMatch) {
		exports.name = nameMatch[1];
		exports.namePos = (nameMatch.index ?? 0) + scriptStartPos + nameMatch[0].indexOf(nameMatch[1]);
	}
	const componentsMatch = scriptCode.match(/components\s*:\s*\{([^}]+)\}/);
	if (componentsMatch) {
		const compRegex = /([\w-]+)\s*:\s*([\w$_.]+)/g;
		let m: RegExpExecArray | null;
		while ((m = compRegex.exec(componentsMatch[1])) !== null) {
			exports.components[m[1]] = {
				pos: (componentsMatch.index ?? 0) + scriptStartPos + componentsMatch[0].indexOf(m[1])
			};
		}
	}
	const methodsMatch = scriptCode.match(/methods\s*:\s*\{([\s\S]*?)\}\s*[,}]/);
	if (methodsMatch) {
		const methodRegex = /([\w$]+)\s*:\s*(?:function|async\s+function|\(.*?\)\s*=>)|([\w$]+)\s*\(/g;
		let m: RegExpExecArray | null;
		while ((m = methodRegex.exec(methodsMatch[1])) !== null) {
			const name = m[1] || m[2];
			if (name) {
				exports.methods[name] = {
					pos: (methodsMatch.index ?? 0) + scriptStartPos + methodsMatch[0].indexOf(name)
				};
			}
		}
	}
	const propsMatch = scriptCode.match(/props\s*:\s*\{([\s\S]*?)\}\s*[,}]/);
	if (propsMatch) {
		const propRegex = /([\w$]+)\s*:/g;
		let m: RegExpExecArray | null;
		while ((m = propRegex.exec(propsMatch[1])) !== null) {
			exports.props[m[1]] = {
				pos: (propsMatch.index ?? 0) + scriptStartPos + propsMatch[0].indexOf(m[1])
			};
		}
	}
	const computedMatch = scriptCode.match(/computed\s*:\s*\{([\s\S]*?)\}\s*[,}]/);
	if (computedMatch) {
		const compRegex = /([\w$]+)\s*:\s*(?:function|async\s+function|\(.*?\)\s*=>)|([\w$]+)\s*\(/g;
		let m: RegExpExecArray | null;
		while ((m = compRegex.exec(computedMatch[1])) !== null) {
			const name = m[1] || m[2];
			if (name) {
				exports.computed[name] = {
					pos: (computedMatch.index ?? 0) + scriptStartPos + computedMatch[0].indexOf(name)
				};
			}
		}
	}
	return exports;
}

function getLineAndColumn(source: string, pos: number): { line: number; column: number } {
	const lines = source.slice(0, pos).split(/\r?\n/);
	return {
		line: lines.length - 1,
		column: lines[lines.length - 1].length
	};
}

/**
 * 解析 Vue SFC 文件，返回结构化数据（零依赖，纯正则）
 */
export function VueLoader(sourceCodeString: string): ParsedVue {
	const [scriptCode, scriptAttrs, scriptStartPos, scriptEndPos] = getSource(sourceCodeString, "script");
	const [templateCode, templateAttrs, templateStartPos, templateEndPos] = getSource(sourceCodeString, "template");
	const [styleCode, styleAttrs, styleStartPos, styleEndPos] = getSource(sourceCodeString, "style");
	const [setupRenderCode, setupRenderAttrs, setupRenderStartPos, setupRenderEndPos] = getSource(sourceCodeString, "setup-render");
	const scriptExports = parseScript(scriptCode, scriptStartPos);

	// template 中的组件引用
	const components: Record<string, Array<{ pos: number }>> = {};
	const compRegex = /<([A-Z][\w-]+)[^>]*>/g;
	let m: RegExpExecArray | null;
	while ((m = compRegex.exec(templateCode)) !== null) {
		const name = m[1];
		if (!components[name]) {
			components[name] = [];
		}
		components[name].push({ pos: templateStartPos + m.index + 1 });
	}

	const findElementPosition = (type: string, name: string): { line: number; column: number } | null => {
		if (type === "component") {
			if (scriptExports.components[name]) {
				return getLineAndColumn(sourceCodeString, scriptExports.components[name].pos);
			}
			if (scriptExports.name === name && scriptExports.namePos !== undefined) {
				return getLineAndColumn(sourceCodeString, scriptExports.namePos);
			}
		} else if ((scriptExports as any)[type] && (scriptExports as any)[type][name]) {
			return getLineAndColumn(sourceCodeString, (scriptExports as any)[type][name].pos);
		}
		return null;
	};

	return {
		script: {
			code: scriptCode,
			attrs: scriptAttrs,
			exports: scriptExports,
			startPos: scriptStartPos,
			endPos: scriptEndPos
		},
		template: {
			code: templateCode,
			attrs: templateAttrs,
			components,
			startPos: templateStartPos,
			endPos: templateEndPos
		},
		style: { code: styleCode, attrs: styleAttrs, startPos: styleStartPos, endPos: styleEndPos },
		setupRender: { code: setupRenderCode, attrs: setupRenderAttrs, startPos: setupRenderStartPos, endPos: setupRenderEndPos },
		findElementPosition
	};
}
