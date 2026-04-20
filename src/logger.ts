import * as vscode from "vscode";

export type LogLevel = "error" | "warn" | "info" | "debug";

const levelRank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Sync All Repos");
  }
  return channel;
}

function getSettings() {
  const cfg = vscode.workspace.getConfiguration("shone.sing.lone.syncrepos");
  const logLevel = cfg.get<LogLevel>("logLevel", "info");
  const logToConsole = cfg.get<boolean>("logToConsole", false);
  return { logLevel, logToConsole };
}

function shouldLog(level: LogLevel): boolean {
  const { logLevel } = getSettings();
  return levelRank[level] <= levelRank[logLevel];
}

function nowTs(): string {
  return new Date().toISOString();
}

function asError(err: unknown): Error | undefined {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as any).message;
    return new Error(typeof msg === "string" ? msg : String(err));
  }
  return undefined;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatLine(level: LogLevel, message: string, meta?: unknown): string {
  const base = `${nowTs()} [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) return base;
  return `${base} ${safeJson(meta)}`;
}

function consoleWrite(level: LogLevel, line: string) {
  const { logToConsole } = getSettings();
  if (!logToConsole) return;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  show() {
    getChannel().show(true);
  },
  debug(message: string, meta?: unknown) {
    if (!shouldLog("debug")) return;
    const line = formatLine("debug", message, meta);
    getChannel().appendLine(line);
    consoleWrite("debug", line);
  },
  info(message: string, meta?: unknown) {
    if (!shouldLog("info")) return;
    const line = formatLine("info", message, meta);
    getChannel().appendLine(line);
    consoleWrite("info", line);
  },
  warn(message: string, meta?: unknown) {
    if (!shouldLog("warn")) return;
    const line = formatLine("warn", message, meta);
    getChannel().appendLine(line);
    consoleWrite("warn", line);
  },
  error(message: string, err?: unknown, meta?: unknown) {
    if (!shouldLog("error")) return;
    const e = asError(err);
    const line = formatLine("error", message, meta);
    getChannel().appendLine(line);
    if (e?.stack) getChannel().appendLine(e.stack);
    consoleWrite("error", line);
    if (e?.stack) consoleWrite("error", e.stack);
  },
  async withTiming<T>(
    name: string,
    fn: () => Promise<T>,
    meta?: unknown,
  ): Promise<T> {
    const start = Date.now();
    try {
      const res = await fn();
      logger.debug(`${name} done`, { durationMs: Date.now() - start, meta });
      return res;
    } catch (err) {
      logger.error(`${name} failed`, err, { durationMs: Date.now() - start, meta });
      throw err;
    }
  },
};
