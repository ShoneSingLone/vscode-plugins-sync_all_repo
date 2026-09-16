import { AliasConfig } from "./modules/codeAssistant/AliasResolver";
export interface ActivationResult {
    /** 是否为 x-space 项目（决定了模块 B 是否启用） */
    isXspaceProject: boolean;
    /** 所有命中的 workspace root 路径 */
    xspaceRoots: string[];
    /** 别名配置（从 configs.boundless.vue.project.js 加载） */
    configs: AliasConfig;
}
export declare function detectXspaceProject(): ActivationResult;
