/**
 * common.ts 自动扫描器（从 boundless-vue-helper/src/utils.autoScan.js 移植，JS→TS）
 * - 扫描 common.ts 提取 _.$xxx 函数定义
 * - 文件变化时热更新索引
 */
import * as vscode from "vscode";
import { AliasConfig } from "./AliasResolver";
export interface ScanResult {
    vars: Record<string, [string, number, number]>;
    files: Record<string, string>;
}
export declare function getScanResult(): ScanResult;
/**
 * 在各可能位置查找 common.ts
 */
export declare function findCommonTsFile(workspaceRoot: string, configs: AliasConfig): string | null;
/**
 * 扫描 common.ts 并提取 _.$xxx 函数定义（更新全局索引）
 */
export declare function scanCommonTsFile(commonTsPath: string, workspaceRoot: string): ScanResult;
/**
 * 设置文件监听器（热更新 common.ts 索引）
 */
export declare function setupCommonTsWatcher(commonTsPath: string, workspaceRoot: string, configs: AliasConfig, ctx: vscode.ExtensionContext): void;
