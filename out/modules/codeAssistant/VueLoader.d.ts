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
    components: Record<string, {
        pos: number;
    }>;
    methods: Record<string, {
        pos: number;
    }>;
    data: null;
    computed: Record<string, {
        pos: number;
    }>;
    watch: Record<string, {
        pos: number;
    }>;
    props: Record<string, {
        pos: number;
    }>;
    directives: Record<string, {
        pos: number;
    }>;
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
        components: Record<string, Array<{
            pos: number;
        }>>;
        startPos: number;
        endPos: number;
    };
    style: TagInfo;
    setupRender: TagInfo;
    findElementPosition: (type: string, name: string) => {
        line: number;
        column: number;
    } | null;
}
/**
 * 解析 Vue SFC 文件，返回结构化数据（零依赖，纯正则）
 */
export declare function VueLoader(sourceCodeString: string): ParsedVue;
export {};
