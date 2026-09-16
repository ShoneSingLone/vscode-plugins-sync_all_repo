/** Webview ↔ 扩展 消息协议 */
/** 扩展 → Webview */
export interface HostToPanel {
    type: "init" | "update";
    payload: any;
}
/** Webview → 扩展 */
export interface PanelToHost {
    type: string;
    payload?: any;
}
