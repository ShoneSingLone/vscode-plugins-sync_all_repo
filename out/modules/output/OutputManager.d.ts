/** 统一输出日志面板 */
export declare class OutputManager {
    private static _instance;
    private readonly channel;
    private constructor();
    static getInstance(): OutputManager;
    appendLine(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    show(preserveFocus?: boolean): void;
    dispose(): void;
}
