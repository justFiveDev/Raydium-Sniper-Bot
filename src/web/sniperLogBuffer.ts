export type SniperLogLine = {
  ts: number;
  level: "info" | "warn" | "error";
  message: string;
};

const MAX_LINES = 500;
const buffers = new Map<string, SniperLogLine[]>();

export function clearSniperLogs(sessionId: string): void {
  buffers.set(sessionId, []);
}

export function deleteSniperLogs(sessionId: string): void {
  buffers.delete(sessionId);
}

export function appendSniperLog(
  sessionId: string,
  level: SniperLogLine["level"],
  message: string
): void {
  let lines = buffers.get(sessionId);
  if (!lines) {
    lines = [];
    buffers.set(sessionId, lines);
  }
  lines.push({ ts: Date.now(), level, message });
  if (lines.length > MAX_LINES) {
    lines.splice(0, lines.length - MAX_LINES);
  }
}

export function getSniperLogs(sessionId: string): SniperLogLine[] {
  return buffers.get(sessionId) ?? [];
}
