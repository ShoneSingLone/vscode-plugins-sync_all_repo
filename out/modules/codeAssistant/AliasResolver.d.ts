export interface AliasConfig {
    /** x-space 项目根目录（configs.boundless.vue.project.js 所在 folder），alias 相对此目录解析 */
    rootPath?: string;
    /** alias map：key 是正则字符串，value 是替换路径（如 "^/common/": "/statics/common/"） */
    alias: Record<string, string>;
    /** 外部静态目录映射：[{ prefix: "/business_cib", dir: "..." }] */
    mapping_statics: Array<{
        prefix: string;
        dir: string;
    }>;
    /** 组件名 → 候选路径列表（用于组件标签跳转） */
    components?: Record<string, string[]>;
    /** 预生成的函数索引（scanLodashDefine：vars/files） */
    scanLodashDefine?: {
        vars: Record<string, [string, number, number]>;
        files: Record<string, string>;
    };
    [key: string]: any;
}
/**
 * 源码中的 URL 路径 → 文件系统绝对路径（未找到返回 null）
 */
export declare function normalizedAbsolutePathForFS(opts: {
    documentUriPath: string;
    urlInSourceCode: string;
    configs: AliasConfig;
    isGetDir?: boolean;
}): string | null;
