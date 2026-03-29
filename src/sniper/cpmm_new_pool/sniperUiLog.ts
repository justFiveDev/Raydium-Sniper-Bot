import logger from "../../logger";

export type SniperUiLog = (
  level: "info" | "warn" | "error",
  message: string
) => void;

export function emitSniperLog(
  uiLog: SniperUiLog | undefined,
  level: "info" | "warn" | "error",
  message: string
): void {
  logger[level](message);
  uiLog?.(level, message);
}
